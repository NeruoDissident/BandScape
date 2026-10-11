import { useState } from 'react'
import Presets from './Presets'
import TypeFilters from './TypeFilters'
import SearchBar from './SearchBar'
import PathTray from './PathTray'
import ShareTray from './ShareTray'
import TimelineControls from './TimelineControls'
import SavedViews from './SavedViews'
import DataQualityPanel from './DataQualityPanel'
import useDataStore from '../store/DataStore'

export default function MobileControls() {
  const [open, setOpen] = useState(false)
  const { requestFit, activeView, setActiveView } = useDataStore()

  const close = () => setOpen(false)

  return (
    <div className={`mobile-only ${open ? 'is-open' : ''}`}>
      {/* Scrim */}
      <div 
        className={`mobile-scrim ${open ? 'open' : ''}`}
        onClick={close}
        aria-hidden={!open}
      />

      {/* Bottom sheet */}
      <div className={`mobile-drawer ${open ? 'open' : ''}`} role="dialog" aria-modal="false">
        <div className="mobile-drawer-header">
          <div className="mobile-drawer-title">Controls</div>
          <button className="mobile-close" onClick={close} aria-label="Close">✕</button>
        </div>
        <div className="mobile-drawer-content">
          <div className="mc-row">
            <div className="view-switcher">
              <button 
                className={activeView === 'graph' ? 'active' : ''}
                onClick={() => { setActiveView('graph'); close() }}
              >
                Graph
              </button>
              <button 
                className={activeView === 'map' ? 'active' : ''}
                onClick={() => { setActiveView('map'); close() }}
              >
                Map
              </button>
              <button 
                className={activeView === '3d' ? 'active' : ''}
                onClick={() => { setActiveView('3d'); close() }}
              >
                3D
              </button>
            </div>
          </div>
          {/* Reuse existing controls; stacked for small screens */}
          <div className="mc-row"><SearchBar /></div>
          <div className="mc-row"><Presets /></div>
          <div className="mc-row"><TypeFilters /></div>
          <div className="mc-row"><TimelineControls /></div>
          <div className="mc-row"><PathTray /></div>
          <div className="mc-row"><ShareTray /></div>
          <div className="mc-row"><SavedViews /></div>
          <div className="mc-row"><DataQualityPanel /></div>
          <div className="mc-row mc-actions">
            <button className="btn" onClick={() => { requestFit(); close() }}>Fit View</button>
          </div>
        </div>
      </div>

      {/* Floating action button */}
      <button 
        className="mobile-fab" 
        onClick={() => setOpen(true)}
        aria-label="Open Controls"
      >
        ☰
      </button>
    </div>
  )
}


