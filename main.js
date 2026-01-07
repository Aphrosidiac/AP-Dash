const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const WhatsAppManager = require('./whatsapp');

let mainWindow;
let whatsappManager;

const DATA_DIR = path.join(__dirname, 'data');
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const PHONE_NUMBERS_FILE = path.join(DATA_DIR, 'phone_numbers.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const MEDIA_FILES_DIR = path.join(MEDIA_DIR, 'files');
const MEDIA_INDEX_FILE = path.join(MEDIA_DIR, 'media-items.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}
if (!fs.existsSync(MEDIA_DIR)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
}
if (!fs.existsSync(MEDIA_FILES_DIR)) {
    fs.mkdirSync(MEDIA_FILES_DIR, { recursive: true });
}

// Initialize data files
if (!fs.existsSync(ACCOUNTS_FILE)) {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(STATS_FILE)) {
    fs.writeFileSync(STATS_FILE, JSON.stringify({ messagesSentToday: 0, lastReset: new Date().toDateString() }));
}
if (!fs.existsSync(PHONE_NUMBERS_FILE)) {
    fs.writeFileSync(PHONE_NUMBERS_FILE, JSON.stringify([]));
}
if (!fs.existsSync(MEDIA_INDEX_FILE)) {
    fs.writeFileSync(MEDIA_INDEX_FILE, JSON.stringify([], null, 2));
}
if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = {
        apiKey: '',
        aiPersonality: `You are a real human casually chatting on WhatsApp.
Your goal is to build trust and familiarity over time — not to sell, pitch, or push anything.

TONE & STYLE
- Sound natural, relaxed, and human — never robotic or scripted
- Use casual WhatsApp-style language with contractions and simple wording
- Messages should feel spontaneous and slightly imperfect, not polished
- Vary reply length naturally (sometimes 1 sentence, sometimes 2–3)

CONVERSATION BEHAVIOR
- Match the other person's tone, energy, and response length
- Ask light, genuine questions only when it feels natural
- Reply like a real person who is multitasking (not instant, not overeager)
- Avoid repeating the same phrases or sentence structures

HUMAN REALISM RULES
- Do not overuse emojis (0–1 max, only when it fits naturally)
- Do not sound overly enthusiastic, salesy, or fake-positive
- Do not give assistant-style or generic responses
- If unsure, respond casually or ask for clarification like a real person

TRUST & WARM-UP FOCUS
- Prioritize friendliness, familiarity, and normal conversation
- Keep topics safe and neutral (daily life, work, light interests)
- Never mention AI, automation, systems, software, or business intent

MESSAGE CONSTRAINTS
- Default to short WhatsApp-style messages (1–2 sentences)
- Avoid paragraphs, bullet points, or formal language
- Use simple acknowledgements, light humor, or casual replies when appropriate

You are not trying to impress.
You are trying to feel familiar and human.

Optional:
- Occasionally respond with a brief acknowledgment instead of a full reply (e.g., "haha yeah", "true", "makes sense") if it fits the conversation.`,
        delayMin: 3,
        delayMax: 8,
        stickerSettings: {
            enabled: true,
            frequency: 0.12,
            fallbackToText: true,
            categories: ['funny', 'love', 'sad', 'excited', 'thumbs_up', 'thinking', 'wow', 'casual']
        },
        mediaSettings: {
            enabled: true,
            frequency: 0.10,
            maxFileSize: 5242880,
            allowedFormats: ['image/jpeg', 'image/png', 'image/jpg'],
            requireContext: true
        }
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'icon.png')
    });

    mainWindow.loadFile('index.html');

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    createWindow();
    whatsappManager = new WhatsAppManager(SESSIONS_DIR, mainWindow);

    // Restore existing sessions on startup
    try {
        const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
        for (const account of accounts) {
            try {
                console.log(`Attempting to restore session: ${account.name}`);
                await whatsappManager.restoreSession(account.id, account.name);
            } catch (error) {
                console.error(`Failed to restore session for ${account.name}:`, error);
            }
        }
    } catch (error) {
        console.error('Error reading accounts for session restore:', error);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', async () => {
    if (whatsappManager) {
        await whatsappManager.disconnectAll();
    }
});

// IPC Handlers

// Get all accounts
ipcMain.handle('get-accounts', async () => {
    try {
        const data = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
        const accounts = JSON.parse(data);

        // Add real-time status from WhatsApp client
        const accountsWithStatus = accounts.map(account => {
            const status = whatsappManager.getAccountStatus(account.id);
            return { ...account, ...status };
        });

        return accountsWithStatus;
    } catch (error) {
        console.error('Error reading accounts:', error);
        return [];
    }
});

