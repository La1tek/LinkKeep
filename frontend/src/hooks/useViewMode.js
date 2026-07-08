import { useState, useEffect } from 'react'

const VIEW_MODE_KEY = 'lk_view_mode'

function getKey(scope) {
  return scope ? `${VIEW_MODE_KEY}:${scope}` : VIEW_MODE_KEY
}

function getInitial(scope) {
  try { return localStorage.getItem(getKey(scope)) || localStorage.getItem(VIEW_MODE_KEY) || 'list' } catch { return 'list' }
}

export function useViewMode(scope = '') {
  const [mode, setMode] = useState(() => getInitial(scope))

  useEffect(() => {
    setMode(getInitial(scope))
  }, [scope])

  useEffect(() => {
    localStorage.setItem(getKey(scope), mode)
  }, [mode, scope])

  const toggle = () => setMode(prev => prev === 'list' ? 'grid' : 'list')

  return { mode, setMode, toggle }
}
