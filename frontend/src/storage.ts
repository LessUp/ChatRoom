import type { User } from './types'

const ACCESS_KEY = 'chat_access'
const REFRESH_KEY = 'chat_refresh'
const USER_KEY = 'chat_user'
const LAST_ROOM_KEY = 'chat_last_room'

export interface AuthSnapshot {
  accessToken: string
  refreshToken: string
  user: User | null
  lastRoomId: number | null
}

export function loadAuth(): AuthSnapshot {
  const accessToken = localStorage.getItem(ACCESS_KEY) || ''
  const refreshToken = localStorage.getItem(REFRESH_KEY) || ''

  let user: User | null = null
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'id' in parsed &&
        'username' in parsed &&
        typeof (parsed as { id: unknown }).id === 'number' &&
        typeof (parsed as { username: unknown }).username === 'string'
      ) {
        user = parsed as User
      }
    }
  } catch {
    user = null
  }

  const lastRoomRaw = localStorage.getItem(LAST_ROOM_KEY)
  const lastRoomId = lastRoomRaw ? Number(lastRoomRaw) : null

  return {
    accessToken,
    refreshToken,
    user,
    lastRoomId: Number.isFinite(lastRoomId) && (lastRoomId ?? 0) > 0 ? lastRoomId : null,
  }
}

export function saveTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function saveUser(user: User | null): void {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    return
  }
  localStorage.removeItem(USER_KEY)
}

export function setLastRoomId(id: number | null): void {
  if (id && id > 0) {
    localStorage.setItem(LAST_ROOM_KEY, String(id))
    return
  }
  localStorage.removeItem(LAST_ROOM_KEY)
}

export function clearAuth(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(LAST_ROOM_KEY)
}
