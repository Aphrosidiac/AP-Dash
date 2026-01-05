const { ipcRenderer } = require('electron');

// State
let currentAccountId = null;
let warmingMessageCount = 0;
let activeConversations = [];

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeSettings();
    initializeAccountsTab();
    initializePhoneNumbersTab();
    initializeWarmerTab();
    initializeChatTab();
    loadInitialData();
    setupIpcListeners();
});

// Tab Management
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        }
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');

    // Update header title
    const titles = {
        'dashboard': 'Dashboard',
        'account': 'Account',
        'phone-numbers': 'Phone Numbers',
        'chat': 'Live Chat',
        'warmer': 'AI Warmer',
        'settings': 'Settings'
    };
    const headerTitle = document.getElementById('current-page-title');
    if (headerTitle) {
        headerTitle.textContent = titles[tabName] || 'Dashboard';
    }

    // Refresh data when switching tabs
    if (tabName === 'account') {
        loadAccounts();
    } else if (tabName === 'phone-numbers') {
        loadPhoneNumbers();
    } else if (tabName === 'chat') {
        loadMessages();
    } else if (tabName === 'warmer') {
        checkRequirements();
    } else if (tabName === 'dashboard') {
        loadStats();
    } else if (tabName === 'settings') {
        loadConfig();
    }
}

// Settings Tab
function initializeSettings() {
    const saveBtn = document.getElementById('save-api-key-btn');
    const testBtn = document.getElementById('test-api-key-btn');
    const toggleBtn = document.getElementById('toggle-api-key');
    const savePersonalityBtn = document.getElementById('save-ai-personality-btn');
    const resetPersonalityBtn = document.getElementById('reset-ai-personality-btn');
    const saveDelayBtn = document.getElementById('save-delay-btn');

    saveBtn.addEventListener('click', saveApiKey);
    testBtn.addEventListener('click', testApiKey);
    toggleBtn.addEventListener('click', () => {
        const input = document.getElementById('api-key-input');
        if (input.type === 'password') {
            input.type = 'text';
            toggleBtn.textContent = 'Hide';
        } else {
            input.type = 'password';
            toggleBtn.textContent = 'Show';
        }
    });

    savePersonalityBtn.addEventListener('click', saveAIPersonality);
    resetPersonalityBtn.addEventListener('click', resetAIPersonality);
    saveDelayBtn.addEventListener('click', saveDelaySettings);
}

async function loadConfig() {
    const config = await ipcRenderer.invoke('get-config');
    document.getElementById('api-key-input').value = config.apiKey || '';
    document.getElementById('ai-personality-input').value = config.aiPersonality || '';
    document.getElementById('delay-min-input').value = config.delayMin || 3;
    document.getElementById('delay-max-input').value = config.delayMax || 8;

    if (config.apiKey) {
        showApiStatus('API key configured', 'success');
    }
}

async function saveApiKey() {
    const apiKey = document.getElementById('api-key-input').value.trim();

    if (!apiKey) {
        showApiStatus('Please enter an API key', 'error');
        return;
    }

    const result = await ipcRenderer.invoke('save-config', { apiKey });

    if (result.success) {
        showApiStatus('API key saved successfully!', 'success');
        addActivityLog('Gemini API key configured');
        checkRequirements();
    } else {
        showApiStatus('Error saving API key', 'error');
    }
}

async function testApiKey() {
    const apiKey = document.getElementById('api-key-input').value.trim();

    if (!apiKey) {
        showApiStatus('Please enter an API key first', 'error');
        return;
    }

    showApiStatus('Testing connection...', 'info');

    try {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

        const result = await model.generateContent('Say "Hello"');
        const response = await result.response;
        const text = response.text();

        showApiStatus('✓ Connection successful! AI is working.', 'success');
    } catch (error) {
        showApiStatus('✗ Connection failed: ' + error.message, 'error');
    }
}

async function saveAIPersonality() {
    const aiPersonality = document.getElementById('ai-personality-input').value.trim();

    if (!aiPersonality) {
        showAIPersonalityStatus('Please enter an AI personality', 'error');
        return;
    }

    const config = await ipcRenderer.invoke('get-config');
    config.aiPersonality = aiPersonality;

    const result = await ipcRenderer.invoke('save-config', config);

    if (result.success) {
        showAIPersonalityStatus('AI personality saved successfully!', 'success');
        addActivityLog('AI personality updated');
    } else {
        showAIPersonalityStatus('Error saving AI personality', 'error');
    }
}

