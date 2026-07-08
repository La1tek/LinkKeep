// LinkKeep Extension v2.5 — background service worker with bidirectional bookmark sync

const SYNC_FOLDER = 'LinkKeep';
const SYNC_ALARM_NAME = 'linkkeep-sync';
const SYNC_INTERVAL_MINUTES = 1;
const DEFAULT_SYNC_POLICY = 'browser_wins';
const MAX_SYNC_LOGS = 50;
let suppressBookmarkEvents = false;

// --- Storage helpers ---
function getAuth() {
  return new Promise(resolve => {
    chrome.storage.local.get(['lk_server', 'lk_token'], resolve);
  });
}

function getSyncSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(['lk_sync_enabled', 'lk_sync_folder_id', 'lk_last_sync', 'lk_sync_policy', 'lk_sync_logs'], settings => {
      resolve({
        ...settings,
        lk_sync_policy: settings.lk_sync_policy || DEFAULT_SYNC_POLICY,
        lk_sync_logs: settings.lk_sync_logs || [],
      });
    });
  });
}

function setSyncData(key, value) {
  return new Promise(resolve => chrome.storage.local.set({ [key]: value }, resolve));
}

async function addSyncLog(level, message, details = {}) {
  const { lk_sync_logs } = await getSyncSettings();
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    details,
  };
  const logs = [entry, ...(lk_sync_logs || [])].slice(0, MAX_SYNC_LOGS);
  await setSyncData('lk_sync_logs', logs);
  return entry;
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
    const hostname = u.hostname.replace(/^www\./, '');
    const port = u.port ? `:${u.port}` : '';
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${hostname}${port}${path}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase().trim();
  }
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
}

async function findLinkByUrl(url) {
  const existing = await apiFetch(`/links?q=${encodeURIComponent(url)}&limit=10`);
  const normUrl = normalizeUrl(url);
  return (existing || []).find(l => normalizeUrl(l.url) === normUrl) || null;
}

async function saveUrlToLinkKeep({ url, title, note, tabId }) {
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('Unsupported page URL');
  const existing = await findLinkByUrl(url).catch(() => null);
  if (existing) {
    if (note && !existing.note) await apiFetch(`/links/${existing.id}`, 'PUT', { note });
    return existing;
  }

  let meta = {};
  try { meta = await apiFetch('/metadata', 'POST', { url }); } catch {}
  return apiFetch('/links', 'POST', {
    title: meta?.title || title || url,
    url,
    note: note || undefined,
    tab_id: tabId || undefined,
    description: meta?.description || undefined,
    favicon: meta?.favicon || undefined,
    image: meta?.image || undefined,
  });
}

async function saveTabsAsFolder(tabs, folderName) {
  const urls = (tabs || []).filter(t => t.url && /^https?:\/\//i.test(t.url));
  if (urls.length === 0) throw new Error('No saveable tabs');
  const folder = await apiFetch('/tabs', 'POST', {
    name: folderName,
    color: '#6366f1',
  });
  let saved = 0;
  for (const item of urls) {
    await saveUrlToLinkKeep({ url: item.url, title: item.title, tabId: folder.id });
    saved++;
  }
  return { saved, folder };
}

async function saveCurrentWindowTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const stamp = new Date().toLocaleString();
  return saveTabsAsFolder(tabs, `Session ${stamp}`);
}

async function saveCurrentTabGroup(tab) {
  if (!tab?.groupId || tab.groupId < 0) return saveCurrentWindowTabs();
  const group = await chrome.tabGroups.get(tab.groupId).catch(() => null);
  const tabs = await chrome.tabs.query({ groupId: tab.groupId, currentWindow: true });
  return saveTabsAsFolder(tabs, group?.title ? `Group ${group.title}` : `Tab group ${new Date().toLocaleString()}`);
}

async function saveSelectedTextAsHighlight(info, tab) {
  const text = (info.selectionText || '').trim();
  if (!text) throw new Error('No selected text');
  const link = await saveUrlToLinkKeep({ url: tab.url, title: tab.title });
  await apiFetch(`/links/${link.id}/highlights`, 'POST', {
    text,
    source_url: tab.url,
  });
  return link;
}

