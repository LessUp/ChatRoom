/**
 * ChatRoom Frontend - Modern IM System
 * Architecture: Utility -> State -> API -> Socket -> UI -> Actions -> Init
 * Features: Real-time messaging, typing indicators, emoji support, search, high availability
 */

// --- 1. Utility & UI Components ---

const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// Common emoji set for quick access
const EMOJI_SET = ['😀','😂','🥰','😎','🤔','👍','👎','❤️','🔥','✨','🎉','👏','🙏','💪','😊','😢','😡','🤣','😍','🥺','😭','😤','🤗','🤩','😴','🤮','💀','👀','🙄','😏','🥳','😇','🤝','💯','⭐','🌟','💫','🚀','💬','📝'];

class Toast {
  static show(message, type = 'info', duration = 3000) {
    const container = $('toast-container');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `pointer-events-auto flex items-center w-full max-w-sm p-4 gap-3 text-gray-100 bg-dark-800/95 glass rounded-xl shadow-2xl border border-dark-700/50 transform transition-all duration-300 translate-x-full opacity-0`;
    
    const icons = {
      info: `<svg class="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
      error: `<svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
      success: `<svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
    };

    div.innerHTML = `
      <div class="flex-shrink-0">${icons[type] || icons.info}</div>
      <div class="text-sm font-medium flex-1">${this.escapeHtml(message)}</div>
      <button class="text-gray-500 hover:text-white transition-colors" onclick="this.parentElement.remove()">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    `;

    container.appendChild(div);
    requestAnimationFrame(() => div.classList.remove('translate-x-full', 'opacity-0'));

    setTimeout(() => {
      div.classList.add('opacity-0', '-translate-y-2');
      setTimeout(() => div.remove(), 300);
    }, duration);
  }

  static escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

// --- 4. WebSocket Manager with High Availability ---

class ChatSocket {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnect = 10;
    this.shouldReconnect = false;
    this.currentRoomId = null;
    this.heartbeatInterval = null;
    this.heartbeatTimeout = null;
    this.messageQueue = []; // Offline message queue
    this.lastPong = Date.now();
  }

  connect(roomId) {
    if (this.ws) this.close(false);
    
    this.currentRoomId = roomId;
    this.shouldReconnect = true;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws?room_id=${roomId}&token=${encodeURIComponent(State.accessToken)}`;
    
    UI.setConnectionStatus('connecting');
    
    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.error('WS creation failed', e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('WS Connected to room:', roomId);
      this.reconnectAttempts = 0;
      this.lastPong = Date.now();
      UI.setConnectionStatus('connected');
      this.startHeartbeat();
      this.flushMessageQueue();
    };

    this.ws.onclose = (e) => {
      console.log('WS Closed:', e.code, e.reason);
      this.stopHeartbeat();
      UI.setConnectionStatus('disconnected');
      if (this.shouldReconnect) this.scheduleReconnect();
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

  close(clearQueue = true) {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (clearQueue) this.messageQueue = [];
  }

  // Heartbeat for connection health monitoring
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send('ping', {}, true);
        // Check for pong timeout
        this.heartbeatTimeout = setTimeout(() => {
          if (Date.now() - this.lastPong > 35000) {
            console.warn('Heartbeat timeout, reconnecting...');
            this.ws?.close();
          }
        }, 5000);
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnect) {
      Toast.error("连接失败，请检查网络后刷新页面");
      return;
    }
    const delay = Math.min(15000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectAttempts++;
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    UI.setConnectionStatus('reconnecting', this.reconnectAttempts);
    
    setTimeout(() => {
      if (this.shouldReconnect && this.currentRoomId) {
        this.connect(this.currentRoomId);
      }
    }, delay);
  }

  send(type, payload = {}, skipQueue = false) {
    const message = { type, ...payload };
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (!skipQueue && type === 'message') {
        this.messageQueue.push(message);
        Toast.info('消息已加入发送队列');
      }
      return false;
    }
    
    this.ws.send(JSON.stringify(message));
    return true;
  }

  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      this.send(msg.type, msg);
    }
  }

  handleMessage(msg) {
    const type = msg.type || msg.Type || 'message';
    
    switch (type) {
      case 'pong':
        this.lastPong = Date.now();
        if (this.heartbeatTimeout) {
          clearTimeout(this.heartbeatTimeout);
          this.heartbeatTimeout = null;
        }
        break;
      case 'typing':
        UI.handleTyping(msg.username || msg.user_id, !!msg.is_typing);
        break;
      case 'online_users':
        UI.updateOnlineUsers(msg.users || []);
        break;
      case 'error':
        Toast.error(msg.content || "发生错误");
        break;
      case 'join':
      case 'leave':
        UI.appendMessage(msg);
        if (typeof msg.online === 'number') {
          $('room-online').textContent = msg.online;
        }
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
  emojiPickerVisible: false,
  searchMode: false,

  init() {
    // Auth Tab switching
    $('tab-login')?.addEventListener('click', () => this.switchAuthTab('login'));
    $('tab-register')?.addEventListener('click', () => this.switchAuthTab('register'));

    // Auth buttons
    $('btn-login').onclick = Actions.login;
    $('btn-register').onclick = Actions.register;
    $('btn-create-room').onclick = Actions.createRoom;
    $('btn-send').onclick = Actions.sendMessage;
    $('btn-logout').onclick = Actions.logout;

    // Enter to submit on auth forms
    ['login-username', 'login-password'].forEach(id => {
      $(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') Actions.login();
      });
    });
    ['reg-username', 'reg-password'].forEach(id => {
      $(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') Actions.register();
      });
    });

    // Message input handling
    const input = $('msg-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        Actions.sendMessage();
      }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Typing indicator throttling
    let typingStopTimer = null;
    input.addEventListener('input', () => {
      if (typingStopTimer) clearTimeout(typingStopTimer);
      Socket.send('typing', { is_typing: true });
      typingStopTimer = setTimeout(() => {
        Socket.send('typing', { is_typing: false });
      }, 1500);
    });

    // Infinite scroll for history
    const msgBox = $('messages');
    msgBox.addEventListener('scroll', () => {
      if (msgBox.scrollTop <= 20 && !this.loadingHistory) {
        Actions.loadMoreHistory();
      }
    });

    // Emoji picker
    $('btn-emoji')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleEmojiPicker();
    });
    this.initEmojiPicker();

    // Close emoji picker on outside click
    document.addEventListener('click', (e) => {
      if (this.emojiPickerVisible && !$('emoji-picker').contains(e.target)) {
        this.hideEmojiPicker();
      }
    });

    // Room search
    $('search-rooms')?.addEventListener('input', (e) => {
      this.filterRooms(e.target.value);
    });

    // Room name enter to create
    $('room-name')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') Actions.createRoom();
    });

    // Initialize state
    State.loadUserFromStorage();
    this.updateAuth();
    
    // Restore session
    if (State.accessToken) {
      Actions.loadRooms();
      if (State.lastRoomId) {
        setTimeout(() => Actions.joinRoom(State.lastRoomId, '...'), 100);
      }
    }
  },

  switchAuthTab(tab) {
    const loginTab = $('tab-login');
    const registerTab = $('tab-register');
    const loginForm = $('form-login');
    const registerForm = $('form-register');

    if (tab === 'login') {
      loginTab.className = 'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all bg-primary-600 text-white';
      registerTab.className = 'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all text-gray-400 hover:text-white';
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
    } else {
      registerTab.className = 'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all bg-primary-600 text-white';
      loginTab.className = 'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all text-gray-400 hover:text-white';
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
    }
  },

  initEmojiPicker() {
    const picker = $('emoji-picker');
    if (!picker) return;
    
    const grid = picker.querySelector('.grid');
    grid.innerHTML = EMOJI_SET.map(e => 
      `<button class="emoji-btn w-8 h-8 flex items-center justify-center text-xl hover:bg-dark-700 rounded-lg transition-transform" data-emoji="${e}">${e}</button>`
    ).join('');

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-emoji]');
      if (btn) {
        const emoji = btn.dataset.emoji;
        const input = $('msg-input');
        const pos = input.selectionStart;
        input.value = input.value.slice(0, pos) + emoji + input.value.slice(pos);
        input.focus();
        input.selectionStart = input.selectionEnd = pos + emoji.length;
        this.hideEmojiPicker();
      }
    });
  },

  toggleEmojiPicker() {
    if (this.emojiPickerVisible) {
      this.hideEmojiPicker();
    } else {
      this.showEmojiPicker();
    }
  },

  showEmojiPicker() {
    const picker = $('emoji-picker');
    const btn = $('btn-emoji');
    if (!picker || !btn) return;

    const rect = btn.getBoundingClientRect();
    picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    picker.style.left = rect.left + 'px';
    picker.classList.remove('hidden');
    this.emojiPickerVisible = true;
  },

  hideEmojiPicker() {
    $('emoji-picker')?.classList.add('hidden');
    this.emojiPickerVisible = false;
  },

  filterRooms(query) {
    const items = $('rooms-list')?.querySelectorAll('[data-room-name]') || [];
    const q = query.toLowerCase().trim();
    
    items.forEach(item => {
      const name = item.dataset.roomName?.toLowerCase() || '';
      item.style.display = !q || name.includes(q) ? '' : 'none';
    });
  },

  updateAuth() {
    const isLoggedIn = !!State.user;
    const authScreen = $('auth-screen');
    const appScreen = $('app-screen');
    
    if (isLoggedIn) {
      authScreen.classList.add('hidden');
      appScreen.classList.remove('hidden');
      $('current-username').textContent = State.user.username;
      $('current-username-avatar').textContent = State.user.username.substring(0, 2).toUpperCase();
    } else {
      authScreen.classList.remove('hidden');
      appScreen.classList.add('hidden');
    }
  },

  setConnectionStatus(status, attempt = 0) {
    const el = $('connection-status');
    const indicator = $('room-online-indicator');
    if (!el) return;
    
    el.className = 'hidden px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide';
    
    switch (status) {
      case 'connecting':
        el.classList.remove('hidden');
        el.classList.add('bg-yellow-500/20', 'text-yellow-400', 'connection-pulse');
        el.textContent = '连接中';
        if (indicator) indicator.className = 'w-2 h-2 bg-yellow-500 rounded-full animate-pulse';
        break;
      case 'connected':
        el.classList.add('hidden');
        if (indicator) indicator.className = 'w-2 h-2 bg-emerald-500 rounded-full';
        break;
      case 'reconnecting':
        el.classList.remove('hidden');
        el.classList.add('bg-orange-500/20', 'text-orange-400', 'connection-pulse');
        el.textContent = `重连中 (${attempt})`;
        if (indicator) indicator.className = 'w-2 h-2 bg-orange-500 rounded-full animate-pulse';
        break;
      case 'disconnected':
        el.classList.remove('hidden');
        el.classList.add('bg-red-500/20', 'text-red-400');
        el.textContent = '已断开';
        if (indicator) indicator.className = 'w-2 h-2 bg-red-500 rounded-full';
        break;
    }
  },

  renderRooms(rooms) {
    const wrap = $('rooms-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    State.rooms = rooms; // Cache for search
    
    rooms.forEach(r => {
      const active = State.currentRoomId == r.id;
      const div = document.createElement('div');
      div.dataset.roomName = r.name;
      div.dataset.roomId = r.id;
      
      div.className = `room-item group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
        active 
          ? 'active bg-primary-500/10 border-l-2 border-primary-500' 
          : 'hover:bg-dark-800/50 border-l-2 border-transparent'
      }`;
      
      // Room avatar with gradient
      const colors = ['from-violet-500 to-purple-600', 'from-blue-500 to-cyan-500', 'from-emerald-500 to-teal-500', 'from-orange-500 to-red-500', 'from-pink-500 to-rose-500'];
      const colorClass = colors[r.id % colors.length];
      
      div.innerHTML = `
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${colorClass} flex items-center justify-center text-white font-bold text-sm shadow-lg flex-shrink-0">
          ${this.escape(r.name.charAt(0).toUpperCase())}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <span class="font-medium text-sm truncate ${active ? 'text-white' : 'text-gray-300 group-hover:text-white'}">${this.escape(r.name)}</span>
            ${r.unread ? `<span class="unread-badge w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center">${r.unread > 99 ? '99+' : r.unread}</span>` : ''}
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="w-1.5 h-1.5 rounded-full ${(r.online || 0) > 0 ? 'bg-emerald-500' : 'bg-gray-600'}"></span>
            <span class="text-xs text-gray-500">${r.online || 0} 在线</span>
          </div>
        </div>
      `;
      
      div.onclick = () => Actions.joinRoom(r.id, r.name, r.online);
      wrap.appendChild(div);
    });
  },

  updateOnlineUsers(users) {
    const panel = $('online-users');
    if (!panel) return;

    panel.innerHTML = users.map(u => `
      <div class="online-user flex items-center gap-2 p-2 rounded-lg">
        <div class="relative">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white text-xs font-semibold">
            ${this.escape((u.username || u).substring(0, 2).toUpperCase())}
          </div>
          <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-dark-900 rounded-full"></span>
        </div>
        <span class="text-sm text-gray-300 truncate">${this.escape(u.username || u)}</span>
      </div>
    `).join('');
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
    
    // System messages (join/leave)
    if (type === 'join' || type === 'leave') {
      this.renderSystemMessage(m, box, prepend);
      return;
    }
    if (type !== 'message') return;

    const user = m.username || m.Username || m.user || m.User || 'Unknown';
    const content = m.content || m.Content || '';
    const rawDate = m.created_at || m.CreatedAt || Date.now();
    const dateObj = new Date(rawDate);
    const ts = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isMe = State.user && user === State.user.username;
    const msgId = m.id || m.ID || m.Id;

    // Track earliest message for infinite scroll
    if (prepend && msgId) {
      this.earliestMsgId = msgId;
    }
    
    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper group flex gap-3 ${isMe ? 'flex-row-reverse' : ''} ${prepend ? '' : 'msg-appear'}`;
    wrapper.dataset.msgId = msgId || '';

    // Avatar
    const avatarColors = ['from-violet-500 to-purple-600', 'from-blue-500 to-cyan-500', 'from-emerald-500 to-teal-500', 'from-orange-500 to-red-500', 'from-pink-500 to-rose-500'];
    const colorIdx = user.charCodeAt(0) % avatarColors.length;
    
    if (!isMe) {
      const avatar = document.createElement('div');
      avatar.className = `w-8 h-8 rounded-xl bg-gradient-to-br ${avatarColors[colorIdx]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1`;
      avatar.textContent = user.substring(0, 2).toUpperCase();
      wrapper.appendChild(avatar);
    }

    // Message content area
    const msgArea = document.createElement('div');
    msgArea.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`;

    // Header (name + time)
    const header = document.createElement('div');
    header.className = `flex items-center gap-2 mb-1 text-xs ${isMe ? 'flex-row-reverse' : ''}`;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'font-medium text-gray-400';
    nameSpan.textContent = user;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'text-gray-600';
    timeSpan.textContent = ts;

    header.appendChild(nameSpan);
    header.appendChild(timeSpan);
    msgArea.appendChild(header);

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = isMe ? 'msg-own' : 'msg-other';
    bubble.classList.add('px-4', 'py-2.5', 'max-w-full', 'break-words', 'text-sm', 'leading-relaxed');
    
    // Process content for mentions and links
    bubble.innerHTML = this.processMessageContent(content);

    msgArea.appendChild(bubble);

    // Message actions (hover menu)
    const actions = document.createElement('div');
    actions.className = `msg-actions flex items-center gap-1 mt-1 ${isMe ? 'justify-end' : ''}`;
    actions.innerHTML = `
      <button class="p-1 text-gray-600 hover:text-gray-400 rounded transition-colors" title="回复">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
      </button>
      <button class="p-1 text-gray-600 hover:text-gray-400 rounded transition-colors" title="表情">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
      </button>
    `;
    msgArea.appendChild(actions);

    wrapper.appendChild(msgArea);

    if (prepend) {
      box.insertBefore(wrapper, box.firstChild);
    } else {
      box.appendChild(wrapper);
      this.scrollToBottom();
    }
  },

  processMessageContent(content) {
    // Escape HTML first
    let safe = this.escape(content);
    
    // Process @mentions
    safe = safe.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    
    // Process URLs
    safe = safe.replace(
      /(https?:\/\/[^\s<]+)/g, 
      '<a href="$1" target="_blank" rel="noopener" class="text-primary-400 hover:underline">$1</a>'
    );
    
    return safe;
  },

  renderSystemMessage(m, container, prepend) {
    const user = m.username || m.Username || 'User';
    const type = m.type || 'join';
    const isJoin = type === 'join';
    
    const div = document.createElement('div');
    div.className = 'flex justify-center my-4';
    
    div.innerHTML = `
      <span class="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-dark-800/50 px-3 py-1.5 rounded-full border border-dark-700/50">
        <svg class="w-3.5 h-3.5 ${isJoin ? 'text-emerald-500' : 'text-gray-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          ${isJoin 
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>'
            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>'}
        </svg>
        <span class="${isJoin ? 'text-emerald-400' : ''}">${this.escape(user)}</span>
        ${isJoin ? '加入了房间' : '离开了房间'}
      </span>
    `;

    if (prepend) {
      container.insertBefore(div, container.firstChild);
    } else {
      container.appendChild(div);
      this.scrollToBottom();
    }

    if (typeof m.online === 'number') {
      $('room-online').textContent = m.online;
    }
  },

  scrollToBottom() {
    const box = $('messages');
    box.scrollTop = box.scrollHeight;
  },

  handleTyping(username, isTyping) {
    if (username === State.user?.username) return;

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
    const textEl = $('typing-text');
    const names = Array.from(this.typingUsers.keys());
    
    if (names.length === 0) {
      el.classList.add('opacity-0');
    } else {
      let text;
      if (names.length === 1) {
        text = `${names[0]} 正在输入...`;
      } else if (names.length === 2) {
        text = `${names[0]} 和 ${names[1]} 正在输入...`;
      } else {
        text = `${names[0]} 和其他 ${names.length - 1} 人正在输入...`;
      }
      if (textEl) textEl.textContent = text;
      el.classList.remove('opacity-0');
    }
  },

  // Show date separator for messages
  shouldShowDateSeparator(currentDate, lastDate) {
    if (!lastDate) return true;
    return currentDate.toDateString() !== lastDate.toDateString();
  },

  formatMessageDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return '今天';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '昨天';
    } else {
      return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
    }
  }
};

