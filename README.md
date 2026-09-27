# Telegram Bot Chat

A React web app for exchanging text messages with users through a Telegram bot.

## Requirements

- Node.js 20 or newer
- A Telegram bot token created with [@BotFather](https://t.me/BotFather)

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite and enter your bot token in the app. To create a bot, message `@BotFather` in Telegram and send `/newbot`.

After connecting the bot, open it using the link in the app or find it in Telegram by its `@username`. Press **Start** and send the bot a message. The conversation will appear in the app, where you can reply to the user.

## Build and run

```bash
npm run build
npm start
```

The bot token is kept in server memory and is not written to a file. Reconnect the bot after restarting the server.
