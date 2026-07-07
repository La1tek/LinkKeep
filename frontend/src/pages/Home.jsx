import { useState, useMemo, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Star, Stack, Clipboard, Sparkle, FolderSimple } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { useTabStore } from '../hooks/useTabStore'
import { useLinks } from '../hooks/useLinks'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import FolderCard from '../components/FolderCard'
import TabEditModal from '../components/TabEditModal'
import FolderLockModal from '../components/FolderLockModal'
import SearchBar from '../components/SearchBar'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { openConfirm } from '../components/ConfirmModal'

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444']
const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } }
}

function getDomain(url) {
  try { return new URL(url).hostname.replace('www.', '') } catch { return '' }
}

function getFaviconUrl(url) {
  if (!url) return null
  try { return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getDomain(url))}&sz=32` }
  catch { return null }
}

function ConstellationMap({ folders, allCount, favCount }) {
  const positions = [
    { x: 14, y: 62 }, { x: 30, y: 32 }, { x: 48, y: 54 },
    { x: 64, y: 24 }, { x: 78, y: 58 }, { x: 88, y: 34 },
  ]
  const nodes = (folders.length ? folders : [{ name: 'Inbox', color: '#7c8cff', total_link_count: allCount }])
    .slice(0, 6)
    .map((folder, index) => ({
      ...folder,
      ...(positions[index] || positions[0]),
      count: folder.total_link_count ?? folder.link_count ?? 0,
      color: folder.color || '#7c8cff',
    }))

  return (
    <section className="constellation-card atlas-panel rounded-[1.35rem] p-4 sm:p-5 mb-5 min-h-[210px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="metadata-line text-[10px] uppercase mb-2">quiet observatory</div>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Your link sky</h2>
          <p className="text-xs sm:text-sm mt-1 max-w-md" style={{ color: 'var(--text-tertiary)' }}>
            {allCount} saved links mapped across {folders.length} folders.
          </p>
        </div>
        <div className="hidden sm:flex gap-2">
          <div className="rounded-2xl px-3 py-2" style={{ background: 'rgba(124,140,255,0.12)', border: '1px solid rgba(124,140,255,0.2)' }}>
            <div className="metadata-line text-[9px] uppercase">links</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{allCount}</div>
          </div>
          <div className="rounded-2xl px-3 py-2" style={{ background: 'rgba(244,184,102,0.12)', border: '1px solid rgba(244,184,102,0.2)' }}>
            <div className="metadata-line text-[9px] uppercase">stars</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--accent-amber)' }}>{favCount}</div>
          </div>
        </div>
      </div>

      <div className="relative mt-5 h-28 sm:h-32">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {nodes.slice(1).map((node, index) => {
            const prev = nodes[index]
            return (
              <line
                key={`${prev.id || prev.name}-${node.id || node.name}`}
                x1={prev.x}
                y1={prev.y}
                x2={node.x}
                y2={node.y}
                stroke="rgba(124,140,255,0.28)"
                strokeWidth="0.45"
                strokeDasharray="3 4"
              />
            )
          })}
        </svg>
        {nodes.map((node, index) => (
          <button
            key={node.id || node.name}
            type="button"
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-110 focus-ring"
            style={{ left: `${node.x}%`, top: `${node.y}%` }}
            title={node.name}
          >
            <span className="star-node block rounded-full" style={{ width: 9 + Math.min(node.count, 24) / 4, height: 9 + Math.min(node.count, 24) / 4, background: node.color }} />
            {index < 4 && (
              <span className="absolute left-4 top-2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px]" style={{ color: 'var(--text-secondary)', background: 'var(--bg-glass)', border: '1px solid var(--border-subtle)' }}>
                {node.name}
              </span>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

export default function Home({ token }) {
  const { tabs, create: createTab, update: updateTab, remove: deleteTab, refresh: refreshTabs } = useTabStore()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [newTabOpen, setNewTabOpen] = useState(false)
  const [newTabName, setNewTabName] = useState('')
  const [newTabColor, setNewTabColor] = useState('#6366f1')
  const [newTabParent, setNewTabParent] = useState(null)
  const [editTabModal, setEditTabModal] = useState(null)
  const [favCount, setFavCount] = useState(0)
  const [allCount, setAllCount] = useState(0)
  const toast = useToast()
  const [pasting, setPasting] = useState(false)
  const [homeSort, setHomeSort] = useState('newest')
  const [folderLockModal, setFolderLockModal] = useState(null)
  const shareTargetHandled = useRef(false)
  const navigate = useNavigate()

  const handlePasteSave = async () => {
    let url = ''
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        url = await navigator.clipboard.readText()
      }
    } catch {}
    // Fallback: prompt if clipboard unavailable (HTTP without HTTPS)
    if (!url || !url.trim().startsWith('http')) {
      url = prompt('Paste URL here:')?.trim() || ''
    }
    url = url.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast.error('Invalid URL')
      return
    }
    setPasting(true)
    toast.success('Saving...')
    try {
      let meta = {}
      try { meta = await api.fetchMetadata(url) } catch {}
      await createLink({
        title: meta.title || url,
        url,
        description: meta.description || null,
        favicon: meta.favicon || null,
        image: meta.image || null,
      })
      toast.success('Link saved')
      refreshLinks()
    } catch (err) {
      toast.error(err.message)
    }
    setPasting(false)
  }

  // Get all links (for counts and favicons)
  const { links: allLinks, create: createLink, refresh: refreshLinks } = useLinks(token, {})
  const safeLinks = allLinks || []

  useEffect(() => {
    if (shareTargetHandled.current) return
    const params = new URLSearchParams(window.location.search)
    const sharedText = params.get('text') || ''
    const sharedUrl = params.get('url') || sharedText.match(/https?:\/\/\S+/i)?.[0]
    if (!sharedUrl || !/^https?:\/\//i.test(sharedUrl.trim())) return
    shareTargetHandled.current = true
    const title = params.get('title') || sharedUrl
    createLink({ title, url: sharedUrl.trim(), description: sharedText && sharedText !== sharedUrl ? sharedText : null })
      .then(() => {
        toast.success('Shared link saved')
        refreshLinks()
        window.history.replaceState({}, '', window.location.pathname)
      })
      .catch((err) => toast.error(err.message))
  }, [createLink, refreshLinks, toast])

  const safeTabs = tabs || []

  // Calculate counts
  useEffect(() => {
    setFavCount(safeLinks.filter(l => l.is_favorite).length)
    setAllCount(safeLinks.length)
  }, [safeLinks])

  // Build a map of tab_id -> links for preview favicons
  const linksByTab = useMemo(() => {
    const map = {}
    safeLinks.forEach(l => {
      if (l.tab_id) {
        if (!map[l.tab_id]) map[l.tab_id] = []
        map[l.tab_id].push(l)
      }
    })
    return map
  }, [safeLinks])

  // Only show root-level tabs (no parent)
  const rootTabs = useMemo(() => safeTabs.filter(t => !t.parent_id), [safeTabs])

  // Filter tabs by search
  const filteredTabs = useMemo(() => {
    let list = search ? rootTabs.filter(t => t.name.toLowerCase().includes(search.toLowerCase())) : rootTabs
    switch (homeSort) {
      case 'oldest': list = [...list].sort((a, b) => a.id - b.id); break
      case 'az': list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break
      case 'za': list = [...list].sort((a, b) => b.name.localeCompare(a.name)); break
      case 'links': list = [...list].sort((a, b) => (b.total_link_count || 0) - (a.total_link_count || 0)); break
      default: list = [...list].sort((a, b) => b.id - a.id); break
    }
    return list
  }, [rootTabs, search, homeSort])

  const handleCreateTab = () => {
    if (!newTabName.trim()) return
    createTab({ name: newTabName.trim(), color: newTabColor, parent_id: newTabParent })
    setNewTabName(''); setNewTabColor('#6366f1'); setNewTabParent(null); setNewTabOpen(false)
    toast.success('Folder created')
  }

  const handleDeleteTab = async (tab) => {
    if (tab.link_count > 0) {
      const result = await openConfirm({
        title: `Delete "${tab.name}"?`,
        message: `This folder has ${tab.link_count} ${tab.link_count === 1 ? 'link' : 'links'}.`,
        threeWay: true,
      })
      if (!result) return
      const keepLinks = result === 'keep_links'
      await api.deleteTab(tab.id, keepLinks)
      refreshTabs()
      toast.success(keepLinks ? 'Folder deleted, links kept' : 'Folder and links deleted')
    } else {
      const ok = await openConfirm({ title: `Delete "${tab.name}"?`, danger: true })
      if (!ok) return
      await api.deleteTab(tab.id, false)
      refreshTabs()
      toast.success('Folder deleted')
    }
  }

  const handleEditTabSave = async (data) => {
    await updateTab(editTabModal.id, data)
    setEditTabModal(null)
    toast.success('Folder updated')
  }

  const handleEditTabDelete = async () => {
    setEditTabModal(null)
    refreshTabs()
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 px-4 sm:px-8 py-3" style={{ background: 'var(--bg-glass)', borderBottom: '1px solid var(--border-subtle)', backdropFilter: 'blur(22px)' }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="metadata-line text-[9px] uppercase mb-0.5">personal archive</div>
            <h1 className="text-base font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              My Library
            </h1>
            <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              {allCount} {allCount === 1 ? 'link' : 'links'} across {safeTabs.length} {safeTabs.length === 1 ? 'folder' : 'folders'}
            </p>
          </div>
          <button
            onClick={() => setNewTabOpen(true)}
            className="h-10 w-10 text-white rounded-2xl active:scale-95 transition-all flex items-center justify-center hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-mint))', boxShadow: '0 14px 32px rgba(124,140,255,0.24)' }}
          >
            <Plus size={18} weight="bold" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1">
            <SearchBar value={search} onChange={setSearch} placeholder="Search folders..." />
          </div>
          <select value={homeSort} onChange={(e) => setHomeSort(e.target.value)} className="glass text-xs rounded-xl px-2 py-2.5 border-none outline-none cursor-pointer shrink-0" style={{ color: 'var(--text-secondary)' }}>
            <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="az">A-Z</option><option value="za">Z-A</option><option value="links">By links ↕</option>
          </select>
          <button onClick={handlePasteSave} disabled={pasting} className="h-10 w-10 glass rounded-2xl active:scale-95 transition-all flex items-center justify-center surface-hover disabled:opacity-40 shrink-0" style={{ color: 'var(--text-muted)' }} title="Paste URL from clipboard">
            <Clipboard size={18} />
          </button>
        </div>
      </header>

      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8">
        <ConstellationMap folders={filteredTabs} allCount={allCount} favCount={favCount} />

        {/* Quick access: All Links + Favorites */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {/* All Links card */}
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => navigate('/folder/all')}
            className="archive-slip text-left rounded-2xl p-4 transition-all hover:-translate-y-0.5 active:scale-[0.98] relative overflow-hidden"
          >
            <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)' }} />
            <div className="flex items-center gap-2.5 mb-2">
              <div className="h-9 w-9 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(124,140,255,0.15)', border: '1px solid rgba(124,140,255,0.25)' }}>
                <Stack size={16} weight="fill" className="text-accent-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>All Links</h3>
                <p className="metadata-line text-[11px]">{allCount} links</p>
              </div>
            </div>
          </motion.button>

          {/* Favorites card */}
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            onClick={() => navigate('/favorites')}
            className="archive-slip text-left rounded-2xl p-4 transition-all hover:-translate-y-0.5 active:scale-[0.98] relative overflow-hidden"
          >
            <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, var(--accent-amber), transparent)' }} />
            <div className="flex items-center gap-2.5 mb-2">
              <div className="h-9 w-9 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(244,184,102,0.15)', border: '1px solid rgba(244,184,102,0.25)' }}>
                <Star size={16} weight="fill" className="text-amber-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>Favorites</h3>
                <p className="metadata-line text-[11px]">{favCount} starred</p>
              </div>
            </div>
          </motion.button>
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            onClick={() => setNewTabOpen(true)}
            className="archive-slip hidden sm:flex text-left rounded-2xl p-4 transition-all hover:-translate-y-0.5 active:scale-[0.98] relative overflow-hidden items-center gap-2.5"
          >
            <div className="h-9 w-9 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(45,212,191,0.14)', border: '1px solid rgba(45,212,191,0.24)', color: 'var(--accent-mint)' }}>
              <FolderSimple size={16} weight="fill" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>New sector</h3>
              <p className="metadata-line text-[11px]">create folder</p>
            </div>
          </motion.button>
        </div>

        {/* Folder section label */}
        {filteredTabs.length > 0 && (
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Folders
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{filteredTabs.length}</span>
          </div>
        )}

        {/* Folder cards grid */}
        {filteredTabs.length > 0 ? (
          <motion.div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            {filteredTabs.map((tab, i) => (
              <FolderCard
                key={tab.id}
                tab={tab}
                links={linksByTab[tab.id] || []}
                index={i}
                onEdit={(t) => setEditTabModal(t)}
                onDelete={handleDeleteTab}
                onUnlock={(t) => setFolderLockModal({ tab: t, mode: 'unlock' })}
                onProtect={(t, mode) => setFolderLockModal({ tab: t, mode })}
              />
            ))}
          </motion.div>
        ) : rootTabs.length > 0 && search ? (
          <EmptyState
            title="No matching folders"
            subtitle="Try a different search term"
            illustration="no-results"
          />
        ) : (
          <EmptyState
            title="No folders yet"
            subtitle="Create your first folder to organize your links"
            actionLabel="Create Folder"
            onAction={() => setNewTabOpen(true)}
            illustration="no-links"
          />
        )}
      </main>

      {/* New folder modal */}
      {newTabOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => { setNewTabParent(null); setNewTabOpen(false) }}>
          <div className="glass rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>New Folder</h3>
            <input autoFocus value={newTabName} onChange={(e) => setNewTabName(e.target.value)} placeholder="Folder name..." className="input-base w-full rounded-xl px-4 py-2.5 text-sm outline-none mb-3" onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTab() }} />
            {newTabName.trim() && (
              <div className="flex items-center gap-2 mb-4">
                <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Color:</label>
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setNewTabColor(c)} className={`h-5 w-5 rounded-full transition-transform ${newTabColor === c ? 'scale-125 ring-2 ring-white/20' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            )}
            {safeTabs.length > 0 && (
              <div className="mb-4">
                <label className="text-[10px] block mb-1.5" style={{ color: 'var(--text-muted)' }}>Inside folder:</label>
                <select
                  value={newTabParent || ''}
                  onChange={(e) => setNewTabParent(e.target.value ? Number(e.target.value) : null)}
                  className="input-base w-full rounded-xl px-4 py-2.5 text-sm outline-none cursor-pointer"
                >
                  <option value="">None (root)</option>
                  {safeTabs.map(t => (
                    <option key={t.id} value={t.id}>{'  '.repeat((t.parent_id ? 1 : 0))}{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleCreateTab} disabled={!newTabName.trim()} className="flex-1 bg-accent-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Create</button>
              <button onClick={() => setNewTabOpen(false)} className="glass px-4 py-2.5 rounded-xl text-sm surface-hover" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <TabEditModal tab={editTabModal} onClose={() => setEditTabModal(null)} onSave={handleEditTabSave} onDelete={handleEditTabDelete} allTabs={safeTabs} />
      <FolderLockModal
        open={!!folderLockModal}
        tab={folderLockModal?.tab}
        mode={folderLockModal?.mode || 'unlock'}
        onClose={() => setFolderLockModal(null)}
        onSuccess={() => { refreshTabs(); refreshLinks() }}
      />
    </div>
  )
}