async function resetAIPersonality() {
    const defaultPersonality = `You are a casual, friendly person chatting on WhatsApp. You're warm, engaging, and conversational. Keep your messages short (1-2 sentences), natural, and use common texting language. You're helpful and ask questions to keep the conversation flowing.`;

    document.getElementById('ai-personality-input').value = defaultPersonality;

    const config = await ipcRenderer.invoke('get-config');
    config.aiPersonality = defaultPersonality;

    const result = await ipcRenderer.invoke('save-config', config);

    if (result.success) {
        showAIPersonalityStatus('AI personality reset to default', 'success');
        addActivityLog('AI personality reset to default');
    }
}

function showApiStatus(message, type) {
    const statusEl = document.getElementById('api-status');
    statusEl.textContent = message;
    statusEl.className = 'api-status ' + type;
}

function showAIPersonalityStatus(message, type) {
    const statusEl = document.getElementById('ai-personality-status');
    statusEl.textContent = message;
    statusEl.className = 'api-status ' + type;
}

async function saveDelaySettings() {
    const delayMin = parseInt(document.getElementById('delay-min-input').value) || 3;
    const delayMax = parseInt(document.getElementById('delay-max-input').value) || 8;

    // Validation
    if (delayMin < 1) {
        showDelayStatus('Minimum delay must be at least 1 second', 'error');
        return;
    }

    if (delayMax < delayMin) {
        showDelayStatus('Maximum delay must be greater than or equal to minimum delay', 'error');
        return;
    }

    if (delayMax > 120) {
        showDelayStatus('Maximum delay cannot exceed 120 seconds', 'error');
        return;
    }

    const config = await ipcRenderer.invoke('get-config');
    config.delayMin = delayMin;
    config.delayMax = delayMax;

    const result = await ipcRenderer.invoke('save-config', config);

    if (result.success) {
        showDelayStatus(`Delay settings saved: ${delayMin}s - ${delayMax}s`, 'success');
        addActivityLog(`Response delay updated: ${delayMin}s - ${delayMax}s`);
    } else {
        showDelayStatus('Error saving delay settings', 'error');
    }
}

function showDelayStatus(message, type) {
    const statusEl = document.getElementById('delay-status');
    statusEl.textContent = message;
    statusEl.className = 'api-status ' + type;
}

// Accounts Tab
function initializeAccountsTab() {
    const addAccountBtn = document.getElementById('add-account-btn');
    const closeModal = document.getElementById('close-account-modal');
    const generateQrBtn = document.getElementById('generate-qr-btn');

    addAccountBtn.addEventListener('click', openAddAccountModal);
    closeModal.addEventListener('click', closeAddAccountModal);
    generateQrBtn.addEventListener('click', generateQrCode);

    document.getElementById('add-account-modal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeAddAccountModal();
        }
    });

    // Fix: Focus on input when modal opens and handle Enter key
    document.getElementById('account-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            generateQrCode();
        }
    });
}

async function openAddAccountModal() {
    // Check if account already exists
    const hasAccount = await ipcRenderer.invoke('has-account');

    if (hasAccount) {
        alert('Only one warming account is allowed. Please remove the existing account first.');
        return;
    }

    const modal = document.getElementById('add-account-modal');
    const input = document.getElementById('account-name');

    modal.classList.add('active');
    document.getElementById('account-form').style.display = 'block';
    document.getElementById('qr-code-section').style.display = 'none';
    input.value = '';

    // Ensure input is enabled and editable
    input.disabled = false;
    input.readOnly = false;

    // Multiple focus attempts with increasing delays to handle animation
    const focusInput = () => {
        input.focus();
        input.select();
    };

    // Immediate focus
    focusInput();

    // Delayed focus attempts
    setTimeout(focusInput, 50);
    setTimeout(focusInput, 150);
    setTimeout(focusInput, 300);

    // Add click listener to ensure focus on click
    input.addEventListener('click', focusInput, { once: true });
}

function closeAddAccountModal() {
    document.getElementById('add-account-modal').classList.remove('active');
    currentAccountId = null;
}

