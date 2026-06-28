import { motion } from 'framer-motion'
import { Plus, StackSimple } from '@phosphor-icons/react'

const illustrations = {
  'no-links': (
    <svg viewBox="0 0 120 120" fill="none" className="w-20 h-20" aria-hidden="true">
      {/* Bookshelf */}
      <rect x="16" y="24" width="88" height="72" rx="4" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <line x1="16" y1="48" x2="104" y2="48" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <line x1="16" y1="72" x2="104" y2="72" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      {/* Bookmark */}
      <path d="M52 30 L52 50 L60 45 L68 50 L68 30" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.6" className="accent-stroke" />
      {/* Plus hint */}
      <circle cx="60" cy="90" r="12" stroke="currentColor" strokeWidth="2" opacity="0.3" className="accent-stroke" />
      <line x1="55" y1="90" x2="65" y2="90" stroke="currentColor" strokeWidth="2" opacity="0.5" className="accent-stroke" />
      <line x1="60" y1="85" x2="60" y2="95" stroke="currentColor" strokeWidth="2" opacity="0.5" className="accent-stroke" />
    </svg>
  ),
  'no-results': (
    <svg viewBox="0 0 120 120" fill="none" className="w-20 h-20" aria-hidden="true">
      {/* Magnifying glass */}
      <circle cx="52" cy="48" r="24" stroke="currentColor" strokeWidth="2.5" opacity="0.35" className="accent-stroke" />
      <line x1="70" y1="66" x2="94" y2="90" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.35" className="accent-stroke" />
      {/* Question mark */}
      <text x="52" y="56" textAnchor="middle" fontSize="22" fontWeight="bold" fill="currentColor" opacity="0.4" className="accent-fill">?</text>
    </svg>
  ),
  'no-favorites': (
    <svg viewBox="0 0 120 120" fill="none" className="w-20 h-20" aria-hidden="true">
      {/* Star outline (empty) */}
      <path d="M60 20 L69.5 43 L94 46.5 L76 64 L80 88 L60 77 L40 88 L44 64 L26 46.5 L50.5 43 Z"
        stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" opacity="0.3" className="accent-stroke" />
      {/* Small broken line through star */}
      <line x1="38" y1="82" x2="82" y2="38" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.2" />
      {/* Small dots */}
      <circle cx="60" cy="100" r="2.5" fill="currentColor" opacity="0.25" className="accent-fill" />
    </svg>
  ),
}

export default function EmptyState({ icon, title, subtitle, actionLabel, onAction, illustration = 'no-links' }) {
  const svg = illustrations[illustration]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center py-20 sm:py-24 px-6 text-center"
    >
      <div className="relative mb-6">
        <div className="absolute inset-0 blur-3xl bg-accent-500/10 rounded-full" />
        <div className="relative glass rounded-3xl p-6 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
          {svg || icon || (
            <StackSimple size={40} weight="light" className="text-accent-400" />
          )}
        </div>
      </div>
      <h3 className="text-base sm:text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {subtitle && <p className="mt-2 text-sm max-w-xs sm:max-w-sm" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>}
      {actionLabel && onAction && (
        <button onClick={onAction}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-accent-500 active:scale-[0.98]">
          <Plus size={16} weight="bold" />
          {actionLabel}
        </button>
      )}
    </motion.div>
  )
}


