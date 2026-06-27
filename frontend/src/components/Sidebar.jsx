import { motion } from 'framer-motion'
import { Plus, X, FolderSimple } from '@phosphor-icons/react'
import { useState } from 'react'

export default function Sidebar({ tabs, activeTabId, onSelectTab, onCreateTab, onDeleteTab, collapsed }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const handleCreate = (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    onCreateTab({ name: newName.trim() })
    setNewName('')
    setCreating(false)
  }

  if (collapsed) return null

  return (
    <aside className="hidden sm:flex flex-col w-60 shrink-0 border-r border-white/[0.06] h-[100dvh] sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-xl bg-accent-600 flex items-center justify-center">
          <FolderSimple size={18} weight="fill" className="text-white" />
        </div>
        <span className="text-base font-bold tracking-tight text-zinc-100">LinkKeep</span>
      </div>

      {/* Tabs list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {tabs.map(tab => {
          const active = tab.id === activeTabId
          return (
            <div key={tab.id} className="group relative flex items-center">
              <motion.button
                layout
                onClick={() => onSelectTab(tab.id)}
                className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${
                  active
                    ? 'bg-accent-500/10 text-accent-300'
                    : 'text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200'
                }`}
              >
                <div
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: tab.color || '#6366f1' }}
                />
                <span className="truncate">{tab.name}</span>
                <span className="text-[10px] text-zinc-600 ml-auto">{tab.link_count}</span>
              </motion.button>
              <button
                onClick={() => onDeleteTab(tab.id)}
                className="absolute right-2 opacity-0 group-hover:opacity-100 p-1 text-zinc-600 hover:text-red-400 transition-all"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}

        {creating ? (
          <form onSubmit={handleCreate} className="px-2 py-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => { if (!newName) setCreating(false) }}
              placeholder="Tab name..."
              className="w-full bg-white/[0.05] border border-accent-500/30 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none"
            />
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] transition-all"
          >
            <Plus size={14} weight="bold" />
            <span>New Tab</span>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/[0.06]">
        <p className="text-[10px] text-zinc-700 font-mono">LinkKeep v2.0</p>
      </div>
    </aside>
  )
}