async function generateQrCode() {
    const accountName = document.getElementById('account-name').value.trim();

    if (!accountName) {
        alert('Please enter an account name');
        document.getElementById('account-name').focus();
        return;
    }

    document.getElementById('account-form').style.display = 'none';
    document.getElementById('qr-code-section').style.display = 'block';
    document.querySelector('.qr-loading').style.display = 'flex';
    document.getElementById('qr-code-image').style.display = 'none';
    document.getElementById('qr-status').textContent = 'Initializing...';

    const result = await ipcRenderer.invoke('add-account', accountName);

    if (result.success) {
        currentAccountId = result.account.id;
        document.getElementById('qr-status').textContent = 'Waiting for QR code...';
    } else {
        document.getElementById('qr-status').textContent = `Error: ${result.error}`;
    }
}

async function loadAccounts() {
    const accounts = await ipcRenderer.invoke('get-accounts');
    const accountsList = document.getElementById('accounts-list');

    if (accounts.length === 0) {
        accountsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📱</div>
                <h3>No account added yet</h3>
                <p>Click "Add Account" to connect your WhatsApp account</p>
            </div>
        `;
        return;
    }

    // Single account - centered profile design
    const account = accounts[0];
    const statusColor = account.status === 'ready' ? '#10b981' : '#6b7280';
    const statusIcon = account.status === 'ready' ? '✓' : '○';

    accountsList.innerHTML = `
        <div class="account-profile-container">
            <div class="account-profile-card ${account.status === 'ready' ? 'account-connected' : 'account-connecting'}">
                <div class="account-profile-header">
                    <div class="account-avatar">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </div>
                    <div class="account-profile-info">
                        <h2>${account.name}</h2>
                        <p class="account-phone-number">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                            +${account.phoneNumber || 'Connecting...'}
                        </p>
                    </div>
                    <div class="account-profile-status">
                        <span class="status-badge status-${account.status === 'ready' ? 'active' : 'inactive'}">
                            ${statusIcon} ${getStatusText(account.status)}
                        </span>
                    </div>
                </div>

                <div class="account-profile-divider"></div>

                <div class="account-profile-details">
                    <div class="account-detail-item">
                        <span class="detail-label">Account Type</span>
                        <span class="detail-value">Warming Account</span>
                    </div>
                    <div class="account-detail-item">
                        <span class="detail-label">Connection Status</span>
                        <span class="detail-value" style="color: ${statusColor}; font-weight: 600;">
                            ${account.status === 'ready' ? 'Active & Ready' : 'Connecting...'}
                        </span>
                    </div>
                    <div class="account-detail-item">
                        <span class="detail-label">Added On</span>
                        <span class="detail-value">${new Date(account.addedAt).toLocaleDateString()}</span>
                    </div>
                </div>

                <div class="account-profile-actions">
                    <button class="btn btn-danger btn-remove-account" onclick="removeAccount('${account.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        Remove Account
                    </button>
                </div>
            </div>
        </div>
    `;
}

function getStatusText(status) {
    const statusMap = {
        'ready': 'Connected',
        'connecting': 'Connecting...',
        'authenticated': 'Authenticated',
        'disconnected': 'Disconnected',
        'auth_failure': 'Auth Failed'
    };
    return statusMap[status] || status;
}

async function removeAccount(accountId) {
    if (!confirm('Are you sure you want to remove this account?')) {
        return;
    }

    const result = await ipcRenderer.invoke('remove-account', accountId);
    if (result.success) {
        loadAccounts();
        loadStats();
        checkRequirements();
        addActivityLog('Account removed');
    }
}

// Phone Numbers Tab
function initializePhoneNumbersTab() {
    const addBtn = document.getElementById('add-phone-number-btn');
    const closeModal = document.getElementById('close-phone-modal');
    const saveBtn = document.getElementById('save-phone-number-btn');

    addBtn.addEventListener('click', openAddPhoneModal);
    closeModal.addEventListener('click', closeAddPhoneModal);
    saveBtn.addEventListener('click', savePhoneNumber);

    document.getElementById('add-phone-modal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeAddPhoneModal();
        }
    });

    // Enter key support
    document.getElementById('phone-number-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            savePhoneNumber();
        }
    });

    document.getElementById('phone-name-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            savePhoneNumber();
        }
    });
}

function openAddPhoneModal() {
    const modal = document.getElementById('add-phone-modal');
    const input = document.getElementById('phone-number-input');

    modal.classList.add('active');
    input.value = '';
    document.getElementById('phone-name-input').value = '';

    // Ensure input is enabled and editable
    input.disabled = false;
    input.readOnly = false;

    // Multiple focus attempts with increasing delays to handle animation
    const focusInput = () => {
        input.focus();
        input.select();
    };

    // Immediate focus
    focusInput();

    // Delayed focus attempts
    setTimeout(focusInput, 50);
    setTimeout(focusInput, 150);
    setTimeout(focusInput, 300);

    // Add click listener to ensure focus on click
    input.addEventListener('click', focusInput, { once: true });
}

function closeAddPhoneModal() {
    document.getElementById('add-phone-modal').classList.remove('active');
}

async function savePhoneNumber() {
    const phoneNumber = document.getElementById('phone-number-input').value.trim();
    const name = document.getElementById('phone-name-input').value.trim();

    if (!phoneNumber) {
        alert('Please enter a phone number');
        return;
    }

    // Basic validation
    if (!/^\d+$/.test(phoneNumber)) {
        alert('Phone number should contain only digits (no + or spaces)');
        return;
    }

    const result = await ipcRenderer.invoke('add-phone-number', phoneNumber, name);

    if (result.success) {
        closeAddPhoneModal();
        loadPhoneNumbers();
        loadStats();
        checkRequirements();
        addActivityLog(`Phone number added: ${phoneNumber}`);
    } else {
        alert('Error: ' + result.error);
    }
}

async function loadPhoneNumbers() {
    const phoneNumbers = await ipcRenderer.invoke('get-phone-numbers');
    const listEl = document.getElementById('phone-numbers-list');

    if (phoneNumbers.length === 0) {
        listEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </div>
                <h3>No phone numbers added yet</h3>
                <p>Click "Add Phone Number" to add target numbers</p>
            </div>
        `;
        return;
    }

    listEl.innerHTML = phoneNumbers.map(phone => {
        const isEnabled = phone.enabled !== false;
        return `
            <div class="phone-number-card ${isEnabled ? '' : 'phone-disabled'}">
                <div class="phone-info">
                    <h3>${phone.name}</h3>
                    <div class="phone-number-row">
                        <p class="phone-number">+${phone.number}</p>
                        ${!isEnabled ? '<span class="phone-status-badge">Paused</span>' : ''}
                    </div>
                </div>
                <div class="phone-actions">
                    <label class="toggle-switch" title="${isEnabled ? 'Disable AI responses' : 'Enable AI responses'}">
                        <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="togglePhoneNumber('${phone.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                    <button class="btn btn-small btn-danger" onclick="removePhoneNumber('${phone.id}')">Remove</button>
                </div>
            </div>
        `;
    }).join('');
}

