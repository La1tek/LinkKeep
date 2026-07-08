import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowSquareOut, Globe, Link as LinkIcon, MapPin, Sparkle, UserCircle } from '@phosphor-icons/react'
import { api } from '../lib/api'
import EmptyState from '../components/EmptyState'
import BrandIcon from '../components/BrandIcon'

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

  const accent = profile?.accent || '#7c8cff'

  return (
    <div className="cosmos-shell min-h-[100dvh]" style={{ color: 'var(--text-primary)' }}>
      <div className="animated-sky" aria-hidden="true">
        <span className="comet comet-one" />
        <span className="comet comet-two" />
      </div>

      <main className="relative max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <nav className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandIcon className="h-10 w-10" />
            <div>
              <p className="text-sm font-semibold">LinkAtlas</p>
              <p className="metadata-line text-[10px]">public constellation</p>
            </div>
          </div>
          <Link to="/" className="glass rounded-full px-4 py-2 text-xs surface-hover" style={{ color: 'var(--text-secondary)' }}>Open app</Link>
        </nav>

        {!profile ? (
          <div className="atlas-panel rounded-3xl p-6 mt-8 text-sm" style={{ color: 'var(--text-tertiary)' }}>Loading profile...</div>
        ) : (
          <>
            <section className="mt-8 atlas-panel rounded-[28px] overflow-hidden relative">
              <div className="absolute inset-0 opacity-80" style={{ background: `radial-gradient(circle at 18% 18%, ${accent}55, transparent 34%), radial-gradient(circle at 82% 12%, rgba(45,212,191,0.20), transparent 32%)` }} />
              <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 p-6 sm:p-8">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-2 glass rounded-full px-3 py-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <Sparkle size={13} className="text-accent-300" />
                    LinkAtlas public profile
                  </div>
                  <div className="flex items-center gap-4 mt-8">
                    <div className="h-20 w-20 rounded-3xl border flex items-center justify-center shrink-0" style={{ borderColor: `${accent}66`, background: `${accent}18` }}>
                      <UserCircle size={42} style={{ color: accent }} />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-3xl sm:text-5xl font-semibold tracking-normal truncate">{profile.display_name || profile.username}</h1>
                      <p className="text-base sm:text-lg mt-2" style={{ color: 'var(--text-tertiary)' }}>{profile.headline}</p>
                    </div>
                  </div>
                  {profile.bio && <p className="text-sm sm:text-base leading-relaxed max-w-2xl mt-6" style={{ color: 'var(--text-secondary)' }}>{profile.bio}</p>}
                  <div className="flex flex-wrap items-center gap-3 mt-6">
                    {profile.location && <span className="glass rounded-full px-3 py-1.5 text-xs inline-flex items-center gap-1.5"><MapPin size={13} />{profile.location}</span>}
                    {profile.website && <a href={profile.website} target="_blank" rel="noreferrer" className="glass rounded-full px-3 py-1.5 text-xs inline-flex items-center gap-1.5 surface-hover"><Globe size={13} />Website</a>}
                    <span className="glass rounded-full px-3 py-1.5 text-xs">@{profile.username}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                  <div className="glass rounded-2xl p-4">
                    <p className="metadata-line text-[10px] uppercase tracking-[0.16em]">Public collections</p>
                    <p className="text-3xl font-semibold mt-2 tabular-nums">{profile.stats?.public_collections || profile.shares.length}</p>
                  </div>
                  <div className="glass rounded-2xl p-4">
                    <p className="metadata-line text-[10px] uppercase tracking-[0.16em]">Saved links</p>
                    <p className="text-3xl font-semibold mt-2 tabular-nums">{profile.stats?.saved_links || 0}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-6">
              <div className="flex items-end justify-between gap-4 mb-4">
                <div>
                  <p className="metadata-line text-xs uppercase tracking-[0.18em]">Shared atlas</p>
                  <h2 className="text-xl font-semibold mt-1">Public collections</h2>
                </div>
              </div>

              {profile.shares.length === 0 ? (
                <div className="atlas-panel rounded-3xl p-6">
                  <EmptyState title="No public collections" subtitle="This profile has no public collections yet." />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {profile.shares.map((share, index) => (
                    <Link key={share.id} to={`/share/${share.token}`} className="atlas-panel rounded-3xl p-5 surface-hover transition-all group min-h-[190px] flex flex-col">
                      <div className="flex items-center justify-between gap-3">
                        <div className="h-11 w-11 rounded-2xl flex items-center justify-center" style={{ background: index % 2 ? 'rgba(45,212,191,0.10)' : `${accent}18`, color: index % 2 ? 'var(--accent-mint)' : accent }}>
                          <LinkIcon size={19} />
                        </div>
                        <ArrowSquareOut size={16} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-base font-semibold mt-5" style={{ color: 'var(--text-primary)' }}>{share.title}</p>
                      {share.description && <p className="text-sm mt-2 line-clamp-3 flex-1" style={{ color: 'var(--text-tertiary)' }}>{share.description}</p>}
                      <p className="metadata-line text-[10px] mt-4">{share.role} · {new Date(share.created_at).toLocaleDateString()}</p>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
