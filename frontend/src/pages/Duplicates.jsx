import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, Trash, ArrowUUpLeft, Warning, SidebarSimple, ArrowElbowDownLeft } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useLinks } from '../hooks/useLinks'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { openConfirm } from '../components/ConfirmModal'
import AnimatedCounter from '../components/AnimatedCounter'

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
}
const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } }
}

export default function Duplicates({ token }) {
  const [duplicates, setDuplicates] = useState([])
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(null) // { url, keepId }
  const toast = useToast()
  const navigate = useNavigate()
  const { refresh: refreshLinks } = useLinks(token, {})

  const fetchDuplicates = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.findDuplicates()
      setDuplicates(data.duplicates || [])
    } catch (err) {
      toast.error(err.message)
    }
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchDuplicates() }, [fetchDuplicates])

  const handleMerge = async (dup, keepId) => {
    const removeId = dup.links.find(l => l.id !== keepId)?.id
    if (!removeId) return

    const keep = dup.links.find(l => l.id === keepId)
    const ok = await openConfirm({
      title: 'Merge duplicates?',
      message: `Keep "${keep?.title}" (ID ${keepId}) and delete the duplicate?`,
    })
    if (!ok) return

    setMerging({ url: dup.url })
    try {
      // Delete the duplicate link
      await api.deleteLink(removeId)
      toast.success('Merged — duplicate removed')
      await refreshLinks()
      await fetchDuplicates()
    } catch (err) {
      toast.error(err.message)
    }
    setMerging(null)
  }

  const handleDelete = async (dup, removeId) => {
    const ok = await openConfirm({
      title: 'Delete duplicate?',
      message: 'This will permanently remove this link.',
      danger: true,
    })
    if (!ok) return

    try {
      await api.deleteLink(removeId)
      toast.success('Deleted')
      await refreshLinks()
      await fetchDuplicates()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass px-4 sm:px-8 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 -ml-2 rounded-lg transition-colors hover:bg-accent-500/10" style={{ color: 'var(--text-tertiary)' }}>
              <ArrowUUpLeft size={18} />
            </button>
            <div>
              <h1 className="text-base font-semibold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <SidebarSimple size={16} />
                Duplicates
              </h1>
              <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                {loading ? 'Scanning...' : (
                  duplicates.length === 0
                    ? 'No duplicates found'
                    : <><AnimatedCounter value={duplicates.length} /> duplicate {duplicates.length === 1 ? 'group' : 'groups'} found</>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={fetchDuplicates}
            disabled={loading}
            className="h-8 px-3 bg-accent-600 text-white rounded-xl text-xs font-medium hover:bg-accent-500 disabled:opacity-40 transition-all flex items-center gap-1.5"
          >
            <Copy size={13} /> Scan
          </button>
        </div>
      </header>

      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass rounded-2xl p-4 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>
                <div className="h-4 w-48 rounded-lg mb-3" style={{ background: 'var(--bg-tertiary)' }} />
                <div className="h-3 w-72 rounded-lg mb-2" style={{ background: 'var(--bg-tertiary)' }} />
                <div className="h-3 w-32 rounded-lg" style={{ background: 'var(--bg-tertiary)' }} />
              </div>
            ))}
          </div>
        ) : duplicates.length === 0 ? (
          <EmptyState
            title="No duplicates"
            subtitle="Your library is clean — no duplicate URLs found"
            illustration="no-results"
          />
        ) : (
          <motion.div
            className="space-y-4"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            {duplicates.map((dup, i) => (
              <motion.div key={dup.url} variants={staggerItem}>
                <div className="glass rounded-2xl overflow-hidden">
                  {/* URL header */}
                  <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: 'rgba(99,102,241,0.06)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <Warning size={13} weight="fill" className="text-amber-400 shrink-0" />
                    <span className="text-xs truncate flex-1" style={{ color: 'var(--text-tertiary)' }}>{dup.url}</span>
                  </div>

                  {/* Duplicate links */}
                  <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                    {dup.links.map((link, j) => {
                      const isMerging = merging?.url === dup.url
                      return (
                        <div key={link.id} className={`px-4 py-3 flex items-center gap-3 ${isMerging ? 'opacity-60' : ''}`}>
                          <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--bg-tertiary)' }}>
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(dup.url)}&sz=32`}
                              alt=""
                              className="h-4 w-4 rounded"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{link.title}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>ID: {link.id}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Merge into this one (keep) */}
                            <button
                              onClick={() => handleMerge(dup, link.id)}
                              disabled={isMerging}
                              className="p-2 rounded-lg transition-colors hover:bg-accent-500/10"
                              style={{ color: '#818cf8' }}
                              title="Keep this, delete other"
                            >
                              <ArrowElbowDownLeft size={15} />
                            </button>
                            {/* Delete this one */}
                            <button
                              onClick={() => handleDelete(dup, link.id)}
                              disabled={isMerging}
                              className="p-2 rounded-lg transition-colors hover:bg-red-500/10"
                              style={{ color: '#ef4444' }}
                              title="Delete this link"
                            >
                              <Trash size={15} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>
    </div>
  )
}
