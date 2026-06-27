import { create } from 'zustand'
import { CheckCircle, Warning, X, Info, ArrowUUpLeft } from '@phosphor-icons/react'

let toastId = 0

export const useToast = create((set, get) => ({
  toasts: [],
  show: (message, type = 'info', duration = 3000, action = null) => {
    const id = ++toastId
    set({ toasts: [...get().toasts, { id, message, type, duration, action }] })
    if (duration > 0) setTimeout(() => get().remove(id), duration)
    return id
  },
  success: (msg, d, action) => get().show(msg, 'success', typeof d === 'number' ? d : 3000, action),
  error: (msg, d) => get().show(msg, 'error', d || 4000),
  info: (msg, d) => get().show(msg, 'info', d),
  remove: (id) => set({ toasts: get().toasts.filter(t => t.id !== id) }),
}))

const icons = { success: CheckCircle, error: Warning, info: Info }
const borderColors = {
  success: 'border-emerald-500/20',
  error: 'border-red-500/20',
  info: 'border-accent-500/20',
}

export function ToastContainer() {
  const { toasts, remove } = useToast()
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center w-full px-4 pointer-events-none">
      {toasts.map(t => {
        const Icon = icons[t.type] || Info
        return (
          <div key={t.id} className={`glass border ${borderColors[t.type] || borderColors.info} rounded-xl px-4 py-2.5 flex items-center gap-2.5 max-w-sm animate-slide-up pointer-events-auto shadow-lg`}>
            <Icon size={16} weight="fill" className="shrink-0" style={{ color: t.type === 'success' ? '#34d399' : t.type === 'error' ? '#f87171' : '#818cf8' }} />
            <span className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>{t.message}</span>
            {t.action && (
              <button onClick={() => { t.action.onAction?.(); remove(t.id) }} className="text-xs font-medium text-accent-400 hover:text-accent-300 flex items-center gap-1 shrink-0">
                {t.action.action === 'Undo' && <ArrowUUpLeft size={12} />}{t.action.action}
              </button>
            )}
            <button onClick={() => remove(t.id)} style={{ color: 'var(--text-muted)' }} className="shrink-0"><X size={14} /></button>
          </div>
        )
      })}
    </div>
  )
}
