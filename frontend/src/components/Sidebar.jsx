import { motion } from 'framer-motion'
import { Plus, X, FolderSimple, GearSix, SignOut, Star, Stack, CaretDown, CaretRight, Link as LinkIcon, Sparkle, ShieldCheck } from '@phosphor-icons/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AnimatedCounter from './AnimatedCounter'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

export default function Sidebar({ tabs, activePath, adminAvailable = false, onSelectTab, onSelectAll, onSelectFavorites, onCreateTab, onDeleteTab, onLogout }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [expandedIds, setExpandedIds] = useState(new Set())
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

  const toggleExpand = (id) => {
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedIds(next)
  }

  const isActive = (tabId) => activePath === `/folder/${tabId}`
  const isAllActive = activePath === '/folder/all'
  const isHomeActive = activePath === '/'
  const isFavActive = activePath === '/favorites'
  const isSharesActive = activePath === '/shares'
  const isRecommendationsActive = activePath === '/recommendations'
  const isAdminActive = activePath === '/admin'

  // Build tree: root tabs (no parent) and children
  const rootTabs = safeTabs.filter(t => !t.parent_id)
  const childrenMap = {}
  safeTabs.forEach(t => {
    if (t.parent_id) {
      if (!childrenMap[t.parent_id]) childrenMap[t.parent_id] = []
      childrenMap[t.parent_id].push(t)
    }
  })

  const renderTab = (tab, depth = 0) => {
    const children = childrenMap[tab.id] || []
    const hasChildren = children.length > 0
    const isExpanded = expandedIds.has(tab.id)
    const active = isActive(tab.id)

    return (
      <div key={tab.id}>
        <div className="group relative flex items-center">
          <motion.button
            layout
            onClick={() => onSelectTab(tab.id)}
            onDoubleClick={() => { if (hasChildren) toggleExpand(tab.id) }}
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all surface-hover"
            style={{
              paddingLeft: `${12 + depth * 16}px`,
              background: active ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              color: active ? '#818cf8' : 'var(--text-tertiary)',
            }}
          >
            {/* Expand/collapse for parents */}
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpand(tab.id) }}
                className="p-0 shrink-0"
                style={{ color: 'var(--text-muted)' }}
                aria-label={isExpanded ? `Collapse ${tab.name}` : `Expand ${tab.name}`}
              >
                {isExpanded ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
              </button>
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tab.color || '#6366f1' }} />
            <span className="truncate">{tab.name}</span>
            <span className="text-[10px] ml-auto transition-opacity group-hover:opacity-0" style={{ color: 'var(--text-muted)' }}>
              <AnimatedCounter value={tab.total_link_count ?? tab.link_count} />
            </span>
          </motion.button>
          <button
            onClick={() => onDeleteTab(tab.id)}
            className="hidden group-hover:block absolute right-2 top-1/2 -translate-y-1/2 p-1 transition-all hover:text-red-400"
            style={{ color: 'var(--text-muted)' }}
            aria-label={`Delete ${tab.name}`}
          >
            <X size={12} />
          </button>
        </div>
        {/* Children */}
        {hasChildren && isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {children.map(child => renderTab(child, depth + 1))}
          </motion.div>
        )}
      </div>
    )
  }

  return (
    <aside className="hidden sm:flex flex-col w-60 shrink-0 h-[100dvh] sticky top-0" style={{ borderRight: '1px solid var(--border-subtle)' }}>
      {/* Logo */}
      <button onClick={() => navigate('/')} className="px-5 py-5 flex items-center gap-2.5 group cursor-pointer">
        <div className="h-8 w-8 rounded-xl bg-accent-600 flex items-center justify-center transition-transform group-hover:scale-105">
          <FolderSimple size={18} weight="fill" className="text-white" />
        </div>
        <span className="text-base font-bold tracking-tight transition-colors group-hover:text-accent-400" style={{ color: 'var(--text-primary)' }}>LinkKeep</span>
      </button>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {/* Home */}
        <motion.button
          layout
          onClick={() => navigate('/')}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover"
          style={{
            background: isHomeActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
            color: isHomeActive ? '#818cf8' : 'var(--text-tertiary)',
          }}
        >
          <FolderSimple size={16} />
          <span>Home</span>
        </motion.button>

        {/* All Links */}
        <motion.button
          layout
          onClick={onSelectAll}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover"
          style={{
            background: isAllActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
            color: isAllActive ? '#818cf8' : 'var(--text-tertiary)',
          }}
        >
          <Stack size={16} weight="bold" />
          <span>All Links</span>
        </motion.button>

        {/* Favorites */}
        <motion.button
          layout
          onClick={onSelectFavorites}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover"
          style={{
            background: isFavActive ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
            color: isFavActive ? '#fbbf24' : 'var(--text-tertiary)',
          }}
        >
          <Star size={16} weight="fill" />
          <span>Favorites</span>
        </motion.button>

        {/* Divider */}
        <div className="my-2" style={{ borderTop: '1px solid var(--border-subtle)' }} />

        <motion.button
          layout
          onClick={() => navigate('/shares')}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover"
          style={{
            background: isSharesActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
            color: isSharesActive ? '#818cf8' : 'var(--text-tertiary)',
          }}
        >
          <LinkIcon size={16} />
          <span>Shared</span>
        </motion.button>

        <motion.button
          layout
          onClick={() => navigate('/recommendations')}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover"
          style={{
            background: isRecommendationsActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
            color: isRecommendationsActive ? '#818cf8' : 'var(--text-tertiary)',
          }}
        >
          <Sparkle size={16} />
          <span>Recommendations</span>
        </motion.button>

        {adminAvailable && (
          <motion.button
            layout
            onClick={() => navigate('/admin')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover"
            style={{
              background: isAdminActive ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
              color: isAdminActive ? '#818cf8' : 'var(--text-tertiary)',
            }}
          >
            <ShieldCheck size={16} />
            <span>Admin</span>
          </motion.button>
        )}

        <div className="my-2" style={{ borderTop: '1px solid var(--border-subtle)' }} />

        {/* Folders */}
        {rootTabs.map(tab => renderTab(tab))}

        {/* New folder button */}
        {creating ? (
          <form onSubmit={handleCreate} className="glass rounded-xl px-3 py-2.5 space-y-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => { if (!newName.trim()) setCreating(false) }}
              placeholder="Folder name..."
              className="input-base w-full rounded-lg px-3 py-2 text-sm outline-none"
            />
            {newName.trim() && (
              <div className="flex items-center gap-2">
                <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Color:</label>
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setNewColor(c)}
                    className={`h-4 w-4 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-white/20' : ''}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Use color ${c}`}
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
            <span>New Folder</span>
          </button>
        )}
      </div>

      {/* Bottom actions */}
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
        <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>LinkKeep v2.4</p>
      </div>
    </aside>
  )
}
