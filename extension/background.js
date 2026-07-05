// LinkKeep Extension v2.3 — background service worker with bidirectional bookmark sync

const SYNC_FOLDER = 'LinkKeep';
const SYNC_INTERVAL = 30_000; // 30 seconds

// --- Storage helpers ---
function getAuth() {
  return new Promise(resolve => {
    chrome.storage.local.get(['lk_server', 'lk_token'], resolve);
  });
}

function getSyncSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['lk_sync_enabled', 'lk_sync_folder_id', 'lk_last_sync'], resolve);
  });
}

function setSyncData(key, value) {
  return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
}

// --- API helper ---
async function apiFetch(path, method = 'GET', body = null, formFields = null) {
  const { lk_server: server, lk_token: token } = await getAuth();
  if (!server || !token) throw new Error('Not logged in');

  let headers = { 'Authorization': `Bearer ${token}` };
  let fetchBody = body;

  if (formFields) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(formFields)) fd.append(k, v);
    fetchBody = fd;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const r = await fetch(`${server}/api${path}`, { method, headers, body: fetchBody });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
  return data;
}

// --- Bookmark folder management ---
async function getOrCreateSyncFolder() {
  const { lk_sync_folder_id } = await getSyncSettings();
  if (lk_sync_folder_id) {
    try {
      const node = await chrome.bookmarks.get(lk_sync_folder_id);
      if (node) return lk_sync_folder_id;
    } catch {
      // Folder was deleted externally
      await chrome.storage.local.remove('lk_sync_folder_id');
    }
  }

  // Find existing folder by name
  const tree = await chrome.bookmarks.getTree();
  const barId = tree[0].children.find(c => c.title === 'Bookmarks bar' || c.title === 'Other bookmarks')?.id
    || tree[0].children[0]?.id;

  if (barId) {
    const children = await chrome.bookmarks.getChildren(barId);
    const existing = children.find(c => c.title === SYNC_FOLDER);
    if (existing) {
      await setSyncData('lk_sync_folder_id', existing.id);
      return existing.id;
    }
  }

  // Create new folder
  const folder = await chrome.bookmarks.create({
    parentId: barId || '1',
    title: SYNC_FOLDER,
  });
  await setSyncData('lk_sync_folder_id', folder.id);
  return folder.id;
}

// --- URL normalization ---
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/+$/, '').replace(/^www\./, '');
  } catch {
    return url.toLowerCase().trim();
  }
}

// --- SYNC: LinkKeep → Browser Bookmarks ---
// Pull all links from LinkKeep and create bookmarks for missing ones
async function syncFromLinkKeepToBookmarks(folderId) {
  const { lk_last_sync } = await getSyncSettings();
  const since = lk_last_sync || '1970-01-01T00:00:00';

  let allLinks = [];
  let offset = 0;
  const limit = 100;

  // Fetch all links (paginated)
  while (true) {
    const links = await apiFetch(`/links?limit=${limit}&offset=${offset}`);
    if (!links || links.length === 0) break;
    allLinks = allLinks.concat(links);
    offset += limit;
    if (links.length < limit) break;
  }

  // Get current bookmarks in our folder
  const existingBookmarks = await chrome.bookmarks.getChildren(folderId);
  const bookmarkMap = new Map(); // normalized URL → bookmark
  for (const bm of existingBookmarks) {
    if (bm.url) {
      bookmarkMap.set(normalizeUrl(bm.url), bm);
    }
  }

  let created = 0;
  let updated = 0;

  for (const link of allLinks) {
    const normUrl = normalizeUrl(link.url);
    const existing = bookmarkMap.get(normUrl);

    if (!existing) {
      // Create bookmark
      await chrome.bookmarks.create({
        parentId: folderId,
        title: link.title,
        url: link.url,
      });
      created++;
    } else if (existing.title !== link.title) {
      // Update title if changed
      await chrome.bookmarks.update(existing.id, { title: link.title });
      updated++;
    }
  }

  // Remove bookmarks that no longer exist in LinkKeep
  const linkkeepUrls = new Set(allLinks.map(l => normalizeUrl(l.url)));
  let removed = 0;
  for (const bm of existingBookmarks) {
    if (bm.url && !linkkeepUrls.has(normalizeUrl(bm.url))) {
      await chrome.bookmarks.remove(bm.id);
      removed++;
    }
  }

  await setSyncData('lk_last_sync', new Date().toISOString());

  return { created, updated, removed, total: allLinks.length };
}