// Check if account exists
ipcMain.handle('has-account', async () => {
    try {
        const data = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
        const accounts = JSON.parse(data);
        return accounts.length > 0;
    } catch (error) {
        return false;
    }
});

// Add new account (only one allowed)
ipcMain.handle('add-account', async (event, accountName) => {
    try {
        const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));

        // Check if account already exists
        if (accounts.length > 0) {
            return { success: false, error: 'Only one warming account is allowed. Please remove the existing account first.' };
        }

        const accountId = `account_${Date.now()}`;

        const newAccount = {
            id: accountId,
            name: accountName,
            phoneNumber: '',
            status: 'connecting',
            addedAt: new Date().toISOString()
        };

        accounts.push(newAccount);
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));

        // Initialize WhatsApp client for this account
        await whatsappManager.addAccount(accountId, accountName);

        return { success: true, account: newAccount };
    } catch (error) {
        console.error('Error adding account:', error);
        return { success: false, error: error.message };
    }
});

// Remove account
ipcMain.handle('remove-account', async (event, accountId) => {
    try {
        let accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
        accounts = accounts.filter(acc => acc.id !== accountId);
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));

        await whatsappManager.removeAccount();

        return { success: true };
    } catch (error) {
        console.error('Error removing account:', error);
        return { success: false, error: error.message };
    }
});

// Update account info
ipcMain.handle('update-account', async (event, accountId, updates) => {
    try {
        let accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
        const index = accounts.findIndex(acc => acc.id === accountId);

        if (index !== -1) {
            accounts[index] = { ...accounts[index], ...updates };
            fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
        }

        return { success: true };
    } catch (error) {
        console.error('Error updating account:', error);
        return { success: false, error: error.message };
    }
});

// Phone Numbers Management

// Get all phone numbers
ipcMain.handle('get-phone-numbers', async () => {
    try {
        const data = fs.readFileSync(PHONE_NUMBERS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading phone numbers:', error);
        return [];
    }
});

// Add phone number
ipcMain.handle('add-phone-number', async (event, phoneNumber, name) => {
    try {
        let phoneNumbers = JSON.parse(fs.readFileSync(PHONE_NUMBERS_FILE, 'utf-8'));

        // Check if number already exists
        if (phoneNumbers.some(p => p.number === phoneNumber)) {
            return { success: false, error: 'Phone number already exists' };
        }

        const newNumber = {
            id: `phone_${Date.now()}`,
            number: phoneNumber,
            name: name || phoneNumber,
            addedAt: new Date().toISOString()
        };

        phoneNumbers.push(newNumber);
        fs.writeFileSync(PHONE_NUMBERS_FILE, JSON.stringify(phoneNumbers, null, 2));

        return { success: true, phoneNumber: newNumber };
    } catch (error) {
        console.error('Error adding phone number:', error);
        return { success: false, error: error.message };
    }
});

// Remove phone number
ipcMain.handle('remove-phone-number', async (event, phoneId) => {
    try {
        let phoneNumbers = JSON.parse(fs.readFileSync(PHONE_NUMBERS_FILE, 'utf-8'));
        phoneNumbers = phoneNumbers.filter(p => p.id !== phoneId);
        fs.writeFileSync(PHONE_NUMBERS_FILE, JSON.stringify(phoneNumbers, null, 2));

        return { success: true };
    } catch (error) {
        console.error('Error removing phone number:', error);
        return { success: false, error: error.message };
    }
});

// Toggle phone number enabled/disabled
ipcMain.handle('toggle-phone-number', async (event, phoneId) => {
    try {
        let phoneNumbers = JSON.parse(fs.readFileSync(PHONE_NUMBERS_FILE, 'utf-8'));
        const index = phoneNumbers.findIndex(p => p.id === phoneId);

        if (index !== -1) {
            // Toggle the enabled state (default to true if not set)
            const currentEnabled = phoneNumbers[index].enabled !== false;
            phoneNumbers[index].enabled = !currentEnabled;
            fs.writeFileSync(PHONE_NUMBERS_FILE, JSON.stringify(phoneNumbers, null, 2));

            const phoneNumber = phoneNumbers[index].number;

            // Update WhatsApp manager's disabled list
            whatsappManager.setNumberDisabled(phoneNumber, !phoneNumbers[index].enabled);

            // If re-enabled, process any queued messages
            if (phoneNumbers[index].enabled) {
                whatsappManager.processQueuedMessages(phoneNumber);
            }

            return { success: true, enabled: phoneNumbers[index].enabled };
        }

        return { success: false, error: 'Phone number not found' };
    } catch (error) {
        console.error('Error toggling phone number:', error);
        return { success: false, error: error.message };
    }
});

// Get phone number enabled status
ipcMain.handle('get-phone-enabled-status', async (event, phoneNumber) => {
    try {
        const phoneNumbers = JSON.parse(fs.readFileSync(PHONE_NUMBERS_FILE, 'utf-8'));
        const phone = phoneNumbers.find(p => p.number === phoneNumber);
        return phone ? phone.enabled !== false : true;
    } catch (error) {
        return true; // Default to enabled
    }
});

// Config Management

// Get config (API key)
ipcMain.handle('get-config', async () => {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading config:', error);
        return { apiKey: '' };
    }
});

