import { Star, DotsThreeVertical, ArrowUpRight, Trash, PencilSimple, PushPin, PushPinSlash, NotePencil, Check, GlobeHemisphereWest, BookOpen, Archive } from '@phosphor-icons/react'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return '' }
}

function InlineEdit({ value, onSave, onCancel, placeholder, className, multiline = false }) {
  const [val, setVal] = useState(value)
  const inputRef = useRef(null)
  useEffect(() => {
    inputRef.current?.focus()
    if (inputRef.current && !multiline) inputRef.current.select()
  }, [])

  const save = () => {
    const trimmed = val.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    else onCancel()
  }

  if (multiline) {
    return (
      <textarea
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
          if (e.key === 'Escape') onCancel()
        }}
        className={`input-base w-full rounded-lg px-2 py-1 text-sm outline-none ${className || ''}`}
        placeholder={placeholder}
        rows={2}
      />
    )
  }
  return (
    <input
      ref={inputRef}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') onCancel()
      }}
      className={`input-base w-full rounded-lg px-2 py-0.5 text-sm outline-none ${className || ''}`}
      placeholder={placeholder}
    />
  )
}

function StatusDot({ link }) {
  const httpStatus = link.http_status
  // Not checked yet
  if (httpStatus === null || httpStatus === undefined) {
    return (
      <span className="inline-flex items-center justify-center shrink-0" style={{ width: 6, height: 6 }}>
        <span className="block rounded-full" style={{ width: 6, height: 6, backgroundColor: 'var(--text-muted)' }} />
      </span>
    )
  }
  const isDead = httpStatus === 0 || httpStatus >= 400
  const isRedirect = httpStatus >= 300 && httpStatus < 400
  const color = isDead ? '#ef4444' : isRedirect ? '#fbbf24' : '#22c55e'
  const title = httpStatus === 0 ? 'Unreachable' : isDead ? `Dead (${httpStatus})` : isRedirect ? `Redirect (${httpStatus})` : `OK (${httpStatus})`
  return (
    <span className="inline-flex items-center justify-center shrink-0" style={{ width: 6, height: 6 }} title={title}>
      <span className="block rounded-full" style={{ width: 6, height: 6, backgroundColor: color }} />
    </span>
  )
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
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full shrink-0" style={{ color, background, border: `1px solid ${border}` }}>
      <Archive size={10} weight="fill" /> {label}
    </span>
  )
}

