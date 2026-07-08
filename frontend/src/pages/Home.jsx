import { useState, useMemo, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Archive,
  ArrowUpRight,
  Bell,
  BookOpen,
  CaretDown,
  CheckCircle,
  Clipboard,
  ClockCounterClockwise,
  DotsThree,
  FileText,
  FolderOpen,
  FolderSimple,
  GridFour,
  ImageSquare,
  Lightning,
  Link as LinkIcon,
  MagnifyingGlass,
  Moon,
  NotePencil,
  Plus,
  Sparkle,
  Stack,
  Star,
  WarningCircle,
} from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { useTabStore } from '../hooks/useTabStore'
import { useLinks } from '../hooks/useLinks'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import FolderCard from '../components/FolderCard'
import TabEditModal from '../components/TabEditModal'
import FolderLockModal from '../components/FolderLockModal'
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
  try { return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getDomain(url))}&sz=64` }
  catch { return null }
}

function formatCompactNumber(value) {
  const number = Number(value) || 0
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(number)
}

function formatShortDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

function getLinkKind(link) {
  const domain = getDomain(link.url)
  if (domain.includes('youtube') || domain.includes('vimeo')) return 'Video'
  if (domain.includes('github') || domain.includes('gitlab')) return 'Code'
  if (domain.includes('figma') || domain.includes('behance') || domain.includes('dribbble')) return 'Design'
  return link.description ? 'Article' : 'Link'
}

function getArchiveState(link) {
  if (link.archive_status === 'completed') {
    return { label: 'Archived', Icon: CheckCircle, className: 'is-success' }
  }
  if (link.archive_status === 'failed') {
    return { label: 'Failed', Icon: WarningCircle, className: 'is-danger' }
  }
  if (link.archive_status) {
    return { label: 'Archiving', Icon: ClockCounterClockwise, className: 'is-warning' }
  }
  if (link.http_status === 0 || link.http_status >= 400) {
    return { label: 'Dead', Icon: WarningCircle, className: 'is-danger' }
  }
  return { label: 'Saved', Icon: CheckCircle, className: 'is-muted' }
}

function SparkLine({ variant = 'line', tone = 'violet' }) {
  if (variant === 'bars') {
    return (
      <div className={`metric-bars tone-${tone}`} aria-hidden="true">
        {[28, 44, 38, 60, 52, 78, 46, 90, 34].map((height, index) => (
          <span key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
    )
  }

  if (variant === 'donut') {
    return (
      <div className={`metric-donut tone-${tone}`} aria-hidden="true">
        <span />
      </div>
    )
  }

  const points = variant === 'soft'
    ? '1,26 12,21 22,24 32,15 44,18 55,9 66,12 78,4 91,13'
    : '1,28 12,23 22,24 33,17 44,14 55,8 66,4 78,10 91,17'

  return (
    <svg className={`metric-sparkline tone-${tone}`} viewBox="0 0 92 32" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`${points} 91,32 1,32`} className="sparkline-fill" />
    </svg>
  )
}

function MetricCard({ label, value, detail, icon: Icon, tone = 'violet', chart = 'line' }) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="metadata-line text-[10px] uppercase">{label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</div>
          <div className="metadata-line mt-1 text-[11px]">{detail}</div>
        </div>
        <div className="metric-icon">
          <Icon size={18} weight="duotone" />
        </div>
      </div>
      <SparkLine variant={chart} tone={tone} />
    </div>
  )
}

function ConstellationMap({ folders, allCount, favCount, onSelectNode }) {
  const positions = [
    { x: 26, y: 48 }, { x: 45, y: 26 }, { x: 55, y: 52 },
    { x: 72, y: 70 }, { x: 84, y: 40 }, { x: 34, y: 78 },
  ]
  const fallbackNodes = [
    { id: 'all', name: 'All Links', color: '#7c8cff', total_link_count: allCount, destination: '/folder/all' },
    { id: 'favorites', name: 'Favorites', color: '#f4b866', total_link_count: favCount, destination: '/favorites' },
    { id: 'inbox', name: 'Inbox', color: '#2dd4bf', total_link_count: 0, destination: '/folder/all' },
  ]
  const source = folders.length
    ? folders.map(folder => ({ ...folder, destination: `/folder/${folder.id}` }))
    : fallbackNodes
  const nodes = source.slice(0, 6).map((folder, index) => ({
    ...folder,
    ...(positions[index] || positions[0]),
    count: folder.total_link_count ?? folder.link_count ?? 0,
    color: folder.color || '#7c8cff',
  }))
  const hub = nodes[2] || nodes[0]
  const legendItems = nodes.slice(0, 5)

  return (
    <section className="dashboard-map atlas-panel constellation-card rounded-[1.35rem] p-4 sm:p-5">
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:items-stretch">
        <div className="space-y-5">
          <div>
            <div className="metadata-line text-[10px] uppercase mb-2">live atlas</div>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Link sky</h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              {formatCompactNumber(allCount)} saved links across {folders.length || 1} collections.
            </p>
          </div>
          <div className="space-y-2">
            {legendItems.map((node) => (
              <button
                key={node.id || node.name}
                type="button"
                onClick={() => onSelectNode?.(node)}
                className="map-legend-item focus-ring"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: node.color }} />
                <span className="truncate">{node.name}</span>
                <span className="ml-auto tabular-nums">{formatCompactNumber(node.count)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative min-h-[260px] overflow-hidden rounded-2xl">
          <div className="map-starfield" aria-hidden="true" />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {nodes.map((node) => (
              hub && node !== hub ? (
                <line
                  key={`hub-${node.id || node.name}`}
                  x1={hub.x}
                  y1={hub.y}
                  x2={node.x}
                  y2={node.y}
                  stroke="rgba(124,140,255,0.24)"
                  strokeWidth="0.5"
                />
              ) : null
            ))}
            {nodes.slice(1).map((node, index) => {
              const prev = nodes[index]
              return (
                <line
                  key={`${prev.id || prev.name}-${node.id || node.name}`}
                  x1={prev.x}
                  y1={prev.y}
                  x2={node.x}
                  y2={node.y}
                  stroke="rgba(45,212,191,0.18)"
                  strokeWidth="0.35"
                  strokeDasharray="2 4"
                />
              )
            })}
          </svg>

          {nodes.map((node, index) => (
            <button
              key={node.id || node.name}
              type="button"
              onClick={() => onSelectNode?.(node)}
              className={`map-node focus-ring ${node === hub ? 'is-hub' : ''}`}
              style={{ left: `${node.x}%`, top: `${node.y}%`, '--node-color': node.color }}
              title={node.name}
            >
              <span className="star-node block rounded-full" style={{ width: 11 + Math.min(node.count, 40) / 5, height: 11 + Math.min(node.count, 40) / 5, background: node.color }} />
              <span className="map-node-label">
                <strong>{node.name}</strong>
                <span>{formatCompactNumber(node.count)}</span>
              </span>
            </button>
          ))}

          <div className="map-zoom-controls" aria-hidden="true">
            <span>+</span>
            <span>-</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function LinkDashboardRow({ link, index, selected, onSelect, onArchive, onOpen }) {
  const favicon = link.favicon || getFaviconUrl(link.url)
  const domain = getDomain(link.url)
  const tags = Array.isArray(link.tags) ? link.tags.slice(0, 3) : []
  const archiveState = getArchiveState(link)
  const StatusIcon = archiveState.Icon

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: index * 0.04 }}
      className={`link-row ${selected ? 'is-selected' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSelect?.(link)}
        className="link-row-main focus-ring"
        aria-pressed={selected}
        aria-label={`Inspect ${link.title || domain || link.url}`}
      >
        <div className="stamp-frame">
          {favicon ? (
            <img src={favicon} alt="" onError={(e) => { e.currentTarget.src = getFaviconUrl(link.url) || '' }} />
          ) : (
            <LinkIcon size={24} weight="duotone" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="truncate text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{link.title || domain || link.url}</h3>
            <ArrowUpRight size={13} weight="bold" className="shrink-0" style={{ color: 'var(--text-muted)' }} />
          </div>
          <div className="metadata-line mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="truncate max-w-[180px]" style={{ color: 'var(--accent-mint)' }}>{domain || link.url}</span>
            <span>{getLinkKind(link)}</span>
            {link.created_at && <span>{formatShortDate(link.created_at)}</span>}
          </div>
        </div>

        <div className="hidden min-w-0 flex-wrap gap-1.5 md:flex">
          {tags.length ? tags.map(tag => (
            <span key={tag} className="link-tag">{tag}</span>
          )) : (
            <span className="link-tag is-muted">untagged</span>
          )}
        </div>
      </button>

      <div className="link-row-actions">
        <span className={`status-chip ${archiveState.className}`}>
          <StatusIcon size={12} weight="fill" />
          {archiveState.label}
        </span>
        {link.is_favorite && <Star size={16} weight="fill" className="text-amber-400" />}
        <button type="button" onClick={() => onArchive?.(link)} className="link-row-icon-button" aria-label={`Archive ${link.title || domain || link.url}`}>
          <Archive size={16} />
        </button>
        <button type="button" onClick={() => onOpen?.(link)} className="link-row-icon-button" aria-label={`Open ${link.title || domain || link.url}`}>
          <ArrowUpRight size={16} weight="bold" />
        </button>
      </div>
    </motion.article>
  )
}

