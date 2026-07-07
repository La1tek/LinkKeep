import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Link as LinkIcon } from '@phosphor-icons/react'
import { api } from '../lib/api'
import EmptyState from '../components/EmptyState'

export default function PublicShare() {
  const { token } = useParams()
  const location = useLocation()
  const shareToken = token || location.pathname.split('/').filter(Boolean)[1]
  const [share, setShare] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getPublicShare(shareToken).then(setShare).catch((err) => setError(err.message))
  }, [shareToken])

  if (error) {
    return <div className="min-h-[100dvh] flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}><EmptyState title="Share unavailable" subtitle={error} /></div>
  }

  return (
    <div className="min-h-[100dvh]" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <header className="px-4 sm:px-8 py-6 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>LinkKeep public collection</p>
          <h1 className="text-2xl font-semibold mt-1">{share?.title || 'Loading...'}</h1>
          {share?.description && <p className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>{share.description}</p>}
          {share?.owner && <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Shared by {share.owner}</p>}
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-8 py-6">
        {!share ? (
          <div className="glass rounded-xl p-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
        ) : share.links.length === 0 ? (
          <EmptyState title="No links" subtitle="This collection is empty" />
        ) : (
          <div className="space-y-2">
            {share.links.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="glass rounded-xl p-4 flex items-start gap-3 surface-hover transition-colors">
                <div className="h-9 w-9 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0"><LinkIcon size={17} className="text-accent-400" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{link.title}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{link.url}</p>
                  {link.description && <p className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>{link.description}</p>}
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
