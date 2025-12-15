import type { ConnectionStatus, WsEvent } from './types'

type Outbound =
  | { type: 'ping' }
  | { type: 'typing'; is_typing: boolean }
  | { type: 'message'; content: string }

export class ChatSocket {
	private getAccessToken: () => string
	private onEvent: (evt: WsEvent) => void
	private onStatus: (status: ConnectionStatus, attempt?: number) => void

  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnect = 10
  private shouldReconnect = false
  private currentRoomId: number | null = null
  private heartbeatInterval: number | null = null
  private heartbeatTimeout: number | null = null
  private messageQueue: Outbound[] = []
  private lastPong = Date.now()

  constructor(opts: {
		getAccessToken: () => string
		onEvent: (evt: WsEvent) => void
		onStatus: (status: ConnectionStatus, attempt?: number) => void
	}) {
		this.getAccessToken = opts.getAccessToken
		this.onEvent = opts.onEvent
		this.onStatus = opts.onStatus
	}

  connect(roomId: number, accessToken: string): void {
    if (this.ws) this.close(false)

    this.currentRoomId = roomId
    this.shouldReconnect = true

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${location.host}/ws?room_id=${roomId}&token=${encodeURIComponent(accessToken)}`

    this.onStatus('connecting')

    try {
      this.ws = new WebSocket(url)
    } catch {
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.lastPong = Date.now()
      this.onStatus('connected')
      this.startHeartbeat()
      this.flushQueue()
    }

    this.ws.onclose = () => {
      this.stopHeartbeat()
      this.onStatus('disconnected')
      if (this.shouldReconnect) this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      this.onStatus('disconnected')
    }

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as unknown
        if (typeof msg === 'object' && msg !== null && 'type' in msg) {
          const t = (msg as { type?: unknown }).type
          if (t === 'pong') {
            this.lastPong = Date.now()
            if (this.heartbeatTimeout) {
              window.clearTimeout(this.heartbeatTimeout)
              this.heartbeatTimeout = null
            }
          }
        }
        this.onEvent(msg as WsEvent)
      } catch {
        return
      }
    }
  }

  close(clearQueue = true): void {
    this.shouldReconnect = false
    this.stopHeartbeat()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    if (clearQueue) this.messageQueue = []
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()

    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' }, true)
        this.heartbeatTimeout = window.setTimeout(() => {
          if (Date.now() - this.lastPong > 35000) {
            this.ws?.close()
          }
        }, 5000)
      }
    }, 30000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      window.clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.heartbeatTimeout) {
      window.clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnect) {
      this.onStatus('disconnected')
      return
    }

    const delay = Math.min(15000, 1000 * Math.pow(1.5, this.reconnectAttempts))
    this.reconnectAttempts++

    this.onStatus('reconnecting', this.reconnectAttempts)

    window.setTimeout(() => {
      if (!this.shouldReconnect || !this.currentRoomId) return
      const token = this.getAccessToken()
      if (!token) {
        this.onStatus('disconnected')
        return
      }
      this.connect(this.currentRoomId, token)
    }, delay)
  }

  reconnect(roomId: number): void {
		if (!this.shouldReconnect) return
		const token = this.getAccessToken()
		if (!token) return
		this.connect(roomId, token)
	}

  private flushQueue(): void {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()
      if (!msg) break
      this.send(msg, true)
    }
  }

  private send(payload: Outbound, skipQueue: boolean): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (!skipQueue && payload.type === 'message') {
        this.messageQueue.push(payload)
      }
      return false
    }

    this.ws.send(JSON.stringify(payload))
    return true
  }

  sendMessage(content: string): boolean {
    return this.send({ type: 'message', content }, false)
  }

  sendTyping(isTyping: boolean): void {
    this.send({ type: 'typing', is_typing: isTyping }, true)
  }
}
