import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'
import { Plus, Stack, FolderSimple } from '@phosphor-icons/react'
import { useTabStore } from '../hooks/useTabStore'
import { useLinks } from '../hooks/useLinks'
import LinkCard from '../components/LinkCard'
import LinkModal from '../components/LinkModal'
import SearchBar from '../components/SearchBar'
import EmptyState from '../components/EmptyState'
import { LinkSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'
import { openConfirm } from '../components/ConfirmModal'

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444']

export default function Dashboard({ token, user, onNavigate, initialTabId }) {
  const { tabs, create: createTab, refresh: refreshTabs } = useTabStore()
  const [activeTabId, setActiveTabId] = useState(initialTabId || null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [activeTag, setActiveTag] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const [newTabOpen, setNewTabOpen] = useState(false)
  const [newTabName, setNewTabName] = useState('')
  const [newTabColor, setNewTabColor] = useState('#6366f1')
  const [direction, setDirection] = useState(0)
  const toast = useToast()

  // Build tab list with "All" at index 0
  const safeTabs = tabs || []
  const tabList = useMemo(() => [{ id: null, name: 'All', color: '#6366f1' }, ...safeTabs], [safeTabs])
  const currentIdx = tabList.findIndex(t => t.id === activeTabId)

  const switchTab = (newId, idx) => {
    setDirection(idx > currentIdx ? 1 : -1)
    setActiveTabId(newId)
  }

  const handleSwipe = (info) => {
    const threshold = 80
    if (info.offset.x < -threshold && currentIdx < tabList.length - 1) {
      const next = tabList[currentIdx + 1]
      switchTab(next.id, currentIdx + 1)
    } else if (info.offset.x > threshold && currentIdx > 0) {
      const prev = tabList[currentIdx - 1]
      switchTab(prev.id, currentIdx - 1)
    }
  }

  const linkParams = useMemo(() => {
    const p = {}
    if (activeTabId) p.tab_id = activeTabId
    if (search) p.q = search
    return p
  }, [activeTabId, search])

  const { links, loading, create: createLink, update: updateLink, remove: deleteLink, toggleFav } = useLinks(token, linkParams)
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
    await deleteLink(link.id); toast.success('Link deleted')
    refreshTabs()
  }

  const createNewTab = () => {
    if (!newTabName.trim()) return
    createTab({ name: newTabName.trim(), color: newTabColor })
    setNewTabName(''); setNewTabColor('#6366f1'); setNewTabOpen(false)
    toast.success('Group created')
  }

  const slideVariants = {
    enter: (dir) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir > 0 ? '-30%' : '30%', opacity: 0 }),
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass px-4 sm:px-8 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => onNavigate('/')} className="sm:hidden p-2 -ml-2 flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
              <div className="h-6 w-6 rounded-lg bg-accent-600 flex items-center justify-center">
                <FolderSimple size={13} weight="fill" className="text-white" />
              </div>
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight truncate" style={{ color: 'var(--text-primary)' }}>{activeTab ? activeTab.name : 'All Links'}</h1>
              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{processedLinks.length} {processedLinks.length === 1 ? 'link' : 'links'}{activeTag && <span className="text-accent-400 ml-1">#{activeTag}</span>}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="glass text-xs rounded-lg px-2.5 py-2 border-none outline-none cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="az">A-Z</option><option value="za">Z-A</option>
            </select>
            <button onClick={() => { setEditingLink(null); setModalOpen(true) }} className="sm:hidden h-9 w-9 bg-accent-600 text-white rounded-xl active:scale-95 transition-all flex items-center justify-center"><Plus size={18} weight="bold" /></button>
            <button onClick={() => { setEditingLink(null); setModalOpen(true) }} className="hidden sm:inline-flex items-center gap-1.5 bg-accent-600 text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-accent-500 active:scale-[0.98] transition-all"><Plus size={15} weight="bold" /><span>Add Link</span></button>
          </div>
        </div>
        <div className="mt-3"><SearchBar value={search} onChange={setSearch} /></div>
        {allTags.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {activeTag && <button onClick={() => setActiveTag(null)} className="shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Clear</button>}
            {allTags.map(tag => <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} className="shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-all glass" style={{ color: 'var(--text-tertiary)', borderColor: activeTag === tag ? 'rgba(99,102,241,0.5)' : 'var(--border-subtle)', background: activeTag === tag ? 'rgba(99,102,241,0.15)' : '' }}>{tag}</button>)}
          </div>
        )}
      </header>

      <div className="px-4 sm:px-8 pt-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {tabList.map((tab, idx) => {
            const isActive = (tab.id) === activeTabId || (tab.id === null && activeTabId === null)
            return (
              <button
                key={tab.id || 'all'}
                onClick={() => switchTab(tab.id, idx)}
                className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5"
                style={{
                  background: isActive ? '#4f46e5' : 'var(--bg-secondary)',
                  color: isActive ? '#fff' : 'var(--text-tertiary)',
                  boxShadow: isActive ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
                }}
              >
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

      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8 overflow-hidden">
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={activeTabId || 'all'}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={(_, info) => handleSwipe(info)}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            {loading ? (
              <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <LinkSkeleton key={i} />)}</div>
            ) : processedLinks.length === 0 ? (
              <div className="col-span-full">
                <EmptyState title={search ? 'No matching links' : 'No links yet'} subtitle={search ? 'Try a different search term' : 'Add your first link to get started'} actionLabel={search ? undefined : 'Add Link'} onAction={search ? undefined : () => setModalOpen(true)} />
              </div>
            ) : (
              processedLinks.map((link, i) => <LinkCard key={link.id} link={link} index={i} onEdit={(l) => { setEditingLink(l); setModalOpen(true) }} onDelete={handleDeleteLink} onToggleFav={(l) => { toggleFav(l.id); toast.success(l.is_favorite ? 'Removed from favorites' : 'Added to favorites') }} />)
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <button onClick={() => { setEditingLink(null); setModalOpen(true) }} className="sm:hidden fixed bottom-20 right-4 z-40 h-14 w-14 bg-accent-600 text-white rounded-2xl shadow-lg shadow-accent-600/30 flex items-center justify-center active:scale-90 transition-transform"><Plus size={24} weight="bold" /></button>

      <LinkModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingLink(null) }} onSubmit={handleAddLink} initial={editingLink} tabs={safeTabs} />

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
