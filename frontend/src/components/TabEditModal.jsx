import { useState, useEffect } from 'react'
import { Trash, FolderSimple } from '@phosphor-icons/react'
import { api } from '../lib/api'
import { useToast } from './Toast'
import { openConfirm } from './ConfirmModal'

const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444']
const ICONS = [
  { name: 'FolderSimple', label: 'Folder' },
  { name: 'BookmarkSimple', label: 'Bookmark' },
  { name: 'Briefcase', label: 'Work' },
  { name: 'Code', label: 'Code' },
  { name: 'BookOpen', label: 'Read' },
  { name: 'ShoppingCart', label: 'Shop' },
  { name: 'MusicNote', label: 'Music' },
  { name: 'GameController', label: 'Games' },
]

export default function TabEditModal({ tab, onClose, onSave, onDelete, allTabs }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [icon, setIcon] = useState('FolderSimple')
  const [parentId, setParentId] = useState(null)
  const toast = useToast()

  useEffect(() => {
    if (tab) {
      setName(tab.name || '')
      setColor(tab.color || '#6366f1')
      setIcon(tab.icon || 'FolderSimple')
      setParentId(tab.parent_id || null)
    }
  }, [tab])

  if (!tab) return null

  const handleSave = () => {
    if (!name.trim()) { toast.error('Name required'); return }
    onSave({ name: name.trim(), color, icon, parent_id: parentId })
  }

  // Other tabs that can be a parent (exclude self and children to prevent circular refs)
  const availableParents = (allTabs || []).filter(t => t.id !== tab.id)
  const currentParent = availableParents.find(t => t.id === parentId)

  const handleDelete = async () => {
    if (tab.link_count > 0) {
      const result = await openConfirm({
        title: `Delete "${tab.name}"?`,
        message: `This tab has ${tab.link_count} ${tab.link_count === 1 ? 'link' : 'links'}.`,
        threeWay: true,
      })
      if (!result) return
      const keepLinks = result === 'keep_links'
      await api.deleteTab(tab.id, keepLinks)
      onDelete?.(tab)
      toast.success(keepLinks ? 'Tab deleted, links kept' : 'Tab and links deleted')
    } else {
      const ok = await openConfirm({ title: `Delete "${tab.name}"?`, danger: true })
      if (!ok) return
      await api.deleteTab(tab.id, false)
      onDelete?.(tab)
      toast.success('Tab deleted')
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="glass rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Edit Group</h3>

        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name..." className="input-base w-full rounded-xl px-4 py-2.5 text-sm outline-none mb-4" onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }} />

        <label className="text-[10px] font-medium uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>Color</label>
        <div className="flex items-center gap-2 mb-4">
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)} className={`h-6 w-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white/20' : ''}`} style={{ backgroundColor: c }} />
          ))}
        </div>

        <label className="text-[10px] font-medium uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>Icon</label>
        <div className="grid grid-cols-4 gap-2 mb-6">
          {ICONS.map(ic => (
            <button key={ic.name} type="button" onClick={() => setIcon(ic.name)}
              className={`flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] transition-all ${icon === ic.name ? 'glass ring-2 ring-accent-500/30' : ''}`}
              style={{ color: icon === ic.name ? '#818cf8' : 'var(--text-muted)' }}>
              <FolderSimple size={16} />
              {ic.label}
            </button>
          ))}
        </div>

        {/* Parent folder selector */}
        <label className="text-[10px] font-medium uppercase tracking-wider block mb-2" style={{ color: 'var(--text-muted)' }}>Parent Folder</label>
        <select
          value={parentId || ''}
          onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
          className="input-base w-full rounded-xl px-4 py-2.5 text-sm outline-none mb-6 cursor-pointer"
        >
          <option value="">None (root level)</option>
          {availableParents.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={!name.trim()} className="flex-1 bg-accent-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all">Save</button>
          <button onClick={handleDelete} className="glass px-4 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-all flex items-center gap-1.5"><Trash size={14} /> Delete</button>
          <button onClick={onClose} className="glass px-4 py-2.5 rounded-xl text-sm surface-hover" style={{ color: 'var(--text-secondary)' }}>Close</button>
        </div>
      </div>
    </div>
  )
}
