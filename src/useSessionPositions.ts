import { useLayoutEffect, useState, type RefObject } from 'react'
import type { WritingEditorHandle } from './writingEditorHandle'
import type { WritingSession } from './writingSessions'
import { positionSessionLabels, type SessionLabel } from './sessionLayout'

export function useSessionPositions(ref: RefObject<WritingEditorHandle | null>, sessions: WritingSession[], text: string, day: string, enabled: boolean) {
  const [labels, setLabels] = useState<SessionLabel[]>([])
  useLayoutEffect(() => {
    const handle = ref.current
    const input = handle?.element
    if (!input || !handle || !enabled) return
    let frame = 0
    let disposed = false
    function measure() {
      if (!input) return
      const surface = input.closest('[data-writing-surface]')
      if (!surface) return
      const surfaceRect = surface.getBoundingClientRect()
      const inputRect = input.getBoundingClientRect()
      const next = positionSessionLabels(sessions, offset => handle!.pointAt(offset), input.scrollTop, input.scrollLeft, {
        left: inputRect.left - surfaceRect.left,
        top: inputRect.top - surfaceRect.top,
      })
      setLabels(next)
    }
    function schedule() {
      if (disposed) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    input.addEventListener('scroll', schedule)
    input.addEventListener('writing-layout', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(input)
    document.fonts.ready.then(schedule)
    schedule()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      input.removeEventListener('scroll', schedule)
      input.removeEventListener('writing-layout', schedule)
      observer.disconnect()
    }
  }, [ref, sessions, text, day, enabled])
  return enabled ? labels : []
}