async function togglePhoneNumber(phoneId, enabled) {
    const result = await ipcRenderer.invoke('toggle-phone-number', phoneId);
    if (result.success) {
        loadPhoneNumbers();
        const status = result.enabled ? 'enabled' : 'paused';
        addActivityLog(`Phone number ${status}`);
    }
}

async function removePhoneNumber(phoneId) {
    if (!confirm('Are you sure you want to remove this phone number?')) {
        return;
    }

    const result = await ipcRenderer.invoke('remove-phone-number', phoneId);
    if (result.success) {
        loadPhoneNumbers();
        loadStats();
        checkRequirements();
        addActivityLog('Phone number removed');
    }
}

// Warmer Tab
function initializeWarmerTab() {
    const startBtn = document.getElementById('start-warming-btn');
    const stopBtn = document.getElementById('stop-warming-btn');

    startBtn.addEventListener('click', startWarming);
    stopBtn.addEventListener('click', stopWarming);
}

async function checkRequirements() {
    const accounts = await ipcRenderer.invoke('get-accounts');
    const phoneNumbers = await ipcRenderer.invoke('get-phone-numbers');
    const config = await ipcRenderer.invoke('get-config');

    const hasAccount = accounts.length > 0 && accounts[0].status === 'ready';
    const hasApiKey = config.apiKey && config.apiKey.length > 0;
    const hasNumbers = phoneNumbers.length > 0;

    document.getElementById('req-account').textContent = hasAccount ? '✅' : '❌';
    document.getElementById('req-api').textContent = hasApiKey ? '✅' : '❌';
    document.getElementById('req-numbers').textContent = hasNumbers ? '✅' : '❌';

    const canStart = hasAccount && hasApiKey && hasNumbers;
    document.getElementById('start-warming-btn').disabled = !canStart;

    return { hasAccount, hasApiKey, hasNumbers, canStart };
}

