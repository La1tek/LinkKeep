import { useEffect, useState } from 'react'
import { DownloadSimple } from '@phosphor-icons/react'

export default function InstallPrompt() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault()
      setPromptEvent(event)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!promptEvent) return
    promptEvent.prompt()
    await promptEvent.userChoice.catch(() => null)
    setPromptEvent(null)
  }

  return (
    <div className="glass rounded-2xl p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center">
        <DownloadSimple size={20} className="text-accent-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Install LinkKeep</p>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {installed ? 'Installed on this device' : promptEvent ? 'Add LinkKeep as an offline-capable app' : 'Available from your browser install menu'}
        </p>
      </div>
      <button onClick={install} disabled={!promptEvent} className="text-xs text-accent-400 px-3 py-1.5 rounded-lg hover:bg-accent-500/10 disabled:opacity-40 disabled:cursor-not-allowed">
        Install
      </button>
    </div>
  )
}
