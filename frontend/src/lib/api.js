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

  // Full-text search
  fulltextSearch: (params = {}) => {
    const q = new URLSearchParams()
    if (params.q) q.set('q', params.q)
    if (params.tag) q.set('tag', params.tag)
    if (params.favorite != null) q.set('favorite', params.favorite)
    if (params.dead != null) q.set('dead', params.dead)
    return request(`/search/fulltext?${q.toString()}`)
  },
  reindexSearch: () => request('/search/reindex', { method: 'POST' }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  listSessions: () => request('/auth/sessions'),
  revokeSession: (id) => request(`/auth/sessions/${id}`, { method: 'DELETE' }),

  // Tabs
  listTabs: () => request('/tabs'),
  createTab: (data) => request('/tabs', { method: 'POST', body: data }),
  updateTab: (id, data) => request(`/tabs/${id}`, { method: 'PUT', body: data }),
  deleteTab: (id, keepLinks = false) => request(`/tabs/${id}?keep_links=${keepLinks}`, { method: 'DELETE' }),
  reorderTabs: (items) => request('/tabs/reorder', { method: 'POST', body: items }),

  // Links
  listLinks: (params = {}) => {
    const q = new URLSearchParams()
    if (params.tab_id != null) q.set('tab_id', params.tab_id)
    if (params.favorite != null) q.set('favorite', params.favorite)
    if (params.pinned != null) q.set('pinned', params.pinned)
    if (params.ungrouped) q.set('ungrouped', 'true')
    if (params.q) q.set('q', params.q)
    const qs = q.toString()
    return request(`/links${qs ? `?${qs}` : ''}`)
  },
  createLink: (data) => request('/links', { method: 'POST', body: data }),
  updateLink: (id, data) => request(`/links/${id}`, { method: 'PUT', body: data }),
  deleteLink: (id) => request(`/links/${id}`, { method: 'DELETE' }),
  toggleFavorite: (id) => request(`/links/${id}/toggle-favorite`, { method: 'POST' }),
  togglePin: (id) => request(`/links/${id}/toggle-pin`, { method: 'POST' }),
  reorderLinks: (items) => request('/links/reorder', { method: 'POST', body: items }),
  bulkAction: (linkIds, action, tabId = null) =>
    request('/links/bulk', { method: 'POST', body: { link_ids: linkIds, action, tab_id: tabId } }),

  // Metadata
  fetchMetadata: (url) => request('/metadata', { method: 'POST', body: { url } }),

  // Stats
  getStats: () => request('/stats'),

  // Settings
  changePassword: (currentPassword, newPassword) =>
    request('/settings/password', { method: 'PUT', body: { current_password: currentPassword, new_password: newPassword } }),
  changeUsername: (newUsername) =>
    request('/settings/username', { method: 'PUT', body: { new_username: newUsername } }),
  exportData: () => request('/settings/export'),
  backupData: () => request('/settings/backup'),
  importData: (data, mode = 'merge') => request(`/settings/import?mode=${encodeURIComponent(mode)}`, { method: 'POST', body: data }),
  restoreData: (data, mode = 'replace') => request(`/settings/restore?mode=${encodeURIComponent(mode)}`, { method: 'POST', body: data }),
  deleteAccount: () => request('/settings/account', { method: 'DELETE' }),
  createBotToken: () => request('/settings/bot-token', { method: 'POST' }),
  importFile: (file, source, mode = 'merge') => {
    const form = new FormData()
    form.append('file', file)
    return request(`/settings/import-file?source=${encodeURIComponent(source)}&mode=${encodeURIComponent(mode)}`, { method: 'POST', body: form })
  },
  listSnapshots: () => request('/settings/snapshots'),
  createSnapshot: (name = null) => request('/settings/snapshots', { method: 'POST', body: { name } }),
  restoreSnapshot: (id, mode = 'replace') => request(`/settings/snapshots/${id}/restore?mode=${encodeURIComponent(mode)}`, { method: 'POST' }),
  deleteSnapshot: (id) => request(`/settings/snapshots/${id}`, { method: 'DELETE' }),

  // Jobs
  listJobs: () => request('/jobs'),
  createJob: (type, payload = {}, runNow = false) => request('/jobs', { method: 'POST', body: { type, payload, run_now: runNow } }),

  // Shares
  listShares: () => request('/shares'),
  createShare: (data) => request('/shares', { method: 'POST', body: data }),
  deleteShare: (id) => request(`/shares/${id}`, { method: 'DELETE' }),
  getPublicShare: (token) => request(`/public/shares/${token}`),

  // Recommendations
  getRecommendations: () => request('/recommendations'),
  applyRecommendedTags: () => request('/recommendations/apply-tags', { method: 'POST' }),

  // Admin
  adminOverview: () => request('/admin/overview'),
  adminUsers: () => request('/admin/users'),
  adminJobs: () => request('/admin/jobs'),

  // Tags
  listTags: () => request('/tags'),
  renameTag: (tag, newName) => request(`/tags/${encodeURIComponent(tag)}`, { method: 'PUT', body: { new_name: newName } }),
  deleteTag: (tag) => request(`/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' }),

  // Duplicates
  findDuplicates: () => request('/links/duplicates'),
  mergeDuplicates: (targetId, sourceIds) =>
    request('/links/duplicates/merge', { method: 'POST', body: { target_id: targetId, source_ids: sourceIds } }),

  // Health
  checkHealth: (tabId) => {
    const q = tabId ? `?tab_id=${tabId}` : ''
    return request(`/links/check-health${q}`, { method: 'POST' })
  },
  getDeadLinks: () => request('/links/dead'),

  // Reader
  fetchContent: (linkId) => request(`/links/${linkId}/fetch-content`, { method: 'POST' }),
}
