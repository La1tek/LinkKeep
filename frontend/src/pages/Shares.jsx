import { useEffect, useState } from 'react'
import { Link as LinkIcon, Trash, Plus } from '@phosphor-icons/react'
import { api } from '../lib/api'
import { useTabStore } from '../hooks/useTabStore'
import { useToast } from '../components/Toast'

export default function Shares() {
  const { tabs } = useTabStore()
  const toast = useToast()
  const [shares, setShares] = useState([])
  const [title, setTitle] = useState('My LinkKeep Collection')
  const [tabId, setTabId] = useState('')

  const refresh = () => api.listShares().then((data) => setShares(data.shares || [])).catch((err) => toast.error(err.message))
  useEffect(() => { refresh() }, [])

  const create = async () => {
    try {
      await api.createShare({ title, tab_id: tabId ? Number(tabId) : null })
      setTitle('My LinkKeep Collection'); setTabId(''); refresh(); toast.success('Share created')
    } catch (err) { toast.error(err.message) }
  }

  const remove = async (share) => {
    try { await api.deleteShare(share.id); setShares((items) => items.filter((item) => item.id !== share.id)); toast.success('Share removed') }
    catch (err) { toast.error(err.message) }
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass px-4 sm:px-8 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <h1 className="text-base font-semibold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><LinkIcon size={17} />Shared Collections</h1>
      </header>
      <main className="px-4 sm:px-8 py-6 max-w-3xl space-y-4 pb-24 sm:pb-8">
        <div className="glass rounded-xl p-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-base rounded-lg px-3 py-2 text-sm outline-none" aria-label="Share title" />
          <select value={tabId} onChange={(e) => setTabId(e.target.value)} className="input-base rounded-lg px-3 py-2 text-sm outline-none" aria-label="Shared folder">
            <option value="">All links</option>
            {(tabs || []).map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}
          </select>
          <button onClick={create} className="bg-accent-600 text-white rounded-lg px-3 py-2 text-sm flex items-center justify-center gap-2"><Plus size={15} />Create</button>
        </div>
        <div className="glass rounded-xl divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {shares.map((share) => {
            const url = `${window.location.origin}/share/${share.token}`
            return (
              <div key={share.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{share.title}</p>
                  <a href={url} target="_blank" rel="noreferrer" className="text-xs truncate block text-accent-400">{url}</a>
                </div>
                <button onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Copied'))} className="text-xs text-accent-400 px-2 py-1 rounded-lg hover:bg-accent-500/10">Copy</button>
                <button onClick={() => remove(share)} className="p-2 rounded-lg hover:bg-red-500/10 text-red-400" aria-label="Delete share"><Trash size={15} /></button>
              </div>
            )
          })}
          {shares.length === 0 && <div className="p-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>No shared collections yet.</div>}
        </div>
      </main>
    </div>
  )
}
