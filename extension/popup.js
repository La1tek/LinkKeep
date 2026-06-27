async function apiCall(server, path, method = 'GET', body = null, token = null) {
  const headers = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (body) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body) }
  const res = await fetch(`${server}/api${path}`, { method, headers, body })
  if (!res.ok) throw new Error((await res.json().catch(() => {}))?.detail || 'Request failed')
  return res.json()
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

function showStatus(msg, type) {
  const el = document.getElementById('status')
  el.textContent = msg
  el.className = `status ${type}`
  setTimeout(() => { el.className = 'status' }, 3000)
}

async function init() {
  const { lk_server, lk_token, lk_user } = await chrome.storage.local.get(['lk_server', 'lk_token', 'lk_user'])

  if (!lk_token) {
    document.getElementById('loginScreen').classList.add('active')
    document.getElementById('saveScreen').classList.remove('active')

    document.getElementById('loginBtn').addEventListener('click', async () => {
      const server = document.getElementById('serverUrl').value.replace(/\/$/, '')
      const username = document.getElementById('username').value
      const password = document.getElementById('password').value
      try {
        const form = new FormData()
        form.append('username', username)
        form.append('password', password)
        const res = await fetch(`${server}/api/auth/login`, { method: 'POST', body: form })
        if (!res.ok) throw new Error('Login failed')
        const data = await res.json()
        await chrome.storage.local.set({ lk_server: server, lk_token: data.access_token, lk_user: username })
        showStatus('Logged in!', 'success')
        setTimeout(init, 500)
      } catch (e) {
        showStatus(e.message, 'error')
      }
    })
    return
  }

  // Logged in — show save screen
  document.getElementById('loginScreen').classList.remove('active')
  document.getElementById('saveScreen').classList.add('active')

  const tab = await getActiveTab()
  document.getElementById('url').value = tab.url

  // Fetch metadata
  try {
    const meta = await apiCall(lk_server, '/metadata', 'POST', { url: tab.url }, lk_token)
    document.getElementById('title').value = meta.title || tab.title
  } catch {
    document.getElementById('title').value = tab.title
  }

  // Load tabs
  try {
    const tabs = await apiCall(lk_server, '/tabs', 'GET', null, lk_token)
    const select = document.getElementById('tabSelect')
    select.innerHTML = '<option value="">No group</option>'
    tabs.forEach(t => {
      const opt = document.createElement('option')
      opt.value = t.id
      opt.textContent = t.name
      select.appendChild(opt)
    })
  } catch {}

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const title = document.getElementById('title').value
    const tabId = document.getElementById('tabSelect').value
    try {
      await apiCall(lk_server, '/links', 'POST', {
        title,
        url: tab.url,
        tab_id: tabId ? Number(tabId) : null,
      }, lk_token)
      showStatus('Saved!', 'success')
      setTimeout(() => window.close(), 800)
    } catch (e) {
      showStatus(e.message, 'error')
    }
  })
}

init()
