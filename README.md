# WhatsApp Warmer - Desktop Application

A professional Electron.js desktop application for warming WhatsApp accounts through automated messaging between your connected accounts.

## Features

- **Account Manager**: Add multiple WhatsApp accounts via QR code scanning
- **Live Chat View**: See real-time messages being sent and received
- **Auto Warmer**: Automated warming with configurable message frequency
- **Dashboard**: Track stats including connected accounts and daily message count
- **Session Persistence**: Accounts stay logged in between app restarts

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

## How to Use

### Adding Accounts

1. Navigate to the **Accounts** tab
2. Click **"+ Add Account"**
3. Enter an account name (e.g., "Business Account 1")
4. Click **"Generate QR Code"**
5. Open WhatsApp on your phone
6. Go to Settings > Linked Devices > Link a Device
7. Scan the QR code displayed in the app
8. Wait for the connection to be established

Repeat this process for each WhatsApp account you want to add. You need at least 2 accounts to start warming.

### Starting Auto Warming

1. Navigate to the **Auto Warmer** tab
2. Adjust the **"Messages per Hour"** slider (recommended: 5-10)
3. Click **"Start Warming"**

The app will automatically:
- Select random pairs of your connected accounts
- Send natural-looking messages between them
- Use random delays to appear more human-like
- Track all warming activity in the log

### Viewing Messages

Switch to the **Live Chat** tab to see all messages being sent and received in real-time.

### Dashboard Overview

The Dashboard provides a quick summary:
- Number of connected accounts
- Messages sent today
- Current warming status
- Recent activity log

## Technical Details

### Built With

- **Electron.js** - Desktop application framework
- **whatsapp-web.js** - WhatsApp Web API integration
- **Node.js** - Backend runtime
- **Puppeteer** - Browser automation (used by whatsapp-web.js)

### Data Storage

- **Sessions**: Stored in `/sessions` directory (keeps accounts logged in)
- **Account Data**: Stored in `/data/accounts.json`
- **Statistics**: Stored in `/data/stats.json`

### Message Templates

The app uses 20 pre-written message templates that sound natural:
- "Hey, how are you?"
- "What's up?"
- "Thanks!"
- "Sure, let's do it"
- And 16 more...

Messages are randomly selected to create varied, natural-looking conversations.

## Configuration

### Warming Settings

- **Messages per Hour**: Controls how frequently warming messages are sent
- **Random Delays**: Built-in randomization (2-10 minutes) between messages
- **Auto Selection**: Accounts are randomly paired for each message

### Recommended Settings

For best results:
- Start with 5-8 messages per hour
- Have at least 3-5 accounts connected
- Run the warmer for several hours daily
- Monitor the warming log for any issues

## Troubleshooting

### QR Code Not Appearing

- Make sure you have a stable internet connection
- Try closing and reopening the Add Account modal
- Check the console (Dev mode) for error messages

### Account Disconnected

- WhatsApp may disconnect accounts that are inactive for too long
- Simply reconnect by going to Accounts tab and removing/re-adding
- Sessions are saved, so reconnecting is usually automatic

### Warming Not Sending Messages

- Verify at least 2 accounts show "Connected" status
- Check that accounts can message each other normally
- Look for errors in the Warming Log

### Messages Not Delivering

- Ensure the phone numbers can message each other
- Check that WhatsApp accounts are not banned or restricted
- Verify both accounts are properly connected

## Project Structure

```
whatsapp-warmer/
├── main.js              # Electron main process
├── renderer.js          # UI logic and IPC communication
├── whatsapp.js          # WhatsApp Web integration
├── index.html           # UI structure
├── styles.css           # Styling
├── package.json         # Dependencies
├── sessions/            # WhatsApp session data
└── data/               # Application data
    ├── accounts.json   # Account information
    └── stats.json      # Statistics
```

## Important Notes

- This app uses the official WhatsApp Web API through whatsapp-web.js
- Your WhatsApp accounts must remain active on your phone
- The app simulates normal human usage patterns
- Only use with accounts you own and have permission to automate
- Excessive automated messaging may violate WhatsApp's Terms of Service

## System Requirements

- Windows 10/11, macOS 10.14+, or Linux
- Node.js 16 or higher
- 2GB RAM minimum
- Active internet connection
- Phone with WhatsApp installed

## Support

For issues or questions, please check:
1. The Warming Log in the Auto Warmer tab
2. The Activity Log in the Dashboard
3. Browser console (Dev mode: `npm run dev`)

## License

MIT License - Feel free to modify and use for personal projects.

## Disclaimer

This tool is for educational and authorized business use only. Use responsibly and in compliance with WhatsApp's Terms of Service. The developers are not responsible for any account restrictions or bans resulting from misuse.
