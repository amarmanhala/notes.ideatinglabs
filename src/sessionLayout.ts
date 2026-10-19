import type { WritingSession } from './writingSessions'

type Point = { left: number; top: number; height?: number }
export type SessionLabel = Point & { session: WritingSession }
export function timelineOffset(text: string, anchorOffset: number) {
  const offset = Math.max(0, Math.min(anchorOffset, text.length))
  const lines = text.split('\n')
  let lineStart = 0
  let lineIndex = 0
  for (; lineIndex < lines.length; lineIndex++) {
    const lineEnd = lineStart + lines[lineIndex].length
    if (offset <= lineEnd) break
    lineStart = lineEnd + 1
  }
  if (lines[lineIndex]?.trim()) return offset
  for (let index = lineIndex + 1, start = lineStart + (lines[lineIndex]?.length ?? 0) + 1; index < lines.length; index++) {
    const content = lines[index]
    if (content.trim()) return start + content.search(/\S/)
    start += content.length + 1
  }
  for (let index = lineIndex - 1, start = lineStart - 1; index >= 0; index--) {
    start -= lines[index].length
    const content = lines[index]
    if (content.trim()) return start + content.length
    start--
  }
  return offset
}

export function positionSessionLabels(sessions: WritingSession[], pointAt: (offset: number) => Point, scrollTop: number, scrollLeft = 0, origin: Point = { left: 0, top: 0 }, text?: string): SessionLabel[] {
  return sessions.map(session => {
    const point = pointAt(text === undefined ? session.anchorOffset : timelineOffset(text, session.anchorOffset))
    return { session, height: point.height ?? 20, left: origin.left + point.left - scrollLeft, top: origin.top + point.top - scrollTop }
  })
}

// Multiple edits on the same visual line share a timeline point, while every
// underlying session remains available in that point's tooltip.
export function groupTimelineLabels(labels: SessionLabel[]) {
  const rows: { top: number; height: number; sessions: WritingSession[] }[] = []
  for (const label of [...labels].sort((a, b) => a.top - b.top)) {
    const previous = rows.at(-1)
    if (previous && Math.abs(previous.top - label.top) < 2) previous.sessions.push(label.session)
    else rows.push({ top: label.top, height: label.height ?? 20, sessions: [label.session] })
  }
  return rows
}
