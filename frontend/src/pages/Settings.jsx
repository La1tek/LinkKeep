import { useState, useEffect } from 'react'
import { Moon, Sun, SignOut, User, GithubLogo } from '@phosphor-icons/react'
import { useTheme } from '../lib/theme'
import { useAuth } from '../hooks/useAuth'

export default function Settings({ user }) {
  const { theme, toggle } = useTheme()
  const { logout } = useAuth()

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass border-b border-white/[0.06] px-4 sm:px-8 py-3">
        <h1 className="text-base font-semibold tracking-tight text-zinc-100">Settings</h1>
      </header>

      <main className="px-4 sm:px-8 py-6 max-w-2xl space-y-6 pb-24 sm:pb-8">
        {/* Profile */}
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Profile</h2>
          <div className="glass rounded-2xl p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-accent-600/20 border border-accent-500/20 flex items-center justify-center">
              <User size={22} className="text-accent-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">{user?.username || 'User'}</p>
              <p className="text-xs text-zinc-500">
                Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Appearance</h2>
          <div className="glass rounded-2xl divide-y divide-white/[0.04]">
            <button
              onClick={toggle}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon size={18} className="text-zinc-400" /> : <Sun size={18} className="text-zinc-400" />}
                <span className="text-sm text-zinc-200">Theme</span>
              </div>
              <span className="text-xs text-zinc-500 capitalize">{theme}</span>
            </button>
          </div>
        </section>

        {/* About */}
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">About</h2>
          <div className="glass rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Version</span>
              <span className="text-sm text-zinc-300 font-mono">2.0.0</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Stack</span>
              <span className="text-sm text-zinc-300">FastAPI + React + Vite</span>
            </div>
            <a
              href="https://github.com/La1tek/LinkKeep"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 pt-1"
            >
              <GithubLogo size={14} />
              github.com/La1tek/LinkKeep
            </a>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="text-xs font-medium text-red-500/70 uppercase tracking-wider mb-3">Session</h2>
          <button
            onClick={logout}
            className="w-full glass rounded-2xl px-4 py-3.5 flex items-center gap-3 text-sm text-red-400 hover:bg-red-500/5 transition-colors"
          >
            <SignOut size={18} />
            Sign Out
          </button>
        </section>
      </main>
    </div>
  )
}
