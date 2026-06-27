const API_URL = '/api'

function getToken() {
  return localStorage.getItem('lk_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(options.body)
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (res.status === 204) return null
  if (res.status === 401) {
    localStorage.removeItem('lk_token')
    localStorage.removeItem('lk_user')
    window.dispatchEvent(new CustomEvent('auth-expired'))
    return null
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.detail || 'Request failed')
  return data
}

export const api = {
  // Auth
  register: (username, password) =>
    request('/auth/register', { method: 'POST', body: { username, password } }),
  login: (username, password) => {
    const form = new FormData()
    form.append('username', username)
    form.append('password', password)
    return request('/auth/login', { method: 'POST', body: form })
  },
  me: () => request('/auth/me'),

  // Tabs
  listTabs: () => request('/tabs'),
  createTab: (data) => request('/tabs', { method: 'POST', body: data }),
  updateTab: (id, data) => request(`/tabs/${id}`, { method: 'PUT', body: data }),
  deleteTab: (id) => request(`/tabs/${id}`, { method: 'DELETE' }),

  // Links
  listLinks: (params = {}) => {
    const q = new URLSearchParams()
    if (params.tab_id != null) q.set('tab_id', params.tab_id)
    if (params.favorite != null) q.set('favorite', params.favorite)
    if (params.q) q.set('q', params.q)
    const qs = q.toString()
    return request(`/links${qs ? `?${qs}` : ''}`)
  },
  createLink: (data) => request('/links', { method: 'POST', body: data }),
  updateLink: (id, data) => request(`/links/${id}`, { method: 'PUT', body: data }),
  deleteLink: (id) => request(`/links/${id}`, { method: 'DELETE' }),
  toggleFavorite: (id) => request(`/links/${id}/toggle-favorite`, { method: 'POST' }),

  // Metadata
  fetchMetadata: (url) => request('/metadata', { method: 'POST', body: { url } }),

  // Stats
  getStats: () => request('/stats'),
}
