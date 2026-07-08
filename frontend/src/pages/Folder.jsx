import { useState, useMemo, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ArrowLeft, PushPin, CheckSquare, X, Trash, MagnifyingGlass, ListBullets, SquaresFour, FolderPlus, CaretRight, BookOpen, ArrowUpRight, Clipboard, LockKey, ArrowSquareIn } from '@phosphor-icons/react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTabStore } from '../hooks/useTabStore'
import { useLinks } from '../hooks/useLinks'
import { useViewMode } from '../hooks/useViewMode'
import { api } from '../lib/api'
import LinkCard from '../components/LinkCard'
import LinkGridCard from '../components/LinkGridCard'
import LinkModal from '../components/LinkModal'
import SearchBar from '../components/SearchBar'
import EmptyState from '../components/EmptyState'
import { LinkSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'
import { openConfirm } from '../components/ConfirmModal'
import AnimatedCounter from '../components/AnimatedCounter'
import ArchiveModal from '../components/ArchiveModal'
import FolderLockModal from '../components/FolderLockModal'
import LinkDetailModal from '../components/LinkDetailModal'

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
}

const staggerItem = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }
}

const LINKKEEP_LINKS_MIME = 'application/x-linkkeep-links'

function readFolderPreference(folderId, key, fallback) {
  try { return localStorage.getItem(`lk_folder_pref:${folderId}:${key}`) || fallback } catch { return fallback }
}

function createDragPreview({ count, title }) {
  const node = document.createElement('div')
  node.style.position = 'fixed'
  node.style.top = '-120px'
  node.style.left = '-120px'
  node.style.zIndex = '9999'
  node.style.pointerEvents = 'none'
  node.style.padding = '10px 12px'
  node.style.borderRadius = '14px'
  node.style.background = 'rgba(24, 24, 27, 0.92)'
  node.style.color = 'white'
  node.style.boxShadow = '0 18px 40px rgba(0,0,0,0.24)'
  node.style.border = '1px solid rgba(255,255,255,0.14)'
  node.style.font = '600 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
  node.textContent = count > 1 ? `${count} links` : title || 'Move link'
  document.body.appendChild(node)
  return node
}

function parseDraggedLinks(event) {
  const raw = event.dataTransfer.getData(LINKKEEP_LINKS_MIME)
  if (raw) {
    try {
      const payload = JSON.parse(raw)
      const linkIds = Array.isArray(payload.linkIds) ? payload.linkIds.map(Number).filter(Boolean) : []
      return linkIds.length ? { ...payload, linkIds } : null
    } catch {}
  }
  const fallback = Number(event.dataTransfer.getData('text/plain'))
  return fallback ? { linkIds: [fallback] } : null
}

function hasDraggedLinks(event) {
  return Array.from(event.dataTransfer?.types || []).includes(LINKKEEP_LINKS_MIME)
}

function throttle(fn, ms) {
  let last = 0
  let rafId = null
  return (...args) => {
    const now = performance.now()
    if (now - last >= ms) { last = now; fn(...args) }
    else if (!rafId) { rafId = requestAnimationFrame(() => { last = now; rafId = null; fn(...args) }) }
  }
}