// --- SYNC: Browser Bookmarks → LinkKeep ---
// Watch for bookmark changes and push to LinkKeep
async function syncBookmarkToLinkKeep(bookmark, tabName = null) {
  if (!bookmark.url) return; // Skip folders

  const { lk_sync_folder_id } = await getSyncSettings();
  // Only sync bookmarks inside our folder
  if (bookmark.parentId !== lk_sync_folder_id) return;

  // Check if link already exists in LinkKeep
  const existing = await apiFetch(`/links?q=${encodeURIComponent(bookmark.url)}&limit=5`);
  const normUrl = normalizeUrl(bookmark.url);
  const match = existing.find(l => normalizeUrl(l.url) === normUrl);

  if (match) {
    // Update title if changed
    if (match.title !== bookmark.title) {
      await apiFetch(`/links/${match.id}`, 'PUT', { title: bookmark.title });
    }
  } else {
    // Create new link
    try {
      const meta = await apiFetch('/metadata', 'POST', { url: bookmark.url });
      await apiFetch('/links', 'POST', {
        title: bookmark.title,
        url: bookmark.url,
        description: meta?.description || undefined,
        favicon: meta?.favicon || undefined,
        image: meta?.image || undefined,
      });
    } catch {
      // Fallback without metadata
      await apiFetch('/links', 'POST', {
        title: bookmark.title,
        url: bookmark.url,
      });
    }
  }
}

async function removeBookmarkFromLinkKeep(bookmarkUrl) {
  if (!bookmarkUrl) return;
  const { lk_sync_folder_id } = await getSyncSettings();

  const existing = await apiFetch(`/links?q=${encodeURIComponent(bookmarkUrl)}&limit=5`);
  const normUrl = normalizeUrl(bookmarkUrl);
  const match = existing.find(l => normalizeUrl(l.url) === normUrl);
  if (match) {
    await apiFetch(`/links/${match.id}`, 'DELETE');
  }
}

// --- Bookmark event listeners ---
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  const { lk_sync_enabled } = await getSyncSettings();
  if (!lk_sync_enabled) return;
  try {
    const folderId = await getOrCreateSyncFolder();
    if (bookmark.parentId === folderId && bookmark.url) {
      await syncBookmarkToLinkKeep(bookmark);
    }
  } catch (e) {
    console.error('[LinkKeep Sync] onCreated error:', e);
  }
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  const { lk_sync_enabled } = await getSyncSettings();
  if (!lk_sync_enabled) return;
  try {
    const bookmark = await chrome.bookmarks.get(id);
    if (bookmark.url) {
      await syncBookmarkToLinkKeep(bookmark);
    }
  } catch (e) {
    console.error('[LinkKeep Sync] onChanged error:', e);
  }
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  const { lk_sync_enabled } = await getSyncSettings();
  if (!lk_sync_enabled) return;
  try {
    if (removeInfo.node.url) {
      await removeBookmarkFromLinkKeep(removeInfo.node.url);
    }
  } catch (e) {
    console.error('[LinkKeep Sync] onRemoved error:', e);
  }
});

// --- Periodic full sync (catches changes from LinkKeep web UI) ---
let syncTimer = null;

async function runPeriodicSync() {
  const { lk_sync_enabled } = await getSyncSettings();
  if (!lk_sync_enabled) return;

  try {
    const folderId = await getOrCreateSyncFolder();
    const result = await syncFromLinkKeepToBookmarks(folderId);
    console.log('[LinkKeep Sync] Periodic sync:', result);
  } catch (e) {
    console.error('[LinkKeep Sync] Periodic sync error:', e);
  }
}

