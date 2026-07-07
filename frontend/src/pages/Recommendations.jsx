import { useEffect, useState } from 'react'
import { Sparkle, Tag, Warning } from '@phosphor-icons/react'
import { api } from '../lib/api'
import { useToast } from '../components/Toast'

export default function Recommendations() {
  const [data, setData] = useState({ autotags: [], stale: [], dead: [] })
  const toast = useToast()
  const refresh = () => api.getRecommendations().then(setData).catch((err) => toast.error(err.message))
  useEffect(() => { refresh() }, [])

  const applyTags = async () => {
    try {
      const result = await api.applyRecommendedTags()
      toast.success(`Updated ${result.updated} links`)
      refresh()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass px-4 sm:px-8 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><Sparkle size={17} />Recommendations</h1>
          <button onClick={applyTags} className="bg-accent-600 text-white px-3 py-2 rounded-lg text-xs">Apply tags</button>
        </div>
      </header>
      <main className="px-4 sm:px-8 py-6 max-w-4xl grid gap-4 lg:grid-cols-3 pb-24 sm:pb-8">
        <Panel title="Autotags" icon={<Tag size={16} />} items={data.autotags} render={(item) => `${item.title} → ${item.suggested_tags.join(', ')}`} />
        <Panel title="Stale links" icon={<Warning size={16} />} items={data.stale} render={(item) => item.title} />
        <Panel title="Dead links" icon={<Warning size={16} />} items={data.dead} render={(item) => `${item.title} (${item.http_status || 'failed'})`} />
      </main>
    </div>
  )
}

function Panel({ title, icon, items, render }) {
  return (
    <section className="glass rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>{icon}<h2 className="text-sm font-semibold">{title}</h2></div>
      <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
        {(items || []).slice(0, 20).map((item) => <div key={`${item.link_id}-${render(item)}`} className="p-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{render(item)}</div>)}
        {(!items || items.length === 0) && <div className="p-3 text-xs" style={{ color: 'var(--text-muted)' }}>No items</div>}
      </div>
    </section>
  )
}
