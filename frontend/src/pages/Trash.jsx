import { useEffect, useMemo, useState } from 'react'
import { Archive, ArrowCounterClockwise, CheckSquare, Trash as TrashIcon, X } from '@phosphor-icons/react'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'
import { openConfirm } from '../components/ConfirmModal'

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function formatDate(value) {
  if (!value) return ''
  try { return new Date(value).toLocaleString() } catch { return '' }
}

export default function Trash() {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState([])
  const toast = useToast()

  const selectedCount = selectedIds.length
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const load = async () => {
    setLoading(true)
    try {
      setLinks(await api.listTrash())
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggle = (id) => {
    setSelectedIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
  }

  const restore = async (link) => {
    try {
      await api.restoreLink(link.id)
      setLinks((items) => items.filter((item) => item.id !== link.id))
      setSelectedIds((items) => items.filter((id) => id !== link.id))
      toast.success('Link restored')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const destroy = async (link) => {
    const ok = await openConfirm({ title: `Delete "${link.title}" forever?`, message: 'This cannot be undone.', danger: true, confirmText: 'Delete forever' })
    if (!ok) return
    try {
      await api.destroyLink(link.id)
      setLinks((items) => items.filter((item) => item.id !== link.id))
      setSelectedIds((items) => items.filter((id) => id !== link.id))
      toast.success('Link permanently deleted')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const bulkRestore = async () => {
    if (!selectedCount) return
    const ids = [...selectedIds]
    try {
      await api.bulkAction(ids, 'restore')
      setLinks((items) => items.filter((item) => !ids.includes(item.id)))
      setSelectedIds([])
      toast.success(`${selectedCount} restored`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const bulkDestroy = async () => {
    if (!selectedCount) return
    const ids = [...selectedIds]
    const ok = await openConfirm({ title: `Delete ${selectedCount} links forever?`, danger: true, confirmText: 'Delete forever' })
    if (!ok) return
    try {
      await api.bulkAction(ids, 'destroy')
      setLinks((items) => items.filter((item) => !ids.includes(item.id)))
      setSelectedIds([])
      toast.success(`${selectedCount} permanently deleted`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass px-4 sm:px-8 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Archive size={18} weight="fill" className="text-accent-400" />
              Trash
            </h1>
            <p className="metadata-line text-[11px]">{links.length} deleted links</p>
          </div>
          <button type="button" onClick={load} className="dashboard-filter-chip">Refresh</button>
        </div>
      </header>

      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8">
        {selectedCount > 0 && (
          <div className="atlas-panel rounded-2xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{selectedCount} selected</span>
            <button type="button" onClick={bulkRestore} className="inspector-action px-3 py-2" aria-label="Restore selected links"><ArrowCounterClockwise size={14} /> Restore</button>
            <button type="button" onClick={bulkDestroy} className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1"><TrashIcon size={14} /> Delete forever</button>
            <button type="button" onClick={() => setSelectedIds([])} className="ml-auto icon-button"><X size={14} /></button>
          </div>
        )}

        {loading ? (
          <div className="metadata-line text-sm">Loading trash...</div>
        ) : links.length === 0 ? (
          <div className="atlas-panel rounded-2xl p-8 text-center">
            <Archive size={36} className="mx-auto text-accent-400/70" />
            <h2 className="mt-3 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Trash is empty</h2>
            <p className="metadata-line mt-1 text-sm">Deleted links will appear here before permanent removal.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {links.map((link) => {
              const selected = selectedSet.has(link.id)
              return (
                <article key={link.id} className={`atlas-panel rounded-2xl p-4 flex items-center gap-3 ${selected ? 'ring-2 ring-accent-500/60' : ''}`}>
                  <button type="button" onClick={() => toggle(link.id)} className="h-6 w-6 rounded-lg border flex items-center justify-center" style={{ borderColor: selected ? 'var(--accent-primary)' : 'var(--border-subtle)', background: selected ? 'var(--accent-primary)' : 'transparent' }} aria-label={selected ? 'Unselect link' : 'Select link'}>
                    {selected && <CheckSquare size={14} weight="fill" className="text-white" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{link.title}</h2>
                    <p className="metadata-line text-[11px] truncate">{getDomain(link.url)} · deleted {formatDate(link.deleted_at)}</p>
                  </div>
                  <button type="button" onClick={() => restore(link)} className="inspector-action px-3 py-2" aria-label={`Restore ${link.title}`}><ArrowCounterClockwise size={14} /> Restore</button>
                  <button type="button" onClick={() => destroy(link)} className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1"><TrashIcon size={14} /> Delete</button>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
