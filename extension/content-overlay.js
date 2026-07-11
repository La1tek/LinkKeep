(function initLinkAtlasOverlay() {
  if (window.__linkAtlasOverlayLoaded || !/^https?:\/\//i.test(location.href)) return;
  window.__linkAtlasOverlayLoaded = true;

  const state = {
    saved: false,
    link: null,
    tabs: [],
    collapsed: false,
    busy: false,
  };

  const root = document.createElement('div');
  root.id = 'linkatlas-overlay';
  root.innerHTML = `
    <div class="la-head">
      <div class="la-mark">LA</div>
      <div class="la-title">
        <strong>LinkAtlas</strong>
        <span><i class="la-status-dot"></i><span class="la-status-text">Checking page</span></span>
      </div>
      <button class="la-icon-btn la-collapse" type="button" title="Collapse">-</button>
    </div>
    <div class="la-body">
      <div class="la-actions">
        <button class="la-button la-save" type="button">Save</button>
        <button class="la-button la-highlight" type="button">Highlight</button>
        <button class="la-button la-reader" type="button">Reader</button>
      </div>
      <div class="la-field-grid">
        <select class="la-select la-folder" aria-label="Folder">
          <option value="">No folder</option>
        </select>
        <input class="la-input la-tags" type="text" placeholder="tags, separated, by comma" />
      </div>
      <div class="la-message" role="status"></div>
    </div>
  `;

  function mount() {
    if (document.body) {
      document.body.appendChild(root);
      bindEvents();
      bootstrap();
      return;
    }
    requestAnimationFrame(mount);
  }

  function $(selector) {
    return root.querySelector(selector);
  }

  function send(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.data?.detail || 'LinkAtlas request failed'));
          return;
        }
        resolve(response.data);
      });
    });
  }

  function setMessage(message) {
    $('.la-message').textContent = message || '';
  }

  function setBusy(value) {
    state.busy = value;
    root.querySelectorAll('button, input, select').forEach((node) => {
      node.disabled = value;
    });
  }

  function render() {
    root.classList.toggle('la-collapsed', state.collapsed);
    $('.la-status-dot').classList.toggle('la-saved', state.saved);
    $('.la-status-text').textContent = state.saved ? 'Saved in your atlas' : 'Not saved yet';
    $('.la-save').textContent = state.saved ? 'Saved' : 'Save';
    $('.la-save').disabled = state.busy || state.saved;
    $('.la-tags').value = (state.link?.tags || []).join(', ');

    const folder = $('.la-folder');
    const current = state.link?.tab_id ? String(state.link.tab_id) : '';
    folder.innerHTML = '<option value="">No folder</option>' + state.tabs.map((tab) => (
      `<option value="${String(tab.id).replace(/"/g, '&quot;')}">${escapeHtml(tab.name)}</option>`
    )).join('');
    folder.value = current;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function bootstrap() {
    try {
      const data = await send('overlay_bootstrap', { url: location.href });
      state.saved = !!data.saved;
      state.link = data.link || null;
      state.tabs = data.tabs || [];
      render();
      setMessage(state.saved ? 'Ready for highlights and reader mode.' : 'Save this page to unlock highlights and reader mode.');
    } catch (error) {
      setMessage(error.message || 'Open extension popup to sign in.');
    }
  }

  async function ensureSaved() {
    if (state.link) return state.link;
    setBusy(true);
    try {
      const link = await send('save_page', { payload: { url: location.href, title: document.title } });
      state.saved = true;
      state.link = link;
      setMessage('Page saved.');
      render();
      return link;
    } finally {
      setBusy(false);
    }
  }

  async function savePage() {
    try {
      await ensureSaved();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveHighlight() {
    const text = String(window.getSelection?.() || '').trim();
    if (!text) {
      setMessage('Select text on the page first.');
      return;
    }
    setBusy(true);
    try {
      const link = await send('overlay_save_highlight', { payload: { url: location.href, title: document.title, text } });
      state.saved = true;
      state.link = link;
      render();
      setMessage('Highlight saved.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateLinkPatch(patch) {
    const link = await ensureSaved();
    setBusy(true);
    try {
      const updated = await send('overlay_update_link', { payload: { linkId: link.id, patch } });
      state.link = updated;
      state.saved = true;
      render();
      setMessage('Link updated.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function openReader() {
    setBusy(true);
    try {
      const reader = await send('overlay_reader', { url: location.href });
      renderReader(reader);
      setMessage('Reader opened.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function renderReader(reader) {
    document.getElementById('linkatlas-reader-drawer')?.remove();
    const drawer = document.createElement('div');
    drawer.id = 'linkatlas-reader-drawer';
    drawer.innerHTML = `
      <div class="la-reader-head">
        <div>
          <strong>${escapeHtml(reader.link?.title || document.title)}</strong>
          <div class="la-message">${reader.reading_time_minutes || 1} min read · ${reader.offline_available ? 'offline ready' : 'live metadata only'}</div>
        </div>
        <button class="la-icon-btn" type="button" title="Close">x</button>
      </div>
      <div class="la-reader-content">${escapeHtml(reader.content || 'No readable text yet. Archive or fetch content inside LinkAtlas first.')}</div>
    `;
    drawer.querySelector('button').addEventListener('click', () => drawer.remove());
    document.body.appendChild(drawer);
  }

  function bindEvents() {
    $('.la-collapse').addEventListener('click', () => {
      state.collapsed = !state.collapsed;
      $('.la-collapse').textContent = state.collapsed ? '+' : '-';
      render();
    });
    $('.la-save').addEventListener('click', savePage);
    $('.la-highlight').addEventListener('click', saveHighlight);
    $('.la-reader').addEventListener('click', openReader);
    $('.la-folder').addEventListener('change', (event) => {
      const value = event.target.value;
      updateLinkPatch({ tab_id: value ? Number(value) : null });
    });
    $('.la-tags').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const tags = event.currentTarget.value.split(',').map((item) => item.trim()).filter(Boolean);
      updateLinkPatch({ tags });
    });
  }

  mount();
})();