// --- 6. Actions / Controllers ---

const Actions = {
  async register() {
    const u = $('reg-username').value.trim();
    const p = $('reg-password').value;
    if (!u || !p) return Toast.error('请输入用户名和密码');
    if (u.length < 2) return Toast.error('用户名至少2个字符');
    if (p.length < 4) return Toast.error('密码至少4个字符');
    
    try {
      await API.request('/api/v1/auth/register', 'POST', { username: u, password: p });
      Toast.success('注册成功！');
      $('reg-username').value = '';
      $('reg-password').value = '';
      UI.switchAuthTab('login');
      $('login-username').value = u;
      $('login-password').focus();
    } catch (e) {
      Toast.error('注册失败: 用户名可能已存在');
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
      Toast.success(`欢迎回来，${data.user.username}！`);
      Actions.loadRooms();
    } catch (e) {
      Toast.error('登录失败，请检查用户名和密码');
    }
  },

  logout() {
    Socket.close();
    State.clearAuth();
    UI.updateAuth();
    Toast.info('已退出登录');
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
    const input = $('room-name');
    const name = input.value.trim();
    if (!name) return Toast.info('请输入房间名');
    if (name.length > 50) return Toast.error('房间名不能超过50个字符');
    
    try {
      const data = await API.request('/api/v1/rooms', 'POST', { name }, true);
      input.value = '';
      Toast.success('房间创建成功');
      Actions.loadRooms();
      // Auto join the new room
      if (data.room) {
        Actions.joinRoom(data.room.id, data.room.name, 0);
      }
    } catch (e) {
      Toast.error('创建失败');
    }
  },

  async joinRoom(id, name, online) {
    // Prevent duplicate joins
    if (State.currentRoomId === id) return;
    
    State.currentRoomId = id;
    localStorage.setItem('chat_last_room', String(id));
    
    // Update room header
    const roomName = $('current-room-name');
    const roomAvatar = $('room-avatar');
    if (roomName) roomName.textContent = name;
    if (roomAvatar) roomAvatar.textContent = name.charAt(0).toUpperCase();
    
    // Show chat area
    $('welcome-message')?.classList.add('hidden');
    $('chat-area')?.classList.remove('hidden');
    
    // Refresh room list to highlight active
    Actions.loadRooms(); 

    // Clear existing messages
    const box = $('messages');
    if (box) box.innerHTML = '';
    
    // Update online count
    $('room-online').textContent = typeof online === 'number' ? online : '0';

    // Reset history state
    UI.earliestMsgId = null;
    UI.loadingHistory = true;
    
    try {
      const data = await API.request(`/api/v1/rooms/${id}/messages?limit=50`, 'GET', null, true);
      const msgs = data.messages || [];
      if (msgs.length) {
        UI.earliestMsgId = msgs[0].id || msgs[0].ID || msgs[0].Id;
        msgs.forEach(m => UI.appendMessage(m));
      }
    } catch (e) {
      Toast.error("加载历史消息失败");
    } finally {
      UI.loadingHistory = false;
      UI.scrollToBottom();
    }

    // Connect WebSocket
    Socket.connect(id);
  },

  async loadMoreHistory() {
    if (!State.currentRoomId || !UI.earliestMsgId || UI.loadingHistory) return;
    
    UI.loadingHistory = true;
    const box = $('messages');
    const prevHeight = box.scrollHeight;

    try {
      const safeId = encodeURIComponent(UI.earliestMsgId);
      const data = await API.request(`/api/v1/rooms/${State.currentRoomId}/messages?limit=50&before_id=${safeId}`, 'GET', null, true);
      const msgs = data.messages || [];
      
      if (msgs.length) {
        UI.earliestMsgId = msgs[0].id || msgs[0].ID || msgs[0].Id;
        
        // Prepend messages in reverse order
        for (let i = msgs.length - 1; i >= 0; i--) {
          UI.appendMessage(msgs[i], { prepend: true });
        }

        // Maintain scroll position
        const newHeight = box.scrollHeight;
        box.scrollTop = newHeight - prevHeight;
      }
    } catch (e) {
      console.error('Load history error:', e);
    } finally {
      UI.loadingHistory = false;
    }
  },

  sendMessage() {
    const input = $('msg-input');
    const content = input.value.trim();
    if (!content) return;
    if (content.length > 2000) {
      Toast.error('消息不能超过2000个字符');
      return;
    }

    const sent = Socket.send('message', { content });
    if (sent) {
      input.value = '';
      input.style.height = 'auto';
      input.focus();
    }
  }
};

// --- 7. Initialization ---

// Visibility change handler for reconnection
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && State.currentRoomId) {
    // Refresh rooms and check connection when tab becomes visible
    Actions.loadRooms();
    if (Socket.ws?.readyState !== WebSocket.OPEN) {
      Socket.connect(State.currentRoomId);
    }
  }
});

// Network status handlers
window.addEventListener('online', () => {
  Toast.success('网络已恢复');
  if (State.currentRoomId && Socket.ws?.readyState !== WebSocket.OPEN) {
    Socket.connect(State.currentRoomId);
  }
});

window.addEventListener('offline', () => {
  Toast.error('网络已断开');
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Escape to close emoji picker
  if (e.key === 'Escape') {
    UI.hideEmojiPicker();
  }
  // Ctrl/Cmd + Enter to send (alternative)
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.activeElement === $('msg-input')) {
    e.preventDefault();
    Actions.sendMessage();
  }
});

// Start application
UI.init();

console.log('%c🚀 ChatRoom v2.0 启动完成', 'color: #3b82f6; font-weight: bold; font-size: 14px;');
