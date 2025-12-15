import { useState } from 'react'

import { useToast } from '../toast'

export function AuthScreen(props: {
  onLogin: (username: string, password: string) => Promise<void>
  onRegister: (username: string, password: string) => Promise<void>
}) {
  const toast = useToast()
  const [tab, setTab] = useState<'login' | 'register'>('login')

  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')

  const [busy, setBusy] = useState(false)

  async function handleLogin(): Promise<void> {
    const u = loginUsername.trim()
    const p = loginPassword

    if (!u || !p) {
      toast.error('请输入用户名和密码')
      return
    }

    setBusy(true)
    try {
      await props.onLogin(u, p)
    } finally {
      setBusy(false)
    }
  }

  async function handleRegister(): Promise<void> {
    const u = regUsername.trim()
    const p = regPassword

    if (!u || !p) {
      toast.error('请输入用户名和密码')
      return
    }

    if (u.length < 2) {
      toast.error('用户名至少2个字符')
      return
    }

    if (p.length < 4) {
      toast.error('密码至少4个字符')
      return
    }

    setBusy(true)
    try {
      await props.onRegister(u, p)
      toast.success('注册成功！')
      setRegUsername('')
      setRegPassword('')
      setTab('login')
      setLoginUsername(u)
      setLoginPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative glass glass-dark p-8 rounded-2xl shadow-2xl w-full max-w-md border border-dark-700/50 animate-scale-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-500/25 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold gradient-text">ChatRoom</h1>
          <p className="text-gray-500 mt-2 text-sm">新一代实时通讯体验</p>
        </div>

        <div className="flex mb-6 p-1 bg-dark-800/50 rounded-xl">
          <button
            type="button"
            className={
              tab === 'login'
                ? 'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all bg-primary-600 text-white'
                : 'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all text-gray-400 hover:text-white'
            }
            onClick={() => setTab('login')}
            disabled={busy}
          >
            登录
          </button>
          <button
            type="button"
            className={
              tab === 'register'
                ? 'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all bg-primary-600 text-white'
                : 'flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all text-gray-400 hover:text-white'
            }
            onClick={() => setTab('register')}
            disabled={busy}
          >
            注册
          </button>
        </div>

        {tab === 'login' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">用户名</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </span>
                <input
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleLogin()
                  }}
                  className="w-full bg-dark-800/50 border border-dark-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 input-glow transition-all"
                  placeholder="输入用户名"
                  disabled={busy}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">密码</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </span>
                <input
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleLogin()
                  }}
                  type="password"
                  className="w-full bg-dark-800/50 border border-dark-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 input-glow transition-all"
                  placeholder="输入密码"
                  disabled={busy}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleLogin()}
              disabled={busy}
              className="w-full bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white font-semibold py-3 px-4 rounded-xl transition-all btn-shine shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                  />
                </svg>
                登录
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">用户名</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </span>
                <input
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRegister()
                  }}
                  className="w-full bg-dark-800/50 border border-dark-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 input-glow transition-all"
                  placeholder="创建用户名"
                  disabled={busy}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">密码</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </span>
                <input
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleRegister()
                  }}
                  type="password"
                  className="w-full bg-dark-800/50 border border-dark-700 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 input-glow transition-all"
                  placeholder="创建密码"
                  disabled={busy}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleRegister()}
              disabled={busy}
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold py-3 px-4 rounded-xl transition-all btn-shine shadow-lg shadow-emerald-500/25 disabled:opacity-60"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
                创建账号
              </span>
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-gray-600">安全加密 · 实时同步 · 多端支持</p>
      </div>
    </div>
  )
}