async function startWarming() {
    const result = await ipcRenderer.invoke('start-warming', {});

    if (result.success) {
        document.getElementById('start-warming-btn').style.display = 'none';
        document.getElementById('stop-warming-btn').style.display = 'inline-block';

        updateWarmingStatus(true);
        warmingMessageCount = 0;

        addActivityLog('AI warming started');
        addWarmingLog('AI warming started - sending initial greetings');
    } else {
        alert('Error: ' + result.error);
    }
}

async function stopWarming() {
    const result = await ipcRenderer.invoke('stop-warming');

    if (result.success) {
        document.getElementById('start-warming-btn').style.display = 'inline-block';
        document.getElementById('stop-warming-btn').style.display = 'none';

        updateWarmingStatus(false);
        addActivityLog('AI warming stopped');
        addWarmingLog('Warming stopped');
    }
}

function updateWarmingStatus(active) {
    const statusText = active ? 'Active' : 'Inactive';
    const statusClass = active ? 'status-active' : 'status-inactive';

    document.getElementById('warmer-status-indicator').innerHTML = `
        <span class="status-badge ${statusClass}">${statusText}</span>
    `;

    document.getElementById('header-status').innerHTML = `
        <span class="status-badge ${statusClass}">${statusText}</span>
    `;
}

// Chat Tab
function initializeChatTab() {
    const loadDemoBtn = document.getElementById('load-demo-messages-btn');
    const clearDemoBtn = document.getElementById('clear-demo-messages-btn');

    loadDemoBtn.addEventListener('click', loadDemoMessages);
    clearDemoBtn.addEventListener('click', clearDemoMessages);
}

let demoMode = false;
let demoMessages = {};

function loadDemoMessages() {
    demoMode = true;

    // Generate realistic demo conversations
    const now = Math.floor(Date.now() / 1000);

    demoMessages = {
        '60123456789': [
            { id: '1', body: 'Hey there! How are you doing today?', timestamp: now - 600, isOwn: true },
            { id: '2', body: 'Hi! Im doing great, thanks for asking', timestamp: now - 550, isOwn: false },
            { id: '3', body: 'Thats awesome! Any plans for the weekend?', timestamp: now - 500, isOwn: true },
            { id: '4', body: 'Yeah, thinking about going hiking. You?', timestamp: now - 450, isOwn: false },
            { id: '5', body: 'Nice! I might just relax at home. Been a busy week', timestamp: now - 400, isOwn: true },
            { id: '6', body: 'I totally get that. Rest is important too!', timestamp: now - 350, isOwn: false },
            { id: '7', body: 'For sure! Hope you have a great hike', timestamp: now - 300, isOwn: true },
        ],
        '60198765432': [
            { id: '8', body: 'Good morning! Hope youre having a great day', timestamp: now - 800, isOwn: true },
            { id: '9', body: 'Good morning! Thanks, you too!', timestamp: now - 750, isOwn: false },
            { id: '10', body: 'Just wanted to check in and see how things are going', timestamp: now - 700, isOwn: true },
            { id: '11', body: 'Thats so thoughtful! Everything is good here', timestamp: now - 650, isOwn: false },
            { id: '12', body: 'Glad to hear that! Let me know if you need anything', timestamp: now - 600, isOwn: true },
        ],
        '60167894321': [
            { id: '13', body: 'Hi! Just wanted to say hello', timestamp: now - 1200, isOwn: true },
            { id: '14', body: 'Hey! Thanks for reaching out', timestamp: now - 1150, isOwn: false },
            { id: '15', body: 'How have you been lately?', timestamp: now - 1100, isOwn: true },
            { id: '16', body: 'Pretty good! Busy but good. How about you?', timestamp: now - 1050, isOwn: false },
            { id: '17', body: 'Same here! Staying productive and positive', timestamp: now - 1000, isOwn: true },
            { id: '18', body: 'Thats the spirit! Keep it up', timestamp: now - 950, isOwn: false },
            { id: '19', body: 'Thanks! You too! Lets catch up soon', timestamp: now - 900, isOwn: true },
            { id: '20', body: 'Definitely! Would love that', timestamp: now - 850, isOwn: false },
        ]
    };

    displaySegmentedMessages(demoMessages);

    // Toggle buttons
    document.getElementById('load-demo-messages-btn').style.display = 'none';
    document.getElementById('clear-demo-messages-btn').style.display = 'inline-block';
}

