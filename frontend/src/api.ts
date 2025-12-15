import { clearAuth, saveTokens } from './storage'
import type { AuthLoginResponse, AuthRegisterResponse, CreateRoomResponse, MessageDTO, Room } from './types'

export interface ApiAuthCallbacks {
  onTokens?: (accessToken: string, refreshToken: string) => void
  onUnauthorized?: () => void
}

async function safeJson<T>(res: Response): Promise<T> {
  const txt = await res.text()
  if (!txt) return {} as T
  return JSON.parse(txt) as T
}

export class Api {
  private callbacks: ApiAuthCallbacks
  private getAccessToken: () => string
  private getRefreshToken: () => string

  constructor(opts: {
    getAccessToken: () => string
    getRefreshToken: () => string
    callbacks?: ApiAuthCallbacks
  }) {
    this.getAccessToken = opts.getAccessToken
    this.getRefreshToken = opts.getRefreshToken
    this.callbacks = opts.callbacks ?? {}
  }

  private async refresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken()
    if (!refreshToken) return false

    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })

    if (!res.ok) return false

    const data = (await safeJson<{ access_token: string; refresh_token: string }>(res))
    if (!data.access_token || !data.refresh_token) return false

    saveTokens(data.access_token, data.refresh_token)
    this.callbacks.onTokens?.(data.access_token, data.refresh_token)
    return true
  }

  private async request<T>(
    path: string,
    method: string,
    body: unknown | null,
    authRequired: boolean,
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authRequired) {
      const at = this.getAccessToken()
      if (at) headers.Authorization = `Bearer ${at}`
    }

    let res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    })

    if (authRequired && res.status === 401) {
      const ok = await this.refresh()
      if (!ok) {
        clearAuth()
        this.callbacks.onUnauthorized?.()
        throw new Error('unauthorized')
      }
      const at = this.getAccessToken()
      if (at) headers.Authorization = `Bearer ${at}`
      res = await fetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
      })
    }

    if (!res.ok) {
      const err = new Error(`request failed: ${res.status}`)
      ;(err as { status?: number }).status = res.status
      throw err
    }

    return safeJson<T>(res)
  }

  register(username: string, password: string): Promise<AuthRegisterResponse> {
    return this.request<AuthRegisterResponse>('/api/v1/auth/register', 'POST', { username, password }, false)
  }

  login(username: string, password: string): Promise<AuthLoginResponse> {
    return this.request<AuthLoginResponse>('/api/v1/auth/login', 'POST', { username, password }, false)
  }

  listRooms(): Promise<{ rooms: Room[] }> {
    return this.request<{ rooms: Room[] }>('/api/v1/rooms', 'GET', null, true)
  }

  createRoom(name: string): Promise<CreateRoomResponse> {
    return this.request<CreateRoomResponse>('/api/v1/rooms', 'POST', { name }, true)
  }

  listMessages(roomId: number, limit = 50, beforeId?: number): Promise<{ messages: MessageDTO[] }> {
    const qs = new URLSearchParams({ limit: String(limit) })
    if (beforeId && beforeId > 0) qs.set('before_id', String(beforeId))
    return this.request<{ messages: MessageDTO[] }>(`/api/v1/rooms/${roomId}/messages?${qs.toString()}`, 'GET', null, true)
  }
}
