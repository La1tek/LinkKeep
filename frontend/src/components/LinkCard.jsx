import { motion } from 'framer-motion'
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
      className="group glass rounded-2xl p-4 transition-all hover:bg-white/[0.05] active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        {/* Favicon */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 blur-md bg-accent-500/5 rounded-lg" />
          <img
            src={favicon}
            alt=""
            className="relative h-10 w-10 rounded-xl bg-white/5 object-contain p-1.5"
            onError={(e) => {
              e.target.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(link.url)}&sz=64`
            }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-zinc-100 truncate">
              {link.title}
            </h3>
            {link.is_favorite && (
              <Star size={13} weight="fill" className="text-amber-400 shrink-0" />
            )}
          </div>
          {link.description && (
            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{link.description}</p>
          )}
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent-400/70 hover:text-accent-300 mt-1.5 inline-flex items-center gap-1 truncate max-w-full"
          >
            <span className="truncate">{link.url}</span>
            <ArrowUpRight size={11} weight="bold" className="shrink-0" />
          </a>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggleFav(link)}
            className={`p-1.5 rounded-lg transition-colors ${
              link.is_favorite
                ? 'text-amber-400 hover:bg-amber-400/10'
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/5'
            }`}
          >
            <Star size={16} weight={link.is_favorite ? 'fill' : 'regular'} />
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-colors"
            >
              <DotsThreeVertical size={16} weight="bold" />
            </button>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute right-0 top-full mt-1 z-20 glass rounded-xl py-1 min-w-[140px]"
              >
                <button
                  onClick={() => { onEdit(link); setMenuOpen(false) }}
                  className="w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 flex items-center gap-2"
                >
                  <PencilSimple size={13} /> Edit
                </button>
                <button
                  onClick={() => { onDelete(link); setMenuOpen(false) }}
                  className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                >
                  <Trash size={13} /> Delete
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Tags */}
      {link.tags && link.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 ml-13">
          {link.tags.map((tag, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-zinc-400 border border-white/[0.06]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  )
}
