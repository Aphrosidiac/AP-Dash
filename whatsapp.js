const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

class WhatsAppManager {
    constructor(sessionsDir, mainWindow) {
        this.sessionsDir = sessionsDir;
        this.mainWindow = mainWindow;
        this.client = null;
        this.accountId = null;
        this.accountName = null;
        this.warmingActive = false;
        this.warmingConfig = null;
        this.recentMessages = [];
        this.maxMessages = 100;
        this.genAI = null;
        this.activeConversations = new Map(); // phoneNumber -> { history: [], lastMessageTime: timestamp }
        this.conversationCheckIntervals = new Map(); // phoneNumber -> intervalId
        this.processedMessageIds = new Set(); // Track processed messages to prevent duplicates
        this.messagesByPhone = new Map(); // phoneNumber -> [messages]
        this.queuedMessages = new Map(); // phoneNumber -> { message: string, timestamp: number } - stores last message when disabled
        this.disabledNumbers = new Set(); // Track disabled numbers
        this.stickerConfig = null; // Sticker configuration
        this.stickersDir = null; // Path to stickers directory
        this.stickerCache = new Map(); // Cache loaded stickers
        this.mediaConfig = null; // Media configuration
        this.mediaDir = null; // Path to media directory
        this.mediaItems = []; // Cached media items
    }

    initializeAI(apiKey) {
        try {
            this.genAI = new GoogleGenerativeAI(apiKey);
            console.log('Gemini AI initialized successfully');
            return true;
        } catch (error) {
            console.error('Error initializing Gemini AI:', error);
            return false;
        }
    }

