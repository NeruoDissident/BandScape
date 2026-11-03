import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import 'leaflet/dist/leaflet.css'
import { registerPWA } from './pwa.js'

// Handles service-worker updates + "newest version on reopen" so the
// installed PWA never needs a manual uninstall / cache clear.
registerPWA()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
