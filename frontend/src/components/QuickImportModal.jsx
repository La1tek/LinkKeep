import { useEffect, useRef, useState } from 'react'
import { FileArrowUp, Upload, X } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'

export const IMPORT_SOURCES = [
  { value: 'generic_json', label: 'LinkKeep JSON', accept: '.json' },
  { value: 'bookmarks_html', label: 'Browser bookmarks HTML', accept: '.html,.htm' },
  { value: 'pocket_json', label: 'Pocket JSON', accept: '.json' },
  { value: 'raindrop_csv', label: 'Raindrop CSV', accept: '.csv' },
]

export const IMPORT_MODES = [
  { value: 'merge', label: 'Merge' },
  { value: 'skip', label: 'Skip existing' },
  { value: 'replace', label: 'Replace all' },
]

export function getImportSourceLabel(value) {
  return IMPORT_SOURCES.find((source) => source.value === value)?.label || 'Import'
}

export default function QuickImportModal({ open, onClose, source, setSource, mode, setMode, onImport, busy }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const selectedSource = IMPORT_SOURCES.find((item) => item.value === source) || IMPORT_SOURCES[0]

  useEffect(() => {
    if (!open) {
      setFile(null)
      setDragActive(false)
    }
  }, [open])

  const handleFiles = (files) => {
    const nextFile = files?.[0]
    if (nextFile) setFile(nextFile)
  }

  const handleSubmit = async () => {
    if (!file || busy) return
    const imported = await onImport(file)
    if (imported !== false) onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.56)', backdropFilter: 'blur(6px)' }}
          onClick={() => { if (!busy) onClose() }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="glass rounded-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-import-title"
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-accent-600/15 border border-accent-500/20 flex items-center justify-center">
                  <Upload size={19} className="text-accent-400" />
                </div>
                <div>
                  <h3 id="quick-import-title" className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Quick Import</h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{selectedSource.label}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="h-9 w-9 rounded-xl surface-hover flex items-center justify-center disabled:opacity-40"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Close import"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Source</span>
                  <select value={source} onChange={(e) => setSource(e.target.value)} className="input-base w-full rounded-xl px-3 py-2.5 text-sm outline-none">
                    {IMPORT_SOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Mode</span>
                  <select value={mode} onChange={(e) => setMode(e.target.value)} className="input-base w-full rounded-xl px-3 py-2.5 text-sm outline-none">
                    {IMPORT_MODES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </div>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragEnter={(e) => { e.preventDefault(); setDragActive(true) }}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragActive(false)
                  handleFiles(e.dataTransfer.files)
                }}
                className="w-full rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-all"
                style={{
                  borderColor: dragActive ? 'rgba(99,102,241,0.65)' : 'var(--border-input)',
                  background: dragActive ? 'rgba(99,102,241,0.12)' : 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                }}
              >
                <FileArrowUp size={30} className="mx-auto mb-3 text-accent-400" />
                <span className="block text-sm font-medium">{file ? file.name : 'Drop file here or click to select'}</span>
                <span className="block text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  {selectedSource.accept.replaceAll(',', ', ')}
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={selectedSource.accept}
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!file || busy}
                  className="flex-1 bg-accent-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {busy ? 'Importing...' : 'Import'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="glass px-4 py-2.5 rounded-xl text-sm surface-hover disabled:opacity-40"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
