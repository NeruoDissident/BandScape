import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Every build gets a unique version (git commit, falling back to a
// timestamp). It is written to dist/version.json and stamped into
// dist/sw.js as its cache name, so a new deploy can never be mistaken
// for the old one by the browser, the service worker, or the app itself.
function buildVersion() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return `dev-${Date.now()}`
  }
}

function bandscapeVersionPlugin() {
  const version = buildVersion()
  const builtAt = new Date().toISOString()
  return {
    name: 'bandscape-version',
    closeBundle() {
      const outDir = resolve('dist')
      writeFileSync(
        resolve(outDir, 'version.json'),
        JSON.stringify({ version, builtAt }, null, 2) + '\n'
      )
      // public/sw.js is copied verbatim to dist/sw.js; stamp it with
      // this build's cache name so activate() purges older caches.
      try {
        const swPath = resolve(outDir, 'sw.js')
        const sw = readFileSync(swPath, 'utf8')
        writeFileSync(swPath, sw.replaceAll('__CACHE_VERSION__', version))
      } catch {
        // No sw.js in this build (e.g. a library-mode build): nothing to stamp.
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), bandscapeVersionPlugin()],
  resolve: {
    alias: [
      // 3d-force-graph nests its own copy of three; alias the bare specifier
      // to the top-level copy so the app and the library share ONE instance.
      // (Mixing instances breaks instanceof checks inside three.)
      // Exact match only — subpaths like three/examples/... keep resolving normally.
      { find: /^three$/, replacement: fileURLToPath(new URL('./node_modules/three', import.meta.url)) },
    ],
  },
})