    async generateAIResponse(conversationHistory, isGreeting = false) {
        if (!this.genAI) {
            throw new Error('AI not initialized. Please provide a valid API key.');
        }

        try {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

            const personality = this.warmingConfig.aiPersonality;

            let prompt;
            if (isGreeting) {
                // Add randomization to ensure varied greetings
                const greetingStyles = [
                    'a friendly check-in',
                    'asking how their day is going',
                    'mentioning you wanted to connect',
                    'a warm conversation starter',
                    'asking about their week',
                    'a polite reach-out',
                    'showing genuine interest in catching up',
                    'a professional but warm hello',
                    'reaching out after some time',
                    'a simple friendly opener'
                ];
                const randomStyle = greetingStyles[Math.floor(Math.random() * greetingStyles.length)];
                const randomSeed = Math.floor(Math.random() * 10000);

                prompt = `${personality}

Generate a unique opening message to start a WhatsApp conversation. This should feel like ${randomStyle}.

CRITICAL REQUIREMENTS:
- Must be DIFFERENT from generic greetings like "Hey, how are you?" or "Hi there!"
- Sound friendly and approachable, but not overly casual or unprofessional
- Keep it short (1-2 sentences max)
- Be warm and natural - like texting a colleague or acquaintance you're friendly with
- No slang, abbreviations like "u" or "lol", or overly informal language
- Variation seed: ${randomSeed}

Examples of good variety (DO NOT copy these, create something new):
- "Hope your week's going well!"
- "Been meaning to reach out, how are things?"
- "How's everything on your end?"
- "Just wanted to check in and say hi"
- "It's been a while! How have you been?"
- "Hope I'm not catching you at a busy time"
- "Wanted to say hello, how's life treating you?"
- "Quick hello - hope all is well!"

IMPORTANT: Do NOT start with "Hey!" - vary your opening. Start differently each time.

Just respond with the message, nothing else.`;
            } else {
                // Build conversation context
                const context = conversationHistory
                    .map(msg => `${msg.role === 'user' ? 'Them' : 'You'}: ${msg.text}`)
                    .join('\n');

                prompt = `${personality}

Here's the conversation so far:

${context}

Generate a natural response to their last message. Keep it short (1-2 sentences) and conversational. Just respond with your message, nothing else.`;
            }

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim();

            // Remove quotes if AI wrapped the response
            return text.replace(/^["']|["']$/g, '');
        } catch (error) {
            console.error('Error generating AI response:', error);
            // Fallback responses
            if (isGreeting) {
                const greetings = [
                    'Hope you\'re doing well!',
                    'How\'s your week going?',
                    'Been meaning to reach out!',
                    'Hope all is well on your end',
                    'How have you been?',
                    'Hope you\'re having a good day!',
                    'Just wanted to check in',
                    'It\'s been a while! How are things?',
                    'Quick hello - hope everything\'s good!',
                    'Wanted to say hi, how\'s life?'
                ];
                return greetings[Math.floor(Math.random() * greetings.length)];
            } else {
                const fallbacks = ['That\'s interesting!', 'Tell me more!', 'I see!', 'That\'s cool!'];
                return fallbacks[Math.floor(Math.random() * fallbacks.length)];
            }
        }
    }

    /**
     * Initialize sticker management
     */
    initializeStickerManager(config) {
        this.stickerConfig = config.stickerSettings || {
            enabled: false,
            frequency: 0.12,
            fallbackToText: true
        };

        this.stickersDir = path.join(__dirname, 'data', 'stickers');

        // Ensure stickers directory exists
        if (!fs.existsSync(this.stickersDir)) {
            fs.mkdirSync(this.stickersDir, { recursive: true });
            // Create category folders
            const categories = ['funny', 'love', 'sad', 'excited',
                               'thumbs_up', 'thinking', 'wow', 'casual'];
            categories.forEach(cat => {
                fs.mkdirSync(path.join(this.stickersDir, cat), { recursive: true });
            });
        }

        console.log('Sticker manager initialized:', this.stickerConfig);
    }

    /**
     * Get available stickers for a category
     */
    getStickersForCategory(category) {
        const categoryPath = path.join(this.stickersDir, category);

        if (!fs.existsSync(categoryPath)) {
            return [];
        }

        try {
            const files = fs.readdirSync(categoryPath);
            return files.filter(f => f.endsWith('.webp'));
        } catch (error) {
            console.error(`Error reading stickers from ${category}:`, error);
            return [];
        }
    }

    /**
     * Select random sticker from category
     */
    selectRandomSticker(category) {
        const stickers = this.getStickersForCategory(category);

        if (stickers.length === 0) {
            return null;
        }

        const randomSticker = stickers[Math.floor(Math.random() * stickers.length)];
        return path.join(this.stickersDir, category, randomSticker);
    }

    /**
     * Detect emotion/category from conversation using AI
     */
    async detectConversationEmotion(conversationHistory) {
        if (!this.genAI) {
            return 'casual'; // Fallback
        }

        try {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

            // Build conversation context (last 5 messages for efficiency)
            const recentHistory = conversationHistory.slice(-5);
            const context = recentHistory
                .map(msg => `${msg.role === 'user' ? 'Them' : 'You'}: ${msg.text}`)
                .join('\n');

            const prompt = `Analyze the emotional tone of this WhatsApp conversation and respond with ONLY ONE of these categories: funny, love, sad, excited, thumbs_up, thinking, wow, casual

Conversation:
${context}

Respond with just the single category word, nothing else.`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const emotion = response.text().trim().toLowerCase();

            // Validate response
            const validCategories = ['funny', 'love', 'sad', 'excited',
                                    'thumbs_up', 'thinking', 'wow', 'casual'];

            if (validCategories.includes(emotion)) {
                console.log(`Detected emotion: ${emotion}`);
                return emotion;
            }

            return 'casual'; // Default fallback

        } catch (error) {
            console.error('Error detecting emotion:', error);
            return 'casual';
        }
    }

    /**
     * Send sticker to phone number
     */
    async sendSticker(phoneNumber, stickerPath) {
        if (!this.client || !this.client.info) {
            console.error('Client not ready');
            return false;
        }

        try {
            const chatId = `${phoneNumber}@c.us`;
            const chat = await this.client.getChatById(chatId);

            // Note: Typing indicator already shown in sendAIReply before this function is called

            // Load sticker using MessageMedia
            const media = MessageMedia.fromFilePath(stickerPath);

            // Send as sticker
            await this.client.sendMessage(chatId, media, {
                sendMediaAsSticker: true
            });

            console.log(`Sent sticker to ${phoneNumber}: ${path.basename(stickerPath)}`);

            // Log to UI
            this.mainWindow.webContents.send('warming-log', {
                message: `Sent sticker to ${phoneNumber}: ${path.basename(stickerPath)}`
            });

            return true;

        } catch (error) {
            console.error('Error sending sticker:', error);
            return false;
        }
    }

    /**
     * Initialize media management
     */
    initializeMediaManager(config) {
        this.mediaConfig = config.mediaSettings || {
            enabled: false,
            frequency: 0.10,
            maxFileSize: 5242880,
            allowedFormats: ['image/jpeg', 'image/png', 'image/jpg'],
            requireContext: true
        };

        this.mediaDir = path.join(__dirname, 'data', 'media');
        const filesDir = path.join(this.mediaDir, 'files');
        const indexFile = path.join(this.mediaDir, 'media-items.json');

        // Ensure directories exist
        if (!fs.existsSync(this.mediaDir)) {
            fs.mkdirSync(this.mediaDir, { recursive: true });
        }
        if (!fs.existsSync(filesDir)) {
            fs.mkdirSync(filesDir, { recursive: true });
        }

        // Initialize index file
        if (!fs.existsSync(indexFile)) {
            fs.writeFileSync(indexFile, JSON.stringify([], null, 2));
        }

        // Load media items into cache
        this.loadMediaItems();

        console.log('Media manager initialized:', this.mediaConfig);
    }

    /**
     * Load media items from index file
     */
    loadMediaItems() {
        try {
            const indexFile = path.join(this.mediaDir, 'media-items.json');
            const data = fs.readFileSync(indexFile, 'utf-8');
            this.mediaItems = JSON.parse(data);
            console.log(`Loaded ${this.mediaItems.length} media items`);
        } catch (error) {
            console.error('Error loading media items:', error);
            this.mediaItems = [];
        }
    }

    /**
     * Select random media item
     */
    selectRandomMediaItem() {
        if (this.mediaItems.length === 0) {
            return null;
        }
        const randomIndex = Math.floor(Math.random() * this.mediaItems.length);
        return this.mediaItems[randomIndex];
    }

    /**
     * Generate AI message about media using context
     */
    async generateMediaMessage(conversationHistory, mediaContext) {
        if (!this.genAI) {
            // Fallback messages
            const fallbacks = [
                `Check this out! ${mediaContext}`,
                `Look at this - ${mediaContext}`,
                `Thought you'd like this. ${mediaContext}`
            ];
            return fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }

        try {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

            const personality = this.warmingConfig.aiPersonality;

            // Build conversation context if available
            let conversationContext = '';
            if (conversationHistory && conversationHistory.length > 0) {
                const recentHistory = conversationHistory.slice(-5);
                conversationContext = recentHistory
                    .map(msg => `${msg.role === 'user' ? 'Them' : 'You'}: ${msg.text}`)
                    .join('\n');
            }

            const prompt = `${personality}

${conversationContext ? `Recent conversation:\n${conversationContext}\n\n` : ''}You want to share an image with them. The image shows: ${mediaContext}

Generate a natural, casual message (1-2 sentences) to accompany this image. Make it conversational and relevant to your ongoing chat${conversationContext ? '' : ', as if you\'re sharing something interesting with a friend'}. Just respond with the message text, nothing else.`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim();

            // Remove quotes if AI wrapped the response
            return text.replace(/^["']|["']$/g, '');

        } catch (error) {
            console.error('Error generating media message:', error);
            // Fallback
            return `Check this out! ${mediaContext}`;
        }
    }

    /**
     * Send media with AI-generated message about it
     */
    async sendMediaWithMessage(phoneNumber, mediaItem) {
        if (!this.client || !this.client.info) {
            console.error('Client not ready');
            return false;
        }

        try {
            const chatId = `${phoneNumber}@c.us`;
            const chat = await this.client.getChatById(chatId);

            // Note: Typing indicator already shown in sendAIReply before this function is called

            // Generate AI message about the image using context
            const conversation = this.activeConversations.get(phoneNumber);
            const aiMessage = await this.generateMediaMessage(conversation?.history || [], mediaItem.context);

            // Load media using MessageMedia
            const media = MessageMedia.fromFilePath(mediaItem.filePath);

            // Send media with caption (AI message)
            await this.client.sendMessage(chatId, media, {
                caption: aiMessage
            });

            console.log(`Sent media to ${phoneNumber}: ${mediaItem.fileName} with message: "${aiMessage}"`);

            // Log to UI
            this.mainWindow.webContents.send('warming-log', {
                message: `Sent image to ${phoneNumber}: "${mediaItem.context.substring(0, 50)}..."`
            });

            return true;

        } catch (error) {
            console.error('Error sending media:', error);
            return false;
        }
    }

    /**
     * Blast message to all phone numbers with 3-second interval
     * @param {string} message - Text message to send
     * @param {object} imageData - Optional image data {fileName, mimeType, base64Data}
     * @param {function} progressCallback - Callback function for progress updates
     */
    async blastMessage(message, imageData = null, progressCallback = null) {
        if (!this.client || !this.client.info) {
            throw new Error('WhatsApp client not ready');
        }

        if (!message || message.trim().length === 0) {
            throw new Error('Message text is required');
        }

        const phoneNumbers = await this.getPhoneNumbers();
        const enabledNumbers = phoneNumbers.filter(p => p.enabled !== false);

        if (enabledNumbers.length === 0) {
            throw new Error('No enabled phone numbers found');
        }

        const results = {
            total: enabledNumbers.length,
            sent: 0,
            failed: 0,
            errors: []
        };

        console.log(`Starting blast to ${enabledNumbers.length} recipients...`);

        for (let i = 0; i < enabledNumbers.length; i++) {
            const phone = enabledNumbers[i];
            const phoneNumber = phone.number;

            try {
                const chatId = `${phoneNumber}@c.us`;
                const chat = await this.client.getChatById(chatId);

                // Show typing indicator with random duration (2-4 seconds for blast)
                await chat.sendStateTyping();
                const typingDuration = 2000 + Math.random() * 2000; // 2-4 seconds
                await new Promise(resolve => setTimeout(resolve, typingDuration));

                if (imageData && imageData.base64Data) {
                    // Send image with message as caption
                    const media = new MessageMedia(
                        imageData.mimeType,
                        imageData.base64Data,
                        imageData.fileName
                    );

                    await this.client.sendMessage(chatId, media, {
                        caption: message
                    });
                } else {
                    // Send text only
                    await this.client.sendMessage(chatId, message);
                }

                results.sent++;
                console.log(`Blast sent to ${phoneNumber} (${results.sent}/${results.total})`);

                // Call progress callback
                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: results.total,
                        sent: results.sent,
                        failed: results.failed,
                        phoneNumber: phoneNumber
                    });
                }

                // Wait 3 seconds before sending to next number (except for the last one)
                if (i < enabledNumbers.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }

            } catch (error) {
                results.failed++;
                results.errors.push({
                    phoneNumber: phoneNumber,
                    error: error.message
                });
                console.error(`Failed to send blast to ${phoneNumber}:`, error);

                // Call progress callback even on error
                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: results.total,
                        sent: results.sent,
                        failed: results.failed,
                        phoneNumber: phoneNumber,
                        error: error.message
                    });
                }

                // Continue to next number even if this one failed
                if (i < enabledNumbers.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
        }

        console.log(`Blast completed: ${results.sent} sent, ${results.failed} failed`);
        return results;
    }