export default function Folder({ token }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { tabs, create: createTab, refresh: refreshTabs } = useTabStore()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState(() => readFolderPreference(id, 'sort', 'newest'))
  const [activeTag, setActiveTag] = useState(() => readFolderPreference(id, 'tag', '') || null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [pullDistance, setPullDistance] = useState(0)
  const [pulling, setPulling] = useState(false)
  const [headerScrolled, setHeaderScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [newSubOpen, setNewSubOpen] = useState(false)
  const [newSubName, setNewSubName] = useState('')
  const [newSubColor, setNewSubColor] = useState('#6366f1')
  const [readerLink, setReaderLink] = useState(null)
  const [readerContent, setReaderContent] = useState('')
  const [readerLoading, setReaderLoading] = useState(false)
  const [healthChecking, setHealthChecking] = useState(false)
  const [healthResult, setHealthResult] = useState(null)
  const [draggedLinkId, setDraggedLinkId] = useState(null)
  const [draggingLinkIds, setDraggingLinkIds] = useState([])
  const [dragOverLinkId, setDragOverLinkId] = useState(null)
  const [dropFolderId, setDropFolderId] = useState(null)
  const [archiveLink, setArchiveLink] = useState(null)
  const [detailLink, setDetailLink] = useState(null)
  const [folderLockModal, setFolderLockModal] = useState(null)
  const touchStartY = useRef(0)
  const toast = useToast()
  const { mode: viewMode, toggle: toggleViewMode } = useViewMode(`folder:${id}`)

  const safeTabs = tabs || []

  useEffect(() => {
    setSortBy(readFolderPreference(id, 'sort', 'newest'))
    setActiveTag(readFolderPreference(id, 'tag', '') || null)
  }, [id])

  useEffect(() => {
    try { localStorage.setItem(`lk_folder_pref:${id}:sort`, sortBy) } catch {}
  }, [id, sortBy])

  useEffect(() => {
    try {
      if (activeTag) localStorage.setItem(`lk_folder_pref:${id}:tag`, activeTag)
      else localStorage.removeItem(`lk_folder_pref:${id}:tag`)
    } catch {}
  }, [id, activeTag])

  // Determine if "all" or specific folder
  const isAll = id === 'all'
  const currentTab = safeTabs.find(t => t.id === Number(id))

  // Child folders of current folder
  const childTabs = useMemo(() => safeTabs.filter(t => t.parent_id === Number(id)), [safeTabs, id])

  // Adaptive scroll
  useEffect(() => {
    const onScroll = throttle(() => { setHeaderScrolled(window.scrollY > 40) }, 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const linkParams = useMemo(() => {
    const p = {}
    if (!isAll && id) p.tab_id = Number(id)
    if (search) p.q = search
    return p
  }, [id, isAll, search])

  const { links, loading, create: createLink, update: updateLink, remove: deleteLink, toggleFav, refresh } = useLinks(token, linkParams)
  const rawLinks = links || []

  useEffect(() => {
    const onLinksMoved = () => {
      refresh()
      refreshTabs()
      setSelectedIds([])
      setSelectionMode(false)
      setDraggedLinkId(null)
      setDraggingLinkIds([])
      setDragOverLinkId(null)
      setDropFolderId(null)
    }
    window.addEventListener('linkkeep-links-moved', onLinksMoved)
    return () => window.removeEventListener('linkkeep-links-moved', onLinksMoved)
  }, [refresh, refreshTabs])

  const allTags = useMemo(() => {
    const s = new Set()
    rawLinks.forEach(l => (l.tags || []).forEach(t => s.add(t)))
    return [...s].sort()
  }, [rawLinks])

  const processedLinks = useMemo(() => {
    let r = [...rawLinks]
    if (activeTag) r = r.filter(l => (l.tags || []).includes(activeTag))
    switch (sortBy) {
      case 'manual': r.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || new Date(b.created_at) - new Date(a.created_at)); break
      case 'newest': r.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break
      case 'oldest': r.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break
      case 'az': r.sort((a, b) => a.title.localeCompare(b.title)); break
      case 'za': r.sort((a, b) => b.title.localeCompare(a.title)); break
    }
    return r
  }, [rawLinks, activeTag, sortBy])

  const pinnedLinks = processedLinks.filter(l => l.is_pinned)
  const normalLinks = processedLinks.filter(l => !l.is_pinned)

  const headerTitle = isAll ? 'All Links' : (currentTab ? currentTab.name : 'Folder')
  const accentColor = isAll ? '#6366f1' : (currentTab?.color || '#6366f1')
  const lockedCurrentFolder = !isAll && currentTab?.is_locked && !currentTab?.is_unlocked
  const unlockedProtectedFolder = !isAll && currentTab?.is_locked && currentTab?.is_unlocked

  const handleLockCurrentFolder = async () => {
    if (!currentTab?.id) return
    api.clearFolderUnlock(currentTab.id)
    setMenuOpen(false)
    setSelectedIds([])
    setSelectionMode(false)
    await refreshTabs()
    toast.success('Folder locked')
  }

  const handleAddLink = async (data) => {
    try {
      if (editingLink) { await updateLink(editingLink.id, data); toast.success('Link updated') }
      else { await createLink(data); toast.success('Link added') }
      setModalOpen(false); setEditingLink(null)
      refreshTabs()
    } catch (err) { toast.error(err.message) }
  }

  const handleDeleteLink = async (link) => {
    const ok = await openConfirm({ title: `Delete "${link.title}"?`, danger: true })
    if (!ok) return
    await deleteLink(link.id)
    toast.success('Link deleted', 2500, { action: 'Undo', onAction: async () => {
      await api.restoreLink(link.id)
      refresh()
      toast.success('Link restored')
    }})
    refreshTabs()
  }

  const handleTogglePin = async (link) => {
    try {
      await api.togglePin(link.id)
      refresh()
      toast.success(link.is_pinned ? 'Unpinned' : 'Pinned to top')
    } catch (e) { toast.error(e.message) }
  }

  const handleToggleFav = async (link) => {
    await toggleFav(link.id)
    toast.success(link.is_favorite ? 'Removed from favorites' : 'Added to favorites')
  }

  const handleArchiveLink = async (link) => {
    try {
      toast.success('Archiving link...')
      await api.archiveLink(link.id)
      refresh()
      toast.success('Archive captured')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleEditLink = async (link) => {
    if (link._inlineUpdate) {
      try {
        await updateLink(link.id, link._inlineUpdate)
        toast.success('Link updated')
      } catch (err) {
        toast.error(err.message)
      }
      return
    }
    // Handle reader mode actions
    if (link._fetchContent) {
      setReaderLink(link); setReaderContent(''); setReaderLoading(true)
      try {
        const result = await api.fetchContent(link.id)
        setReaderContent(result.content || 'No content extracted')
        refresh() // update link object to show content is saved
      } catch (err) {
        toast.error(err.message)
        setReaderLink(null)
      }
      setReaderLoading(false)
      return
    }
    if (link._showReader) {
      setReaderLink(link); setReaderContent(link.content || 'No content saved')
      return
    }
    if (link.note !== undefined && link.id) {
      try { await api.updateLink(link.id, { note: link.note }) } catch {}
    }
    setEditingLink(link)
    setModalOpen(true)
  }

  const toggleSelect = (link) => {
    if (!selectionMode) { setSelectionMode(true); setSelectedIds([link.id]) }
    else if (selectedIds.includes(link.id)) {
      const next = selectedIds.filter(id => id !== link.id)
      setSelectedIds(next)
      if (next.length === 0) setSelectionMode(false)
    } else { setSelectedIds([...selectedIds, link.id]) }
  }

  const handleBulkDelete = async () => {
    const ok = await openConfirm({ title: `Delete ${selectedIds.length} links?`, danger: true })
    if (!ok) return
    await api.bulkAction(selectedIds, 'delete')
    setSelectedIds([]); setSelectionMode(false)
    refresh(); refreshTabs()
    toast.success(`${selectedIds.length} links deleted`)
  }

  const handleBulkMove = async (tabId) => {
    await api.bulkAction(selectedIds, 'move', tabId)
    setSelectedIds([]); setSelectionMode(false)
    refresh(); refreshTabs()
    toast.success('Links moved')
  }

  const handleBulkSimple = async (action, extra = {}) => {
    if (!selectedIds.length) return
    try {
      await api.bulkAction(selectedIds, action, null, extra)
      refresh()
      toast.success(`${selectedIds.length} links updated`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleBulkArchive = async () => {
    if (!selectedIds.length) return
    try {
      for (const linkId of selectedIds) await api.archiveLink(linkId)
      refresh()
      toast.success(`${selectedIds.length} archive jobs started`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleBulkExport = () => {
    const selected = rawLinks.filter((link) => selectedIds.includes(link.id))
    const blob = new Blob([JSON.stringify({ links: selected }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `linkatlas-selection-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Selection exported')
  }

  const handleBulkAddTags = async () => {
    const raw = prompt('Tags to add, comma separated:')
    const tags = raw?.split(',').map((item) => item.trim()).filter(Boolean) || []
    if (!tags.length) return
    await handleBulkSimple('add_tags', { tags })
  }

  const handleDropLinksToTab = async ({ linkIds, tabId, tabName }) => {
    const ids = [...new Set((linkIds || []).map(Number).filter(Boolean))]
    if (!ids.length || !tabId) return
    try {
      await api.bulkAction(ids, 'move', Number(tabId))
      setSelectedIds([])
      setSelectionMode(false)
      setDropFolderId(null)
      refresh()
      refreshTabs()
      toast.success(`${ids.length} ${ids.length === 1 ? 'link' : 'links'} moved to ${tabName || 'folder'}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Pull-to-refresh
  const handleTouchStart = (e) => {
    if (window.scrollY === 0) { touchStartY.current = e.touches[0].clientY; setPulling(true) }
  }
  const handleTouchMove = (e) => {
    if (!pulling) return
    const diff = e.touches[0].clientY - touchStartY.current
    if (diff > 0 && diff < 120) setPullDistance(diff)
  }
  const handleTouchEnd = () => {
    if (pullDistance > 80) { refresh(); refreshTabs(); toast.success('Refreshed') }
    setPullDistance(0); setPulling(false)
  }

  const handleDeleteFolder = async () => {
    if (!currentTab) return
    setMenuOpen(false)
    if (currentTab.link_count > 0) {
      const result = await openConfirm({
        title: `Delete "${currentTab.name}"?`,
        message: `This folder has ${currentTab.link_count} ${currentTab.link_count === 1 ? 'link' : 'links'}.`,
        threeWay: true,
      })
      if (!result) return
      const keepLinks = result === 'keep_links'
      await api.deleteTab(currentTab.id, keepLinks)
      refreshTabs()
      toast.success(keepLinks ? 'Folder deleted, links kept' : 'Folder and links deleted')
      navigate('/')
    } else {
      const ok = await openConfirm({ title: `Delete "${currentTab.name}"?`, danger: true })
      if (!ok) return
      await api.deleteTab(currentTab.id, false)
      refreshTabs()
      toast.success('Folder deleted')
      navigate('/')
    }
  }

  const handlePasteSave = async () => {
    let url = ''
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        url = await navigator.clipboard.readText()
      }
    } catch {}
    if (!url || !url.trim().startsWith('http')) {
      url = prompt('Paste URL here:')?.trim() || ''
    }
    url = url.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast.error('Invalid URL')
      return
    }
    toast.success('Saving...')
    try {
      const tabId = isAll ? null : Number(id)
      let meta = {}
      try { meta = await api.fetchMetadata(url) } catch {}
      await createLink({
        title: meta.title || url,
        url,
        tab_id: tabId,
        description: meta.description || null,
        favicon: meta.favicon || null,
        image: meta.image || null,
      })
      toast.success('Link saved from clipboard')
      refresh()
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        toast.error('Clipboard access denied')
      } else {
        toast.error(err.message)
      }
    }
  }

  const handleCheckHealth = async () => {
    setHealthChecking(true); setHealthResult(null)
    try {
      const result = await api.checkHealth(isAll ? null : Number(id))
      setHealthResult(result)
      refresh()
      toast.success(`Checked ${result.checked} links: ${result.dead} dead`, 4000)
    } catch (err) {
      toast.error(err.message)
    }
    setHealthChecking(false)
  }

  const handleReorderLinks = async (sourceId, targetId, section) => {
    if (!sourceId || !targetId || sourceId === targetId) return
    const sectionLinks = section === 'pinned' ? pinnedLinks : normalLinks
    const from = sectionLinks.findIndex((link) => link.id === sourceId)
    const to = sectionLinks.findIndex((link) => link.id === targetId)
    if (from < 0 || to < 0) return

    const next = [...sectionLinks]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)

    try {
      await api.reorderLinks(next.map((link, index) => ({
        id: link.id,
        sort_order: index,
        tab_id: link.tab_id ?? undefined,
      })))
      setSortBy('manual')
      refresh()
      toast.success('Order saved')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const dragHandlers = (link, section) => ({
    draggable: true,
    onDragStart: (e) => {
      const linkIds = selectionMode && selectedIds.includes(link.id) ? selectedIds : [link.id]
      const uniqueLinkIds = [...new Set(linkIds.map(Number).filter(Boolean))]
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(link.id))
      e.dataTransfer.setData(LINKKEEP_LINKS_MIME, JSON.stringify({
        type: 'linkkeep-links',
        linkIds: uniqueLinkIds,
        sourceTabId: link.tab_id ?? null,
      }))
      const preview = createDragPreview({ count: uniqueLinkIds.length, title: link.title })
      e.dataTransfer.setDragImage(preview, 12, 12)
      setTimeout(() => preview.remove(), 0)
      setDraggedLinkId(link.id)
      setDraggingLinkIds(uniqueLinkIds)
    },
    onDragOver: (e) => {
      if (!draggedLinkId || draggedLinkId === link.id) return
      if (draggingLinkIds.length > 1) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOverLinkId(link.id)
    },
    onDragLeave: () => {
      if (dragOverLinkId === link.id) setDragOverLinkId(null)
    },
    onDrop: async (e) => {
      e.preventDefault()
      const payload = parseDraggedLinks(e)
      if (payload?.linkIds?.length !== 1) {
        setDragOverLinkId(null)
        setDraggedLinkId(null)
        setDraggingLinkIds([])
        setDropFolderId(null)
        return
      }
      const sourceId = payload.linkIds[0] || Number(e.dataTransfer.getData('text/plain')) || draggedLinkId
      setDragOverLinkId(null)
      setDraggedLinkId(null)
      setDraggingLinkIds([])
      setDropFolderId(null)
      await handleReorderLinks(sourceId, link.id, section)
    },
    onDragEnd: () => {
      setDraggedLinkId(null)
      setDraggingLinkIds([])
      setDragOverLinkId(null)
      setDropFolderId(null)
    },
  })

  const defaultTabId = isAll ? '' : (id || '')

  // Create subfolder
  const handleCreateSub = () => {
    if (!newSubName.trim()) return
    createTab({ name: newSubName.trim(), color: newSubColor, parent_id: Number(id) })
    setNewSubName(''); setNewSubColor('#6366f1'); setNewSubOpen(false)
    toast.success('Subfolder created')
  }

  const isGrid = viewMode === 'grid'

  const linkShellStyle = (link) => {
    const dragging = draggingLinkIds.includes(link.id)
    const over = dragOverLinkId === link.id
    return {
      border: dragging ? '1px dashed rgba(129,140,248,0.72)' : '1px solid transparent',
      outline: over ? '2px dashed rgba(129,140,248,0.82)' : 'none',
      outlineOffset: over ? '4px' : '0px',
      background: dragging ? 'rgba(99,102,241,0.04)' : undefined,
      boxSizing: 'border-box',
    }
  }

  const renderLinkList = (section) => (link, i) => (
    <motion.div
      key={link.id}
      variants={staggerItem}
      className={`link-card-shell rounded-2xl ${draggingLinkIds.includes(link.id) ? 'opacity-50 scale-[0.99]' : ''} ${dragOverLinkId === link.id ? 'ring-2 ring-accent-500/50 shadow-lg shadow-accent-500/10' : ''}`}
      style={linkShellStyle(link)}
      {...dragHandlers(link, section)}
    >
      <LinkCard
        link={link}
        index={i}
        selectionMode={selectionMode}
        selected={selectedIds.includes(link.id)}
        onSelect={toggleSelect}
        onEdit={handleEditLink}
        onDelete={handleDeleteLink}
        onToggleFav={handleToggleFav}
        onTogglePin={handleTogglePin}
        onArchive={handleArchiveLink}
        onViewArchive={(link) => setArchiveLink(link)}
        onDetails={(link) => setDetailLink(link)}
      />
    </motion.div>
  )

  const renderLinkGrid = (section) => (link, i) => (
    <motion.div
      key={link.id}
      variants={staggerItem}
      className={`link-card-shell rounded-2xl ${draggingLinkIds.includes(link.id) ? 'opacity-50 scale-[0.99]' : ''} ${dragOverLinkId === link.id ? 'ring-2 ring-accent-500/50 shadow-lg shadow-accent-500/10' : ''}`}
      style={linkShellStyle(link)}
      {...dragHandlers(link, section)}
    >
      <LinkGridCard
        link={link}
        index={i}
        selectionMode={selectionMode}
        selected={selectedIds.includes(link.id)}
        onSelect={toggleSelect}
        onEdit={handleEditLink}
        onDelete={handleDeleteLink}
        onToggleFav={handleToggleFav}
        onTogglePin={handleTogglePin}
        onArchive={handleArchiveLink}
        onViewArchive={(link) => setArchiveLink(link)}
        onDetails={(link) => setDetailLink(link)}
      />
    </motion.div>
  )

  return (
    <div className="flex-1 min-h-[100dvh]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {pullDistance > 0 && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center items-center pointer-events-none"
          style={{ height: `${pullDistance}px`, opacity: pullDistance > 40 ? 1 : 0.5 }}>
          <div className={`text-xs ${pullDistance > 80 ? 'text-accent-400' : ''}`} style={{ color: pullDistance > 80 ? '#818cf8' : 'var(--text-muted)' }}>
            {pullDistance > 80 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 transition-all duration-300"
        style={{
          background: 'var(--bg-glass)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-subtle)',
          boxShadow: headerScrolled ? '0 18px 42px rgba(0,0,0,0.12)' : 'none',
        }}
      >
        <div className={`relative transition-all duration-300 ${headerScrolled ? 'px-4 sm:px-8 py-2' : 'px-4 sm:px-8 py-3'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => navigate('/')} className="p-2 -ml-2 rounded-xl transition-colors hover:bg-accent-500/10" style={{ color: 'var(--text-tertiary)' }}>
                <ArrowLeft size={18} />
              </button>
              <div className="star-node h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
              <div className="min-w-0">
                <div className="metadata-line hidden sm:block text-[9px] uppercase">{isAll ? 'complete sky' : 'active sector'}</div>
                <h1 className={`font-semibold tracking-tight truncate transition-all duration-300 ${headerScrolled ? 'text-sm' : 'text-base'}`} style={{ color: 'var(--text-primary)' }}>{headerTitle}</h1>
                <p className="metadata-line hidden sm:block text-[11px]">
                  <AnimatedCounter value={processedLinks.length} /> {processedLinks.length === 1 ? 'link' : 'links'}
                  {pinnedLinks.length > 0 && <span className="ml-2 inline-flex items-center gap-0.5"><PushPin size={9} weight="fill" /> <AnimatedCounter value={pinnedLinks.length} /></span>}
                  {activeTag && <span className="text-accent-400 ml-1">#{activeTag}</span>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* View mode toggle */}
              <button onClick={toggleViewMode} className="p-2 rounded-xl transition-colors surface-hover" style={{ color: 'var(--text-muted)' }}>
                {isGrid ? <ListBullets size={16} /> : <SquaresFour size={16} />}
              </button>
              <button onClick={handleCheckHealth} disabled={healthChecking} className="hidden sm:block p-2 rounded-xl transition-colors surface-hover" style={{ color: healthChecking ? 'var(--text-muted)' : healthResult?.dead > 0 ? '#ef4444' : 'var(--text-muted)' }} title="Check link health">
                <span className={`text-[10px] font-bold ${healthChecking ? 'animate-pulse' : ''}`}>{healthChecking ? '...' : healthResult ? `${healthResult.dead}⚡` : '⚡'}</span>
              </button>
              {unlockedProtectedFolder && (
                <button onClick={handleLockCurrentFolder} className="p-2 rounded-xl transition-colors surface-hover" style={{ color: 'var(--text-muted)' }} title="Lock folder" aria-label="Lock folder">
                  <LockKey size={16} weight="fill" />
                </button>
              )}
              {/* Create subfolder button (not in All Links) */}
              {!isAll && (
                <button onClick={() => lockedCurrentFolder ? setFolderLockModal({ tab: currentTab, mode: 'unlock' }) : setNewSubOpen(true)} className="p-2 rounded-xl transition-colors surface-hover" style={{ color: 'var(--text-muted)' }} title="Create subfolder">
                  <FolderPlus size={16} />
                </button>
              )}
              <button onClick={() => setSelectionMode(!selectionMode)} className={`p-2 rounded-xl transition-colors ${selectionMode ? 'text-white' : ''}`} style={selectionMode ? { background: 'var(--accent-primary)' } : { color: 'var(--text-muted)' }}><CheckSquare size={16} /></button>
              {/* 3-dot menu for folder actions */}
              {!isAll && currentTab && (
                <div className="relative">
                  <button onClick={() => setMenuOpen(!menuOpen)} onBlur={() => setTimeout(() => setMenuOpen(false), 150)} className="p-2 rounded-xl transition-colors surface-hover" style={{ color: 'var(--text-muted)' }}>
                    <Trash size={16} />
                  </button>
                  <AnimatePresence>
                    {menuOpen && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-full mt-1 z-20 glass rounded-2xl py-1 min-w-[140px] shadow-xl">
                        {unlockedProtectedFolder && (
                          <button onClick={handleLockCurrentFolder} className="w-full px-3 py-2 text-left text-xs surface-hover flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}><LockKey size={13} weight="fill" /> Lock folder</button>
                        )}
                        <button onClick={handleDeleteFolder} className="w-full px-3 py-2 text-left text-xs hover:bg-red-500/10 flex items-center gap-2 text-red-400"><Trash size={13} /> Delete folder</button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="glass text-xs rounded-xl px-2 py-2 border-none outline-none cursor-pointer" style={{ color: 'var(--text-secondary)' }} aria-label="Sort links">
                <option value="newest">Newest</option><option value="manual">Manual</option><option value="oldest">Oldest</option><option value="az">A-Z</option><option value="za">Z-A</option>
              </select>
              <button onClick={handlePasteSave} className="hidden sm:flex h-9 w-9 glass rounded-2xl active:scale-95 transition-all items-center justify-center surface-hover" style={{ color: 'var(--text-muted)' }} title="Paste URL from clipboard">
                <Clipboard size={18} />
              </button>
              <button onClick={() => lockedCurrentFolder ? setFolderLockModal({ tab: currentTab, mode: 'unlock' }) : (setEditingLink(null), setModalOpen(true))} className="h-9 w-9 text-white rounded-2xl active:scale-95 transition-all flex items-center justify-center hover:brightness-110" style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-mint))', boxShadow: '0 14px 32px rgba(124,140,255,0.22)' }}><Plus size={18} weight="bold" /></button>
            </div>
          </div>

          <div className="mt-3">
            <SearchBar value={search} onChange={setSearch} placeholder="Search in this folder..." />
          </div>

          {allTags.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {activeTag && <button onClick={() => setActiveTag(null)} className="shrink-0 text-[10px] px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">Clear</button>}
              {allTags.map(tag => <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} className="metadata-line shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-all glass" style={{ color: 'var(--text-tertiary)', borderColor: activeTag === tag ? 'rgba(124,140,255,0.5)' : 'var(--border-subtle)', background: activeTag === tag ? 'rgba(124,140,255,0.15)' : '' }}>{tag}</button>)}
            </div>
          )}
        </div>
      </header>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 atlas-panel rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-xl"
          >
            <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{selectedIds.length} selected</span>
            <div className="h-4 w-px" style={{ background: 'var(--border-subtle)' }} />
            <button onClick={() => setSelectedIds(processedLinks.map((link) => link.id))} className="text-xs text-accent-400 hover:text-accent-300">Select all</button>
            <select onChange={(e) => { if (e.target.value) handleBulkMove(Number(e.target.value)); e.target.value = '' }}
              className="text-xs bg-transparent outline-none cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <option value="">Move to...</option>
              {safeTabs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={() => handleBulkSimple('read')} className="text-xs text-accent-400 hover:text-accent-300">Read</button>
            <button onClick={() => handleBulkSimple('unread')} className="text-xs text-accent-400 hover:text-accent-300">Unread</button>
            <button onClick={() => handleBulkSimple('favorite')} className="text-xs text-accent-400 hover:text-accent-300">Star</button>
            <button onClick={() => handleBulkSimple('pin')} className="text-xs text-accent-400 hover:text-accent-300">Pin</button>
            <button onClick={handleBulkAddTags} className="text-xs text-accent-400 hover:text-accent-300">Tags</button>
            <button onClick={handleBulkArchive} className="text-xs text-accent-400 hover:text-accent-300">Archive</button>
            <button onClick={handleBulkExport} className="text-xs text-accent-400 hover:text-accent-300">Export</button>
            <button onClick={handleBulkDelete} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"><Trash size={13} /> Delete</button>
            <button onClick={() => { setSelectionMode(false); setSelectedIds([]) }} style={{ color: 'var(--text-muted)' }}><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="px-4 sm:px-8 py-4 pb-24 sm:pb-8">
        {/* Subfolder chips */}
        {lockedCurrentFolder ? (
          <div className="max-w-lg mx-auto mt-16 atlas-panel rounded-2xl p-6 text-center">
            <div className="h-14 w-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: `${accentColor}20`, border: `1px solid ${accentColor}35`, color: accentColor }}>
              <LockKey size={26} weight="fill" />
            </div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Folder is protected</h2>
            <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              Enter the folder PIN to reveal its subfolders and saved links.
            </p>
            <button
              onClick={() => setFolderLockModal({ tab: currentTab, mode: 'unlock' })}
              className="mt-5 text-white px-4 py-2.5 rounded-2xl text-sm font-medium hover:brightness-110 transition-colors inline-flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-mint))' }}
            >
              <LockKey size={15} weight="fill" /> Unlock folder
            </button>
          </div>
        ) : !isAll && childTabs.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="metadata-line text-xs font-medium uppercase tracking-wider">Subfolders</h2>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{childTabs.length}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {childTabs.map(child => {
                const childColor = child.color || '#6366f1'
                const childLinks = child.total_link_count ?? child.link_count ?? 0
                const childLocked = child.is_locked && !child.is_unlocked
                const childDropActive = dropFolderId === child.id
                const childDropHandlers = {
                  onDragEnter: (e) => {
                    if (!hasDraggedLinks(e)) return
                    if (!childLocked) setDropFolderId(child.id)
                  },
                  onDragOver: (e) => {
                    if (!hasDraggedLinks(e)) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = childLocked ? 'none' : 'move'
                    if (!childLocked) setDropFolderId(child.id)
                  },
                  onDragLeave: (e) => {
                    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return
                    if (dropFolderId === child.id) setDropFolderId(null)
                  },
                  onDrop: async (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setDropFolderId(null)
                    if (childLocked) return
                    const payload = parseDraggedLinks(e)
                    if (!payload?.linkIds?.length) return
                    await handleDropLinksToTab({ ...payload, tabId: child.id, tabName: child.name })
                  },
                }
                return (
                  <motion.button
                    key={child.id}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => childLocked ? setFolderLockModal({ tab: child, mode: 'unlock' }) : navigate(`/folder/${child.id}`)}
                    className={`archive-slip flex items-center gap-2 px-3 py-2 rounded-2xl text-xs transition-all hover:shadow-md ${childDropActive ? 'scale-[1.03]' : ''}`}
                    style={{
                      border: `1px solid ${childDropActive ? childColor : `${childColor}25`}`,
                      borderStyle: childDropActive ? 'dashed' : 'solid',
                      background: childDropActive ? `${childColor}18` : undefined,
                      boxShadow: childDropActive ? `0 12px 28px ${childColor}20` : undefined,
                    }}
                    {...childDropHandlers}
                  >
                    <div className="h-5 w-5 rounded-xl flex items-center justify-center" style={{ background: `${childColor}20` }}>
                      {childLocked ? <LockKey size={11} weight="fill" style={{ color: childColor }} /> : <div className="star-node h-1.5 w-1.5 rounded-full" style={{ backgroundColor: childColor }} />}
                    </div>
                    <span className="font-medium truncate max-w-[120px]" style={{ color: 'var(--text-primary)' }}>{child.name}</span>
                    <span className="metadata-line text-[10px]">{childLinks}</span>
                    {childDropActive && <ArrowSquareIn size={12} weight="fill" style={{ color: childColor }} />}
                    {child.child_count > 0 && (
                      <CaretRight size={10} weight="bold" style={{ color: 'var(--text-muted)' }} />
                    )}
                  </motion.button>
                )
              })}
            </div>
          </div>
        )}

        {!lockedCurrentFolder && loading ? (
          <div className={`${isGrid ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid grid-cols-1 md:grid-cols-2'} gap-3`}>
            {Array.from({ length: 4 }).map((_, i) => <LinkSkeleton key={i} index={i} />)}
          </div>
        ) : !lockedCurrentFolder && processedLinks.length === 0 ? (
          <EmptyState
            title={search ? 'No matching links' : 'No links yet'}
            subtitle={search ? 'Try a different search term' : 'Add your first link to this folder'}
            actionLabel={search ? undefined : 'Add Link'}
            onAction={search ? undefined : () => setModalOpen(true)}
            illustration={search ? 'no-results' : 'no-links'}
          />
        ) : !lockedCurrentFolder ? (
          <>
            {pinnedLinks.length > 0 && (
              <div className="space-y-1.5 mb-4">
                <div className="text-[10px] font-medium uppercase tracking-wider flex items-center gap-1 px-1" style={{ color: 'var(--text-muted)' }}>
                  <PushPin size={10} weight="fill" /> Pinned
                </div>
                <motion.div className={`${isGrid ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid grid-cols-1 md:grid-cols-2'} gap-3`} variants={staggerContainer} initial="hidden" animate="show">
                  {pinnedLinks.map(isGrid ? renderLinkGrid('pinned') : renderLinkList('pinned'))}
                </motion.div>
              </div>
            )}
            {normalLinks.length > 0 && (
              <motion.div className={`${isGrid ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid grid-cols-1 md:grid-cols-2'} gap-3`} variants={staggerContainer} initial="hidden" animate="show">
                {normalLinks.map(isGrid ? renderLinkGrid('normal') : renderLinkList('normal'))}
              </motion.div>
            )}
          </>
        ) : null}
      </main>

      {/* Floating add button on mobile */}
      {!lockedCurrentFolder && <button onClick={() => { setEditingLink(null); setModalOpen(true) }} onContextMenu={(e) => { e.preventDefault(); handlePasteSave() }} className="sm:hidden fixed bottom-20 right-4 z-40 h-14 w-14 text-white rounded-2xl flex items-center justify-center active:scale-90 transition-transform" style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-mint))', boxShadow: '0 18px 42px rgba(124,140,255,0.28)' }} title="Tap: add link, Long press: paste from clipboard"><Plus size={24} weight="bold" /></button>}

      <LinkModal open={modalOpen} onClose={() => { setModalOpen(false); setEditingLink(null) }} onSubmit={handleAddLink} initial={editingLink} tabs={safeTabs} defaultTabId={defaultTabId} />
      <ArchiveModal
        open={!!archiveLink}
        link={archiveLink}
        onClose={() => setArchiveLink(null)}
        onArchiveCreated={() => refresh()}
      />
      <LinkDetailModal
        open={!!detailLink}
        link={detailLink}
        onClose={() => setDetailLink(null)}
        onUpdated={() => refresh()}
        toast={toast}
      />
      <FolderLockModal
        open={!!folderLockModal}
        tab={folderLockModal?.tab}
        mode={folderLockModal?.mode || 'unlock'}
        onClose={() => setFolderLockModal(null)}
        onSuccess={() => { refreshTabs(); refresh() }}
      />

      {/* Reader modal */}
      <AnimatePresence>
        {readerLink && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={() => setReaderLink(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              className="glass rounded-2xl max-w-2xl w-full max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <BookOpen size={16} style={{ color: '#818cf8' }} />
                  <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{readerLink.title}</h3>
                </div>
                <button onClick={() => setReaderLink(null)} className="p-1.5 rounded-lg surface-hover" style={{ color: 'var(--text-muted)' }}>
                  <X size={16} />
                </button>
              </div>
              <div className="px-5 py-4 overflow-y-auto flex-1">
                {readerLoading ? (
                  <div className="space-y-2">
                    <div className="h-3 rounded-lg w-full animate-pulse" style={{ background: 'var(--bg-tertiary)' }} />
                    <div className="h-3 rounded-lg w-4/5 animate-pulse" style={{ background: 'var(--bg-tertiary)' }} />
                    <div className="h-3 rounded-lg w-3/4 animate-pulse" style={{ background: 'var(--bg-tertiary)' }} />
                  </div>
                ) : (
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)', fontFamily: 'inherit' }}>{readerContent}</pre>
                )}
              </div>
              <div className="px-5 py-3 shrink-0 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <a href={readerLink.url} target="_blank" rel="noreferrer" className="text-[11px] flex items-center gap-1 truncate" style={{ color: 'rgba(129,140,248,0.8)' }}>
                  {readerLink.url}<ArrowUpRight size={10} weight="bold" />
                </a>
                {readerLink.content_fetched && (
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Saved {new Date(readerLink.content_fetched).toLocaleString()}</span>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New subfolder modal */}
      {newSubOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={() => setNewSubOpen(false)}>
          <div className="glass rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>New Subfolder</h3>
            <p className="text-[11px] mb-4" style={{ color: 'var(--text-tertiary)' }}>Inside "{currentTab?.name || ''}"</p>
            <input autoFocus value={newSubName} onChange={(e) => setNewSubName(e.target.value)} placeholder="Subfolder name..." className="input-base w-full rounded-xl px-4 py-2.5 text-sm outline-none mb-3" onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSub() }} />
            {newSubName.trim() && (
              <div className="flex items-center gap-2 mb-4">
                <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Color:</label>
                {[ '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444'].map(c => (
                  <button key={c} type="button" onClick={() => setNewSubColor(c)} className={`h-5 w-5 rounded-full transition-transform ${newSubColor === c ? 'scale-125 ring-2 ring-white/20' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={handleCreateSub} disabled={!newSubName.trim()} className="flex-1 bg-accent-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Create</button>
              <button onClick={() => setNewSubOpen(false)} className="glass px-4 py-2.5 rounded-xl text-sm surface-hover" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
