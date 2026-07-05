import { motion } from 'framer-motion'
import { DotsThree, PencilSimple, Trash, CaretRight } from '@phosphor-icons/react'
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import AnimatedCounter from './AnimatedCounter'

const staggerItem = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return '' }
}

function getFaviconUrl(url) {
  if (!url) return null
  try { return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getDomain(url))}&sz=32` }
  catch { return null }
}

export default function FolderCard({ tab, links = [], index = 0, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const longPressTimer = useRef(null)
  const navigate = useNavigate()

  const linkCount = tab.total_link_count ?? tab.link_count ?? links.length

  // Get last 4 favicons from links
  const previewFavicons = (links || []).slice(0, 4).map(l => ({
    favicon: l.favicon || getFaviconUrl(l.url),
    domain: getDomain(l.url),
  })).filter(f => f.domain)

  const extraCount = linkCount - previewFavicons.length

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => setShowMenu(true), 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }

  const handleClick = () => {
    if (showMenu) return
    navigate(`/folder/${tab.id}`)
  }

  const handleContextMenu = (e) => {
    e.preventDefault()
    setShowMenu(true)
  }

  const accentColor = tab.color || '#6366f1'

  return (
    <motion.div
      variants={staggerItem}
      className="relative group"
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      <button
        onClick={handleClick}
        className="w-full text-left glass rounded-2xl p-4 transition-all relative overflow-hidden hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
      >
        {/* Color accent bar at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1"
          style={{
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88, transparent)`,
          }}
        />

        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${accentColor}20`, border: `1px solid ${accentColor}30` }}
            >
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: accentColor }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {tab.name}
              </h3>
              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                <AnimatedCounter value={linkCount} /> {linkCount === 1 ? 'link' : 'links'}
              </p>
            </div>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(true) }}
            className="p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100 sm:opacity-0 hover:opacity-100"
            style={{ color: 'var(--text-muted)' }}
          >
            <DotsThree size={16} weight="bold" />
          </button>
        </div>

        {/* Subfolder indicator */}
        {(tab.child_count > 0) && (
          <div className="flex items-center gap-1 mt-2">
            <CaretRight size={10} weight="bold" style={{ color: accentColor }} />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{tab.child_count} subfolder{tab.child_count === 1 ? '' : 's'}</span>
          </div>
        )}

        {/* Preview favicons */}
        {previewFavicons.length > 0 && (
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            {previewFavicons.map((f, i) => (
              <img
                key={i}
                src={f.favicon}
                alt=""
                className="h-5 w-5 rounded-md object-contain p-0.5"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                onError={(e) => { e.target.style.display = 'none' }}
              />
            ))}
            {extraCount > 0 && (
              <span className="text-[10px] ml-0.5" style={{ color: 'var(--text-muted)' }}>+{extraCount}</span>
            )}
          </div>
        )}
      </button>

      {/* Context menu */}
      {showMenu && (
        <div
          className="fixed inset-0 z-[70]"
          onClick={() => setShowMenu(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute right-0 top-full mt-1 z-[75] glass rounded-xl py-1 min-w-[140px] shadow-xl"
            style={{ right: '8px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { onEdit?.(tab); setShowMenu(false) }}
              className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              <PencilSimple size={13} /> Edit
            </button>
            <button
              onClick={() => { onDelete?.(tab); setShowMenu(false) }}
              className="w-full px-3 py-2 text-left text-xs hover:bg-red-500/10 flex items-center gap-2 text-red-400"
            >
              <Trash size={13} /> Delete
            </button>
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}
