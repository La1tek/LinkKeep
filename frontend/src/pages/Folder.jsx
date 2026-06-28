import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ArrowLeft, PushPin, CheckSquare, X, Trash, MagnifyingGlass, ListBullets, SquaresFour } from '@phosphor-icons/react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTabStore } from '../hooks/useTabStore'
import { useLinks } from '../hooks/useLinks'
import { useViewMode } from '../hooks/useViewMode'
import { api } from '../lib/api'
import LinkCard from '../components/LinkCard'
import LinkGridCard from '../components/LinkGridCard'
import LinkModal from '../components/LinkModal'
import SearchBar from '../components/SearchBar'
import EmptyState from '../components/EmptyState'
import { LinkSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'
import { openConfirm } from '../components/ConfirmModal'
import AnimatedCounter from '../components/AnimatedCounter'

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
}

const staggerItem = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }
}

function throttle(fn, ms) {
  let last = 0
  let rafId = null
  return (...args) => {
    const now = performance.now()
    if (now - last >= ms) { last = now; fn(...args) }
    else if (!rafId) { rafId = requestAnimationFrame(() => { last = now; rafId = null; fn(...args) }) }
  }
}

export default function Folder({ token }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { tabs, refresh: refreshTabs } = useTabStore()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [activeTag, setActiveTag] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [pullDistance, setPullDistance] = useState(0)
  const [pulling, setPulling] = useState(false)
  const [headerScrolled, setHeaderScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const touchStartY = useRef(0)
  const toast = useToast()
  const { mode: viewMode, toggle: toggleViewMode } = useViewMode()

  const safeTabs = tabs || []

  // Determine if "all" or specific folder
  const isAll = id === 'all'
  const currentTab = safeTabs.find(t => t.id === Number(id))

  // Adaptive scroll
  useEffect(() => {
    const onScroll = throttle(() => { setHeaderScrolled(window.scrollY > 40) }, 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const linkParams = useMemo(() => {
    const p = {}
    if (!isAll && id) p.tab_id = Number(id)
    if (search) p.q = search
    return p
  }, [id, isAll, search])

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

  const pinnedLinks = processedLinks.filter(l => l.is_pinned)
  const normalLinks = processedLinks.filter(l => !l.is_pinned)

  const headerTitle = isAll ? 'All Links' : (currentTab ? currentTab.name : 'Folder')
  const accentColor = isAll ? '#6366f1' : (currentTab?.color || '#6366f1')

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

  const handleDeleteFolder = async () => {
    if (!currentTab) return
    setMenuOpen(false)
    if (currentTab.link_count > 0) {
      const result = await openConfirm({
        title: `Delete "${currentTab.name}"?`,
        message: `This folder has ${currentTab.link_count} ${currentTab.link_count === 1 ? 'link' : 'links'}.`,
        threeWay: true,
      })
      if (!result) return
      const keepLinks = result === 'keep_links'
      await api.deleteTab(currentTab.id, keepLinks)
      refreshTabs()
      toast.success(keepLinks ? 'Folder deleted, links kept' : 'Folder and links deleted')
      navigate('/')
    } else {
      const ok = await openConfirm({ title: `Delete "${currentTab.name}"?`, danger: true })
      if (!ok) return
      await api.deleteTab(currentTab.id, false)
      refreshTabs()
      toast.success('Folder deleted')
      navigate('/')
    }
  }

  const defaultTabId = isAll ? '' : (id || '')

  const isGrid = viewMode === 'grid'

  const renderLinkList = (link, i) => (
    <motion.div key={link.id} variants={staggerItem}>
      <LinkCard
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
    </motion.div>
  )

  const renderLinkGrid = (link, i) => (
    <motion.div key={link.id} variants={staggerItem}>
      <LinkGridCard
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
    </motion.div>
  )

  return (
    <div className="flex-1 min-h-[100dvh]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {pullDistance > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center items-center pointer-events-none"
          style={{ height: `${pullDistance}px`, opacity: pullDistance > 40 ? 1 : 0.5 }}>
          <div className={`text-xs ${pullDistance > 80 ? 'text-accent-400' : ''}`} style={{ color: pullDistance > 80 ? '#818cf8' : 'var(--text-muted)' }}>
            {pullDistance > 80 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 transition-all duration-300"
        style={{
          background: 'var(--bg-glass)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-subtle)',
          boxShadow: headerScrolled ? '0 1px 12px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        <div className={`relative transition-all duration-300 ${headerScrolled ? 'px-4 sm:px-8 py-2' : 'px-4 sm:px-8 py-3'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => navigate('/')} className="p-2 -ml-2 rounded-lg transition-colors hover:bg-accent-500/10" style={{ color: 'var(--text-tertiary)' }}>
                <ArrowLeft size={18} />
              </button>
              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
              <div className="min-w-0">
                <h1 className={`font-semibold tracking-tight truncate transition-all duration-300 ${headerScrolled ? 'text-sm' : 'text-base'}`} style={{ color: 'var(--text-primary)' }}>{headerTitle}</h1>
                <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  <AnimatedCounter value={processedLinks.length} /> {processedLinks.length === 1 ? 'link' : 'links'}
                  {pinnedLinks.length > 0 && <span className="ml-2 inline-flex items-center gap-0.5"><PushPin size={9} weight="fill" /> <AnimatedCounter value={pinnedLinks.length} /></span>}
                  {activeTag && <span className="text-accent-400 ml-1">#{activeTag}</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* View mode toggle */}
              <button onClick={toggleViewMode} className="p-2 rounded-lg transition-colors surface-hover" style={{ color: 'var(--text-muted)' }}>
                {isGrid ? <ListBullets size={16} /> : <SquaresFour size={16} />}
              </button>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="glass text-xs rounded-lg px-2 py-2 border-none outline-none cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="az">A-Z</option><option value="za">Z-A</option>
              </select>
              <button onClick={() => setSelectionMode(!selectionMode)} className={`p-2 rounded-lg transition-colors ${selectionMode ? 'bg-accent-600 text-white' : ''}`} style={!selectionMode ? { color: 'var(--text-muted)' } : {}}><CheckSquare size={16} /></button>
              {/* 3-dot menu for folder actions */}
              {!isAll && currentTab && (
                <div className="relative">
                  <button onClick={() => setMenuOpen(!menuOpen)} onBlur={() => setTimeout(() => setMenuOpen(false), 150)} className="p-2 rounded-lg transition-colors surface-hover" style={{ color: 'var(--text-muted)' }}>
                    <Trash size={16} />
                  </button>
                  <AnimatePresence>
                    {menuOpen && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-full mt-1 z-20 glass rounded-xl py-1 min-w-[140px] shadow-xl">
                        <button onClick={handleDeleteFolder} className="w-full px-3 py-2 text-left text-xs hover:bg-red-500/10 flex items-center gap-2 text-red-400"><Trash size={13} /> Delete folder</button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              <button onClick={() => { setEditingLink(null); setModalOpen(true) }} className="h-9 w-9 bg-accent-600 text-white rounded-xl active:scale-95 transition-all flex items-center justify-center hover:bg-accent-500"><Plus size={18} weight="bold" /></button>
            </div>
          </div>

          <div className="mt-3">
            <SearchBar value={search} onChange={setSearch} placeholder="Search in this folder..." />
          </div>

          {allTags.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {activeTag && <button onClick={() => setActiveTag(null)} className="shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Clear</button>}
              {allTags.map(tag => <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} className="shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-all glass" style={{ color: 'var(--text-tertiary)', borderColor: activeTag === tag ? 'rgba(99,102,241,0.5)' : 'var(--border-subtle)', background: activeTag === tag ? 'rgba(99,102,241,0.15)' : '' }}>{tag}</button>)}
            </div>
          )}
        </div>
      </header>

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

      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8">
        {loading ? (
          <div className={`${isGrid ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid grid-cols-1 md:grid-cols-2'} gap-3`}>
            {Array.from({ length: 4 }).map((_, i) => <LinkSkeleton key={i} index={i} />)}
          </div>
        ) : processedLinks.length === 0 ? (
          <EmptyState
            title={search ? 'No matching links' : 'No links yet'}
            subtitle={search ? 'Try a different search term' : 'Add your first link to this folder'}
            actionLabel={search ? undefined : 'Add Link'}
            onAction={search ? undefined : () => setModalOpen(true)}
            illustration={search ? 'no-results' : 'no-links'}
          />
        ) : (
          <>
            {pinnedLinks.length > 0 && (
              <div className="space-y-1.5 mb-4">
                <div className="text-[10px] font-medium uppercase tracking-wider flex items-center gap-1 px-1" style={{ color: 'var(--text-muted)' }}>
                  <PushPin size={10} weight="fill" /> Pinned
                </div>
                <motion.div className={`${isGrid ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid grid-cols-1 md:grid-cols-2'} gap-3`} variants={staggerContainer} initial="hidden" animate="show">
                  {pinnedLinks.map(isGrid ? renderLinkGrid : renderLinkList)}
                </motion.div>
              </div>
            )}
            {normalLinks.length > 0 && (
              <motion.div className={`${isGrid ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid grid-cols-1 md:grid-cols-2'} gap-3`} variants={staggerContainer} initial="hidden" animate="show">
                {normalLinks.map(isGrid ? renderLinkGrid : renderLinkList)}
              </motion.div>
            )}
          </>
        )}
      </main>

      {/* Floating add button on mobile */}
      <button onClick={() => { setEditingLink(null); setModalOpen(true) }} className="sm:hidden fixed bottom-20 right-4 z-40 h-14 w-14 bg-accent-600 text-white rounded-2xl shadow-lg shadow-accent-600/30 flex items-center justify-center active:scale-90 transition-transform"><Plus size={24} weight="bold" /></button>

      <LinkModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingLink(null) }} onSubmit={handleAddLink} initial={editingLink} tabs={safeTabs} defaultTabId={defaultTabId} />
    </div>
  )
}
