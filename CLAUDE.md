# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AP-Dash (WhatsApp Warmer) is an Electron.js desktop application for automating WhatsApp conversations using Google Gemini AI. It connects to WhatsApp via QR code scanning and enables AI-powered warm-up messaging to target phone numbers.

## Commands

```bash
# Install dependencies
npm install

# Run application
npm start

# Run with DevTools open
npm run dev
```

## Architecture

### Process Model (Electron)

The app uses Electron's dual-process architecture:

- **Main Process** (`main.js`): Node.js backend handling file I/O, IPC handlers, and WhatsAppManager coordination
- **Renderer Process** (`renderer.js`): Frontend UI logic running in Chromium, communicates via `ipcRenderer`

### Core Components

**main.js** - Electron main process
- Creates BrowserWindow with `nodeIntegration: true` and `contextIsolation: false`
- Initializes data directories (`data/`, `sessions/`, `media/`)
- Defines all IPC handlers (`ipcMain.handle`)
- Restores WhatsApp sessions on startup
- Manages JSON file storage for accounts, phone numbers, config, stats, and media

**whatsapp.js** - WhatsAppManager class
- Wraps `whatsapp-web.js` Client with LocalAuth for session persistence
- Handles QR code generation, connection events, and message sending
- Manages AI responses via Google Gemini (`@google/generative-ai`)
- Tracks conversations per phone number in `activeConversations` Map
- Implements sticker/media sending with configurable frequency
- Supports message blasting to multiple recipients

**renderer.js** - UI controller
- Tab-based navigation management
- Custom dialog system (`showAlert`, `showConfirm`, `showPrompt`) replacing native browser dialogs
- IPC event listeners for real-time updates
- Form handling for accounts, phone numbers, settings, media, and stickers

**index.html** - Single-page UI
- Sidebar navigation with 9 tabs (Dashboard, Account, Phone Numbers, Live Chat, AI Warmer, Media, Stickers, Blasting, Settings)
- Modal dialogs for adding accounts, phone numbers, stickers, and media

### Data Storage Structure

```
ap-dash/
├── data/
│   ├── accounts.json      # WhatsApp account info
│   ├── phone_numbers.json # Target phone numbers
│   ├── config.json        # API key, AI personality, settings
│   ├── stats.json         # Daily message counts
│   ├── stickers/          # WebP stickers by category
│   │   ├── funny/
│   │   ├── casual/
│   │   └── ...
│   └── media/
│       ├── files/         # Uploaded images
│       └── media-items.json
└── sessions/              # WhatsApp session data (LocalAuth)
```

### Key IPC Channels

Main handlers defined in `main.js`:
- `get-accounts`, `add-account`, `remove-account`
- `get-phone-numbers`, `add-phone-number`, `remove-phone-number`, `toggle-phone-number`
- `get-config`, `save-config`
- `start-warming`, `stop-warming`, `get-warming-status`
- `upload-sticker`, `delete-sticker`, `get-sticker-categories`
- `upload-media`, `delete-media`, `get-media-items`
- `start-blast`

Events sent from main to renderer:
- `qr-code`, `account-ready`, `account-status-changed`
- `warming-message-sent`, `warming-message-received`, `warming-stopped`
- `new-message`, `blast-progress`, `increment-stats`

### AI Integration

The app uses Google Gemini (`gemini-2.0-flash-exp` model) for:
1. Generating initial greeting messages (randomized styles)
2. Responding to incoming messages with conversation context
3. Detecting conversation emotion for sticker selection
4. Analyzing received images and transcribing voice messages
5. Creating contextual captions for media sharing

AI personality is stored in `config.json` and used as system prompt.

### Message Flow

1. User starts warming via UI
2. WhatsAppManager sends AI-generated greetings to all phone numbers
3. Incoming messages trigger `client.on('message')` event
4. Messages from target numbers are added to conversation history
5. AI generates response based on history and personality
6. Response sent with typing indicator and configurable delay
7. 10% chance to send media, 12% chance to send sticker instead of text
8. 15% chance to add emoji reaction before text reply

### Session Recovery

WhatsApp sessions are persisted via `LocalAuth` in `sessions/` directory. On app startup, `main.js` calls `whatsappManager.restoreSession()` for each saved account.
