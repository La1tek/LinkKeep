import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

export function useTabs(token) {
  const [tabs, setTabs] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await api.listTabs()
      setTabs(data)
    } catch (e) {
      console.error('Failed to load tabs:', e)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { refresh() }, [refresh])

  const create = async (data) => {
    const tab = await api.createTab(data)
    setTabs(prev => [...prev, tab])
    return tab
  }

  const update = async (id, data) => {
    const tab = await api.updateTab(id, data)
    setTabs(prev => prev.map(t => t.id === id ? tab : t))
    return tab
  }

  const remove = async (id) => {
    await api.deleteTab(id)
    setTabs(prev => prev.filter(t => t.id !== id))
  }

  return { tabs, loading, refresh, create, update, remove }
}
