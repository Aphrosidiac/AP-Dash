// Use the secure electronAPI exposed via preload script
// No direct access to Node.js or Electron APIs in renderer process

// State
let currentAccountId = null;
let warmingMessageCount = 0;
let activeConversations = [];

// Custom dialog functions to replace native alert/confirm/prompt
function showAlert(message, title = 'Alert') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-dialog-modal');
        document.getElementById('dialog-title').textContent = title;
        document.getElementById('dialog-message').textContent = message;
        document.getElementById('dialog-input').style.display = 'none';
        document.getElementById('dialog-cancel-btn').style.display = 'none';
        document.getElementById('dialog-confirm-btn').textContent = 'OK';

        const confirmBtn = document.getElementById('dialog-confirm-btn');
        const closeBtn = document.getElementById('close-dialog-modal');

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.onclick = null;
            closeBtn.onclick = null;
        };

        confirmBtn.onclick = () => { cleanup(); resolve(); };
        closeBtn.onclick = () => { cleanup(); resolve(); };

        modal.classList.add('active');
        confirmBtn.focus();
    });
}

function showConfirm(message, title = 'Confirm') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-dialog-modal');
        document.getElementById('dialog-title').textContent = title;
        document.getElementById('dialog-message').textContent = message;
        document.getElementById('dialog-input').style.display = 'none';
        document.getElementById('dialog-cancel-btn').style.display = 'inline-block';
        document.getElementById('dialog-confirm-btn').textContent = 'OK';

        const confirmBtn = document.getElementById('dialog-confirm-btn');
        const cancelBtn = document.getElementById('dialog-cancel-btn');
        const closeBtn = document.getElementById('close-dialog-modal');

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            closeBtn.onclick = null;
        };

        confirmBtn.onclick = () => { cleanup(); resolve(true); };
        cancelBtn.onclick = () => { cleanup(); resolve(false); };
        closeBtn.onclick = () => { cleanup(); resolve(false); };

        modal.classList.add('active');
        confirmBtn.focus();
    });
}

function showPrompt(message, defaultValue = '', title = 'Input') {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-dialog-modal');
        const input = document.getElementById('dialog-input');

        document.getElementById('dialog-title').textContent = title;
        document.getElementById('dialog-message').textContent = message;
        input.style.display = 'block';
        input.value = defaultValue;
        document.getElementById('dialog-cancel-btn').style.display = 'inline-block';
        document.getElementById('dialog-confirm-btn').textContent = 'OK';

        const confirmBtn = document.getElementById('dialog-confirm-btn');
        const cancelBtn = document.getElementById('dialog-cancel-btn');
        const closeBtn = document.getElementById('close-dialog-modal');

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            closeBtn.onclick = null;
            input.onkeydown = null;
        };

        confirmBtn.onclick = () => { cleanup(); resolve(input.value); };
        cancelBtn.onclick = () => { cleanup(); resolve(null); };
        closeBtn.onclick = () => { cleanup(); resolve(null); };
        input.onkeydown = (e) => { if (e.key === 'Enter') { cleanup(); resolve(input.value); } };

        modal.classList.add('active');
        input.focus();
        input.select();
    });
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeSettings();
    initializeAccountsTab();
    initializePhoneNumbersTab();
    initializeWarmerTab();
    initializeChatTab();
    initializeStickersTab();
    initializeMediaTab();
    initializeBlastingTab();
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
        'stickers': 'Stickers',
        'media': 'Media Library',
        'blasting': 'Message Blasting',
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
    } else if (tabName === 'stickers') {
        loadStickerCategories();
    } else if (tabName === 'media') {
        loadMediaItems();
    } else if (tabName === 'blasting') {
        loadBlastStats();
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
    const saveTypingBtn = document.getElementById('save-typing-btn');

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
    if (saveTypingBtn) {
        saveTypingBtn.addEventListener('click', saveTypingSettings);
    }
}

async function loadConfig() {
    const config = await window.electronAPI.getConfig();
    document.getElementById('api-key-input').value = config.apiKey || '';
    document.getElementById('ai-personality-input').value = config.aiPersonality || '';
    document.getElementById('delay-min-input').value = config.delayMin || 3;
    document.getElementById('delay-max-input').value = config.delayMax || 8;
    document.getElementById('typing-min-input').value = config.typingMin || 2;
    document.getElementById('typing-max-input').value = config.typingMax || 5;

    if (config.apiKey) {
        showApiStatus('API key configured', 'success');
    }

    // Load sticker settings
    await loadStickerSettings();

    // Load media settings
    await loadMediaSettings();
}

async function saveApiKey() {
    const apiKey = document.getElementById('api-key-input').value.trim();

    if (!apiKey) {
        showApiStatus('Please enter an API key', 'error');
        return;
    }

    const result = await window.electronAPI.saveConfig({ apiKey });

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

    // Security: Cannot test API key directly from renderer process
    // The API key will be validated when you start warming
    showApiStatus('API key will be validated when warming starts. Save the key to continue.', 'info');
}

