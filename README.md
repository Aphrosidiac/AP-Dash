# AP-Dash - WhatsApp Automation Dashboard

A professional Electron.js desktop application for warming WhatsApp accounts through AI-powered automated messaging.

## Features

### Core Features
- **Account Manager**: Connect a WhatsApp account via QR code
- **Phone Number Management**: Add multiple phone numbers to warm up
- **AI-Powered Conversations**: Uses Google Gemini AI for natural, human-like responses
- **Customizable AI Personality**: Define how the AI behaves and responds
- **Session Recovery**: Automatically restores WhatsApp sessions on app restart
- **Disconnection Detection**: Automatically stops warming and notifies you when WhatsApp disconnects

### Media Features
- **Sticker Library**: Upload and send WebP stickers during conversations
- **Media Library**: Upload images with context descriptions for AI-aware sharing
- **Message Blasting**: Send messages (with optional images) to multiple recipients

### UI/UX
- **Modern Dark Theme**: Sleek, professional interface
- **Custom Styled Dialogs**: Beautiful alerts, confirms, and prompts matching the app theme
- **Live Activity Log**: Real-time tracking of all warming activity
- **Dashboard Stats**: Track messages sent and connection status

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the application:
```bash
npm start
```

For development mode with DevTools:
```bash
npm run dev
```

## Setup Guide

### 1. Configure API Key

1. Navigate to the **Settings** tab
2. Get your Gemini API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
3. Enter your API key and click **Save**

### 2. Customize AI Personality

1. In **Settings**, find the **AI Personality** section
2. Customize how the AI responds (tone, style, behavior)
3. Click **Save AI Personality**

The default personality is optimized for natural, human-like conversations that build trust and familiarity.

### 3. Add WhatsApp Account

1. Navigate to the **Accounts** tab
2. Click **"+ Add Account"**
3. Enter an account name
4. Click **"Generate QR Code"**
5. Scan with WhatsApp on your phone (Settings > Linked Devices > Link a Device)
6. Wait for connection confirmation

### 4. Add Phone Numbers

1. Go to the **Phone Numbers** tab
2. Click **"+ Add Phone Number"**
3. Enter the phone number (digits only, no + or spaces)
4. Optionally add a name for the contact
5. Click **Add**

### 5. Start Warming

1. Navigate to the **Warmer** tab
2. Ensure all requirements are met (green checkmarks)
3. Click **"Start Warming"**

The AI will:
- Send unique, varied greeting messages to each number
- Respond naturally to incoming messages
- Occasionally send stickers and media (if enabled)
- Use random delays to appear human-like

## Features in Detail

### AI Personality System

The AI personality defines how the bot communicates. Key aspects:
- Tone and style (casual, professional, friendly)
- Message length and format
- Conversation behavior
- Topics to avoid

The personality is fully customizable in Settings.

### Session Recovery

When you restart the app:
- Existing WhatsApp sessions are automatically restored
- No need to re-scan QR codes (unless session expired)
- Warming can be resumed immediately

### Disconnection Handling

If WhatsApp disconnects (e.g., logged out from phone):
- Warming automatically stops
- You receive a notification with the reason
- UI updates to reflect disconnected state

### Sticker Support

1. Go to **Stickers** tab
2. Upload WebP format stickers to categories
3. Enable sticker sending in sticker settings
4. AI will occasionally send relevant stickers during conversations

### Media Library

1. Go to **Media** tab
2. Upload images (JPG/PNG, max 5MB)
3. Add detailed context/description for each image
4. AI uses the context to naturally share images in conversations

### Message Blasting

1. Go to **Message Blasting** tab
2. Compose your message
3. Optionally attach an image
4. Preview and confirm
5. Messages are sent with delays to avoid detection

## Configuration

### Response Delays
- **Minimum Delay**: Shortest wait before responding (default: 3s)
- **Maximum Delay**: Longest wait before responding (default: 8s)

### Typing Duration
- **Minimum**: Shortest typing indicator time (default: 2s)
- **Maximum**: Longest typing indicator time (default: 5s)

### Sticker Settings
- **Enable/Disable**: Toggle sticker sending
- **Frequency**: How often to send stickers (0-100%)
- **Fallback to Text**: Send text if sticker fails

### Media Settings
- **Enable/Disable**: Toggle media sharing
- **Frequency**: How often to share media (0-100%)
- **Require Context**: Only share media with descriptions

## Technical Details

### Built With
- **Electron.js** - Desktop application framework
- **whatsapp-web.js** - WhatsApp Web API integration
- **Google Gemini AI** - Natural language generation
- **Node.js** - Backend runtime
- **Puppeteer** - Browser automation

### Data Storage
```
ap-dash/
├── sessions/           # WhatsApp session data (auto-restored)
├── data/
│   ├── accounts.json   # Account information
│   ├── phone_numbers.json
│   ├── config.json     # Settings & AI personality
│   ├── stats.json      # Statistics
│   └── media_index.json
├── stickers/           # Uploaded stickers by category
└── media/              # Uploaded media files
```

## Troubleshooting

### Session Not Restoring
- Check if session files exist in `/sessions` folder
- Try removing and re-adding the account
- Ensure you didn't log out from your phone

### AI Not Responding
- Verify your Gemini API key is valid
- Check the AI Personality is not empty
- Look for errors in the activity log

### Warming Stops Unexpectedly
- Check if WhatsApp disconnected (look at account status)
- Verify your phone has internet connection
- Check the warming log for error messages

### QR Code Not Appearing
- Ensure stable internet connection
- Close and reopen the Add Account modal
- Check console in Dev mode for errors

## System Requirements

- Windows 10/11, macOS 10.14+, or Linux
- Node.js 16 or higher
- 2GB RAM minimum
- Active internet connection
- Phone with WhatsApp installed

## Important Notes

- Only use with accounts you own and have permission to automate
- The AI is configured to never mention automation or AI
- Excessive messaging may violate WhatsApp's Terms of Service
- Sessions persist but may expire if unused for extended periods

## License

MIT License - Feel free to modify and use for personal projects.

## Disclaimer

This tool is for educational and authorized business use only. Use responsibly and in compliance with WhatsApp's Terms of Service. The developers are not responsible for any account restrictions or bans resulting from misuse.
