import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const built = await build({ stdin: { contents: `export * from './worker/refinementQuota'; export * from './worker/refinementQuotaD1'; export {refinementParagraphCount} from './worker/refine';`, resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false })
const { D1RefinementQuota, MemoryRefinementQuota, withRefinementQuota, refinementParagraphCount, DAILY_LIMIT_MESSAGE, RESERVATION_TTL_MS } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
let mf, db
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-10-14', d1Databases: { DB: 'quota-test' } }))
  db = await mf.getD1Database('DB')
  const sql = await readFile(new URL('../worker/migrations/0003_refinement_usage.sql', import.meta.url), 'utf8')
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run()
})
after(async () => { await mf?.dispose() })
const start = Date.parse('2026-10-18T23:59:00Z')
for (const storage of ['D1', 'memory']) {
  async function fixture() {
    let now = start
    if (storage === 'D1') await db.prepare('DELETE FROM refinement_usage').run()
    const quota = storage === 'D1' ? new D1RefinementQuota(db, () => now) : new MemoryRefinementQuota(() => now)
    return { quota, advance: ms => { now += ms } }
  }
  const full = error => error.status === 429 && error.code === 'daily_refinement_limit' && error.message === DAILY_LIMIT_MESSAGE
  test(`${storage}: the 20th paragraph succeeds, the 21st fails, and another user has their own allowance`, async () => {
    const { quota } = await fixture()
    await quota.commit(await quota.reserve('a', 19))
    await quota.commit(await quota.reserve('a', 1))
    await assert.rejects(quota.reserve('a', 1), error => full(error) && error.resetAt === '2026-10-19T00:00:00.000Z')
    await quota.commit(await quota.reserve('b', 20))
    if (storage === 'D1') await assert.rejects(new D1RefinementQuota(db, () => start).reserve('a', 1), full)
  })
  test(`${storage}: concurrent devices reserve atomically and batches are all or nothing`, async () => {
    const { quota } = await fixture()
    await quota.commit(await quota.reserve('a', 18))
    await assert.rejects(quota.reserve('a', 3), full)
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => quota.reserve('a', 1)))
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 2)
    assert.equal(results.filter(r => r.status === 'rejected' && full(r.reason)).length, 4)
  })
  test(`${storage}: failed and cancelled calls release their full reservation; identical results count`, async () => {
    const { quota } = await fixture()
    const controller = new AbortController()
    await assert.rejects(withRefinementQuota(quota, 'a', 20, undefined, async () => { throw Error('Invalid response') }), /Invalid response/)
    await assert.rejects(withRefinementQuota(quota, 'a', 20, controller.signal, async () => { controller.abort(); return 'late response' }))
    assert.equal(await withRefinementQuota(quota, 'a', 20, undefined, async () => 'unchanged wording'), 'unchanged wording')
    await assert.rejects(quota.reserve('a', 1), full)
  })
  test(`${storage}: abandoned reservations expire and cannot commit late`, async () => {
    const { quota, advance } = await fixture()
    advance(-300_000) // Keep expiry within one UTC day, independent of midnight reset.
    const abandoned = await quota.reserve('a', 20)
    await assert.rejects(quota.reserve('a', 1), full)
    advance(RESERVATION_TTL_MS)
    await quota.commit(await quota.reserve('a', 20))
    await assert.rejects(quota.commit(abandoned), error => error.status === 503)
    await assert.rejects(quota.reserve('a', 1), full)
  })
  test(`${storage}: midnight UTC resets allowance, including when yesterday’s call is still running`, async () => {
    const { quota, advance } = await fixture()
    const previous = await quota.reserve('a', 20)
    advance(60_000)
    const today = await quota.reserve('a', 20)
    await quota.commit(previous)
    await quota.commit(today)
    await assert.rejects(quota.reserve('a', 1), full)
  })
}
test('both request formats count nonempty paragraphs and reject malformed input before reserving', () => {
  assert.equal(refinementParagraphCount({ text: '\nFirst\n \nSecond\n' }), 2)
  assert.equal(refinementParagraphCount({ paragraphs: [{ id: 'a', text: 'Same' }, { id: 'b', text: 'Same' }] }), 2)
  assert.throws(() => refinementParagraphCount({ paragraphs: [{ id: 'a', text: 'One' }, { id: 'a', text: 'Two' }] }))
  assert.throws(() => refinementParagraphCount({ text: '  \n' }))
})
