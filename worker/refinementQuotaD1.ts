import { RefineError } from './refine'
import { DAILY_REFINEMENT_LIMIT, RESERVATION_TTL_MS, DailyRefinementLimitError, checkReservationCount, quotaWindow, type RefinementQuota } from './refinementQuota'

export class D1RefinementQuota implements RefinementQuota {
  constructor(private db: D1Database, private now = Date.now) {}
  async reserve(owner: string, count: number) {
    checkReservationCount(count)
    const now = this.now(), { day, resetAt } = quotaWindow(now)
    const id = crypto.randomUUID()
    // The allowance check and reservation are one write on D1's primary.
    const saved = await this.db.prepare(`
      INSERT INTO refinement_usage (id, owner_id, day, paragraphs, expires_at)
      SELECT ?1, ?2, ?3, ?4, ?5
      WHERE ?4 + (SELECT COALESCE(SUM(paragraphs), 0) FROM refinement_usage
        WHERE owner_id = ?2 AND day = ?3 AND (completed = 1 OR expires_at > ?6)) <= ?7
      RETURNING id
    `).bind(id, owner, day, count, now + RESERVATION_TTL_MS, now, DAILY_REFINEMENT_LIMIT).first<{ id: string }>()
    if (!saved) throw new DailyRefinementLimitError(resetAt)
    return id
  }
  async commit(id: string) {
    const saved = await this.db.prepare('UPDATE refinement_usage SET completed = 1 WHERE id = ?1 AND expires_at > ?2 RETURNING id')
      .bind(id, this.now()).first<{ id: string }>()
    if (!saved) throw new RefineError(503, 'Refine took too long. Your notes are unchanged. Try again.')
  }
  async release(id: string) {
    await this.db.prepare('DELETE FROM refinement_usage WHERE id = ?1').bind(id).run()
  }
}
