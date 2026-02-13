import { useEffect, useRef } from 'react'

import type { MessageDTO, User, WsEvent } from '../types'

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-orange-500 to-red-500',
  'from-pink-500 to-rose-500',
]

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

interface MessageListProps {
  items: WsEvent[]
  user: User
  currentRoomId: number | null
  onLoadMore: () => void
}

export function MessageList({ items, user, currentRoomId, onLoadMore }: MessageListProps) {
  const boxRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!boxRef.current) return
    boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [items, currentRoomId])

  return (
    <div
      ref={boxRef}
      className="flex-1 overflow-y-auto p-6 space-y-1"
      onScroll={() => {
        const box = boxRef.current
        if (!box) return
        if (box.scrollTop <= 20) onLoadMore()
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
                className={`w-8 h-8 rounded-xl bg-gradient-to-br ${AVATAR_COLORS[msg.user_id % AVATAR_COLORS.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1`}
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
  )
}
