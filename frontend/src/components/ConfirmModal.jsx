import { motion, AnimatePresence } from 'framer-motion'
import { Warning, Check, X } from '@phosphor-icons/react'
import { useState, useEffect } from 'react'

let confirmResolver = null

export function openConfirm(options) {
  return new Promise((resolve) => {
    confirmResolver = resolve
    window.dispatchEvent(new CustomEvent('confirm-open', { detail: options }))
  })
}

const layouts = {
  default: {
    buttons: [
      { text: 'Confirm', result: true, primary: true },
      { text: 'Cancel', result: false },
    ],
  },
  danger: {
    buttons: [
      { text: 'Confirm', result: true, primary: true, danger: true },
      { text: 'Cancel', result: false },
    ],
  },
  threeWay: {
    buttons: [
      { text: 'Delete tab only', result: 'keep_links', primary: true },
      { text: 'Delete all', result: 'delete_all', danger: true },
      { text: 'Cancel', result: false },
    ],
  },
}

export function ConfirmModal() {
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

  if (!open || !options) return null

  const handle = (result) => {
    setOpen(false)
    if (confirmResolver) {
      confirmResolver(result)
      confirmResolver = null
    }
  }

  const buttons = options.buttons || (options.threeWay ? layouts.threeWay.buttons : options.danger ? layouts.danger.buttons : layouts.default.buttons)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => handle(options.cancelResult ?? false)}
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
        >
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-2xl p-6 max-w-sm w-full"
          >
            <div className="flex items-start gap-3 mb-5">
              {(options.danger || options.threeWay) && (
                <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <Warning size={20} className="text-red-400" />
                </div>
              )}
              <div className="flex-1">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {options.title || 'Confirm'}
                </h3>
                {options.message && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{options.message}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {buttons.map((btn) => (
                <button
                  key={btn.text}
                  onClick={() => handle(btn.result)}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98] ${
                    btn.danger
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : btn.primary
                      ? 'bg-accent-600 text-white hover:bg-accent-500'
                      : 'glass surface-hover'
                  }`}
                  style={!btn.danger && !btn.primary ? { color: 'var(--text-secondary)' } : {}}
                >
                  {btn.text}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