// Save config (API key)
ipcMain.handle('save-config', async (event, config) => {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error saving config:', error);
        return { success: false, error: error.message };
    }
});

// Start warming
ipcMain.handle('start-warming', async (event, config) => {
    try {
        // Get phone numbers
        const phoneNumbers = JSON.parse(fs.readFileSync(PHONE_NUMBERS_FILE, 'utf-8'));

        if (phoneNumbers.length === 0) {
            return { success: false, error: 'Please add at least one phone number first' };
        }

        // Get API key from config
        const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));

        if (!savedConfig.apiKey) {
            return { success: false, error: 'Please configure your Gemini API key first' };
        }

        if (!savedConfig.aiPersonality || !savedConfig.aiPersonality.trim()) {
            return { success: false, error: 'Please configure an AI personality before starting the warmer' };
        }

        // Prepare warming config
        const warmingConfig = {
            apiKey: savedConfig.apiKey,
            aiPersonality: savedConfig.aiPersonality,
            phoneNumbers: phoneNumbers.map(p => p.number),
            delayMin: savedConfig.delayMin || 3,
            delayMax: savedConfig.delayMax || 8,
            typingMin: savedConfig.typingMin || 2,
            typingMax: savedConfig.typingMax || 5,
            stickerSettings: savedConfig.stickerSettings,
            mediaSettings: savedConfig.mediaSettings
        };

        await whatsappManager.startWarming(warmingConfig);
        return { success: true };
    } catch (error) {
        console.error('Error starting warming:', error);
        return { success: false, error: error.message };
    }
});

// Stop warming
ipcMain.handle('stop-warming', async () => {
    try {
        whatsappManager.stopWarming();
        return { success: true };
    } catch (error) {
        console.error('Error stopping warming:', error);
        return { success: false, error: error.message };
    }
});

// Get warming status
ipcMain.handle('get-warming-status', async () => {
    return whatsappManager.getWarmingStatus();
});

// Get stats
ipcMain.handle('get-stats', async () => {
    try {
        const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));

        // Reset daily counter if it's a new day
        const today = new Date().toDateString();
        if (stats.lastReset !== today) {
            stats.messagesSentToday = 0;
            stats.lastReset = today;
            fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
        }

        const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
        const connectedAccounts = accounts.filter(acc => {
            const status = whatsappManager.getAccountStatus(acc.id);
            return status.status === 'ready';
        }).length;

        const phoneNumbers = JSON.parse(fs.readFileSync(PHONE_NUMBERS_FILE, 'utf-8'));

        return {
            connectedAccounts,
            totalAccounts: accounts.length,
            totalPhoneNumbers: phoneNumbers.length,
            messagesSentToday: stats.messagesSentToday,
            warmingActive: whatsappManager.isWarmingActive()
        };
    } catch (error) {
        console.error('Error getting stats:', error);
        return {
            connectedAccounts: 0,
            totalAccounts: 0,
            totalPhoneNumbers: 0,
            messagesSentToday: 0,
            warmingActive: false
        };
    }
});

// Increment message count
ipcMain.handle('increment-message-count', async () => {
    try {
        const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
        stats.messagesSentToday = (stats.messagesSentToday || 0) + 1;
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
        return { success: true };
    } catch (error) {
        console.error('Error incrementing message count:', error);
        return { success: false };
    }
});

// Get messages for chat view
ipcMain.handle('get-messages', async () => {
    return whatsappManager.getRecentMessages();
});

// Get messages segmented by phone number
ipcMain.handle('get-messages-by-phone', async () => {
    return whatsappManager.getAllMessagesByPhone();
});

// Sticker Management IPC Handlers

