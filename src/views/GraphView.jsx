import { useEffect, useRef } from 'react'
import cytoscape from 'cytoscape'
import useDataStore from '../store/DataStore'

function GraphView() {
  const containerRef = useRef(null)
  const cyRef = useRef(null)
  const { nodes, links, setSelectedNode, byId, selectedNode, filters, fitRequestId, pathNodeIds, pathStartId, pathEndId, setPathStart, setPathEnd, graphSnapshotRequestId, showToast, timelineMode, timelineStartTs, timelineEndTs } = useDataStore()
  const pathStartIdRef = useRef(pathStartId)
  const pathEndIdRef = useRef(pathEndId)
  const hoverTimerRef = useRef(null)
  const tooltipRef = useRef(null)

  useEffect(() => { pathStartIdRef.current = pathStartId }, [pathStartId])
  useEffect(() => { pathEndIdRef.current = pathEndId }, [pathEndId])

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return

    // Clear existing instance
    if (cyRef.current) {
      cyRef.current.destroy()
    }

    // Create tooltip root if needed
    if (!tooltipRef.current) {
      const div = document.createElement('div')
      div.className = 'hover-tip'
      div.style.display = 'none'
      document.body.appendChild(div)
      tooltipRef.current = div
    }

    // Prepare elements with filtering: only render allowed node types and links between them
    const allowedTypes = ['band', 'member', 'label', 'venue', 'event']
    const filteredNodes = nodes.filter(n => allowedTypes.includes(n.type))
    const nodeIdSet = new Set(filteredNodes.map(n => n.id))
    const filteredLinks = links.filter(l => nodeIdSet.has(l.source) && nodeIdSet.has(l.target))

    // Precompute simple connection counts per node by link type for concise tooltips
    const connById = {}
    const bump = (id, type) => {
      if (!id) return
      if (!connById[id]) connById[id] = { total: 0, membership: 0, label_signing: 0, hosted_at: 0 }
      connById[id].total += 1
      if (type && connById[id][type] !== undefined) connById[id][type] += 1
    }
    for (const l of filteredLinks) {
      bump(l.source, l.type)
      bump(l.target, l.type)
    }

    // Precompute neighbor band names per member from links (link-first, ignore node arrays)
    const bandNamesByMemberId = new Map()
    for (const l of filteredLinks) {
      if (l.type !== 'membership') continue
      const src = byId[l.source]
      const tgt = byId[l.target]
      if (!src || !tgt) continue
      // membership is member -> band (but tolerate either direction by checking types)
      if (src.type === 'member' && tgt.type === 'band') {
        const list = bandNamesByMemberId.get(src.id) || []
        if (tgt.name && !list.includes(tgt.name)) list.push(tgt.name)
        bandNamesByMemberId.set(src.id, list)
      } else if (src.type === 'band' && tgt.type === 'member') {
        const list = bandNamesByMemberId.get(tgt.id) || []
        if (src.name && !list.includes(src.name)) list.push(src.name)
        bandNamesByMemberId.set(tgt.id, list)
      }
    }

    console.log(`Graph: Rendering nodes=${filteredNodes.length}, links=${filteredLinks.length}`)

    const elements = [
      // Nodes
      ...filteredNodes.map(node => ({
        data: {
          id: node.id,
          label: node.type === 'band' ? ((node.name || '').toUpperCase()) : (node.name || ''),
          type: node.type
        }
      })),
      // Edges
      ...filteredLinks.map((link, index) => ({
        data: {
          id: `edge-${index}`,
          source: link.source,
          target: link.target,
          label: link.label || link.type,
          type: link.type,
          _tsStart: link._tsStart ?? null,
          _tsEnd: link._tsEnd ?? null
        }
      }))
    ]

    // Initialize Cytoscape
    cyRef.current = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '13px',
            'min-zoomed-font-size': 10,
            'font-family': 'Arial Narrow, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
            'font-weight': 600,
            'text-wrap': 'wrap',
            'text-max-width': '100px',
            'color': '#000',
            'text-outline-width': 2,
            'text-outline-color': '#fff',
            'width': '66px',
            'height': '66px',
            'border-width': 2,
            'border-color': '#000'
          }
        },
        {
          selector: '.faded',
          style: { 'opacity': 0.45 }
        },
        {
          selector: '.highlight',
          style: { 'opacity': 1 }
        },
        {
          selector: 'node.highlight',
          style: {
            'border-width': 6,
            'border-color': '#fff',
            'shadow-blur': 18,
            'shadow-color': '#ffffff',
            'shadow-opacity': 0.9,
            'text-outline-width': 4,
            'text-outline-color': '#ffffff'
          }
        },
        {
          selector: '.hovered',
          style: {
            'border-width': 3,
            'border-color': '#222',
            'width': '63px',
            'height': '63px'
          }
        },
        {
          selector: 'node[type="band"]',
          style: {
            'shape': 'round-rectangle',
            'background-color': '#ff1493',
            'width': '160px',
            'height': '48px',
            'text-max-width': '140px'
          }
        },
        {
          selector: 'node[type="member"]',
          style: {
            'shape': 'ellipse',
            'background-color': '#0ea5b7',
            'width': '80px',
            'height': '80px',
            'text-max-width': '62px'
          }
        },
        {
          selector: 'node[type="label"]',
          style: {
            'shape': 'diamond',
            'background-color': '#ffd60a',
            'width': '90px',
            'height': '90px',
            'text-max-width': '70px'
          }
        },
        {
          selector: 'node[type="venue"]',
          style: {
            'shape': 'triangle',
            'background-color': '#ff8c00',
            'width': '92px',
            'height': '92px',
            'text-max-width': '72px'
          }
        },
        {
          selector: 'node[type="event"]',
          style: {
            'shape': 'star',
            'background-color': '#8b5cf6',
            'width': '92px',
            'height': '92px',
            'text-max-width': '72px'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#ccc',
            'target-arrow-color': '#ccc',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '10px',
            'text-rotation': 'autorotate'
          }
        }
        ,
        {
          selector: 'edge.highlight',
          style: {
            'width': 5,
            'opacity': 1,
            'line-color': '#ffffff',
            'target-arrow-color': '#ffffff'
          }
        }
        ,
        {
          selector: 'node.path',
          style: {
            'opacity': 1,
            'border-width': 6,
            'border-color': '#fff',
            'shadow-blur': 18,
            'shadow-color': '#ffffff',
            'shadow-opacity': 0.9,
            'text-outline-width': 4,
            'text-outline-color': '#ffffff'
          }
        },
        {
          selector: 'edge.path',
          style: {
            'opacity': 1,
            'line-color': '#ffffff',
            'target-arrow-color': '#ffffff',
            'width': 5
          }
        }
      ],
      layout: {
        name: 'cose',
        animate: true,
        padding: 20
      },
      wheelSensitivity: 0.25
    })

    // Event handlers
    cyRef.current.on('tap', 'node', (evt) => {
      const raw = evt.originalEvent
      // If Shift is held, this is a path-pick action; skip selection/highlight
      if (raw && raw.shiftKey) return
      const nodeId = evt.target.data('id')
      const node = byId[nodeId]
      if (node) {
        setSelectedNode(node)
        console.log('Graph: Selected node', node.name)

        // Dim unrelated elements, highlight neighborhood
        const nhood = evt.target.closedNeighborhood()
        cyRef.current.elements().addClass('faded')
        nhood.removeClass('faded').addClass('highlight')
        nhood.edges().addClass('highlight')
      }
    })

    // Shift+Click to quickly set Start/End for path
    cyRef.current.on('tap', 'node', (evt) => {
      const raw = evt.originalEvent
      if (!raw || !raw.shiftKey) return
      const nodeId = evt.target.data('id')
      const hasStart = !!pathStartIdRef.current
      const hasEnd = !!pathEndIdRef.current
      if (!hasStart) setPathStart(nodeId)
      else if (!hasEnd) setPathEnd(nodeId)
      else setPathStart(nodeId)
    })

    // Helper to build tooltip content
    const buildTooltipHtml = (node) => {
      const lines = []
      const typeText = node.type || ''
      const name = node.name || ''
      lines.push(`<div class="ht-name">${name}</div>`)
      // Suppress raw type label for members; we will show a friendlier line below
      if (typeText && typeText !== 'member') {
        lines.push(`<div class="ht-type">${typeText}</div>`)
      }
      const years = (node.start_date || node.end_date) ? `${node.start_date || ''}${(node.start_date && node.end_date) ? ' — ' : ''}${node.end_date || (node.start_date ? 'Present' : '')}` : ''
      if (years) lines.push(`<div class="ht-years">${years}</div>`)
      let firstTag = ''
      if (Array.isArray(node.tag_ids) && node.tag_ids.length > 0) {
        const tagNode = byId[node.tag_ids[0]]
        if (tagNode && tagNode.name) firstTag = tagNode.name
      }
      if (firstTag) lines.push(`<div class="ht-tag">${firstTag}</div>`)
      const hasCoords = node.location && typeof node.location.lat === 'number' && typeof node.location.lng === 'number'
      if (hasCoords) {
        const city = node.location.city || ''
        const country = node.location.country || ''
        if (city || country) lines.push(`<div class="ht-loc">${[city, country].filter(Boolean).join(', ')}</div>`)
      }
      // Connection summary by type (compact, varies by node.type)
      const c = connById[node.id] || { total: 0, membership: 0, label_signing: 0, hosted_at: 0 }
      if (node.type === 'band') {
        const members = c.membership
        const labels = c.label_signing
        const events = c.hosted_at
        const parts = []
        if (members) parts.push(`${members} member${members!==1?'s':''}`)
        if (labels) parts.push(`${labels} label${labels!==1?'s':''}`)
        if (events) parts.push(`${events} event${events!==1?'s':''}`)
        if (parts.length) lines.push(`<div class="ht-years">${parts.join(' · ')}</div>`)
      } else if (node.type === 'member') {
        // Member-specific: derive memberships from links only (ignore node arrays)
        const bandNames = (bandNamesByMemberId.get(node.id) || []).slice(0, 3)
        const bandCount = (bandNamesByMemberId.get(node.id) || []).length || c.membership || 0
        const roles = Array.isArray(node.roles) ? node.roles.filter(Boolean) : []
        const memberOfLine = `<strong>Member of:</strong> ${bandCount} band${bandCount!==1?'s':''}${bandNames.length ? ' – ' + bandNames.join(', ') : ''}`
        lines.push(`<div class="ht-years">${memberOfLine}</div>`)
        if (roles.length) {
          lines.push(`<div class="ht-years"><strong>Instruments:</strong> ${roles.join(', ')}</div>`)
        }
      } else if (node.type === 'label') {
        const artists = c.label_signing
        if (artists) lines.push(`<div class="ht-years">${artists} artist${artists!==1?'s':''}</div>`)
      } else if (node.type === 'venue') {
        const hosted = c.hosted_at
        if (hosted) lines.push(`<div class="ht-years">${hosted} event${hosted!==1?'s':''}</div>`)
      } else if (node.type === 'event') {
        const venues = c.hosted_at
        if (venues) lines.push(`<div class="ht-years">${venues} venue${venues!==1?'s':''}</div>`)
      }
      return lines.join('')
    }

    const showTip = (evt, node) => {
      if (!tooltipRef.current) return
      tooltipRef.current.innerHTML = buildTooltipHtml(node)
      tooltipRef.current.style.display = 'block'
      const raw = evt.originalEvent
      const x = (raw && raw.clientX) ? raw.clientX : 0
      const y = (raw && raw.clientY) ? raw.clientY : 0
      tooltipRef.current.style.left = `${x + 12}px`
      tooltipRef.current.style.top = `${y + 12}px`
    }

    const moveTip = (evt) => {
      if (!tooltipRef.current || tooltipRef.current.style.display === 'none') return
      const raw = evt.originalEvent
      const x = (raw && raw.clientX) ? raw.clientX : 0
      const y = (raw && raw.clientY) ? raw.clientY : 0
      tooltipRef.current.style.left = `${x + 12}px`
      tooltipRef.current.style.top = `${y + 12}px`
    }

    const hideTip = () => {
      if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    }

    cyRef.current.on('mouseover', 'node', (evt) => {
      hideTip()
      const nodeId = evt.target.data('id')
      const node = byId[nodeId]
      if (!node) return
      hoverTimerRef.current = setTimeout(() => showTip(evt, node), 250)
    })
    cyRef.current.on('mousemove', 'node', (evt) => moveTip(evt))
    cyRef.current.on('mouseout', 'node', () => hideTip())

    cyRef.current.on('tap', (evt) => {
      if (evt.target === cyRef.current) {
        setSelectedNode(null)
        console.log('Graph: Cleared selection')
        cyRef.current.elements().removeClass('faded highlight hovered')
      }
    })

    // Hover behavior
    cyRef.current.on('mouseover', 'node', (evt) => {
      const target = evt.target
      target.addClass('hovered')
    })
    cyRef.current.on('mouseout', 'node', (evt) => {
      evt.target.removeClass('hovered')
    })

    return () => {
      if (cyRef.current) {
        try {
          const pan = cyRef.current.pan()
          const zoom = cyRef.current.zoom()
          useDataStore.getState().setGraphCamera(pan, zoom)
        } catch {}
        cyRef.current.destroy()
        cyRef.current = null
      }
      if (hoverTimerRef.current) { try { clearTimeout(hoverTimerRef.current) } catch {} hoverTimerRef.current = null }
      if (tooltipRef.current) { try { document.body.removeChild(tooltipRef.current) } catch {} tooltipRef.current = null }
    }
  }, [nodes, links, setSelectedNode, byId])

  // Respond to external selection (e.g., from SearchBar)
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    // Reset styles
    cy.elements().removeClass('faded highlight hovered')
    if (!selectedNode) return
    const ele = cy.getElementById(selectedNode.id)
    if (ele && ele.nonempty()) {
      const nhood = ele.closedNeighborhood()
      cy.elements().addClass('faded')
      nhood.removeClass('faded').addClass('highlight')
      nhood.edges().addClass('highlight')
      // Only center on the selected node (no zoom change)
      try {
        cy.center(ele)
      } catch {}
    }
  }, [selectedNode])

  // Apply filters to show/hide without re-layout
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    // Show/hide nodes by type and timeline
    cy.nodes().forEach(n => {
      const t = n.data('type')
      let visible = !!filters[t] || (selectedNode && n.id() === selectedNode.id)
      if (visible && timelineMode) {
        // timeline check: overlap of node or via connected link
        const node = byId[n.id()]
        const s = node?._tsStart
        const e = node?._tsEnd
        const hasOverlap = (s == null && e == null) || // unknown -> allow unless blocked by links filter later
          ((timelineEndTs == null || (s == null || s <= timelineEndTs)) && (timelineStartTs == null || (e == null || e >= timelineStartTs)))
        visible = hasOverlap
      }
      n.style('display', visible ? 'element' : 'none')
    })
    // Show edges only if both endpoints are visible
    cy.edges().forEach(e => {
      let srcVisible = e.source().style('display') !== 'none'
      let tgtVisible = e.target().style('display') !== 'none'
      let ok = srcVisible && tgtVisible
      if (ok && timelineMode) {
        const edgeData = e.data()
        // We didn't store ts on elements; use byId map via links is not accessible here. Use stored data attributes? Fallback: evaluate by endpoints only
        // Better: use graph data on edges: inject _tsStart/_tsEnd into edge data during creation
        const tsS = edgeData._tsStart
        const tsE = edgeData._tsEnd
        const overlap = (timelineEndTs == null || (tsS == null || tsS <= timelineEndTs)) && (timelineStartTs == null || (tsE == null || tsE >= timelineStartTs))
        ok = overlap
      }
      e.style('display', ok ? 'element' : 'none')
    })
  }, [filters, selectedNode, timelineMode, timelineStartTs, timelineEndTs, byId])

  // Highlight shortest path if present
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    // Reset to base
    cy.elements().removeClass('path')
    cy.elements().removeClass('faded')
    if (!pathNodeIds || pathNodeIds.length === 0) return
    // Dim all, then emphasize the path
    cy.elements().addClass('faded')
    // Nodes on path (emphasize without resizing shape)
    pathNodeIds.forEach(id => {
      cy.getElementById(id).removeClass('faded').addClass('path')
    })
    // Edges along the path sequence
    for (let i = 0; i < pathNodeIds.length - 1; i++) {
      const a = pathNodeIds[i]
      const b = pathNodeIds[i + 1]
      const edges = cy.edges().filter(e => {
        const s = e.data('source') || e.source().id()
        const t = e.data('target') || e.target().id()
        return (s === a && t === b) || (s === b && t === a)
      })
      edges.removeClass('faded').addClass('path')
    }
  }, [pathNodeIds])

  // Fit control handler
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    try {
      // Apply stored camera on view load
      const { graphPan, graphZoom, viewLoadToken } = useDataStore.getState()
      if (viewLoadToken > 0 && graphPan && typeof graphZoom === 'number') {
        try { cy.zoom(graphZoom); cy.pan(graphPan) } catch {}
      }
      if (selectedNode) {
        const ele = cy.getElementById(selectedNode.id)
        if (ele && ele.nonempty()) {
          const nhood = ele.closedNeighborhood().filter(':visible')
          if (nhood.nonempty()) cy.fit(nhood, 50)
        }
      } else {
        const vis = cy.nodes(':visible')
        if (vis.nonempty()) cy.fit(vis, 50)
      }
    } catch {}
  }, [fitRequestId])

  // Snapshot export to PNG: only when request id changes (prevents running on refresh/initial mount)
  const lastHandledSnapshotIdRef = useRef(graphSnapshotRequestId)
  useEffect(() => {
    if (graphSnapshotRequestId === lastHandledSnapshotIdRef.current) return
    lastHandledSnapshotIdRef.current = graphSnapshotRequestId
    if (graphSnapshotRequestId <= 0) return
    const cy = cyRef.current
    if (!cy) return
    try {
      const png = cy.png({ full: false, scale: 2, output: 'blob' })
      if (png) {
        const blob = png
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const datePart = new Date().toISOString().slice(0,10)
        const namePart = selectedNode?.name ? selectedNode.name.replace(/[^a-z0-9]+/gi,'_') : 'graph'
        a.href = url
        a.download = `${namePart}_${datePart}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        showToast('Snapshot saved')
      }
    } catch (e) {
      console.error('Snapshot failed', e)
    }
  }, [graphSnapshotRequestId])

  return (
    <div 
      ref={containerRef} 
      className="graph-view"
      style={{ width: '100%', height: '100%' }}
    />
  )
}

export default GraphView