export default function LinkCard({ link, onEdit, onDelete, onToggleFav, onTogglePin, onArchive, onViewArchive, onSelect, selected, selectionMode, index = 0 }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showNote, setShowNote] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editingUrl, setEditingUrl] = useState(false)
  const longPressTimer = useRef(null)
  const favicon = link.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=64`

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      if (onSelect) onSelect(link)
    }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  const handleSaveField = (field, value) => {
    onEdit?.({ ...link, [field]: value, _inlineUpdate: { [field]: value } })
    if (field === 'title') setEditingTitle(false)
    if (field === 'url') setEditingUrl(false)
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

  const isMobile = typeof window !== 'undefined' && 'ontouchstart' in window

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
      className={`group archive-slip rounded-2xl p-4 transition-all surface-hover relative ${selectionMode ? 'cursor-pointer' : ''} ${link.is_pinned ? 'ring-1 ring-accent-500/30' : ''} ${selected ? 'ring-2 ring-accent-500' : ''}`}
      style={{ overflow: 'visible' }}
    >
      {/* Pinned indicator */}
      {link.is_pinned && (
        <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full flex items-center justify-center shadow-lg" style={{ background: 'var(--accent-primary)' }}>
          <PushPin size={10} weight="fill" className="text-white" />
        </div>
      )}

      {/* Selection checkbox */}
      {selectionMode && (
        <button
          data-selection-checkbox
          onClick={(e) => { e.stopPropagation(); onSelect?.(link) }}
          className="absolute top-2 left-2 z-10"
          aria-label={selected ? 'Unselect link' : 'Select link'}
        >
          <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${selected ? 'bg-accent-600 border-accent-600' : 'border-gray-400'}`}>
            {selected && <Check size={12} weight="bold" className="text-white" />}
          </div>
        </button>
      )}

      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className="absolute inset-0 blur-md rounded-lg" style={{ background: 'rgba(124,140,255,0.08)' }} />
          {/* Favicon with tooltip (desktop only) */}
          <div className="relative favicon-tooltip" data-tooltip={`${getDomain(link.url)}${link.created_at ? ' · ' + formatDate(link.created_at) : ''}`}>
            <img src={favicon} alt="" className="relative h-11 w-11 rounded-2xl object-contain p-2" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
              onError={(e) => { e.target.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=64` }}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {editingTitle ? (
              <InlineEdit
                value={link.title}
                onSave={(v) => handleSaveField('title', v)}
                onCancel={() => setEditingTitle(false)}
                className="text-sm font-medium"
                placeholder="Link title"
              />
            ) : (
              <h3
                className="text-sm font-semibold truncate cursor-default"
                style={{ color: 'var(--text-primary)' }}
                onDoubleClick={(e) => { if (!isMobile) { e.preventDefault(); setEditingTitle(true) } }}
              >{link.title}</h3>
            )}
            {link.is_favorite && <Star size={13} weight="fill" className="text-amber-400 shrink-0" />}
            <ArchiveStatusBadge link={link} />
          </div>
          {link.description && <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-tertiary)' }}>{link.description}</p>}
          <div className="metadata-line text-xs mt-1.5 inline-flex items-center gap-1.5 truncate max-w-full">
            {editingUrl ? (
              <InlineEdit
                value={link.url}
                onSave={(v) => handleSaveField('url', v)}
                onCancel={() => setEditingUrl(false)}
                className="text-xs"
                placeholder="https://..."
              />
            ) : (
              <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate max-w-full"
                style={{ color: 'var(--accent-primary)' }}
                onDoubleClick={(e) => { if (!isMobile) { e.preventDefault(); e.stopPropagation(); setEditingUrl(true) } }}
              >
                <StatusDot link={link} />
                <span className="truncate">{link.url}</span>
                <ArrowUpRight size={11} weight="bold" className="shrink-0" />
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onToggleFav?.(link)}
            className="p-1.5 rounded-xl transition-colors hover:bg-amber-400/10"
            style={{ color: link.is_favorite ? '#fbbf24' : 'var(--text-muted)' }}
          >
            <Star size={16} weight={link.is_favorite ? 'fill' : 'regular'} />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              className="p-1.5 rounded-xl transition-colors surface-hover"
              style={{ color: 'var(--text-muted)' }}
            >
              <DotsThreeVertical size={16} weight="bold" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
                  className="link-menu-open absolute right-0 top-full mt-1 z-[70] glass rounded-2xl py-1 min-w-[170px] shadow-xl"
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
                  {link.content ? (
                    <button onClick={() => { onEdit?.({ ...link, _showReader: true }); setMenuOpen(false) }}
                      className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}
                    >
                      <BookOpen size={13} /> View saved content
                    </button>
                  ) : (
                    <button onClick={() => { onEdit?.({ ...link, _fetchContent: true }); setMenuOpen(false) }}
                      className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}
                    >
                      <BookOpen size={13} /> Save & read content
                    </button>
                  )}
                  <button onClick={() => { onDelete?.(link); setMenuOpen(false) }}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-red-500/10 flex items-center gap-2 text-red-400"
                  >
                    <Trash size={13} /> Delete
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Note */}
      {showNote && (
        <div className="mt-3">
          <textarea
            defaultValue={link.note || ''}
            placeholder="Add a note..."
            onBlur={(e) => {
              onEdit?.({ ...link, note: e.target.value, _inlineUpdate: { note: e.target.value } })
              setShowNote(false)
            }}
            autoFocus
            className="input-base w-full rounded-2xl px-3 py-2 text-xs outline-none resize-none"
            rows={2}
          />
        </div>
      )}
      {!showNote && link.note && (
        <div className="mt-2 ml-13 text-xs flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <NotePencil size={12} className="shrink-0 mt-0.5" />
          <span className="italic line-clamp-2">{link.note}</span>
        </div>
      )}

      {link.tags && link.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 ml-13">
          {(link.tags || []).map((tag, i) => (
            <span key={i} className="metadata-line text-[10px] px-2 py-0.5 rounded-full surface">{tag}</span>
          ))}
        </div>
      )}
    </div>
  )
}
