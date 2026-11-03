// PWA update handling: make a new deploy take over on reopen, without
// the user having to uninstall the PWA or clear their browser cache.
//
// How it works:
//  - The service worker (public/sw.js) already skipWaits and claims, and
//    every build gets a fresh cache name, so old caches are purged.
//  - This module is the missing half the old code never had: it actually
//    listens for an updated worker, asks it to activate, and reloads once
//    when the new worker takes control.
//  - It also checks for a new build on every foreground / reopen, and
//    asks the browser to check for a worker update when the app is hidden
//    (i.e. closed / backgrounded), so the next open starts fresh.
//  - As a belt-and-braces check, /version.json (written at build time,
//    fetched with cache: 'no-store') is compared against the last version
//    this device ran. A mismatch means a new deploy exists even if the
//    worker update check somehow missed it.

const VERSION_KEY = 'bandscape-app-version'
const RELOADING_KEY = 'bandscape-reloading'

function reloadOnce() {
  if (sessionStorage.getItem(RELOADING_KEY)) return
  sessionStorage.setItem(RELOADING_KEY, '1')
  window.location.reload()
}

export function registerPWA() {
  if (!('serviceWorker' in navigator)) return

  let registration = null
  let updateCheckPending = false

  const checkForUpdate = () => {
    if (!registration || updateCheckPending) return
    updateCheckPending = true
    registration
      .update()
      .catch(() => {})
      .finally(() => {
        updateCheckPending = false
      })
  }

  const activateWaitingWorker = () => {
    if (registration && registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
  }

  // A new worker taking control means a new build is ready: reload once
  // so the page actually runs it, instead of sitting on the old bundle.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    reloadOnce()
  })

  const checkVersionFile = async () => {
    try {
      const res = await fetch('/version.json', { cache: 'no-store' })
      if (!res.ok) return
      const { version } = await res.json()
      if (!version) return
      const previous = localStorage.getItem(VERSION_KEY)
      if (previous && previous !== version) {
        // New deploy. Prefer the worker path (clean cache purge), but
        // don't sit forever if no worker is waiting: reload once and
        // let the fresh worker + fresh cache name take over.
        localStorage.setItem(VERSION_KEY, version)
        activateWaitingWorker()
        window.setTimeout(() => {
          if (!sessionStorage.getItem(RELOADING_KEY)) reloadOnce()
        }, 1500)
      } else {
        localStorage.setItem(VERSION_KEY, version)
      }
    } catch {
      // version.json missing (e.g. dev server without a build step):
      // worker updates still work, so this is not fatal.
    }
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registration = reg
        // A worker already waiting (installed while the app was closed):
        // activate it now instead of waiting for another navigation.
        activateWaitingWorker()
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing
          if (!worker) return
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              activateWaitingWorker()
            }
          })
        })
        checkVersionFile()
      })
      .catch(() => {})
  })

  // Reopen / foreground: check for a new build right away.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForUpdate()
      checkVersionFile()
    } else {
      // Backgrounded / closed: ask the browser to fetch a fresh worker
      // now, so the next open doesn't start from a stale one.
      checkForUpdate()
    }
  })
  window.addEventListener('focus', () => {
    checkForUpdate()
    checkVersionFile()
  })
  // pagehide fires on close/navigation even when visibilitychange is
  // throttled; it is the closest thing to "when I close the app".
  window.addEventListener('pagehide', () => {
    checkForUpdate()
  })
}
