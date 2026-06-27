import { create } from 'zustand'
import { api } from '../lib/api'

export const useTabStore = create((set, get) => ({
  tabs: [],
  loading: true,

  refresh: async () => {
    const token = localStorage.getItem('lk_token')
    if (!token) { set({ tabs: [], loading: false }); return }
    set({ loading: true })
    try {
      const data = await api.listTabs()
      set({ tabs: data || [], loading: false })
    } catch {
      set({ loading: false })
    }
  },

  create: async (data) => {
    const tab = await api.createTab(data)
    set({ tabs: [...get().tabs, tab] })
    return tab
  },

  update: async (id, data) => {
    const tab = await api.updateTab(id, data)
    set({ tabs: get().tabs.map(t => t.id === id ? tab : t) })
    return tab
  },

  remove: async (id) => {
    await api.deleteTab(id)
    set({ tabs: get().tabs.filter(t => t.id !== id) })
  },
}))
