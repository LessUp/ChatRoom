/**
 * ChatRoom Frontend
 * Structure: State -> API -> Socket -> UI -> Main
 */

// --- 1. Utility & UI Components ---

const $ = (id) => document.getElementById(id);

class Toast {
  static show(message, type = 'info', duration = 3000) {
    const container = $('toast-container');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `pointer-events-auto flex items-center w-full max-w-xs p-4 space-x-3 text-gray-100 bg-gray-800 rounded-lg shadow-lg border border-gray-700 transform transition-all duration-300 translate-x-full opacity-0`;
    
    let iconColor = 'text-blue-500';
    if (type === 'error') iconColor = 'text-red-500';
    if (type === 'success') iconColor = 'text-green-500';

    div.innerHTML = `
      <div class="flex-shrink-0 ${iconColor}">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0 1 1 0 002 0zm-1 4a1 1 0 00-1 1v3a1 1 0 002 0v-3a1 1 0 00-1-1z"></path></svg>
      </div>
      <div class="text-sm font-normal">${message}</div>
    `;

    container.appendChild(div);

    // Animate in
    requestAnimationFrame(() => {
      div.classList.remove('translate-x-full', 'opacity-0');
    });

    setTimeout(() => {
      div.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => div.remove(), 300);
    }, duration);
  }

  static error(msg) { this.show(msg, 'error'); }
  static success(msg) { this.show(msg, 'success'); }
  static info(msg) { this.show(msg, 'info'); }
}

// --- 2. State Management ---

const State = {
  user: null,
  accessToken: localStorage.getItem('chat_access') || '',
  refreshToken: localStorage.getItem('chat_refresh') || '',
  currentRoomId: null,
  lastRoomId: localStorage.getItem('chat_last_room'),
  
  setUser(user) {
    this.user = user;
    if (user) localStorage.setItem('chat_user', JSON.stringify(user));
    else localStorage.removeItem('chat_user');
    UI.updateAuth();
  },

  setTokens(access, refresh) {
    if (access) this.accessToken = access;
    if (refresh) this.refreshToken = refresh;
    localStorage.setItem('chat_access', this.accessToken);
    localStorage.setItem('chat_refresh', this.refreshToken);
  },

  clearAuth() {
    this.accessToken = '';
    this.refreshToken = '';
    this.user = null;
    this.currentRoomId = null;
    localStorage.removeItem('chat_access');
    localStorage.removeItem('chat_refresh');
    localStorage.removeItem('chat_user');
    localStorage.removeItem('chat_last_room');
  },
  
  loadUserFromStorage() {
    try {
      const u = localStorage.getItem('chat_user');
      if (u) this.user = JSON.parse(u);
    } catch {}
  }
};

// --- 3. API Layer ---

class API {
  static async request(path, method = 'GET', body = null, auth = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && State.accessToken) headers['Authorization'] = 'Bearer ' + State.accessToken;

    try {
      let res = await fetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
      });

      // Token Refresh Logic
      if (auth && res.status === 401 && State.refreshToken) {
        const refreshOk = await this.refreshToken();
        if (refreshOk) {
          headers['Authorization'] = 'Bearer ' + State.accessToken;
          res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : null });
        } else {
          State.clearAuth();
          UI.updateAuth();
          throw new Error('Session expired');
        }
      }

      if (!res.ok) {
        const error = new Error(`Request failed: ${res.status}`);
        error.status = res.status;
        throw error;
      }
      return res.json();
    } catch (e) {
      console.error("API Error:", e);
      throw e;
    }
  }

  static async refreshToken() {
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: State.refreshToken })
      });
      if (res.ok) {
        const data = await res.json();
        State.setTokens(data.access_token, data.refresh_token);
        return true;
      }
    } catch {}
    return false;
  }
}

// --- 4. WebSocket Manager ---

