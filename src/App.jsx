import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck, CircleHelp, LoaderCircle, MessageCircle, MoreHorizontal, Search, Send, Settings2, ShieldCheck, Smile, X } from 'lucide-react';

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос.');
  return data;
}

const formatTime = (value) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const emojis = ['😀', '😂', '🥰', '😊', '😍', '😉', '🤔', '😭', '😎', '👍', '👎', '👏', '🙏', '❤️', '🔥', '🎉', '✅', '✨', '💯', '🙌'];

function App() {
  const [bot, setBot] = useState(null);
  const [token, setToken] = useState('');
  const [showSettings, setShowSettings] = useState(true);
  const [chats, setChats] = useState({});
  const [messages, setMessages] = useState({});
  const [activeChatId, setActiveChatId] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [polling, setPolling] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const seen = useRef(new Set());
  const listRef = useRef(null);
  const composerRef = useRef(null);
  const activeChat = chats[activeChatId];
  const visibleMessages = messages[activeChatId] || [];
  const chatList = useMemo(() => Object.values(chats).sort((a, b) => b.updatedAt - a.updatedAt), [chats]);

  useEffect(() => {
    api('/api/status').then((data) => {
      if (data.bot) { setBot(data.bot); setShowSettings(false); }
      else setShowSettings(true);
    }).catch(() => setShowSettings(true));
  }, []);

  useEffect(() => {
    if (!bot) return undefined;
    let stopped = false;
    async function poll() {
      setPolling(true);
      while (!stopped) {
        try {
          const data = await api('/api/poll');
          if (stopped) break;
          for (const incoming of data.updates || []) {
            if (!incoming.text || seen.current.has(incoming.id)) continue;
            seen.current.add(incoming.id);
            setChats((current) => ({
              ...current,
              [incoming.chatId]: { id: incoming.chatId, name: incoming.name, username: incoming.username, lastText: incoming.text, updatedAt: incoming.timestamp },
            }));
            setMessages((current) => ({
              ...current,
              [incoming.chatId]: [...(current[incoming.chatId] || []), incoming],
            }));
            setActiveChatId((current) => current || incoming.chatId);
          }
        } catch (cause) {
          if (stopped) break;
          setError(cause.message || 'Не удалось получить новые сообщения.');
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
      }
      setPolling(false);
    }
    poll();
    return () => { stopped = true; };
  }, [bot]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [visibleMessages.length, activeChatId]);

  async function connectBot(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const data = await api('/api/connect', { method: 'POST', body: JSON.stringify({ token }) });
      setBot(data.bot);
      setToken('');
      setShowSettings(false);
      setNotice(`Бот @${data.bot.username} подключён.`);
    } catch (cause) {
      setError(cause.message || 'Не удалось подключить бота. Проверьте токен.');
    } finally { setBusy(false); }
  }

  async function disconnectBot() {
    try { await api('/api/disconnect', { method: 'POST', body: '{}' }); } catch { /* local state is cleared either way */ }
    setBot(null); setChats({}); setMessages({}); setActiveChatId(''); seen.current.clear(); setShowSettings(true);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !activeChatId || sending) return;
    setSending(true); setError('');
    const localId = `local-${Date.now()}`;
    const optimistic = { id: localId, chatId: activeChatId, text, timestamp: Date.now(), direction: 'out' };
    setMessages((current) => ({ ...current, [activeChatId]: [...(current[activeChatId] || []), optimistic] }));
    setChats((current) => ({ ...current, [activeChatId]: { ...current[activeChatId], lastText: text, updatedAt: Date.now() } }));
    setDraft('');
    try {
      const data = await api('/api/send', { method: 'POST', body: JSON.stringify({ chatId: activeChatId, text }) });
      setMessages((current) => ({
        ...current,
        [activeChatId]: current[activeChatId].map((message) => message.id === localId ? data.message : message),
      }));
    } catch (cause) {
      setMessages((current) => ({
        ...current,
        [activeChatId]: current[activeChatId].map((message) => message.id === localId ? { ...message, failed: true } : message),
      }));
      setDraft(text); setError(cause.message || 'Не удалось отправить сообщение.');
    } finally { setSending(false); }
  }

  function insertEmoji(emoji) {
    const field = composerRef.current;
    const start = field?.selectionStart ?? draft.length;
    const end = field?.selectionEnd ?? draft.length;
    const nextDraft = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    setDraft(nextDraft);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  const botLink = bot?.username ? `https://t.me/${bot.username}` : '';

  return (
    <main className="app-shell">
      <section className="messenger" aria-label="Чат с Telegram-ботом">
        <aside className={`sidebar ${activeChat ? 'sidebar-compact' : ''}`}>
          <div className="sidebar-top">
            <div className="brand"><div className="brand-mark"><MessageCircle size={21} strokeWidth={2.7} /></div><span>Telegram</span><span className="brand-beta">BOT</span></div>
            <button className="icon-button subtle" aria-label="Поиск"><Search size={19} /></button>
          </div>
          <div className="sidebar-tools"><span className="filter-pill active">Чаты</span><button className="icon-button subtle" onClick={() => setShowSettings(true)} aria-label="Настройки бота"><Settings2 size={19} /></button></div>
          <div className="chat-list">
            {chatList.length ? chatList.map((chat) => (
              <button className={`contact-row ${activeChatId === chat.id ? 'selected' : ''}`} onClick={() => setActiveChatId(chat.id)} key={chat.id}>
                <div className="avatar avatar-green">{(chat.name || '?').slice(0, 1).toUpperCase()}</div>
                <div className="contact-copy"><strong>{chat.name}</strong><span>{chat.lastText || 'Текстовое сообщение'}</span></div>
                <span className="contact-time">{formatTime(chat.updatedAt)}</span>
              </button>
            )) : <div className="empty-chats"><div className="empty-icon"><MessageCircle size={24} /></div><strong>{bot ? 'Ожидаем сообщения' : 'Бот не подключён'}</strong><span>{bot ? 'Откройте бота в Telegram и нажмите «Запустить».' : 'Добавьте токен бота.'}</span></div>}
          </div>
          <div className="sidebar-bottom">
            <div className="connection-card"><span className={`status-dot ${bot && polling ? 'online' : ''}`} /><div><strong>{bot ? `@${bot.username}` : 'Telegram-бот'}</strong><span>{bot ? (polling ? 'Обновление' : 'Подключён') : 'Не подключён'}</span></div><button onClick={() => setShowSettings(true)} aria-label="Настройки бота"><Settings2 size={17} /></button></div>
            <div className="profile"><div className="profile-avatar">Б</div><div><strong>Рабочее пространство</strong><span>Telegram Bot API</span></div><MoreHorizontal size={20} className="muted-icon" /></div>
          </div>
        </aside>

        <section className="chat-panel">
          {activeChat ? <>
            <header className="chat-header">
              <button className="icon-button back-button" onClick={() => setActiveChatId('')} aria-label="Назад"><ArrowLeft size={20} /></button>
              <div className="avatar avatar-green header-avatar">{(activeChat.name || '?').slice(0, 1).toUpperCase()}</div>
              <div className="header-copy"><strong>{activeChat.name}</strong><span>{activeChat.username ? `@${activeChat.username}` : `chat_id: ${activeChat.id}`}</span></div>
              <button className="icon-button subtle header-more" onClick={() => setShowSettings(true)} aria-label="Ещё"><MoreHorizontal size={22} /></button>
            </header>
            <div className="date-divider"><span>Чат с Telegram-ботом</span></div>
            <div className="messages" ref={listRef}>
              {visibleMessages.map((message) => (
                <div className={`message-row ${message.direction === 'out' ? 'outgoing' : ''}`} key={message.id}>
                  <div className={`bubble ${message.direction === 'out' ? 'bubble-out' : 'bubble-in'}`}>
                    <p>{message.text}</p><div className="message-meta"><time>{formatTime(message.timestamp)}</time>{message.direction === 'out' && (message.failed ? <span className="failed-mark">!</span> : <CheckCheck size={15} className="read-check" />)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="compose-area">
              <form className="composer" onSubmit={sendMessage}>
                <div className="emoji-control">
                  <button type="button" className="icon-button compose-tool" aria-label="Смайлы" aria-expanded={showEmojiPicker} onClick={() => setShowEmojiPicker((visible) => !visible)}><Smile size={21} /></button>
                  {showEmojiPicker && <div className="emoji-picker" role="group" aria-label="Выберите эмодзи">{emojis.map((emoji) => <button type="button" key={emoji} onClick={() => insertEmoji(emoji)} aria-label={`Вставить ${emoji}`}>{emoji}</button>)}</div>}
                </div>
                <textarea ref={composerRef} aria-label="Текст сообщения" placeholder="Напишите сообщение..." value={draft} maxLength={4096} rows={1} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(event); } }} />
                {draft.length > 0 && <span className="char-count">{draft.length}/4096</span>}
                <button type="submit" className="send-button" disabled={!draft.trim() || sending} aria-label="Отправить">{sending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} fill="currentColor" />}</button>
              </form>
              <div className="compose-hint">Enter — отправить <span>·</span> Shift + Enter — новая строка</div>
            </div>
          </> : <div className="welcome-pane">
            <div className="welcome-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-bubble"><MessageCircle size={43} strokeWidth={1.7} /><span className="art-spark">✦</span></div><div className="art-dot dot-one" /><div className="art-dot dot-two" /><div className="art-dot dot-three" /></div>
            <h1>{bot ? `@${bot.username} готов` : 'Подключите Telegram-бота'}</h1>
            {bot ? <>
              <p>Чтобы начать чат, откройте бота в Telegram, нажмите <b>«Запустить»</b> и отправьте сообщение.</p>
              <a className="primary-button start-bot-link" href={botLink} target="_blank" rel="noreferrer">Открыть бота в Telegram <span>↗</span></a>
              <span className="field-hint start-hint">Или откройте Telegram, найдите бота по имени @{bot.username} и нажмите «Запустить». После первого сообщения чат появится здесь.</span>
            </> : <>
              <p>Создайте бота через BotFather и введите его токен. Личный аккаунт Telegram не подключается к приложению.</p>
              <button className="primary-button start-bot-link" onClick={() => setShowSettings(true)}>Ввести токен бота <span>→</span></button>
            </>}
          </div>}
        </section>

        {(error || notice) && <div className={`toast ${error ? 'toast-error' : ''}`} role="status"><span>{error || notice}</span><button onClick={() => { setError(''); setNotice(''); }} aria-label="Закрыть уведомление"><X size={16} /></button></div>}
        {showSettings && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSettings(false); }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-heading"><div className="settings-icon"><MessageCircle size={20} /></div><button className="icon-button modal-close" onClick={() => setShowSettings(false)} aria-label="Закрыть"><X size={19} /></button></div>
            <h2 id="settings-title">Подключить Telegram-бота</h2>
            <p className="modal-description">Сначала создайте бота через <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> и получите токен доступа.</p>
            <div className="bot-setup-guide">
              <strong>Как начать переписку</strong>
              <ol>
                <li>Вставьте токен бота в поле ниже и нажмите «Проверить и подключить».</li>
                <li>Пользователь находит бота в Telegram по имени <b>@username</b>, открывает чат и нажимает «Запустить» или отправляет первое сообщение.</li>
                <li>После этого переписка появится в приложении. Вы сможете читать входящие сообщения и отвечать прямо отсюда.</li>
              </ol>
              <p>Бот не может написать пользователю первым. Личный аккаунт Telegram к приложению не подключается.</p>
            </div>
            <form onSubmit={connectBot} className="settings-form">
              <label>Токен бота<input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="123456789:AA..." required /></label>
              <div className="security-note"><ShieldCheck size={17} /><span>Токен хранится только в памяти локального сервера и не записывается в файл.</span></div>
              <button className="primary-button" type="submit" disabled={busy || !token.trim()}>{busy ? <LoaderCircle size={17} className="spin" /> : 'Проверить и подключить'}</button>
            </form>
            {bot && <button className="disconnect-button" onClick={disconnectBot}>Отключить бота и удалить токен</button>}
            <a className="api-help" href="https://core.telegram.org/bots/tutorial" target="_blank" rel="noreferrer"><CircleHelp size={15} /> Инструкция по созданию бота</a>
          </section>
        </div>}
      </section>
      <div className="app-caption">Личный аккаунт не подключается <span>·</span> Telegram Bot API</div>
    </main>
  );
}

export default App;
