import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowSquareOut,
  Books,
  Brain,
  CheckCircle,
  CirclesThreePlus,
  Code,
  Globe,
  Heartbeat,
  Lightning,
  MagnifyingGlass,
  Notebook,
  Play,
  Plus,
  Sparkle,
  UsersThree,
  WebhooksLogo,
} from '@phosphor-icons/react'
import { api } from '../lib/api'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'

function Panel({ title, icon: Icon, children, action }) {
  return (
    <section className="atlas-panel rounded-2xl p-4 min-w-0">
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

function MiniButton({ children, onClick, disabled, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-all disabled:opacity-40 ${danger ? 'text-red-300 hover:bg-red-500/10' : 'glass surface-hover'}`}
      style={{ color: danger ? undefined : 'var(--text-secondary)' }}
    >
      {children}
    </button>
  )
}

function TextInput(props) {
  return <input {...props} className={`input-base rounded-xl px-3 py-2 text-sm outline-none ${props.className || ''}`} />
}

function TextArea(props) {
  return <textarea {...props} className={`input-base rounded-xl px-3 py-2 text-sm outline-none resize-none ${props.className || ''}`} />
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
  const [semanticQuery, setSemanticQuery] = useState('dashboard design')
  const [semanticResults, setSemanticResults] = useState([])
  const [readerId, setReaderId] = useState('')
  const [reader, setReader] = useState(null)
  const [summary, setSummary] = useState(null)
  const [newSmart, setNewSmart] = useState({ name: 'Unread design', query: 'tag:design is:unread', color: '#7c8cff' })
  const [workspaceName, setWorkspaceName] = useState('Team Atlas')
  const [webhookUrl, setWebhookUrl] = useState('https://example.com/webhooks/linkatlas')
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
  }

  useEffect(() => { load() }, [])

  const metrics = useMemo(() => ([
    { label: 'Rules', value: rules.length, icon: Lightning },
    { label: 'Inbox', value: inbox.length, icon: Books },
    { label: 'Highlights', value: highlights.length, icon: Notebook },
    { label: 'Health events', value: health.length, icon: Heartbeat },
  ]), [rules.length, inbox.length, highlights.length, health.length])

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

  return (
    <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="atlas-panel rounded-3xl p-5 overflow-hidden relative">
          <div className="absolute inset-0 pointer-events-none opacity-60" style={{ background: 'radial-gradient(circle at 16% 10%, rgba(124,140,255,0.20), transparent 32%), radial-gradient(circle at 85% 20%, rgba(45,212,191,0.13), transparent 34%)' }} />
          <div className="relative flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div>
              <p className="metadata-line text-xs uppercase tracking-[0.22em]">Productivity Suite</p>
              <h1 className="text-2xl sm:text-3xl font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>Workflow Hub</h1>
              <p className="text-sm max-w-2xl mt-2" style={{ color: 'var(--text-tertiary)' }}>
                Automation rules, smart collections, reader mode, highlights, review inbox, health monitor, semantic search, workspaces, webhooks and public profile.
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
                  <p className="text-sm leading-relaxed">“{item.text}”</p>
                  <p className="metadata-line text-[10px] mt-2 truncate">{item.link_title}</p>
                </div>
              ))}
              {highlights.length === 0 && <EmptyState title="No highlights yet" subtitle="Use the extension context menu to save selected text." />}
            </div>
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Panel title="Semantic Search" icon={MagnifyingGlass}>
            <div className="flex gap-2 mb-3">
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
                  <p className="metadata-line text-[10px] truncate">{new Date(item.checked_at).toLocaleString()}</p>
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
