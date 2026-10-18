import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundled = await build({ entryPoints: ['src/noteSearch.ts'], bundle: true, format: 'esm', write: false })
const { findTextMatches, moveSearchMatch, mergeSearchRects } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)

test('search finds every case-insensitive occurrence including single characters', () => {
  assert.deepEqual(findTextMatches('Hello hello HELLO', 'hello'), [{ start: 0, end: 5 }, { start: 6, end: 11 }, { start: 12, end: 17 }])
  assert.deepEqual(findTextMatches('Hello', 'l'), [{ start: 2, end: 3 }, { start: 3, end: 4 }])
})

test('queries are literal, preserve whitespace, and allow empty/no results', () => {
  const query = '[a].*+?^${}()|\\'
  assert.deepEqual(findTextMatches(`before ${query} after`, query), [{ start: 7, end: 7 + query.length }])
  assert.deepEqual(findTextMatches('a b', ' '), [{ start: 1, end: 2 }])
  assert.deepEqual(findTextMatches('hello', ''), [])
  assert.deepEqual(findTextMatches('hello', 'missing'), [])
})

test('Unicode matching keeps original UTF-16 anchors after emoji and expanding lowercase characters', () => {
  assert.deepEqual(findTextMatches('🌱 İ Hello\nhello', 'hello'), [{ start: 5, end: 10 }, { start: 11, end: 16 }])
  assert.deepEqual(findTextMatches('🌱🌱', '🌱'), [{ start: 0, end: 2 }, { start: 2, end: 4 }])
})

test('next and previous match wrap, including empty results', () => {
  assert.equal(moveSearchMatch(2, 1, 3), 0)
  assert.equal(moveSearchMatch(0, -1, 3), 2)
  assert.equal(moveSearchMatch(0, -1, 0), 0)
  assert.equal(moveSearchMatch(0, 1, 1), 0)
})

test('highlight geometry merges duplicate inline boxes while preserving wrapped lines', () => {
  const first = { left: 10, top: 0, width: 30, height: 20 }
  assert.deepEqual(mergeSearchRects([first, { ...first }, { left: 40, top: 0, width: 10, height: 20 }, { left: 10, top: 32, width: 20, height: 20 }]), [{ left: 10, top: 0, width: 40, height: 20 }, { left: 10, top: 32, width: 20, height: 20 }])
  assert.equal(first.width, 30)
})