// --- SYNC: LinkKeep → Browser Bookmarks ---
// Pull all links from LinkKeep and create bookmarks for missing ones
async function syncFromLinkKeepToBookmarks(folderId, options = {}) {
  const dryRun = !!options.dryRun;
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
  let removed = 0;

  suppressBookmarkEvents = !dryRun;
  try {
    for (const link of allLinks) {
      const normUrl = normalizeUrl(link.url);
      const existing = bookmarkMap.get(normUrl);

      if (!existing) {
        if (!dryRun) {
          await chrome.bookmarks.create({
            parentId: folderId,
            title: link.title,
            url: link.url,
          });
        }
        created++;
      } else if (existing.title !== link.title) {
        if (!dryRun) {
          await chrome.bookmarks.update(existing.id, { title: link.title });
        }
        updated++;
      }
    }

    // Remove bookmarks that no longer exist in LinkKeep
    const linkkeepUrls = new Set(allLinks.map(l => normalizeUrl(l.url)));
    for (const bm of existingBookmarks) {
      if (bm.url && !linkkeepUrls.has(normalizeUrl(bm.url))) {
        if (!dryRun) {
          await chrome.bookmarks.remove(bm.id);
        }
        removed++;
      }
    }
  } finally {
    suppressBookmarkEvents = false;
  }

  if (!dryRun) {
    await setSyncData('lk_last_sync', new Date().toISOString());
  }

  return { created, updated, removed, total: allLinks.length, dryRun };
}

// --- SYNC: Browser Bookmarks → LinkKeep ---
// Watch for bookmark changes and push to LinkKeep
async function syncBookmarkToLinkKeep(bookmark, tabName = null) {
  if (!bookmark.url) return; // Skip folders

  const { lk_sync_folder_id, lk_sync_policy } = await getSyncSettings();
  // Only sync bookmarks inside our folder
  if (bookmark.parentId !== lk_sync_folder_id) return;

  // Check if link already exists in LinkKeep
  const existing = await apiFetch(`/links?q=${encodeURIComponent(bookmark.url)}&limit=5`);
  const normUrl = normalizeUrl(bookmark.url);
  const match = existing.find(l => normalizeUrl(l.url) === normUrl);

  if (match) {
    if (match.title !== bookmark.title) {
      if (lk_sync_policy === 'linkkeep_wins') {
        suppressBookmarkEvents = true;
        try {
          await chrome.bookmarks.update(bookmark.id, { title: match.title });
        } finally {
          suppressBookmarkEvents = false;
        }
        await addSyncLog('info', 'Resolved title conflict from LinkKeep', { url: bookmark.url });
      } else {
        await apiFetch(`/links/${match.id}`, 'PUT', { title: bookmark.title });
        await addSyncLog('info', 'Resolved title conflict from browser', { url: bookmark.url });
      }
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

  const existing = await apiFetch(`/links?q=${encodeURIComponent(bookmarkUrl)}&limit=5`);
  const normUrl = normalizeUrl(bookmarkUrl);
  const match = existing.find(l => normalizeUrl(l.url) === normUrl);
  if (match) {
    await apiFetch(`/links/${match.id}`, 'DELETE');
  }
}

// --- Bookmark event listeners ---
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  if (suppressBookmarkEvents) return;
  const { lk_sync_enabled } = await getSyncSettings();
  if (!lk_sync_enabled) return;
  try {
    const folderId = await getOrCreateSyncFolder();
    if (bookmark.parentId === folderId && bookmark.url) {
      await syncBookmarkToLinkKeep(bookmark);
    }
  } catch (e) {
    console.error('[LinkKeep Sync] onCreated error:', e);
    await addSyncLog('error', 'Bookmark create sync failed', { detail: e.message });
  }
});

chrome.bookmarks.onChanged.addListener(async (id, changeInfo) => {
  if (suppressBookmarkEvents) return;
  const { lk_sync_enabled } = await getSyncSettings();
  if (!lk_sync_enabled) return;
  try {
    const [bookmark] = await chrome.bookmarks.get(id);
    if (bookmark.url) {
      await syncBookmarkToLinkKeep(bookmark);
    }
  } catch (e) {
    console.error('[LinkKeep Sync] onChanged error:', e);
    await addSyncLog('error', 'Bookmark change sync failed', { detail: e.message });
  }
});

