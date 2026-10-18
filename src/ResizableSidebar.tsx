import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { clampSidebarWidth, DEFAULT_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, SIDEBAR_WIDTH_KEY, sidebarWidthBounds } from './sidebarWidth'

function loadWidth() {
  try {
    const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    if (saved >= MIN_SIDEBAR_WIDTH && saved <= MAX_SIDEBAR_WIDTH) return saved
  } catch { /* Resizing still works when browser storage is unavailable. */ }
  return DEFAULT_SIDEBAR_WIDTH
}

export function ResizableSidebar({ children }: { children: ReactNode }) {
  const [preferredWidth, setPreferredWidth] = useState(loadWidth)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const drag = useRef<{ id: number; startX: number; startWidth: number; latestWidth: number } | null>(null)
  const width = clampSidebarWidth(preferredWidth, viewportWidth)
  const bounds = sidebarWidthBounds(viewportWidth)

  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  function commit(next: number) {
    const clamped = clampSidebarWidth(next, window.innerWidth)
    setPreferredWidth(clamped)
    try { localStorage.setItem(SIDEBAR_WIDTH_KEY, String(clamped)) } catch { /* Keep the preference for this open panel. */ }
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return
    const next = drag.current.latestWidth
    drag.current = null
    commit(next)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return <div data-review-panel className="relative h-full w-screen md:w-[var(--sidebar-width)]" style={{ '--sidebar-width': `${width}px` } as CSSProperties}>
    <div role="separator" aria-label="Resize Ask AI sidebar" aria-orientation="vertical" aria-controls="review-panel" aria-valuemin={bounds.min} aria-valuemax={bounds.max} aria-valuenow={width} aria-valuetext={`${width} pixels`} tabIndex={0} title="Drag to resize. Double-click to reset." className="absolute inset-y-0 left-0 z-10 hidden w-1.5 cursor-col-resize touch-none select-none hover:bg-surface-elevated focus-visible:bg-[var(--blue-400)] focus-visible:outline-none md:block" onPointerDown={event => {
      if (event.button !== 0 || window.innerWidth < 768) return
      event.preventDefault()
      event.currentTarget.focus({ preventScroll: true })
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { id: event.pointerId, startX: event.clientX, startWidth: width, latestWidth: width }
    }} onPointerMove={event => {
      const active = drag.current
      if (!active || active.id !== event.pointerId) return
      event.preventDefault()
      active.latestWidth = clampSidebarWidth(active.startWidth + active.startX - event.clientX, window.innerWidth)
      setPreferredWidth(active.latestWidth)
    }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onDoubleClick={() => commit(DEFAULT_SIDEBAR_WIDTH)} onKeyDown={event => {
      const step = event.shiftKey ? 64 : 16
      const next = event.key === 'ArrowLeft' ? width + step : event.key === 'ArrowRight' ? width - step : event.key === 'Home' ? bounds.min : event.key === 'End' ? bounds.max : undefined
      if (next === undefined) return
      event.preventDefault()
      event.stopPropagation()
      commit(next)
    }} />
    {children}
  </div>
}
