import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Plus, Star as StarIcon } from '@phosphor-icons/react'
import { useLinks } from '../hooks/useLinks'
import { useTabs } from '../hooks/useTabs'
import LinkCard from '../components/LinkCard'
import LinkModal from '../components/LinkModal'
import SearchBar from '../components/SearchBar'
import EmptyState from '../components/EmptyState'
import { LinkSkeleton } from '../components/Skeleton'

export default function Favorites({ token }) {
  const { tabs } = useTabs(token)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState(null)

  const { links, loading, update, remove, toggleFav } = useLinks(token, { favorite: true, q: search || undefined })

  const handleAdd = async (data) => {
    if (editingLink) {
      await update(editingLink.id, data)
    }
    setModalOpen(false)
    setEditingLink(null)
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
            <p className="text-[11px] text-zinc-500">{links.length} starred links</p>
          </div>
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
        ) : links.length === 0 ? (
          <EmptyState
            icon={<StarIcon size={40} weight="light" className="text-amber-400/60" />}
            title="No favorites yet"
            subtitle="Star important links to find them here instantly"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {links.map((link, i) => (
                <LinkCard
                  key={link.id}
                  link={link}
                  index={i}
                  onEdit={(l) => { setEditingLink(l); setModalOpen(true) }}
                  onDelete={(l) => confirm(`Delete "${l.title}"?`) && remove(l.id)}
                  onToggleFav={toggleFav}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <LinkModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingLink(null) }}
        onSubmit={handleAdd}
        initial={editingLink}
        tabs={tabs}
      />
    </div>
  )
}
