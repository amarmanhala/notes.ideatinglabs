import { useLayoutEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { Animate } from '@openai/apps-sdk-ui/components/Transition'
import { documentPosition } from './richDocument'
import { mergeSearchRects, type TextMatch } from './noteSearch'

type HighlightRect = { left: number; top: number; width: number; height: number; active: boolean }
type Props = { editor: Editor | null; query: string; matches: TextMatch[]; activeMatch: number }

// Paint behind the real glyphs: no extra editable nodes, wrapping, or saved marks.
export function SearchHighlights({ editor, query, matches, activeMatch }: Props) {
  const [rects, setRects] = useState<HighlightRect[]>([])

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return
    const element = editor.view.dom
    let frame = 0
    let disposed = false

    function measure() {
      if (!editor || editor.isDestroyed || disposed) return
      const bounds = element.getBoundingClientRect()
      const next: HighlightRect[] = []
      matches.forEach((match, index) => {
        const from = editor.view.domAtPos(documentPosition(editor.state.doc, match.start))
        const to = editor.view.domAtPos(documentPosition(editor.state.doc, match.end))
        const range = document.createRange()
        range.setStart(from.node, from.offset)
        range.setEnd(to.node, to.offset)
        const boxes = Array.from(range.getClientRects(), rect => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }))
        for (const rect of mergeSearchRects(boxes)) {
          if (rect.width && rect.height && rect.top + rect.height > bounds.top && rect.top < bounds.bottom) {
            next.push({ left: rect.left - bounds.left, top: rect.top - bounds.top, width: rect.width, height: rect.height, active: index === activeMatch })
          }
        }
      })
      setRects(next)
    }
    function schedule() {
      cancelAnimationFrame(frame)
      if (!disposed) frame = requestAnimationFrame(measure)
    }

    const active = matches[activeMatch]
    if (active) {
      const bounds = element.getBoundingClientRect()
      const point = editor.view.coordsAtPos(documentPosition(editor.state.doc, active.start))
      if (point.top < bounds.top || point.bottom > bounds.bottom) {
        element.scrollBy({ top: point.top - bounds.top - element.clientHeight / 3 })
      }
    }
    measure()
    element.addEventListener('scroll', schedule)
    element.addEventListener('writing-layout', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    document.fonts.ready.then(schedule)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      element.removeEventListener('scroll', schedule)
      element.removeEventListener('writing-layout', schedule)
      observer.disconnect()
    }
  }, [editor, matches, activeMatch])

  return <Animate as="div" className="pointer-events-none absolute inset-0 overflow-hidden" transitionPosition="static" initial={{ opacity: 0 }} enter={{ opacity: 1, duration: 180 }} exit={{ opacity: 0, duration: 120 }}>
    {query && rects.length > 0 && <div key={query} aria-hidden="true" className="absolute inset-0">
      {rects.map((rect, index) => <span key={index} className="absolute rounded-xs" style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, backgroundColor: '#0285ff', opacity: rect.active ? 0.4 : 0.22, ...(rect.active ? { outline: '1px solid #0285ff' } : {}) }} />)}
    </div>}
  </Animate>
}
