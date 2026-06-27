import { useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Star as StarIcon, Plus } from '@phosphor-icons/react'
import { useLinks } from '../hooks/useLinks'
import { useTabs } from '../hooks/useTabs'
import LinkCard from '../components/LinkCard'
import LinkModal from '../components/LinkModal'
import SearchBar from '../components/SearchBar'
import EmptyState from '../components/EmptyState'
import { LinkSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'
import { openConfirm } from '../components/ConfirmModal'

export default function Favorites({ token }) {
  const { tabs } = useTabs(token)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const toast = useToast()

  const { links, loading, update, remove, toggleFav } = useLinks(token, { favorite: true, q: search || undefined })

  const processedLinks = useMemo(() => {
    let result = [...(links || [])]
    switch (sortBy) {
      case 'newest': result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break
      case 'oldest': result.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break
      case 'az': result.sort((a, b) => a.title.localeCompare(b.title)); break
      case 'za': result.sort((a, b) => b.title.localeCompare(a.title)); break
    }
    return result
  }, [links, sortBy])

  const handleAdd = async (data) => {
    try {
      if (editingLink) {
        await update(editingLink.id, data)
        toast.success('Link updated')
      }
      setModalOpen(false)
      setEditingLink(null)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleDelete = async (link) => {
    const ok = await openConfirm({
      title: `Delete "${link.title}"?`,
      danger: true,
      confirmText: 'Delete',
    })
    if (!ok) return
    await remove(link.id)
    toast.success('Link deleted')
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass border-b border-white/[0.06] px-4 sm:px-8 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
              <StarIcon size={18} weight="fill" className="text-amber-400" />
              Favorites
            </h1>
            <p className="text-[11px] text-zinc-500">{processedLinks.length} starred links</p>
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="glass text-xs text-zinc-300 rounded-lg px-2.5 py-2 border-none outline-none cursor-pointer hover:bg-white/5"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="az">A-Z</option>
            <option value="za">Z-A</option>
          </select>
        </div>
        <div className="mt-3">
          <SearchBar value={search} onChange={setSearch} />
        </div>
      </header>

      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <LinkSkeleton key={i} />)}
          </div>
        ) : processedLinks.length === 0 ? (
          <EmptyState
            icon={<StarIcon size={40} weight="light" className="text-amber-400/60" />}
            title="No favorites yet"
            subtitle="Star important links to find them here instantly"
          />
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {processedLinks.map((link, i) => (
                <LinkCard
                  key={link.id}
                  link={link}
                  index={i}
                  onEdit={(l) => { setEditingLink(l); setModalOpen(true) }}
                  onDelete={handleDelete}
                  onToggleFav={(l) => { toggleFav(l); toast.success(l.is_favorite ? 'Removed from favorites' : 'Added to favorites') }}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      <LinkModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingLink(null) }}
        onSubmit={handleAdd}
        initial={editingLink}
        tabs={tabs || []}
      />
    </div>
  )
}
