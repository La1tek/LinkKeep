import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Archive, FilePdf, FileText, ImageSquare, X } from '@phosphor-icons/react'
import { api } from '../lib/api'

function formatDate(value) {
  try { return new Date(value).toLocaleString() } catch { return '' }
}

export default function ArchiveModal({ link, open, onClose, onArchiveCreated }) {
  const [archives, setArchives] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [archive, setArchive] = useState(null)
  const [loading, setLoading] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [tab, setTab] = useState('text')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !link?.id) return
    let cancelled = false
    setError('')
    setArchive(null)
    setSelectedId(null)
    api.listArchives(link.id)
      .then((data) => {
        if (cancelled) return
        const items = data.archives || []
        setArchives(items)
        setSelectedId(items[0]?.id || null)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [open, link?.id])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setLoading(true)
    setError('')
    api.getArchive(selectedId)
      .then((data) => {
        if (!cancelled) setArchive(data)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedId])

  const tabs = useMemo(() => [
    { id: 'text', label: 'Readable text', icon: <FileText size={14} />, enabled: archive?.has_text },
    { id: 'html', label: 'HTML', icon: <Archive size={14} />, enabled: archive?.has_html },
    { id: 'screenshot', label: 'Screenshot', icon: <ImageSquare size={14} />, enabled: archive?.has_screenshot },
    { id: 'pdf', label: 'PDF', icon: <FilePdf size={14} />, enabled: archive?.has_pdf },
  ], [archive])

  useEffect(() => {
    if (!archive) return
    const first = tabs.find((item) => item.enabled)
    if (first && !tabs.find((item) => item.id === tab && item.enabled)) setTab(first.id)
  }, [archive, tabs, tab])

  if (!link) return null

  const handleArchiveNow = async () => {
    setArchiving(true)
    setError('')
    try {
      const result = await api.archiveLink(link.id)
      const data = await api.listArchives(link.id)
      const items = data.archives || []
      setArchives(items)
      setSelectedId(result.id || items[0]?.id || null)
      onArchiveCreated?.(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setArchiving(false)
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
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            className="glass rounded-2xl max-w-5xl w-full max-h-[86vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{link.title}</h3>
                <p className="text-xs truncate mt-1" style={{ color: 'var(--text-tertiary)' }}>{link.url}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={handleArchiveNow} disabled={archiving} className="bg-accent-600 text-white px-3 py-2 rounded-xl text-xs font-medium hover:bg-accent-500 disabled:opacity-40">
                  {archiving ? 'Archiving...' : 'Archive now'}
                </button>
                <button onClick={onClose} className="p-2 rounded-lg surface-hover" style={{ color: 'var(--text-muted)' }} aria-label="Close">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] min-h-0 flex-1">
              <aside className="p-3 md:border-r overflow-y-auto" style={{ borderColor: 'var(--border-subtle)' }}>
                {archives.length > 0 ? (
                  <div className="space-y-2">
                    {archives.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className="w-full text-left rounded-xl px-3 py-2 surface-hover"
                        style={{
                          background: selectedId === item.id ? 'rgba(99,102,241,0.14)' : 'transparent',
                          color: 'var(--text-secondary)',
                          border: selectedId === item.id ? '1px solid rgba(99,102,241,0.28)' : '1px solid transparent',
                        }}
                      >
                        <div className="text-xs font-medium">{item.status}</div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatDate(item.created_at)}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs rounded-xl p-3 surface" style={{ color: 'var(--text-tertiary)' }}>
                    No archives yet. Create the first snapshot for this link.
                  </div>
                )}
              </aside>

              <section className="min-h-0 flex flex-col">
                <div className="px-4 py-3 flex items-center gap-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {tabs.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => item.enabled && setTab(item.id)}
                      disabled={!item.enabled}
                      className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${tab === item.id ? 'bg-accent-600 text-white' : 'glass surface-hover'}`}
                      style={tab === item.id ? undefined : { color: 'var(--text-secondary)' }}
                    >
                      {item.icon}{item.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-auto p-4">
                  {error && <div className="text-xs text-red-400 rounded-xl p-3 mb-3" style={{ background: 'rgba(239,68,68,0.08)' }}>{error}</div>}
                  {loading ? (
                    <div className="space-y-2">
                      <div className="h-3 w-full rounded shimmer-block" />
                      <div className="h-3 w-5/6 rounded shimmer-block" />
                      <div className="h-3 w-2/3 rounded shimmer-block" />
                    </div>
                  ) : archive ? (
                    <>
                      {tab === 'text' && <pre className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)', fontFamily: 'inherit' }}>{archive.readable_text || 'No readable text captured.'}</pre>}
                      {tab === 'html' && <pre className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{archive.html_snapshot || 'No HTML captured.'}</pre>}
                      {tab === 'screenshot' && (
                        archive.screenshot_data_url ? <img src={archive.screenshot_data_url} alt="Archived page preview" className="w-full rounded-xl surface" /> : <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No screenshot captured.</p>
                      )}
                      {tab === 'pdf' && (
                        archive.pdf_data_url ? (
                          <div className="space-y-3">
                            <a href={archive.pdf_data_url} download={`${link.title || 'archive'}.pdf`} className="inline-flex items-center gap-2 bg-accent-600 text-white px-3 py-2 rounded-xl text-xs font-medium">
                              <FilePdf size={14} /> Download PDF copy
                            </a>
                            <iframe title="PDF archive" src={archive.pdf_data_url} className="w-full min-h-[440px] rounded-xl surface" />
                          </div>
                        ) : <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No PDF captured.</p>
                      )}
                    </>
                  ) : (
                    <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Select an archive or create one.</div>
                  )}
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
