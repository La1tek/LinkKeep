import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

export function useLinks(token, params = {}) {
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)

  const paramString = JSON.stringify(params)

  const refresh = useCallback(async () => {
    if (!token) { setLinks([]); setLoading(false); return }
    setLoading(true)
    try {
      const data = await api.listLinks(params)
      setLinks(data)
    } catch (e) {
      console.error('Failed to load links:', e)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, paramString])

  useEffect(() => { refresh() }, [refresh])

  const create = async (data) => {
    const link = await api.createLink(data)
    setLinks(prev => [link, ...prev])
    return link
  }

  const update = async (id, data) => {
    const link = await api.updateLink(id, data)
    setLinks(prev => prev.map(l => l.id === id ? link : l))
    return link
  }

  const remove = async (id) => {
    await api.deleteLink(id)
    setLinks(prev => prev.filter(l => l.id !== id))
  }

  const toggleFav = async (id) => {
    const link = await api.toggleFavorite(id)
    setLinks(prev => prev.map(l => l.id === id ? link : l))
    return link
  }

  return { links, loading, refresh, create, update, remove, toggleFav }
}