// Get sticker categories and counts
ipcMain.handle('get-sticker-categories', async () => {
    try {
        const stickersDir = path.join(DATA_DIR, 'stickers');

        if (!fs.existsSync(stickersDir)) {
            return [];
        }

        const categories = fs.readdirSync(stickersDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => {
                const categoryPath = path.join(stickersDir, dirent.name);
                const files = fs.readdirSync(categoryPath)
                    .filter(f => f.endsWith('.webp'));

                return {
                    name: dirent.name,
                    count: files.length,
                    stickers: files
                };
            });

        return categories;
    } catch (error) {
        console.error('Error getting sticker categories:', error);
        return [];
    }
});

// Upload sticker file
ipcMain.handle('upload-sticker', async (event, { category, fileName, fileData }) => {
    try {
        const stickersDir = path.join(DATA_DIR, 'stickers');
        const categoryPath = path.join(stickersDir, category);

        // Ensure category directory exists
        if (!fs.existsSync(categoryPath)) {
            fs.mkdirSync(categoryPath, { recursive: true });
        }

        // Ensure .webp extension
        if (!fileName.endsWith('.webp')) {
            fileName = fileName.replace(/\.[^.]+$/, '.webp');
        }

        const filePath = path.join(categoryPath, fileName);

        // Write file (fileData should be base64 or buffer)
        const buffer = Buffer.from(fileData, 'base64');
        fs.writeFileSync(filePath, buffer);

        return { success: true, path: filePath };
    } catch (error) {
        console.error('Error uploading sticker:', error);
        return { success: false, error: error.message };
    }
});

// Delete sticker
ipcMain.handle('delete-sticker', async (event, { category, fileName }) => {
    try {
        const stickersDir = path.join(DATA_DIR, 'stickers');
        const filePath = path.join(stickersDir, category, fileName);

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return { success: true };
        }

        return { success: false, error: 'File not found' };
    } catch (error) {
        console.error('Error deleting sticker:', error);
        return { success: false, error: error.message };
    }
});

// Get sticker file (for preview)
ipcMain.handle('get-sticker', async (event, { category, fileName }) => {
    try {
        const stickersDir = path.join(DATA_DIR, 'stickers');
        const filePath = path.join(stickersDir, category, fileName);

        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath);
            return {
                success: true,
                data: data.toString('base64'),
                mimeType: 'image/webp'
            };
        }

        return { success: false, error: 'File not found' };
    } catch (error) {
        console.error('Error getting sticker:', error);
        return { success: false, error: error.message };
    }
});

// Media Management IPC Handlers

