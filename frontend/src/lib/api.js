const API_URL = '/api'
const FOLDER_UNLOCKS_KEY = 'lk_folder_unlocks'

function getToken() {
  return localStorage.getItem('lk_token')
}

function readFolderUnlocks() {
  try {
    const raw = sessionStorage.getItem(FOLDER_UNLOCKS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeFolderUnlocks(data) {
  sessionStorage.setItem(FOLDER_UNLOCKS_KEY, JSON.stringify(data || {}))
}

function getFolderUnlockTokens() {
  const now = Date.now()
  const data = readFolderUnlocks()
  let changed = false
  const tokens = []

  Object.entries(data).forEach(([tabId, value]) => {
    if (!value?.token) {
      delete data[tabId]
      changed = true
      return
    }
    if (value.expires_at && new Date(value.expires_at).getTime() <= now) {
      delete data[tabId]
      changed = true
      return
    }
    tokens.push(value.token)
  })

  if (changed) writeFolderUnlocks(data)
  return tokens
}

function saveFolderUnlock(tabId, token, expiresAt) {
  if (!tabId || !token) return
  const data = readFolderUnlocks()
  data[String(tabId)] = { token, expires_at: expiresAt }
  writeFolderUnlocks(data)
}

function clearFolderUnlock(tabId) {
  const data = readFolderUnlocks()
  delete data[String(tabId)]
  writeFolderUnlocks(data)
}

function formatApiError(data) {
  const detail = data?.detail
  if (!detail) return 'Request failed'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === 'string') return item
      const field = Array.isArray(item.loc) ? item.loc.filter((part) => part !== 'body').join('.') : ''
      return [field, item.msg].filter(Boolean).join(': ')
    }).filter(Boolean).join('; ') || 'Request failed'
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.message || JSON.stringify(detail)
  }
  return String(detail)
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { ...options.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const folderUnlocks = getFolderUnlockTokens()
  if (folderUnlocks.length && options.folderUnlocks !== false) {
    headers['X-LinkKeep-Folder-Unlocks'] = folderUnlocks.join(',')
  }
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
  if (!res.ok) throw new Error(formatApiError(data))
  return data
}

