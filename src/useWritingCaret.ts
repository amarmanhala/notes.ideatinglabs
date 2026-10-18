import { useLayoutEffect, useState, type RefObject } from 'react'
import type { WritingEditorHandle } from './writingEditorHandle'

type Caret = { left: number; top: number; height: number }

// Measure the rich editor selection so bold and italic glyphs keep the caret aligned.
export function useWritingCaret(ref: RefObject<WritingEditorHandle | null>, text: string, day: string) {
  const [caret, setCaret] = useState<Caret | null>(null)

  useLayoutEffect(() => {
    const handle = ref.current
    const input = handle?.element
    if (!input || !handle) return
    let disposed = false
    let frame = 0
    let composing = false

    function measure() {
      if (!input || document.activeElement !== input || !document.hasFocus() || composing) {
        setCaret(null)
        return
      }
      const point = handle!.caret()
      if (!point) { setCaret(null); return }
      const height = point.height
      const left = point.left - input.scrollLeft
      const top = point.top - input.scrollTop
      if (left < 0 || left > input.clientWidth || top + height < 0 || top > input.clientHeight) {
        setCaret(null)
        return
      }
      setCaret({ left, top, height })
    }
    function schedule() {
      if (disposed) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const startComposition = () => { composing = true; setCaret(null) }
    const endComposition = () => { composing = false; schedule() }
    const events = ['input', 'keyup', 'click', 'select', 'scroll', 'focus', 'blur', 'writing-layout'] as const
    events.forEach(event => input.addEventListener(event, schedule))
    input.addEventListener('compositionstart', startComposition)
    input.addEventListener('compositionend', endComposition)
    document.addEventListener('selectionchange', schedule)
    window.addEventListener('focus', schedule)
    window.addEventListener('blur', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(input)
    document.fonts.ready.then(schedule)
    schedule()
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      events.forEach(event => input.removeEventListener(event, schedule))
      input.removeEventListener('compositionstart', startComposition)
      input.removeEventListener('compositionend', endComposition)
      document.removeEventListener('selectionchange', schedule)
      window.removeEventListener('focus', schedule)
      window.removeEventListener('blur', schedule)
      observer.disconnect()
    }
  }, [ref, text, day])

  return caret
}
