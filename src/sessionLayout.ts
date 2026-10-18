import type { WritingSession } from './writingSessions'

type Point = { left: number; top: number; height?: number }
export type SessionLabel = Point & { session: WritingSession }
export function positionSessionLabels(sessions: WritingSession[], pointAt: (offset: number) => Point, scrollTop: number, scrollLeft = 0, origin: Point = { left: 0, top: 0 }): SessionLabel[] {
  return sessions.map(session => {
    const point = pointAt(session.anchorOffset)
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
