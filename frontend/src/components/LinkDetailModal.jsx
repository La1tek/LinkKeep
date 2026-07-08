import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, ArrowUpRight, BookmarkSimple, CheckCircle, Clock, FileArrowUp, Paperclip, X } from '@phosphor-icons/react'
import { api } from '../lib/api'

function formatDate(value) {
  if (!value) return 'Never'
  try { return new Date(value).toLocaleString() } catch { return 'Unknown' }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url || '' }
}

function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename || 'attachment'
  a.click()
}

export default function LinkDetailModal({ link, open, onClose, onUpdated, toast }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [highlightText, setHighlightText] = useState('')
  const fileRef = useRef(null)

  const activeLink = detail?.link || link

  useEffect(() => {
    if (!open || !link?.id) return
    let cancelled = false
    setLoading(true)
    api.getLinkDetail(link.id)
      .then((data) => { if (!cancelled) setDetail(data) })
      .catch((err) => toast?.error?.(err.message))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, link?.id, toast])

  useEffect(() => {
    if (!open) {
      setDetail(null)
      setHighlightText('')
    }
  }, [open])

  const refresh = async () => {
    if (!link?.id) return
    const data = await api.getLinkDetail(link.id)
    setDetail(data)
    onUpdated?.(data.link)
  }

  const updateField = async (field, value) => {
    if (!activeLink?.id) return
    setSaving(true)
    try {
      const updated = await api.updateLink(activeLink.id, { [field]: value })
      setDetail((current) => current ? { ...current, link: updated } : current)
      onUpdated?.(updated)
      toast?.success?.('Link updated')
    } catch (err) {
      toast?.error?.(err.message)
    } finally {
      setSaving(false)
    }
  }

  const addHighlight = async () => {
    const text = highlightText.trim()
    if (!text || !activeLink?.id) return
    try {
      await api.createHighlight(activeLink.id, { text })
      setHighlightText('')
      await refresh()
      toast?.success?.('Highlight saved')
    } catch (err) {
      toast?.error?.(err.message)
    }
  }

  const uploadAttachment = async (file) => {
    if (!file || !activeLink?.id) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await api.createAttachment(activeLink.id, {
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          data_url: reader.result,
        })
        await refresh()
        toast?.success?.('Attachment added')
      } catch (err) {
        toast?.error?.(err.message)
      }
    }
    reader.readAsDataURL(file)
  }

  const downloadAttachment = async (attachment) => {
    try {
      const payload = await api.getAttachment(activeLink.id, attachment.id)
      downloadDataUrl(payload.filename, payload.data_url)
    } catch (err) {
      toast?.error?.(err.message)
    }
  }

  return (
    <AnimatePresence>
      {open && activeLink && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            className="glass rounded-2xl w-full max-w-4xl max-h-[86vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between gap-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="min-w-0">
                <div className="metadata-line text-[10px] uppercase">Link detail</div>
                <h2 className="text-base font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{activeLink.title}</h2>
                <a href={activeLink.url} target="_blank" rel="noreferrer" className="text-xs truncate inline-flex items-center gap-1 max-w-full" style={{ color: 'var(--accent-mint)' }}>
                  {getDomain(activeLink.url)} <ArrowUpRight size={11} weight="bold" />
                </a>
              </div>
              <button type="button" onClick={onClose} className="icon-button" aria-label="Close link detail">
                <X size={17} />
              </button>
            </div>

            <div className="overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] gap-4">
              <section className="space-y-4">
                <div className="atlas-panel rounded-2xl p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="space-y-1.5">
                      <span className="metadata-line text-[10px] uppercase">Read state</span>
                      <select value={activeLink.is_read ? 'read' : 'unread'} onChange={(e) => updateField('is_read', e.target.value === 'read')} disabled={saving} className="input-base w-full rounded-xl px-3 py-2 text-sm outline-none">
                        <option value="unread">Unread</option>
                        <option value="read">Read</option>
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="metadata-line text-[10px] uppercase">Priority</span>
                      <select value={activeLink.priority || 'normal'} onChange={(e) => updateField('priority', e.target.value)} disabled={saving} className="input-base w-full rounded-xl px-3 py-2 text-sm outline-none">
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="metadata-line text-[10px] uppercase">Reminder</span>
                      <input type="datetime-local" value={activeLink.reminder_at ? activeLink.reminder_at.slice(0, 16) : ''} onChange={(e) => updateField('reminder_at', e.target.value || null)} disabled={saving} className="input-base w-full rounded-xl px-3 py-2 text-sm outline-none" />
                    </label>
                  </div>
                  <label className="mt-4 block space-y-1.5">
                    <span className="metadata-line text-[10px] uppercase">Note</span>
                    <textarea
                      defaultValue={activeLink.note || ''}
                      onBlur={(e) => { if (e.target.value !== (activeLink.note || '')) updateField('note', e.target.value) }}
                      rows={4}
                      className="input-base w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                      placeholder="Add context, why this link matters, or what to read first..."
                    />
                  </label>
                </div>

                <div className="atlas-panel rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Highlights</h3>
                    <BookmarkSimple size={16} style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <div className="flex gap-2">
                    <input value={highlightText} onChange={(e) => setHighlightText(e.target.value)} placeholder="Save selected text or a quote..." className="input-base flex-1 rounded-xl px-3 py-2 text-sm outline-none" />
                    <button type="button" onClick={addHighlight} disabled={!highlightText.trim()} className="primary-action-button disabled:opacity-40">Add</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {(detail?.highlights || []).map((item) => (
                      <div key={item.id} className="rounded-xl p-3 surface text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {item.text}
                        <div className="metadata-line mt-1 text-[10px]">{formatDate(item.created_at)}</div>
                      </div>
                    ))}
                    {!loading && !(detail?.highlights || []).length && <p className="metadata-line text-xs">No highlights yet</p>}
                  </div>
                </div>

                <div className="atlas-panel rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Attachments</h3>
                    <button type="button" onClick={() => fileRef.current?.click()} className="inspector-action px-3 py-2">
                      <FileArrowUp size={15} /> Add file
                    </button>
                    <input ref={fileRef} type="file" className="hidden" onChange={(e) => uploadAttachment(e.target.files?.[0])} />
                  </div>
                  <div className="space-y-2">
                    {(detail?.attachments || []).map((item) => (
                      <button key={item.id} type="button" onClick={() => downloadAttachment(item)} className="palette-row w-full">
                        <Paperclip size={15} />
                        <span className="truncate">{item.filename}</span>
                        <span className="kbd-token ml-auto">{Math.ceil((item.size || 0) / 1024)} KB</span>
                      </button>
                    ))}
                    {!loading && !(detail?.attachments || []).length && <p className="metadata-line text-xs">No attachments</p>}
                  </div>
                </div>
              </section>

              <aside className="space-y-4">
                <div className="atlas-panel rounded-2xl p-4">
                  <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Archive timeline</h3>
                  <div className="archive-timeline">
                    <div className="timeline-item is-done"><CheckCircle size={14} weight="fill" /><div><strong>Saved</strong><span>{formatDate(activeLink.created_at)}</span></div></div>
                    {(detail?.archives || []).slice(0, 4).map((archive) => (
                      <div key={archive.id} className={`timeline-item ${archive.status === 'succeeded' ? 'is-done' : 'is-pending'}`}>
                        <Archive size={14} weight="fill" />
                        <div><strong>{archive.status}</strong><span>{formatDate(archive.created_at)}</span></div>
                      </div>
                    ))}
                    {!(detail?.archives || []).length && <div className="timeline-item is-pending"><Archive size={14} /><div><strong>No archive</strong><span>Run archive from link menu</span></div></div>}
                  </div>
                </div>

                <div className="atlas-panel rounded-2xl p-4">
                  <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>History</h3>
                  <div className="space-y-2">
                    {(detail?.history || []).slice(0, 12).map((item) => (
                      <div key={item.id} className="flex items-start gap-2">
                        <Clock size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                        <div className="min-w-0">
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.action.replaceAll('_', ' ')}</p>
                          <p className="metadata-line text-[10px]">{formatDate(item.created_at)}</p>
                        </div>
                      </div>
                    ))}
                    {!loading && !(detail?.history || []).length && <p className="metadata-line text-xs">No history yet</p>}
                  </div>
                </div>
              </aside>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
