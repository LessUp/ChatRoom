import type { Room, User } from '../types'

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-orange-500 to-red-500',
  'from-pink-500 to-rose-500',
]

interface SidebarProps {
  user: User
  rooms: Room[]
  currentRoomId: number | null
  roomQuery: string
  newRoomName: string
  onRoomQueryChange: (q: string) => void
  onNewRoomNameChange: (name: string) => void
  onCreateRoom: () => void
  onJoinRoom: (id: number, name: string, online: number) => void
  onLogout: () => void
}

export function Sidebar({
  user,
  rooms,
  currentRoomId,
  roomQuery,
  newRoomName,
  onRoomQueryChange,
  onNewRoomNameChange,
  onCreateRoom,
  onJoinRoom,
  onLogout,
}: SidebarProps) {
  const filteredRooms = rooms.filter((r) => {
    const q = roomQuery.trim().toLowerCase()
    if (!q) return true
    return r.name.toLowerCase().includes(q)
  })

  return (
    <div className="w-80 bg-dark-900/95 glass border-r border-dark-800 flex flex-col">
      {/* 用户信息 */}
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
            onClick={onLogout}
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

      {/* 搜索框 */}
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
            onChange={(e) => onRoomQueryChange(e.target.value)}
            className="w-full bg-dark-800/50 border border-dark-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-all"
            placeholder="搜索房间..."
          />
        </div>
      </div>

      {/* 创建房间 */}
      <div className="p-4 border-b border-dark-800">
        <div className="flex gap-2">
          <input
            value={newRoomName}
            onChange={(e) => onNewRoomNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreateRoom()
            }}
            className="flex-1 bg-dark-800/50 border border-dark-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-all"
            placeholder="新房间名称"
          />
          <button
            type="button"
            onClick={onCreateRoom}
            className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            创建
          </button>
        </div>
      </div>

      {/* 房间列表 */}
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
              const color = AVATAR_COLORS[r.id % AVATAR_COLORS.length]
              return (
                <div
                  key={r.id}
                  className={`room-item group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                    active
                      ? 'active bg-primary-500/10 border-l-2 border-primary-500'
                      : 'hover:bg-dark-800/50 border-l-2 border-transparent'
                  }`}
                  onClick={() => onJoinRoom(r.id, r.name, r.online)}
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
  )
}
