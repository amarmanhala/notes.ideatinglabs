import { MAX_TIMER_SECONDS } from './taskTimer.ts'
import { refinementWordCount } from './refinementWordCount.ts'
import { parseLearningResources, type LearningResource } from './learningResources.ts'

export type Paragraph = { id: string; start: number; end: number; text: string }
export type RefinedParagraph = { start: number; end: number; resources: LearningResource[] }
export type ParagraphResult = { id: string; text: string; resources: LearningResource[]; isTodo?: boolean; timerSeconds?: number | null }
export type ParagraphBatch = { paragraphs: ParagraphResult[]; resourceNotice?: string }
export type Replacement = { start: number; end: number; text: string; isTodo?: boolean; timerSeconds?: number | null }
export type RefinementEdit = { before: string; after: string; editStart?: number }

export function noteParagraphs(text: string): Paragraph[] {
  let offset = 0
  return text.split('\n').flatMap(line => {
    const start = offset
    offset += line.length + 1
    return line.trim() ? [{ id: `p:${start}`, start, end: start + line.length, text: line }] : []
  })
}

export function parseRefinedParagraphs(value: unknown, text: string): RefinedParagraph[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 12_000) throw new Error('Invalid refined paragraphs')
  const paragraphs = new Map(noteParagraphs(text).map(p => [p.start, p.end]))
  const seen = new Set<number>()
  return value.map(item => {
    if (!item || !Number.isInteger(item.start) || !Number.isInteger(item.end) || paragraphs.get(item.start) !== item.end || seen.has(item.start)) throw new Error('Invalid refined paragraph range')
    seen.add(item.start)
    return { start: item.start, end: item.end, resources: parseLearningResources(item.resources) }
  }).sort((a, b) => a.start - b.start)
}

export function pendingParagraphs(text: string, refined: RefinedParagraph[] = []) {
  return noteParagraphs(text).filter(p => !refined.some(done => done.start === p.start && done.end === p.end))
}

export function mapRefinedParagraphs(before: string, after: string, refined: RefinedParagraph[], change: { start: number; oldEnd: number; newEnd: number }): RefinedParagraph[] {
  const delta = change.newEnd - change.oldEnd
  const paragraphs = new Map(noteParagraphs(after).map(p => [p.start, p]))
  return refined.flatMap(item => {
    let start = item.start
    let end = item.end
    if (item.start >= change.oldEnd) { start += delta; end += delta }
    else if (item.end > change.start) return []
    const paragraph = paragraphs.get(start)
    return paragraph?.end === end && paragraph.text === before.slice(item.start, item.end) ? [{ ...item, start, end }] : []
  })
}

export function paragraphResources(refined: RefinedParagraph[]): LearningResource[] {
  const resources = new Map<string, LearningResource>()
  for (const paragraph of refined) for (const resource of paragraph.resources) if (!resources.has(resource.url)) resources.set(resource.url, resource)
  return [...resources.values()].slice(0, 3)
}

export function validateParagraphResults(value: unknown, requested: { id: string; text: string }[]): ParagraphResult[] {
  if (!Array.isArray(value) || value.length !== requested.length) throw new Error('Refine returned incomplete notes. Your writing is unchanged.')
  const found = new Set<string>()
  const result = value.map(item => {
    const original = requested.find(p => p.id === item?.id)
    if (!original || found.has(item.id) || typeof item.text !== 'string' || !item.text.trim() || /[\r\n]/u.test(item.text) || item.text.length > 12_000 || refinementWordCount(item.text) > Math.min(300, Math.max(12, refinementWordCount(original.text)))) throw new Error('Refine returned invalid notes. Your writing is unchanged.')
    found.add(item.id)
    if (item.isTodo !== undefined && typeof item.isTodo !== 'boolean') throw new Error('Refine returned invalid task information. Your writing is unchanged.')
    if (item.timerSeconds !== undefined && item.timerSeconds !== null && (!Number.isInteger(item.timerSeconds) || item.timerSeconds <= 0 || item.timerSeconds > MAX_TIMER_SECONDS || item.isTodo !== true)) throw new Error('Refine returned invalid timer information. Your writing is unchanged.')
    return { id: item.id as string, text: item.text.trim(), resources: parseLearningResources(item.resources), ...(item.isTodo !== undefined ? { isTodo: item.isTodo } : {}), ...(item.timerSeconds !== undefined ? { timerSeconds: item.timerSeconds } : {}) }
  })
  return requested.map(p => result.find(item => item.id === p.id)!)
}

export function refinementMetadata(text: string, previous: RefinedParagraph[], requested: Paragraph[], results: ParagraphResult[]) {
  const byId = new Map(results.map(result => [result.id, result]))
  const requestedByStart = new Map(requested.map(p => [p.start, p]))
  let offset = 0
  let nextText = ''
  const refined: RefinedParagraph[] = []
  const replacements: Replacement[] = []
  // Include whitespace-only lines to preserve their exact positions.
  for (const line of text.split('\n')) {
    const start = offset
    const end = start + line.length
    const paragraph = requestedByStart.get(start)
    const result = paragraph && byId.get(paragraph.id)
    const nextLine = result?.text ?? line
    const nextStart = nextText.length
    const done = previous.find(p => p.start === start && p.end === end)
    if (result || done) refined.push({ start: nextStart, end: nextStart + nextLine.length, resources: result?.resources ?? done!.resources })
    if (result && (result.text !== line || result.isTodo !== undefined || result.timerSeconds !== undefined)) replacements.push({ start, end, text: result.text, ...(result.isTodo !== undefined ? { isTodo: result.isTodo } : {}), ...(result.timerSeconds !== undefined ? { timerSeconds: result.timerSeconds } : {}) })
    nextText += nextLine + '\n'
    offset = end + 1
  }
  return { text: nextText.slice(0, -1), refinedParagraphs: refined, learningResources: paragraphResources(refined), replacements }
}
