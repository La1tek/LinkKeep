import { motion } from 'framer-motion'
import { Plus, X, FolderSimple, GearSix, SignOut } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

export default function Sidebar({ tabs, activeTabId, onSelectTab, onCreateTab, onDeleteTab, collapsed, onLogout }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const navigate = useNavigate()
  const safeTabs = tabs || []

  const handleCreate = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    onCreateTab({ name: newName.trim(), color: newColor })
    setNewName('')
    setNewColor('#6366f1')
    setCreating(false)
  }

  if (collapsed) return null

  return (
    <aside className="hidden sm:flex flex-col w-60 shrink-0 h-[100dvh] sticky top-0" style={{ borderRight: '1px solid var(--border-subtle)' }}>
      <button onClick={() => navigate('/')} className="px-5 py-5 flex items-center gap-2.5 group cursor-pointer">
        <div className="h-8 w-8 rounded-xl bg-accent-600 flex items-center justify-center transition-transform group-hover:scale-105">
          <FolderSimple size={18} weight="fill" className="text-white" />
        </div>
        <span className="text-base font-bold tracking-tight transition-colors group-hover:text-accent-400" style={{ color: 'var(--text-primary)' }}>LinkKeep</span>
      </button>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {safeTabs.map(tab => {
          const active = tab.id === activeTabId
          return (
            <div key={tab.id} className="group relative flex items-center">
              <motion.button
                layout
                onClick={() => onSelectTab(tab.id)}
                className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover"
                style={{
                  background: active ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                  color: active ? '#818cf8' : 'var(--text-tertiary)',
                }}
              >
                <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tab.color || '#6366f1' }} />
                <span className="truncate">{tab.name}</span>
                <span className="text-[10px] ml-auto group-hover:hidden" style={{ color: 'var(--text-muted)' }}>{tab.link_count}</span>
              </motion.button>
              <button
                onClick={() => onDeleteTab(tab.id)}
                className="hidden group-hover:block absolute right-2 top-1/2 -translate-y-1/2 p-1 transition-all hover:text-red-400"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}

        {creating ? (
          <form onSubmit={handleCreate} className="glass rounded-xl px-3 py-2.5 space-y-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => { if (!newName.trim()) setCreating(false) }}
              placeholder="Tab name..."
              className="input-base w-full rounded-lg px-3 py-2 text-sm outline-none"
            />
            {newName.trim() && (
              <div className="flex items-center gap-2">
                <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Color:</label>
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setNewColor(c)}
                    className={`h-4 w-4 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-white/20' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
            <button type="submit" disabled={!newName.trim()} className="w-full bg-accent-600 text-white py-1.5 rounded-lg text-xs font-medium hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              Create
            </button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm surface-hover transition-all"
            style={{ color: 'var(--text-muted)' }}
          >
            <Plus size={14} weight="bold" />
            <span>New Tab</span>
          </button>
        )}
      </div>

      <div className="px-3 py-2 space-y-0.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm surface-hover transition-all"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <GearSix size={16} />
          <span>Settings</span>
        </button>
        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all hover:text-red-400"
            style={{ color: 'var(--text-muted)' }}
          >
            <SignOut size={16} />
            <span>Sign Out</span>
          </button>
        )}
      </div>

      <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>LinkKeep v2.1</p>
      </div>
    </aside>
  )
}
