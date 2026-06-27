import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Moon, Sun, SignOut, User, GithubLogo, Key, Download,
  Upload, Trash, Warning, ArrowRight, Check
} from '@phosphor-icons/react'
import { useTheme } from '../lib/theme'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import { openConfirm } from '../components/ConfirmModal'

export default function Settings({ user }) {
  const { theme, toggle } = useTheme()
  const { logout } = useAuth()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [newUsername, setNewUsername] = useState(user?.username || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const handleChangeUsername = async (e) => {
    e.preventDefault()
    try {
      await api.changeUsername(newUsername)
      toast.success('Username updated')
      setEditing(null)
      localStorage.setItem('lk_user', JSON.stringify({ ...user, username: newUsername }))
      window.location.reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    try {
      await api.changePassword(currentPassword, newPassword)
      toast.success('Password updated')
      setCurrentPassword(''); setNewPassword('')
      setEditing(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleExport = async () => {
    try {
      const data = await api.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `linkkeep-export-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleExportHtml = () => {
    const token = localStorage.getItem('lk_token')
    const a = document.createElement('a')
    a.href = `/api/settings/export-html?token=${token}`
    a.download = `linkkeep-bookmarks-${new Date().toISOString().split('T')[0]}.html`
    a.click()
    toast.success('HTML bookmarks downloaded')
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        const result = await api.importData(data)
        toast.success(`Imported ${result.tabs} tabs, ${result.links} links`)
        setTimeout(() => window.location.reload(), 1500)
      } catch (err) {
        toast.error('Import failed: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleDeleteAccount = async () => {
    const ok = await openConfirm({
      title: 'Delete account permanently?',
      message: 'All your tabs, links, and data will be permanently removed. This cannot be undone.',
      danger: true,
      confirmText: 'Delete Everything',
    })
    if (!ok) return
    try {
      await api.deleteAccount()
      toast.success('Account deleted')
      setTimeout(() => { logout(); window.location.reload() }, 1000)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass border-b border-white/[0.06] px-4 sm:px-8 py-3">
        <h1 className="text-base font-semibold tracking-tight text-zinc-100">Settings</h1>
      </header>

      <main className="px-4 sm:px-8 py-6 max-w-2xl space-y-8 pb-24 sm:pb-8">
        {/* Profile */}
        <Section title="Profile">
          <div className="glass rounded-2xl p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-accent-600/20 border border-accent-500/20 flex items-center justify-center">
              <User size={22} className="text-accent-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-zinc-100">{user?.username || 'User'}</p>
              <p className="text-xs text-zinc-500">
                Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
              </p>
            </div>
            <button
              onClick={() => { setEditing(editing === 'username' ? null : 'username'); setNewUsername(user?.username || '') }}
              className="text-xs text-accent-400 hover:text-accent-300 px-3 py-1.5 rounded-lg hover:bg-accent-500/10 transition-colors"
            >
              Edit
            </button>
          </div>

          {editing === 'username' && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              onSubmit={handleChangeUsername}
              className="glass rounded-2xl p-4 mt-2 space-y-3"
            >
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="New username"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-accent-500/40 outline-none"
              />
              <div className="flex gap-2">
                <button type="submit" className="bg-accent-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-accent-500 active:scale-[0.98] transition-all">
                  Save
                </button>
                <button type="button" onClick={() => setEditing(null)} className="glass text-zinc-300 px-4 py-2 rounded-xl text-sm hover:bg-white/5 transition-all">
                  Cancel
                </button>
              </div>
            </motion.form>
          )}
        </Section>

        {/* Security */}
        <Section title="Security">
          <div className="glass rounded-2xl divide-y divide-white/[0.04]">
            <button
              onClick={() => { setEditing(editing === 'password' ? null : 'password'); setCurrentPassword(''); setNewPassword('') }}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Key size={18} className="text-zinc-400" />
                <span className="text-sm text-zinc-200">Change Password</span>
              </div>
              <ArrowRight size={14} className="text-zinc-600" />
            </button>
          </div>

          {editing === 'password' && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              onSubmit={handleChangePassword}
              className="glass rounded-2xl p-4 mt-2 space-y-3"
            >
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-accent-500/40 outline-none"
              />
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-accent-500/40 outline-none"
              />
              <div className="flex gap-2">
                <button type="submit" className="bg-accent-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-accent-500 active:scale-[0.98] transition-all">
                  Update Password
                </button>
                <button type="button" onClick={() => setEditing(null)} className="glass text-zinc-300 px-4 py-2 rounded-xl text-sm hover:bg-white/5 transition-all">
                  Cancel
                </button>
              </div>
            </motion.form>
          )}
        </Section>

        {/* Appearance */}
        <Section title="Appearance">
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
        </Section>

        {/* Data */}
        <Section title="Data Management">
          <div className="glass rounded-2xl divide-y divide-white/[0.04]">
            <button
              onClick={handleExport}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Download size={18} className="text-zinc-400" />
                <span className="text-sm text-zinc-200">Export as JSON</span>
              </div>
              <span className="text-[10px] text-zinc-600 font-mono">.json</span>
            </button>
            <button
              onClick={handleExportHtml}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <Download size={18} className="text-zinc-400" />
                <span className="text-sm text-zinc-200">Export as HTML Bookmarks</span>
              </div>
              <span className="text-[10px] text-zinc-600 font-mono">.html</span>
            </button>
            <label className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <Upload size={18} className="text-zinc-400" />
                <span className="text-sm text-zinc-200">Import JSON</span>
              </div>
              <span className="text-[10px] text-zinc-600 font-mono">click to select</span>
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          </div>
        </Section>

        {/* About */}
        <Section title="About">
          <div className="glass rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Version</span>
              <span className="text-sm text-zinc-300 font-mono">2.1.0</span>
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
        </Section>

        {/* Danger Zone */}
        <Section title="Session & Danger">
          <div className="space-y-2">
            <button
              onClick={logout}
              className="w-full glass rounded-2xl px-4 py-3.5 flex items-center gap-3 text-sm text-amber-400 hover:bg-amber-500/5 transition-colors"
            >
              <SignOut size={18} />
              Sign Out
            </button>
            <button
              onClick={handleDeleteAccount}
              className="w-full glass rounded-2xl px-4 py-3.5 flex items-center gap-3 text-sm text-red-400 hover:bg-red-500/5 transition-colors"
            >
              <Trash size={18} />
              Delete Account Permanently
            </button>
          </div>
        </Section>
      </main>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">{title}</h2>
      {children}
    </section>
  )
}
