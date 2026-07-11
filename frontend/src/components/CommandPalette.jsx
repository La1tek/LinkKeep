import { useEffect, useRef, useState } from 'react'
import { Lightning, MagnifyingGlass, X } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useToast } from './Toast'

export default function CommandPalette() {
  const navigate = useNavigate()
  const toast = useToast()
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [commands, setCommands] = useState([])
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    const handler = (event) => {
      const key = event.key?.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    let cancelled = false
    const timer = setTimeout(() => {
      api.listCommands(query).then((data) => {
        if (!cancelled) {
          setCommands(data.commands || [])
          setSelected(0)
        }
      }).catch(() => {
        if (!cancelled) setCommands([])
      })
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, query])

  const run = async (command) => {
    if (!command) return
    if (command.id === 'new-link') {
      const defaultUrl = /^https?:\/\//i.test(query.trim()) ? query.trim() : ''
      const url = window.prompt('URL to save', defaultUrl)
      if (!url) return
      try {
        await api.runCommand({ command: command.id, payload: { url } })
        toast.success('Link saved')
        navigate('/folder/all')
        setOpen(false)
      } catch (err) {
        toast.error(err.message)
      }
      return
    }
    if (command.route) {
      navigate(command.route)
      setOpen(false)
      return
    }
    try {
      await api.runCommand({ command: command.id, payload: {} })
      toast.success(command.id === 'rebuild-embeddings' ? 'Embeddings rebuilt' : 'Command queued')
      setOpen(false)
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center px-3 pt-[12vh] bg-black/45 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="atlas-panel w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <MagnifyingGlass size={18} className="text-accent-300 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelected((value) => Math.min(value + 1, commands.length - 1))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelected((value) => Math.max(value - 1, 0))
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                run(commands[selected])
              }
            }}
            className="flex-1 bg-transparent outline-none text-sm"
            placeholder="Search commands, folders, tags..."
            aria-label="Command search"
          />
          <button type="button" onClick={() => setOpen(false)} className="h-9 w-9 rounded-xl glass surface-hover flex items-center justify-center" aria-label="Close command palette">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {commands.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No commands found</div>
          ) : commands.map((command, index) => (
            <button
              key={command.id}
              type="button"
              onClick={() => run(command)}
              className={`w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all ${index === selected ? 'bg-accent-500/15' : 'surface-hover'}`}
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="h-9 w-9 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center shrink-0">
                <Lightning size={16} className="text-accent-300" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{command.label}</span>
                <span className="metadata-line block text-[10px] truncate">{command.hint}</span>
              </span>
              <span className="metadata-line text-[10px]">{command.type}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t metadata-line text-[10px] flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <span>↑↓ navigate · enter select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
