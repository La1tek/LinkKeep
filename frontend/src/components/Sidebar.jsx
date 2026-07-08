import { motion } from 'framer-motion'
import { Plus, X, GearSix, SignOut, Star, Stack, CaretDown, CaretRight, Link as LinkIcon, Sparkle, ShieldCheck, LockKey, ArrowSquareIn, Trash, Lightning } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AnimatedCounter from './AnimatedCounter'
import BrandIcon from './BrandIcon'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

const LINKKEEP_LINKS_MIME = 'application/x-linkkeep-links'

function parseDraggedLinks(event) {
  const raw = event.dataTransfer.getData(LINKKEEP_LINKS_MIME)
  if (raw) {
    try {
      const payload = JSON.parse(raw)
      const linkIds = Array.isArray(payload.linkIds) ? payload.linkIds.map(Number).filter(Boolean) : []
      return linkIds.length ? { ...payload, linkIds } : null
    } catch {}
  }
  const fallback = Number(event.dataTransfer.getData('text/plain'))
  return fallback ? { linkIds: [fallback] } : null
}

function hasDraggedLinks(event) {
  return Array.from(event.dataTransfer?.types || []).includes(LINKKEEP_LINKS_MIME)
}

export default function Sidebar({ tabs, activePath, adminAvailable = false, onSelectTab, onSelectAll, onSelectFavorites, onCreateTab, onDeleteTab, onUnlockTab, onLockTab, onDropLinks, onLogout }) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [dropTargetId, setDropTargetId] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const navigate = useNavigate()
  const safeTabs = tabs || []

  useEffect(() => {
    const resetDropState = () => {
      setDropTargetId(null)
      setDragActive(false)
    }
    window.addEventListener('dragend', resetDropState)
    window.addEventListener('drop', resetDropState)
    return () => {
      window.removeEventListener('dragend', resetDropState)
      window.removeEventListener('drop', resetDropState)
    }
  }, [])

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
  const isWorkflowsActive = activePath === '/workflows'
  const isTrashActive = activePath === '/trash'
  const isAdminActive = activePath === '/admin'
  const allLinksCount = safeTabs.reduce((sum, tab) => sum + Number(tab.link_count || 0), 0)
  const protectedCount = safeTabs.filter(tab => tab.is_locked).length

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
    const locked = tab.is_locked && !tab.is_unlocked
    const unlockedProtected = tab.is_locked && tab.is_unlocked
    const hasChildren = children.length > 0 && !locked
    const isExpanded = expandedIds.has(tab.id)
    const active = isActive(tab.id)
    const dropActive = dropTargetId === tab.id
    const canDrop = !locked

    const handleDragEnter = (e) => {
      if (!hasDraggedLinks(e)) return
      setDragActive(true)
      if (canDrop) setDropTargetId(tab.id)
    }

    const handleDragOver = (e) => {
      if (!hasDraggedLinks(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = canDrop ? 'move' : 'none'
      if (canDrop) setDropTargetId(tab.id)
    }

    const handleDragLeave = (e) => {
      if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return
      if (dropTargetId === tab.id) setDropTargetId(null)
    }

    const handleDrop = async (e) => {
      if (!canDrop) return
      e.preventDefault()
      e.stopPropagation()
      const payload = parseDraggedLinks(e)
      setDropTargetId(null)
      setDragActive(false)
      if (!payload?.linkIds?.length) return
      await onDropLinks?.({ ...payload, tabId: tab.id, tabName: tab.name })
    }

    return (
      <div key={tab.id}>
        <div
          className="atlas-tree-node group relative flex items-center"
          style={{ paddingLeft: `${depth * 16}px` }}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <motion.button
            layout
            onClick={() => locked ? onUnlockTab?.(tab) : onSelectTab(tab.id)}
            onDoubleClick={() => { if (hasChildren && !locked) toggleExpand(tab.id) }}
            className={`atlas-nav-item atlas-folder-row flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all surface-hover ${active ? 'is-active' : ''} ${dropActive ? 'scale-[1.02]' : ''}`}
            style={{
              border: dropActive ? '1px dashed rgba(129,140,248,0.78)' : '1px dashed transparent',
              boxSizing: 'border-box',
              background: dropActive ? 'rgba(124, 140, 255, 0.18)' : active ? undefined : 'transparent',
              boxShadow: dropActive ? '0 10px 24px rgba(124,140,255,0.12)' : undefined,
              color: active ? 'var(--accent-primary)' : 'var(--text-tertiary)',
            }}
          >
            {/* Expand/collapse for parents */}
            {locked ? (
              <LockKey size={12} weight="fill" className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            ) : hasChildren ? (
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
            <div className="star-node h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tab.color || 'var(--accent-primary)' }} />
            <span className="truncate">{tab.name}</span>
            {dropActive && <ArrowSquareIn size={14} weight="fill" className="shrink-0 text-accent-400" />}
            <span className="atlas-folder-count metadata-line ml-auto text-[10px] transition-opacity group-hover:opacity-0">
              {locked ? 'locked' : unlockedProtected ? 'open' : <AnimatedCounter value={tab.total_link_count ?? tab.link_count} />}
            </span>
          </motion.button>
          <div className="atlas-row-actions absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {unlockedProtected && (
              <button
                onClick={(e) => { e.stopPropagation(); onLockTab?.(tab) }}
                className="atlas-row-icon-button"
                aria-label={`Lock ${tab.name}`}
                title="Lock folder"
              >
                <LockKey size={12} weight="fill" />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteTab(tab.id) }}
              className="atlas-row-icon-button hover:text-red-400"
              aria-label={`Delete ${tab.name}`}
              title="Delete folder"
            >
              <X size={12} />
            </button>
          </div>
        </div>
        {/* Children */}
        {hasChildren && isExpanded && !locked && (
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
    <aside
      className="atlas-sidebar hidden sm:flex flex-col w-72 2xl:w-80 shrink-0 h-[100dvh] sticky top-0"
      onDragLeave={(e) => {
        if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return
        setDropTargetId(null)
        setDragActive(false)
      }}
    >
      <div className="px-5 py-5">
        <button onClick={() => navigate('/')} className="atlas-brand-button group w-full">
          <BrandIcon className="atlas-brand-icon transition-transform group-hover:scale-105" />
          <div className="min-w-0 text-left">
            <span className="block text-base font-semibold transition-colors group-hover:text-accent-400" style={{ color: 'var(--text-primary)' }}>LinkAtlas</span>
            <span className="metadata-line block text-[10px]">Your link atlas</span>
          </div>
        </button>
      </div>

      <div className="atlas-sidebar-scroll flex-1 overflow-y-auto px-3 pb-3">
        <div className="atlas-section-heading">
          <span>Atlas Rail</span>
          <button type="button" onClick={() => setCreating(true)} className="atlas-section-action" aria-label="Create folder">
            <Plus size={13} weight="bold" />
          </button>
        </div>
        <motion.button
          layout
          onClick={() => navigate('/')}
          className={`atlas-nav-item atlas-system-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover ${isHomeActive ? 'is-active' : ''}`}
          style={{
            color: isHomeActive ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          }}
        >
          <Sparkle size={16} />
          <span>Overview</span>
        </motion.button>

        <motion.button
          layout
          onClick={onSelectAll}
          className={`atlas-nav-item atlas-system-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover ${isAllActive ? 'is-active' : ''}`}
          style={{
            color: isAllActive ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          }}
        >
          <Stack size={16} weight="bold" />
          <span>All Links</span>
          <span className="metadata-line ml-auto text-[10px]">{allLinksCount}</span>
        </motion.button>

        <motion.button
          layout
          onClick={onSelectFavorites}
          className={`atlas-nav-item atlas-system-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover ${isFavActive ? 'is-active' : ''}`}
          style={{
            color: isFavActive ? 'var(--accent-amber)' : 'var(--text-tertiary)',
          }}
        >
          <Star size={16} weight="fill" />
          <span>Favorites</span>
        </motion.button>

        <div className="atlas-section-heading mt-5">
          <span>Collections</span>
          <span className="metadata-line text-[10px]">{rootTabs.length}</span>
        </div>

        {dragActive && (
          <div className="mx-1 mb-2 rounded-xl px-3 py-2 text-[11px] border border-dashed border-accent-500/40 bg-accent-500/10 text-accent-300">
            Drop onto a folder to move
          </div>
        )}
        <div className="atlas-tree-branch space-y-0.5">
          {rootTabs.map(tab => renderTab(tab))}
        </div>

        <div className="atlas-section-heading mt-5">
          <span>Tools</span>
          {protectedCount > 0 && <span className="metadata-line text-[10px]">{protectedCount} protected</span>}
        </div>

        <motion.button
          layout
          onClick={() => navigate('/workflows')}
          className={`atlas-nav-item atlas-system-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover ${isWorkflowsActive ? 'is-active' : ''}`}
          style={{
            color: isWorkflowsActive ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          }}
        >
          <Lightning size={16} weight="fill" />
          <span>Workflows</span>
        </motion.button>

        <motion.button
          layout
          onClick={() => navigate('/shares')}
          className={`atlas-nav-item atlas-system-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover ${isSharesActive ? 'is-active' : ''}`}
          style={{
            color: isSharesActive ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          }}
        >
          <LinkIcon size={16} />
          <span>Shared</span>
        </motion.button>

        <motion.button
          layout
          onClick={() => navigate('/recommendations')}
          className={`atlas-nav-item atlas-system-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover ${isRecommendationsActive ? 'is-active' : ''}`}
          style={{
            color: isRecommendationsActive ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          }}
        >
          <Sparkle size={16} />
          <span>Recommendations</span>
        </motion.button>

        <motion.button
          layout
          onClick={() => navigate('/trash')}
          className={`atlas-nav-item atlas-system-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover ${isTrashActive ? 'is-active' : ''}`}
          style={{
            color: isTrashActive ? '#ef4444' : 'var(--text-tertiary)',
          }}
        >
          <Trash size={16} />
          <span>Trash</span>
        </motion.button>

        {adminAvailable && (
          <motion.button
            layout
            onClick={() => navigate('/admin')}
            className={`atlas-nav-item atlas-system-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all surface-hover ${isAdminActive ? 'is-active' : ''}`}
            style={{
              color: isAdminActive ? 'var(--accent-primary)' : 'var(--text-tertiary)',
            }}
          >
            <ShieldCheck size={16} />
            <span>Admin</span>
          </motion.button>
        )}

        {/* New folder button */}
        {creating ? (
          <form onSubmit={handleCreate} className="atlas-new-folder-form rounded-xl px-3 py-2.5 space-y-2 mt-2">
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
            className="atlas-nav-item atlas-system-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm surface-hover transition-all mt-1"
            style={{ color: 'var(--text-muted)' }}
          >
            <Plus size={14} weight="bold" />
            <span>New Folder</span>
          </button>
        )}
      </div>

      <div className="atlas-vault-card mx-4 mb-3 rounded-2xl p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Vault Status</div>
            <div className="metadata-line mt-1 text-[10px]">{safeTabs.length} folders tracked</div>
          </div>
          <div className="metadata-line flex items-center gap-1 text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Synced
          </div>
        </div>
        <div className="atlas-vault-meter mt-3" aria-hidden="true">
          <span style={{ width: `${Math.min(86, Math.max(16, safeTabs.length * 8))}%` }} />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="metadata-line text-[10px]">{allLinksCount} saved links</span>
          <button type="button" onClick={() => navigate('/settings')} className="atlas-mini-button">Manage</button>
        </div>
      </div>

      <div className="px-3 py-2 space-y-0.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={() => navigate('/settings')}
          className="atlas-nav-item atlas-system-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm surface-hover transition-all"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <GearSix size={16} />
          <span>Settings</span>
        </button>
        {onLogout && (
          <button
            onClick={onLogout}
            className="atlas-nav-item atlas-system-row w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all hover:text-red-400"
            style={{ color: 'var(--text-muted)' }}
          >
            <SignOut size={16} />
            <span>Sign Out</span>
          </button>
        )}
      </div>

      <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>LinkAtlas v2.6</p>
      </div>
    </aside>
  )
}
