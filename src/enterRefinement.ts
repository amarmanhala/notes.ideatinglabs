import { changedRange } from './writingSessions'
import { mapRefinedParagraphs, noteParagraphs, pendingParagraphs, validateParagraphResults, type Paragraph, type ParagraphBatch, type RefinementEdit, type RefinedParagraph } from './refinementState'

type Task = { paragraph: Paragraph; controller?: AbortController }
type Snapshot = { pending: Paragraph[]; error: string; announcement: string }

// Track the source range, rather than the whole document, while the next note is written.
export class EnterRefinement {
  private text = ''
  private refined: RefinedParagraph[] = []
  private dirty: RefinedParagraph[] = []
  private tasks: Task[] = []
  private listeners = new Set<() => void>()
  private snapshot: Snapshot = { pending: [], error: '', announcement: '' }
  readonly scope: string
  private request: (paragraph: Paragraph, signal: AbortSignal) => Promise<ParagraphBatch>
  apply: (paragraph: Paragraph, result: ParagraphBatch) => void = () => {}
  constructor(request: (paragraph: Paragraph, signal: AbortSignal) => Promise<ParagraphBatch>, scope: string) { this.request = request; this.scope = scope }
  setApply(apply: (paragraph: Paragraph, result: ParagraphBatch) => void) { this.apply = apply }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.snapshot
  private publish(error = this.snapshot.error, announcement = this.tasks.length ? 'Refining note.' : '') {
    this.snapshot = { pending: this.tasks.map(t => t.paragraph), error, announcement }
    this.listeners.forEach(listener => listener())
  }
  update(text: string, refined: RefinedParagraph[] = [], edits?: RefinementEdit[], userEdit = false) {
    if (text !== this.text) {
      const changes = edits?.length && edits[0].before === this.text && edits.at(-1)?.after === text ? edits : [{ before: this.text, after: text }]
      for (const edit of changes) {
        if (edit.before === edit.after) continue
        const change = changedRange(edit.before, edit.after, edit.editStart)
        const wasDirty = this.dirty.some(p => p.start <= change.oldEnd && p.end >= change.start)
        const onlyLineBreaks = /^[\r\n]*$/.test(edit.before.slice(change.start, change.oldEnd)) && /^[\r\n]*$/.test(edit.after.slice(change.start, change.newEnd))
        this.dirty = mapRefinedParagraphs(edit.before, edit.after, this.dirty, change)
        // Loading notes and inserting blank lines are not new writing. Splitting
        // a draft that has already been edited keeps its resulting pieces dirty.
        if (userEdit && (!onlyLineBreaks || wasDirty)) {
          const affected = noteParagraphs(edit.after).filter(p => onlyLineBreaks || change.newEnd === change.start
            ? p.start <= change.newEnd && p.end >= change.start
            : p.start < change.newEnd && p.end > change.start)
          for (const p of affected) if (!this.dirty.some(d => d.start === p.start)) this.dirty.push({ start: p.start, end: p.end, resources: [] })
        }
      }
      let cancelled = false
      this.tasks = this.tasks.filter(task => {
        let range: RefinedParagraph[] = [{ ...task.paragraph, resources: [] }]
        for (const edit of changes) range = mapRefinedParagraphs(edit.before, edit.after, range, changedRange(edit.before, edit.after, edit.editStart))
        if (!range.length) { task.controller?.abort(); cancelled = true; return false }
        task.paragraph = { ...task.paragraph, start: range[0].start, end: range[0].end }
        return true
      })
      this.text = text
      this.publish(cancelled ? 'Note changed. Press Enter on that note to refine it again.' : this.snapshot.error)
    }
    this.refined = refined
    this.dirty = this.dirty.filter(p => !refined.some(done => done.start === p.start && done.end === p.end))
    this.run()
  }
  complete(paragraph: Paragraph) {
    if (!paragraph.text.trim() || !this.dirty.some(p => p.start === paragraph.start && p.end === paragraph.end)) return
    const eligible = pendingParagraphs(this.text, this.refined).find(p => p.start === paragraph.start && p.end === paragraph.end && p.text === paragraph.text)
    if (!eligible || this.tasks.some(t => t.paragraph.start === paragraph.start)) return
    this.tasks.push({ paragraph: { ...eligible, id: crypto.randomUUID() } })
    this.publish('')
    this.run()
  }
  cancel() {
    this.tasks.forEach(t => t.controller?.abort())
    this.tasks = []
    this.publish('')
  }
  private run() {
    const task = this.tasks[0]
    if (!task || task.controller) return
    const controller = new AbortController()
    task.controller = controller
    const source = { ...task.paragraph }
    void (async () => {
      try {
        const result = await this.request(source, AbortSignal.any([controller.signal, AbortSignal.timeout(70_000)]))
        if (controller.signal.aborted || !this.tasks.includes(task)) return
        const paragraphs = validateParagraphResults(result.paragraphs, [source])
        this.tasks = this.tasks.filter(t => t !== task)
        this.apply(task.paragraph, { ...result, paragraphs })
        this.publish(result.resourceNotice ?? '', 'Refinement complete.')
      } catch (failure) {
        if (controller.signal.aborted) return
        this.tasks = this.tasks.filter(t => t !== task)
        this.publish(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : 'Refine timed out. Press Enter on that note to try again.', 'Refinement failed.')
      } finally {
        this.run()
      }
    })()
  }
}
