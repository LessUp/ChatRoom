import { useEffect, useMemo, useRef, useState } from 'react'

import { Api } from './api'
import { AuthScreen } from './screens/AuthScreen'
import { ChatSocket } from './socket'
import { useToast } from './toast'
import { clearAuth, loadAuth, saveTokens, saveUser, setLastRoomId } from './storage'
import type { ConnectionStatus, MessageDTO, Room, User, WsEvent } from './types'

type ChatItem = WsEvent

function formatTyping(names: string[]): string {
	if (names.length === 0) return ''
	if (names.length === 1) return `${names[0]} 正在输入...`
	if (names.length === 2) return `${names[0]} 和 ${names[1]} 正在输入...`
	return `${names[0]} 和其他 ${names.length - 1} 人正在输入...`
}

function escapeText(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderMessageContent(content: string) {
	const safe = escapeText(content)
	const parts: Array<{ type: 'text' | 'mention' | 'url'; value: string }> = []

	const re = /(@\w+)|(https?:\/\/[^\s<]+)/g
	let last = 0
	let m: RegExpExecArray | null
	while ((m = re.exec(safe)) !== null) {
		if (m.index > last) {
			parts.push({ type: 'text', value: safe.slice(last, m.index) })
		}
		const val = m[0]
		if (val.startsWith('@')) parts.push({ type: 'mention', value: val })
		else parts.push({ type: 'url', value: val })
		last = m.index + val.length
	}
	if (last < safe.length) parts.push({ type: 'text', value: safe.slice(last) })

	return (
		<>
			{parts.map((p, i) => {
				if (p.type === 'mention') {
					return (
						<span key={i} className="mention">
							{p.value}
						</span>
					)
				}
				if (p.type === 'url') {
					return (
						<a
							key={i}
							href={p.value}
							target="_blank"
							rel="noopener"
							className="text-primary-400 hover:underline"
						>
							{p.value}
						</a>
					)
				}
				return <span key={i}>{p.value}</span>
			})}
		</>
	)
}

export default function App() {
	const toast = useToast()
	const snapshot = useMemo(() => loadAuth(), [])

	const [user, setUser] = useState<User | null>(snapshot.user)
	const [accessToken, setAccessToken] = useState<string>(snapshot.accessToken)
	const [refreshToken, setRefreshToken] = useState<string>(snapshot.refreshToken)

	const [rooms, setRooms] = useState<Room[]>([])
	const [roomQuery, setRoomQuery] = useState('')
	const [newRoomName, setNewRoomName] = useState('')

	const [currentRoomId, setCurrentRoomId] = useState<number | null>(snapshot.lastRoomId)
	const [currentRoomName, setCurrentRoomName] = useState<string>('')
	const [onlineCount, setOnlineCount] = useState<number>(0)
	const [connStatus, setConnStatus] = useState<ConnectionStatus>('idle')

	const [items, setItems] = useState<ChatItem[]>([])
	const [draft, setDraft] = useState('')
	const [earliestMsgId, setEarliestMsgId] = useState<number | null>(null)
	const [loadingHistory, setLoadingHistory] = useState(false)

	const accessRef = useRef(accessToken)
	const refreshRef = useRef(refreshToken)
	const userRef = useRef<User | null>(user)
	useEffect(() => {
		accessRef.current = accessToken
	}, [accessToken])
	useEffect(() => {
		refreshRef.current = refreshToken
	}, [refreshToken])
	useEffect(() => {
		userRef.current = user
	}, [user])

	const boxRef = useRef<HTMLDivElement | null>(null)
	const typingTimersRef = useRef<Map<string, number>>(new Map())
	const [typingNames, setTypingNames] = useState<string[]>([])

	function logout(): void {
		socketRef.current?.close()
		clearAuth()
		setUser(null)
		setAccessToken('')
		setRefreshToken('')
		setRooms([])
		setCurrentRoomId(null)
		setCurrentRoomName('')
		setOnlineCount(0)
		setItems([])
		setDraft('')
		setEarliestMsgId(null)
		setTypingNames([])
		setConnStatus('idle')
	}

	const api = useMemo(() => {
		return new Api({
			getAccessToken: () => accessRef.current,
			getRefreshToken: () => refreshRef.current,
			callbacks: {
				onTokens: (at, rt) => {
					setAccessToken(at)
					setRefreshToken(rt)
				},
				onUnauthorized: () => {
					logout()
				},
			},
		})
	}, [])

	const socketRef = useRef<ChatSocket | null>(null)
	useEffect(() => {
		const sock = new ChatSocket({
			getAccessToken: () => accessRef.current,
			onStatus: (s, attempt) => {
				setConnStatus(s)
				if (s === 'reconnecting' && attempt) {
					return
				}
			},
			onEvent: (evt) => {
				if (!evt || typeof evt !== 'object') return
				switch (evt.type) {
					case 'pong':
						return
					case 'error':
						toast.error(evt.content || '发生错误')
						return
					case 'typing': {
						const u = evt.username
						if (!u || u === userRef.current?.username) return
						const timers = typingTimersRef.current
						const old = timers.get(u)
						if (old) window.clearTimeout(old)
						if (evt.is_typing) {
							const id = window.setTimeout(() => {
								timers.delete(u)
								setTypingNames(Array.from(timers.keys()))
							}, 3000)
							timers.set(u, id)
						} else {
							timers.delete(u)
						}
						setTypingNames(Array.from(timers.keys()))
						return
					}
					case 'join':
					case 'leave':
						setItems((prev) => [...prev, evt])
						if (typeof evt.online === 'number') setOnlineCount(evt.online)
						return
					case 'message':
						setItems((prev) => [...prev, evt])
						return
					default:
						return
				}
			},
		})
		socketRef.current = sock
		return () => {
			sock.close()
			for (const id of typingTimersRef.current.values()) {
				window.clearTimeout(id)
			}
			typingTimersRef.current.clear()
		}
	}, [toast])

	useEffect(() => {
		if (!user || !accessToken) return
		void (async () => {
			try {
				const data = await api.listRooms()
				setRooms(data.rooms || [])
			} catch {
				return
			}
		})()
	}, [api, user, accessToken])

	useEffect(() => {
		if (!user || !accessToken) return
		if (!currentRoomId) return
		if (currentRoomName) return
		const found = rooms.find((r) => r.id === currentRoomId)
		if (found) {
			setCurrentRoomName(found.name)
			setOnlineCount(found.online)
		}
	}, [rooms, user, accessToken, currentRoomId, currentRoomName])

	useEffect(() => {
		if (!boxRef.current) return
		boxRef.current.scrollTop = boxRef.current.scrollHeight
	}, [items, currentRoomId])

	async function handleLogin(username: string, password: string): Promise<void> {
		try {
			const data = await api.login(username, password)
			saveTokens(data.access_token, data.refresh_token)
			saveUser(data.user)
			setAccessToken(data.access_token)
			setRefreshToken(data.refresh_token)
			setUser(data.user)
			toast.success(`欢迎回来，${data.user.username}！`)
		} catch {
			toast.error('登录失败，请检查用户名和密码')
		}
	}

	async function handleRegister(username: string, password: string): Promise<void> {
		try {
			await api.register(username, password)
		} catch {
			toast.error('注册失败: 用户名可能已存在')
		}
	}

	async function reloadRooms(): Promise<void> {
		if (!user) return
		try {
			const data = await api.listRooms()
			setRooms(data.rooms || [])
		} catch {
			return
		}
	}

	async function createRoom(): Promise<void> {
		const name = newRoomName.trim()
		if (!name) {
			toast.info('请输入房间名')
			return
		}
		if (name.length > 50) {
			toast.error('房间名不能超过50个字符')
			return
		}
		try {
			const data = await api.createRoom(name)
			setNewRoomName('')
			toast.success('房间创建成功')
			await reloadRooms()
			const rid = data.room?.id ?? data.id
			const rname = data.room?.name ?? data.name
			await joinRoom(rid, rname, 0)
		} catch {
			toast.error('创建失败')
		}
	}

	async function joinRoom(id: number, name: string, online: number): Promise<void> {
		if (currentRoomId === id) return
		setCurrentRoomId(id)
		setLastRoomId(id)
		setCurrentRoomName(name)
		setOnlineCount(typeof online === 'number' ? online : 0)
		setItems([])
		setTypingNames([])
		setEarliestMsgId(null)
		setLoadingHistory(true)

		try {
			const data = await api.listMessages(id, 50)
			const msgs = data.messages || []
			if (msgs.length > 0) setEarliestMsgId(msgs[0].id)
			setItems(msgs)
		} catch {
			toast.error('加载历史消息失败')
		} finally {
			setLoadingHistory(false)
		}

		const token = accessRef.current
		if (token) {
			socketRef.current?.connect(id, token)
		}
	}

	async function loadMoreHistory(): Promise<void> {
		if (!currentRoomId || !earliestMsgId || loadingHistory) return
		const box = boxRef.current
		if (!box) return
		setLoadingHistory(true)
		const prevHeight = box.scrollHeight
		try {
			const data = await api.listMessages(currentRoomId, 50, earliestMsgId)
			const msgs = data.messages || []
			if (msgs.length > 0) {
				setEarliestMsgId(msgs[0].id)
				setItems((prev) => [...msgs, ...prev])
				window.requestAnimationFrame(() => {
					const newHeight = box.scrollHeight
					box.scrollTop = newHeight - prevHeight
				})
			}
		} finally {
			setLoadingHistory(false)
		}
	}

	function sendMessage(): void {
		const content = draft.trim()
		if (!content) return
		if (content.length > 2000) {
			toast.error('消息不能超过2000个字符')
			return
		}
		const ok = socketRef.current?.sendMessage(content) ?? false
		if (!ok) toast.info('消息已加入发送队列')
		setDraft('')
	}

	const colors = useMemo(
		() => [
			'from-violet-500 to-purple-600',
			'from-blue-500 to-cyan-500',
			'from-emerald-500 to-teal-500',
			'from-orange-500 to-red-500',
			'from-pink-500 to-rose-500',
		],
		[],
	)

	if (!user) {
		return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />
	}

	const filteredRooms = rooms.filter((r) => {
		const q = roomQuery.trim().toLowerCase()
		if (!q) return true
		return r.name.toLowerCase().includes(q)
	})

	return (
		<div className="h-full flex">
			<div className="w-80 bg-dark-900/95 glass border-r border-dark-800 flex flex-col">
				<div className="p-4 border-b border-dark-800">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="relative">
								<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-semibold text-sm shadow-lg avatar-ring">
									<span>{user.username.substring(0, 2).toUpperCase()}</span>
								</div>
								<span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-dark-900 rounded-full status-online" />
							</div>
							<div>
								<p className="font-semibold text-sm">{user.username}</p>
								<p className="text-xs text-gray-500">在线</p>
							</div>
						</div>
						<button
							type="button"
							className="p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition-colors"
							title="退出"
							onClick={() => {
								logout()
								toast.info('已退出登录')
							}}
						>
							<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
								/>
							</svg>
						</button>
					</div>
				</div>

				<div className="p-4 border-b border-dark-800">
					<div className="relative">
						<span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
								/>
							</svg>
						</span>
						<input
							value={roomQuery}
							onChange={(e) => setRoomQuery(e.target.value)}
							className="w-full bg-dark-800/50 border border-dark-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-all"
							placeholder="搜索房间..."
						/>
					</div>
				</div>

				<div className="p-4 border-b border-dark-800">
					<div className="flex gap-2">
						<input
							value={newRoomName}
							onChange={(e) => setNewRoomName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') void createRoom()
							}}
							className="flex-1 bg-dark-800/50 border border-dark-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-all"
							placeholder="新房间名称"
						/>
						<button
							type="button"
							onClick={() => void createRoom()}
							className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1"
						>
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
							</svg>
							创建
						</button>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto">
					<div className="p-3">
						<h3 className="px-2 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
							<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
								/>
							</svg>
							房间列表
						</h3>
						<div className="space-y-1">
							{filteredRooms.map((r) => {
								const active = currentRoomId === r.id
								const color = colors[r.id % colors.length]
								return (
									<div
										key={r.id}
										className={`room-item group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
											active
												? 'active bg-primary-500/10 border-l-2 border-primary-500'
												: 'hover:bg-dark-800/50 border-l-2 border-transparent'
										}`}
										onClick={() => void joinRoom(r.id, r.name, r.online)}
									>
										<div
											className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold text-sm shadow-lg flex-shrink-0`}
										>
											{r.name.charAt(0).toUpperCase()}
										</div>
										<div className="flex-1 min-w-0">
											<div className="flex items-center justify-between">
												<span
													className={`font-medium text-sm truncate ${
														active ? 'text-white' : 'text-gray-300 group-hover:text-white'
													}`}
												>
													{r.name}
												</span>
											</div>
											<div className="flex items-center gap-2 mt-0.5">
												<span
													className={`w-1.5 h-1.5 rounded-full ${
														(r.online || 0) > 0 ? 'bg-emerald-500' : 'bg-gray-600'
													}`}
												/>
												<span className="text-xs text-gray-500">{r.online || 0} 在线</span>
											</div>
										</div>
									</div>
								)
							})}
						</div>
					</div>
				</div>
			</div>

			<div className="flex-1 flex flex-col bg-dark-950">
				{!currentRoomId ? (
					<div className="flex-1 flex items-center justify-center">
						<div className="text-center">
							<div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-primary-500/20 to-purple-500/20 flex items-center justify-center">
								<svg className="w-12 h-12 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth="1.5"
										d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
									/>
								</svg>
							</div>
							<h2 className="text-2xl font-bold gradient-text mb-2">欢迎回来!</h2>
							<p className="text-gray-500 mb-6">选择一个房间开始聊天</p>
						</div>
					</div>
				) : (
					<div className="flex-1 flex flex-col h-full">
						<div className="h-16 border-b border-dark-800 flex items-center px-6 bg-dark-900/80 glass justify-between">
							<div className="flex items-center gap-3">
								<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-lg">
									<span>{currentRoomName ? currentRoomName.charAt(0).toUpperCase() : '#'}</span>
								</div>
								<div>
									<div className="flex items-center gap-2">
										<h2 className="text-lg font-semibold">{currentRoomName || 'Room'}</h2>
										{connStatus !== 'connected' && connStatus !== 'idle' ? (
											<span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-yellow-500/20 text-yellow-400 connection-pulse">
												{connStatus === 'reconnecting' ? '重连中' : connStatus === 'connecting' ? '连接中' : '已断开'}
											</span>
										) : null}
									</div>
									<div className="flex items-center gap-2 text-xs text-gray-500">
										<span className="w-2 h-2 bg-emerald-500 rounded-full" />
										<span>{onlineCount}</span> 人在线
									</div>
								</div>
							</div>
							<div />
						</div>

						<div
							ref={boxRef}
							className="flex-1 overflow-y-auto p-6 space-y-1"
							onScroll={() => {
								const box = boxRef.current
								if (!box) return
								if (box.scrollTop <= 20) void loadMoreHistory()
							}}
						>
							{items.map((m) => {
								if (m.type === 'join' || m.type === 'leave') {
									return (
										<div key={`${m.type}-${m.user_id}-${m.online}-${m.room_id}-${m.username}`} className="flex justify-center my-4">
											<span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-dark-800/50 px-3 py-1.5 rounded-full border border-dark-700/50">
												<span className={m.type === 'join' ? 'text-emerald-400' : ''}>{m.username}</span>
												{m.type === 'join' ? '加入了房间' : '离开了房间'}
											</span>
										</div>
									)
								}
								if (m.type !== 'message') return null
								const msg = m as MessageDTO
								const isMe = msg.username === user.username
								const ts = new Date(msg.created_at).toLocaleTimeString([], {
									hour: '2-digit',
									minute: '2-digit',
								})
								const wrapperCls = `msg-wrapper group flex gap-3 ${isMe ? 'flex-row-reverse' : ''} msg-appear`
								return (
									<div key={msg.id} className={wrapperCls}>
										{!isMe ? (
											<div
												className={`w-8 h-8 rounded-xl bg-gradient-to-br ${colors[msg.user_id % colors.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1`}
											>
												{msg.username.substring(0, 2).toUpperCase()}
											</div>
										) : null}
										<div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
											<div className={`flex items-center gap-2 mb-1 text-xs ${isMe ? 'flex-row-reverse' : ''}`}>
												<span className="font-medium text-gray-400">{msg.username}</span>
												<span className="text-gray-600">{ts}</span>
											</div>
											<div className={`${isMe ? 'msg-own' : 'msg-other'} px-4 py-2.5 max-w-full break-words text-sm leading-relaxed`}>
												{renderMessageContent(msg.content)}
											</div>
										</div>
									</div>
								)
							})}
						</div>

						<div className="px-6 h-6 flex items-center">
							<div className={`text-xs text-gray-500 flex items-center gap-1.5 transition-opacity duration-300 ${typingNames.length ? '' : 'opacity-0'}`}>
								<span className="flex gap-1">
									<span className="w-1.5 h-1.5 bg-primary-400 rounded-full typing-dot" />
									<span className="w-1.5 h-1.5 bg-primary-400 rounded-full typing-dot" />
									<span className="w-1.5 h-1.5 bg-primary-400 rounded-full typing-dot" />
								</span>
								<span>{formatTyping(typingNames)}</span>
							</div>
						</div>

						<div className="p-4 bg-dark-900/80 glass border-t border-dark-800">
							<div className="flex items-end gap-3">
								<div className="flex-1 relative">
									<textarea
										value={draft}
										onChange={(e) => {
											setDraft(e.target.value)
											socketRef.current?.sendTyping(true)
										}}
										onKeyDown={(e) => {
											if (e.key === 'Enter' && !e.shiftKey) {
												e.preventDefault()
												sendMessage()
											}
									}}
										rows={1}
										className="w-full bg-dark-800/50 border border-dark-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 input-glow transition-all resize-none"
										placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
										style={{ maxHeight: 120 }}
									/>
								</div>
								<button
									type="button"
									onClick={() => sendMessage()}
									className="bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white p-3 rounded-xl font-medium transition-all btn-shine shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
								>
									<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth="2"
											d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
										/>
									</svg>
								</button>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
