import { useState, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Stack, FolderSimple, PushPin, CheckSquare, X, Trash, ArrowsOutSimple, MagnifyingGlass } from '@phosphor-icons/react'
import { useTabStore } from '../hooks/useTabStore'
import { useLinks } from '../hooks/useLinks'
import { api } from '../lib/api'
import LinkCard from '../components/LinkCard'
import LinkModal from '../components/LinkModal'
import TabEditModal from '../components/TabEditModal'
import SearchBar from '../components/SearchBar'
import EmptyState from '../components/EmptyState'
import { LinkSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'
import { openConfirm } from '../components/ConfirmModal'

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444']
const TAB_ICONS = ['FolderSimple', 'BookmarkSimple', 'Briefcase', 'Code', 'BookOpen', 'ShoppingCart', 'MusicNote', 'GameController']

export default function Dashboard({ token, user, onNavigate, initialTabId }) {
  const { tabs, create: createTab, update: updateTab, remove: deleteTab, refresh: refreshTabs } = useTabStore()
  const [activeTabId, setActiveTabId] = useState(initialTabId || null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [activeTag, setActiveTag] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const [newTabOpen, setNewTabOpen] = useState(false)
  const [newTabName, setNewTabName] = useState('')
  const [newTabColor, setNewTabColor] = useState('#6366f1')
  const [editTabModal, setEditTabModal] = useState(null)
  const [direction, setDirection] = useState(0)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [globalSearch, setGlobalSearch] = useState(false)
  const [showUngrouped, setShowUngrouped] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [pulling, setPulling] = useState(false)
  const touchStartY = useRef(0)
  const toast = useToast()

  const safeTabs = tabs || []
  const tabList = useMemo(() => [
    { id: null, name: 'All', color: '#6366f1' },
    ...safeTabs,
    { id: 'ungrouped', name: 'Ungrouped', color: '#71717a' },
  ], [safeTabs])

  const currentIdx = tabList.findIndex(t => t.id === activeTabId || (t.id === null && activeTabId === null && !showUngrouped))

  const switchTab = (newId, isUngrouped = false) => {
    const idx = isUngrouped ? tabList.length - 1 : tabList.findIndex(t => t.id === newId)
    setDirection(idx > currentIdx ? 1 : -1)
    setActiveTabId(isUngrouped ? null : newId)
    setShowUngrouped(isUngrouped)
    setSelectionMode(false)
    setSelectedIds([])
  }

  const linkParams = useMemo(() => {
    const p = {}
    if (showUngrouped) { p.ungrouped = true }
    else if (activeTabId) { p.tab_id = activeTabId }
    if (search) p.q = search
    return p
  }, [activeTabId, search, showUngrouped])

  const { links, loading, create: createLink, update: updateLink, remove: deleteLink, toggleFav, refresh } = useLinks(token, linkParams)
  const rawLinks = links || []

  const allTags = useMemo(() => {
    const s = new Set()
    rawLinks.forEach(l => (l.tags || []).forEach(t => s.add(t)))
    return [...s].sort()
  }, [rawLinks])

  const processedLinks = useMemo(() => {
    let r = [...rawLinks]
    if (activeTag) r = r.filter(l => (l.tags || []).includes(activeTag))
    switch (sortBy) {
      case 'newest': r.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break
      case 'oldest': r.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break
      case 'az': r.sort((a, b) => a.title.localeCompare(b.title)); break
      case 'za': r.sort((a, b) => b.title.localeCompare(a.title)); break
    }
    return r
  }, [rawLinks, activeTag, sortBy])

  const activeTab = safeTabs.find(t => t.id === activeTabId)
  const pinnedLinks = processedLinks.filter(l => l.is_pinned)
  const normalLinks = processedLinks.filter(l => !l.is_pinned)

  const handleAddLink = async (data) => {
    try {
      if (editingLink) { await updateLink(editingLink.id, data); toast.success('Link updated') }
      else { await createLink(data); toast.success('Link added') }
      setModalOpen(false); setEditingLink(null)
      refreshTabs()
    } catch (err) { toast.error(err.message) }
  }

  const handleDeleteLink = async (link) => {
    const ok = await openConfirm({ title: `Delete "${link.title}"?`, danger: true })
    if (!ok) return
    await deleteLink(link.id)
    toast.success('Link deleted', 2500, { action: 'Undo', onAction: async () => {
      const { id, ...data } = link
      await createLink(data); refresh()
      toast.success('Link restored')
    }})
    refreshTabs()
  }

  const handleTogglePin = async (link) => {
    try {
      await api.togglePin(link.id)
      refresh()
      toast.success(link.is_pinned ? 'Unpinned' : 'Pinned to top')
    } catch (e) { toast.error(e.message) }
  }

  const handleToggleFav = async (link) => {
    await toggleFav(link.id)
    toast.success(link.is_favorite ? 'Removed from favorites' : 'Added to favorites')
  }

  const handleEditLink = async (link) => {
    if (link.note !== undefined && link.id) {
      try { await api.updateLink(link.id, { note: link.note }) } catch {}
    }
    setEditingLink(link)
    setModalOpen(true)
  }

  const createNewTab = () => {
    if (!newTabName.trim()) return
    createTab({ name: newTabName.trim(), color: newTabColor })
    setNewTabName(''); setNewTabColor('#6366f1'); setNewTabOpen(false)
    toast.success('Group created')
  }

  // Selection / bulk
  const toggleSelect = (link) => {
    if (!selectionMode) { setSelectionMode(true); setSelectedIds([link.id]) }
    else if (selectedIds.includes(link.id)) {
      const next = selectedIds.filter(id => id !== link.id)
      setSelectedIds(next)
      if (next.length === 0) setSelectionMode(false)
    } else { setSelectedIds([...selectedIds, link.id]) }
  }

  const handleBulkDelete = async () => {
    const ok = await openConfirm({ title: `Delete ${selectedIds.length} links?`, danger: true })
    if (!ok) return
    await api.bulkAction(selectedIds, 'delete')
    setSelectedIds([]); setSelectionMode(false)
    refresh(); refreshTabs()
    toast.success(`${selectedIds.length} links deleted`)
  }

  const handleBulkMove = async (tabId) => {
    await api.bulkAction(selectedIds, 'move', tabId)
    setSelectedIds([]); setSelectionMode(false)
    refresh(); refreshTabs()
    toast.success('Links moved')
  }

  // Pull-to-refresh
  const handleTouchStart = (e) => {
    if (window.scrollY === 0) { touchStartY.current = e.touches[0].clientY; setPulling(true) }
  }
  const handleTouchMove = (e) => {
    if (!pulling) return
    const diff = e.touches[0].clientY - touchStartY.current
    if (diff > 0 && diff < 120) setPullDistance(diff)
  }
  const handleTouchEnd = () => {
    if (pullDistance > 80) { refresh(); refreshTabs(); toast.success('Refreshed') }
    setPullDistance(0); setPulling(false)
  }

  const slideVariants = {
    enter: (dir) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? '-30%' : '30%', opacity: 0 }),
  }

  const headerTitle = showUngrouped ? 'Ungrouped' : (activeTab ? activeTab.name : 'All Links')

  const renderLink = (link, i) => (
    <LinkCard
      key={link.id}
      link={link}
      index={i}
      selectionMode={selectionMode}
      selected={selectedIds.includes(link.id)}
      onSelect={toggleSelect}
      onEdit={handleEditLink}
      onDelete={handleDeleteLink}
      onToggleFav={handleToggleFav}
      onTogglePin={handleTogglePin}
    />
  )

  return (
    <div className="flex-1 min-h-[100dvh]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {pullDistance > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center items-center pointer-events-none pull-indicator"
          style={{ height: `${pullDistance}px`, opacity: pullDistance > 40 ? 1 : 0.5 }}>
          <div className={`text-xs ${pullDistance > 80 ? 'text-accent-400' : ''}`} style={{ color: pullDistance > 80 ? '#818cf8' : 'var(--text-muted)' }}>
            {pullDistance > 80 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 glass px-4 sm:px-8 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => onNavigate('/')} className="sm:hidden p-2 -ml-2 flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
              <div className="h-6 w-6 rounded-lg bg-accent-600 flex items-center justify-center">
                <FolderSimple size={13} weight="fill" className="text-white" />
              </div>
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>{headerTitle}</h1>
              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                {processedLinks.length} {processedLinks.length === 1 ? 'link' : 'links'}
                {pinnedLinks.length > 0 && <span className="ml-2 inline-flex items-center gap-0.5"><PushPin size={9} weight="fill" /> {pinnedLinks.length}</span>}
                {activeTag && <span className="text-accent-400 ml-1">#{activeTag}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="glass text-xs rounded-lg px-2.5 py-2 border-none outline-none cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="az">A-Z</option><option value="za">Z-A</option>
            </select>
            <button onClick={() => setSelectionMode(!selectionMode)} className={`p-2 rounded-lg transition-colors ${selectionMode ? 'bg-accent-600 text-white' : ''}`} style={!selectionMode ? { color: 'var(--text-muted)' } : {}}><CheckSquare size={16} /></button>
            <button onClick={() => { setEditingLink(null); setModalOpen(true) }} className="sm:hidden h-9 w-9 bg-accent-600 text-white rounded-xl active:scale-95 transition-all flex items-center justify-center"><Plus size={18} weight="bold" /></button>
            <button onClick={() => { setEditingLink(null); setModalOpen(true) }} className="hidden sm:inline-flex items-center gap-1.5 bg-accent-600 text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-accent-500 active:scale-[0.98] transition-all"><Plus size={15} weight="bold" /><span>Add Link</span></button>
          </div>
        </div>
        <div className="mt-3"><SearchBar value={search} onChange={setSearch} placeholder="Search title, URL, description..." /></div>
        {allTags.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {activeTag && <button onClick={() => setActiveTag(null)} className="shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Clear</button>}
            {allTags.map(tag => <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} className="shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-all glass" style={{ color: 'var(--text-tertiary)', borderColor: activeTag === tag ? 'rgba(99,102,241,0.5)' : 'var(--border-subtle)', background: activeTag === tag ? 'rgba(99,102,241,0.15)' : '' }}>{tag}</button>)}
          </div>
        )}
      </header>

      {/* Tab pills */}
      <div className="px-4 sm:px-8 pt-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {tabList.map((tab) => {
            if (tab.id === 'ungrouped') {
              const isActive = showUngrouped
              return (
                <button key="ungrouped" onClick={() => switchTab(null, true)} className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5"
                  style={{ background: isActive ? '#71717a' : 'var(--bg-secondary)', color: isActive ? '#fff' : 'var(--text-tertiary)', boxShadow: isActive ? '0 2px 8px rgba(113,113,122,0.3)' : 'none' }}>
                  <Stack size={12} weight="bold" />Ungrouped
                </button>
              )
            }
            const isActive = tab.id === activeTabId && !showUngrouped
            return (
              <button key={tab.id || 'all'} onClick={() => switchTab(tab.id)} onDoubleClick={() => tab.id && setEditTabModal(safeTabs.find(t => t.id === tab.id))}
                className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 group"
                style={{ background: isActive ? '#4f46e5' : 'var(--bg-secondary)', color: isActive ? '#fff' : 'var(--text-tertiary)', boxShadow: isActive ? '0 2px 8px rgba(99,102,241,0.3)' : 'none' }}>
                {tab.id !== null && <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tab.color || '#6366f1' }} />}
                {tab.id === null && <Stack size={12} weight="bold" className="inline" />}
                {tab.name}
                {tab.id !== null && tab.link_count !== undefined && <span className="opacity-50">{tab.link_count}</span>}
              </button>
            )
          })}
          <button onClick={() => setNewTabOpen(true)} className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1" style={{ color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}><Plus size={12} weight="bold" />New</button>
        </div>
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 glass rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-xl"
          >
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{selectedIds.length} selected</span>
            <div className="h-4 w-px" style={{ background: 'var(--border-subtle)' }} />
            <select onChange={(e) => { if (e.target.value) handleBulkMove(Number(e.target.value)); e.target.value = '' }}
              className="text-xs bg-transparent outline-none cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <option value="">Move to...</option>
              {safeTabs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={handleBulkDelete} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"><Trash size={13} /> Delete</button>
            <button onClick={() => { setSelectionMode(false); setSelectedIds([]) }} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8 overflow-hidden">
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={showUngrouped ? 'ungrouped' : (activeTabId || 'all')}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="space-y-3"
          >
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <LinkSkeleton key={i} />)}</div>
            ) : processedLinks.length === 0 ? (
              <EmptyState title={search ? 'No matching links' : 'No links yet'} subtitle={search ? 'Try a different search term' : 'Add your first link to get started'} actionLabel={search ? undefined : 'Add Link'} onAction={search ? undefined : () => setModalOpen(true)} />
            ) : (
              <>
                {pinnedLinks.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-medium uppercase tracking-wider flex items-center gap-1 px-1" style={{ color: 'var(--text-muted)' }}>
                      <PushPin size={10} weight="fill" /> Pinned
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {pinnedLinks.map((link, i) => renderLink(link, i))}
                    </div>
                  </div>
                )}
                {normalLinks.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {normalLinks.map((link, i) => renderLink(link, i))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <button onClick={() => { setEditingLink(null); setModalOpen(true) }} className="sm:hidden fixed bottom-20 right-4 z-40 h-14 w-14 bg-accent-600 text-white rounded-2xl shadow-lg shadow-accent-600/30 flex items-center justify-center active:scale-90 transition-transform"><Plus size={24} weight="bold" /></button>

      <LinkModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingLink(null) }} onSubmit={handleAddLink} initial={editingLink} tabs={safeTabs} />

      <TabEditModal tab={editTabModal} onClose={() => setEditTabModal(null)} onSave={async (data) => { await updateTab(editTabModal.id, data); setEditTabModal(null); toast.success('Group updated') }} onDelete={(t) => { setEditTabModal(null); refresh() }} />

      {newTabOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => setNewTabOpen(false)}>
          <div className="glass rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>New Group</h3>
            <input autoFocus value={newTabName} onChange={(e) => setNewTabName(e.target.value)} placeholder="Group name..." className="input-base w-full rounded-xl px-4 py-2.5 text-sm outline-none mb-3" onKeyDown={(e) => { if (e.key === 'Enter') createNewTab() }} />
            {newTabName.trim() && (
              <div className="flex items-center gap-2 mb-4">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setNewTabColor(c)} className={`h-5 w-5 rounded-full transition-transform ${newTabColor === c ? 'scale-125 ring-2 ring-white/20' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={createNewTab} disabled={!newTabName.trim()} className="flex-1 bg-accent-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Create</button>
              <button onClick={() => setNewTabOpen(false)} className="glass px-4 py-2.5 rounded-xl text-sm surface-hover" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
