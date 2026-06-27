import { motion, AnimatePresence } from 'framer-motion'
import { Star, DotsThreeVertical, ArrowUpRight, Trash, PencilSimple } from '@phosphor-icons/react'
import { useState } from 'react'

export default function LinkCard({ link, onEdit, onDelete, onToggleFav, index = 0 }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const favicon = link.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=64`

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
      className="group glass rounded-2xl p-4 transition-all active:scale-[0.99] surface-hover"
    >
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className="absolute inset-0 blur-md bg-accent-500/5 rounded-lg" />
          <img src={favicon} alt="" className="relative h-10 w-10 rounded-xl object-contain p-1.5" style={{ background: 'var(--bg-tertiary)' }}
            onError={(e) => { e.target.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=64` }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{link.title}</h3>
            {link.is_favorite && <Star size={13} weight="fill" className="text-amber-400 shrink-0" />}
          </div>
          {link.description && <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-tertiary)' }}>{link.description}</p>}
          <a href={link.url} target="_blank" rel="noreferrer" className="text-xs mt-1.5 inline-flex items-center gap-1 truncate max-w-full" style={{ color: 'rgba(129, 140, 248, 0.8)' }}>
            <span className="truncate">{link.url}</span>
            <ArrowUpRight size={11} weight="bold" className="shrink-0" />
          </a>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onToggleFav(link)}
            className="p-1.5 rounded-lg transition-colors hover:bg-amber-400/10"
            style={{ color: link.is_favorite ? '#fbbf24' : 'var(--text-muted)' }}
          >
            <Star size={16} weight={link.is_favorite ? 'fill' : 'regular'} />
          </button>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              className="p-1.5 rounded-lg transition-colors surface-hover"
              style={{ color: 'var(--text-muted)' }}
            >
              <DotsThreeVertical size={16} weight="bold" />
            </button>
            {menuOpen && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                className="absolute right-0 top-full mt-1 z-20 glass rounded-xl py-1 min-w-[140px]"
              >
                <button onClick={() => { onEdit(link); setMenuOpen(false) }}
                  className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}
                >
                  <PencilSimple size={13} /> Edit
                </button>
                <button onClick={() => { onDelete(link); setMenuOpen(false) }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-red-500/10 flex items-center gap-2 text-red-400"
                >
                  <Trash size={13} /> Delete
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {link.tags && link.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 ml-13">
          {(link.tags || []).map((tag, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full surface" style={{ color: 'var(--text-tertiary)' }}>{tag}</span>
          ))}
        </div>
      )}
    </motion.div>
  )
}
