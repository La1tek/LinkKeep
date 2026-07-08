import { Star, DotsThreeVertical, Trash, PencilSimple, PushPin, PushPinSlash, NotePencil, Check, ArrowUpRight, GlobeHemisphereWest, Archive, BookOpen, Info } from '@phosphor-icons/react'
import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

function ArchiveStatusBadge({ link }) {
  if (!link.archive_status) return null
  const done = link.archive_status === 'completed'
  const failed = link.archive_status === 'failed'
  const color = done ? 'var(--accent-mint)' : failed ? '#ef4444' : 'var(--accent-amber)'
  const background = done ? 'rgba(45,212,191,0.12)' : failed ? 'rgba(239,68,68,0.12)' : 'rgba(244,184,102,0.12)'
  const border = done ? 'rgba(45,212,191,0.22)' : failed ? 'rgba(239,68,68,0.22)' : 'rgba(244,184,102,0.22)'
  const label = done ? 'Archived' : failed ? 'Archive failed' : 'Archiving'
  return (
    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full mt-2" style={{ color, background, border: `1px solid ${border}` }}>
      <Archive size={9} weight="fill" /> {label}
    </span>
  )
}

export default function LinkGridCard({ link, onEdit, onDelete, onToggleFav, onTogglePin, onArchive, onViewArchive, onDetails, onSelect, selected, selectionMode }) {
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

  const handleSelectionClick = (e) => {
    if (!selectionMode || e.target.closest('[data-selection-checkbox]')) return
    e.preventDefault()
    e.stopPropagation()
    onSelect?.(link)
  }

  const handleSelectionKeyDown = (e) => {
    if (!selectionMode || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    onSelect?.(link)
  }

  return (
    <div
      role={selectionMode ? 'button' : undefined}
      tabIndex={selectionMode ? 0 : undefined}
      aria-pressed={selectionMode ? selected : undefined}
      onClickCapture={handleSelectionClick}
      onKeyDown={handleSelectionKeyDown}
      onContextMenu={(e) => { e.preventDefault(); if (onSelect) onSelect(link) }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      className={`group archive-slip rounded-2xl overflow-visible transition-all hover:-translate-y-0.5 relative cursor-pointer ${link.is_pinned ? 'ring-1 ring-accent-500/30' : ''} ${selected ? 'ring-2 ring-accent-500' : ''}`}
      onClick={(e) => {
        if (selectionMode) { onSelect?.(link); return }
        if (!e.target.closest('button') && !e.target.closest('a')) {
          window.open(link.url, '_blank', 'noopener,noreferrer')
        }
      }}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <button data-selection-checkbox onClick={(e) => { e.stopPropagation(); onSelect?.(link) }} className="absolute top-2 left-2 z-10" aria-label={selected ? 'Unselect link' : 'Select link'}>
          <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${selected ? 'bg-accent-600 border-accent-600' : 'border-gray-400 bg-white/80'}`}>
            {selected && <Check size={12} weight="bold" className="text-white" />}
          </div>
        </button>
      )}

      {/* OG Image or favicon fallback */}
      <div className="relative w-full aspect-video overflow-hidden rounded-t-2xl" style={{ background: 'linear-gradient(135deg, rgba(124,140,255,0.12), var(--bg-tertiary))' }}>
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
              <img src={favicon} alt="" className="h-12 w-12 rounded-2xl object-contain p-2" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }} />
            </div>
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--bg-tertiary)' }}>
            <img src={favicon} alt="" className="h-12 w-12 rounded-2xl object-contain p-2" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }} />
          </div>
        )}

        {/* Fav button overlay */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav?.(link) }}
          className="absolute top-2 right-2 p-1.5 rounded-xl transition-all opacity-0 group-hover:opacity-100"
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
            <p className="metadata-line text-[11px] mt-0.5 truncate flex items-center gap-1">
              {getDomain(link.url)}
              <ArrowUpRight size={10} weight="bold" className="shrink-0 opacity-50" />
            </p>
            <ArchiveStatusBadge link={link} />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            className="p-1 rounded-xl transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <DotsThreeVertical size={14} weight="bold" />
          </button>
        </div>

        {link.tags && link.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {link.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="metadata-line text-[9px] px-1.5 py-0.5 rounded-full surface">{tag}</span>
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
            onBlur={(e) => { onEdit?.({ ...link, note: e.target.value, _inlineUpdate: { note: e.target.value } }); setShowNote(false) }}
            autoFocus
            className="input-base w-full rounded-2xl px-2 py-1 text-xs outline-none resize-none mt-2"
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
            className="link-menu-open absolute right-2 top-full mt-1 z-[70] glass rounded-2xl py-1 min-w-[160px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => { onEdit?.(link); setMenuOpen(false) }}
              className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}
            >
              <PencilSimple size={13} /> Edit
            </button>
            <button onClick={() => { onDetails?.(link); setMenuOpen(false) }}
              className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}
            >
              <Info size={13} /> Details
            </button>
            <button onClick={() => { window.open(`https://web.archive.org/web/${encodeURIComponent(link.url)}`, '_blank'); setMenuOpen(false) }}
              className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}
            >
              <GlobeHemisphereWest size={13} /> Wayback Machine
            </button>
            <button onClick={() => { onArchive?.(link); setMenuOpen(false) }}
              className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}
            >
              <Archive size={13} /> Archive now
            </button>
            <button onClick={() => { onViewArchive?.(link); setMenuOpen(false) }}
              className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}
            >
              <BookOpen size={13} /> View archive
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
        <div className="absolute top-2 left-2 h-5 w-5 rounded-full flex items-center justify-center shadow-lg" style={{ background: 'var(--accent-primary)' }}>
          <PushPin size={10} weight="fill" className="text-white" />
        </div>
      )}
    </div>
  )
}
