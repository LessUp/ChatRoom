import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import type { ToastType } from './types'

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastApi {
  show: (message: string, type?: ToastType, durationMs?: number) => void
  info: (message: string, durationMs?: number) => void
  success: (message: string, durationMs?: number) => void
  error: (message: string, durationMs?: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, type: ToastType = 'info', durationMs = 3000) => {
      const id = newId()
      setItems((prev) => [...prev, { id, message, type }])
      window.setTimeout(() => remove(id), durationMs)
    },
    [remove],
  )

  const api = useMemo<ToastApi>(() => {
    return {
      show,
      info: (m, d) => show(m, 'info', d),
      success: (m, d) => show(m, 'success', d),
      error: (m, d) => show(m, 'error', d),
    }
  }, [show])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] space-y-2 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center w-full max-w-sm p-4 gap-3 text-gray-100 bg-dark-800/95 glass rounded-xl shadow-2xl border border-dark-700/50"
          >
            <div className="flex-shrink-0">
              {t.type === 'success' ? (
                <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : t.type === 'error' ? (
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="text-sm font-medium flex-1">{t.message}</div>
            <button
              type="button"
              className="text-gray-500 hover:text-white transition-colors"
              onClick={() => remove(t.id)}
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
