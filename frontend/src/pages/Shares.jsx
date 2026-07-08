import { useEffect, useState } from 'react'
import { ChatCircle, Link as LinkIcon, PaperPlaneTilt, Trash, Plus, UserPlus } from '@phosphor-icons/react'
import { api } from '../lib/api'
import { useTabStore } from '../hooks/useTabStore'
import { useToast } from '../components/Toast'

export default function Shares() {
  const { tabs } = useTabStore()
  const toast = useToast()
  const [shares, setShares] = useState([])
  const [title, setTitle] = useState('My LinkAtlas Collection')
  const [tabId, setTabId] = useState('')
  const [role, setRole] = useState('viewer')
  const [publicProfile, setPublicProfile] = useState(false)
  const [activeShare, setActiveShare] = useState(null)
  const [comments, setComments] = useState([])
  const [commentBody, setCommentBody] = useState('')
  const [inviteTarget, setInviteTarget] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')

  const refresh = () => api.listShares().then((data) => setShares(data.shares || [])).catch((err) => toast.error(err.message))
  useEffect(() => { refresh() }, [])

  const create = async () => {
    try {
      await api.createShare({ title, tab_id: tabId ? Number(tabId) : null, role, public_profile: publicProfile })
      setTitle('My LinkAtlas Collection'); setTabId(''); setRole('viewer'); setPublicProfile(false); refresh(); toast.success('Share created')
    } catch (err) { toast.error(err.message) }
  }

  const remove = async (share) => {
    try { await api.deleteShare(share.id); setShares((items) => items.filter((item) => item.id !== share.id)); toast.success('Share removed') }
    catch (err) { toast.error(err.message) }
  }

  const openManage = async (share) => {
    setActiveShare(share)
    setInviteTarget('')
    setCommentBody('')
    try {
      const data = await api.listShareComments(share.id)
      setComments(data.comments || [])
    } catch (err) {
      toast.error(err.message)
    }
  }

  const createInvite = async () => {
    if (!activeShare || !inviteTarget.trim()) return
    const value = inviteTarget.trim()
    try {
      const invite = await api.createShareInvite(activeShare.id, {
        role: inviteRole,
        email: value.includes('@') ? value : undefined,
        username: value.includes('@') ? undefined : value,
      })
      const inviteLink = `${window.location.origin}/share/${activeShare.token}?invite=${invite.token}`
      await navigator.clipboard?.writeText(inviteLink)
      setInviteTarget('')
      toast.success('Invite created and copied')
    } catch (err) { toast.error(err.message) }
  }

  const createComment = async () => {
    if (!activeShare || !commentBody.trim()) return
    try {
      const comment = await api.createShareComment(activeShare.id, { body: commentBody.trim() })
      setComments((items) => [comment, ...items])
      setCommentBody('')
      toast.success('Comment added')
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="flex-1 min-h-[100dvh]">
      <header className="sticky top-0 z-30 glass px-4 sm:px-8 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <h1 className="text-base font-semibold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><LinkIcon size={17} />Shared Collections</h1>
      </header>
      <main className="px-4 sm:px-8 py-6 max-w-3xl space-y-4 pb-24 sm:pb-8">
        <div className="glass rounded-xl p-4 grid gap-3 sm:grid-cols-[1fr_180px_130px_auto]">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-base rounded-lg px-3 py-2 text-sm outline-none" aria-label="Share title" />
          <select value={tabId} onChange={(e) => setTabId(e.target.value)} className="input-base rounded-lg px-3 py-2 text-sm outline-none" aria-label="Shared folder">
            <option value="">All links</option>
            {(tabs || []).map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="input-base rounded-lg px-3 py-2 text-sm outline-none" aria-label="Default share role">
            <option value="viewer">Viewer</option>
            <option value="commenter">Commenter</option>
            <option value="editor">Editor</option>
          </select>
          <button onClick={create} className="bg-accent-600 text-white rounded-lg px-3 py-2 text-sm flex items-center justify-center gap-2"><Plus size={15} />Create</button>
          <label className="sm:col-span-4 inline-flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>
            <input type="checkbox" checked={publicProfile} onChange={(e) => setPublicProfile(e.target.checked)} />
            Show this collection on public profile
          </label>
        </div>
        <div className="glass rounded-xl divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {shares.map((share) => {
            const url = `${window.location.origin}/share/${share.token}`
            return (
              <div key={share.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{share.title}</p>
                  <a href={url} target="_blank" rel="noreferrer" className="text-xs truncate block text-accent-400">{url}</a>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{share.role} role{share.public_profile ? ' · public profile' : ''}</p>
                </div>
                <button onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Copied'))} className="text-xs text-accent-400 px-2 py-1 rounded-lg hover:bg-accent-500/10">Copy</button>
                <button onClick={() => openManage(share)} className="text-xs text-accent-400 px-2 py-1 rounded-lg hover:bg-accent-500/10">Manage</button>
                <button onClick={() => remove(share)} className="p-2 rounded-lg hover:bg-red-500/10 text-red-400" aria-label="Delete share"><Trash size={15} /></button>
              </div>
            )
          })}
          {shares.length === 0 && <div className="p-4 text-sm" style={{ color: 'var(--text-tertiary)' }}>No shared collections yet.</div>}
        </div>

        {activeShare && (
          <div className="glass rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{activeShare.title}</p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Invites and comments</p>
              </div>
              <button onClick={() => setActiveShare(null)} className="text-xs px-2 py-1 rounded-lg surface-hover" style={{ color: 'var(--text-muted)' }}>Close</button>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
              <input value={inviteTarget} onChange={(e) => setInviteTarget(e.target.value)} placeholder="email or username" className="input-base rounded-lg px-3 py-2 text-sm outline-none" />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="input-base rounded-lg px-3 py-2 text-sm outline-none">
                <option value="viewer">Viewer</option>
                <option value="commenter">Commenter</option>
                <option value="editor">Editor</option>
              </select>
              <button onClick={createInvite} className="bg-accent-600 text-white rounded-lg px-3 py-2 text-sm flex items-center justify-center gap-2"><UserPlus size={15} />Invite</button>
            </div>

            <div className="space-y-2">
              <textarea value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Add a comment..." className="input-base w-full rounded-xl px-3 py-2 text-sm outline-none resize-none" rows={2} />
              <button onClick={createComment} className="text-xs text-accent-400 px-2 py-1 rounded-lg hover:bg-accent-500/10 inline-flex items-center gap-1"><PaperPlaneTilt size={13} />Comment</button>
              <div className="space-y-2">
                {comments.map((comment) => (
                  <div key={comment.id} className="surface rounded-xl p-3">
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{comment.body}</p>
                    <p className="text-[10px] mt-1 inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><ChatCircle size={10} />{comment.author_name} · {new Date(comment.created_at).toLocaleString()}</p>
                  </div>
                ))}
                {comments.length === 0 && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No comments yet.</p>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