export const api = {
  getFolderUnlocks: readFolderUnlocks,
  saveFolderUnlock,
  clearFolderUnlock,

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
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') q.set(key, value)
    })
    return request(`/search/fulltext?${q.toString()}`)
  },
  reindexSearch: () => request('/search/reindex', { method: 'POST' }),
  listSavedSearches: () => request('/search/saved'),
  createSavedSearch: (data) => request('/search/saved', { method: 'POST', body: data }),
  deleteSavedSearch: (id) => request(`/search/saved/${id}`, { method: 'DELETE' }),
  listSmartCollections: () => request('/search/smart'),
  createSmartCollection: (data) => request('/search/smart', { method: 'POST', body: data }),
  deleteSmartCollection: (id) => request(`/search/smart/${id}`, { method: 'DELETE' }),
  getSmartCollectionLinks: (id) => request(`/smart/${id}/links`),
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
  lockTab: (id, password) => request(`/tabs/${id}/lock`, { method: 'POST', body: { password } }),
  unlockTab: (id, password) => request(`/tabs/${id}/unlock`, { method: 'POST', body: { password } }),
  unlockTabPermanently: (id, password) => request(`/tabs/${id}/lock`, { method: 'DELETE', body: { password } }),

  // Links
  listLinks: (params = {}) => {
    const q = new URLSearchParams()
    if (params.tab_id != null) q.set('tab_id', params.tab_id)
    if (params.favorite != null) q.set('favorite', params.favorite)
    if (params.pinned != null) q.set('pinned', params.pinned)
    if (params.read != null) q.set('read', params.read)
    if (params.priority) q.set('priority', params.priority)
    if (params.ungrouped) q.set('ungrouped', 'true')
    if (params.deleted_only) q.set('deleted_only', 'true')
    if (params.include_deleted) q.set('include_deleted', 'true')
    if (params.limit) q.set('limit', params.limit)
    if (params.offset) q.set('offset', params.offset)
    if (params.q) q.set('q', params.q)
    const qs = q.toString()
    return request(`/links${qs ? `?${qs}` : ''}`)
  },
  getLinkDetail: (id) => request(`/links/${id}`),
  createLink: (data) => request('/links', { method: 'POST', body: data }),
  updateLink: (id, data) => request(`/links/${id}`, { method: 'PUT', body: data }),
  deleteLink: (id) => request(`/links/${id}`, { method: 'DELETE' }),
  listTrash: () => request('/links/trash'),
  restoreLink: (id) => request(`/links/${id}/restore`, { method: 'POST' }),
  destroyLink: (id) => request(`/links/${id}/destroy`, { method: 'DELETE' }),
  toggleFavorite: (id) => request(`/links/${id}/toggle-favorite`, { method: 'POST' }),
  togglePin: (id) => request(`/links/${id}/toggle-pin`, { method: 'POST' }),
  reorderLinks: (items) => request('/links/reorder', { method: 'POST', body: items }),
  bulkAction: (linkIds, action, tabId = null, extra = {}) =>
    request('/links/bulk', { method: 'POST', body: { link_ids: linkIds, action, tab_id: tabId, ...extra } }),
  createHighlight: (linkId, data) => request(`/links/${linkId}/highlights`, { method: 'POST', body: data }),
  listHighlights: (linkId) => request(`/links/${linkId}/highlights`),
  createAttachment: (linkId, data) => request(`/links/${linkId}/attachments`, { method: 'POST', body: data }),
  getAttachment: (linkId, attachmentId) => request(`/links/${linkId}/attachments/${attachmentId}`),
  archiveLink: (linkId) => request(`/links/${linkId}/archive`, { method: 'POST' }),
  listArchives: (linkId) => request(`/links/${linkId}/archives`),
  getArchive: (archiveId) => request(`/archives/${archiveId}`),
  getReader: (linkId) => request(`/reader/${linkId}`),
  summarizeLink: (linkId) => request(`/links/${linkId}/summarize`, { method: 'POST' }),
  getRelatedLinks: (linkId) => request(`/links/${linkId}/related`),

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
  previewImportData: (data, mode = 'merge') => request(`/settings/import/preview?mode=${encodeURIComponent(mode)}`, { method: 'POST', body: data }),
  importData: (data, mode = 'merge') => request(`/settings/import?mode=${encodeURIComponent(mode)}`, { method: 'POST', body: data }),
  previewRestoreData: (data, mode = 'replace') => request(`/settings/restore/preview?mode=${encodeURIComponent(mode)}`, { method: 'POST', body: data }),
  restoreData: (data, mode = 'replace') => request(`/settings/restore?mode=${encodeURIComponent(mode)}`, { method: 'POST', body: data }),
  deleteAccount: () => request('/settings/account', { method: 'DELETE' }),
  createBotToken: () => request('/settings/bot-token', { method: 'POST' }),
  listApiTokens: () => request('/settings/api-tokens'),
  createApiToken: (data) => request('/settings/api-tokens', { method: 'POST', body: data }),
  revokeApiToken: (id) => request(`/settings/api-tokens/${id}`, { method: 'DELETE' }),
  listNotifications: () => request('/settings/notifications'),
  markNotificationRead: (id) => request(`/settings/notifications/${id}/read`, { method: 'POST' }),
  clearNotifications: () => request('/settings/notifications', { method: 'DELETE' }),
  importFile: (file, source, mode = 'merge') => {
    const form = new FormData()
    form.append('file', file)
    return request(`/settings/import-file?source=${encodeURIComponent(source)}&mode=${encodeURIComponent(mode)}`, { method: 'POST', body: form })
  },
  previewImportFile: (file, source, mode = 'merge') => {
    const form = new FormData()
    form.append('file', file)
    return request(`/settings/import-file/preview?source=${encodeURIComponent(source)}&mode=${encodeURIComponent(mode)}`, { method: 'POST', body: form })
  },
  listSnapshots: () => request('/settings/snapshots'),
  createSnapshot: (name = null) => request('/settings/snapshots', { method: 'POST', body: { name } }),
  previewSnapshotRestore: (id, mode = 'replace') => request(`/settings/snapshots/${id}/preview?mode=${encodeURIComponent(mode)}`),
  restoreSnapshot: (id, mode = 'replace') => request(`/settings/snapshots/${id}/restore?mode=${encodeURIComponent(mode)}`, { method: 'POST' }),
  deleteSnapshot: (id) => request(`/settings/snapshots/${id}`, { method: 'DELETE' }),

  // Jobs
  listJobs: () => request('/jobs'),
  createJob: (type, payload = {}, runNow = false) => request('/jobs', { method: 'POST', body: { type, payload, run_now: runNow } }),

  // Shares
  listShares: () => request('/shares'),
  createShare: (data) => request('/shares', { method: 'POST', body: data }),
  deleteShare: (id) => request(`/shares/${id}`, { method: 'DELETE' }),
  createShareInvite: (id, data) => request(`/shares/${id}/invites`, { method: 'POST', body: data }),
  listShareComments: (id) => request(`/shares/${id}/comments`),
  createShareComment: (id, data) => request(`/shares/${id}/comments`, { method: 'POST', body: data }),
  getPublicShare: (token) => request(`/public/shares/${token}`),
  getPublicProfile: (username) => request(`/public/profiles/${encodeURIComponent(username)}`),

  // Recommendations
  getRecommendations: () => request('/recommendations'),
  applyRecommendedTags: () => request('/recommendations/apply-tags', { method: 'POST' }),

  // Productivity suite
  listRules: () => request('/rules'),
  createRule: (data) => request('/rules', { method: 'POST', body: data }),
  updateRule: (id, data) => request(`/rules/${id}`, { method: 'PUT', body: data }),
  deleteRule: (id) => request(`/rules/${id}`, { method: 'DELETE' }),
  createDefaultRules: () => request('/rules/defaults', { method: 'POST' }),
  runRules: (trigger = 'link_created') => request(`/rules/run?trigger=${encodeURIComponent(trigger)}`, { method: 'POST' }),
  listInbox: () => request('/inbox'),
  reviewInbox: (data) => request('/inbox/review', { method: 'POST', body: data }),
  listAllHighlights: (q = '') => request(`/highlights${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  exportHighlights: (format = 'markdown') => request(`/highlights/export?format=${encodeURIComponent(format)}`),
  semanticSearch: (q) => request(`/search/semantic?q=${encodeURIComponent(q)}`),
  healthHistory: () => request('/health/history'),
  linkHealthHistory: (linkId) => request(`/links/${linkId}/health-history`),
  listWorkspaces: () => request('/workspaces'),
  createWorkspace: (data) => request('/workspaces', { method: 'POST', body: data }),
  addWorkspaceMember: (id, data) => request(`/workspaces/${id}/members`, { method: 'POST', body: data }),
  auditLog: () => request('/audit'),
  listWebhooks: () => request('/webhooks'),
  createWebhook: (data) => request('/webhooks', { method: 'POST', body: data }),
  deleteWebhook: (id) => request(`/webhooks/${id}`, { method: 'DELETE' }),
  testWebhook: (id) => request(`/webhooks/${id}/test`, { method: 'POST' }),
  webhookDeliveries: () => request('/webhooks/deliveries'),
  getProfile: () => request('/profile'),
  updateProfile: (data) => request('/profile', { method: 'PUT', body: data }),

  // Admin
  adminOverview: () => request('/admin/overview'),
  adminHealth: () => request('/admin/health'),
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
