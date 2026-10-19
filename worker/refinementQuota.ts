import { RefineError } from './refine.ts'

export const DAILY_REFINEMENT_LIMIT = 20
export const RESERVATION_TTL_MS = 120_000
export const DAILY_LIMIT_MESSAGE = 'You’ve used today’s 20 AI refinements. Keep writing—more tomorrow.'

export class DailyRefinementLimitError extends RefineError {
  readonly code = 'daily_refinement_limit'
  readonly resetAt: string
  constructor(resetAt: string) { super(429, DAILY_LIMIT_MESSAGE); this.resetAt = resetAt }
}

export function quotaWindow(now: number) {
  const day = new Date(now).toISOString().slice(0, 10)
  return { day, resetAt: new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString() }
}

export interface RefinementQuota {
  reserve(owner: string, count: number): Promise<string>
  commit(id: string): Promise<void>
  release(id: string): Promise<void>
}

export async function withRefinementQuota<T>(quota: RefinementQuota, owner: string, count: number, signal: AbortSignal | undefined, refine: () => Promise<T>): Promise<T> {
  signal?.throwIfAborted()
  const id = await quota.reserve(owner, count)
  try {
    signal?.throwIfAborted()
    const result = await refine()
    signal?.throwIfAborted()
    await quota.commit(id)
    signal?.throwIfAborted()
    return result
  } catch (error) {
    await quota.release(id)
    throw error
  }
}

export function checkReservationCount(count: number) {
  if (!Number.isSafeInteger(count) || count < 1) throw new RefineError(400, 'Choose a paragraph to refine.')
}

// Local development only. A server restart resets this allowance.
export class MemoryRefinementQuota implements RefinementQuota {
  private records = new Map<string, { owner: string; day: string; count: number; expires: number; completed: boolean }>()
  private now: () => number
  constructor(now = Date.now) { this.now = now }
  async reserve(owner: string, count: number) {
    checkReservationCount(count)
    const now = this.now(), { day, resetAt } = quotaWindow(now)
    let used = 0
    for (const [id, row] of this.records) {
      if ((row.day < day && row.completed) || (!row.completed && row.expires <= now)) this.records.delete(id)
      else if (row.owner === owner && row.day === day) used += row.count
    }
    if (used + count > DAILY_REFINEMENT_LIMIT) throw new DailyRefinementLimitError(resetAt)
    const id = crypto.randomUUID()
    this.records.set(id, { owner, day, count, expires: now + RESERVATION_TTL_MS, completed: false })
    return id
  }
  async commit(id: string) {
    const row = this.records.get(id)
    if (!row || row.expires <= this.now()) throw new RefineError(503, 'Refine took too long. Your notes are unchanged. Try again.')
    row.completed = true
  }
  async release(id: string) { this.records.delete(id) }
}
