import { useState, useEffect } from 'react'

const VIEW_MODE_KEY = 'lk_view_mode'

function getInitial() {
  try { return localStorage.getItem(VIEW_MODE_KEY) || 'list' } catch { return 'list' }
}

export function useViewMode() {
  const [mode, setMode] = useState(getInitial)

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, mode)
  }, [mode])

  const toggle = () => setMode(prev => prev === 'list' ? 'grid' : 'list')

  return { mode, setMode, toggle }
}
