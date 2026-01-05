const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

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

            // Get custom personality or use default
            const personality = this.warmingConfig?.aiPersonality || `You are a casual, friendly person chatting on WhatsApp. You're warm, engaging, and conversational. Keep your messages short (1-2 sentences), natural, and use common texting language. You're helpful and ask questions to keep the conversation flowing.`;

            let prompt;
            if (isGreeting) {
                prompt = `${personality}

Generate a friendly greeting message to start a conversation on WhatsApp. Keep it natural and short (1-2 sentences). Just respond with the greeting message, nothing else.`;
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
                const greetings = ['Hey! How are you?', 'Hi there! What\'s up?', 'Hello! How\'s it going?'];
                return greetings[Math.floor(Math.random() * greetings.length)];
            } else {
                const fallbacks = ['That\'s interesting!', 'Tell me more!', 'I see!', 'That\'s cool!'];
                return fallbacks[Math.floor(Math.random() * fallbacks.length)];
            }
        }
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
                this.mainWindow.webContents.send('account-status-changed', {
                    accountId,
                    status: 'disconnected',
                    reason
                });
            });

            // Message received event - Listen for replies from phone numbers
            client.on('message', async (message) => {
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
                    isOwn: message.fromMe
                });

                // Handle warming logic if active
                if (this.warmingActive && !message.fromMe) {
                    const fromNumber = message.from.replace('@c.us', '');

                    // Check if this is from one of our target phone numbers
                    if (this.warmingConfig && this.warmingConfig.phoneNumbers.includes(fromNumber)) {
                        console.log(`Received reply from ${fromNumber}: ${message.body}`);

                        // Add to conversation history
                        if (!this.activeConversations.has(fromNumber)) {
                            this.activeConversations.set(fromNumber, { history: [], lastMessageTime: Date.now() });
                        }

                        const conversation = this.activeConversations.get(fromNumber);
                        conversation.history.push({
                            role: 'user',
                            text: message.body,
                            timestamp: Date.now()
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
                            // Generate AI response after a configurable delay to seem natural
                            const delayMin = (this.warmingConfig?.delayMin || 3) * 1000;
                            const delayMax = (this.warmingConfig?.delayMax || 8) * 1000;
                            const delay = delayMin + Math.random() * (delayMax - delayMin);

                            console.log(`Waiting ${Math.round(delay / 1000)}s before responding...`);
                            setTimeout(async () => {
                                await this.sendAIReply(fromNumber);
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
                        fromMe: message.fromMe
                    }
                });
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

    async sendAIReply(phoneNumber) {
        if (!this.client || !this.client.info) {
            console.error('Client not ready');
            return;
        }

        try {
            const conversation = this.activeConversations.get(phoneNumber);
            if (!conversation) return;

            // Generate AI response based on conversation history
            const aiResponse = await this.generateAIResponse(conversation.history, false);

            // Send the message
            const chatId = `${phoneNumber}@c.us`;
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
        if (!this.warmingActive || !this.client || !this.client.info) return;

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