// Get all media items
ipcMain.handle('get-media-items', async () => {
    try {
        const data = fs.readFileSync(MEDIA_INDEX_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error getting media items:', error);
        return [];
    }
});

// Upload media with context
ipcMain.handle('upload-media', async (event, { fileName, fileData, context, mimeType }) => {
    try {
        // Validate context is provided
        if (!context || context.trim().length === 0) {
            return { success: false, error: 'Context is required' };
        }

        if (context.trim().length < 10) {
            return { success: false, error: 'Context must be at least 10 characters' };
        }

        // Validate file format
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        const allowedFormats = config.mediaSettings?.allowedFormats ||
                              ['image/jpeg', 'image/png', 'image/jpg'];

        if (!allowedFormats.includes(mimeType)) {
            return { success: false, error: 'Unsupported file format. Only JPG and PNG are allowed.' };
        }

        // Generate unique filename
        const timestamp = Date.now();
        const extension = fileName.split('.').pop();
        const uniqueFileName = `media_${timestamp}.${extension}`;
        const filePath = path.join(MEDIA_FILES_DIR, uniqueFileName);

        // Decode and write file
        const buffer = Buffer.from(fileData, 'base64');

        // Check file size
        const maxFileSize = config.mediaSettings?.maxFileSize || 5242880; // 5MB
        if (buffer.length > maxFileSize) {
            return {
                success: false,
                error: `File too large. Maximum size is ${(maxFileSize / 1024 / 1024).toFixed(1)}MB`
            };
        }

        fs.writeFileSync(filePath, buffer);

        // Create media item entry
        const mediaItem = {
            id: `media_${timestamp}`,
            fileName: uniqueFileName,
            originalName: fileName,
            filePath: filePath,
            context: context.trim(),
            mimeType: mimeType,
            fileSize: buffer.length,
            uploadedAt: new Date().toISOString()
        };

        // Load existing media items
        const mediaItems = JSON.parse(fs.readFileSync(MEDIA_INDEX_FILE, 'utf-8'));
        mediaItems.push(mediaItem);

        // Save updated index
        fs.writeFileSync(MEDIA_INDEX_FILE, JSON.stringify(mediaItems, null, 2));

        // Reload media in WhatsAppManager
        if (whatsappManager) {
            whatsappManager.loadMediaItems();
        }

        return { success: true, mediaItem };

    } catch (error) {
        console.error('Error uploading media:', error);
        return { success: false, error: error.message };
    }
});

// Delete media item
ipcMain.handle('delete-media', async (event, { mediaId }) => {
    try {
        // Load media items
        let mediaItems = JSON.parse(fs.readFileSync(MEDIA_INDEX_FILE, 'utf-8'));

        // Find media item
        const mediaItem = mediaItems.find(item => item.id === mediaId);
        if (!mediaItem) {
            return { success: false, error: 'Media item not found' };
        }

        // Delete file
        if (fs.existsSync(mediaItem.filePath)) {
            fs.unlinkSync(mediaItem.filePath);
        }

        // Remove from index
        mediaItems = mediaItems.filter(item => item.id !== mediaId);
        fs.writeFileSync(MEDIA_INDEX_FILE, JSON.stringify(mediaItems, null, 2));

        // Reload media in WhatsAppManager
        if (whatsappManager) {
            whatsappManager.loadMediaItems();
        }

        return { success: true };

    } catch (error) {
        console.error('Error deleting media:', error);
        return { success: false, error: error.message };
    }
});

// Get media file (for preview)
ipcMain.handle('get-media-file', async (event, { mediaId }) => {
    try {
        const mediaItems = JSON.parse(fs.readFileSync(MEDIA_INDEX_FILE, 'utf-8'));
        const mediaItem = mediaItems.find(item => item.id === mediaId);

        if (!mediaItem || !fs.existsSync(mediaItem.filePath)) {
            return { success: false, error: 'File not found' };
        }

        const data = fs.readFileSync(mediaItem.filePath);
        return {
            success: true,
            data: data.toString('base64'),
            mimeType: mediaItem.mimeType
        };

    } catch (error) {
        console.error('Error getting media file:', error);
        return { success: false, error: error.message };
    }
});

// Update media context
ipcMain.handle('update-media-context', async (event, { mediaId, newContext }) => {
    try {
        if (!newContext || newContext.trim().length === 0) {
            return { success: false, error: 'Context cannot be empty' };
        }

        if (newContext.trim().length < 10) {
            return { success: false, error: 'Context must be at least 10 characters' };
        }

        let mediaItems = JSON.parse(fs.readFileSync(MEDIA_INDEX_FILE, 'utf-8'));
        const itemIndex = mediaItems.findIndex(item => item.id === mediaId);

        if (itemIndex === -1) {
            return { success: false, error: 'Media item not found' };
        }

        mediaItems[itemIndex].context = newContext.trim();
        fs.writeFileSync(MEDIA_INDEX_FILE, JSON.stringify(mediaItems, null, 2));

        // Reload media in WhatsAppManager
        if (whatsappManager) {
            whatsappManager.loadMediaItems();
        }

        return { success: true };

    } catch (error) {
        console.error('Error updating media context:', error);
        return { success: false, error: error.message };
    }
});

// Blasting handlers
ipcMain.handle('start-blast', async (event, { message, imageData }) => {
    try {
        // Validate inputs
        if (!message || message.trim().length === 0) {
            return { success: false, error: 'Message text is required' };
        }

        // Check if WhatsApp is ready
        if (!whatsappManager.client || !whatsappManager.client.info) {
            return { success: false, error: 'WhatsApp is not connected. Please add and connect your account first.' };
        }

        // Start blast with progress callback
        const results = await whatsappManager.blastMessage(message, imageData, (progress) => {
            // Send progress updates to renderer
            mainWindow.webContents.send('blast-progress', progress);
        });

        return { success: true, results: results };
    } catch (error) {
        console.error('Error starting blast:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-blast-stats', async () => {
    try {
        const phoneNumbers = JSON.parse(fs.readFileSync(PHONE_NUMBERS_FILE, 'utf-8'));
        const enabledNumbers = phoneNumbers.filter(p => p.enabled !== false);

        return {
            success: true,
            totalRecipients: enabledNumbers.length,
            estimatedTime: enabledNumbers.length * 3 // 3 seconds per recipient
        };
    } catch (error) {
        console.error('Error getting blast stats:', error);
        return { success: false, error: error.message };
    }
});

console.log('WhatsApp Warmer Started');
console.log('Data directory:', DATA_DIR);
console.log('Sessions directory:', SESSIONS_DIR);
