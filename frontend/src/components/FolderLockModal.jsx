import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LockKey, LockKeyOpen, X } from '@phosphor-icons/react'
import { api } from '../lib/api'

export default function FolderLockModal({ open, tab, mode = 'unlock', onClose, onSuccess }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pinRefs = useRef([])

  useEffect(() => {
    if (!open) return
    setPin('')
    setError('')
    setBusy(false)
    requestAnimationFrame(() => pinRefs.current[0]?.focus())
  }, [open, tab?.id, mode])

  if (!tab) return null

  const copy = {
    lock: {
      title: 'Protect folder',
      subtitle: `Set a 4-digit PIN for "${tab.name}". Locked content will be hidden from tree, lists, search, shares, and direct folder reads until unlocked.`,
      button: 'Set PIN',
      icon: <LockKey size={20} weight="fill" />,
    },
    unlock: {
      title: 'Unlock folder',
      subtitle: `"${tab.name}" is protected. Enter its 4-digit PIN to reveal subfolders and links for this session.`,
      button: 'Unlock',
      icon: <LockKeyOpen size={20} weight="fill" />,
    },
    remove: {
      title: 'Remove protection',
      subtitle: `Enter the folder PIN to remove protection from "${tab.name}".`,
      button: 'Remove lock',
      icon: <LockKeyOpen size={20} weight="fill" />,
    },
  }[mode] || {}

  const validPin = /^\d{4}$/.test(pin)
  const pinDigits = Array.from({ length: 4 }, (_, index) => pin[index] || '')

  const focusPinInput = (index) => {
    pinRefs.current[Math.max(0, Math.min(3, index))]?.focus()
  }

  const handlePinChange = (index, value) => {
    const digits = value.replace(/\D/g, '').slice(0, 4 - index).split('')
    const next = [...pinDigits]
    if (!digits.length) {
      next[index] = ''
    } else {
      digits.forEach((digit, offset) => {
        next[index + offset] = digit
      })
    }
    setPin(next.join(''))
    setError('')
    if (digits.length) focusPinInput(index + digits.length)
  }

  const handlePinKeyDown = (index, event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusPinInput(index - 1)
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusPinInput(index + 1)
      return
    }
    if (event.key === 'Backspace' && !pinDigits[index] && index > 0) {
      event.preventDefault()
      const next = [...pinDigits]
      next[index - 1] = ''
      setPin(next.join(''))
      setError('')
      focusPinInput(index - 1)
    }
  }

  const handlePinPaste = (index, event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '')
    if (!pasted) return
    event.preventDefault()
    const next = [...pinDigits]
    pasted.slice(0, 4 - index).split('').forEach((digit, offset) => {
      next[index + offset] = digit
    })
    setPin(next.join(''))
    setError('')
    focusPinInput(index + pasted.length)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validPin) {
      setError('PIN must contain exactly 4 digits')
      return
    }
    setBusy(true)
    setError('')
    try {
      let result = null
      if (mode === 'lock') result = await api.lockTab(tab.id, pin)
      if (mode === 'unlock') {
        result = await api.unlockTab(tab.id, pin)
        if (result?.unlock_token) api.saveFolderUnlock(tab.id, result.unlock_token, result.expires_at)
      }
      if (mode === 'remove') {
        await api.unlockTabPermanently(tab.id, pin)
        api.clearFolderUnlock(tab.id)
      }
      onSuccess?.(result)
      onClose?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.58)', backdropFilter: 'blur(8px)' }}
          onClick={busy ? undefined : onClose}
        >
          <motion.form
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="glass rounded-2xl max-w-md w-full overflow-hidden"
          >
            <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(99,102,241,0.16)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
                {copy.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{copy.title}</h3>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{copy.subtitle}</p>
              </div>
              <button type="button" onClick={onClose} disabled={busy} className="p-1.5 rounded-lg surface-hover disabled:opacity-40" style={{ color: 'var(--text-muted)' }} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <label className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-muted)' }}>4-digit folder PIN</label>
              <div className="pin-code-grid" role="group" aria-label="4-digit folder PIN">
                {pinDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(node) => { pinRefs.current[index] = node }}
                    type="text"
                    value={digit}
                    onChange={(e) => handlePinChange(index, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(index, e)}
                    onPaste={(e) => handlePinPaste(index, e)}
                    className="pin-code-input focus-ring"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    aria-label={`PIN digit ${index + 1}`}
                    disabled={busy}
                  />
                ))}
              </div>
              {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
            </div>

            <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button type="button" onClick={onClose} disabled={busy} className="glass px-4 py-2.5 rounded-xl text-sm surface-hover disabled:opacity-40" style={{ color: 'var(--text-secondary)' }}>
                Cancel
              </button>
              <button type="submit" disabled={busy || !validPin} className="bg-accent-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                {busy ? 'Working...' : copy.button}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