function startSyncTimer() {
  stopSyncTimer();
  syncTimer = setInterval(runPeriodicSync, SYNC_INTERVAL);
}

function stopSyncTimer() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

// Start/stop sync based on settings
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lk_sync_enabled) {
    if (changes.lk_sync_enabled.newValue) {
      runPeriodicSync();
      startSyncTimer();
    } else {
      stopSyncTimer();
    }
  }
});

// Init: check if sync was enabled and start timer
chrome.runtime.onInstalled.addListener(async () => {
  const { lk_sync_enabled } = await getSyncSettings();
  if (lk_sync_enabled) {
    startSyncTimer();
    await runPeriodicSync();
  }
});

// Also start on service worker wake (browser restart)
(async () => {
  const { lk_sync_enabled } = await getSyncSettings();
  if (lk_sync_enabled) {
    startSyncTimer();
    // Don't run sync immediately on wake to avoid thundering herd
  }
})();

// --- Message handler (for popup/sidepanel) ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'api') {
    apiFetch(msg.path, msg.method, msg.body, msg.formFields)
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, data: { detail: err.message } }));
    return true;
  }

  // Sync messages
  if (msg.type === 'sync_status') {
    getSyncSettings().then(settings => {
      sendResponse(settings);
    });
    return true;
  }

  if (msg.type === 'sync_now') {
    (async () => {
      try {
        const folderId = await getOrCreateSyncFolder();
        const result = await syncFromLinkKeepToBookmarks(folderId);
        sendResponse({ ok: true, data: result });
      } catch (e) {
        sendResponse({ ok: false, data: { detail: e.message } });
      }
    })();
    return true;
  }

  if (msg.type === 'sync_initial') {
    (async () => {
      try {
        const folderId = await getOrCreateSyncFolder();
        await runPeriodicSync();
        const { lk_sync_enabled } = await getSyncSettings();
        if (lk_sync_enabled && !syncTimer) startSyncTimer();
        sendResponse({ ok: true, data: { folderId } });
      } catch (e) {
        sendResponse({ ok: false, data: { detail: e.message } });
      }
    })();
    return true;
  }
});

// --- Context menu ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-page',
    title: 'Save page to LinkKeep',
    contexts: ['page', 'link', 'frame']
  });
  chrome.contextMenus.create({
    id: 'save-link',
    title: 'Save link to LinkKeep',
    contexts: ['link']
  });
  chrome.contextMenus.create({
    id: 'save-selection',
    title: 'Save selection as note',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'open-linkkeep',
    title: 'Open LinkKeep',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-linkkeep') {
    const { lk_server } = await getAuth();
    if (lk_server) chrome.tabs.create({ url: lk_server });
    return;
  }

  const { lk_server: server, lk_token: token } = await getAuth();
  if (!server || !token) return;

  try {
    let url, title, note;
    if (info.menuItemId === 'save-link') {
      url = info.linkUrl;
      title = info.selectionText || url;
    } else if (info.menuItemId === 'save-selection') {
      url = tab.url;
      title = tab.title;
      note = info.selectionText;
    } else {
      url = tab.url;
      title = tab.title;
    }

    const meta = await apiFetch('/metadata', 'POST', { url });
    await apiFetch('/links', 'POST', {
      title: meta?.title || title,
      url,
      note: note || undefined,
    });

    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
  } catch {
    chrome.action.setBadgeText({ text: '✗' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
  }
});

// --- Keyboard shortcuts ---
chrome.commands.onCommand.addListener(async (cmd) => {
  const { lk_server: server, lk_token: token } = await getAuth();

  if (cmd === 'open-panel') {
    await chrome.sidePanel.open({ tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id });
    return;
  }

  if (cmd === 'save-page') {
    if (!server || !token) {
      chrome.action.openPopup();
      return;
    }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const meta = await apiFetch('/metadata', 'POST', { url: tab.url });
      await apiFetch('/links', 'POST', { title: meta?.title || tab.title, url: tab.url });
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
    } catch {
      chrome.action.setBadgeText({ text: '✗' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
    }
  }
});
