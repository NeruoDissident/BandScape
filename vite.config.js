import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
