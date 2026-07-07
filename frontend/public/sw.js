const CACHE_NAME = 'linkkeep-v4'
const QUEUE_DB = 'linkkeep-offline-queue'
const QUEUE_STORE = 'requests'
const SYNC_TAG = 'linkkeep-background-sync'
const STATIC_ASSETS = ['/', '/manifest.json']

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, fn) {
  const db = await openQueueDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, mode)
    const store = tx.objectStore(QUEUE_STORE)
    const result = fn(store)
    if (result && 'onsuccess' in result) {
      result.onsuccess = () => resolve(result.result)
      result.onerror = () => reject(result.error)
    } else {
      tx.oncomplete = () => resolve(result)
    }
    tx.onerror = () => reject(tx.error)
  })
}

async function queueRequest(request) {
  const clone = request.clone()
  const body = await clone.text()
  const headers = {}
  clone.headers.forEach((value, key) => { headers[key] = value })
  await withStore('readwrite', (store) => store.add({ url: clone.url, method: clone.method, headers, body, createdAt: Date.now() }))
  if ('sync' in self.registration) await self.registration.sync.register(SYNC_TAG)
}

async function drainQueue() {
  const items = await withStore('readonly', (store) => store.getAll())
  for (const item of items || []) {
    const response = await fetch(item.url, {
      method: item.method,
      headers: item.headers,
      body: item.body || undefined,
    })
    if (!response.ok) throw new Error(`Queued request failed: ${response.status}`)
    await withStore('readwrite', (store) => store.delete(item.id))
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET') {
    if (url.pathname.startsWith('/api/links')) {
      event.respondWith(
        fetch(request.clone()).catch(async () => {
          await queueRequest(request)
          return new Response(JSON.stringify({ queued: true, offline: true }), {
            status: 202,
            headers: { 'Content-Type': 'application/json' },
          })
        })
      )
    }
    return
  }

  if (url.pathname.startsWith('/api/archives') || /\/api\/links\/\d+\/archives$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(request).then((response) => {
          if (response && response.ok) cache.put(request, response.clone())
          return response
        }).catch(() => cache.match(request))
      )
    )
    return
  }

  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone))
        }
        return response
      }).catch(() => cached || caches.match('/'))
      return cached || fetchPromise
    })
  )
})

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(drainQueue())
})
