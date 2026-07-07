    async function api(path) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'api', path }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (res.ok) resolve(res.data);
          else reject(new Error(res.data?.detail || 'Failed'));
        });
      });
    }

    let currentTabId = 'all';
    let allTabs = [];
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));

    // --- Folder tree ---
    function renderTree(tabs) {
      allTabs = tabs || [];
      const list = document.getElementById('treeList');
      const rootTabs = allTabs.filter(t => !t.parent_id);

      list.innerHTML = `
        <div class="tree-item ${currentTabId === 'all' ? 'active' : ''}" data-id="all">
          <span class="ti-dot" style="background:var(--text-muted)"></span>
          <span class="ti-name">All Links</span>
        </div>`;

      rootTabs.forEach(t => {
        list.innerHTML += `
          <div class="tree-item ${currentTabId === String(t.id) ? 'active' : ''}" data-id="${t.id}">
            <span class="ti-dot" style="background:${t.color || '#6366f1'}"></span>
            <span class="ti-name">${esc(t.name)}</span>
            <span class="ti-count">${t.total_link_count || t.link_count || 0}</span>
          </div>`;

        // Children
        const children = allTabs.filter(c => c.parent_id === t.id);
        children.forEach(c => {
          list.innerHTML += `
            <div class="tree-item child ${currentTabId === String(c.id) ? 'active' : ''}" data-id="${c.id}">
              <span class="ti-dot" style="background:${c.color || '#6366f1'};opacity:0.7"></span>
              <span class="ti-name">${esc(c.name)}</span>
              <span class="ti-count">${c.total_link_count || c.link_count || 0}</span>
            </div>`;
        });
      });

      // Click handlers
      list.querySelectorAll('.tree-item').forEach(item => {
        item.addEventListener('click', () => {
          list.querySelectorAll('.tree-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          currentTabId = item.dataset.id;
          document.getElementById('currentFolder').textContent = currentTabId === 'all' ? 'All Links' : item.querySelector('.ti-name').textContent;
          document.getElementById('searchInput').value = '';
          loadLinks();
        });
      });
    }

    // Toggle tree
    let treeOpen = true;
    document.getElementById('treeToggle').addEventListener('click', () => {
      treeOpen = !treeOpen;
      document.getElementById('treeList').style.display = treeOpen ? '' : 'none';
      document.getElementById('treeArrow').classList.toggle('open', treeOpen);
    });

    // --- Load links ---
    async function loadLinks(search) {
      const list = document.getElementById('linksList');
      list.innerHTML = '<div class="empty">Loading...</div>';

      try {
        let links;
        if (search) {
          links = await api(`/links?q=${encodeURIComponent(search)}&limit=100`);
          document.getElementById('currentFolder').textContent = `Search: "${search}"`;
        } else {
          const params = currentTabId === 'all' ? '?limit=100' : `?tab_id=${currentTabId}&limit=100`;
          links = await api(`/links${params}`);
        }

        document.getElementById('linkCount').textContent = `${(links || []).length} links`;

        if (!links || links.length === 0) {
          list.innerHTML = '<div class="empty">No bookmarks</div>';
          return;
        }

        list.innerHTML = links.map(l => {
          let domain = '';
          try { domain = new URL(l.url).hostname; } catch {}
          const hasStatus = l.http_status !== null && l.http_status !== undefined;
          const statusColor = !hasStatus ? '' : l.http_status === 0 || l.http_status >= 400 ? 'var(--red)' : l.http_status >= 300 ? 'var(--amber)' : 'var(--green)';
          return `
            <div class="link-item" data-url="${esc(l.url)}">
              <img class="lf" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32" />
              <div class="li">
                <div class="lt">
                  ${statusColor ? `<span class="status-dot" style="background:${statusColor}" title="HTTP ${l.http_status}"></span>` : ''}
                  ${esc(l.title || 'Untitled')}
                </div>
                <div class="ld">${esc(domain)}</div>
                ${l.note ? `<div class="ln">${esc(l.note)}</div>` : ''}
              </div>
              ${l.is_favorite ? '<span class="lfav">⭐</span>' : ''}
            </div>`;
        }).join('');

        list.querySelectorAll('.link-item').forEach(item => {
          item.addEventListener('click', () => chrome.tabs.create({ url: item.dataset.url }));
        });
      } catch (e) {
        list.innerHTML = `<div class="empty" style="color:var(--red)">${e.message}</div>`;
      }
    }

    // --- Search ---
    let sTimer;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(sTimer);
      const q = e.target.value.trim();
      if (!q) { loadLinks(); return; }
      sTimer = setTimeout(() => loadLinks(q), 300);
    });

    // --- Footer ---
    document.getElementById('btnOpen').addEventListener('click', async () => {
      const { lk_server } = await chrome.storage.local.get('lk_server');
      if (lk_server) chrome.tabs.create({ url: lk_server });
    });

    document.getElementById('btnSave').addEventListener('click', async () => {
      const btn = document.getElementById('btnSave');
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      btn.textContent = 'Saving...';
      try {
        const meta = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'api', path: '/metadata', method: 'POST', body: { url: tab.url } }, (res) => {
            if (res.ok) resolve(res.data); else reject(new Error(res.data?.detail));
          });
        });
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'api', path: '/links', method: 'POST', body: { title: meta?.title || tab.title, url: tab.url } }, (res) => {
            if (res.ok) resolve(); else reject(new Error(res.data?.detail));
          });
        });
        btn.textContent = '✓ Saved!';
        setTimeout(() => { btn.textContent = '💾 Save this tab'; loadLinks(); }, 1500);
      } catch (e) {
        btn.textContent = '✗ Error';
        setTimeout(() => { btn.textContent = '💾 Save this tab'; }, 2000);
      }
    });

    document.getElementById('btnHealth').addEventListener('click', async () => {
      const btn = document.getElementById('btnHealth');
      btn.textContent = '⚡ Checking...';
      btn.style.color = 'var(--accent)';
      try {
        const res = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'api', path: '/links/check-health', method: 'POST' }, (res) => {
            if (res.ok) resolve(res.data); else reject(new Error(res.data?.detail));
          });
        });
        btn.textContent = `⚡ ${res.dead} dead / ${res.checked}`;
        btn.style.color = res.dead > 0 ? 'var(--red)' : 'var(--green)';
        loadLinks(); // refresh to show new status dots
        setTimeout(() => { btn.textContent = '⚡ Health'; btn.style.color = ''; }, 5000);
      } catch (e) {
        btn.textContent = '⚡ Error';
        btn.style.color = 'var(--red)';
        setTimeout(() => { btn.textContent = '⚡ Health'; btn.style.color = ''; }, 3000);
      }
    });

    // --- Init ---
    const tabs = await api('/tabs');
    renderTree(tabs);
    loadLinks();
