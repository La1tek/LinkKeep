// LinkKeep Extension v2.2 — popup.js
(async () => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const show = (id) => { $$('.screen').forEach(s => s.classList.remove('active')); $(`#${id}`).classList.add('active'); };
  const setStatus = (msg, type = 'loading') => {
    const el = $('#status');
    el.className = `status show ${type}`;
    $('#statusText').textContent = msg;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.className = 'status', type === 'loading' ? 15000 : 3000);
  };
  const hideStatus = () => { $('#status').className = 'status'; clearTimeout($('#status')._t); };

  function renderLinks(container, links) {
    if (!links || links.length === 0) {
      container.innerHTML = '<div class="empty-state">No bookmarks</div>';
      return;
    }
    container.innerHTML = links.map(l => {
      let domain = '';
      try { domain = new URL(l.url).hostname; } catch {}
      const statusDot = l.http_status ? (l.http_status >= 400 ? '🔴' : l.http_status >= 300 ? '🟡' : '🟢') : '';
      return `
        <div class="result-item" data-url="${l.url.replace(/"/g, '&quot;')}">
          <img class="r-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32" />
          <div class="r-info">
            <div class="r-title">${statusDot} ${(l.title || '').replace(/</g, '&lt;')}</div>
            <div class="r-url">${domain}</div>
            ${l.note ? `<div class="r-note">${l.note.replace(/</g, '&lt;')}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    container.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => chrome.tabs.create({ url: item.dataset.url }));
    });
  }

  async function api(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'api', path, method, body }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (res.ok) resolve(res.data);
        else reject(new Error(res.data?.detail || 'Request failed'));
      });
    });
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  // --- Init ---
  const { lk_server, lk_token, lk_user } = await chrome.storage.local.get(['lk_server', 'lk_token', 'lk_user']);

  if (!lk_token) {
    show('loginScreen');
    if (lk_server) $('#serverUrl').value = lk_server;

    $('#loginBtn').addEventListener('click', async () => {
      const server = $('#serverUrl').value.replace(/\/+$/, '');
      const username = $('#username').value.trim();
      const password = $('#password').value;
      if (!server || !username || !password) { setStatus('Fill all fields', 'error'); return; }

      $('#loginBtn').disabled = true;
      setStatus('Connecting...', 'loading');
      try {
        // Direct fetch login (no service worker dependency)
        const fd = new FormData();
        fd.append('username', username);
        fd.append('password', password);
        const r = await fetch(`${server}/api/auth/login`, { method: 'POST', body: fd });
        const text = await r.text();
        let data;
        try { data = JSON.parse(text); } catch { throw new Error('Invalid server response'); }
        if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
        await chrome.storage.local.set({ lk_server: server, lk_token: data.access_token, lk_user: username });
        hideStatus();
        location.reload();
      } catch (e) {
        setStatus(e.message, 'error');
        $('#loginBtn').disabled = false;
      }
    });

    ['serverUrl', 'username', 'password'].forEach(id => {
      $(`#${id}`).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });
    });
    return;
  }

  // --- LOGGED IN ---
  $('#header').style.display = '';
  show('mainScreen');

  // Settings
  $('#settingsUser').textContent = lk_user || 'User';
  $('#settingsServer').textContent = lk_server;
  $('#settingsBtn').addEventListener('click', () => show('settingsScreen'));
  $('#backBtn').addEventListener('click', () => show('mainScreen'));
  $('#logoutBtn').addEventListener('click', async () => { await chrome.storage.local.clear(); location.reload(); });
  $('#openLinkKeep').addEventListener('click', () => chrome.tabs.create({ url: lk_server }));
  $('#openPanel').addEventListener('click', async () => {
    const tab = await getActiveTab();
    chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  });

  // Health check
  $('#healthCheck').addEventListener('click', async () => {
    const pill = $('#healthCheck');
    pill.textContent = '⚡ Checking...';
    pill.style.color = 'var(--accent)';
    try {
      const res = await api('/links/check-health', 'POST');
      pill.textContent = `⚡ ${res.dead} dead`;
      pill.style.color = res.dead > 0 ? 'var(--red)' : 'var(--green)';
      setTimeout(() => { pill.textContent = '⚡ Check'; pill.style.color = ''; }, 4000);
      // Refresh All tab if visible
      loadAllLinks();
    } catch (e) {
      pill.textContent = '⚡ Error';
      pill.style.color = 'var(--red)';
      setTimeout(() => { pill.textContent = '⚡ Check'; pill.style.color = ''; }, 3000);
    }
  });

  // --- Tabs ---
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      $('#saveTab').style.display = target === 'save' ? '' : 'none';
      $('#allTab').style.display = target === 'all' ? '' : 'none';
      $('#searchTab').style.display = target === 'search' ? '' : 'none';
      if (target === 'all') loadAllLinks();
      if (target === 'search') $('#searchInput').focus();
    });
  });

  // --- Save tab ---
  async function initSave() {
    const tab = await getActiveTab();
    $('#pageTitle').textContent = tab.title || 'Untitled';
    $('#pageUrl').textContent = tab.url;
    try {
      const u = new URL(tab.url);
      $('#faviconImg').src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=64`;
    } catch { $('#faviconImg').style.display = 'none'; }
    try {
      setStatus('Loading...', 'loading');
      const meta = await api('/metadata', 'POST', { url: tab.url });
      $('#titleInput').value = meta.title || tab.title || '';
      hideStatus();
    } catch {
      $('#titleInput').value = tab.title || '';
      hideStatus();
    }
  }

  let isSaving = false;
  $('#saveBtn').addEventListener('click', async () => {
    if (isSaving) return;
    isSaving = true;
    const btn = $('#saveBtn');
    const tab = await getActiveTab();
    btn.disabled = true;
    btn.textContent = 'Saving...';
    setStatus('Saving...', 'loading');
    try {
      await api('/links', 'POST', {
        title: $('#titleInput').value.trim() || tab.title || 'Untitled',
        url: tab.url,
        note: $('#noteInput').value.trim() || undefined,
      });
      setStatus('✓ Saved!', 'success');
      btn.textContent = '✓ Saved!';
      setTimeout(() => window.close(), 1000);
    } catch (e) {
      setStatus(e.message, 'error');
      btn.textContent = 'Save to LinkKeep';
      btn.disabled = false;
      isSaving = false;
    }
  });

  // --- All tab ---
  async function loadAllLinks() {
    $('#allResults').innerHTML = '<div class="empty-state">Loading...</div>';
    try {
      const links = await api('/links?limit=50');
      renderLinks($('#allResults'), links);
    } catch (e) {
      $('#allResults').innerHTML = `<div class="empty-state" style="color:var(--red)">${e.message}</div>`;
    }
  }

  // --- Search tab ---
  let searchTimer;
  $('#searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = $('#searchInput').value.trim();
    if (!q) {
      $('#searchResults').innerHTML = '<div class="search-hint">Type to search across all bookmarks</div>';
      return;
    }
    $('#searchResults').innerHTML = '<div class="empty-state">Searching...</div>';
    searchTimer = setTimeout(async () => {
      try {
        const links = await api(`/links?search=${encodeURIComponent(q)}&limit=30`);
        if (!links || links.length === 0) {
          $('#searchResults').innerHTML = '<div class="empty-state">No results</div>';
          return;
        }
        renderLinks($('#searchResults'), links);
      } catch (e) {
        $('#searchResults').innerHTML = `<div class="empty-state" style="color:var(--red)">${e.message}</div>`;
      }
    }, 300);
  });

  // --- Keyboard ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) $('#saveBtn').click();
    if (e.key === 'Escape') window.close();
  });

  // --- Start ---
  initSave();
})();
