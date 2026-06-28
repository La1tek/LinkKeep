import { Star, DotsThreeVertical, Trash, PencilSimple, PushPin, PushPinSlash, NotePencil, Check, ArrowUpRight } from '@phosphor-icons/react'
import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

export default function LinkGridCard({ link, onEdit, onDelete, onToggleFav, onTogglePin, onSelect, selected, selectionMode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const longPressTimer = useRef(null)
  const favicon = link.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=64`
  const ogImage = link.image

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => { if (onSelect) onSelect(link) }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  return (
    <div
      onContextMenu={(e) => { e.preventDefault(); if (onSelect) onSelect(link) }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      className={`group glass rounded-2xl overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 relative cursor-pointer ${link.is_pinned ? 'ring-1 ring-accent-500/30' : ''} ${selected ? 'ring-2 ring-accent-500' : ''}`}
      onClick={(e) => {
        if (selectionMode) { onSelect?.(link); return }
        if (!e.target.closest('button') && !e.target.closest('a')) {
          window.open(link.url, '_blank', 'noopener,noreferrer')
        }
      }}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <button onClick={() => onSelect?.(link)} className="absolute top-2 left-2 z-10">
          <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${selected ? 'bg-accent-600 border-accent-600' : 'border-gray-400 bg-white/80'}`}>
            {selected && <Check size={12} weight="bold" className="text-white" />}
          </div>
        </button>
      )}

      {/* OG Image or favicon fallback */}
      <div className="relative w-full aspect-video overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
        {ogImage ? (
          <>
            <img
              src={ogImage}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
            />
            {/* Fallback when image fails */}
            <div className="absolute inset-0 items-center justify-center" style={{ display: 'none', background: 'var(--bg-tertiary)' }}>
              <img src={favicon} alt="" className="h-12 w-12 rounded-xl object-contain p-2" style={{ background: 'var(--bg-secondary)' }} />
            </div>
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-tertiary)' }}>
            <img src={favicon} alt="" className="h-12 w-12 rounded-xl object-contain p-2" style={{ background: 'var(--bg-secondary)' }} />
          </div>
        )}

        {/* Fav button overlay */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav?.(link) }}
          className="absolute top-2 right-2 p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
          style={{ color: link.is_favorite ? '#fbbf24' : 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.3)' }}
        >
          <Star size={14} weight={link.is_favorite ? 'fill' : 'regular'} />
        </button>
      </div>

      {/* Content */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {link.title}
            </h3>
            <p className="text-[11px] mt-0.5 truncate flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
              {getDomain(link.url)}
              <ArrowUpRight size={10} weight="bold" className="shrink-0 opacity-50" />
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            className="p-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <DotsThreeVertical size={14} weight="bold" />
          </button>
        </div>

        {link.tags && link.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {link.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full surface" style={{ color: 'var(--text-muted)' }}>{tag}</span>
            ))}
            {link.tags.length > 3 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ color: 'var(--text-muted)' }}>+{link.tags.length - 3}</span>
            )}
          </div>
        )}

        {showNote && (
          <textarea
            defaultValue={link.note || ''}
            placeholder="Add a note..."
            onBlur={(e) => { onEdit?.({ ...link, note: e.target.value }); setShowNote(false) }}
            autoFocus
            className="input-base w-full rounded-lg px-2 py-1 text-xs outline-none resize-none mt-2"
            rows={2}
          />
        )}
      </div>

      {/* Dropdown menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-2 top-full mt-1 z-20 glass rounded-xl py-1 min-w-[150px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => { onEdit?.(link); setMenuOpen(false) }}
              className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}
            >
              <PencilSimple size={13} /> Edit
            </button>
            <button onClick={() => { onTogglePin?.(link); setMenuOpen(false) }}
              className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}
            >
              {link.is_pinned ? <><PushPinSlash size={13} /> Unpin</> : <><PushPin size={13} /> Pin to top</>}
            </button>
            <button onClick={() => { setShowNote(!showNote); setMenuOpen(false) }}
              className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}
            >
              <NotePencil size={13} /> {link.note ? 'Edit note' : 'Add note'}
            </button>
            <button onClick={() => { onDelete?.(link); setMenuOpen(false) }}
              className="w-full px-3 py-2 text-left text-xs hover:bg-red-500/10 flex items-center gap-2 text-red-400"
            >
              <Trash size={13} /> Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pinned indicator */}
      {link.is_pinned && (
        <div className="absolute top-2 left-2 h-5 w-5 rounded-full bg-accent-600 flex items-center justify-center shadow-lg">
          <PushPin size={10} weight="fill" className="text-white" />
        </div>
      )}
    </div>
  )
}
