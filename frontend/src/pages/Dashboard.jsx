import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

export default function Dashboard({ token, user, onNavigate, initialTabId }) {
  const { tabs, create: createTab, refresh: refreshTabs } = useTabStore()
  const [activeTabId, setActiveTabId] = useState(initialTabId || null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [activeTag, setActiveTag] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const toast = useToast()

  const linkParams = useMemo(() => {
    const p = {}
    if (activeTabId) p.tab_id = activeTabId
    if (search) p.q = search
    return p
  }, [activeTabId, search])

  const { links, loading, create: createLink, update: updateLink, remove: deleteLink, toggleFav } = useLinks(token, linkParams)
  const safeTabs = tabs || []
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
    const ok = await openConfirm({ title: `Delete "${link.title}"?`, danger: true, confirmText: 'Delete' })
    if (!ok) return
    await deleteLink(link.id); toast.success('Link deleted')
    refreshTabs()
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
          <button onClick={() => setActiveTabId(null)} className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all" style={{ background: !activeTabId ? '#4f46e5' : '', color: !activeTabId ? '#fff' : 'var(--text-tertiary)' }}><Stack size={12} weight="bold" className="inline mr-1" />All</button>
          {safeTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTabId(tab.id)} className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 glass" style={{ background: activeTabId === tab.id ? '#4f46e5' : '', color: activeTabId === tab.id ? '#fff' : 'var(--text-tertiary)' }}>
              <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tab.color || '#6366f1' }} />{tab.name}<span className="opacity-50">{tab.link_count}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <LinkSkeleton key={i} />)}</div>
        ) : processedLinks.length === 0 ? (
          <EmptyState title={search ? 'No matching links' : 'No links yet'} subtitle={search ? 'Try a different search term' : 'Add your first link to get started'} actionLabel={search ? undefined : 'Add Link'} onAction={search ? undefined : () => setModalOpen(true)} />
        ) : (
          <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence>
              {processedLinks.map((link, i) => <LinkCard key={link.id} link={link} index={i} onEdit={(l) => { setEditingLink(l); setModalOpen(true) }} onDelete={handleDeleteLink} onToggleFav={(l) => { toggleFav(l); toast.success(l.is_favorite ? 'Removed from favorites' : 'Added to favorites') }} />)}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      <button onClick={() => { setEditingLink(null); setModalOpen(true) }} className="sm:hidden fixed bottom-20 right-4 z-40 h-14 w-14 bg-accent-600 text-white rounded-2xl shadow-lg shadow-accent-600/30 flex items-center justify-center active:scale-90 transition-transform"><Plus size={24} weight="bold" /></button>

      <LinkModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingLink(null) }} onSubmit={handleAddLink} initial={editingLink} tabs={safeTabs} />
    </div>
  )
}
