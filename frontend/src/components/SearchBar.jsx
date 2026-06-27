import { MagnifyingGlass, X } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'

export default function SearchBar({ value, onChange, autoFocus }) {
  return (
    <div className="relative">
      <MagnifyingGlass
        size={16}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        placeholder="Search links..."
        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl pl-10 pr-10 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-accent-500/40 focus:bg-white/[0.05] outline-none transition-all"
      />
      <AnimatePresence>
        {value && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-zinc-500 hover:text-zinc-300"
          >
            <X size={14} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
