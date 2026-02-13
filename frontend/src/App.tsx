import { useEffect, useMemo, useRef, useState } from 'react'

import { Api } from './api'
import { ChatRoom } from './components/ChatRoom'
import { Sidebar } from './components/Sidebar'
import { AuthScreen } from './screens/AuthScreen'
import { ChatSocket } from './socket'
import { useToast } from './toast'
import { clearAuth, loadAuth, saveTokens, saveUser, setLastRoomId } from './storage'
import type { ConnectionStatus, Room, User, WsEvent } from './types'

type ChatItem = WsEvent

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
						setItems((prev) => {
							if (evt.id && prev.some((m) => m.type === 'message' && m.id === evt.id)) return prev
							return [...prev, evt]
						})
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
		setLoadingHistory(true)
		try {
			const data = await api.listMessages(currentRoomId, 50, earliestMsgId)
			const msgs = data.messages || []
			if (msgs.length > 0) {
				setEarliestMsgId(msgs[0].id)
				setItems((prev) => [...msgs, ...prev])
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

	if (!user) {
		return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />
	}

	return (
		<div className="h-full flex">
			<Sidebar
				user={user}
				rooms={rooms}
				currentRoomId={currentRoomId}
				roomQuery={roomQuery}
				newRoomName={newRoomName}
				onRoomQueryChange={setRoomQuery}
				onNewRoomNameChange={setNewRoomName}
				onCreateRoom={() => void createRoom()}
				onJoinRoom={(id, name, online) => void joinRoom(id, name, online)}
				onLogout={() => {
					logout()
					toast.info('已退出登录')
				}}
			/>

			<div className="flex-1 flex flex-col bg-dark-950">
				<ChatRoom
					user={user}
					currentRoomId={currentRoomId}
					currentRoomName={currentRoomName}
					onlineCount={onlineCount}
					connStatus={connStatus}
					items={items}
					draft={draft}
					typingNames={typingNames}
					onDraftChange={setDraft}
					onSend={sendMessage}
					onTyping={() => socketRef.current?.sendTyping(true)}
					onLoadMore={() => void loadMoreHistory()}
				/>
			</div>
		</div>
	)
}
