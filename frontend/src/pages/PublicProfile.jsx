import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Link as LinkIcon, UserCircle } from '@phosphor-icons/react'
import { api } from '../lib/api'
import EmptyState from '../components/EmptyState'

export default function PublicProfile() {
  const { username } = useParams()
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getPublicProfile(username).then(setProfile).catch((err) => setError(err.message))
  }, [username])

  if (error) {
    return <div className="min-h-[100dvh] flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}><EmptyState title="Profile unavailable" subtitle={error} /></div>
  }

  return (
    <div className="min-h-[100dvh]" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <header className="px-4 sm:px-8 py-8 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-accent-600/15 border border-accent-500/20 flex items-center justify-center">
            <UserCircle size={30} className="text-accent-400" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>LinkAtlas public profile</p>
            <h1 className="text-2xl font-semibold mt-1">{profile?.username || username}</h1>
            {profile?.created_at && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Member since {new Date(profile.created_at).toLocaleDateString()}</p>}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-8 py-6">
        {!profile ? (
          <div className="glass rounded-xl p-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
        ) : profile.shares.length === 0 ? (
          <EmptyState title="No public collections" subtitle="This profile has no public collections yet." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {profile.shares.map((share) => (
              <Link key={share.id} to={`/share/${share.token}`} className="glass rounded-2xl p-4 surface-hover transition-colors">
                <div className="h-10 w-10 rounded-xl bg-accent-500/10 flex items-center justify-center mb-3">
                  <LinkIcon size={18} className="text-accent-400" />
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{share.title}</p>
                {share.description && <p className="text-xs mt-2 line-clamp-2" style={{ color: 'var(--text-tertiary)' }}>{share.description}</p>}
                <p className="text-[10px] mt-3" style={{ color: 'var(--text-muted)' }}>{share.role} · {new Date(share.created_at).toLocaleDateString()}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