function clearDemoMessages() {
    demoMode = false;
    demoMessages = {};

    // Reload actual messages
    loadMessages();

    // Toggle buttons
    document.getElementById('load-demo-messages-btn').style.display = 'inline-block';
    document.getElementById('clear-demo-messages-btn').style.display = 'none';
}

async function loadMessages() {
    const messagesByPhone = await ipcRenderer.invoke('get-messages-by-phone');
    displaySegmentedMessages(messagesByPhone);
}

function displaySegmentedMessages(messagesByPhone) {
    const container = document.getElementById('chat-segments-container');

    if (!messagesByPhone || Object.keys(messagesByPhone).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <h3>No conversations yet</h3>
                <p>Conversations will appear here when you start warming</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    for (const [phoneNumber, messages] of Object.entries(messagesByPhone)) {
        if (messages.length === 0) continue;

        const segment = document.createElement('div');
        segment.className = 'chat-segment';
        segment.id = `chat-segment-${phoneNumber}`;

        const header = document.createElement('div');
        header.className = 'chat-segment-header';
        header.innerHTML = `
            <h3>📱 +${phoneNumber}</h3>
            <span class="message-count">${messages.length} messages</span>
        `;

        const chatContainer = document.createElement('div');
        chatContainer.className = 'chat-segment-messages';

        chatContainer.innerHTML = messages.map(msg => {
            const time = new Date(msg.timestamp * 1000).toLocaleTimeString();

            let displayBody = escapeHtml(msg.body || '');
            let mediaIndicator = '';

            // Add media indicators
            if (msg.hasMedia && msg.mediaContext) {
                if (msg.mediaContext.type === 'image') {
                    const desc = msg.mediaContext.description || 'an image';
                    mediaIndicator = `<div class="media-indicator image-indicator">
                        📷 Image: ${escapeHtml(desc)}
                    </div>`;
                } else if (msg.mediaContext.type === 'voice') {
                    const trans = msg.mediaContext.transcription || '[voice message]';
                    mediaIndicator = `<div class="media-indicator voice-indicator">
                        🎤 Voice: "${escapeHtml(trans)}"
                    </div>`;
                    displayBody = ''; // Voice messages don't have separate body
                }
            }

            return `
                <div class="chat-message ${msg.isOwn ? 'message-own' : 'message-received'}">
                    ${mediaIndicator}
                    ${displayBody ? `<div class="message-body">${displayBody}</div>` : ''}
                    <div class="message-time">${time}</div>
                </div>
            `;
        }).join('');

        segment.appendChild(header);
        segment.appendChild(chatContainer);
        container.appendChild(segment);

        // Auto-scroll to bottom of each segment
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Dashboard & Stats
async function loadStats() {
    const stats = await ipcRenderer.invoke('get-stats');
    const accounts = await ipcRenderer.invoke('get-accounts');
    const config = await ipcRenderer.invoke('get-config');

    // Header
    const accountStatus = stats.connectedAccounts > 0 ? 'Connected' : 'Not Connected';
    document.getElementById('header-account').textContent = accountStatus;
    document.getElementById('header-phone-numbers').textContent = stats.totalPhoneNumbers;
    document.getElementById('header-messages').textContent = stats.messagesSentToday;

    // Dashboard
    document.getElementById('dash-account-status').textContent = accountStatus;
    document.getElementById('dash-phone-numbers').textContent = stats.totalPhoneNumbers;
    document.getElementById('dash-messages-today').textContent = stats.messagesSentToday;

    const hasApiKey = config.apiKey && config.apiKey.length > 0;
    const apiStatusText = hasApiKey ? 'Configured' : 'Not Configured';
    const apiStatusClass = hasApiKey ? 'status-active' : 'status-inactive';
    document.getElementById('dash-ai-badge').textContent = apiStatusText;
    document.getElementById('dash-ai-badge').className = `status-badge ${apiStatusClass}`;
    document.getElementById('dash-ai-detail').textContent = hasApiKey ? 'Gemini AI ready' : 'Configure API key in Settings';

    updateWarmingStatus(stats.warmingActive);
}

// Utility Functions
function addActivityLog(message) {
    const activityLog = document.getElementById('activity-log');
    const time = new Date().toLocaleTimeString();

    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    activityItem.innerHTML = `
        <span class="activity-time">${time}</span>
        <span class="activity-message">${message}</span>
    `;

    activityLog.insertBefore(activityItem, activityLog.firstChild);

    while (activityLog.children.length > 20) {
        activityLog.removeChild(activityLog.lastChild);
    }
}

function addWarmingLog(message) {
    const warmingLog = document.getElementById('warming-log');
    const time = new Date().toLocaleTimeString();

    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.innerHTML = `<span class="log-time">${time}</span> ${message}`;

    warmingLog.insertBefore(logItem, warmingLog.firstChild);

    while (warmingLog.children.length > 50) {
        warmingLog.removeChild(warmingLog.lastChild);
    }
}

// IPC Listeners
function setupIpcListeners() {
    console.log('Setting up IPC listeners...');

    // QR Code received
    ipcRenderer.on('qr-code', (event, data) => {
        console.log('QR Code received in renderer:', data.accountId);

        // Get elements
        const qrLoading = document.querySelector('.qr-loading');
        const qrImage = document.getElementById('qr-code-image');
        const qrStatus = document.getElementById('qr-status');
        const qrSection = document.getElementById('qr-code-section');

        // Hide loading, show QR
        if (qrLoading) qrLoading.style.display = 'none';

        if (qrImage && data.qrCode) {
            qrImage.src = data.qrCode;
            qrImage.style.display = 'block';
            qrImage.style.visibility = 'visible';
            qrImage.style.opacity = '1';
        }

        if (qrStatus) qrStatus.textContent = 'Scan the QR code with WhatsApp';
        if (qrSection) qrSection.style.display = 'block';

        // Update current account ID
        currentAccountId = data.accountId;

        console.log('QR code should now be visible');
    });

    // Account ready
    ipcRenderer.on('account-ready', async (event, data) => {
        if (data.accountId === currentAccountId) {
            document.getElementById('qr-status').innerHTML = `
                <div class="success-message">
                    ✓ Successfully connected!<br>
                    Phone: ${data.phoneNumber}
                </div>
            `;

            await ipcRenderer.invoke('update-account', data.accountId, {
                phoneNumber: data.phoneNumber,
                status: 'ready'
            });

            setTimeout(() => {
                closeAddAccountModal();
                loadAccounts();
                loadStats();
                checkRequirements();
                addActivityLog(`WhatsApp account connected: ${data.phoneNumber}`);
            }, 2000);
        }
    });

    // Account status changed
    ipcRenderer.on('account-status-changed', (event, data) => {
        loadAccounts();
        loadStats();
        checkRequirements();
    });

    // New message
    ipcRenderer.on('new-message', (event, data) => {
        loadMessages();
    });

    // Warming message sent
    ipcRenderer.on('warming-message-sent', (event, data) => {
        warmingMessageCount++;
        document.getElementById('warming-messages-sent').textContent = warmingMessageCount;

        const time = new Date(data.timestamp).toLocaleTimeString();
        addWarmingLog(`Sent to ${data.to}: "${data.message}"`);

        // Reload messages to update chat view with new segmented system
        loadMessages();
    });

    // Warming message received
    ipcRenderer.on('warming-message-received', (event, data) => {
        const time = new Date(data.timestamp).toLocaleTimeString();
        addWarmingLog(`Received from ${data.from}: "${data.message}"`);
    });

    // Increment stats
    ipcRenderer.on('increment-stats', async () => {
        await ipcRenderer.invoke('increment-message-count');
        loadStats();
    });

    // Warming error
    ipcRenderer.on('warming-error', (event, data) => {
        addWarmingLog(`Error: ${data.error}`);
        addActivityLog(`Error: ${data.error}`);
    });
}

// Load initial data
async function loadInitialData() {
    await loadConfig();
    await loadAccounts();
    await loadPhoneNumbers();
    await loadStats();
    await checkRequirements();
}

// Auto-refresh
setInterval(() => {
    loadStats();
}, 5000);

setInterval(async () => {
    const status = await ipcRenderer.invoke('get-warming-status');
    if (status.activeConversations) {
        document.getElementById('warming-active-chats').textContent = status.activeConversations.length;
    }
}, 2000);

// Make functions global
window.switchTab = switchTab;
window.removeAccount = removeAccount;
window.removePhoneNumber = removePhoneNumber;
