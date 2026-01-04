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

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
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
if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = {
        apiKey: '',
        aiPersonality: `You are a casual, friendly person chatting on WhatsApp. You're warm, engaging, and conversational. Keep your messages short (1-2 sentences), natural, and use common texting language. You're helpful and ask questions to keep the conversation flowing.`
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

app.whenReady().then(() => {
    createWindow();
    whatsappManager = new WhatsAppManager(SESSIONS_DIR, mainWindow);

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

        // Prepare warming config
        const warmingConfig = {
            apiKey: savedConfig.apiKey,
            aiPersonality: savedConfig.aiPersonality || `You are a casual, friendly person chatting on WhatsApp. You're warm, engaging, and conversational. Keep your messages short (1-2 sentences), natural, and use common texting language. You're helpful and ask questions to keep the conversation flowing.`,
            phoneNumbers: phoneNumbers.map(p => p.number)
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

console.log('WhatsApp Warmer Started');
console.log('Data directory:', DATA_DIR);
console.log('Sessions directory:', SESSIONS_DIR);
