import type { Entry, WritingSession } from './writingSessions'
import type { TextFormat } from './textFormatting'

export type ReviewPassage = {
  id: string
  startedAt: string
  start: number
  end: number
  text: string
  formats: TextFormat[]
}

export type ReviewInsight = {
  sourceText: string
  reflection: string
  question?: string
  nextStep?: string
}

export function buildReviewPassages(entry?: Entry): ReviewPassage[] {
  if (!entry?.text.trim()) return []
  const anchors = new Map<number, WritingSession>()
  for (const session of entry.sessions) {
    const previous = anchors.get(session.anchorOffset)
    if (!previous || Date.parse(session.startedAt) >= Date.parse(previous.startedAt)) anchors.set(session.anchorOffset, session)
  }
  const boundaries = [...new Set([0, ...anchors.keys(), entry.text.length])].sort((a, b) => a - b)
  const passages: ReviewPassage[] = []
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index]
    const end = boundaries[index + 1]
    const text = entry.text.slice(start, end)
    if (!text.trim()) continue
    const session = anchors.get(start)
    passages.push({
      id: session ? `session:${session.id}` : `prefix:${entry.createdAt}`,
      startedAt: session?.startedAt ?? entry.createdAt,
      start, end, text,
      formats: (entry.formats ?? []).filter(format => format.start < end && format.end > start).map(format => ({
        start: Math.max(start, format.start) - start,
        end: Math.min(end, format.end) - start,
        marks: [...format.marks],
      })),
    })
  }
  return passages.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.start - b.start)
}

export function captureReview(entry?: Entry) {
  return { fingerprint: JSON.stringify(entry) ?? '', passages: buildReviewPassages(entry) }
}
