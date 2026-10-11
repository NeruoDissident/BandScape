import { useEffect, useRef } from 'react'
import L from 'leaflet'
import useDataStore from '../store/DataStore'

// Fix for default markers in Leaflet
// We'll use circle markers instead of default icons for color-by-type

function MapView() {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const markerByIdRef = useRef(new Map())
  const polylinesRef = useRef([])
  const pathPolylineRef = useRef(null)
  const polyByLinkRef = useRef([]) // { pl, sourceId, targetId }
  const { nodes, links, setSelectedNode, byId, selectedNode, filters, fitRequestId, pathNodeIds, pathStartId, pathEndId, setPathStart, setPathEnd, timelineMode, timelineStartTs, timelineEndTs } = useDataStore()

  useEffect(() => {
    if (!containerRef.current) return

    // Clear existing map
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    // Clear leaflet container ID to prevent hot reload issues
    if (containerRef.current._leaflet_id) {
      delete containerRef.current._leaflet_id
    }

    // Initialize map
    mapRef.current = L.map(containerRef.current, {
      preferCanvas: true
    })
    // Restore viewport if available
    try {
      const { mapCenter, mapZoom, mapBounds, viewLoadToken } = useDataStore.getState()
      if (viewLoadToken > 0 && mapBounds) {
        mapRef.current.fitBounds(mapBounds)
      } else if (viewLoadToken > 0 && mapCenter && mapZoom) {
        mapRef.current.setView(mapCenter, mapZoom)
      } else {
        mapRef.current.setView([40.7128, -74.0060], 2)
      }
    } catch {
      mapRef.current.setView([40.7128, -74.0060], 2)
    }

    // Add OSM tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapRef.current)

    // Clear previous overlays
    markersRef.current = []
    markerByIdRef.current = new Map()
    polylinesRef.current = []
    polyByLinkRef.current = []
    if (pathPolylineRef.current) {
      try { mapRef.current.removeLayer(pathPolylineRef.current) } catch {}
      pathPolylineRef.current = null
    }

    // Filter to allowed node types and coordinates
    const allowedTypes = ['band', 'member', 'label', 'venue', 'event']
    const filteredNodes = nodes.filter(node => {
      if (!allowedTypes.includes(node.type)) return false
      if (!(node.location && typeof node.location.lat === 'number' && typeof node.location.lng === 'number')) return false
      if (!timelineMode) return true
      const s = node._tsStart
      const e = node._tsEnd
      const overlap = (s == null && e == null) ||
        ((timelineEndTs == null || (s == null || s <= timelineEndTs)) && (timelineStartTs == null || (e == null || e >= timelineStartTs)))
      return overlap
    })
    const allowedIdSet = new Set(filteredNodes.map(n => n.id))

    console.log(`Map: Rendering markers=${filteredNodes.length}`)

    const getColor = (type) => {
      switch (type) {
        case 'band': return getComputedStyle(document.documentElement).getPropertyValue('--color-band') || '#ff6b6b'
        case 'member': return getComputedStyle(document.documentElement).getPropertyValue('--color-member') || '#4ecdc4'
        case 'label': return getComputedStyle(document.documentElement).getPropertyValue('--color-label') || '#45b7d1'
        case 'venue': return getComputedStyle(document.documentElement).getPropertyValue('--color-venue') || '#feca57'
        case 'event': return getComputedStyle(document.documentElement).getPropertyValue('--color-event') || '#ff9ff3'
        default: return '#666'
      }
    }

    filteredNodes.forEach(node => {
      const color = getColor(node.type).trim()
      const marker = L.circleMarker([node.location.lat, node.location.lng], {
        radius: 6,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95
      })
        .bindTooltip(`${node.name} (${node.type})`)
        .on('click', (e) => {
          try { if (e && e.originalEvent) L.DomEvent.stop(e); } catch {}
          const raw = e.originalEvent
          if (raw && raw.shiftKey) {
            if (!pathStartId) setPathStart(node.id)
            else if (!pathEndId) setPathEnd(node.id)
            else setPathStart(node.id)
          } else {
            setSelectedNode(node)
            console.log('Map: Selected node', node.name)
          }
          // local dim handled by selection effect below
        })
        .on('mouseover', () => {
          marker.setStyle({ radius: 6.6, weight: 3 })
        })
        .on('mouseout', () => {
          marker.setStyle({ radius: 6, weight: 2 })
        })
        .addTo(mapRef.current)
      
      markersRef.current.push(marker)
      markerByIdRef.current.set(node.id, marker)
      // annotate for filtering/fit
      marker.__nodeId = node.id
      marker.__nodeType = node.type
    })

    // Add polylines for links where both endpoints are allowed and have coordinates
    let polylineCount = 0
    links.forEach(link => {
      const sourceNode = byId[link.source]
      const targetNode = byId[link.target]

      if (!sourceNode || !targetNode) return
      if (!allowedIdSet.has(sourceNode.id) || !allowedIdSet.has(targetNode.id)) return
      if (timelineMode) {
        const s = link._tsStart
        const e = link._tsEnd
        const overlap = (s == null && e == null) ||
          ((timelineEndTs == null || (s == null || s <= timelineEndTs)) && (timelineStartTs == null || (e == null || e >= timelineStartTs)))
        if (!overlap) return
      }

      const sLoc = sourceNode.location
      const tLoc = targetNode.location
      if (
        sLoc && tLoc &&
        typeof sLoc.lat === 'number' && typeof sLoc.lng === 'number' &&
        typeof tLoc.lat === 'number' && typeof tLoc.lng === 'number'
      ) {
        const pl = L.polyline([
          [sLoc.lat, sLoc.lng],
          [tLoc.lat, tLoc.lng]
        ], {
          color: '#666',
          weight: 2,
          opacity: 0.6
        }).addTo(mapRef.current)
        polylinesRef.current.push(pl)
        pl.__sourceId = sourceNode.id
        pl.__targetId = targetNode.id
        polyByLinkRef.current.push({ pl, sourceId: sourceNode.id, targetId: targetNode.id })
        polylineCount++
      }
    })

    console.log(`Map: Rendering polylines=${polylineCount}`)

    // Fit bounds to all markers
    if (markersRef.current.length > 0) {
      const group = new L.featureGroup(markersRef.current)
      mapRef.current.fitBounds(group.getBounds().pad(0.1))
    }

    // Click on empty map clears selection
    const onMapClick = () => {
      setSelectedNode(null)
      // Styles reset handled by selection effect
    }
    mapRef.current.on('click', onMapClick)

    return () => {
      if (mapRef.current) {
        mapRef.current.off('click', onMapClick)
        try {
          const center = mapRef.current.getCenter()
          const zoom = mapRef.current.getZoom()
          const bounds = mapRef.current.getBounds()
          useDataStore.getState().setMapViewport([center.lat, center.lng], zoom, bounds)
        } catch {}
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [nodes, links, setSelectedNode, byId, pathStartId, pathEndId, setPathStart, setPathEnd])

  // Respond to external selection (click or search)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // Reset markers/polylines to filtered defaults
    markersRef.current.forEach(m => {
      const visible = !!filters[m.__nodeType]
      m.setStyle({ opacity: visible ? 0.95 : 0, fillOpacity: visible ? 0.95 : 0, weight: visible ? 2 : 0, radius: 6 })
    })
    polylinesRef.current.forEach(pl => {
      const sVisible = !!filters[byId[pl.__sourceId]?.type]
      const tVisible = !!filters[byId[pl.__targetId]?.type]
      const on = sVisible && tVisible
      pl.setStyle({ color: '#888', weight: on ? 2 : 0, opacity: on ? 0.7 : 0 })
    })
    if (!selectedNode) return

    const selectedMarker = markerByIdRef.current.get(selectedNode.id)
    if (selectedMarker) {
      // Dim others (only those visible by filter)
      markersRef.current.forEach(m => {
        const visible = !!filters[m.__nodeType]
        if (visible) m.setStyle({ opacity: 0.35, fillOpacity: 0.35 })
      })
      selectedMarker.setStyle({ opacity: 1, fillOpacity: 1, weight: 4, radius: 7 })
      try { selectedMarker.bringToFront() } catch {}

      // Neighbors = nodes connected by any link
      const neighborIds = new Set()
      polyByLinkRef.current.forEach(({ pl, sourceId, targetId }) => {
        if (sourceId === selectedNode.id || targetId === selectedNode.id) {
          neighborIds.add(sourceId)
          neighborIds.add(targetId)
          // Emphasize connected polylines (respect filter vis)
          const sVisible = !!filters[byId[sourceId]?.type]
          const tVisible = !!filters[byId[targetId]?.type]
          if (sVisible && tVisible) pl.setStyle({ color: '#333', weight: 3, opacity: 1 })
        } else {
          // Dim unrelated polylines
          const sVisible = !!filters[byId[sourceId]?.type]
          const tVisible = !!filters[byId[targetId]?.type]
          if (sVisible && tVisible) pl.setStyle({ color: '#999', weight: 2, opacity: 0.4 })
        }
      })
      neighborIds.forEach(id => {
        const mk = markerByIdRef.current.get(id)
        const visible = !!filters[byId[id]?.type]
        if (mk && id !== selectedNode.id && visible) mk.setStyle({ opacity: 1, fillOpacity: 1, weight: 2, radius: 6 })
      })

      // Center (no zoom change)
      try {
        const latlng = selectedMarker.getLatLng()
        map.panTo(latlng, { animate: true, duration: 0.5 })
      } catch {}
    }
  }, [selectedNode])

  // Apply filters: hide/show markers and polylines without recreating map
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // marker visibility by type
    markersRef.current.forEach(m => {
      const isSelected = selectedNode && m.__nodeId === selectedNode.id
      const visibleByType = !!filters[m.__nodeType]
      if (isSelected) {
        m.setStyle({ opacity: 1, fillOpacity: 1, weight: 4, radius: 7 })
        try { m.bringToFront() } catch {}
      } else {
        m.setStyle({ opacity: visibleByType ? 0.9 : 0, fillOpacity: visibleByType ? 0.9 : 0, weight: visibleByType ? 2 : 0, radius: 6 })
      }
    })
    // polyline visible only if both endpoints visible
    polylinesRef.current.forEach(pl => {
      const sVisible = !!filters[byId[pl.__sourceId]?.type]
      const tVisible = !!filters[byId[pl.__targetId]?.type]
      const on = sVisible && tVisible
      pl.setStyle({ opacity: on ? 0.6 : 0, weight: on ? 2 : 0 })
    })
  }, [filters, byId, selectedNode])

  // Path overlay and highlighting
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // remove old path polyline if any
    if (pathPolylineRef.current) {
      try { map.removeLayer(pathPolylineRef.current) } catch {}
      pathPolylineRef.current = null
    }
    // Reset marker emphasis first to filtered defaults
    markersRef.current.forEach(m => {
      const visibleByType = !!filters[m.__nodeType]
      m.setStyle({ opacity: visibleByType ? 0.9 : 0, fillOpacity: visibleByType ? 0.9 : 0, weight: visibleByType ? 2 : 0, radius: 6 })
    })
    if (!pathNodeIds || pathNodeIds.length === 0) return
    const idsOnPath = new Set(pathNodeIds)
    // Emphasize markers on the path (match selection emphasis)
    markersRef.current.forEach(m => {
      if (idsOnPath.has(m.__nodeId)) {
        m.setStyle({ opacity: 1, fillOpacity: 1, weight: 5, radius: 7 })
        try { m.bringToFront() } catch {}
      } else {
        if (m.options && (m.options.weight ?? 0) > 0) {
          m.setStyle({ opacity: 0.3, fillOpacity: 0.3 })
        }
      }
    })
    // If all nodes on path have coordinates, draw a single emphasized polyline
    const coords = pathNodeIds.map(id => byId[id]?.location)
    const allHaveCoords = coords.every(loc => loc && typeof loc.lat === 'number' && typeof loc.lng === 'number')
    if (allHaveCoords && coords.length >= 2) {
      const latlngs = coords.map(loc => [loc.lat, loc.lng])
      const pl = L.polyline(latlngs, { color: '#ffffff', weight: 6, opacity: 1 })
      pl.addTo(map)
      pathPolylineRef.current = pl
      try { pl.bringToFront() } catch {}
    }
  }, [pathNodeIds, byId, filters])

  // Fit control handler (per view)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    try {
      const visibleMarkers = markersRef.current.filter(m => m.options && (m.options.weight ?? 0) > 0 && (m.options.opacity ?? 0) > 0)
      if (selectedNode) {
        const selectedMarker = markerByIdRef.current.get(selectedNode.id)
        if (selectedMarker && visibleMarkers.includes(selectedMarker)) {
          // gather neighbors that are visible
          const neighborIds = new Set([selectedNode.id])
          polyByLinkRef.current.forEach(({ sourceId, targetId }) => {
            if (sourceId === selectedNode.id) neighborIds.add(targetId)
            if (targetId === selectedNode.id) neighborIds.add(sourceId)
          })
          const neighborMarkers = Array.from(neighborIds)
            .map(id => markerByIdRef.current.get(id))
            .filter(m => m && visibleMarkers.includes(m))
          if (neighborMarkers.length > 0) {
            const group = L.featureGroup(neighborMarkers)
            map.fitBounds(group.getBounds(), { padding: [50, 50], animate: true })
            return
          }
        }
      }
      // no selection or none visible -> fit all visible markers
      if (visibleMarkers.length > 0) {
        const group = L.featureGroup(visibleMarkers)
        map.fitBounds(group.getBounds(), { padding: [50, 50], animate: true })
      }
    } catch {}
  }, [fitRequestId, selectedNode])

  return (
    <div 
      ref={containerRef} 
      className="map-view"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

export default MapView
