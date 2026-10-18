import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/relativeTime.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { formatRelativeTime } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const now = Date.parse('2026-10-14T16:00:00Z')
const ago = seconds => formatRelativeTime(new Date(now - seconds * 1000).toISOString(), now)

test('relative session labels match the requested formats', () => {
  assert.equal(ago(60), '1 min ago')
  assert.equal(ago(5 * 60), '5 mins ago')
  assert.equal(ago(59 * 60), '59 mins ago')
  assert.equal(ago(23 * 3600), '23 hours ago')
  assert.equal(ago(2 * 86400), '2 days ago')
  assert.equal(ago(60 * 86400), '2 months ago')
})
test('relative labels handle fresh writing and time boundaries', () => {
  assert.equal(ago(0), 'just now')
  assert.equal(ago(-60), 'just now')
  assert.equal(ago(59), 'just now')
  assert.equal(ago(3600), '1 hour ago')
  assert.equal(ago(86400), '1 day ago')
  assert.equal(ago(30 * 86400), '1 month ago')
  assert.equal(ago(365 * 86400), '1 year ago')
})
