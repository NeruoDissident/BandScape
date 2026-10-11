import { useEffect, useMemo, useRef } from 'react'
import ForceGraph3D from '3d-force-graph'
import { Sprite, SpriteMaterial, CanvasTexture } from 'three'
import useDataStore from '../store/DataStore'

const NODE_COLORS = {
  band: '#ff6b6b',
  member: '#4ecdc4',
  label: '#45b7d1',
  genre: '#96ceb4',
  venue: '#feca57',
  event: '#ff9ff3',
}

const LINK_COLORS = {
  membership: 'rgba(160,170,190,0.35)',
  guest: 'rgba(255,159,243,0.5)',
  collab: 'rgba(254,202,87,0.5)',
}

// Canvas sprite label used for band nodes. Rendered once per band at init.
function makeLabelSprite(text) {
  const fontSize = 42
  const padX = 26
  const padY = 14
  const measure = document.createElement('canvas').getContext('2d')
  measure.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`
  const textW = Math.ceil(measure.measureText(text).width)
  const canvas = document.createElement('canvas')
  canvas.width = textW + padX * 2
  canvas.height = fontSize + padY * 2
  const ctx = canvas.getContext('2d')

  // pill background
  const r = canvas.height / 2
  ctx.fillStyle = 'rgba(10,12,16,0.72)'
  ctx.beginPath()
  ctx.roundRect(0, 0, canvas.width, canvas.height, r)
  ctx.fill()

  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`
  ctx.fillStyle = '#f2f4f8'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, padX, canvas.height / 2 + 2)

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = 'srgb'
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  const scale = 0.055
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1)
  return sprite
}

function ThreeDView() {
  const containerRef = useRef(null)
  const graphRef = useRef(null)
  const downPos = useRef(null)
  const { nodes, links, filters, selectedNode, setSelectedNode } = useDataStore()

  // Same type filtering as the 2D graph view.
  const graphData = useMemo(() => {
    const allowedTypes = filters?.allowedTypes
    const filteredNodes = allowedTypes?.length
      ? nodes.filter((n) => allowedTypes.includes(n.type))
      : nodes
    const ids = new Set(filteredNodes.map((n) => n.id))
    const filteredLinks = links.filter((l) => ids.has(l.source) && ids.has(l.target))

    const degree = new Map()
    for (const l of filteredLinks) {
      degree.set(l.source, (degree.get(l.source) || 0) + 1)
      degree.set(l.target, (degree.get(l.target) || 0) + 1)
    }

    return {
      nodes: filteredNodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        val: 1 + Math.min(8, (degree.get(n.id) || 0) * 0.6),
      })),
      links: filteredLinks.map((l) => ({ source: l.source, target: l.target, type: l.type })),
    }
  }, [nodes, links, filters])

  // Init once on mount; teardown on unmount. No timeouts — rAF + ResizeObserver.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let graph = null
    let disposed = false

    const onPointerDown = (e) => {
      downPos.current = { x: e.clientX, y: e.clientY }
    }
    el.addEventListener('pointerdown', onPointerDown)

    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false

    const raf = requestAnimationFrame(() => {
      if (disposed) return
      const w = el.clientWidth, h = el.clientHeight
      if (!w || !h) return

      graph = ForceGraph3D()(el)
        .width(w)
        .height(h)
        .backgroundColor('rgba(0,0,0,0)')
        .showNavInfo(false)
        .nodeLabel('name')
        .nodeVal('val')
        .nodeRelSize(5)
        .nodeColor((n) => NODE_COLORS[n.type] ?? '#cccccc')
        .linkColor((l) => LINK_COLORS[l.type] ?? 'rgba(160,170,190,0.3)')
        .linkOpacity(0.55)
        .linkWidth(0.6)
        // Band names as floating labels; members keep hover tooltips only.
        .nodeThreeObjectExtend((n) => {
          if (n.type !== 'band') return null
          const sprite = makeLabelSprite(n.name)
          sprite.position.y = 7 + n.val * 1.6
          return sprite
        })
        // Node dragging fights with one-finger rotate on touch — keep it for mouse only.
        .enableNodeDrag(!coarse)
        .onNodeHover((n) => {
          document.body.style.cursor = n ? 'pointer' : ''
        })
        .onNodeClick((n, event) => {
          // Tap, not drag: ignore clicks where the pointer traveled (rotate gesture).
          const d = downPos.current
          if (d && event && Math.hypot(event.clientX - d.x, event.clientY - d.y) > 10) return
          const full = nodes.find((x) => x.id === n.id)
          if (full) setSelectedNode(full)
        })
        .onBackgroundClick(() => setSelectedNode(null))

      graph.d3Force('charge').strength(-140)
      graph.d3Force('link').distance(55)
      graph.graphData(graphData)
      graphRef.current = graph
    })

    const ro = new ResizeObserver(() => {
      if (!graph || disposed) return
      const w = el.clientWidth, h = el.clientHeight
      if (w && h) { graph.width(w); graph.height(h) }
    })
    ro.observe(el)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', onPointerDown)
      document.body.style.cursor = ''
      if (graph) {
        try { graph._destructor() } catch { /* already torn down */ }
      }
      graphRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push data updates (filters, merges) into the live graph.
  const dataRef = useRef(graphData)
  useEffect(() => {
    dataRef.current = graphData
    if (graphRef.current) graphRef.current.graphData(graphData)
  }, [graphData])

  // Glide the camera to the selected node (also covers deep-link ?id=).
  useEffect(() => {
    const graph = graphRef.current
    if (!graph || !selectedNode) return
    const n = dataRef.current.nodes.find((x) => x.id === selectedNode.id)
    if (n && n.x !== undefined) {
      const dist = 160
      const distRatio = 1 + dist / Math.hypot(n.x, n.y, n.z || 1)
      graph.cameraPosition(
        { x: n.x * distRatio, y: n.y * distRatio, z: (n.z || 0) * distRatio },
        n,
        1200
      )
    }
  }, [selectedNode])

  return (
    <div
      ref={containerRef}
      className="threed-view"
      style={{ width: '100%', height: '100%', minHeight: '400px', position: 'relative', touchAction: 'none' }}
    />
  )
}

export default ThreeDView
