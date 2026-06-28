import { motion, AnimatePresence } from 'framer-motion'
import { X, SpinnerGap } from '@phosphor-icons/react'
import { useState, useEffect } from 'react'

export default function LinkModal({ open, onClose, onSubmit, initial, tabs, defaultTabId }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [tabId, setTabId] = useState('')
  const [tags, setTags] = useState('')
  const [autoFetched, setAutoFetched] = useState(false)
  const [fetching, setFetching] = useState(false)
  const isEdit = !!initial

  useEffect(() => {
    if (initial) {
      setTitle(initial.title || ''); setUrl(initial.url || ''); setDescription(initial.description || '')
      setTabId(initial.tab_id || ''); setTags((initial.tags || []).join(', ')); setAutoFetched(true)
    } else {
      setTitle(''); setUrl(''); setDescription(''); setTabId(defaultTabId || ''); setTags(''); setAutoFetched(false)
    }
  }, [initial, open])

  const handleUrlBlur = async () => {
    if (autoFetched || !url) return
    setFetching(true)
    try {
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('lk_token')}` },
        body: JSON.stringify({ url }),
      })
      const meta = await res.json()
      if (meta.title && !title) setTitle(meta.title)
      if (meta.description && !description) setDescription(meta.description)
      setAutoFetched(true)
    } catch {} finally { setFetching(false) }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
    onSubmit({ title, url, description: description || null, tab_id: tabId ? Number(tabId) : null, tags: tagList })
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                {isEdit ? 'Edit Link' : 'New Link'}
              </h2>
              <button onClick={onClose} className="p-2 rounded-lg surface-hover" style={{ color: 'var(--text-tertiary)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="URL">
                <div className="relative">
                  <input type="url" required value={url} onChange={(e) => { setUrl(e.target.value); setAutoFetched(false) }} onBlur={handleUrlBlur}
                    placeholder="https://example.com" className="input-base w-full rounded-xl px-4 py-3 text-sm outline-none" />
                  {fetching && <SpinnerGap size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-accent-400" />}
                </div>
              </Field>
              <Field label="Title">
                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Link title" className="input-base w-full rounded-xl px-4 py-3 text-sm outline-none" />
              </Field>
              <Field label="Description (optional)">
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" rows={2} className="input-base w-full rounded-xl px-4 py-3 text-sm outline-none resize-none" />
              </Field>
              <Field label="Tab">
                <select value={tabId} onChange={(e) => setTabId(e.target.value)} className="input-base w-full rounded-xl px-4 py-3 text-sm outline-none">
                  <option value="">No tab</option>
                  {(tabs || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Tags (comma separated)">
                <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="design, inspiration, tools" className="input-base w-full rounded-xl px-4 py-3 text-sm outline-none" />
              </Field>
              <button type="submit" className="w-full bg-accent-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-accent-500 active:scale-[0.98] transition-all">
                {isEdit ? 'Save Changes' : 'Add Link'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      {children}
    </div>
  )
}
