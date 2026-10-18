import { parseTaskTimer, type TaskTimer } from './taskTimer.ts'
export type TaskParagraph = { start: number; end: number; checked: boolean; timer?: TaskTimer | null }

export function parseTasks(value: unknown, text: string): TaskParagraph[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 12_000) throw new Error('Invalid tasks')
  let offset = 0
  const ranges = new Map(text.split('\n').map(line => { const start = offset; offset += line.length + 1; return [start, line.trim() ? start + line.length : -1] }))
  const seen = new Set<number>()
  return value.map(task => {
    if (!task || !Number.isInteger(task.start) || !Number.isInteger(task.end) || ranges.get(task.start) !== task.end || typeof task.checked !== 'boolean' || seen.has(task.start)) throw new Error('Invalid task range')
    seen.add(task.start)
    const timer = parseTaskTimer(task.timer)
    return { start: task.start, end: task.end, checked: task.checked, ...(task.timer !== undefined ? { timer: timer ?? null } : {}) }
  }).sort((a, b) => a.start - b.start)
}
