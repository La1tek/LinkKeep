import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, SignOut, User, GithubLogo, Key, Download, Upload, Trash, ArrowRight, TelegramLogo, House, SidebarSimple, Tag } from '@phosphor-icons/react'
import { useTheme } from '../lib/theme'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import { openConfirm } from '../components/ConfirmModal'

export default function Settings({ user }) {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const { logout, setUser } = useAuth()
  const toast = useToast()
  const [editing, setEditing] = useState(null)
  const [newUsername, setNewUsername] = useState(user?.username || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [botStatus, setBotStatus] = useState(null)
  const [botCommand, setBotCommand] = useState('')
  const [sessions, setSessions] = useState([])
  const [importMode, setImportMode] = useState('merge')
  const [tags, setTags] = useState([])
  const [tagDrafts, setTagDrafts] = useState({})

  useEffect(() => {
    api.getStats().then(() => {
      fetch('/api/health').then(r => r.json()).then(data => {
        setBotStatus(data)
      }).catch(() => {})
    }).catch(() => {})
    api.listSessions().then(setSessions).catch(() => {})
    api.listTags().then((data) => setTags(data.tags || [])).catch(() => {})
  }, [])

  const handleChangeUsername = async (e) => {
    e.preventDefault()
    try {
      const updated = await api.changeUsername(newUsername)
      toast.success('Username updated'); setEditing(null)
      setUser(updated)
    } catch (err) { toast.error(err.message) }
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    try {
      await api.changePassword(currentPassword, newPassword)
      toast.success('Password updated'); setCurrentPassword(''); setNewPassword(''); setEditing(null)
    } catch (err) { toast.error(err.message) }
  }

  const handleExport = async () => {
    try {
      const data = await api.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a')
      a.href = url; a.download = `linkkeep-export-${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    } catch (err) { toast.error(err.message) }
  }

  const handleExportHtml = () => {
    const token = localStorage.getItem('lk_token')
    fetch('/api/settings/export-html', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(blob => {
        const url = URL.createObjectURL(blob); const a = document.createElement('a')
        a.href = url; a.download = `linkkeep-bookmarks.html`; a.click(); URL.revokeObjectURL(url)
        toast.success('HTML bookmarks downloaded')
      }).catch(() => toast.error('Export failed'))
  }

  const handleImport = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        const result = await api.importData(data, importMode)
        toast.success(`Imported ${result.tabs} tabs, ${result.links} links · merged ${result.merged || 0}, skipped ${result.skipped || 0}`)
        setTimeout(() => window.location.reload(), 1500)
      } catch (err) { toast.error('Import failed: ' + err.message) }
    }
    reader.readAsText(file); e.target.value = ''
  }

  const handleDeleteAccount = async () => {
    const ok = await openConfirm({ title: 'Delete account permanently?', message: 'All your tabs, links, and data will be permanently removed.', danger: true })
    if (!ok) return
    try { await api.deleteAccount(); toast.success('Account deleted'); setTimeout(() => { logout(); window.location.reload() }, 1000) }
    catch (err) { toast.error(err.message) }
  }

  const handleCreateBotToken = async () => {
    try {
      const result = await api.createBotToken()
      setBotCommand(result.command)
      toast.success('Telegram link token generated')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleRevokeSession = async (session) => {
    try {
      await api.revokeSession(session.id)
      setSessions((items) => items.map((item) => item.id === session.id ? { ...item, revoked_at: new Date().toISOString() } : item))
      toast.success(session.current ? 'Current session signed out' : 'Session revoked')
      if (session.current) setTimeout(() => logout(), 300)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleRenameTag = async (tag) => {
    const nextName = (tagDrafts[tag.name] || '').trim()
    if (!nextName || nextName === tag.name) return
    try {
      await api.renameTag(tag.name, nextName)
      const data = await api.listTags()
      setTags(data.tags || [])
      setTagDrafts({})
      toast.success('Tag renamed')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleDeleteTag = async (tag) => {
    const ok = await openConfirm({ title: 'Delete tag?', message: `Remove "${tag.name}" from ${tag.count} links?`, danger: true })
    if (!ok) return
    try {
      await api.deleteTag(tag.name)
      setTags((items) => items.filter((item) => item.name !== tag.name))
      toast.success('Tag removed')
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass px-4 sm:px-8 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <h1 className="text-base font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Settings</h1>
      </header>

      <main className="px-4 sm:px-8 py-6 max-w-2xl space-y-8 pb-24 sm:pb-8">
        <Section title="Profile">
          <div className="glass rounded-2xl p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-accent-600/20 border border-accent-500/20 flex items-center justify-center"><User size={22} className="text-accent-400" /></div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{user?.username || 'User'}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</p>
            </div>
            <button onClick={() => { setEditing(editing === 'username' ? null : 'username'); setNewUsername(user?.username || '') }} className="text-xs text-accent-400 px-3 py-1.5 rounded-lg hover:bg-accent-500/10 transition-colors">Edit</button>
          </div>
          {editing === 'username' && (
            <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} onSubmit={handleChangeUsername} className="glass rounded-2xl p-4 mt-2 space-y-3">
              <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="New username" className="input-base w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-2">
                <button type="submit" className="bg-accent-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-accent-500 active:scale-[0.98] transition-all">Save</button>
                <button type="button" onClick={() => setEditing(null)} className="glass px-4 py-2 rounded-xl text-sm surface-hover" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
              </div>
            </motion.form>
          )}
        </Section>

        <Section title="Security">
          <div className="glass rounded-2xl divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            <button onClick={() => { setEditing(editing === 'password' ? null : 'password'); setCurrentPassword(''); setNewPassword('') }} className="w-full flex items-center justify-between px-4 py-3.5 surface-hover transition-colors">
              <div className="flex items-center gap-3"><Key size={18} style={{ color: 'var(--text-tertiary)' }} /><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Change Password</span></div>
              <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
          {editing === 'password' && (
            <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} onSubmit={handleChangePassword} className="glass rounded-2xl p-4 mt-2 space-y-3">
              <input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" className="input-base w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
              <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="input-base w-full rounded-xl px-4 py-2.5 text-sm outline-none" />
              <div className="flex gap-2">
                <button type="submit" className="bg-accent-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-accent-500 active:scale-[0.98] transition-all">Update</button>
                <button type="button" onClick={() => setEditing(null)} className="glass px-4 py-2 rounded-xl text-sm surface-hover" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
              </div>
            </motion.form>
          )}
          {sessions.length > 0 && (
            <div className="glass rounded-2xl divide-y mt-2" style={{ borderColor: 'var(--border-subtle)' }}>
              {sessions.map((session) => (
                <div key={session.id} className="px-4 py-3 flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${session.revoked_at ? 'bg-zinc-500' : 'bg-emerald-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{session.user_agent || 'Unknown device'}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {session.current ? 'Current session · ' : ''}{session.ip_address || 'unknown ip'} · {new Date(session.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!session.revoked_at && (
                    <button type="button" onClick={() => handleRevokeSession(session)} className="text-xs text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors">
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Appearance">
          <div className="glass rounded-2xl divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            <button onClick={toggle} className="w-full flex items-center justify-between px-4 py-3.5 surface-hover transition-colors">
              <div className="flex items-center gap-3">{theme === 'dark' ? <Moon size={18} style={{ color: 'var(--text-tertiary)' }} /> : <Sun size={18} style={{ color: 'var(--text-tertiary)' }} />}<span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Theme</span></div>
              <span className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{theme}</span>
            </button>
          </div>
        </Section>

        <Section title="Data Management">
          <div className="glass rounded-2xl divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
            <button onClick={() => navigate('/duplicates')} className="w-full flex items-center justify-between px-4 py-3.5 surface-hover transition-colors"><div className="flex items-center gap-3"><SidebarSimple size={18} style={{ color: 'var(--text-tertiary)' }} /><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Find Duplicates</span></div><span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>scan for dupes</span></button>
            <button onClick={handleExport} className="w-full flex items-center justify-between px-4 py-3.5 surface-hover transition-colors"><div className="flex items-center gap-3"><Download size={18} style={{ color: 'var(--text-tertiary)' }} /><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Export as JSON</span></div><span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>.json</span></button>
            <button onClick={handleExportHtml} className="w-full flex items-center justify-between px-4 py-3.5 surface-hover transition-colors"><div className="flex items-center gap-3"><Download size={18} style={{ color: 'var(--text-tertiary)' }} /><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Export as HTML Bookmarks</span></div><span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>.html</span></button>
            <div className="px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3"><Upload size={18} style={{ color: 'var(--text-tertiary)' }} /><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Import Mode</span></div>
              <select value={importMode} onChange={(e) => setImportMode(e.target.value)} className="input-base rounded-lg px-2 py-1 text-xs outline-none">
                <option value="merge">Merge</option>
                <option value="skip">Skip existing</option>
                <option value="replace">Replace all</option>
              </select>
            </div>
            <label className="w-full flex items-center justify-between px-4 py-3.5 surface-hover transition-colors cursor-pointer"><div className="flex items-center gap-3"><Upload size={18} style={{ color: 'var(--text-tertiary)' }} /><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Import JSON</span></div><span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>click to select</span><input type="file" accept=".json" onChange={handleImport} className="hidden" /></label>
          </div>
        </Section>

        {tags.length > 0 && (
          <Section title="Tags">
            <div className="glass rounded-2xl divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {tags.map((tag) => (
                <div key={tag.name} className="px-4 py-3 flex items-center gap-3">
                  <Tag size={16} style={{ color: 'var(--text-tertiary)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{tag.name}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{tag.count} links</p>
                  </div>
                  <input
                    value={tagDrafts[tag.name] || ''}
                    onChange={(e) => setTagDrafts((drafts) => ({ ...drafts, [tag.name]: e.target.value }))}
                    placeholder="Rename"
                    className="input-base w-24 rounded-lg px-2 py-1 text-xs outline-none"
                  />
                  <button type="button" onClick={() => handleRenameTag(tag)} className="text-xs text-accent-400 px-2 py-1 rounded-lg hover:bg-accent-500/10 transition-colors">Save</button>
                  <button type="button" onClick={() => handleDeleteTag(tag)} className="text-xs text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors">Delete</button>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Telegram Bot">
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center"><TelegramLogo size={20} className="text-sky-400" /></div>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Telegram Integration</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {botStatus?.bot ? 'Bot is active' : 'Bot is not configured'}
                </p>
              </div>
              <div className={`h-2 w-2 rounded-full ${botStatus?.bot ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
            </div>
            <div className="text-xs space-y-2" style={{ color: 'var(--text-muted)' }}>
              <p>To enable:</p>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>Create a bot via <span style={{ color: 'var(--text-tertiary)' }}>@BotFather</span> on Telegram</li>
                <li>Set <code className="px-1 py-0.5 rounded surface text-[10px]">TELEGRAM_BOT_TOKEN</code> in server .env</li>
                <li>Restart backend</li>
                <li>Generate a link token and message your bot with it</li>
              </ol>
              <button onClick={handleCreateBotToken} className="mt-2 bg-accent-600 text-white px-3 py-2 rounded-xl text-xs font-medium hover:bg-accent-500 transition-all">Generate Link Token</button>
              {botCommand && (
                <code className="block mt-2 px-2 py-1.5 rounded surface text-[10px] break-all">{botCommand}</code>
              )}
              <p className="pt-1">Then just send URLs to the bot to save them.</p>
            </div>
          </div>
        </Section>

        <Section title="Browser Extension">
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center"><House size={20} className="text-accent-400" /></div>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Chrome Extension</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>One-click save from any page</p>
              </div>
            </div>
            <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
              Load <code className="px-1 py-0.5 rounded surface text-[10px]">/extension</code> folder in chrome://extensions (Developer mode)
            </div>
          </div>
        </Section>

        <Section title="About">
          <div className="glass rounded-2xl p-4 space-y-2">
            <Row label="Version" value="2.4.0" mono />
            <Row label="Stack" value="FastAPI + React + Vite" />
            <a href="https://github.com/La1tek/LinkKeep" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 pt-1"><GithubLogo size={14} />github.com/La1tek/LinkKeep</a>
          </div>
        </Section>

        <Section title="Session & Danger">
          <div className="space-y-2">
            <button onClick={logout} className="w-full glass rounded-2xl px-4 py-3.5 flex items-center gap-3 text-sm text-amber-400 hover:bg-amber-500/5 transition-colors"><SignOut size={18} />Sign Out</button>
            <button onClick={handleDeleteAccount} className="w-full glass rounded-2xl px-4 py-3.5 flex items-center gap-3 text-sm text-red-400 hover:bg-red-500/5 transition-colors"><Trash size={18} />Delete Account Permanently</button>
          </div>
        </Section>
      </main>
    </div>
  )
}

function Section({ title, children }) {
  return <section><h2 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>{title}</h2>{children}</section>
}

function Row({ label, value, mono }) {
  return <div className="flex items-center justify-between"><span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{label}</span><span className={`text-sm ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text-secondary)' }}>{value}</span></div>
}