function LinkInspectorPanel({ link, folder, onArchive, onCopy, onOpen, onToggleFavorite, onNewFolder, onQuickImport, pasting, navigate, allCount, favCount, folders }) {
  const archiveState = link ? getArchiveState(link) : null
  const StatusIcon = archiveState?.Icon || CheckCircle
  const domain = link ? getDomain(link.url) : ''
  const favicon = link ? (link.favicon || getFaviconUrl(link.url)) : null
  const previewImage = link?.image || favicon
  const tags = Array.isArray(link?.tags) ? link.tags.slice(0, 5) : []
  const hasNote = Boolean(link?.note?.trim())
  const primaryFolder = folders[0]
  const commandJumps = [
    { label: 'All Links', value: formatCompactNumber(allCount), Icon: Stack, onClick: () => navigate('/folder/all') },
    { label: 'Favorites', value: formatCompactNumber(favCount), Icon: Star, onClick: () => navigate('/favorites') },
    primaryFolder && { label: primaryFolder.name, value: formatCompactNumber(primaryFolder.total_link_count ?? primaryFolder.link_count ?? 0), Icon: FolderOpen, onClick: () => navigate(`/folder/${primaryFolder.id}`) },
  ].filter(Boolean)

  return (
    <aside className="inspector-panel hidden xl:flex">
      <div className="inspector-section pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="kbd-token">⌘ K</span>
            <span className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Inspector</span>
          </div>
          <button type="button" onClick={onQuickImport} disabled={pasting} className="icon-button" aria-label="Quick import">
            <Clipboard size={16} />
          </button>
        </div>
      </div>

      {link ? (
        <>
          <div className="inspector-preview">
            <LinkIcon size={48} weight="duotone" className="inspector-preview-fallback" />
            {previewImage && (
              <img src={previewImage} alt="" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            )}
            <div className="inspector-preview-grid" aria-hidden="true" />
          </div>

          <div className="inspector-section">
            <div className="metadata-line text-[10px] uppercase">Selected capture</div>
            <h2 className="mt-2 text-lg font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{link.title || domain || link.url}</h2>
            <p className="mt-1 truncate text-sm" style={{ color: 'var(--accent-mint)' }}>{domain || link.url}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className={`status-chip ${archiveState.className}`}>
                <StatusIcon size={12} weight="fill" />
                {archiveState.label}
              </span>
              <span className="status-chip is-muted">{getLinkKind(link)}</span>
              {folder && <span className="status-chip is-muted">{folder.name}</span>}
            </div>
          </div>

          <div className="inspector-action-grid">
            <button type="button" onClick={() => onOpen(link)} className="inspector-action focus-ring">
              <ArrowUpRight size={16} weight="bold" />
              Open
            </button>
            <button type="button" onClick={() => onArchive(link)} className="inspector-action focus-ring">
              <Archive size={16} />
              Archive
            </button>
            <button type="button" onClick={() => onCopy(link)} className="inspector-action focus-ring">
              <Clipboard size={16} />
              Copy URL
            </button>
            <button type="button" onClick={() => onToggleFavorite(link)} className="inspector-action focus-ring">
              <Star size={16} weight={link.is_favorite ? 'fill' : 'regular'} />
              {link.is_favorite ? 'Starred' : 'Star'}
            </button>
          </div>

          <div className="inspector-section">
            <div className="metadata-line text-[10px] uppercase">Archive timeline</div>
            <div className="archive-timeline mt-3">
              <div className="timeline-item is-done">
                <CheckCircle size={14} weight="fill" />
                <div>
                  <strong>Saved</strong>
                  <span>{formatShortDate(link.created_at) || 'Recently captured'}</span>
                </div>
              </div>
              <div className={`timeline-item ${link.archive_status === 'completed' ? 'is-done' : 'is-pending'}`}>
                <BookOpen size={14} weight="fill" />
                <div>
                  <strong>Readable text</strong>
                  <span>{link.archive_status === 'completed' ? 'Available in archive' : 'Waiting for capture'}</span>
                </div>
              </div>
              <div className={`timeline-item ${link.archive_status === 'completed' ? 'is-done' : 'is-pending'}`}>
                <ImageSquare size={14} weight="fill" />
                <div>
                  <strong>Screenshot</strong>
                  <span>{link.image ? 'Preview detected' : 'No preview yet'}</span>
                </div>
              </div>
              <div className="timeline-item is-pending">
                <FileText size={14} weight="fill" />
                <div>
                  <strong>PDF copy</strong>
                  <span>Queued with full preservation</span>
                </div>
              </div>
            </div>
          </div>

          <div className="inspector-section">
            <div className="flex items-center justify-between gap-3">
              <div className="metadata-line text-[10px] uppercase">Notes & highlights</div>
              <NotePencil size={15} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div className="inspector-note mt-3">
              {hasNote ? link.note : 'No note yet. Use highlights and notes to turn saved links into a knowledge base.'}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.length ? tags.map(tag => <span key={tag} className="link-tag">{tag}</span>) : <span className="link-tag is-muted">untagged</span>}
            </div>
          </div>
        </>
      ) : (
        <div className="inspector-empty">
          <Sparkle size={28} weight="duotone" />
          <h2>Select a capture</h2>
          <p>Saved links will show preview, archive status, notes, and quick actions here.</p>
        </div>
      )}

      <div className="inspector-section mt-auto">
        <div className="metadata-line text-[10px] uppercase">Command center</div>
        <div className="mt-2 space-y-1">
          <button type="button" onClick={onQuickImport} disabled={pasting} className="palette-row focus-ring">
            <Clipboard size={16} />
            <span>{pasting ? 'Importing...' : 'Quick import'}</span>
            <span className="kbd-token ml-auto">cmd i</span>
          </button>
          <button type="button" onClick={onNewFolder} className="palette-row focus-ring">
            <FolderSimple size={16} />
            <span>New collection</span>
            <span className="kbd-token ml-auto">cmd b</span>
          </button>
          {commandJumps.map(({ label, value, Icon, onClick }) => (
            <button key={label} type="button" onClick={onClick} className="palette-row focus-ring">
              <Icon size={16} weight={label === 'Favorites' ? 'fill' : 'regular'} />
              <span className="truncate">{label}</span>
              <span className="kbd-token ml-auto">{value}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}

export default function Home({ token }) {
  const { tabs, create: createTab, update: updateTab, refresh: refreshTabs } = useTabStore()
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
  const [selectedLinkId, setSelectedLinkId] = useState(null)
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

  const archivedCount = useMemo(() => safeLinks.filter(l => l.archive_status === 'completed').length, [safeLinks])
  const deadCount = useMemo(() => safeLinks.filter(l => l.http_status === 0 || l.http_status >= 400).length, [safeLinks])
  const linksThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return safeLinks.filter(link => link.created_at && new Date(link.created_at).getTime() >= weekAgo).length
  }, [safeLinks])
  const recentLinks = useMemo(() => {
    return [...safeLinks]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 5)
  }, [safeLinks])

  useEffect(() => {
    if (!safeLinks.length) {
      if (selectedLinkId !== null) setSelectedLinkId(null)
      return
    }
    if (!safeLinks.some(link => link.id === selectedLinkId)) {
      setSelectedLinkId(safeLinks[0].id)
    }
  }, [safeLinks, selectedLinkId])

  const selectedLink = useMemo(() => {
    return safeLinks.find(link => link.id === selectedLinkId) || recentLinks[0] || safeLinks[0] || null
  }, [safeLinks, recentLinks, selectedLinkId])

  const selectedFolder = useMemo(() => {
    return selectedLink?.tab_id ? safeTabs.find(tab => tab.id === selectedLink.tab_id) : null
  }, [safeTabs, selectedLink])

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

  const handleLockTab = (tab) => {
    if (!tab?.id) return
    api.clearFolderUnlock(tab.id)
    refreshTabs()
    refreshLinks()
    toast.success('Folder locked')
  }

  const handleOpenLink = (link) => {
    if (!link?.url) return
    window.open(link.url, '_blank', 'noopener,noreferrer')
  }

  const handleCopyLink = async (link) => {
    if (!link?.url) return
    try {
      await navigator.clipboard.writeText(link.url)
      toast.success('URL copied')
    } catch {
      toast.error('Clipboard unavailable')
    }
  }

  const handleArchiveDashboardLink = async (link) => {
    if (!link?.id) return
    try {
      toast.success('Archiving link...')
      await api.archiveLink(link.id)
      await refreshLinks()
      toast.success('Archive capture queued')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleToggleFavoriteLink = async (link) => {
    if (!link?.id) return
    try {
      await api.toggleFavorite(link.id)
      await refreshLinks()
      toast.success(link.is_favorite ? 'Removed from favorites' : 'Added to favorites')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const toggleDarkMode = () => {
    const nextDark = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', nextDark)
    localStorage.setItem('theme', nextDark ? 'dark' : 'light')
  }

  const avatarLetter = (user?.username || user?.email || 'L').charAt(0).toUpperCase()
  const archivePercent = allCount ? Math.round((archivedCount / allCount) * 100) : 0
  const deadPercent = allCount ? ((deadCount / allCount) * 100).toFixed(1) : '0.0'

  return (
    <div className="flex-1 min-h-[100dvh] p-2 sm:p-3 lg:p-4">
      <section className="dashboard-shell min-h-[calc(100dvh-1rem)] sm:min-h-[calc(100dvh-1.5rem)]">
        <header className="dashboard-topbar">
          <div className="hidden min-w-[150px] md:block">
            <div className="metadata-line text-[10px] uppercase">LinkAtlas</div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Observatory</h1>
          </div>

          <div className="command-search">
            <span className="kbd-token hidden sm:inline-flex">⌘ K</span>
            <MagnifyingGlass size={17} className="shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search links, tags, collections..."
              aria-label="Search links, tags, collections"
            />
            <span className="command-filter">
              All <CaretDown size={13} weight="bold" />
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => navigate('/recommendations')} className="icon-button" aria-label="Open recommendations">
              <Bell size={18} />
            </button>
            <button type="button" onClick={toggleDarkMode} className="icon-button" aria-label="Toggle theme">
              <Moon size={18} />
            </button>
            <button type="button" onClick={() => navigate('/settings')} className="avatar-button" aria-label="Open settings">
              {avatarLetter}
            </button>
          </div>
        </header>

        <div className="dashboard-action-row">
          <div className="min-w-0">
            <div className="metadata-line text-[10px] uppercase">personal archive</div>
            <p className="truncate text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {formatCompactNumber(allCount)} links in the vault · {formatCompactNumber(safeTabs.length)} collections
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <select value={homeSort} onChange={(e) => setHomeSort(e.target.value)} className="dashboard-select focus-ring" aria-label="Sort collections">
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="az">A-Z</option>
              <option value="za">Z-A</option>
              <option value="links">By links</option>
            </select>
            <button type="button" className="icon-button" aria-label="Grid view">
              <GridFour size={18} />
            </button>
            <button type="button" onClick={handlePasteSave} disabled={pasting} className="icon-button disabled:opacity-40" aria-label="Quick import">
              <Clipboard size={18} />
            </button>
            <div className="flex overflow-hidden rounded-2xl">
              <button
                type="button"
                onClick={handlePasteSave}
                disabled={pasting}
                className="primary-action-button disabled:opacity-50"
              >
                <Plus size={18} weight="bold" />
                <span>{pasting ? 'Saving...' : 'Add link'}</span>
              </button>
              <button
                type="button"
                onClick={() => setNewTabOpen(true)}
                className="primary-action-caret"
                aria-label="Create collection"
              >
                <CaretDown size={15} weight="bold" />
              </button>
            </div>
          </div>
        </div>

        <main className="dashboard-workspace">
          <div className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard label="Total links" value={formatCompactNumber(allCount)} detail={`+${formatCompactNumber(linksThisWeek)} this week`} icon={Stack} tone="violet" />
              <MetricCard label="Collections" value={formatCompactNumber(safeTabs.length)} detail={`${formatCompactNumber(filteredTabs.length)} visible now`} icon={FolderOpen} tone="cyan" chart="soft" />
              <MetricCard label="Archived" value={formatCompactNumber(archivedCount)} detail={`${archivePercent}% preserved`} icon={Archive} tone="blue" chart="donut" />
              <MetricCard label="Dead links" value={formatCompactNumber(deadCount)} detail={`${deadPercent}% needs review`} icon={WarningCircle} tone="amber" chart="bars" />
            </div>

            <ConstellationMap
              folders={filteredTabs}
              allCount={allCount}
              favCount={favCount}
              onSelectNode={(node) => navigate(node.destination || `/folder/${node.id}`)}
            />

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="metadata-line text-[10px] uppercase">{formatCompactNumber(recentLinks.length || allCount)} links</div>
                  <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Recent captures</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="dashboard-filter-chip">
                    All types <CaretDown size={13} weight="bold" />
                  </button>
                  <button type="button" className="dashboard-filter-chip">
                    All status <CaretDown size={13} weight="bold" />
                  </button>
                  <button type="button" className="icon-button" aria-label="More filters">
                    <DotsThree size={18} weight="bold" />
                  </button>
                </div>
              </div>

              {recentLinks.length > 0 ? (
                <div className="space-y-2">
                  {recentLinks.map((link, index) => (
                    <LinkDashboardRow
                      key={link.id || link.url}
                      link={link}
                      index={index}
                      selected={selectedLink?.id === link.id}
                      onSelect={(nextLink) => setSelectedLinkId(nextLink.id)}
                      onArchive={handleArchiveDashboardLink}
                      onOpen={handleOpenLink}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-dashboard-panel">
                  <Lightning size={22} weight="duotone" />
                  <div>
                    <h3>No links yet</h3>
                    <p>Use quick import to save the first URL into your archive.</p>
                  </div>
                  <button type="button" onClick={handlePasteSave} className="primary-action-button">
                    <Plus size={16} weight="bold" />
                    <span>Add link</span>
                  </button>
                </div>
              )}
            </section>

            <section className="space-y-3">
              {filteredTabs.length > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="metadata-line text-[10px] uppercase">Collections</div>
                    <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Folder rail</h2>
                  </div>
                  <span className="metadata-line text-[11px]">{filteredTabs.length}</span>
                </div>
              )}

              {filteredTabs.length > 0 ? (
                <motion.div
                  className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3"
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
                      onLock={handleLockTab}
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
            </section>
          </div>

          <LinkInspectorPanel
            link={selectedLink}
            folder={selectedFolder}
            onArchive={handleArchiveDashboardLink}
            onCopy={handleCopyLink}
            onOpen={handleOpenLink}
            onToggleFavorite={handleToggleFavoriteLink}
            onNewFolder={() => setNewTabOpen(true)}
            onQuickImport={handlePasteSave}
            pasting={pasting}
            navigate={navigate}
            allCount={allCount}
            favCount={favCount}
            folders={filteredTabs}
          />
        </main>
      </section>

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
