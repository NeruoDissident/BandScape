import { useMemo, useRef } from 'react'
import useDataStore from '../store/DataStore'

function formatDate(ts) {
  if (ts == null) return ''
  const d = new Date(ts)
  const yyyy = d.getFullYear().toString().padStart(4, '0')
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const dd = d.getDate().toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function TimelineControls() {
  const {
    timelineMode,
    setTimelineMode,
    datasetMinTs,
    datasetMaxTs,
    timelineStartTs,
    timelineEndTs,
    setTimelineRange,
    nodes,
    links
  } = useDataStore()

  const minTs = datasetMinTs ?? null
  const maxTs = datasetMaxTs ?? null
  const dayMs = 24 * 60 * 60 * 1000
  const hasExtent = minTs != null && maxTs != null && maxTs >= minTs
  const totalDays = hasExtent ? Math.max(0, Math.round((maxTs - minTs) / dayMs)) : 0

  const throttlerRef = useRef(null)
  const pendingRef = useRef(null)

  const onToggle = () => setTimelineMode(!timelineMode)

  const onStartChange = (e) => {
    const v = e.target.value
    const ts = v ? new Date(v).getTime() : null
    setTimelineRange(ts, timelineEndTs)
  }
  const onSliderInput = (e) => {
    if (!hasExtent) return
    const dayIndex = parseInt(e.target.value, 10)
    const endTs = minTs + dayIndex * dayMs
    // Show live updates with throttle
    pendingRef.current = endTs
    if (!throttlerRef.current) {
      throttlerRef.current = setTimeout(() => {
        const ts = pendingRef.current
        throttlerRef.current = null
        pendingRef.current = null
        setTimelineMode(true)
        setTimelineRange(timelineStartTs, ts)
      }, 100)
    }
  }

  const onSliderCommit = (e) => {
    if (!hasExtent) return
    const dayIndex = parseInt(e.target.value, 10)
    const endTs = minTs + dayIndex * dayMs
    if (throttlerRef.current) {
      clearTimeout(throttlerRef.current)
      throttlerRef.current = null
      pendingRef.current = null
    }
    setTimelineMode(true)
    setTimelineRange(timelineStartTs, endTs)
  }

  const onClear = () => {
    if (!hasExtent) return
    setTimelineRange(timelineStartTs, maxTs)
  }

  const visibleCounts = useMemo(() => {
    // Just display counts; actual visibility handled in views
    return { nodes: nodes.length, links: links.length }
  }, [nodes, links])

  const sliderValue = hasExtent && timelineEndTs != null ? Math.max(0, Math.min(totalDays, Math.round((timelineEndTs - minTs) / dayMs))) : totalDays
  const sliderLabel = formatDate(hasExtent ? (minTs + sliderValue * dayMs) : null)

  return (
    <div className="timeline-controls">
      <div className="group start-input">
        <input type="date" value={formatDate(timelineStartTs)} min={formatDate(minTs)} max={formatDate(maxTs)} onChange={onStartChange} />
      </div>
      <div className="group end-slider">
        <input 
          type="range" 
          min={0} 
          max={totalDays} 
          step={1} 
          value={sliderValue}
          onInput={onSliderInput}
          onMouseUp={onSliderCommit}
          onTouchEnd={onSliderCommit}
          title="End date"
        />
        <span className="label">{sliderLabel}</span>
      </div>
      <div className="group toggle-clear">
        <button className={`btn ${timelineMode ? 'on' : 'off'}`} onClick={onToggle} title="Toggle Timeline Mode">Timeline: {timelineMode ? 'ON' : 'OFF'}</button>
        <button className="btn" onClick={onClear} title="Reset end date">Clear</button>
      </div>
      <div className="counts" title="Counts reflect current dataset; filtering happens in views">{visibleCounts.nodes} nodes, {visibleCounts.links} links</div>
    </div>
  )
}