async function saveAIPersonality() {
    const aiPersonality = document.getElementById('ai-personality-input').value.trim();

    if (!aiPersonality) {
        showAIPersonalityStatus('Please enter an AI personality', 'error');
        return;
    }

    const config = await window.electronAPI.getConfig();
    config.aiPersonality = aiPersonality;

    const result = await window.electronAPI.saveConfig(config);

    if (result.success) {
        showAIPersonalityStatus('AI personality saved successfully!', 'success');
        addActivityLog('AI personality updated');
    } else {
        showAIPersonalityStatus('Error saving AI personality', 'error');
    }
}

async function resetAIPersonality() {
    const defaultPersonality = `You are a real human casually chatting on WhatsApp.
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
- Occasionally respond with a brief acknowledgment instead of a full reply (e.g., "haha yeah", "true", "makes sense") if it fits the conversation.`;

    document.getElementById('ai-personality-input').value = defaultPersonality;

    const config = await window.electronAPI.getConfig();
    config.aiPersonality = defaultPersonality;

    const result = await window.electronAPI.saveConfig(config);

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

    const config = await window.electronAPI.getConfig();
    config.delayMin = delayMin;
    config.delayMax = delayMax;

    const result = await window.electronAPI.saveConfig(config);

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

async function saveTypingSettings() {
    const typingMin = parseInt(document.getElementById('typing-min-input').value) || 2;
    const typingMax = parseInt(document.getElementById('typing-max-input').value) || 5;
    const config = await window.electronAPI.getConfig();
    const delayMin = config.delayMin || 3;
    const delayMax = config.delayMax || 8;

    // Validation
    if (typingMin < 1) {
        showTypingStatus('Minimum typing duration must be at least 1 second', 'error');
        return;
    }

    if (typingMax < typingMin) {
        showTypingStatus('Maximum typing duration must be greater than or equal to minimum', 'error');
        return;
    }

    // CRITICAL: Typing duration cannot exceed response delay minimum
    if (typingMax > delayMin) {
        showTypingStatus(`Maximum typing duration (${typingMax}s) cannot exceed minimum response delay (${delayMin}s)`, 'error');
        return;
    }

    config.typingMin = typingMin;
    config.typingMax = typingMax;

    const result = await window.electronAPI.saveConfig(config);

    if (result.success) {
        showTypingStatus(`Typing duration saved: ${typingMin}s - ${typingMax}s`, 'success');
        addActivityLog(`Typing duration updated: ${typingMin}s - ${typingMax}s`);
    } else {
        showTypingStatus('Error saving typing settings', 'error');
    }
}

function showTypingStatus(message, type) {
    const statusEl = document.getElementById('typing-status');
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
    const hasAccount = await window.electronAPI.hasAccount();

    if (hasAccount) {
        await showAlert('Only one warming account is allowed. Please remove the existing account first.', 'Account Limit');
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
    const modal = document.getElementById('add-account-modal');
    const input = document.getElementById('account-name');

    modal.classList.remove('active');
    currentAccountId = null;

    // Reset form to initial state
    document.getElementById('account-form').style.display = 'block';
    document.getElementById('qr-code-section').style.display = 'none';
    input.value = '';
    input.disabled = false;
    input.readOnly = false;
}

async function generateQrCode() {
    const accountName = document.getElementById('account-name').value.trim();

    // Security: Validate account name
    if (!accountName) {
        await showAlert('Please enter an account name', 'Validation');
        document.getElementById('account-name').focus();
        return;
    }

    // Security: Validate length
    if (accountName.length < 3 || accountName.length > 50) {
        await showAlert('Account name must be between 3-50 characters', 'Validation');
        document.getElementById('account-name').focus();
        return;
    }

    // Security: Only allow alphanumeric, spaces, and basic punctuation
    if (!/^[a-zA-Z0-9\s\-_.]+$/.test(accountName)) {
        await showAlert('Account name can only contain letters, numbers, spaces, and basic punctuation', 'Validation');
        document.getElementById('account-name').focus();
        return;
    }

    document.getElementById('account-form').style.display = 'none';
    document.getElementById('qr-code-section').style.display = 'block';
    document.querySelector('.qr-loading').style.display = 'flex';
    document.getElementById('qr-code-image').style.display = 'none';
    document.getElementById('qr-status').textContent = 'Initializing...';

    const result = await window.electronAPI.addAccount(accountName);

    if (result.success) {
        currentAccountId = result.account.id;
        document.getElementById('qr-status').textContent = 'Waiting for QR code...';
    } else {
        document.getElementById('qr-status').textContent = `Error: ${result.error}`;
    }
}

async function loadAccounts() {
    const accounts = await window.electronAPI.getAccounts();
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
                        <h2>${escapeHtml(account.name)}</h2>
                        <p class="account-phone-number">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                            +${escapeHtml(account.phoneNumber || 'Connecting...')}</p>
                    </div>
                    <div class="account-profile-status">
                        <span class="status-badge status-${account.status === 'ready' ? 'active' : 'inactive'}">
                            ${statusIcon} ${escapeHtml(getStatusText(account.status))}
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
                    <button class="btn btn-danger btn-remove-account" onclick="removeAccount('${sanitizeAttribute(account.id)}')">
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
    const confirmed = await showConfirm('Are you sure you want to remove this account?', 'Remove Account');
    if (!confirmed) {
        return;
    }

    const result = await window.electronAPI.removeAccount(accountId);
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
    const modal = document.getElementById('add-phone-modal');
    const phoneInput = document.getElementById('phone-number-input');
    const nameInput = document.getElementById('phone-name-input');

    modal.classList.remove('active');

    // Reset form to initial state
    phoneInput.value = '';
    nameInput.value = '';
    phoneInput.disabled = false;
    phoneInput.readOnly = false;
    nameInput.disabled = false;
    nameInput.readOnly = false;
}

async function savePhoneNumber() {
    const phoneNumber = document.getElementById('phone-number-input').value.trim();
    const name = document.getElementById('phone-name-input').value.trim();

    // Security: Validate phone number
    if (!phoneNumber) {
        await showAlert('Please enter a phone number', 'Validation');
        return;
    }

    // Security: Only allow digits
    if (!/^\d+$/.test(phoneNumber)) {
        await showAlert('Phone number should contain only digits (no + or spaces)', 'Validation');
        return;
    }

    // Security: Validate length (between 8-15 digits for international numbers)
    if (phoneNumber.length < 8 || phoneNumber.length > 15) {
        await showAlert('Phone number must be between 8-15 digits', 'Validation');
        return;
    }

    // Security: Validate name if provided
    if (name) {
        if (name.length > 50) {
            await showAlert('Name must be less than 50 characters', 'Validation');
            return;
        }
        // Only allow alphanumeric, spaces, and basic punctuation
        if (!/^[a-zA-Z0-9\s\-_.]+$/.test(name)) {
            await showAlert('Name can only contain letters, numbers, spaces, and basic punctuation', 'Validation');
            return;
        }
    }

    const result = await window.electronAPI.addPhoneNumber(phoneNumber, name);

    if (result.success) {
        closeAddPhoneModal();
        loadPhoneNumbers();
        loadStats();
        checkRequirements();
        addActivityLog(`Phone number added: ${phoneNumber}`);
    } else {
        await showAlert('Error: ' + result.error, 'Error');
    }
}

async function loadPhoneNumbers() {
    const phoneNumbers = await window.electronAPI.getPhoneNumbers();
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
                    <h3>${escapeHtml(phone.name)}</h3>
                    <div class="phone-number-row">
                        <p class="phone-number">+${escapeHtml(phone.number)}</p>
                        ${!isEnabled ? '<span class="phone-status-badge">Paused</span>' : ''}
                    </div>
                </div>
                <div class="phone-actions">
                    <label class="toggle-switch" title="${sanitizeAttribute(isEnabled ? 'Disable AI responses' : 'Enable AI responses')}">
                        <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="togglePhoneNumber('${sanitizeAttribute(phone.id)}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                    <button class="btn btn-small btn-danger" onclick="removePhoneNumber('${sanitizeAttribute(phone.id)}')">Remove</button>
                </div>
            </div>
        `;
    }).join('');
}

async function togglePhoneNumber(phoneId, enabled) {
    const result = await window.electronAPI.togglePhoneNumber(phoneId);
    if (result.success) {
        loadPhoneNumbers();
        const status = result.enabled ? 'enabled' : 'paused';
        addActivityLog(`Phone number ${status}`);
    }
}

async function removePhoneNumber(phoneId) {
    const confirmed = await showConfirm('Are you sure you want to remove this phone number?', 'Remove Phone Number');
    if (!confirmed) {
        return;
    }

    const result = await window.electronAPI.removePhoneNumber(phoneId);
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
    const accounts = await window.electronAPI.getAccounts();
    const phoneNumbers = await window.electronAPI.getPhoneNumbers();
    const config = await window.electronAPI.getConfig();

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
    const result = await window.electronAPI.startWarming({});

    if (result.success) {
        document.getElementById('start-warming-btn').style.display = 'none';
        document.getElementById('stop-warming-btn').style.display = 'inline-block';

        updateWarmingStatus(true);
        warmingMessageCount = 0;

        addActivityLog('AI warming started');
        addWarmingLog('AI warming started - sending initial greetings');
    } else {
        await showAlert('Error: ' + result.error, 'Warming Error');
    }
}

async function stopWarming() {
    const result = await window.electronAPI.stopWarming();

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

    // Create fake targeted numbers for demo mode
    const demoTargetedNumbers = [
        { number: '60123456789' },
        { number: '60198765432' },
        { number: '60167894321' }
    ];

    displaySegmentedMessages(demoMessages, demoTargetedNumbers);

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
    const messagesByPhone = await window.electronAPI.getMessagesByPhone();
    const targetedNumbers = await window.electronAPI.getPhoneNumbers();
    displaySegmentedMessages(messagesByPhone, targetedNumbers);
}

function displaySegmentedMessages(messagesByPhone, targetedNumbers = []) {
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

    // Create a set of targeted phone numbers for quick lookup
    const targetedPhoneSet = new Set(targetedNumbers.map(p => p.number));

    container.innerHTML = '';

    for (const [phoneNumber, messages] of Object.entries(messagesByPhone)) {
        // Skip if no messages
        if (messages.length === 0) continue;

        // Skip status broadcasts (usually contains "status" or "@broadcast")
        if (phoneNumber.includes('status') || phoneNumber.includes('broadcast')) {
            continue;
        }

        // Skip if not in targeted phone numbers list
        if (!targetedPhoneSet.has(phoneNumber)) {
            continue;
        }

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

    // If no targeted conversations were found, show empty state
    if (container.children.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <h3>No conversations with targeted numbers</h3>
                <p>Conversations will appear here when you message your targeted phone numbers</p>
            </div>
        `;
    }
}

// Security: Comprehensive HTML escaping to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// Security: Sanitize attributes to prevent XSS in HTML attributes
function sanitizeAttribute(value) {
    if (!value) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\//g, '&#x2F;');
}

// Dashboard & Stats
async function loadStats() {
    const stats = await window.electronAPI.getStats();
    const accounts = await window.electronAPI.getAccounts();
    const config = await window.electronAPI.getConfig();

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
    window.electronAPI.onQrCode((data) => {
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
    window.electronAPI.onAccountReady(async (data) => {
        if (data.accountId === currentAccountId) {
            document.getElementById('qr-status').innerHTML = `
                <div class="success-message">
                    ✓ Successfully connected!<br>
                    Phone: ${data.phoneNumber}
                </div>
            `;

            await window.electronAPI.updateAccount(data.accountId, {
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
    window.electronAPI.onAccountStatusChanged((data) => {
        loadAccounts();
        loadStats();
        checkRequirements();
    });

    // New message
    window.electronAPI.onNewMessage((data) => {
        loadMessages();
    });

    // Warming message sent
    window.electronAPI.onWarmingMessageSent((data) => {
        warmingMessageCount++;
        document.getElementById('warming-messages-sent').textContent = warmingMessageCount;

        const time = new Date(data.timestamp).toLocaleTimeString();
        addWarmingLog(`Sent to ${data.to}: "${data.message}"`);

        // Reload messages to update chat view with new segmented system
        loadMessages();
    });

    // Warming message received
    window.electronAPI.onWarmingMessageReceived((data) => {
        const time = new Date(data.timestamp).toLocaleTimeString();
        addWarmingLog(`Received from ${data.from}: "${data.message}"`);
    });

    // Increment stats
    window.electronAPI.onIncrementStats(async () => {
        await window.electronAPI.incrementMessageCount();
        loadStats();
    });

    // Warming error
    window.electronAPI.onWarmingError((data) => {
        addWarmingLog(`Error: ${data.error}`);
        addActivityLog(`Error: ${data.error}`);
    });

    // Warming stopped (disconnection or other reason)
    window.electronAPI.onWarmingStopped((data) => {
        document.getElementById('start-warming-btn').style.display = 'inline-block';
        document.getElementById('stop-warming-btn').style.display = 'none';

        updateWarmingStatus(false);
        addWarmingLog(`Warming stopped: ${data.message}`);
        addActivityLog(`Warming stopped: ${data.message}`);
    });

    // Blast progress
    window.electronAPI.onBlastProgress((progress) => {
        const sentCount = document.getElementById('blast-sent-count');
        const progressPercent = document.getElementById('blast-progress');
        const progressBar = document.getElementById('blast-progress-bar');

        if (sentCount) sentCount.textContent = progress.sent;
        if (progressPercent) {
            const percent = Math.round((progress.current / progress.total) * 100);
            progressPercent.textContent = `${percent}%`;
        }
        if (progressBar) {
            const percent = (progress.current / progress.total) * 100;
            progressBar.style.width = `${percent}%`;
        }

        // Show current status
        if (progress.error) {
            showBlastStatus(`Failed to send to +${progress.phoneNumber}: ${progress.error}`, 'warning');
        } else {
            showBlastStatus(`Sending to +${progress.phoneNumber}... (${progress.current}/${progress.total})`, 'info');
        }
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
    const status = await window.electronAPI.getWarmingStatus();
    if (status.activeConversations) {
        document.getElementById('warming-active-chats').textContent = status.activeConversations.length;
    }
}, 2000);

// Sticker Management

function initializeStickersTab() {
    const uploadBtn = document.getElementById('upload-sticker-btn');
    const closeModal = document.getElementById('close-sticker-modal');
    const confirmUploadBtn = document.getElementById('confirm-upload-sticker-btn');
    const fileInput = document.getElementById('sticker-file-input');

    if (uploadBtn) {
        uploadBtn.addEventListener('click', openUploadStickerModal);
    }
    if (closeModal) {
        closeModal.addEventListener('click', closeUploadStickerModal);
    }
    if (confirmUploadBtn) {
        confirmUploadBtn.addEventListener('click', uploadSticker);
    }
    if (fileInput) {
        fileInput.addEventListener('change', previewSticker);
    }

    const modal = document.getElementById('upload-sticker-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                closeUploadStickerModal();
            }
        });
    }

    // Initialize sticker settings
    const frequencyInput = document.getElementById('sticker-frequency-input');
    const frequencyValue = document.getElementById('sticker-frequency-value');

    if (frequencyInput && frequencyValue) {
        frequencyInput.addEventListener('input', (e) => {
            frequencyValue.textContent = `${e.target.value}%`;
        });
    }

    const saveStickerSettingsBtn = document.getElementById('save-sticker-settings-btn');
    if (saveStickerSettingsBtn) {
        saveStickerSettingsBtn.addEventListener('click', saveStickerSettings);
    }
}

function openUploadStickerModal() {
    document.getElementById('upload-sticker-modal').classList.add('active');
    document.getElementById('sticker-file-input').value = '';
    document.getElementById('sticker-preview').innerHTML = '';
}

function closeUploadStickerModal() {
    document.getElementById('upload-sticker-modal').classList.remove('active');
}

function previewSticker(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('sticker-preview');
        preview.innerHTML = `<img src="${e.target.result}" alt="Sticker Preview" style="max-width: 200px; max-height: 200px;">`;
    };
    reader.readAsDataURL(file);
}

async function uploadSticker() {
    const fileInput = document.getElementById('sticker-file-input');
    const category = document.getElementById('sticker-category-select').value;

    if (!fileInput.files[0]) {
        await showAlert('Please select a file', 'Validation');
        return;
    }

    const file = fileInput.files[0];

    // Validate file type
    if (!file.type.includes('webp') && !file.name.endsWith('.webp')) {
        await showAlert('Only WebP format is supported', 'Invalid Format');
        return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Data = e.target.result.split(',')[1];

        const result = await window.electronAPI.uploadSticker({
            category: category,
            fileName: file.name,
            fileData: base64Data
        });

        if (result.success) {
            closeUploadStickerModal();
            loadStickerCategories();
            addActivityLog(`Sticker uploaded to ${category} category`);
        } else {
            await showAlert('Error uploading sticker: ' + result.error, 'Upload Error');
        }
    };

    reader.readAsDataURL(file);
}

async function loadStickerCategories() {
    const categories = await window.electronAPI.getStickerCategories();
    const container = document.getElementById('sticker-categories-container');

    if (categories.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📎</div>
                <h3>No stickers uploaded yet</h3>
                <p>Click "Upload Sticker" to add stickers to your collection</p>
            </div>
        `;
        return;
    }

    let html = '';
    for (const category of categories) {
        let stickersHtml = '';
        for (const sticker of category.stickers) {
            const stickerData = await getStickerPreview(category.name, sticker);
            stickersHtml += `
                <div class="sticker-item">
                    <img src="data:image/webp;base64,${stickerData}"
                         alt="${sanitizeAttribute(sticker)}"
                         class="sticker-thumbnail">
                    <button class="sticker-delete-btn" onclick="deleteSticker('${sanitizeAttribute(category.name)}', '${sanitizeAttribute(sticker)}')">×</button>
                </div>
            `;
        }

        html += `
            <div class="sticker-category-card">
                <div class="category-header">
                    <h3>${category.name.charAt(0).toUpperCase() + category.name.slice(1)}</h3>
                    <span class="category-count">${category.count} stickers</span>
                </div>
                <div class="sticker-grid">
                    ${stickersHtml}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

async function getStickerPreview(category, fileName) {
    const result = await window.electronAPI.getSticker({
        category: category,
        fileName: fileName
    });

    return result.success ? result.data : '';
}

async function deleteSticker(category, fileName) {
    const confirmed = await showConfirm(`Delete sticker "${fileName}" from ${category}?`, 'Delete Sticker');
    if (!confirmed) {
        return;
    }

    const result = await window.electronAPI.deleteSticker({
        category: category,
        fileName: fileName
    });

    if (result.success) {
        loadStickerCategories();
        addActivityLog(`Sticker deleted from ${category}`);
    } else {
        await showAlert('Error deleting sticker: ' + result.error, 'Delete Error');
    }
}

// Sticker Settings

async function loadStickerSettings() {
    const config = await window.electronAPI.getConfig();
    const settings = config.stickerSettings || {
        enabled: true,
        frequency: 0.12,
        fallbackToText: true
    };

    const enabledToggle = document.getElementById('sticker-enabled-toggle');
    const frequencyInput = document.getElementById('sticker-frequency-input');
    const frequencyValue = document.getElementById('sticker-frequency-value');
    const fallbackToggle = document.getElementById('sticker-fallback-toggle');

    if (enabledToggle) enabledToggle.checked = settings.enabled;
    if (frequencyInput) frequencyInput.value = settings.frequency * 100;
    if (frequencyValue) frequencyValue.textContent = `${Math.round(settings.frequency * 100)}%`;
    if (fallbackToggle) fallbackToggle.checked = settings.fallbackToText;
}

async function saveStickerSettings() {
    const enabled = document.getElementById('sticker-enabled-toggle').checked;
    const frequency = parseInt(document.getElementById('sticker-frequency-input').value) / 100;
    const fallbackToText = document.getElementById('sticker-fallback-toggle').checked;

    const config = await window.electronAPI.getConfig();
    config.stickerSettings = {
        enabled: enabled,
        frequency: frequency,
        fallbackToText: fallbackToText,
        categories: ['funny', 'love', 'sad', 'excited', 'thumbs_up', 'thinking', 'wow', 'casual']
    };

    const result = await window.electronAPI.saveConfig(config);

    if (result.success) {
        showStickerStatus('Sticker settings saved successfully!', 'success');
        addActivityLog('Sticker settings updated');
    } else {
        showStickerStatus('Error saving sticker settings', 'error');
    }
}

function showStickerStatus(message, type) {
    const statusEl = document.getElementById('sticker-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = 'api-status ' + type;
    }
}

// Media Management

function initializeMediaTab() {
    const uploadBtn = document.getElementById('upload-media-btn');
    const closeModal = document.getElementById('close-media-modal');
    const confirmUploadBtn = document.getElementById('confirm-upload-media-btn');
    const fileInput = document.getElementById('media-file-input');

    if (uploadBtn) {
        uploadBtn.addEventListener('click', openUploadMediaModal);
    }
    if (closeModal) {
        closeModal.addEventListener('click', closeUploadMediaModal);
    }
    if (confirmUploadBtn) {
        confirmUploadBtn.addEventListener('click', uploadMedia);
    }
    if (fileInput) {
        fileInput.addEventListener('change', previewMedia);
    }

    const modal = document.getElementById('upload-media-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                closeUploadMediaModal();
            }
        });
    }

    // Initialize media settings
    const frequencyInput = document.getElementById('media-frequency-input');
    const frequencyValue = document.getElementById('media-frequency-value');

    if (frequencyInput && frequencyValue) {
        frequencyInput.addEventListener('input', (e) => {
            frequencyValue.textContent = `${e.target.value}%`;
        });
    }

    const saveMediaSettingsBtn = document.getElementById('save-media-settings-btn');
    if (saveMediaSettingsBtn) {
        saveMediaSettingsBtn.addEventListener('click', saveMediaSettings);
    }
}

function openUploadMediaModal() {
    document.getElementById('upload-media-modal').classList.add('active');
    document.getElementById('media-file-input').value = '';
    document.getElementById('media-context-input').value = '';
    document.getElementById('media-preview').innerHTML = '';
    document.getElementById('upload-media-error').textContent = '';
}

function closeUploadMediaModal() {
    document.getElementById('upload-media-modal').classList.remove('active');
}

function previewMedia(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        document.getElementById('upload-media-error').textContent = 'Only image files are allowed';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('media-preview');
        preview.innerHTML = `<img src="${e.target.result}" alt="Media Preview" style="max-width: 300px; max-height: 300px; border-radius: 8px;">`;
    };
    reader.readAsDataURL(file);
}

async function uploadMedia() {
    const fileInput = document.getElementById('media-file-input');
    const context = document.getElementById('media-context-input').value.trim();
    const errorEl = document.getElementById('upload-media-error');

    // Clear previous errors
    errorEl.textContent = '';

    // CRITICAL: Validate context
    if (!context || context.length === 0) {
        errorEl.textContent = 'Context/description is required!';
        return;
    }

    if (context.length < 10) {
        errorEl.textContent = 'Please provide more detail (minimum 10 characters)';
        return;
    }

    if (!fileInput.files[0]) {
        errorEl.textContent = 'Please select an image file';
        return;
    }

    const file = fileInput.files[0];

    // Validate file type
    if (!file.type.startsWith('image/')) {
        errorEl.textContent = 'Only image files (JPG, PNG) are allowed';
        return;
    }

    // Validate file format
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
        errorEl.textContent = 'Only JPG and PNG formats are supported';
        return;
    }

    // Validate file size (5MB max)
    if (file.size > 5242880) {
        errorEl.textContent = 'File size must be less than 5MB';
        return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Data = e.target.result.split(',')[1];

        const result = await window.electronAPI.uploadMedia({
            fileName: file.name,
            fileData: base64Data,
            context: context,
            mimeType: file.type
        });

        if (result.success) {
            closeUploadMediaModal();
            loadMediaItems();
            addActivityLog(`Media uploaded: ${file.name}`);
        } else {
            errorEl.textContent = 'Error: ' + result.error;
        }
    };

    reader.readAsDataURL(file);
}

async function loadMediaItems() {
    const mediaItems = await window.electronAPI.getMediaItems();
    const container = document.getElementById('media-items-container');

    if (mediaItems.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📸</div>
                <h3>No media uploaded yet</h3>
                <p>Click "Upload Media" to add images with context descriptions</p>
            </div>
        `;
        return;
    }

    let html = '';
    for (const item of mediaItems) {
        const previewData = await getMediaPreview(item.id);
        const uploadDate = new Date(item.uploadedAt).toLocaleDateString();
        const fileSize = (item.fileSize / 1024).toFixed(1);

        html += `
            <div class="media-item-card">
                <img src="data:${sanitizeAttribute(item.mimeType)};base64,${previewData}"
                     alt="${sanitizeAttribute(item.context)}"
                     class="media-item-image">
                <div class="media-item-info">
                    <p class="media-item-context">${escapeHtml(item.context)}</p>
                    <div class="media-item-metadata">
                        <span>📅 ${escapeHtml(uploadDate)}</span>
                        <span>💾 ${escapeHtml(fileSize)} KB</span>
                    </div>
                </div>
                <div class="media-item-actions">
                    <button class="btn-icon btn-edit" onclick="editMediaContext('${sanitizeAttribute(item.id)}')" title="Edit context">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon btn-delete" onclick="deleteMedia('${sanitizeAttribute(item.id)}')" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

async function getMediaPreview(mediaId) {
    const result = await window.electronAPI.getMediaFile({ mediaId: mediaId });
    return result.success ? result.data : '';
}

async function editMediaContext(mediaId) {
    const mediaItems = await window.electronAPI.getMediaItems();
    const item = mediaItems.find(m => m.id === mediaId);

    if (!item) {
        await showAlert('Media item not found', 'Error');
        return;
    }

    const newContext = await showPrompt('Edit context/description (minimum 10 characters):', item.context, 'Edit Context');

    if (newContext === null) {
        return; // User cancelled
    }

    // Validate context
    if (!newContext || newContext.trim().length === 0) {
        await showAlert('Context cannot be empty!', 'Validation');
        return;
    }

    if (newContext.trim().length < 10) {
        await showAlert('Please provide more detail (minimum 10 characters)', 'Validation');
        return;
    }

    const result = await window.electronAPI.updateMediaContext({
        mediaId: mediaId,
        context: newContext.trim()
    });

    if (result.success) {
        loadMediaItems();
        addActivityLog('Media context updated');
    } else {
        await showAlert('Error updating context: ' + result.error, 'Error');
    }
}

async function deleteMedia(mediaId) {
    const confirmed = await showConfirm('Are you sure you want to delete this media item?', 'Delete Media');
    if (!confirmed) {
        return;
    }

    const result = await window.electronAPI.deleteMedia({ mediaId: mediaId });

    if (result.success) {
        loadMediaItems();
        addActivityLog('Media deleted');
    } else {
        await showAlert('Error deleting media: ' + result.error, 'Delete Error');
    }
}

// Media Settings

async function loadMediaSettings() {
    const config = await window.electronAPI.getConfig();
    const settings = config.mediaSettings || {
        enabled: true,
        frequency: 0.10,
        maxFileSize: 5242880,
        allowedFormats: ['image/jpeg', 'image/png', 'image/jpg'],
        requireContext: true
    };

    const enabledToggle = document.getElementById('media-enabled-toggle');
    const frequencyInput = document.getElementById('media-frequency-input');
    const frequencyValue = document.getElementById('media-frequency-value');

    if (enabledToggle) enabledToggle.checked = settings.enabled;
    if (frequencyInput) frequencyInput.value = settings.frequency * 100;
    if (frequencyValue) frequencyValue.textContent = `${Math.round(settings.frequency * 100)}%`;
}

async function saveMediaSettings() {
    const enabled = document.getElementById('media-enabled-toggle').checked;
    const frequency = parseInt(document.getElementById('media-frequency-input').value) / 100;

    const config = await window.electronAPI.getConfig();
    config.mediaSettings = {
        enabled: enabled,
        frequency: frequency,
        maxFileSize: 5242880,
        allowedFormats: ['image/jpeg', 'image/png', 'image/jpg'],
        requireContext: true
    };

    const result = await window.electronAPI.saveConfig(config);

    if (result.success) {
        showMediaStatus('Media settings saved successfully!', 'success');
        addActivityLog('Media settings updated');
    } else {
        showMediaStatus('Error saving media settings', 'error');
    }
}

function showMediaStatus(message, type) {
    const statusEl = document.getElementById('media-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = 'api-status ' + type;
    }
}

// Blasting Management

let blastImageData = null;
let isBlasting = false;

function initializeBlastingTab() {
    const imageInput = document.getElementById('blast-image-input');
    const messageInput = document.getElementById('blast-message-input');
    const previewBtn = document.getElementById('preview-blast-btn');
    const resetBtn = document.getElementById('reset-blast-btn');
    const startBlastBtn = document.getElementById('start-blast-btn');

    if (imageInput) {
        imageInput.addEventListener('change', handleBlastImageUpload);
    }

    if (messageInput) {
        messageInput.addEventListener('input', updateCharCount);
    }

    if (previewBtn) {
        previewBtn.addEventListener('click', previewBlast);
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', resetBlast);
    }

    if (startBlastBtn) {
        startBlastBtn.addEventListener('click', startBlast);
    }
}

async function handleBlastImageUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        blastImageData = null;
        document.getElementById('blast-image-preview').innerHTML = '';
        document.getElementById('blast-file-name').textContent = 'Choose an image (JPG/PNG, max 5MB)';
        return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
        await showAlert('Only JPG and PNG formats are supported', 'Invalid Format');
        event.target.value = '';
        return;
    }

    // Validate file size (5MB max)
    if (file.size > 5242880) {
        await showAlert('File size must be less than 5MB', 'File Too Large');
        event.target.value = '';
        return;
    }

    // Update file name display
    document.getElementById('blast-file-name').textContent = file.name;

    // Read and preview image
    const reader = new FileReader();
    reader.onload = (e) => {
        const base64Data = e.target.result.split(',')[1];
        blastImageData = {
            fileName: file.name,
            mimeType: file.type,
            base64Data: base64Data
        };

        // Show preview
        const preview = document.getElementById('blast-image-preview');
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin-top: 12px;">`;
    };
    reader.readAsDataURL(file);
}

function updateCharCount() {
    const messageInput = document.getElementById('blast-message-input');
    const charCount = document.getElementById('blast-char-count');
    charCount.textContent = messageInput.value.length;
}

async function previewBlast() {
    const message = document.getElementById('blast-message-input').value.trim();

    if (!message) {
        await showAlert('Please enter a message', 'Validation');
        return;
    }

    const previewSection = document.getElementById('blast-preview-section');
    const previewMessage = document.getElementById('blast-preview-message');
    const previewImage = document.getElementById('blast-preview-image');

    // Show preview
    previewSection.style.display = 'block';
    previewMessage.textContent = message;

    if (blastImageData) {
        previewImage.innerHTML = `<img src="data:${blastImageData.mimeType};base64,${blastImageData.base64Data}" alt="Preview" style="max-width: 100%; max-height: 200px; border-radius: 8px; margin-bottom: 12px;">`;
    } else {
        previewImage.innerHTML = '';
    }

    // Scroll to preview
    previewSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetBlast() {
    // Clear message input
    document.getElementById('blast-message-input').value = '';

    // Clear image input
    document.getElementById('blast-image-input').value = '';

    // Clear image preview
    document.getElementById('blast-image-preview').innerHTML = '';

    // Reset file name label
    document.getElementById('blast-file-name').textContent = 'Choose an image (JPG/PNG, max 5MB)';

    // Hide preview section
    document.getElementById('blast-preview-section').style.display = 'none';

    // Reset character count
    document.getElementById('blast-char-count').textContent = '0';

    // Clear blast image data
    blastImageData = null;

    // Clear status message
    const statusEl = document.getElementById('blast-status');
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.className = 'blast-status';
    }
}

async function startBlast() {
    if (isBlasting) {
        await showAlert('A blast is already in progress', 'Blast In Progress');
        return;
    }

    const message = document.getElementById('blast-message-input').value.trim();

    if (!message) {
        await showAlert('Please enter a message', 'Validation');
        return;
    }

    // Confirm blast
    const stats = await window.electronAPI.getBlastStats();
    if (!stats.success) {
        showBlastStatus('Error: ' + stats.error, 'error');
        return;
    }

    const confirmMsg = `Send this message to ${stats.totalRecipients} recipient(s)?\n\nEstimated time: ${Math.ceil(stats.estimatedTime / 60)} minute(s)\n\nThis action cannot be undone.`;
    const confirmed = await showConfirm(confirmMsg, 'Confirm Blast');
    if (!confirmed) {
        return;
    }

    isBlasting = true;

    // Disable button and show progress
    const startBtn = document.getElementById('start-blast-btn');
    startBtn.disabled = true;
    startBtn.textContent = 'Blasting...';

    // Show progress bar
    document.getElementById('blast-progress-container').style.display = 'block';
    document.getElementById('blast-sent-count').textContent = '0';
    document.getElementById('blast-progress').textContent = '0%';
    document.getElementById('blast-progress-bar').style.width = '0%';

    showBlastStatus('Starting blast...', 'info');

    try {
        const result = await window.electronAPI.startBlast({
            message: message,
            imageData: blastImageData
        });

        if (result.success) {
            const results = result.results;
            showBlastStatus(
                `Blast completed! Sent: ${results.sent}, Failed: ${results.failed}`,
                results.failed === 0 ? 'success' : 'warning'
            );

            // Add to activity log
            addActivityLog(`Blast completed: ${results.sent} sent, ${results.failed} failed`);

            // Clear form after successful blast
            document.getElementById('blast-message-input').value = '';
            document.getElementById('blast-image-input').value = '';
            document.getElementById('blast-image-preview').innerHTML = '';
            document.getElementById('blast-file-name').textContent = 'Choose an image (JPG/PNG, max 5MB)';
            document.getElementById('blast-preview-section').style.display = 'none';
            document.getElementById('blast-char-count').textContent = '0';
            blastImageData = null;
        } else {
            showBlastStatus('Error: ' + result.error, 'error');
        }
    } catch (error) {
        showBlastStatus('Error: ' + error.message, 'error');
    } finally {
        isBlasting = false;
        startBtn.disabled = false;
        startBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                <path d="M21 3v5h-5"></path>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                <path d="M8 16H3v5"></path>
            </svg>
            Start Blast
        `;

        // Hide progress bar after a delay
        setTimeout(() => {
            document.getElementById('blast-progress-container').style.display = 'none';
        }, 3000);
    }
}

async function loadBlastStats() {
    try {
        const stats = await window.electronAPI.getBlastStats();
        if (stats.success) {
            document.getElementById('blast-total-recipients').textContent = stats.totalRecipients;
            document.getElementById('blast-est-time').textContent = `${Math.ceil(stats.estimatedTime / 60)}m`;
        }
    } catch (error) {
        console.error('Error loading blast stats:', error);
    }
}

function showBlastStatus(message, type) {
    const statusEl = document.getElementById('blast-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = 'blast-status ' + type;

        // Auto-hide success messages after 5 seconds
        if (type === 'success') {
            setTimeout(() => {
                statusEl.textContent = '';
                statusEl.className = 'blast-status';
            }, 5000);
        }
    }
}

// Make functions global
window.switchTab = switchTab;
window.removeAccount = removeAccount;
window.removePhoneNumber = removePhoneNumber;
window.deleteSticker = deleteSticker;
window.editMediaContext = editMediaContext;
window.deleteMedia = deleteMedia;
