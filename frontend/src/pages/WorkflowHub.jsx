import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowSquareOut,
  BellRinging,
  Books,
  Brain,
  Calendar,
  CheckCircle,
  CirclesThreePlus,
  Clock,
  Code,
  Graph,
  Globe,
  Heartbeat,
  Lightning,
  MagnifyingGlass,
  Network,
  Notebook,
  PaperPlaneTilt,
  Play,
  Plus,
  Sparkle,
  UsersThree,
  WebhooksLogo,
} from '@phosphor-icons/react'
import { api } from '../lib/api'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'

function Panel({ title, icon: Icon, children, action, className = '' }) {
  return (
    <section className={`atlas-panel rounded-2xl p-4 min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center shrink-0">
            <Icon size={18} className="text-accent-400" />
          </div>
          <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function MiniButton({ children, onClick, disabled, danger = false, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 min-h-[38px] text-xs font-medium transition-all disabled:opacity-40 ${danger ? 'text-red-300 hover:bg-red-500/10' : 'glass surface-hover'} ${className}`}
      style={{ color: danger ? undefined : 'var(--text-secondary)' }}
    >
      {children}
    </button>
  )
}

function TextInput(props) {
  return <input {...props} className={`input-base rounded-xl px-3 py-2 min-h-[40px] text-sm outline-none ${props.className || ''}`} />
}

function TextArea(props) {
  return <textarea {...props} className={`input-base rounded-xl px-3 py-2 text-sm outline-none resize-none ${props.className || ''}`} />
}

