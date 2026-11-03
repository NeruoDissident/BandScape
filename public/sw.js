// BandScape service worker.
//
// __CACHE_VERSION__ is replaced at build time (see vite.config.js) with the
// git commit + build timestamp, so every deploy gets a fresh cache name.
// Old caches are deleted on activate, so closing the app and reopening it
// can never resurrect an old bundle or old data file.
//
// Strategy: network-first for everything same-origin. The cache is only a
// fallback for when the network actually fails (offline), never a source
// of truth while online. That is what makes "newest version on reopen"
// work: a stale cached copy is never served in preference to the network.

const CACHE_NAME = 'bandscape-__CACHE_VERSION__'

self.addEventListener('install', (event) => {
  // Don't wait for old tabs to close: a new build takes over immediately.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache from an older build.
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

// Let the page tell a waiting worker to activate right now.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  // Only handle same-origin requests; cross-origin (images, fonts) is
  // left to the browser so a failed cache write can never break the app.
  if (new URL(request.url).origin !== self.location.origin) return

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request)
        // Cache a copy for offline fallback, but only for successful,
        // fully-readable responses.
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME)
          cache.put(request, response.clone()).catch(() => {})
        }
        return response
      } catch (e) {
        const cache = await caches.open(CACHE_NAME)
        const cached = await cache.match(request)
        if (cached) return cached
        // Offline and never cached: fall back to the app shell for
        // navigations, so the PWA still opens instead of erroring.
        if (request.mode === 'navigate') {
          const shell = await cache.match('/')
          if (shell) return shell
        }
        return new Response('', { status: 504 })
      }
    })()
  )
})