    async addAccount(accountId, accountName) {
        // Only allow one account
        if (this.client) {
            throw new Error('Only one warming account is allowed. Please remove the existing account first.');
        }

        try {
            const client = new Client({
                authStrategy: new LocalAuth({
                    clientId: accountId,
                    dataPath: this.sessionsDir
                }),
                puppeteer: {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu'
                    ]
                }
            });

            // QR Code event
            client.on('qr', async (qr) => {
                console.log(`QR Code received for ${accountName}`);
                try {
                    console.log('Converting QR to data URL...');
                    const qrDataUrl = await qrcode.toDataURL(qr);
                    console.log('QR data URL generated, length:', qrDataUrl.length);
                    console.log('Sending QR code to renderer...');
                    if (this.mainWindow && this.mainWindow.webContents) {
                        this.mainWindow.webContents.send('qr-code', {
                            accountId,
                            qrCode: qrDataUrl
                        });
                        console.log('QR code sent to renderer successfully');
                    } else {
                        console.error('mainWindow or webContents not available');
                    }
                } catch (error) {
                    console.error('Error generating QR code:', error);
                }
            });

            // Ready event
            client.on('ready', async () => {
                console.log(`Client ${accountName} is ready!`);

                const clientInfo = client.info;
                this.mainWindow.webContents.send('account-ready', {
                    accountId,
                    phoneNumber: clientInfo.wid.user,
                    pushname: clientInfo.pushname
                });

                this.mainWindow.webContents.send('account-status-changed', {
                    accountId,
                    status: 'ready'
                });
            });

            // Authentication event
            client.on('authenticated', () => {
                console.log(`Client ${accountName} authenticated`);
                this.mainWindow.webContents.send('account-status-changed', {
                    accountId,
                    status: 'authenticated'
                });
            });

            // Authentication failure
            client.on('auth_failure', (msg) => {
                console.error(`Authentication failure for ${accountName}:`, msg);
                this.mainWindow.webContents.send('account-status-changed', {
                    accountId,
                    status: 'auth_failure',
                    error: msg
                });
            });

            // Disconnected event
            client.on('disconnected', (reason) => {
                console.log(`Client ${accountName} disconnected:`, reason);

                // Stop warming if active
                if (this.warmingActive) {
                    this.warmingActive = false;
                    this.mainWindow.webContents.send('warming-stopped', {
                        reason: 'disconnected',
                        message: `WhatsApp disconnected: ${reason}`
                    });
                }

                this.mainWindow.webContents.send('account-status-changed', {
                    accountId,
                    status: 'disconnected',
                    reason
                });
            });

            // Message received event - Listen for replies from phone numbers
            client.on('message', async (message) => {
                try {
                    // Create unique message ID to prevent duplicates
                    const messageId = `${message.from}_${message.timestamp}_${message.body.substring(0, 20)}`;

                    // Skip if already processed
                    if (this.processedMessageIds.has(messageId)) {
                        return;
                    }
                    this.processedMessageIds.add(messageId);

                    // Clean up old message IDs (keep last 1000)
                    if (this.processedMessageIds.size > 1000) {
                        const idsArray = Array.from(this.processedMessageIds);
                        this.processedMessageIds = new Set(idsArray.slice(-500));
                    }

                    // Extract phone number
                    const phoneNumber = message.fromMe
                        ? message.to.replace('@c.us', '')
                        : message.from.replace('@c.us', '');

                    // Handle media if present
                    const hasMedia = message.hasMedia;
                    const messageType = message.type;
                    let mediaContext = null;

                    if (hasMedia && !message.fromMe) {
                        console.log(`Message has media: ${messageType}`);
                        mediaContext = await this.handleMediaMessage(message);
                    }

                // Add message to phone-specific storage
                this.addMessageToPhone(phoneNumber, {
                    id: messageId,
                    accountId: this.accountId,
                    accountName: this.accountName,
                    phoneNumber,
                    from: message.from,
                    to: message.to,
                    body: message.body,
                    timestamp: message.timestamp,
                    isOwn: message.fromMe,
                    hasMedia: hasMedia,
                    mediaType: messageType,
                    mediaContext: mediaContext
                });

                // Handle warming logic if active
                if (this.warmingActive && !message.fromMe) {
                    const fromNumber = message.from.replace('@c.us', '');

                    // Check if this is from one of our target phone numbers
                    if (this.warmingConfig && this.warmingConfig.phoneNumbers.includes(fromNumber)) {
                        // Format message text with media context
                        let messageText = message.body || '';

                        if (mediaContext) {
                            if (mediaContext.type === 'voice') {
                                messageText = `[Voice message: "${mediaContext.transcription}"]`;
                            } else if (mediaContext.type === 'image') {
                                const caption = message.body ? ` Caption: "${message.body}"` : '';
                                messageText = `[Sent an image: ${mediaContext.description}${caption}]`;
                            }
                        }

                        console.log(`Received reply from ${fromNumber}: ${messageText}`);

                        // Add to conversation history
                        if (!this.activeConversations.has(fromNumber)) {
                            this.activeConversations.set(fromNumber, { history: [], lastMessageTime: Date.now() });
                        }

                        const conversation = this.activeConversations.get(fromNumber);
                        conversation.history.push({
                            role: 'user',
                            text: messageText,
                            timestamp: Date.now(),
                            hasMedia: hasMedia,
                            mediaType: messageType,
                            mediaContext: mediaContext
                        });
                        conversation.lastMessageTime = Date.now();

                        // Log the received message
                        this.mainWindow.webContents.send('warming-message-received', {
                            from: fromNumber,
                            message: message.body,
                            timestamp: Date.now()
                        });

                        // Check if this number is disabled
                        const isDisabled = this.disabledNumbers.has(fromNumber);

                        if (isDisabled) {
                            // Queue the message for later processing
                            console.log(`Number ${fromNumber} is disabled, queuing message`);
                            this.queuedMessages.set(fromNumber, {
                                message: message.body,
                                timestamp: Date.now()
                            });
                            this.mainWindow.webContents.send('warming-log', {
                                message: `Message from ${fromNumber} queued (number disabled)`
                            });
                        } else {
                            // 15% chance to react with emoji in addition to text
                            const shouldReact = Math.random() < 0.15;

                            if (shouldReact) {
                                // React immediately
                                console.log(`Reacting to message from ${fromNumber} (15% chance)`);
                                await this.sendEmojiReaction(message, fromNumber);
                            }

                            // Always send text reply after delay
                            const delayMin = (this.warmingConfig?.delayMin || 3) * 1000;
                            const delayMax = (this.warmingConfig?.delayMax || 8) * 1000;
                            const delay = delayMin + Math.random() * (delayMax - delayMin);

                            console.log(`Waiting ${Math.round(delay / 1000)}s before responding...`);
                            setTimeout(async () => {
                                try {
                                    await this.sendAIReply(fromNumber);
                                } catch (error) {
                                    console.error(`Error sending AI reply to ${fromNumber}:`, error);
                                    this.mainWindow.webContents.send('warming-error', {
                                        error: `Failed to send reply to ${fromNumber}: ${error.message}`
                                    });
                                }
                            }, delay);
                        }
                    }
                }

                    // Send to renderer for UI update
                    this.mainWindow.webContents.send('new-message', {
                        phoneNumber,
                        message: {
                            id: messageId,
                            from: message.from,
                            to: message.to,
                            body: message.body,
                            timestamp: message.timestamp,
                            fromMe: message.fromMe,
                            hasMedia: hasMedia,
                            mediaType: messageType,
                            mediaContext: mediaContext
                        }
                    });
                } catch (error) {
                    console.error('Error handling incoming message:', error);
                    // Don't crash the app, just log the error
                    this.mainWindow.webContents.send('warming-error', {
                        error: `Message handling error: ${error.message}`
                    });
                }
            });

            // Initialize client
            await client.initialize();

            this.client = client;
            this.accountId = accountId;
            this.accountName = accountName;

            return true;
        } catch (error) {
            console.error(`Error adding account ${accountName}:`, error);
            throw error;
        }
    }

    async removeAccount() {
        if (this.client) {
            try {
                await this.client.destroy();
                this.client = null;
                this.accountId = null;
                this.accountName = null;
            } catch (error) {
                console.error('Error removing account:', error);
            }
        }
    }

    async restoreSession(accountId, accountName) {
        // Skip if client already exists
        if (this.client) {
            console.log('Session already active, skipping restore');
            return true;
        }

        console.log(`Restoring session for ${accountName} (${accountId})...`);

        try {
            const client = new Client({
                authStrategy: new LocalAuth({
                    clientId: accountId,
                    dataPath: this.sessionsDir
                }),
                puppeteer: {
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu'
                    ]
                }
            });

            // QR Code event - only fires if session is invalid/expired
            client.on('qr', async (qr) => {
                console.log(`Session expired for ${accountName}, QR Code required`);
                try {
                    const qrDataUrl = await qrcode.toDataURL(qr);
                    if (this.mainWindow && this.mainWindow.webContents) {
                        this.mainWindow.webContents.send('qr-code', {
                            accountId,
                            qrCode: qrDataUrl
                        });
                    }
                } catch (error) {
                    console.error('Error generating QR code:', error);
                }
            });

            // Ready event
            client.on('ready', async () => {
                console.log(`Session restored for ${accountName}!`);

                const clientInfo = client.info;
                this.mainWindow.webContents.send('account-ready', {
                    accountId,
                    phoneNumber: clientInfo.wid.user,
                    pushname: clientInfo.pushname
                });

                this.mainWindow.webContents.send('account-status-changed', {
                    accountId,
                    status: 'ready'
                });
            });

            // Authentication event
            client.on('authenticated', () => {
                console.log(`Session ${accountName} authenticated`);
                this.mainWindow.webContents.send('account-status-changed', {
                    accountId,
                    status: 'authenticated'
                });
            });

            // Authentication failure
            client.on('auth_failure', (msg) => {
                console.error(`Authentication failure for ${accountName}:`, msg);
                this.mainWindow.webContents.send('account-status-changed', {
                    accountId,
                    status: 'auth_failure',
                    error: msg
                });
            });

            // Disconnected event
            client.on('disconnected', (reason) => {
                console.log(`Session ${accountName} disconnected:`, reason);

                // Stop warming if active
                if (this.warmingActive) {
                    this.warmingActive = false;
                    this.mainWindow.webContents.send('warming-stopped', {
                        reason: 'disconnected',
                        message: `WhatsApp disconnected: ${reason}`
                    });
                }

                this.mainWindow.webContents.send('account-status-changed', {
                    accountId,
                    status: 'disconnected',
                    reason
                });
            });

            // Message received event - same as addAccount
            client.on('message', async (message) => {
                try {
                    const messageId = `${message.from}_${message.timestamp}_${message.body.substring(0, 20)}`;

                    if (this.processedMessageIds.has(messageId)) {
                        return;
                    }
                    this.processedMessageIds.add(messageId);

                    if (this.processedMessageIds.size > 1000) {
                        const idsArray = Array.from(this.processedMessageIds);
                        this.processedMessageIds = new Set(idsArray.slice(-500));
                    }

                    const phoneNumber = message.fromMe
                        ? message.to.replace('@c.us', '')
                        : message.from.replace('@c.us', '');

                    const hasMedia = message.hasMedia;
                    const messageType = message.type;
                    let mediaContext = null;

                    if (hasMedia && !message.fromMe) {
                        console.log(`Message has media: ${messageType}`);
                        mediaContext = await this.handleMediaMessage(message);
                    }

                this.addMessageToPhone(phoneNumber, {
                    id: messageId,
                    accountId: this.accountId,
                    accountName: this.accountName,
                    phoneNumber,
                    from: message.from,
                    to: message.to,
                    body: message.body,
                    timestamp: message.timestamp,
                    isOwn: message.fromMe,
                    hasMedia: hasMedia,
                    mediaType: messageType,
                    mediaContext: mediaContext
                });

                if (this.warmingActive && !message.fromMe) {
                    const fromNumber = message.from.replace('@c.us', '');

                    if (this.warmingConfig && this.warmingConfig.phoneNumbers.includes(fromNumber)) {
                        // Format message text with media context
                        let messageText = message.body || '';

                        if (mediaContext) {
                            if (mediaContext.type === 'voice') {
                                messageText = `[Voice message: "${mediaContext.transcription}"]`;
                            } else if (mediaContext.type === 'image') {
                                const caption = message.body ? ` Caption: "${message.body}"` : '';
                                messageText = `[Sent an image: ${mediaContext.description}${caption}]`;
                            }
                        }

                        console.log(`Received reply from ${fromNumber}: ${messageText}`);

                        // Add to conversation history
                        if (!this.activeConversations.has(fromNumber)) {
                            this.activeConversations.set(fromNumber, { history: [], lastMessageTime: Date.now() });
                        }

                        const conversation = this.activeConversations.get(fromNumber);
                        conversation.history.push({
                            role: 'user',
                            text: messageText,
                            timestamp: Date.now(),
                            hasMedia: hasMedia,
                            mediaType: messageType,
                            mediaContext: mediaContext
                        });
                        conversation.lastMessageTime = Date.now();

                        // Log the received message
                        this.mainWindow.webContents.send('warming-message-received', {
                            from: fromNumber,
                            message: message.body,
                            timestamp: Date.now()
                        });

                        // Check if this number is disabled
                        const isDisabled = this.disabledNumbers.has(fromNumber);

                        if (isDisabled) {
                            // Queue the message for later processing
                            console.log(`Number ${fromNumber} is disabled, queuing message`);
                            this.queuedMessages.set(fromNumber, {
                                message: message.body,
                                timestamp: Date.now()
                            });
                            this.mainWindow.webContents.send('warming-log', {
                                message: `Message from ${fromNumber} queued (number disabled)`
                            });
                        } else {
                            // 15% chance to react with emoji in addition to text
                            const shouldReact = Math.random() < 0.15;

                            if (shouldReact) {
                                // React immediately
                                console.log(`Reacting to message from ${fromNumber} (15% chance)`);
                                await this.sendEmojiReaction(message, fromNumber);
                            }

                            // Always send text reply after delay
                            const delayMin = (this.warmingConfig?.delayMin || 3) * 1000;
                            const delayMax = (this.warmingConfig?.delayMax || 8) * 1000;
                            const delay = delayMin + Math.random() * (delayMax - delayMin);

                            console.log(`Waiting ${Math.round(delay / 1000)}s before responding...`);
                            setTimeout(async () => {
                                try {
                                    await this.sendAIReply(fromNumber);
                                } catch (error) {
                                    console.error(`Error sending AI reply to ${fromNumber}:`, error);
                                    this.mainWindow.webContents.send('warming-error', {
                                        error: `Failed to send reply to ${fromNumber}: ${error.message}`
                                    });
                                }
                            }, delay);
                        }
                    }
                }

                    this.mainWindow.webContents.send('message-received', {
                        accountId: this.accountId,
                        message: {
                            id: messageId,
                            from: message.from,
                            to: message.to,
                            body: message.body,
                            timestamp: message.timestamp,
                            fromMe: message.fromMe,
                            hasMedia: hasMedia,
                            mediaType: messageType,
                            mediaContext: mediaContext
                        }
                    });
                } catch (error) {
                    console.error('Error handling incoming message:', error);
                    // Don't crash the app, just log the error
                    this.mainWindow.webContents.send('warming-error', {
                        error: `Message handling error: ${error.message}`
                    });
                }
            });

            // Initialize client - will auto-restore session if valid
            await client.initialize();

            this.client = client;
            this.accountId = accountId;
            this.accountName = accountName;

            return true;
        } catch (error) {
            console.error(`Error restoring session for ${accountName}:`, error);
            throw error;
        }
    }

    async handleMediaMessage(message) {
        try {
            const media = await message.downloadMedia();

            if (!media) {
                console.error('Failed to download media');
                return this.getMediaFallback(message.type, 'Download failed');
            }

            // Check size limit (10MB)
            const sizeInMB = (media.data.length * 0.75) / (1024 * 1024);
            if (sizeInMB > 10) {
                console.warn(`Media too large: ${sizeInMB.toFixed(2)}MB`);
                return this.getMediaFallback(message.type, `File too large`);
            }

            // Route to appropriate handler
            if (message.type === 'image') {
                return await this.analyzeImage(media);
            } else if (message.type === 'ptt' || message.type === 'audio') {
                return await this.transcribeAudio(media);
            }

            return null;
        } catch (error) {
            console.error('Error handling media:', error);
            return this.getMediaFallback(message.type, error.message);
        }
    }

    getMediaFallback(type, reason) {
        return {
            type: type,
            description: type === 'image' ? 'an image' : 'a voice message',
            transcription: type === 'voice' || type === 'ptt' || type === 'audio' ? '[unable to transcribe]' : undefined,
            error: reason,
            fallback: true
        };
    }

    async analyzeImage(media) {
        if (!this.genAI) {
            return { type: 'image', description: 'an image' };
        }

        try {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

            const imagePart = {
                inlineData: {
                    data: media.data,
                    mimeType: media.mimetype
                }
            };

            const prompt = `Analyze this image in detail. Describe what you see in a natural, conversational way as if you're telling a friend what's in the picture. Keep it to 1-2 sentences. Focus on the main subject and any interesting details.`;

            const result = await model.generateContent([prompt, imagePart]);
            const response = await result.response;
            const description = response.text().trim();

            console.log(`Image analyzed: ${description}`);

            // Send to warming log
            if (this.mainWindow && this.mainWindow.webContents) {
                this.mainWindow.webContents.send('warming-log', {
                    message: `📷 Analyzed image: "${description.substring(0, 50)}${description.length > 50 ? '...' : ''}"`
                });
            }

            return {
                type: 'image',
                description: description,
                mimeType: media.mimetype
            };
        } catch (error) {
            console.error('Error analyzing image:', error);
            return {
                type: 'image',
                description: 'an image',
                error: error.message
            };
        }
    }

    async transcribeAudio(media) {
        if (!this.genAI) {
            return { type: 'voice', transcription: '[voice message]' };
        }

        try {
            const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

            const audioPart = {
                inlineData: {
                    data: media.data,
                    mimeType: media.mimetype
                }
            };

            const prompt = `Transcribe this audio message exactly. Provide only the transcription without any additional commentary.`;

            const result = await model.generateContent([prompt, audioPart]);
            const response = await result.response;
            const transcription = response.text().trim();

            console.log(`Audio transcribed: ${transcription}`);

            // Send to warming log
            if (this.mainWindow && this.mainWindow.webContents) {
                this.mainWindow.webContents.send('warming-log', {
                    message: `🎤 Transcribed voice: "${transcription.substring(0, 50)}${transcription.length > 50 ? '...' : ''}"`
                });
            }

            return {
                type: 'voice',
                transcription: transcription,
                mimeType: media.mimetype
            };
        } catch (error) {
            console.error('Error transcribing audio:', error);
            return {
                type: 'voice',
                transcription: '[voice message - transcription failed]',
                error: error.message
            };
        }
    }

    async disconnectAll() {
        if (this.client) {
            await this.client.destroy().catch(err => console.error(err));
            this.client = null;
        }
    }

    getAccountStatus(accountId) {
        if (!this.client || this.accountId !== accountId) {
            return { status: 'not_initialized' };
        }

        const state = this.client.info ? 'ready' : 'connecting';

        return {
            status: state,
            phoneNumber: this.client.info ? this.client.info.wid.user : ''
        };
    }

    async sendEmojiReaction(message, phoneNumber) {
        if (!this.client || !this.client.info) {
            console.error('Client not ready');
            return;
        }

        try {
            // Curated list of positive emojis
            const emojis = ['👍', '❤️', '😂', '😊', '🔥', '✨', '👏', '💯'];

            // Pick random emoji
            const emoji = emojis[Math.floor(Math.random() * emojis.length)];

            // Send reaction to the message
            await message.react(emoji);

            console.log(`Reacted to ${phoneNumber} with ${emoji}`);

            // Add reaction to conversation history
            const conversation = this.activeConversations.get(phoneNumber);
            if (conversation) {
                conversation.history.push({
                    role: 'assistant',
                    text: `[Reacted with ${emoji}]`,
                    timestamp: Date.now(),
                    isReaction: true
                });
            }

            // Log to warming activity
            this.mainWindow.webContents.send('warming-log', {
                message: `Reacted to ${phoneNumber} with ${emoji}`
            });

            // Update stats (count as engagement)
            this.mainWindow.webContents.send('increment-stats');

        } catch (error) {
            console.error('Error sending emoji reaction:', error);

            // Fallback: send text reply instead
            console.log('Reaction failed, falling back to text reply');
            await this.sendAIReply(phoneNumber);
        }
    }

    async sendAIReply(phoneNumber) {
        if (!this.client || !this.client.info) {
            console.error('Client not ready');
            return;
        }

        try {
            const conversation = this.activeConversations.get(phoneNumber);
            if (!conversation) return;

            const chatId = `${phoneNumber}@c.us`;

            // Get chat object for typing indicator
            const chat = await this.client.getChatById(chatId);

            // Calculate random typing duration from config
            const typingMin = (this.warmingConfig?.typingMin || 2) * 1000; // Convert to milliseconds
            const typingMax = (this.warmingConfig?.typingMax || 5) * 1000;
            const typingDuration = typingMin + Math.random() * (typingMax - typingMin);

            // Show typing indicator
            await chat.sendStateTyping();
            console.log(`Showing typing indicator for ${Math.round(typingDuration / 1000)}s to ${phoneNumber}`);

            // Wait for typing duration before proceeding
            await new Promise(resolve => setTimeout(resolve, typingDuration));

            // NEW: Determine if we should send media (10% chance)
            const shouldSendMedia = this.mediaConfig?.enabled &&
                                   this.mediaItems.length > 0 &&
                                   Math.random() < (this.mediaConfig?.frequency || 0.10);

            if (shouldSendMedia) {
                console.log('Attempting to send media (10% chance)...');
                const mediaItem = this.selectRandomMediaItem();

                if (mediaItem && fs.existsSync(mediaItem.filePath)) {
                    console.log(`Attempting to send media: ${mediaItem.fileName}`);
                    const mediaSent = await this.sendMediaWithMessage(phoneNumber, mediaItem);

                    if (mediaSent) {
                        // Add to conversation history
                        conversation.history.push({
                            role: 'assistant',
                            text: `[Sent image: ${mediaItem.context}]`,
                            timestamp: Date.now(),
                            isMedia: true,
                            mediaContext: mediaItem.context
                        });
                        conversation.lastMessageTime = Date.now();

                        // Update stats
                        this.mainWindow.webContents.send('warming-message-sent', {
                            to: phoneNumber,
                            message: `[Image: ${mediaItem.context.substring(0, 50)}...]`,
                            timestamp: Date.now()
                        });

                        this.mainWindow.webContents.send('increment-stats');
                        return; // Exit - media sent successfully
                    }
                }

                console.log('Media send failed or unavailable, continuing to sticker/text');
            }

            // NEW: Determine if we should send a sticker
            const shouldSendSticker = this.stickerConfig?.enabled &&
                                      Math.random() < (this.stickerConfig?.frequency || 0.12);

            if (shouldSendSticker) {
                console.log('Attempting to send sticker...');
                // Detect emotion from conversation
                const emotion = await this.detectConversationEmotion(conversation.history);

                // Try to select and send sticker
                const stickerPath = this.selectRandomSticker(emotion);

                if (stickerPath && fs.existsSync(stickerPath)) {
                    console.log(`Attempting to send sticker (emotion: ${emotion})`);
                    const stickerSent = await this.sendSticker(phoneNumber, stickerPath);

                    if (stickerSent) {
                        // Add to conversation history
                        conversation.history.push({
                            role: 'assistant',
                            text: `[Sent sticker: ${emotion}]`,
                            timestamp: Date.now(),
                            isSticker: true
                        });
                        conversation.lastMessageTime = Date.now();

                        // Update stats
                        this.mainWindow.webContents.send('warming-message-sent', {
                            to: phoneNumber,
                            message: `[Sticker: ${emotion}]`,
                            timestamp: Date.now()
                        });

                        this.mainWindow.webContents.send('increment-stats');
                        return; // Exit - sticker sent successfully
                    }
                }

                // Fallback: If sticker failed and fallback disabled, exit
                if (!this.stickerConfig?.fallbackToText) {
                    console.log('Sticker send failed, fallback disabled');
                    return;
                }

                console.log('Sticker unavailable, falling back to text');
            }

            // EXISTING: Generate and send text response
            const aiResponse = await this.generateAIResponse(conversation.history, false);

            // Send the message (this automatically clears typing state)
            await this.client.sendMessage(chatId, aiResponse);

            // Add to conversation history
            conversation.history.push({
                role: 'assistant',
                text: aiResponse,
                timestamp: Date.now()
            });
            conversation.lastMessageTime = Date.now();

            // Manually add to messagesByPhone storage
            const messageId = `${chatId}_${Date.now()}_${aiResponse.substring(0, 20)}`;
            this.addMessageToPhone(phoneNumber, {
                id: messageId,
                accountId: this.accountId,
                accountName: this.accountName,
                phoneNumber,
                from: this.client.info.wid._serialized,
                to: chatId,
                body: aiResponse,
                timestamp: Math.floor(Date.now() / 1000),
                isOwn: true
            });

            console.log(`Sent AI reply to ${phoneNumber}: "${aiResponse}"`);

            // Notify renderer
            this.mainWindow.webContents.send('warming-message-sent', {
                to: phoneNumber,
                message: aiResponse,
                timestamp: Date.now()
            });

            this.mainWindow.webContents.send('increment-stats');

        } catch (error) {
            console.error('Error sending AI reply:', error);
            this.mainWindow.webContents.send('warming-error', {
                error: error.message
            });
        }
    }

    async startWarming(config) {
        if (this.warmingActive) {
            console.log('Warming already active');
            return;
        }

        if (!this.client || !this.client.info) {
            throw new Error('No WhatsApp account connected');
        }

        if (!config.apiKey) {
            throw new Error('Gemini API key is required');
        }

        if (!config.phoneNumbers || config.phoneNumbers.length === 0) {
            throw new Error('At least one phone number is required');
        }

        // Initialize AI
        if (!this.initializeAI(config.apiKey)) {
            throw new Error('Failed to initialize AI');
        }

        // Initialize sticker manager
        this.initializeStickerManager(config);

        // Initialize media manager
        this.initializeMediaManager(config);

        this.warmingConfig = config;
        this.warmingActive = true;

        console.log('Starting AI-powered warming with config:', config);

        // Send initial greeting to all phone numbers
        for (let i = 0; i < config.phoneNumbers.length; i++) {
            const phoneNumber = config.phoneNumbers[i];

            // Initialize conversation
            this.activeConversations.set(phoneNumber, {
                history: [],
                lastMessageTime: Date.now()
            });

            // Send greeting after a configurable delay (stagger each greeting)
            const delayMin = (config.delayMin || 3) * 1000;
            const delayMax = (config.delayMax || 8) * 1000;
            const baseDelay = delayMin + Math.random() * (delayMax - delayMin);
            const staggerDelay = i * 2000; // Stagger greetings by 2 seconds each

            setTimeout(async () => {
                await this.sendInitialGreeting(phoneNumber);
            }, baseDelay + staggerDelay);
        }
    }

    async sendInitialGreeting(phoneNumber) {
        if (!this.warmingActive) return;

        if (!this.client || !this.client.info) {
            console.error('Cannot send greeting - client disconnected');
            this.mainWindow.webContents.send('warming-error', {
                error: 'WhatsApp disconnected - cannot send greeting',
                phoneNumber
            });
            return;
        }

        try {
            // Generate AI greeting
            const greeting = await this.generateAIResponse([], true);

            // Send the message
            const chatId = `${phoneNumber}@c.us`;
            await this.client.sendMessage(chatId, greeting);

            // Add to conversation history
            const conversation = this.activeConversations.get(phoneNumber);
            if (conversation) {
                conversation.history.push({
                    role: 'assistant',
                    text: greeting,
                    timestamp: Date.now()
                });
                conversation.lastMessageTime = Date.now();
            }

            // Manually add to messagesByPhone storage
            const messageId = `${chatId}_${Date.now()}_${greeting.substring(0, 20)}`;
            this.addMessageToPhone(phoneNumber, {
                id: messageId,
                accountId: this.accountId,
                accountName: this.accountName,
                phoneNumber,
                from: this.client.info.wid._serialized,
                to: chatId,
                body: greeting,
                timestamp: Math.floor(Date.now() / 1000),
                isOwn: true
            });

            console.log(`Sent initial greeting to ${phoneNumber}: "${greeting}"`);

            // Notify renderer
            this.mainWindow.webContents.send('warming-message-sent', {
                to: phoneNumber,
                message: greeting,
                timestamp: Date.now()
            });

            this.mainWindow.webContents.send('increment-stats');

        } catch (error) {
            console.error('Error sending initial greeting:', error);
            this.mainWindow.webContents.send('warming-error', {
                error: error.message,
                phoneNumber
            });
        }
    }

    stopWarming() {
        this.warmingActive = false;

        // Clear all conversation check intervals
        for (const [phoneNumber, intervalId] of this.conversationCheckIntervals.entries()) {
            clearInterval(intervalId);
        }
        this.conversationCheckIntervals.clear();

        // Clear active conversations
        this.activeConversations.clear();

        console.log('Warming stopped');
    }

    isWarmingActive() {
        return this.warmingActive;
    }

    getWarmingStatus() {
        return {
            active: this.warmingActive,
            config: this.warmingConfig,
            activeConversations: Array.from(this.activeConversations.keys())
        };
    }

    addMessage(messageData) {
        this.recentMessages.unshift(messageData);
        if (this.recentMessages.length > this.maxMessages) {
            this.recentMessages = this.recentMessages.slice(0, this.maxMessages);
        }
    }

    addMessageToPhone(phoneNumber, messageData) {
        if (!this.messagesByPhone.has(phoneNumber)) {
            this.messagesByPhone.set(phoneNumber, []);
        }

        const messages = this.messagesByPhone.get(phoneNumber);
        messages.push(messageData);

        // Keep only last 100 messages per phone number
        if (messages.length > 100) {
            this.messagesByPhone.set(phoneNumber, messages.slice(-100));
        }
    }

    getRecentMessages() {
        return this.recentMessages;
    }

    getMessagesByPhone(phoneNumber) {
        return this.messagesByPhone.get(phoneNumber) || [];
    }

    getAllMessagesByPhone() {
        const result = {};
        for (const [phoneNumber, messages] of this.messagesByPhone.entries()) {
            result[phoneNumber] = messages;
        }
        return result;
    }

    hasAccount() {
        return this.client !== null;
    }

    // Set a phone number as disabled
    setNumberDisabled(phoneNumber, disabled) {
        if (disabled) {
            this.disabledNumbers.add(phoneNumber);
            console.log(`Number ${phoneNumber} disabled`);
        } else {
            this.disabledNumbers.delete(phoneNumber);
            console.log(`Number ${phoneNumber} enabled`);
        }
    }

    // Check if a number is disabled
    isNumberDisabled(phoneNumber) {
        return this.disabledNumbers.has(phoneNumber);
    }

    // Process queued messages when a number is re-enabled
    async processQueuedMessages(phoneNumber) {
        const queued = this.queuedMessages.get(phoneNumber);

        if (queued && this.warmingActive) {
            console.log(`Processing queued message for ${phoneNumber}: "${queued.message}"`);

            // Make sure the conversation history is updated
            if (!this.activeConversations.has(phoneNumber)) {
                this.activeConversations.set(phoneNumber, { history: [], lastMessageTime: Date.now() });
            }

            const conversation = this.activeConversations.get(phoneNumber);

            // Add the queued message to history if not already there
            const alreadyInHistory = conversation.history.some(
                h => h.text === queued.message && h.role === 'user'
            );

            if (!alreadyInHistory) {
                conversation.history.push({
                    role: 'user',
                    text: queued.message,
                    timestamp: queued.timestamp
                });
            }

            // Clear the queue
            this.queuedMessages.delete(phoneNumber);

            // Send AI response with delay
            const delayMin = (this.warmingConfig?.delayMin || 3) * 1000;
            const delayMax = (this.warmingConfig?.delayMax || 8) * 1000;
            const delay = delayMin + Math.random() * (delayMax - delayMin);

            console.log(`Responding to queued message in ${Math.round(delay / 1000)}s...`);

            this.mainWindow.webContents.send('warming-log', {
                message: `Processing queued message from ${phoneNumber}`
            });

            setTimeout(async () => {
                await this.sendAIReply(phoneNumber);
            }, delay);
        }
    }

    // Get queued message for a number
    getQueuedMessage(phoneNumber) {
        return this.queuedMessages.get(phoneNumber);
    }
}

module.exports = WhatsAppManager;
