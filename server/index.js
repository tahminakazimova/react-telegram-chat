import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 3031);
let botToken = '';
let botUser = null;
let updateOffset = 0;
let currentPoll = null;

async function telegram(method, payload = {}) {
  if (!botToken) throw new Error('Сначала подключите токен бота.');
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(translateTelegramError(result.description));
  return result.result;
}

function translateTelegramError(description = '') {
  const message = description.toLowerCase();
  if (message.includes('unauthorized')) return 'Неверный токен бота. Проверьте токен от @BotFather.';
  if (message.includes('chat not found')) return 'Чат не найден. Откройте бота в Telegram и нажмите «Запустить».';
  if (message.includes('bot was blocked by the user')) return 'Пользователь заблокировал бота.';
  if (message.includes('terminated by other getupdates request')) return 'Бот уже запущен в другом месте. Остановите второй экземпляр и обновите страницу.';
  return 'Ошибка Telegram API. Проверьте токен и попробуйте ещё раз.';
}

async function bodyJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16384) throw new Error('Запрос слишком большой.');
  }
  return body ? JSON.parse(body) : {};
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function messageView(message, direction) {
  return {
    id: `${message.chat.id}:${message.message_id}`,
    chatId: String(message.chat.id),
    name: [message.chat.first_name, message.chat.last_name].filter(Boolean).join(' ') || message.chat.title || message.chat.username || 'Чат Telegram',
    username: message.chat.username || '',
    text: message.text || '',
    timestamp: (message.date || Math.floor(Date.now() / 1000)) * 1000,
    direction,
  };
}

export async function handleApi(request, response, url) {
  try {
    if (request.method === 'GET' && url.pathname === '/api/status') {
      return sendJson(response, 200, { bot: botUser ? { id: botUser.id, username: botUser.username, firstName: botUser.first_name } : null });
    }

    if (request.method === 'POST' && url.pathname === '/api/connect') {
      const body = await bodyJson(request);
      const token = String(body.token || '').trim();
      if (!token) return sendJson(response, 400, { error: 'Введите токен бота.' });
      const result = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await result.json();
      if (!data.ok) return sendJson(response, 400, { error: translateTelegramError(data.description) });
      botToken = token;
      botUser = data.result;
      updateOffset = 0;
      currentPoll = null;
      return sendJson(response, 200, { bot: { id: botUser.id, username: botUser.username, firstName: botUser.first_name } });
    }

    if (request.method === 'POST' && url.pathname === '/api/disconnect') {
      botToken = '';
      botUser = null;
      updateOffset = 0;
      currentPoll = null;
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === 'GET' && url.pathname === '/api/poll') {
      if (!botToken) return sendJson(response, 401, { error: 'Бот не подключён.' });
      if (!currentPoll) {
        currentPoll = telegram('getUpdates', { offset: updateOffset, timeout: 8, allowed_updates: ['message'] })
          .then((updates) => {
            if (updates.length) updateOffset = Math.max(...updates.map((item) => item.update_id)) + 1;
            return updates.filter((item) => item.message?.text).map((item) => messageView(item.message, 'in'));
          })
          .finally(() => { currentPoll = null; });
      }
      const updates = await currentPoll;
      return sendJson(response, 200, { updates, bot: botUser ? { username: botUser.username, firstName: botUser.first_name } : null });
    }

    if (request.method === 'POST' && url.pathname === '/api/send') {
      const body = await bodyJson(request);
      const chatId = String(body.chatId || '').trim();
      const text = String(body.text || '').trim();
      if (!chatId || !text) return sendJson(response, 400, { error: 'Укажите чат и текст сообщения.' });
      if (text.length > 4096) return sendJson(response, 400, { error: 'Сообщение не должно превышать 4096 символов.' });
      const message = await telegram('sendMessage', { chat_id: chatId, text });
      return sendJson(response, 200, { message: messageView(message, 'out') });
    }

    return sendJson(response, 404, { error: 'Запрос не найден.' });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || 'Внутренняя ошибка сервера.' });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(request, response, url);

  if (process.env.NODE_ENV === 'production') {
    const requested = normalize(decodeURIComponent(url.pathname)).replace(/^([.][.][/\\])+/, '');
    const filePath = join(root, 'dist', requested === '/' ? 'index.html' : requested);
    try {
      const details = await stat(filePath);
      const resolvedPath = details.isDirectory() ? join(filePath, 'index.html') : filePath;
      const content = await readFile(resolvedPath);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
      response.writeHead(200, { 'Content-Type': types[extname(resolvedPath)] || 'application/octet-stream' });
      response.end(content);
    } catch {
      const content = await readFile(join(root, 'dist', 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(content);
    }
    return;
  }

  response.writeHead(404);
  response.end('Not found');
});

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  server.listen(port, '127.0.0.1', () => {
    console.log(`Сервер Telegram-бота запущен: http://127.0.0.1:${port}`);
  });
}