class ChatSocket {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnect = 8;
    this.shouldReconnect = false;
  }

  connect(roomId) {
    if (this.ws) this.close();
    
    this.shouldReconnect = true;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws?room_id=${roomId}&token=${encodeURIComponent(State.accessToken)}`;
    
    UI.setConnectionStatus('connecting');
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WS Connected');
      this.reconnectAttempts = 0;
      UI.setConnectionStatus('connected');
    };

    this.ws.onclose = () => {
      console.log('WS Closed');
      UI.setConnectionStatus('disconnected');
      if (this.shouldReconnect) this.scheduleReconnect(roomId);
    };

    this.ws.onerror = (e) => {
      console.error('WS Error', e);
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error("Parse error", e);
      }
    };
  }

  close() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  scheduleReconnect(roomId) {
    if (this.reconnectAttempts >= this.maxReconnect) {
        Toast.error("无法连接到服务器，请刷新页面重试");
        return;
    }
    const delay = Math.min(10000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectAttempts++;
    setTimeout(() => {
        if (this.shouldReconnect) this.connect(roomId);
    }, delay);
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  handleMessage(msg) {
    const type = msg.type || msg.Type || 'message';
    switch (type) {
      case 'typing':
        UI.handleTyping(msg.username || msg.user_id, !!msg.is_typing);
        break;
      case 'error':
        Toast.error(msg.content || "Unknown error");
        break;
      default:
        UI.appendMessage(msg);
        break;
    }
  }
}

const Socket = new ChatSocket();

// --- 5. UI Manager ---

const UI = {
  typingUsers: new Map(),
  typingTimeout: null,
  earliestMsgId: null,
  loadingHistory: false,

  init() {
    // Event Listeners
    $('btn-login').onclick = Actions.login;
    $('btn-register').onclick = Actions.register;
    $('btn-create-room').onclick = Actions.createRoom;
    $('btn-send').onclick = Actions.sendMessage;
    $('btn-logout').onclick = Actions.logout;

    const input = $('msg-input');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            Actions.sendMessage();
        }
    });

    // Typing Throttling
    let typingStopTimer = null;
    input.addEventListener('input', () => {
        if (typingStopTimer) clearTimeout(typingStopTimer);
        Socket.send('typing', { is_typing: true });
        typingStopTimer = setTimeout(() => {
            Socket.send('typing', { is_typing: false });
        }, 1500);
    });

    // Infinite Scroll
    const box = $('messages');
    box.addEventListener('scroll', () => {
        if (box.scrollTop <= 20 && !this.loadingHistory) {
            Actions.loadMoreHistory();
        }
    });

    State.loadUserFromStorage();
    this.updateAuth();
    
    // Restore session
    if (State.accessToken) {
        Actions.loadRooms();
        if (State.lastRoomId) {
             // slight delay to allow UI to settle
            setTimeout(() => Actions.joinRoom(State.lastRoomId, '...'), 100);
        }
    }
  },

  updateAuth() {
    const isLoggedIn = !!State.user;
    const authScreen = $('auth-screen');
    const appScreen = $('app-screen');
    
    if (isLoggedIn) {
        authScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        $('current-username').textContent = State.user.username;
        // Avatar placeholder
        $('current-username-avatar').textContent = State.user.username.substring(0, 2).toUpperCase();
    } else {
        authScreen.classList.remove('hidden');
        appScreen.classList.add('hidden');
    }
  },

  setConnectionStatus(status) {
    const el = $('connection-status');
    const indicator = $('room-online-indicator');
    
    el.className = 'hidden px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide';
    
    switch (status) {
        case 'connecting':
            el.classList.remove('hidden');
            el.classList.add('bg-yellow-500/20', 'text-yellow-400');
            el.textContent = 'Connecting...';
            indicator.className = 'w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse';
            break;
        case 'connected':
            el.classList.add('hidden'); // Hide when good
            indicator.className = 'w-2 h-2 bg-green-500 rounded-full mr-2';
            break;
        case 'disconnected':
            el.classList.remove('hidden');
            el.classList.add('bg-red-500/20', 'text-red-400');
            el.textContent = 'Disconnected';
            indicator.className = 'w-2 h-2 bg-red-500 rounded-full mr-2';
            break;
    }
  },

  renderRooms(rooms) {
    const wrap = $('rooms-list');
    wrap.innerHTML = '';
    
    rooms.forEach(r => {
      const active = State.currentRoomId == r.id;
      const div = document.createElement('div');
      // Enhanced UI for room item
      div.className = `group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 ${
          active ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-gray-800 border border-transparent'
      }`;
      
      div.innerHTML = `
        <div class="flex flex-col overflow-hidden">
            <span class="font-medium text-sm truncate ${active ? 'text-blue-400' : 'text-gray-300 group-hover:text-white'}">${this.escape(r.name)}</span>
            <span class="text-[10px] text-gray-500">ID: ${r.id}</span>
        </div>
        <div class="text-xs font-mono text-gray-500 ${active ? 'text-blue-300' : ''}">${r.online || 0}</div>
      `;
      
      div.onclick = () => Actions.joinRoom(r.id, r.name, r.online);
      wrap.appendChild(div);
    });
  },

  // XSS Protection: Escape HTML function (though we prefer textContent)
  escape(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  },

  appendMessage(m, { prepend = false } = {}) {
    const box = $('messages');
    const type = m.type || m.Type || 'message';
    
    // Check for system messages
    if (type === 'join' || type === 'leave') {
        this.renderSystemMessage(m, box, prepend);
        return;
    }
    if (type !== 'message') return;

    const user = m.username || m.Username || m.user || m.User || 'Unknown';
    const content = m.content || m.Content || '';
    const rawDate = m.created_at || m.CreatedAt || Date.now();
    const dateObj = new Date(rawDate);
    const ts = dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    const isMe = State.user && user === State.user.username;
    const msgId = m.id || m.ID || m.Id;

    if (!prepend && msgId) this.earliestMsgId = msgId; // Update pointer if we are appending (newest)?? Wait, no.
    // Logic correction: earliestMsgId tracks the OLDEST message for fetching history.
    // If prepend is true, we are adding OLDER messages.
    // If prepend is false, we are adding NEW messages.
    
    const div = document.createElement('div');
    div.className = `flex flex-col mb-4 opacity-0 animate-fade-in ${isMe ? 'items-end' : 'items-start'}`;
    
    // Use DOM methods for content to prevent XSS
    const header = document.createElement('div');
    header.className = `flex items-baseline space-x-2 mb-1 ${isMe ? 'flex-row-reverse space-x-reverse' : ''}`;
    
    const userSpan = document.createElement('span');
    userSpan.className = "text-xs font-medium text-gray-400";
    userSpan.textContent = user;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = "text-[10px] text-gray-600";
    timeSpan.textContent = ts;

    header.appendChild(userSpan);
    header.appendChild(timeSpan);

    const bubble = document.createElement('div');
    bubble.className = `px-4 py-2 rounded-2xl max-w-[85%] break-words shadow-sm text-sm leading-relaxed ${
        isMe 
        ? 'bg-blue-600 text-white rounded-tr-none' 
        : 'bg-gray-700 text-gray-200 rounded-tl-none'
    }`;
    bubble.textContent = content; // SAFE

    div.appendChild(header);
    div.appendChild(bubble);

    if (prepend) {
        box.insertBefore(div, box.firstChild);
        // Immediate visibility for prepended items
        div.classList.remove('opacity-0', 'animate-fade-in');
    } else {
        box.appendChild(div);
        // Animation
        requestAnimationFrame(() => div.classList.remove('opacity-0'));
        this.scrollToBottom();
    }
  },

  renderSystemMessage(m, container, prepend) {
    const user = m.username || m.Username || 'User';
    const type = m.type || 'join';
    const div = document.createElement('div');
    div.className = 'flex justify-center my-3';
    
    const span = document.createElement('span');
    span.className = "text-[10px] font-medium text-gray-500 bg-gray-800/50 px-3 py-1 rounded-full border border-gray-700/50";
    span.textContent = `${user} ${type === 'join' ? '加入' : '离开'}了房间`;
    
    div.appendChild(span);

    if (prepend) container.insertBefore(div, container.firstChild);
    else {
        container.appendChild(div);
        this.scrollToBottom();
    }

    // Update online count if present
    if (typeof m.online === 'number') {
        $('room-online').textContent = m.online;
    }
  },

  scrollToBottom() {
    const box = $('messages');
    box.scrollTop = box.scrollHeight;
  },

  handleTyping(username, isTyping) {
    if (username === State.user?.username) return; // Ignore self

    if (isTyping) {
      if (this.typingUsers.has(username)) clearTimeout(this.typingUsers.get(username));
      this.typingUsers.set(username, setTimeout(() => {
        this.typingUsers.delete(username);
        this.renderTyping();
      }, 3000));
    } else {
      if (this.typingUsers.has(username)) {
        clearTimeout(this.typingUsers.get(username));
        this.typingUsers.delete(username);
      }
    }
    this.renderTyping();
  },

  renderTyping() {
    const el = $('typing');
    const names = Array.from(this.typingUsers.keys());
    if (names.length === 0) {
        el.textContent = '';
        el.classList.add('opacity-0');
    } else {
        el.textContent = `${names.join(', ')} 正在输入...`;
        el.classList.remove('opacity-0');
    }
  }
};

// --- 6. Actions / Controllers ---

const Actions = {
  async register() {
    const u = $('reg-username').value.trim();
    const p = $('reg-password').value;
    if (!u || !p) return Toast.error('请输入用户名和密码');
    
    try {
      await API.request('/api/v1/auth/register', 'POST', { username: u, password: p });
      Toast.success('注册成功，请登录');
      $('reg-username').value = '';
      $('reg-password').value = '';
    } catch (e) {
      Toast.error('注册失败: ' + (e.message || '用户名可能已存在'));
    }
  },

  async login() {
    const u = $('login-username').value.trim();
    const p = $('login-password').value;
    if (!u || !p) return Toast.error('请输入用户名和密码');

    try {
      const data = await API.request('/api/v1/auth/login', 'POST', { username: u, password: p });
      State.setTokens(data.access_token, data.refresh_token);
      State.setUser(data.user);
      Actions.loadRooms();
    } catch (e) {
      Toast.error('登录失败，请检查凭证');
    }
  },

  logout() {
    Socket.close();
    State.clearAuth();
    UI.updateAuth();
    location.reload();
  },

  async loadRooms() {
    try {
      const data = await API.request('/api/v1/rooms', 'GET', null, true);
      UI.renderRooms(data.rooms || []);
    } catch (e) {
      console.warn("Load rooms failed", e);
    }
  },

  async createRoom() {
    const name = $('room-name').value.trim();
    if (!name) return Toast.info('请输入房间名');
    
    try {
      await API.request('/api/v1/rooms', 'POST', { name }, true);
      $('room-name').value = '';
      Toast.success('房间创建成功');
      Actions.loadRooms();
    } catch (e) {
      Toast.error('创建失败');
    }
  },

  async joinRoom(id, name, online) {
    State.currentRoomId = id;
    localStorage.setItem('chat_last_room', String(id));
    
    $('current-room-name').textContent = name;
    $('welcome-message').classList.add('hidden');
    $('chat-area').classList.remove('hidden');
    
    // Refresh list to highlight active
    Actions.loadRooms(); 

    // Clear Messages
    const box = $('messages');
    box.innerHTML = '';
    
    // Update header stats
    $('room-online').textContent = typeof online === 'number' ? online : '-';

    // Fetch History
    UI.earliestMsgId = null;
    UI.loadingHistory = true;
    
    try {
        const data = await API.request(`/api/v1/rooms/${id}/messages?limit=50`, 'GET', null, true);
        const msgs = data.messages || [];
        if (msgs.length) {
            UI.earliestMsgId = msgs[0].id || msgs[0].ID || msgs[0].Id;
            // Append in order
            msgs.forEach(m => UI.appendMessage(m));
        }
    } catch (e) {
        Toast.error("加载历史消息失败");
    } finally {
        UI.loadingHistory = false;
        UI.scrollToBottom();
    }

    // Connect WS
    Socket.connect(id);
  },

  async loadMoreHistory() {
    if (!State.currentRoomId || !UI.earliestMsgId || UI.loadingHistory) return;
    
    UI.loadingHistory = true;
    const box = $('messages');
    const prevHeight = box.scrollHeight;
    const prevTop = box.scrollTop; // Should be near 0

    try {
        const safeId = encodeURIComponent(UI.earliestMsgId);
        const data = await API.request(`/api/v1/rooms/${State.currentRoomId}/messages?limit=50&before_id=${safeId}`, 'GET', null, true);
        const msgs = data.messages || [];
        
        if (msgs.length) {
            UI.earliestMsgId = msgs[0].id || msgs[0].ID || msgs[0].Id;
            // We need to prepend these messages. The array comes [oldest ... newest] relative to the page.
            // Actually usually APIs return [oldest...newest]. 
            // If we are fetching "before X", we usually get the 50 messages immediately preceding X.
            // Let's assume backend returns chronological block.
            
            // We iterate backwards to maintain order when prepending one by one
            for (let i = msgs.length - 1; i >= 0; i--) {
                UI.appendMessage(msgs[i], { prepend: true });
            }

            // Maintain scroll position
            const newHeight = box.scrollHeight;
            box.scrollTop = newHeight - prevHeight;
        }
    } catch (e) {
        console.error(e);
    } finally {
        UI.loadingHistory = false;
    }
  },

  sendMessage() {
    const input = $('msg-input');
    const content = input.value.trim();
    if (!content) return;

    const sent = Socket.send('message', { content });
    if (!sent) {
        Toast.error('连接断开，无法发送');
        return;
    }
    input.value = '';
    input.focus();
  }
};

// Add custom styles for animation that might not be in Tailwind default
const style = document.createElement('style');
style.textContent = `
    .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
`;
document.head.appendChild(style);

// Start App
UI.init();