chrome.bookmarks.onRemoved.addListener(async (id, removeInfo) => {
  if (suppressBookmarkEvents) return;
  const { lk_sync_enabled } = await getSyncSettings();
  if (!lk_sync_enabled) return;
  try {
    const { lk_sync_folder_id } = await getSyncSettings();
    if (removeInfo.parentId !== lk_sync_folder_id) return;
    if (removeInfo.node.url) {
      await removeBookmarkFromLinkKeep(removeInfo.node.url);
    }
  } catch (e) {
    console.error('[LinkKeep Sync] onRemoved error:', e);
    await addSyncLog('error', 'Bookmark remove sync failed', { detail: e.message });
  }
});

async function runPeriodicSync(options = {}) {
  const { lk_sync_enabled } = await getSyncSettings();
  if (!lk_sync_enabled && !options.dryRun) return;

  try {
    const folderId = await getOrCreateSyncFolder();
    const result = await syncFromLinkKeepToBookmarks(folderId, options);
    console.log('[LinkKeep Sync] Periodic sync:', result);
    await addSyncLog('info', result.dryRun ? 'Dry-run sync complete' : 'Sync complete', result);
    return result;
  } catch (e) {
    console.error('[LinkKeep Sync] Periodic sync error:', e);
    await addSyncLog('error', 'Sync failed', { detail: e.message });
    throw e;
  }
}

function startSyncTimer() {
  stopSyncTimer();
  chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: SYNC_INTERVAL_MINUTES });
}

function stopSyncTimer() {
  chrome.alarms.clear(SYNC_ALARM_NAME);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) runPeriodicSync().catch(() => {});
});

// Start/stop sync based on settings
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.lk_sync_enabled) {
    if (changes.lk_sync_enabled.newValue) {
      runPeriodicSync().catch(() => {});
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

  if (msg.type === 'page_status') {
    findLinkByUrl(msg.url)
      .then(link => sendResponse({ ok: true, data: { saved: !!link, link } }))
      .catch(err => sendResponse({ ok: false, data: { detail: err.message } }));
    return true;
  }

  if (msg.type === 'save_page') {
    saveUrlToLinkKeep(msg.payload || {})
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, data: { detail: err.message } }));
    return true;
  }

  if (msg.type === 'save_all_tabs') {
    saveCurrentWindowTabs()
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, data: { detail: err.message } }));
    return true;
  }

  if (msg.type === 'save_tab_session') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => saveCurrentTabGroup(tab))
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
        const result = await syncFromLinkKeepToBookmarks(folderId, { dryRun: !!msg.dryRun });
        await addSyncLog('info', result.dryRun ? 'Manual dry-run sync complete' : 'Manual sync complete', result);
        sendResponse({ ok: true, data: result });
      } catch (e) {
        await addSyncLog('error', 'Manual sync failed', { detail: e.message });
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
        if (lk_sync_enabled) startSyncTimer();
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
  chrome.contextMenus.removeAll(() => {
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
      title: 'Save selection as highlight',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'save-all-tabs',
      title: 'Save all open tabs',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'save-tab-session',
      title: 'Save tab group/session',
      contexts: ['page']
    });
    chrome.contextMenus.create({
      id: 'open-linkkeep',
      title: 'Open LinkKeep',
      contexts: ['page']
    });
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
    if (info.menuItemId === 'save-link') {
      await saveUrlToLinkKeep({ url: info.linkUrl, title: info.selectionText || info.linkUrl });
    } else if (info.menuItemId === 'save-selection') {
      await saveSelectedTextAsHighlight(info, tab);
    } else if (info.menuItemId === 'save-all-tabs') {
      await saveCurrentWindowTabs();
    } else if (info.menuItemId === 'save-tab-session') {
      await saveCurrentTabGroup(tab);
    } else {
      await saveUrlToLinkKeep({ url: tab.url, title: tab.title });
    }

    setBadge('✓', '#22c55e');
  } catch {
    setBadge('✗', '#ef4444');
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
      await saveUrlToLinkKeep({ url: tab.url, title: tab.title });
      setBadge('✓', '#22c55e');
    } catch {
      setBadge('✗', '#ef4444');
    }
  }
});
