import { parseFormats, type TextFormat } from './textFormatting'
import { parseLearningResources, type LearningResource } from './learningResources'
import { mapRefinedParagraphs, paragraphResources, parseRefinedParagraphs, type RefinedParagraph, type RefinementEdit } from './refinementState'
import { parseTasks, type TaskParagraph } from './taskParagraphs'

export type WritingSession = {
  id: string
  startedAt: string
  lastEditedAt: string
  anchorOffset: number
}
export type Entry = {
  text: string
  createdAt: string
  updatedAt: string
  sessions: WritingSession[]
  formats?: TextFormat[]
  learningResources?: LearningResource[]
  refinedParagraphs?: RefinedParagraph[]
  tasks?: TaskParagraph[]
}
export type History = Record<string, Entry>
export const STORAGE_KEY = 'notes.writing.v1'
export const SESSION_PAUSE_MS = 120_000

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export function parseHistory(raw: string): History {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid history')
  const history: History = {}
  for (const [day, value] of Object.entries(parsed)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !value || typeof value !== 'object') throw new Error('Invalid entry')
    const entry = value as Record<string, unknown>
    if (typeof entry.text !== 'string' || !isTimestamp(entry.createdAt) || !isTimestamp(entry.updatedAt)) throw new Error('Invalid entry')
    const sessions: WritingSession[] = []
    if (entry.sessions === undefined) {
      sessions.push({ id: `legacy:${day}:${entry.createdAt}`, startedAt: entry.createdAt, lastEditedAt: entry.updatedAt, anchorOffset: 0 })
    } else {
      if (!Array.isArray(entry.sessions)) throw new Error('Invalid sessions')
      const ids = new Set<string>()
      for (const session of entry.sessions) {
        if (!session || typeof session.id !== 'string' || !session.id || ids.has(session.id) || !isTimestamp(session.startedAt) || !isTimestamp(session.lastEditedAt) || !Number.isInteger(session.anchorOffset) || session.anchorOffset < 0 || session.anchorOffset > entry.text.length) throw new Error('Invalid session')
        ids.add(session.id)
        sessions.push({ id: session.id, startedAt: session.startedAt, lastEditedAt: session.lastEditedAt, anchorOffset: session.anchorOffset })
      }
    }
    const formats = parseFormats(entry.formats, entry.text)
    const refined = parseRefinedParagraphs(entry.refinedParagraphs, entry.text)
    const storedResources = parseLearningResources(entry.learningResources)
    const resources = storedResources.length ? storedResources : paragraphResources(refined)
    const tasks = parseTasks(entry.tasks, entry.text)
    history[day] = { text: entry.text, createdAt: entry.createdAt, updatedAt: entry.updatedAt, sessions, ...(formats.length ? { formats } : {}), ...(resources.length ? { learningResources: resources } : {}), ...(refined.length ? { refinedParagraphs: refined } : {}), ...(entry.tasks !== undefined ? { tasks } : {}) }
  }
  return history
}

// A single contiguous replacement represents typing, paste, delete, and undo.
export function changedRange(before: string, after: string, editStart?: number) {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  // Native input selections disambiguate insertion/deletion in repeated text.
  if (editStart !== undefined && Number.isInteger(editStart) && editStart >= 0 && editStart < start) start = editStart
  let oldEnd = before.length
  let newEnd = after.length
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd-- }
  return { start, oldEnd, newEnd }
}

export function applyWritingChange(entry: Entry | undefined, text: string, nowMs: number, createId: () => string, editStart?: number, formats: TextFormat[] = [], edits?: RefinementEdit[], tasks?: TaskParagraph[]): Entry | undefined {
  const sameText = text === (entry?.text ?? '')
  const nextTasks = tasks === undefined ? (sameText ? entry?.tasks : undefined) : parseTasks(tasks, text)
  if (sameText && JSON.stringify(entry?.formats ?? []) === JSON.stringify(formats) && JSON.stringify(entry?.tasks ?? []) === JSON.stringify(nextTasks ?? [])) return entry
  const now = new Date(nowMs).toISOString()
  // Formatting is saved, but does not create a typing session or move its anchors.
  if (sameText && entry) {
    const updated = { ...entry, updatedAt: now }
    if (nextTasks !== undefined) updated.tasks = nextTasks
    if (formats.length) updated.formats = formats
    else delete updated.formats
    return updated
  }
  const { start, oldEnd, newEnd } = changedRange(entry?.text ?? '', text, editStart)
  const changes = edits?.length && edits[0].before === entry?.text && edits.at(-1)?.after === text
    ? edits.map(edit => changedRange(edit.before, edit.after, edit.editStart)) : [{ start, oldEnd, newEnd }]
  const sessions = (entry?.sessions ?? []).map(session => ({
    ...session,
    // An insertion at an existing marker leaves that marker at the start of the passage.
    anchorOffset: changes.reduce((offset, change) => offset <= change.start ? offset : offset < change.oldEnd ? change.start : offset + change.newEnd - change.oldEnd, session.anchorOffset),
  }))
  const active = sessions.at(-1)
  if (!active || nowMs - Date.parse(active.lastEditedAt) >= SESSION_PAUSE_MS) {
    sessions.push({ id: createId(), startedAt: now, lastEditedAt: now, anchorOffset: start })
  } else {
    active.lastEditedAt = now
  }
  const refined = edits?.length && edits[0].before === entry?.text && edits.at(-1)?.after === text
    ? edits.reduce((ranges, edit) => mapRefinedParagraphs(edit.before, edit.after, ranges, changedRange(edit.before, edit.after, edit.editStart)), entry?.refinedParagraphs ?? [])
    : mapRefinedParagraphs(entry?.text ?? '', text, entry?.refinedParagraphs ?? [], { start, oldEnd, newEnd })
  const resources = paragraphResources(refined)
  return { text, createdAt: entry?.createdAt ?? now, updatedAt: now, sessions, ...(formats.length ? { formats } : {}), ...(refined.length ? { refinedParagraphs: refined } : {}), ...(resources.length ? { learningResources: resources } : {}), ...(nextTasks !== undefined ? { tasks: nextTasks } : {}) }
}
