import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, House, Stack, Star, ArrowLeft } from '@phosphor-icons/react'
import { useTabs } from '../hooks/useTabs'
import { useLinks } from '../hooks/useLinks'
import LinkCard from '../components/LinkCard'
import LinkModal from '../components/LinkModal'
import SearchBar from '../components/SearchBar'
import EmptyState from '../components/EmptyState'
import { LinkSkeleton } from '../components/Skeleton'

export default function Dashboard({ token, user, onNavigate, initialTabId }) {
  const { tabs, create: createTab, remove: deleteTab } = useTabs(token)
  const [activeTabId, setActiveTabId] = useState(initialTabId || null)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState(null)

  const linkParams = useMemo(() => {
    const p = {}
    if (activeTabId) p.tab_id = activeTabId
    if (search) p.q = search
    return p
  }, [activeTabId, search])

  const { links, loading, create: createLink, update: updateLink, remove: deleteLink, toggleFav } = useLinks(token, linkParams)

  const activeTab = tabs.find(t => t.id === activeTabId)

  const handleAddLink = async (data) => {
    if (editingLink) {
      await updateLink(editingLink.id, data)
    } else {
      await createLink(data)
    }
    setModalOpen(false)
    setEditingLink(null)
  }

  const handleDeleteLink = async (link) => {
    if (!confirm(`Delete "${link.title}"?`)) return
    await deleteLink(link.id)
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      {/* Header */}
      <header className="sticky top-0 z-30 glass border-b border-white/[0.06] px-4 sm:px-8 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => onNavigate('/')}
              className="sm:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-200"
            >
              <House size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight text-zinc-100 truncate">
                {activeTab ? activeTab.name : 'All Links'}
              </h1>
              <p className="text-[11px] text-zinc-500">
                {links.length} {links.length === 1 ? 'link' : 'links'}
              </p>
            </div>
          </div>

          <button
            onClick={() => { setEditingLink(null); setModalOpen(true) }}
            className="inline-flex items-center gap-1.5 bg-accent-600 text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-accent-500 active:scale-[0.98] transition-all shrink-0"
          >
            <Plus size={15} weight="bold" />
            <span className="hidden sm:inline">Add Link</span>
          </button>
        </div>

        {/* Search */}
        <div className="mt-3">
          <SearchBar value={search} onChange={setSearch} />
        </div>
      </header>

      {/* Tab pills (mobile + desktop below header) */}
      <div className="px-4 sm:px-8 pt-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          <button
            onClick={() => setActiveTabId(null)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              !activeTabId
                ? 'bg-accent-600 text-white'
                : 'glass text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Stack size={12} weight="bold" className="inline mr-1" />
            All
          </button>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTabId === tab.id
                  ? 'bg-accent-600 text-white'
                  : 'glass text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: tab.color || '#6366f1' }}
              />
              {tab.name}
              <span className="opacity-50">{tab.link_count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Links grid */}
      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <LinkSkeleton key={i} />)}
          </div>
        ) : links.length === 0 ? (
          <EmptyState
            title={search ? 'No matching links' : 'No links yet'}
            subtitle={search ? 'Try a different search term' : 'Add your first link to get started'}
            actionLabel={search ? undefined : 'Add Link'}
            onAction={search ? undefined : () => setModalOpen(true)}
          />
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {links.map((link, i) => (
                <LinkCard
                  key={link.id}
                  link={link}
                  index={i}
                  onEdit={(l) => { setEditingLink(l); setModalOpen(true) }}
                  onDelete={handleDeleteLink}
                  onToggleFav={toggleFav}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      <LinkModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingLink(null) }}
        onSubmit={handleAddLink}
        initial={editingLink}
        tabs={tabs}
      />
    </div>
  )
}
