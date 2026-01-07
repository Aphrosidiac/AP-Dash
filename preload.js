const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Account operations
    getAccounts: () => ipcRenderer.invoke('get-accounts'),
    hasAccount: () => ipcRenderer.invoke('has-account'),
    addAccount: (accountName) => ipcRenderer.invoke('add-account', accountName),
    removeAccount: (accountId) => ipcRenderer.invoke('remove-account', accountId),
    updateAccount: (accountId, updates) => ipcRenderer.invoke('update-account', accountId, updates),

    // Phone number operations
    getPhoneNumbers: () => ipcRenderer.invoke('get-phone-numbers'),
    addPhoneNumber: (phoneNumber, name) => ipcRenderer.invoke('add-phone-number', phoneNumber, name),
    removePhoneNumber: (phoneId) => ipcRenderer.invoke('remove-phone-number', phoneId),
    togglePhoneNumber: (phoneId) => ipcRenderer.invoke('toggle-phone-number', phoneId),
    getPhoneEnabledStatus: (phoneNumber) => ipcRenderer.invoke('get-phone-enabled-status', phoneNumber),

    // Config operations
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),

    // Warming operations
    startWarming: (config) => ipcRenderer.invoke('start-warming', config),
    stopWarming: () => ipcRenderer.invoke('stop-warming'),
    getWarmingStatus: () => ipcRenderer.invoke('get-warming-status'),

    // Stats operations
    getStats: () => ipcRenderer.invoke('get-stats'),
    incrementMessageCount: () => ipcRenderer.invoke('increment-message-count'),

    // Message operations
    getMessages: () => ipcRenderer.invoke('get-messages'),
    getMessagesByPhone: () => ipcRenderer.invoke('get-messages-by-phone'),

    // Sticker operations
    getStickerCategories: () => ipcRenderer.invoke('get-sticker-categories'),
    uploadSticker: (data) => ipcRenderer.invoke('upload-sticker', data),
    deleteSticker: (data) => ipcRenderer.invoke('delete-sticker', data),
    getSticker: (data) => ipcRenderer.invoke('get-sticker', data),

    // Media operations
    getMediaItems: () => ipcRenderer.invoke('get-media-items'),
    uploadMedia: (data) => ipcRenderer.invoke('upload-media', data),
    deleteMedia: (data) => ipcRenderer.invoke('delete-media', data),
    getMediaFile: (data) => ipcRenderer.invoke('get-media-file', data),
    updateMediaContext: (data) => ipcRenderer.invoke('update-media-context', data),

    // Blasting operations
    startBlast: (data) => ipcRenderer.invoke('start-blast', data),
    getBlastStats: () => ipcRenderer.invoke('get-blast-stats'),

    // Event listeners (one-way communication from main to renderer)
    onQrCode: (callback) => ipcRenderer.on('qr-code', (event, data) => callback(data)),
    onAccountReady: (callback) => ipcRenderer.on('account-ready', (event, data) => callback(data)),
    onAccountStatusChanged: (callback) => ipcRenderer.on('account-status-changed', (event, data) => callback(data)),
    onNewMessage: (callback) => ipcRenderer.on('new-message', (event, data) => callback(data)),
    onWarmingMessageSent: (callback) => ipcRenderer.on('warming-message-sent', (event, data) => callback(data)),
    onWarmingMessageReceived: (callback) => ipcRenderer.on('warming-message-received', (event, data) => callback(data)),
    onIncrementStats: (callback) => ipcRenderer.on('increment-stats', () => callback()),
    onWarmingError: (callback) => ipcRenderer.on('warming-error', (event, data) => callback(data)),
    onWarmingStopped: (callback) => ipcRenderer.on('warming-stopped', (event, data) => callback(data)),
    onBlastProgress: (callback) => ipcRenderer.on('blast-progress', (event, progress) => callback(progress)),
    onMessageReceived: (callback) => ipcRenderer.on('message-received', (event, data) => callback(data)),

    // Remove listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
