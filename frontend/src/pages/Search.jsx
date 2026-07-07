import { useState, useMemo, useEffect } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { useLinks } from '../hooks/useLinks'
import { useTabStore } from '../hooks/useTabStore'
import { api } from '../lib/api'
import LinkCard from '../components/LinkCard'
import LinkModal from '../components/LinkModal'
import SearchBar from '../components/SearchBar'
import EmptyState from '../components/EmptyState'
import { LinkSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'
import { openConfirm } from '../components/ConfirmModal'

export default function Search({ token }) {
  const { tabs } = useTabStore()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [searchMode, setSearchMode] = useState('quick')
  const [fulltextLinks, setFulltextLinks] = useState([])
  const [fulltextLoading, setFulltextLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const toast = useToast()

  const { links, loading, update, remove, toggleFav } = useLinks(token, { q: search || undefined })
  const activeLinks = searchMode === 'fulltext' ? fulltextLinks : links
  const activeLoading = searchMode === 'fulltext' ? fulltextLoading : loading

  useEffect(() => {
    if (searchMode !== 'fulltext' || !search.trim()) {
      setFulltextLinks([])
      return
    }
    let cancelled = false
    setFulltextLoading(true)
    api.fulltextSearch({ q: search }).then((data) => {
      if (!cancelled) setFulltextLinks(data.links || [])
    }).catch((err) => {
      if (!cancelled) toast.error(err.message)
    }).finally(() => {
      if (!cancelled) setFulltextLoading(false)
    })
    return () => { cancelled = true }
  }, [search, searchMode, toast])

  const processedLinks = useMemo(() => {
    let r = [...(activeLinks || [])]
    switch (sortBy) {
      case 'newest': r.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break
      case 'oldest': r.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break
      case 'az': r.sort((a, b) => a.title.localeCompare(b.title)); break
      case 'za': r.sort((a, b) => b.title.localeCompare(a.title)); break
    }
    return r
  }, [activeLinks, sortBy])

  const handleAdd = async (data) => {
    try { if (editingLink) { await update(editingLink.id, data); toast.success('Link updated') } setModalOpen(false); setEditingLink(null) }
    catch (err) { toast.error(err.message) }
  }

  const handleDelete = async (link) => {
    const ok = await openConfirm({ title: `Delete "${link.title}"?`, danger: true, confirmText: 'Delete' })
    if (!ok) return
    await remove(link.id); toast.success('Link deleted')
  }

  const handleReindex = async () => {
    try {
      const result = await api.reindexSearch()
      toast.success(`Indexed ${result.indexed} links`)
      if (searchMode !== 'fulltext') setSearchMode('fulltext')
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass px-4 sm:px-8 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <MagnifyingGlass size={18} weight="fill" className="text-accent-400" />
              Search
            </h1>
            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {search ? `${processedLinks.length} results` : 'Search across all folders'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={searchMode} onChange={(e) => setSearchMode(e.target.value)} className="glass text-xs rounded-lg px-2.5 py-2 border-none outline-none cursor-pointer" style={{ color: 'var(--text-secondary)' }} aria-label="Search mode">
              <option value="quick">Quick</option><option value="fulltext">Full-text</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="glass text-xs rounded-lg px-2.5 py-2 border-none outline-none cursor-pointer" style={{ color: 'var(--text-secondary)' }} aria-label="Sort results">
              <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="az">A-Z</option><option value="za">Z-A</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <SearchBar value={search} onChange={setSearch} autoFocus placeholder="Search all links by title, URL, description..." />
          <button onClick={handleReindex} className="mt-2 text-[11px] text-accent-400 hover:text-accent-300">Rebuild full-text index</button>
        </div>
      </header>

      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8">
        {activeLoading && search ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({ length: 3 }).map((_, i) => <LinkSkeleton key={i} />)}</div>
        ) : search && processedLinks.length === 0 ? (
          <EmptyState title="No results" subtitle={`No links match "${search}"`} illustration="no-results" />
        ) : !search ? (
          <EmptyState
            icon={<MagnifyingGlass size={40} weight="light" className="text-accent-400/60" />}
            title="Search your links"
            subtitle="Type to search across all folders by title, URL, or description"
            illustration="no-results"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {processedLinks.map((link, i) => (
              <LinkCard key={link.id} link={link} index={i}
                onEdit={async (l) => { if (l._inlineUpdate) { await update(l.id, l._inlineUpdate); toast.success('Link updated'); return } setEditingLink(l); setModalOpen(true) }}
                onDelete={handleDelete}
                onToggleFav={(l) => { toggleFav(l.id); toast.success(l.is_favorite ? 'Removed from favorites' : 'Added to favorites') }}
              />
            ))}
          </div>
        )}
      </main>

      <LinkModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingLink(null) }} onSubmit={handleAdd} initial={editingLink} tabs={tabs || []} />
    </div>
  )
}
