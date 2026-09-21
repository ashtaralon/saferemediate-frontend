"use client"

/**
 * The shared viewport/interaction shell for topology maps.
 *
 * Lifted verbatim out of estate-map-view.tsx, where it was inline, so the
 * Estate map and the Identity & access map are driven by the SAME code rather
 * than by two implementations that drift. What lives here is only the part
 * that is genuinely generic -- zoom clamping, cursor-anchored zoom, wheel,
 * drag-pan, the relative-percent readout:
 *
 *   zoom is CSS scale; the readout is relative to the fit scale, so "100%"
 *   always means "the map fills the pane" whatever the content measures.
 *
 * What is NOT here, on purpose: fit computation and level-of-detail. The
 * Estate map's fit is coupled to a one-way card/tile collapse whose two-way
 * version fed an infinite re-fit loop (estate-map-view.tsx, 2026-07-04). That
 * logic stays with the map that owns it; this hook takes its `computeFit` as a
 * callback so `fitView` still resets the auto-refit latch the same way.
 */

import { useCallback, useRef, useState, type PointerEvent, type WheelEvent } from "react"

export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 2
/** Wheel/pinch step, and the +/- button step. Both as the Estate map had them. */
const WHEEL_STEP = 1.12
const BUTTON_STEP = 1.25

/**
 * Elements that own their own pointer gestures. A drag starting on one of
 * these must not pan the canvas underneath it -- notably `[data-scroll-region]`,
 * whose scrollbar drag would otherwise move the whole map.
 */
const SELF_HANDLING = 'button, a, input, select, [data-flow-id], [role="button"], [data-scroll-region]'

export interface MapViewport {
  viewportRef: React.MutableRefObject<HTMLDivElement | null>
  contentRef: React.MutableRefObject<HTMLDivElement | null>
  zoom: number
  setZoom: React.Dispatch<React.SetStateAction<number>>
  fitScale: number
  setFitScale: React.Dispatch<React.SetStateAction<number>>
  pan: { x: number; y: number }
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>
  panning: boolean
  /** True once the operator zoomed or panned by hand; auto-refit must then stop stealing the view. */
  userAdjustedRef: React.MutableRefObject<boolean>
  zoomTo: (next: number, originClientX?: number, originClientY?: number) => void
  zoomInStep: () => void
  zoomOutStep: () => void
  fitView: () => void
  /** Zoom as a percentage OF THE FIT, which is what the control displays. */
  relZoomPct: number
  onViewportWheel: (e: WheelEvent) => void
  onPanDown: (e: PointerEvent) => void
  onPanMove: (e: PointerEvent) => void
  onPanUp: () => void
}

export function useMapViewport(options: { computeFit?: (force?: boolean) => void } = {}): MapViewport {
  const { computeFit } = options
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [fitScale, setFitScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const panDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const userAdjustedRef = useRef(false)

  const zoomTo = useCallback((next: number, originClientX?: number, originClientY?: number) => {
    const vp = viewportRef.current
    userAdjustedRef.current = true // manual zoom -- stop auto-refit stealing the view
    setZoom(prev => {
      const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next))
      if (vp && originClientX != null && originClientY != null && clamped !== prev) {
        const rect = vp.getBoundingClientRect()
        const cx = originClientX - rect.left
        const cy = originClientY - rect.top
        // Keep the point under the cursor stationary through the zoom.
        setPan(p => ({
          x: cx - ((cx - p.x) * clamped) / prev,
          y: cy - ((cy - p.y) * clamped) / prev,
        }))
      }
      return clamped
    })
  }, [])

  const fitView = useCallback(() => {
    // Returning to 100%-of-map re-enables auto-refit on content growth.
    userAdjustedRef.current = false
    if (computeFit) computeFit(true)
    else {
      setZoom(1)
      setPan({ x: 0, y: 0 })
    }
  }, [computeFit])

  const zoomInStep = useCallback(() => zoomTo(zoom * BUTTON_STEP), [zoom, zoomTo])
  const zoomOutStep = useCallback(() => zoomTo(zoom / BUTTON_STEP), [zoom, zoomTo])
  const relZoomPct = Math.round((zoom / (fitScale || 1)) * 100)

  const onViewportWheel = useCallback((e: WheelEvent) => {
    // Pinch / ctrl+wheel -> zoom. Plain wheel -> native vertical scroll, so a
    // width-filled 100% can still reach content below without shrinking.
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    zoomTo(zoom * (e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP), e.clientX, e.clientY)
  }, [zoom, zoomTo])

  const onPanDown = useCallback((e: PointerEvent) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest(SELF_HANDLING)) return
    userAdjustedRef.current = true // manual pan -- stop auto-refit stealing the view
    panDrag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    setPanning(true)
  }, [pan.x, pan.y])

  const onPanMove = useCallback((e: PointerEvent) => {
    const d = panDrag.current
    if (!d) return
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) })
  }, [])

  const onPanUp = useCallback(() => {
    panDrag.current = null
    setPanning(false)
  }, [])

  return {
    viewportRef, contentRef,
    zoom, setZoom, fitScale, setFitScale, pan, setPan, panning,
    userAdjustedRef,
    zoomTo, zoomInStep, zoomOutStep, fitView, relZoomPct,
    onViewportWheel, onPanDown, onPanMove, onPanUp,
  }
}
