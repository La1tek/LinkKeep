import { useEffect, useState } from 'react'
import { ShieldCheck } from '@phosphor-icons/react'
import { api } from '../lib/api'

export default function Admin() {
  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState([])
  const [jobs, setJobs] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.adminOverview(), api.adminUsers(), api.adminJobs()])
      .then(([o, u, j]) => { setOverview(o); setUsers(u.users || []); setJobs(j.jobs || []) })
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass px-4 sm:px-8 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <h1 className="text-base font-semibold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><ShieldCheck size={17} />Admin</h1>
      </header>
      <main className="px-4 sm:px-8 py-6 max-w-5xl space-y-4 pb-24 sm:pb-8">
        {error && <div className="glass rounded-xl p-4 text-sm text-red-400">{error}</div>}
        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries({ users: overview.users, links: overview.links, tabs: overview.tabs, snapshots: overview.snapshots, sessions: overview.sessions }).map(([label, value]) => (
              <div key={label} className="glass rounded-xl p-4"><p className="text-xs uppercase" style={{ color: 'var(--text-muted)' }}>{label}</p><p className="text-2xl font-semibold">{value}</p></div>
            ))}
          </div>
        )}
        <section className="glass rounded-xl overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold border-b" style={{ borderColor: 'var(--border-subtle)' }}>Users</h2>
          {users.map((user) => <div key={user.id} className="px-4 py-3 text-sm flex justify-between border-b" style={{ borderColor: 'var(--border-subtle)' }}><span>{user.username}</span><span style={{ color: 'var(--text-muted)' }}>{user.links} links</span></div>)}
        </section>
        <section className="glass rounded-xl overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-semibold border-b" style={{ borderColor: 'var(--border-subtle)' }}>Recent jobs</h2>
          {jobs.map((job) => <div key={job.id} className="px-4 py-3 text-xs flex justify-between border-b" style={{ borderColor: 'var(--border-subtle)' }}><span>{job.type}</span><span>{job.status}</span></div>)}
        </section>
      </main>
    </div>
  )
}
