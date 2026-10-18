import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundled = await build({ entryPoints: ['src/reviewPassages.ts'], bundle: true, format: 'esm', write: false })
const { buildReviewPassages, captureReview } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const time = hour => `2026-10-14T${String(hour).padStart(2, '0')}:00:00.000Z`
const session = (id, anchorOffset, hour) => ({ id, anchorOffset, startedAt: time(hour), lastEditedAt: time(hour) })
const entry = (text, sessions = [], formats) => ({ text, sessions, createdAt: time(9), updatedAt: time(12), ...(formats ? { formats } : {}) })

test('ordinary sessions cover all current text once with stable identities', () => {
  const note = entry('first\nsecond\nthird', [session('a', 0, 9), session('b', 6, 10), session('c', 13, 11)])
  const passages = buildReviewPassages(note)
  assert.deepEqual(passages.map(p => p.text), ['first\n', 'second\n', 'third'])
  assert.equal(passages.map(p => p.text).join(''), note.text)
  assert.deepEqual(passages.map(p => p.id), ['session:a', 'session:b', 'session:c'])
  assert.deepEqual(buildReviewPassages(note), passages)
})

test('a later edit at an earlier anchor moves that current passage later in the walkthrough', () => {
  const note = entry('revised\nsecond\nthird', [session('a', 0, 9), session('b', 8, 10), session('c', 15, 11), session('d', 0, 12)])
  const passages = buildReviewPassages(note)
  assert.deepEqual(passages.map(p => p.text), ['second\n', 'third', 'revised\n'])
  assert.equal(passages[2].startedAt, time(12))
  assert.equal(passages[2].id, 'session:d')
  assert.equal(passages.slice().sort((a, b) => a.start - b.start).map(p => p.text).join(''), note.text)
})

test('shared offsets coalesce using the latest start rather than last-edited time', () => {
  const earlier = { ...session('a', 0, 9), lastEditedAt: time(15) }
  const passages = buildReviewPassages(entry('idea', [session('b', 0, 10), earlier]))
  assert.equal(passages.length, 1)
  assert.equal(passages[0].startedAt, time(10))
})

test('text before the first anchor and notes without sessions use creation time', () => {
  assert.deepEqual(buildReviewPassages(entry('prefix\nlater', [session('b', 7, 10)])).map(p => [p.text, p.startedAt]), [['prefix\n', time(9)], ['later', time(10)]])
  assert.equal(buildReviewPassages(entry('legacy note'))[0].startedAt, time(9))
})

test('deleted and whitespace-only passages are skipped without dropping remaining writing', () => {
  const passages = buildReviewPassages(entry('   \nidea\n\n', [session('a', 0, 9), session('b', 4, 10), session('c', 9, 11), session('d', 10, 12)]))
  assert.deepEqual(passages.map(p => p.text), ['idea\n'])
  assert.deepEqual(buildReviewPassages(undefined), [])
  assert.deepEqual(buildReviewPassages(entry('')), [])
  assert.deepEqual(buildReviewPassages(entry(' \n\t', [session('a', 0, 9)])), [])
})

test('equal timestamps use document position as a chronological tie breaker', () => {
  assert.deepEqual(buildReviewPassages(entry('one two', [session('b', 4, 9), session('a', 0, 9)])).map(p => p.start), [0, 4])
})

test('formatting clips to each passage and rebases UTF-16 offsets', () => {
  const passages = buildReviewPassages(entry('ab🌱\nCDxy', [session('a', 0, 9), session('b', 5, 10)], [{ start: 1, end: 7, marks: ['bold'] }, { start: 2, end: 4, marks: ['italic'] }]))
  assert.deepEqual(passages[0].formats, [{ start: 1, end: 5, marks: ['bold'] }, { start: 2, end: 4, marks: ['italic'] }])
  assert.deepEqual(passages[1].formats, [{ start: 0, end: 2, marks: ['bold'] }])
  assert.equal(passages[0].text, 'ab🌱\n')
})

test('captured reviews remain independent of later edits and never mutate saved entry data', () => {
  const note = entry('idea', [session('a', 0, 9)], [{ start: 0, end: 4, marks: ['bold'] }])
  const original = JSON.stringify(note)
  const snapshot = captureReview(note)
  assert.equal(JSON.stringify(note), original)
  note.text = 'changed'
  note.formats[0].marks.push('italic')
  note.sessions[0].startedAt = time(13)
  assert.equal(snapshot.fingerprint, original)
  assert.equal(snapshot.passages[0].text, 'idea')
  assert.equal(snapshot.passages[0].startedAt, time(9))
  assert.deepEqual(snapshot.passages[0].formats[0].marks, ['bold'])
})
