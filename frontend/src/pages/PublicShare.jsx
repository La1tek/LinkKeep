import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { ChatCircle, Link as LinkIcon, PushPin, UserCircle } from '@phosphor-icons/react'
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
    <div className="min-h-[100dvh]" style={{ background: 'linear-gradient(180deg, var(--bg-primary), var(--bg-secondary))', color: 'var(--text-primary)' }}>
      <header className="px-4 sm:px-8 py-8 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-9 w-9 rounded-xl bg-accent-600 text-white flex items-center justify-center"><LinkIcon size={17} weight="bold" /></div>
            <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>LinkAtlas public collection</p>
          </div>
          <h1 className="text-3xl font-semibold mt-1">{share?.title || 'Loading...'}</h1>
          {share?.description && <p className="text-sm mt-3 max-w-2xl leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>{share.description}</p>}
          {share?.owner && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="inline-flex items-center gap-1"><UserCircle size={14} /> Shared by {share.owner}</span>
              <a href={`/profile/${share.owner}`} className="text-accent-400 hover:text-accent-300">Public profile</a>
              {share.role && <span className="surface rounded-full px-2 py-0.5 capitalize">{share.role}</span>}
            </div>
          )}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-6">
        {!share ? (
          <div className="glass rounded-xl p-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
        ) : share.links.length === 0 ? (
          <EmptyState title="No links" subtitle="This collection is empty" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {share.links.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className="glass rounded-2xl p-4 flex items-start gap-3 surface-hover transition-colors relative overflow-hidden">
                {link.is_pinned && <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-accent-600 text-white flex items-center justify-center"><PushPin size={10} weight="fill" /></div>}
                <div className="h-10 w-10 rounded-xl bg-accent-500/10 flex items-center justify-center shrink-0 overflow-hidden">
                  {link.favicon ? <img src={link.favicon} alt="" className="h-6 w-6 object-contain" /> : <LinkIcon size={17} className="text-accent-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{link.title}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{link.url}</p>
                  {link.description && <p className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>{link.description}</p>}
                  {link.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {link.tags.slice(0, 4).map((tag) => <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full surface" style={{ color: 'var(--text-tertiary)' }}>{tag}</span>)}
                    </div>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
        {share?.comments?.length > 0 && (
          <section className="mt-8">
            <h2 className="text-xs font-medium uppercase tracking-wider mb-3 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}><ChatCircle size={13} /> Comments</h2>
            <div className="space-y-2">
              {share.comments.map((comment) => (
                <div key={comment.id} className="glass rounded-2xl p-4">
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{comment.body}</p>
                  <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>{comment.author_name} · {new Date(comment.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
