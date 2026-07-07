import { create } from 'zustand'
import { api } from '../lib/api'

const TOKEN_KEY = 'lk_token'
const USER_KEY = 'lk_user'

export const useAuth = create((set, get) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null })
    try {
      const { access_token } = await api.login(username, password)
      localStorage.setItem(TOKEN_KEY, access_token)
      const user = await api.me()
      localStorage.setItem(USER_KEY, JSON.stringify(user))
      set({ token: access_token, user, loading: false })
    } catch (e) {
      set({ error: e.message, loading: false })
      throw e
    }
  },

  register: async (username, password) => {
    set({ loading: true, error: null })
    try {
      await api.register(username, password)
      await get().login(username, password)
    } catch (e) {
      set({ error: e.message, loading: false })
      throw e
    }
  },

  logout: async () => {
    try {
      await api.logout()
    } catch {}
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({ token: null, user: null })
  },

  setUser: (user) => {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    set({ user })
  },
}))
