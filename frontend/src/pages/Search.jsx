import { useState, useMemo, useEffect } from 'react'
import { MagnifyingGlass, Plus, Sparkle, Trash } from '@phosphor-icons/react'
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
  const [searchMode, setSearchMode] = useState('fulltext')
  const [fulltextLinks, setFulltextLinks] = useState([])
  const [fulltextLoading, setFulltextLoading] = useState(false)
  const [savedSearches, setSavedSearches] = useState([])
  const [smartCollections, setSmartCollections] = useState([])
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

  const refreshCollections = async () => {
    try {
      const [saved, smart] = await Promise.all([
        api.listSavedSearches(),
        api.listSmartCollections(),
      ])
      setSavedSearches(saved.saved_searches || [])
      setSmartCollections(smart.smart_collections || [])
    } catch (err) {
      toast.error(err.message)
    }
  }

  useEffect(() => { refreshCollections() }, [])

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

  const handleSaveSearch = async (type) => {
    const query = search.trim()
    if (!query) {
      toast.error('Type a search query first')
      return
    }
    const name = prompt(type === 'smart' ? 'Smart collection name:' : 'Saved search name:', query)
    if (!name?.trim()) return
    try {
      if (type === 'smart') await api.createSmartCollection({ name: name.trim(), query, color: '#6366f1' })
      else await api.createSavedSearch({ name: name.trim(), query })
      await refreshCollections()
      toast.success(type === 'smart' ? 'Smart collection saved' : 'Search saved')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const deleteSavedSearch = async (item) => {
    try {
      await api.deleteSavedSearch(item.id)
      setSavedSearches((items) => items.filter((row) => row.id !== item.id))
      toast.success('Saved search deleted')
    } catch (err) { toast.error(err.message) }
  }

  const deleteSmartCollection = async (item) => {
    try {
      await api.deleteSmartCollection(item.id)
      setSmartCollections((items) => items.filter((row) => row.id !== item.id))
      toast.success('Smart collection deleted')
    } catch (err) { toast.error(err.message) }
  }

  const applyQuery = (query) => {
    setSearch(query)
    setSearchMode('fulltext')
  }

  const operatorHints = ['tag:design', 'site:github.com', 'type:article', 'is:dead', 'is:archived', 'has:note', 'before:2026-01-01', 'after:2026-01-01']

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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={handleReindex} className="text-[11px] text-accent-400 hover:text-accent-300">Rebuild full-text index</button>
            <button onClick={() => handleSaveSearch('saved')} className="text-[11px] text-accent-400 hover:text-accent-300 inline-flex items-center gap-1"><Plus size={11} />Save search</button>
            <button onClick={() => handleSaveSearch('smart')} className="text-[11px] text-accent-400 hover:text-accent-300 inline-flex items-center gap-1"><Sparkle size={11} />Smart collection</button>
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {operatorHints.map((hint) => (
              <button key={hint} onClick={() => setSearch((value) => value ? `${value} ${hint}` : hint)} className="shrink-0 text-[10px] px-2.5 py-1 rounded-full surface-hover glass" style={{ color: 'var(--text-tertiary)' }}>
                {hint}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8">
        {(savedSearches.length > 0 || smartCollections.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
            {smartCollections.length > 0 && (
              <section className="glass rounded-2xl p-3">
                <h2 className="text-xs font-medium uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><Sparkle size={12} /> Smart collections</h2>
                <div className="space-y-1.5">
                  {smartCollections.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-xl px-2 py-2 surface-hover">
                      <button onClick={() => applyQuery(item.query)} className="min-w-0 flex-1 text-left">
                        <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{item.query} · {item.count ?? 0} links</p>
                      </button>
                      <button onClick={() => deleteSmartCollection(item)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400" aria-label="Delete smart collection"><Trash size={13} /></button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {savedSearches.length > 0 && (
              <section className="glass rounded-2xl p-3">
                <h2 className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Saved searches</h2>
                <div className="space-y-1.5">
                  {savedSearches.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-xl px-2 py-2 surface-hover">
                      <button onClick={() => applyQuery(item.query)} className="min-w-0 flex-1 text-left">
                        <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{item.name}</p>
                        <p className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{item.query}</p>
                      </button>
                      <button onClick={() => deleteSavedSearch(item)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400" aria-label="Delete saved search"><Trash size={13} /></button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
        {activeLoading && search ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({ length: 3 }).map((_, i) => <LinkSkeleton key={i} />)}</div>
        ) : search && processedLinks.length === 0 ? (
          <EmptyState title="No results" subtitle={`No links match "${search}"`} illustration="no-results" />
        ) : !search ? (
          <EmptyState
            icon={<MagnifyingGlass size={40} weight="light" className="text-accent-400/60" />}
            title="Search your links"
            subtitle="Use operators like tag:, site:, type:, is:dead, has:note, before:, after:. Full-text search also scans archived readable text."
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
