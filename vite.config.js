import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApi } from './server/index.js';

function telegramBotApi() {
  return {
    name: 'telegram-bot-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/api/')) return next();
        const url = new URL(request.url, 'http://localhost');
        handleApi(request, response, url);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), telegramBotApi()],
});
