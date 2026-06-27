import { motion } from 'framer-motion'
import { StackSimple, Plus } from '@phosphor-icons/react'

export default function EmptyState({ icon, title, subtitle, actionLabel, onAction }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center py-24 px-6 text-center"
    >
      <div className="relative mb-8">
        <div className="absolute inset-0 blur-3xl bg-accent-500/10 rounded-full" />
        <div className="relative glass rounded-3xl p-6">
          {icon || <StackSimple size={40} weight="light" className="text-accent-400" />}
        </div>
      </div>
      <h3 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {subtitle && <p className="mt-2 text-sm max-w-sm" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>}
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
