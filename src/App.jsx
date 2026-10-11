import { useEffect } from 'react'
import useDataStore from './store/DataStore'
import GraphView from './views/GraphView'
import MapView from './views/MapView'
import ThreeDView from './views/ThreeDView'
import InfoPanel from './components/InfoPanel'
import SearchBar from './components/SearchBar'
import TypeFilters from './components/TypeFilters'
import Presets from './components/Presets'
import PathTray from './components/PathTray'
import ShareTray from './components/ShareTray'
import Toast from './components/Toast'
import TimelineControls from './components/TimelineControls'
import SavedViews from './components/SavedViews'
import MobileControls from './components/MobileControls'
import { getRandomBackground, getBackgroundForNode } from './utils/backgrounds'
import DataQualityPanel from './components/DataQualityPanel'

function App() {
  const { 
    loadData, 
    isLoading, 
    error, 
    activeView, 
    setActiveView,
    selectedNode,
    requestFit,
    nodes,
    byId,
    setSelectedNode
  } = useDataStore()

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === '1') setActiveView('graph')
      else if (e.key === '2') setActiveView('map')
      else if (e.key === '3') setActiveView('3d')
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [setActiveView])

  // Background logic: cycle random on load/refresh; genre-based when selected
  useEffect(() => {
    const pick = () => {
      const current = getComputedStyle(document.body).getPropertyValue('--bg-image').trim()
      let currentUrl = null
      const m = current.match(/^url\((['"]?)(.*)\1\)$/)
      if (m) currentUrl = m[2]
      const url = selectedNode 
        ? getBackgroundForNode(selectedNode, byId, currentUrl)
        : getRandomBackground(currentUrl)
      if (url) {
        document.body.style.setProperty('--bg-image', `url("${url}")`)
      } else {
        // Fallback to a solid neutral if no images found
        document.body.style.setProperty('--bg-image', 'none')
        document.body.style.setProperty('background-color', '#f3f3f3')
      }
    }
    pick()
  }, [selectedNode, byId])

  // Deep-link: on load, if ?id= is present and node exists, select it and request fit
  useEffect(() => {
    if (!nodes || nodes.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    if (id && byId[id]) {
      setSelectedNode(byId[id])
      // allow views to render first, then fit
      setTimeout(() => requestFit(), 0)
    }
  }, [nodes, byId, setSelectedNode, requestFit])

  // Keep URL in sync with selection without reload
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selectedNode) {
      url.searchParams.set('id', selectedNode.id)
    } else {
      url.searchParams.delete('id')
    }
    window.history.pushState({}, '', url)
  }, [selectedNode])

  const renderView = () => {
    switch (activeView) {
      case 'map': return <MapView />
      case '3d': return <ThreeDView />
      default: return <GraphView />
    }
  }

  if (isLoading) {
    return (
      <div className="loading">
        <div>Loading BandScape data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error">
        <div>Error loading data: {error}</div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* Background Manager */}
      <div 
        className="background-manager"
        style={{ opacity: 1 }}
      />
      
      {/* View Switcher */}
      <div className="top-bar">
        <div className="left">
          <div className="view-switcher">
            <button 
              className={activeView === 'graph' ? 'active' : ''}
              onClick={() => setActiveView('graph')}
            >
              Graph
            </button>
            <button 
              className={activeView === 'map' ? 'active' : ''}
              onClick={() => setActiveView('map')}
            >
              Map
            </button>
            <button 
              className={activeView === '3d' ? 'active' : ''}
              onClick={() => setActiveView('3d')}
            >
              3D
            </button>
          </div>
          <Presets />
          <TypeFilters />
        </div>
        <div className="right">
          <SearchBar />
          <PathTray />
          <ShareTray />
          <TimelineControls />
          <SavedViews />
          <DataQualityPanel />
          <button 
            className="fit-btn" 
            onClick={requestFit} 
            title="Fit to selection or visible"
          >
            Fit
          </button>
        </div>
      </div>

      {/* Main View */}
      <div className="main-view">
        {renderView()}
      </div>

      {/* Info Panel */}
      <InfoPanel />

      {/* Mobile wrapper (small screens only) */}
      <MobileControls />

      {/* Toast */}
      <Toast />
    </div>
  )
}

export default App
