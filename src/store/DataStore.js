import { create } from 'zustand'

const useDataStore = create((set, get) => ({
  // Data state
  nodes: [],
  links: [],
  byId: {},
  isLoading: true,
  error: null,
  
  // UI state
  selectedNode: null,
  activeView: 'graph', // 'graph', 'map'
  // Global type filters (persist across tabs)
  filters: {
    band: true,
    member: true,
    label: false,
    venue: false,
    event: false
  },
  // Fit request signal
  fitRequestId: 0,

  // Path finding state
  pathStartId: null,
  pathEndId: null,
  pathNodeIds: [], // ordered node ids of the current path
  pathNotFound: false,

  // Snapshot and share utilities
  graphSnapshotRequestId: 0,
  // Toast UI state
  toastMessage: '',
  toastVisible: false,

  // Timeline filtering
  timelineMode: false,
  datasetMinTs: null,
  datasetMaxTs: null,
  timelineStartTs: null,
  timelineEndTs: null,

  // View/camera state
  graphPan: { x: 0, y: 0 },
  graphZoom: 1,
  mapCenter: [40.7128, -74.0060],
  mapZoom: 2,
  mapBounds: null,
  viewLoadToken: 0,
  
  // Actions
  setSelectedNode: (node) => set({ selectedNode: node }),
  setActiveView: (view) => set({ activeView: view }),
  toggleFilter: (type) => set(state => ({ filters: { ...state.filters, [type]: !state.filters[type] } })),
  resetFilters: () => set({ filters: { band: true, member: true, label: false, venue: false, event: false } }),
  setFilters: (next) => set({ filters: { ...get().filters, ...next } }),
  applyPreset: (name) => {
    const presets = {
      people: { band: false, member: true, label: false, venue: false, event: false },
      bands_members: { band: true, member: true, label: false, venue: false, event: false },
      venues_map: { band: false, member: false, label: false, venue: true, event: true },
      labels_bands: { band: true, member: false, label: true, venue: false, event: false },
    }
    const preset = presets[name]
    if (preset) set({ filters: preset })
  },
  requestFit: () => set(state => ({ fitRequestId: state.fitRequestId + 1 })),

  // Snapshot trigger
  requestGraphSnapshot: () => set(state => ({ graphSnapshotRequestId: state.graphSnapshotRequestId + 1 })),

  // Toast helper
  showToast: (message, durationMs = 1200) => {
    set({ toastMessage: message, toastVisible: true })
    try {
      setTimeout(() => {
        set({ toastVisible: false })
      }, durationMs)
    } catch {}
  },

  setTimelineMode: (on) => set({ timelineMode: !!on }),
  setTimelineRange: (startTs, endTs) => set({ timelineStartTs: startTs, timelineEndTs: endTs }),

  setGraphCamera: (pan, zoom) => set({ graphPan: pan, graphZoom: zoom }),
  setMapViewport: (center, zoom, bounds) => set({ mapCenter: center, mapZoom: zoom, mapBounds: bounds ?? null }),

  // Saved views (localStorage)
  refreshSavedViews: () => {
    try {
      const raw = localStorage.getItem('bandscape_saved_views')
      const list = raw ? JSON.parse(raw) : []
      set({ _savedViewsCache: list })
    } catch {}
  },
  getSavedViews: () => {
    try {
      const raw = localStorage.getItem('bandscape_saved_views')
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  },
  saveCurrentView: (name) => {
    const s = get()
    const record = {
      id: Date.now().toString(),
      name: name || 'View',
      state: {
        activeView: s.activeView,
        filters: s.filters,
        timelineMode: s.timelineMode,
        timelineStartTs: s.timelineStartTs,
        timelineEndTs: s.timelineEndTs,
        selectedNodeId: s.selectedNode?.id ?? null,
        graphPan: s.graphPan,
        graphZoom: s.graphZoom,
        mapCenter: s.mapCenter,
        mapZoom: s.mapZoom,
        mapBounds: s.mapBounds
      }
    }
    try {
      const list = get().getSavedViews()
      list.push(record)
      localStorage.setItem('bandscape_saved_views', JSON.stringify(list))
      set({ _savedViewsCache: list })
    } catch {}
  },
  renameSavedView: (id, nextName) => {
    try {
      const list = get().getSavedViews()
      const idx = list.findIndex(v => v.id === id)
      if (idx >= 0) {
        list[idx].name = nextName
        localStorage.setItem('bandscape_saved_views', JSON.stringify(list))
        set({ _savedViewsCache: list })
      }
    } catch {}
  },
  deleteSavedView: (id) => {
    try {
      let list = get().getSavedViews()
      list = list.filter(v => v.id !== id)
      localStorage.setItem('bandscape_saved_views', JSON.stringify(list))
      set({ _savedViewsCache: list })
    } catch {}
  },
  loadSavedView: (id) => {
    const s = get()
    let list = []
    try { list = s.getSavedViews() } catch {}
    const rec = list.find(v => v.id === id)
    if (!rec) return
    const st = rec.state || {}
    // Clamp timeline
    const minTs = s.datasetMinTs
    const maxTs = s.datasetMaxTs
    const clamp = (ts) => {
      if (ts == null) return ts
      if (minTs != null && ts < minTs) return minTs
      if (maxTs != null && ts > maxTs) return maxTs
      return ts
    }
    const nextSelected = st.selectedNodeId && s.byId[st.selectedNodeId] ? s.byId[st.selectedNodeId] : null
    set({
      activeView: st.activeView ?? s.activeView,
      filters: st.filters ?? s.filters,
      timelineMode: !!st.timelineMode,
      timelineStartTs: clamp(st.timelineStartTs ?? s.timelineStartTs),
      timelineEndTs: clamp(st.timelineEndTs ?? s.timelineEndTs),
      selectedNode: nextSelected,
      graphPan: st.graphPan ?? s.graphPan,
      graphZoom: st.graphZoom ?? s.graphZoom,
      mapCenter: st.mapCenter ?? s.mapCenter,
      mapZoom: st.mapZoom ?? s.mapZoom,
      mapBounds: st.mapBounds ?? s.mapBounds,
      viewLoadToken: s.viewLoadToken + 1
    })
  },

  // Path finding controls
  setPathStart: (nodeId) => set({ pathStartId: nodeId }),
  setPathEnd: (nodeId) => set({ pathEndId: nodeId }),
  clearPath: () => set({ pathNodeIds: [], pathNotFound: false, pathStartId: null, pathEndId: null }),
  findPath: () => {
    const { nodes, links, filters, pathStartId, pathEndId } = get()
    if (!pathStartId || !pathEndId || pathStartId === pathEndId) {
      set({ pathNodeIds: pathStartId && pathEndId && pathStartId === pathEndId ? [pathStartId] : [], pathNotFound: false })
      return
    }

    // Build adjacency for allowed node types only
    const allowed = new Set(nodes.filter(n => !!filters[n.type]).map(n => n.id))
    const adjacency = new Map()
    allowed.forEach(id => adjacency.set(id, []))
    links.forEach(l => {
      const a = l.source
      const b = l.target
      if (allowed.has(a) && allowed.has(b)) {
        // undirected graph
        adjacency.get(a).push(b)
        adjacency.get(b).push(a)
      }
    })

    // BFS
    const queue = []
    const visited = new Set()
    const parent = new Map()
    queue.push(pathStartId)
    visited.add(pathStartId)
    let found = false
    while (queue.length > 0) {
      const current = queue.shift()
      if (current === pathEndId) { found = true; break }
      const neighbors = adjacency.get(current) || []
      for (const nb of neighbors) {
        if (!visited.has(nb)) {
          visited.add(nb)
          parent.set(nb, current)
          queue.push(nb)
        }
      }
    }

    if (!found) {
      set({ pathNodeIds: [], pathNotFound: true })
      return
    }

    // Reconstruct path
    const path = []
    let at = pathEndId
    while (at != null) {
      path.push(at)
      at = parent.get(at)
      if (at === pathStartId) { path.push(at); break }
    }
    path.reverse()
    set({ pathNodeIds: path, pathNotFound: false })
  },
  
  // Data loading
  loadData: async () => {
    try {
      set({ isLoading: true, error: null })

      const fetchText = async (url) => {
        const res = await fetch(url)
        return { ok: res.ok, status: res.status, statusText: res.statusText, text: res.ok ? await res.text() : '' }
      }

      // Load data from separate JSON files: nodesData.json and linksData.json
      let source = 'nodesData.json + linksData.json'
      let data = { nodes: [], links: [] }
      
      // Fetch nodes data
      const nodesResp = await fetchText('/nodesData.json')
      if (!nodesResp.ok) {
        throw new Error(`Failed to fetch /nodesData.json: ${nodesResp.status} ${nodesResp.statusText}`)
      }
      
      // Fetch links data
      const linksResp = await fetchText('/linksData.json')
      if (!linksResp.ok) {
        throw new Error(`Failed to fetch /linksData.json: ${linksResp.status} ${linksResp.statusText}`)
      }
      
      try {
        // Parse nodes
        const nodes = JSON.parse(nodesResp.text)
        if (!Array.isArray(nodes)) {
          throw new Error('nodesData.json must contain an array of nodes')
        }
        // Backward compatibility: migrate legacy 'tags' -> 'tag_ids' if present
        // This ensures older datasets using `tags` continue to work without changes.
        for (const n of nodes) {
          if (n && Array.isArray(n.tags) && !Array.isArray(n.tag_ids)) {
            n.tag_ids = n.tags
          }
        }
        data.nodes = nodes
        
        // Parse links and transform to expected format
        const linksArray = JSON.parse(linksResp.text)
        if (!Array.isArray(linksArray)) {
          throw new Error('linksData.json must contain an array of links')
        }
        
        // Transform links from {from, to, type, ...} to {source, target, type, ...} format
        data.links = linksArray.map((link, index) => ({
          id: `link_${index + 1}`,
          type: link.type === 'member_of' ? 'membership' : link.type,
          source: link.from,
          target: link.to,
          start_date: link.start_date,
          end_date: link.end_date,
          roles: link.roles || [],
          attributes: link.attributes || {}
        }))
        
      } catch (e) {
        throw new Error(`Failed to parse JSON data: ${e.message}`)
      }

      // Validate data structure
      if (!data.nodes || !Array.isArray(data.nodes) || data.nodes.length === 0) {
        throw new Error('Invalid data: nodes array is empty or missing')
      }
      if (!data.links || !Array.isArray(data.links)) {
        throw new Error('Invalid data: links array is missing')
      }

      // Pre-compute timestamps on nodes/links and dataset extent
      const parseTs = (v) => {
        if (!v) return null
        const d = new Date(v)
        const t = d.getTime()
        return isNaN(t) ? null : t
      }
      let minTs = null
      let maxTs = null
      data.nodes.forEach(n => {
        const tsS = parseTs(n.start_date)
        const tsE = parseTs(n.end_date)
        n._tsStart = tsS
        n._tsEnd = tsE
        if (tsS != null) { minTs = (minTs == null) ? tsS : Math.min(minTs, tsS) }
        if (tsE != null) { maxTs = (maxTs == null) ? tsE : Math.max(maxTs, tsE) }
      })
      data.links.forEach(l => {
        const tsS = parseTs(l.start_date)
        const tsE = parseTs(l.end_date)
        l._tsStart = tsS
        l._tsEnd = tsE
        if (tsS != null) { minTs = (minTs == null) ? tsS : Math.min(minTs, tsS) }
        if (tsE != null) { maxTs = (maxTs == null) ? tsE : Math.max(maxTs, tsE) }
      })

      // Build byId lookup
      const byId = Object.fromEntries(data.nodes.map(n => [n.id, n]))

      console.log(`Loaded from ${source}: nodes=${data.nodes.length}, links=${data.links.length}`)

      set({
        nodes: data.nodes,
        links: data.links,
        byId,
        isLoading: false,
        error: null,
        datasetMinTs: minTs,
        datasetMaxTs: maxTs,
        timelineStartTs: minTs,
        timelineEndTs: maxTs
      })

    } catch (error) {
      console.error('Failed to load data:', error)
      set({ 
        error: error.message, 
        isLoading: false 
      })
    }
  }
}))

export default useDataStore
