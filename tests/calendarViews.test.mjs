import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built = await build({ entryPoints: ['src/calendarViews.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { weekDays, monthDays, yearMonths } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)

test('week view spans Sunday through Saturday around the selected day', () => {
  assert.deepEqual(weekDays('2026-10-20'), ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'])
})

test('month view supplies six complete calendar weeks', () => {
  const days = monthDays('2026-10-20')
  assert.equal(days.length, 42)
  assert.equal(days[0], '2026-09-27')
  assert.equal(days.at(-1), '2026-11-07')
})

test('year view supplies all twelve month grids', () => {
  const months = yearMonths('2026-10-20')
  assert.equal(months.length, 12)
  assert.equal(months[0].key, '2026-01-01')
  assert.equal(months.at(-1).key, '2026-12-01')
  assert.equal(months.every(month => month.days.length === 42), true)
})