function formatDate(value) {
  if (!value) return 'not set'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function defaultReminderTime() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

function GraphPreview({ graph }) {
  const nodes = (graph?.nodes || []).slice(0, 18)
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = (graph?.edges || []).filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)).slice(0, 36)

  if (!nodes.length) {
    return <EmptyState title="Knowledge graph is empty" subtitle="Save links with tags and folders to build the map." />
  }

  const center = { x: 240, y: 132 }
  const positions = Object.fromEntries(nodes.map((node, index) => {
    const ring = node.type === 'link' ? 98 : 74
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2
    const offset = node.type === 'link' ? 0 : index % 2 ? 18 : -10
    return [node.id, {
      x: center.x + Math.cos(angle) * (ring + offset),
      y: center.y + Math.sin(angle) * (ring + offset * 0.5),
    }]
  }))

  return (
    <div className="space-y-3">
      <div className="glass rounded-2xl overflow-hidden">
        <svg viewBox="0 0 480 264" className="w-full aspect-[1.82] block" role="img" aria-label="Knowledge graph preview">
          <defs>
            <radialGradient id="graphGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(124,140,255,0.44)" />
              <stop offset="100%" stopColor="rgba(124,140,255,0)" />
            </radialGradient>
          </defs>
          <rect width="480" height="264" rx="18" fill="rgba(4,8,18,0.36)" />
          <circle cx={center.x} cy={center.y} r="118" fill="url(#graphGlow)" opacity="0.35" />
          {edges.map((edge, index) => {
            const source = positions[edge.source]
            const target = positions[edge.target]
            if (!source || !target) return null
            return (
              <line
                key={`${edge.source}-${edge.target}-${index}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke="rgba(180,195,255,0.22)"
                strokeWidth="1"
              />
            )
          })}
          {nodes.map((node) => {
            const position = positions[node.id]
            const size = Math.min(20, 7 + (node.weight || 1) * 2)
            return (
              <g key={node.id}>
                <circle cx={position.x} cy={position.y} r={size + 7} fill={node.color || '#7c8cff'} opacity="0.12" />
                <circle cx={position.x} cy={position.y} r={size} fill={node.color || '#7c8cff'} stroke="rgba(255,255,255,0.48)" />
                <text
                  x={position.x}
                  y={position.y + size + 16}
                  textAnchor="middle"
                  fontSize="9"
                  fill="rgba(232,238,255,0.78)"
                >
                  {(node.label || '').slice(0, 18)}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-2">
        {(graph?.clusters || []).slice(0, 8).map((cluster) => (
          <span key={cluster.id} className="glass rounded-full px-2.5 py-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            {cluster.label} · {cluster.count}
          </span>
        ))}
      </div>
    </div>
  )
}

function LinkList({ items, emptyTitle, emptySubtitle }) {
  if (!items?.length) return <EmptyState title={emptyTitle} subtitle={emptySubtitle} />
  return (
    <div className="space-y-2">
      {items.slice(0, 5).map((link) => (
        <div key={link.id} className="glass rounded-xl p-3">
          <p className="text-sm font-medium truncate">{link.title}</p>
          <p className="metadata-line text-[10px] truncate">{link.url}</p>
        </div>
      ))}
    </div>
  )
}

export default function WorkflowHub() {
  const toast = useToast()
  const [rules, setRules] = useState([])
  const [smart, setSmart] = useState([])
  const [inbox, setInbox] = useState([])
  const [highlights, setHighlights] = useState([])
  const [health, setHealth] = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [webhooks, setWebhooks] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [profile, setProfile] = useState(null)
  const [graph, setGraph] = useState({ nodes: [], edges: [], clusters: [] })
  const [reminders, setReminders] = useState([])
  const [digest, setDigest] = useState(null)
  const [semanticQuery, setSemanticQuery] = useState('dashboard design')
  const [semanticResults, setSemanticResults] = useState([])
  const [assistantQuestion, setAssistantQuestion] = useState('Find saved links about React performance')
  const [assistant, setAssistant] = useState(null)
  const [readerId, setReaderId] = useState('')
  const [reader, setReader] = useState(null)
  const [summary, setSummary] = useState(null)
  const [newSmart, setNewSmart] = useState({ name: 'Unread design', query: 'tag:design is:unread', color: '#7c8cff' })
  const [workspaceName, setWorkspaceName] = useState('Team Atlas')
  const [webhookUrl, setWebhookUrl] = useState('https://example.com/webhooks/linkatlas')
  const [reminderLinkId, setReminderLinkId] = useState('')
  const [reminderAt, setReminderAt] = useState(defaultReminderTime)
  const [archiveLinkId, setArchiveLinkId] = useState('')
  const [archiveResult, setArchiveResult] = useState(null)
  const [digestKind, setDigestKind] = useState('daily')
  const [busy, setBusy] = useState('')

  const load = async () => {
    const results = await Promise.allSettled([
      api.listRules(),
      api.listSmartCollections(),
      api.listInbox(),
      api.listAllHighlights(),
      api.healthHistory(),
      api.listWorkspaces(),
      api.listWebhooks(),
      api.webhookDeliveries(),
      api.getProfile(),
      api.knowledgeGraph(),
      api.listReminders(),
      api.digestPreview(digestKind),
    ])
    const value = (idx, fallback) => results[idx].status === 'fulfilled' ? results[idx].value : fallback
    setRules(value(0, {}).rules || [])
    setSmart(value(1, {}).smart_collections || [])
    setInbox(value(2, {}).links || [])
    setHighlights(value(3, {}).highlights || [])
    setHealth(value(4, {}).checks || [])
    setWorkspaces(value(5, {}).workspaces || [])
    setWebhooks(value(6, {}).webhooks || [])
    setDeliveries(value(7, {}).deliveries || [])
    setProfile(value(8, null))
    setGraph(value(9, { nodes: [], edges: [], clusters: [] }))
    setReminders(value(10, {}).reminders || [])
    setDigest(value(11, null))
  }

  useEffect(() => { load() }, [digestKind])

  const metrics = useMemo(() => ([
    { label: 'Rules', value: rules.length, icon: Lightning },
    { label: 'Inbox', value: inbox.length, icon: Books },
    { label: 'Graph nodes', value: graph.nodes?.length || 0, icon: Network },
    { label: 'Reminders', value: reminders.length, icon: BellRinging },
  ]), [rules.length, inbox.length, graph.nodes?.length, reminders.length])

  const run = async (key, fn, success = 'Done') => {
    setBusy(key)
    try {
      const result = await fn()
      await load()
      toast.success(success)
      return result
    } catch (err) {
      toast.error(err.message)
      return null
    } finally {
      setBusy('')
    }
  }

  const loadReader = async () => {
    if (!readerId) return
    const data = await run('reader', () => api.getReader(readerId), 'Reader loaded')
    if (data) setReader(data)
  }

  const summarize = async () => {
    if (!readerId) return
    const data = await run('summary', () => api.summarizeLink(readerId), 'Summary generated')
    if (data) setSummary(data)
  }

  const runSemantic = async () => {
    if (!semanticQuery.trim()) return
    const data = await run('semantic', () => api.semanticSearch(semanticQuery), 'Semantic search complete')
    if (data) setSemanticResults(data.links || [])
  }

  const askAssistant = async () => {
    if (!assistantQuestion.trim()) return
    const data = await run('assistant', () => api.assistantQuery({ question: assistantQuestion, limit: 8 }), 'Assistant answer ready')
    if (data) setAssistant(data)
  }

  const createReminder = async () => {
    if (!reminderLinkId || !reminderAt) return
    await run(
      'reminder',
      () => api.createReminder({ link_id: Number(reminderLinkId), remind_at: new Date(reminderAt).toISOString() }),
      'Reminder saved',
    )
  }

  const snoozeReminder = async (linkId, days) => {
    const remindAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    await run(`snooze-${linkId}`, () => api.snoozeReminder(linkId, { remind_at: remindAt }), 'Reminder snoozed')
  }

  const refreshDigest = async (kind = digestKind) => {
    setDigestKind(kind)
    const data = await run(`digest-${kind}`, () => api.digestPreview(kind), `${kind} digest loaded`)
    if (data) setDigest(data)
  }

  const archiveNow = async () => {
    if (!archiveLinkId) return
    const data = await run('archive-link', () => api.archiveLink(Number(archiveLinkId)), 'Archive captured')
    if (data) setArchiveResult(data)
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="atlas-panel rounded-3xl p-5 overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none opacity-70" style={{ background: 'radial-gradient(circle at 16% 10%, rgba(124,140,255,0.20), transparent 32%), radial-gradient(circle at 85% 20%, rgba(45,212,191,0.13), transparent 34%)' }} />
          <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div>
              <p className="metadata-line text-xs uppercase tracking-[0.22em]">Knowledge Operations</p>
              <h1 className="text-2xl sm:text-3xl font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>Workflow Hub</h1>
              <p className="text-sm max-w-2xl mt-2" style={{ color: 'var(--text-tertiary)' }}>
                Archive engine, AI assistant, semantic search, graph, review digests, reminders, browser overlay, rules, workspaces and webhooks.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 min-w-0 lg:min-w-[440px]">
              {metrics.map(({ label, value, icon: Icon }) => (
                <div key={label} className="glass rounded-2xl p-3">
                  <Icon size={16} className="text-accent-400 mb-2" />
                  <div className="text-xl font-semibold tabular-nums">{value}</div>
                  <div className="metadata-line text-[10px]">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Panel
            title="Real Archive Engine"
            icon={Archive}
            action={<MiniButton onClick={() => run('rebuild-embeddings', api.rebuildEmbeddings, 'Embeddings rebuilt')} disabled={busy === 'rebuild-embeddings'}><Brain size={14} />Rebuild</MiniButton>}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <TextInput value={archiveLinkId} onChange={(e) => setArchiveLinkId(e.target.value)} placeholder="Link ID" inputMode="numeric" />
                <MiniButton onClick={archiveNow} disabled={busy === 'archive-link'}><Archive size={14} />Capture</MiniButton>
              </div>
              {archiveResult ? (
                <div className="glass rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{archiveResult.engine || 'archive'} · {archiveResult.status}</p>
                    <span className="metadata-line text-[10px]">retry {archiveResult.retry_count || 0}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[10px]">
                    {[
                      ['HTML', archiveResult.has_html],
                      ['Text', archiveResult.has_text],
                      ['PNG', archiveResult.has_screenshot],
                      ['PDF', archiveResult.has_pdf],
                    ].map(([label, ok]) => (
                      <span key={label} className={`rounded-lg px-2 py-1 text-center ${ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-500/10 text-zinc-500'}`}>{label}</span>
                    ))}
                  </div>
                  {archiveResult.diff_summary && <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{archiveResult.diff_summary}</p>}
                </div>
              ) : (
                <div className="glass rounded-xl p-3 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  Playwright captures screenshots and browser PDFs when installed; HTTP fallback still stores HTML, text, preview and PDF on disk/S3.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="AI Assistant" icon={Brain}>
            <div className="space-y-3">
              <TextArea value={assistantQuestion} onChange={(e) => setAssistantQuestion(e.target.value)} rows={3} className="w-full" />
              <div className="flex flex-wrap gap-2">
                <MiniButton onClick={askAssistant} disabled={busy === 'assistant'}><PaperPlaneTilt size={14} />Ask</MiniButton>
                <MiniButton onClick={() => setAssistantQuestion('Make a collection about design systems')}><Sparkle size={14} />Design systems</MiniButton>
                <MiniButton onClick={() => setAssistantQuestion('Explain what I saved about React performance')}><Code size={14} />React perf</MiniButton>
              </div>
              {assistant ? (
                <div className="glass rounded-xl p-3">
                  <p className="text-sm leading-relaxed">{assistant.answer}</p>
                  <div className="mt-3 space-y-2">
                    {(assistant.sources || []).slice(0, 4).map((source) => (
                      <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="block rounded-lg px-2 py-2 surface-hover">
                        <span className="block text-xs font-medium truncate">{source.title}</span>
                        <span className="metadata-line text-[10px] truncate">score {source.score} · {(source.tags || []).join(', ')}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : <EmptyState title="Ask across saved links" subtitle="Answers cite the saved materials used as sources." />}
            </div>
          </Panel>

          <Panel title="Knowledge Graph" icon={Graph}>
            <GraphPreview graph={graph} />
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Panel
            title="Automatic Rules"
            icon={Lightning}
            action={<MiniButton onClick={() => run('defaults', api.createDefaultRules, 'Default rules installed')} disabled={busy === 'defaults'}><Sparkle size={14} />Defaults</MiniButton>}
          >
            <div className="space-y-2">
              {rules.length === 0 ? <EmptyState title="No rules yet" subtitle="Install defaults to route YouTube, tag docs, archive new links and review dead links." /> : rules.map(rule => (
                <div key={rule.id} className="glass rounded-xl p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{rule.name}</p>
                      <p className="metadata-line text-[10px]">{rule.trigger} · ran {rule.run_count || 0} times</p>
                    </div>
                    <span className={`text-[10px] rounded-full px-2 py-1 ${rule.is_enabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-zinc-500/10 text-zinc-400'}`}>{rule.is_enabled ? 'On' : 'Off'}</span>
                  </div>
                  <code className="block mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{JSON.stringify({ if: rule.conditions, then: rule.actions })}</code>
                </div>
              ))}
              <MiniButton onClick={() => run('runrules', () => api.runRules('link_created'), 'Rules re-applied')} disabled={busy === 'runrules'}><Play size={14} />Run on existing links</MiniButton>
            </div>
          </Panel>

          <Panel title="Smart Collections" icon={CirclesThreePlus}>
            <div className="grid gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2">
                <TextInput value={newSmart.name} onChange={(e) => setNewSmart({ ...newSmart, name: e.target.value })} placeholder="Name" />
                <TextInput value={newSmart.query} onChange={(e) => setNewSmart({ ...newSmart, query: e.target.value })} placeholder="tag:design is:unread" />
                <MiniButton onClick={() => run('smart', () => api.createSmartCollection(newSmart), 'Smart collection created')} disabled={busy === 'smart'}><Plus size={14} />Add</MiniButton>
              </div>
              {smart.map(item => (
                <div key={item.id} className="glass rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="metadata-line text-[10px] truncate">{item.query}</p>
                  </div>
                  <span className="metadata-line text-xs">{item.count} links</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Inbox Review" icon={Books}>
            <div className="space-y-2">
              {inbox.slice(0, 6).map(link => (
                <div key={link.id} className="glass rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{link.title}</p>
                    <p className="metadata-line text-[10px] truncate">{link.url}</p>
                  </div>
                  <MiniButton onClick={() => run(`read-${link.id}`, () => api.reviewInbox({ link_ids: [link.id], action: 'read' }), 'Marked read')}><CheckCircle size={14} />Read</MiniButton>
                </div>
              ))}
              {inbox.length === 0 && <EmptyState title="Inbox is clean" subtitle="Unread/new links will appear here for daily review." />}
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Panel
            title="Digest / Review"
            icon={Calendar}
            action={
              <div className="flex gap-1">
                {['daily', 'weekly'].map((kind) => (
                  <button key={kind} type="button" onClick={() => refreshDigest(kind)} className={`rounded-lg px-2 py-1 text-[10px] transition-all ${digestKind === kind ? 'bg-accent-500/20 text-accent-200' : 'surface-hover'}`}>
                    {kind}
                  </button>
                ))}
              </div>
            }
          >
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="glass rounded-xl p-3">
                  <p className="text-lg font-semibold">{digest?.new_links?.length || 0}</p>
                  <p className="metadata-line text-[10px]">new</p>
                </div>
                <div className="glass rounded-xl p-3">
                  <p className="text-lg font-semibold">{digest?.unread?.length || 0}</p>
                  <p className="metadata-line text-[10px]">unread</p>
                </div>
                <div className="glass rounded-xl p-3">
                  <p className="text-lg font-semibold">{digest?.stale_unread?.length || 0}</p>
                  <p className="metadata-line text-[10px]">stale</p>
                </div>
              </div>
              <LinkList items={digest?.stale_unread || digest?.unread || []} emptyTitle="Review queue is empty" emptySubtitle="Unread and stale links will appear here." />
              <div className="flex flex-wrap gap-2">
                <MiniButton onClick={() => run(`queue-${digestKind}`, () => api.createDigest(digestKind), `${digestKind} digest queued`)}><Calendar size={14} />Queue digest</MiniButton>
                <MiniButton onClick={() => run('process-reminders', api.processReminders, 'Reminder job queued')}><BellRinging size={14} />Process reminders</MiniButton>
              </div>
            </div>
          </Panel>

          <Panel title="Reminder Center" icon={BellRinging}>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[0.6fr_1fr_auto] gap-2">
                <TextInput value={reminderLinkId} onChange={(e) => setReminderLinkId(e.target.value)} placeholder="Link ID" inputMode="numeric" />
                <TextInput type="datetime-local" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} />
                <MiniButton onClick={createReminder} disabled={busy === 'reminder'}><Clock size={14} />Set</MiniButton>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {reminders.slice(0, 8).map((link) => (
                  <div key={link.id} className="glass rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{link.title}</p>
                      <p className="metadata-line text-[10px] truncate">{formatDate(link.reminder_at)}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <MiniButton onClick={() => snoozeReminder(link.id, 1)} className="px-2"><Clock size={14} /></MiniButton>
                      <MiniButton onClick={() => run(`clear-${link.id}`, () => api.clearReminder(link.id), 'Reminder cleared')} danger className="px-2">Clear</MiniButton>
                    </div>
                  </div>
                ))}
                {reminders.length === 0 && <EmptyState title="No reminders" subtitle="Set a reading reminder for any saved link." />}
              </div>
            </div>
          </Panel>

          <Panel title="Semantic Search" icon={MagnifyingGlass}>
            <div className="space-y-3">
              <div className="flex gap-2">
                <TextInput value={semanticQuery} onChange={(e) => setSemanticQuery(e.target.value)} className="flex-1" />
                <MiniButton onClick={runSemantic} disabled={busy === 'semantic'}><Sparkle size={14} />Find</MiniButton>
              </div>
              <div className="space-y-2">
                {semanticResults.slice(0, 5).map(item => (
                  <div key={item.link.id} className="glass rounded-xl p-3">
                    <p className="text-sm font-medium truncate">{item.link.title}</p>
                    <p className="metadata-line text-[10px] truncate">score {item.score} · {item.link.url}</p>
                  </div>
                ))}
                {semanticResults.length === 0 && <EmptyState title="No semantic result yet" subtitle="Run a natural-language query across titles, notes, content and highlights." />}
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Panel title="Reader Mode + Summaries" icon={Archive}>
            <div className="flex gap-2 mb-3">
              <TextInput value={readerId} onChange={(e) => setReaderId(e.target.value)} placeholder="Link ID" className="flex-1" />
              <MiniButton onClick={loadReader} disabled={busy === 'reader'}><Books size={14} />Open</MiniButton>
              <MiniButton onClick={summarize} disabled={busy === 'summary'}><Brain size={14} />TL;DR</MiniButton>
            </div>
            {reader ? (
              <div className="glass rounded-xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold truncate">{reader.link.title}</p>
                  <span className="metadata-line text-[10px]">{reader.reading_time_minutes} min</span>
                </div>
                {reader.toc?.length > 0 && <p className="metadata-line text-[10px] mt-2">TOC: {reader.toc.map(item => item.title).slice(0, 4).join(' · ')}</p>}
                <p className="text-xs leading-relaxed mt-3 line-clamp-6" style={{ color: 'var(--text-tertiary)' }}>{reader.content || 'No readable content yet. Fetch/archive the link first.'}</p>
              </div>
            ) : <EmptyState title="Open a link as an article" subtitle="Reader mode uses saved content or the latest archive for offline reading." />}
            {summary && (
              <div className="glass rounded-xl p-3 mt-3">
                <p className="text-xs font-semibold text-accent-300">TL;DR</p>
                <p className="text-sm mt-1">{summary.tldr}</p>
                <p className="metadata-line text-[10px] mt-2">{summary.language} · {summary.reading_time_minutes} min · {summary.suggested_tags?.join(', ')}</p>
              </div>
            )}
          </Panel>

          <Panel title="Highlights" icon={Notebook} action={<MiniButton onClick={() => run('export', () => api.exportHighlights('obsidian'), 'Export generated')}><ArrowSquareOut size={14} />Export</MiniButton>}>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {highlights.slice(0, 12).map(item => (
                <div key={item.id} className="glass rounded-xl p-3">
                  <p className="text-sm leading-relaxed">"{item.text}"</p>
                  <p className="metadata-line text-[10px] mt-2 truncate">{item.link_title}</p>
                </div>
              ))}
              {highlights.length === 0 && <EmptyState title="No highlights yet" subtitle="Use the extension overlay or context menu to save selected text." />}
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Panel title="Browser Overlay" icon={Globe}>
            <div className="space-y-3">
              <div className="glass rounded-xl p-3">
                <p className="text-sm font-semibold">Saved status, inline highlights, reader drawer</p>
                <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  Extension injects a compact overlay on normal web pages and talks to the same API as the app.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                {['saved / unsaved', 'inline highlight', 'reader sidebar', 'quick tags'].map((label) => (
                  <span key={label} className="glass rounded-lg px-2 py-2 flex items-center gap-2" style={{ color: 'var(--text-tertiary)' }}>
                    <CheckCircle size={12} className="text-emerald-300" />{label}
                  </span>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Health Monitor" icon={Heartbeat} action={<MiniButton onClick={() => run('health', () => api.checkHealth(), 'Health check queued/ran')}><Heartbeat size={14} />Check</MiniButton>}>
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {health.slice(0, 8).map(item => (
                <div key={item.id} className="glass rounded-xl p-3">
                  <div className="flex justify-between gap-3">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <span className={item.status >= 400 || item.status === 0 ? 'text-red-300 text-xs' : 'text-emerald-300 text-xs'}>{item.status}</span>
                  </div>
                  <p className="metadata-line text-[10px] truncate">{formatDate(item.checked_at)}</p>
                </div>
              ))}
              {health.length === 0 && <EmptyState title="No checks yet" subtitle="Run health check to build status history." />}
            </div>
          </Panel>

          <Panel title="Workspaces + Webhooks" icon={UsersThree}>
            <div className="space-y-3">
              <div className="flex gap-2">
                <TextInput value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} className="flex-1" />
                <MiniButton onClick={() => run('workspace', () => api.createWorkspace({ name: workspaceName }), 'Workspace created')}><UsersThree size={14} />Create</MiniButton>
              </div>
              <div className="grid gap-2">
                {workspaces.slice(0, 4).map(item => <div key={item.id} className="glass rounded-xl p-3 text-sm">{item.name}<span className="metadata-line ml-2 text-[10px]">{item.role}</span></div>)}
              </div>
              <div className="flex gap-2">
                <TextInput value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} className="flex-1" />
                <MiniButton onClick={() => run('webhook', () => api.createWebhook({ name: 'Link created', url: webhookUrl, events: ['link.created', 'webhook.test'] }), 'Webhook created')}><WebhooksLogo size={14} />Add</MiniButton>
              </div>
              <div className="grid gap-2">
                {webhooks.slice(0, 3).map(item => (
                  <div key={item.id} className="glass rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{item.name}</p>
                      <p className="metadata-line text-[10px] truncate">{item.url}</p>
                    </div>
                    <MiniButton onClick={() => run(`hook-${item.id}`, () => api.testWebhook(item.id), 'Webhook test queued')}><Code size={14} />Test</MiniButton>
                  </div>
                ))}
              </div>
              {deliveries.length > 0 && <p className="metadata-line text-[10px]">{deliveries.length} webhook deliveries recorded</p>}
            </div>
          </Panel>
        </div>

        <Panel title="Personal Page" icon={Globe}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.9fr] gap-4">
            <div className="space-y-2">
              <TextInput value={profile?.profile?.display_name || ''} onChange={(e) => setProfile({ ...profile, profile: { ...(profile?.profile || {}), display_name: e.target.value } })} placeholder="Display name" className="w-full" />
              <TextInput value={profile?.profile?.headline || ''} onChange={(e) => setProfile({ ...profile, profile: { ...(profile?.profile || {}), headline: e.target.value } })} placeholder="Headline" className="w-full" />
              <TextArea value={profile?.profile?.bio || ''} onChange={(e) => setProfile({ ...profile, profile: { ...(profile?.profile || {}), bio: e.target.value } })} placeholder="Bio" rows={3} className="w-full" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <TextInput value={profile?.profile?.location || ''} onChange={(e) => setProfile({ ...profile, profile: { ...(profile?.profile || {}), location: e.target.value } })} placeholder="Location" />
                <TextInput value={profile?.profile?.website || ''} onChange={(e) => setProfile({ ...profile, profile: { ...(profile?.profile || {}), website: e.target.value } })} placeholder="Website" />
                <TextInput value={profile?.profile?.accent || '#7c8cff'} onChange={(e) => setProfile({ ...profile, profile: { ...(profile?.profile || {}), accent: e.target.value } })} placeholder="#7c8cff" />
              </div>
              <MiniButton onClick={() => run('profile', () => api.updateProfile(profile.profile), 'Profile saved')} disabled={!profile || busy === 'profile'}><CheckCircle size={14} />Save public page</MiniButton>
            </div>
            <div className="rounded-3xl p-5 border overflow-hidden relative" style={{ borderColor: 'var(--border-subtle)', background: `radial-gradient(circle at 15% 10%, ${(profile?.profile?.accent || '#7c8cff')}55, transparent 34%), rgba(8,10,18,0.72)` }}>
              <p className="metadata-line text-xs uppercase tracking-[0.2em]">Public profile</p>
              <h3 className="text-2xl font-semibold mt-3">{profile?.profile?.display_name || profile?.username}</h3>
              <p className="text-sm mt-2 text-accent-200">{profile?.profile?.headline}</p>
              <p className="text-sm mt-4 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{profile?.profile?.bio || 'Tell people what your link atlas is about.'}</p>
              <a className="inline-flex items-center gap-2 text-xs mt-5 text-accent-300" href={profile?.public_url || '#'} target="_blank" rel="noreferrer">
                Open public page <ArrowSquareOut size={13} />
              </a>
            </div>
          </div>
        </Panel>
      </div>
    </main>
  )
}
