import type { ConnectionStatus, User, WsEvent } from '../types'
import { MessageInput } from './MessageInput'
import { MessageList } from './MessageList'

interface ChatRoomProps {
  user: User
  currentRoomId: number | null
  currentRoomName: string
  onlineCount: number
  connStatus: ConnectionStatus
  items: WsEvent[]
  draft: string
  typingNames: string[]
  onDraftChange: (value: string) => void
  onSend: () => void
  onTyping: () => void
  onLoadMore: () => void
}

export function ChatRoom({
  user,
  currentRoomId,
  currentRoomName,
  onlineCount,
  connStatus,
  items,
  draft,
  typingNames,
  onDraftChange,
  onSend,
  onTyping,
  onLoadMore,
}: ChatRoomProps) {
  if (!currentRoomId) {
    return (
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
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* 聊天头部 */}
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

      {/* 消息列表 */}
      <MessageList
        items={items}
        user={user}
        currentRoomId={currentRoomId}
        onLoadMore={onLoadMore}
      />

      {/* 输入区 */}
      <MessageInput
        draft={draft}
        typingNames={typingNames}
        onDraftChange={onDraftChange}
        onSend={onSend}
        onTyping={onTyping}
      />
    </div>
  )
}
