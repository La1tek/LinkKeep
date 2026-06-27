import { motion, AnimatePresence } from 'framer-motion'
import { Warning, Check, X } from '@phosphor-icons/react'

let confirmResolver = null

export function openConfirm(options) {
  return new Promise((resolve) => {
    confirmResolver = resolve
    window.dispatchEvent(new CustomEvent('confirm-open', { detail: options }))
  })
}

export function ConfirmModal() {
  let state = useConfirmState()
  if (!state.open) return null

  const handle = (result) => {
    state.close()
    if (confirmResolver) {
      confirmResolver(result)
      confirmResolver = null
    }
  }

  return (
    <AnimatePresence>
      {state.open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => handle(false)}
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-2xl p-6 max-w-sm w-full"
          >
            <div className="flex items-start gap-3 mb-4">
              {state.options?.danger && (
                <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <Warning size={20} className="text-red-400" />
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-zinc-100">
                  {state.options?.title || 'Confirm'}
                </h3>
                {state.options?.message && (
                  <p className="text-xs text-zinc-400 mt-1">{state.options.message}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handle(true)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${
                  state.options?.danger
                    ? 'bg-red-600 text-white hover:bg-red-500'
                    : 'bg-accent-600 text-white hover:bg-accent-500'
                }`}
              >
                <Check size={14} className="inline mr-1" />
                {state.options?.confirmText || 'Confirm'}
              </button>
              <button
                onClick={() => handle(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium glass text-zinc-300 hover:bg-white/5 transition-all active:scale-[0.98]"
              >
                <X size={14} className="inline mr-1" />
                {state.options?.cancelText || 'Cancel'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

import { useState, useEffect } from 'react'

function useConfirmState() {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      setOptions(e.detail)
      setOpen(true)
    }
    window.addEventListener('confirm-open', handler)
    return () => window.removeEventListener('confirm-open', handler)
  }, [])

  return { open, options, close: () => setOpen(false) }
}
