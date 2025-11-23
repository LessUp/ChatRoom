(() => {
  const $ = (id) => document.getElementById(id);
  let accessToken = '';
  let refreshToken = '';
  let currentUser = null;
  let currentRoomId = null;
  let ws = null;
  let reconnectAttempts = 0;
  const maxReconnect = 8;
  const typingUsers = new Map(); // username -> timeoutId
  let typingActive = false;
  let typingStopTimer = null;
  let earliestMsgId = null;
  let loadingHistory = false;

  function setCurrentUser(user) {
    currentUser = user;
    if (user) {
      localStorage.setItem('chat_user', JSON.stringify(user));
      updateAuthUI(true);
    } else {
      localStorage.removeItem('chat_user');
      updateAuthUI(false);
    }
  }

  function updateAuthUI(isLoggedIn) {
    const authScreen = $("auth-screen");
    const appScreen = $("app-screen");
    const usernameDisplay = $("current-username");
    
    if (authScreen && appScreen) {
        if (isLoggedIn) {
            authScreen.classList.add('hidden');
            appScreen.classList.remove('hidden');
            if (usernameDisplay && currentUser) {
                usernameDisplay.textContent = currentUser.username;
            }
        } else {
            authScreen.classList.remove('hidden');
            appScreen.classList.add('hidden');
        }
    }
  }

  function setTokens(a, r) {
    if (a) accessToken = a;
    if (r) refreshToken = r;
    // $("access").textContent = accessToken; // Removing debug UI
    // $("refresh").textContent = refreshToken; // Removing debug UI
    try {
      localStorage.setItem('chat_access', accessToken || '');
      localStorage.setItem('chat_refresh', refreshToken || '');
    } catch {}
  }

  async function api(path, method = 'GET', body = null, auth = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
    let res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    if (!res.ok) {
      // try refresh once on 401 for authed requests
      if (auth && res.status === 401 && refreshToken) {
        try {
          const r = await fetch('/api/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refreshToken }) });
          if (r.ok) {
            const data = await r.json();
            setTokens(data.access_token, data.refresh_token);
            // retry original
            headers['Authorization'] = 'Bearer ' + accessToken;
            res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : null });
          }
        } catch {}
      }
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function renderRooms(rooms) {
    const wrap = $("rooms-list");
    if (!wrap) return;
    wrap.innerHTML = '';
    rooms.forEach(r => {
      const div = document.createElement('div');
      div.className = `p-3 mb-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-700 ${currentRoomId === r.id ? 'bg-blue-600' : 'bg-gray-800'}`;
      div.innerHTML = `
        <div class="font-medium">${r.name}</div>
        <div class="text-xs text-gray-400">ID: ${r.id} · 在线: ${r.online}</div>
      `;
      div.onclick = () => joinRoom(r.id, r.name, r.online);
      wrap.appendChild(div);
    });
  }

  function getId(m) {
    return m.id || m.ID || m.Id;
  }

  function appendMsg(m, { prepend = false } = {}) {
    const box = $("messages");
    if (!box) return;
    
    const type = m.type || m.Type || 'message';
    const div = document.createElement('div');
    
    if (type === 'message') {
      const user = m.username || m.Username || m.user || m.User || m.user_id || m.UserID;
      const content = m.content || m.Content || '';
      const ts = new Date(m.created_at || m.CreatedAt || m.createdAt || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const isMe = currentUser && user === currentUser.username;
      
      div.className = `flex flex-col mb-4 ${isMe ? 'items-end' : 'items-start'}`;
      div.innerHTML = `
        <div class="flex items-baseline space-x-2 ${isMe ? 'flex-row-reverse space-x-reverse' : ''}">
          <span class="text-xs text-gray-400">${user}</span>
          <span class="text-xs text-gray-500">${ts}</span>
        </div>
        <div class="mt-1 px-4 py-2 rounded-2xl max-w-[85%] break-words ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-700 text-gray-100 rounded-tl-none'}">
          ${content}
        </div>
      `;
    } else if (type === 'join' || type === 'leave') {
      const user = m.username || m.Username || m.user || m.User || m.user_id || m.UserID;
      div.className = 'flex justify-center my-2';
      div.innerHTML = `<span class="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-full">${user} ${type === 'join' ? '加入' : '离开'}了房间</span>`;
      
      if (typeof m.online === 'number') {
        const el = $("room-online");
        if (el) el.textContent = m.online;
      }
    } else {
      return;
    }

    if (prepend) {
      box.insertBefore(div, box.firstChild);
    } else {
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    }
  }

  async function loadRooms() {
    try {
      const data = await api('/api/v1/rooms', 'GET', null, true);
      renderRooms(data.rooms || []);
    } catch (e) {
      console.error(e);
      alert('拉取房间失败，是否已登录？');
    }
  }

  async function joinRoom(id, name, online) {
    currentRoomId = id;
    $("current-room-name").textContent = name;
    $("welcome-message").classList.add('hidden');
    $("chat-area").classList.remove('hidden');
    
    // Update room list highlighting
    loadRooms(); 

    try { localStorage.setItem('chat_last_room', String(id)); } catch {}
    $("messages").innerHTML = '';
    const onlineEl = $("room-online");
    if (onlineEl) onlineEl.textContent = typeof online === 'number' ? String(online) : '0';
    
    earliestMsgId = null;
    try {
      const data = await api(`/api/v1/rooms/${id}/messages?limit=50`, 'GET', null, true);
      const msgs = data.messages || [];
      msgs.forEach(m => appendMsg(m));
      if (msgs.length) earliestMsgId = getId(msgs[0]);
    } catch {}
    connectWS();
  }

  function connectWS() {
    if (!currentRoomId || !accessToken) return;
    if (ws) {
      try { ws.close(); } catch {}
      ws = null;
    }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}/ws?room_id=${currentRoomId}&token=${encodeURIComponent(accessToken)}`;
    ws = new WebSocket(url);
    ws.onopen = () => { console.log('WS open'); reconnectAttempts = 0; };
    ws.onclose = () => {
      console.log('WS close');
      scheduleReconnect();
    };
    ws.onerror = (e) => console.log('WS error', e);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        const type = msg.type || msg.Type || 'message';
        if (type === 'typing') {
          handleTyping(msg.username || msg.user_id, !!msg.is_typing);
          return;
        }
        appendMsg(msg);
      } catch {}
    };
  }

  function scheduleReconnect() {
    if (!currentRoomId) return;
    if (reconnectAttempts >= maxReconnect) return;
    const delay = Math.min(15000, 500 * Math.pow(2, reconnectAttempts));
    reconnectAttempts++;
    setTimeout(() => connectWS(), delay);
  }

  async function register() {
    const username = $("reg-username").value.trim();
    const password = $("reg-password").value;
    if (!username || !password) return alert('请输入用户名和密码');
    try {
      await api('/api/v1/auth/register', 'POST', { username, password });
      alert('注册成功，请登录');
    } catch (e) {
      alert('注册失败，可能是用户名已存在');
    }
  }

  async function login() {
    const username = $("login-username").value.trim();
    const password = $("login-password").value;
    if (!username || !password) return alert('请输入用户名和密码');
    try {
      const data = await api('/api/v1/auth/login', 'POST', { username, password });
      setTokens(data.access_token, data.refresh_token);
      setCurrentUser(data.user);
      await loadRooms();
    } catch (e) {
      alert('登录失败');
    }
  }

  function logout() {
    setTokens('', '');
    setCurrentUser(null);
    if (ws) { try { ws.close(); } catch {} ws = null; }
    currentRoomId = null;
    localStorage.removeItem('chat_last_room');
    window.location.reload();
  }

  async function refresh() {
    if (!refreshToken) return alert('无刷新令牌');
    try {
      const data = await api('/api/v1/auth/refresh', 'POST', { refresh_token: refreshToken });
      setTokens(data.access_token, data.refresh_token);
      connectWS();
    } catch { alert('刷新失败，请重新登录'); }
  }

  async function createRoom() {
    const name = $("room-name").value.trim();
    if (!name) return;
    try {
      await api('/api/v1/rooms', 'POST', { name }, true);
      $("room-name").value = '';
      await loadRooms();
    } catch { alert('创建房间失败'); }
  }

  function sendMessage() {
    const input = $("msg-input");
    const content = input.value.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN) return alert('WS 未连接');
    if (!content) return;
    ws.send(JSON.stringify({ type: 'message', content }));
    input.value = '';
  }

  function sendTyping(isTyping) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'typing', is_typing: !!isTyping }));
  }

  function handleTyping(username, isTyping) {
    const el = $("typing");
    if (isTyping) {
      if (typingUsers.has(username)) clearTimeout(typingUsers.get(username));
      typingUsers.set(username, setTimeout(() => {
        typingUsers.delete(username);
        renderTyping();
      }, 2000));
    } else {
      if (typingUsers.has(username)) { clearTimeout(typingUsers.get(username)); typingUsers.delete(username); }
    }
    renderTyping();
  }

  function renderTyping() {
    const el = $("typing");
    const names = Array.from(typingUsers.keys());
    el.textContent = names.length ? `${names.join('、')} 正在输入...` : '';
  }

  async function loadMoreHistory() {
    if (!currentRoomId || loadingHistory || earliestMsgId == null) return;
    loadingHistory = true;
    const box = $("messages");
    const prevHeight = box.scrollHeight;
    try {
      const data = await api(`/api/v1/rooms/${currentRoomId}/messages?limit=50&before_id=${encodeURIComponent(earliestMsgId)}`, 'GET', null, true);
      const msgs = data.messages || [];
      if (msgs.length) {
        earliestMsgId = getId(msgs[0]);
        // prepend in reverse to keep chronological order overall
        for (let i = msgs.length - 1; i >= 0; i--) {
          appendMsg(msgs[i], { prepend: true });
        }
        const newHeight = box.scrollHeight;
        box.scrollTop = newHeight - prevHeight; // keep viewport position
      }
    } catch (e) {
      console.error(e);
    } finally {
      loadingHistory = false;
    }
  }

  $("btn-register").onclick = register;
  $("btn-login").onclick = login;
  // $("btn-refresh").onclick = refresh; // Hidden in UI
  $("btn-create-room").onclick = createRoom;
  // $("btn-list-rooms").onclick = loadRooms; // Auto refresh
  $("btn-send").onclick = sendMessage;
  const btnLogout = $("btn-logout");
  if (btnLogout) btnLogout.onclick = logout;
  
  $("msg-input").addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  $("msg-input").addEventListener('input', () => {
    if (!typingActive) { typingActive = true; sendTyping(true); }
    if (typingStopTimer) clearTimeout(typingStopTimer);
    typingStopTimer = setTimeout(() => { typingActive = false; sendTyping(false); }, 1200);
  });
  $("messages").addEventListener('scroll', () => {
    const box = $("messages");
    if (box.scrollTop <= 5) loadMoreHistory();
  });

  // boot
  try {
    const a = localStorage.getItem('chat_access');
    const r = localStorage.getItem('chat_refresh');
    const u = localStorage.getItem('chat_user');
    if (a || r) {
        setTokens(a || '', r || '');
        if (u) setCurrentUser(JSON.parse(u));
        else updateAuthUI(true); // Fallback if user data missing
        
        loadRooms();
        const last = localStorage.getItem('chat_last_room');
        if (last) {
        setTimeout(() => joinRoom(parseInt(last, 10), '...'), 500);
        }
    } else {
        updateAuthUI(false);
    }
  } catch {}
})();
