import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { build } from 'esbuild'

// Compile the pure TypeScript module for Node without adding a test runtime.
const compiled = (await build({entryPoints:['src/writingSessions.ts'],bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text
const { applyWritingChange, parseHistory, changedRange, STORAGE_KEY } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const start = Date.parse('2026-10-14T14:00:00Z')
let sequence = 0
const id = () => `session-${++sequence}`
const write = (entry, text, seconds = 0) => applyWritingChange(entry, text, start + seconds * 1000, id)

test('first text mutation starts a session and unchanged input does nothing', () => {
  assert.equal(write(undefined, ''), undefined)
  const entry = write(undefined, 'First thought')
  assert.equal(entry.sessions.length, 1)
  assert.equal(entry.sessions[0].anchorOffset, 0)
  assert.equal(entry.sessions[0].startedAt, new Date(start).toISOString())
  assert.strictEqual(write(entry, entry.text, 200), entry)
})

test('119 seconds continues; exactly 120 seconds since the last change starts a session', () => {
  let entry = write(undefined, 'A')
  const originalStart = entry.sessions[0].startedAt
  entry = write(entry, 'AB', 119)
  assert.equal(entry.sessions.length, 1)
  assert.equal(entry.sessions[0].startedAt, originalStart)
  assert.equal(entry.sessions[0].lastEditedAt, new Date(start + 119000).toISOString())
  entry = write(entry, 'ABC', 239)
  assert.equal(entry.sessions.length, 2)
  assert.equal(entry.sessions[1].anchorOffset, 2)
  entry = write(entry, 'ABCD', 600)
  assert.equal(entry.sessions.length, 3)
})

test('editing, pasting, and deleting after the pause each start a session', () => {
  let entry = write(undefined, 'first thought')
  entry = write(entry, 'First thought', 120)
  assert.equal(entry.sessions[1].anchorOffset, 0)
  entry = write(entry, 'First pasted thought', 240)
  assert.equal(entry.sessions[2].anchorOffset, 6)
  entry = write(entry, 'First thought', 360)
  assert.equal(entry.sessions[3].anchorOffset, 6)
  assert.equal(entry.sessions.length, 4)
  assert.equal(entry.createdAt, new Date(start).toISOString())
})

test('inserting and deleting before an anchor moves it with its passage', () => {
  let entry = write(undefined, 'alpha\n')
  entry = write(entry, 'alpha\nbeta', 120)
  assert.equal(entry.sessions[1].anchorOffset, 6)
  entry = write(entry, 'prefix alpha\nbeta', 121)
  assert.equal(entry.sessions[1].anchorOffset, 13)
  entry = write(entry, 'alpha\nbeta', 122)
  assert.equal(entry.sessions[1].anchorOffset, 6)
})

test('replacing anchored text clamps markers and deleting everything preserves sessions', () => {
  let entry = write(undefined, 'alpha\n')
  entry = write(entry, 'alpha\nbeta', 120)
  const originalSessions = entry.sessions.map(session => ({...session}))
  entry = write(entry, 'alpX', 121)
  assert.equal(entry.sessions[1].anchorOffset, 3)
  entry = write(entry, '', 122)
  assert.deepEqual(entry.sessions.map(session => session.anchorOffset), [0, 0])
  assert.deepEqual(entry.sessions.map(session => session.startedAt), originalSessions.map(session => session.startedAt))
  assert.deepEqual(entry.sessions.map(session => session.id), originalSessions.map(session => session.id))
})

test('legacy history migrates without changing text, dates, or the storage key', () => {
  const old = {text: 'Existing writing', createdAt: new Date(start).toISOString(), updatedAt: new Date(start + 60000).toISOString()}
  const entry = parseHistory(JSON.stringify({'2026-10-14': old}))['2026-10-14']
  assert.equal(STORAGE_KEY, 'notes.writing.v1')
  assert.equal(entry.text, old.text)
  assert.equal(entry.createdAt, old.createdAt)
  assert.equal(entry.updatedAt, old.updatedAt)
  assert.equal(entry.sessions.length, 1)
  assert.equal(entry.sessions[0].startedAt, old.createdAt)
  assert.equal(entry.sessions[0].lastEditedAt, old.updatedAt)
  assert.equal(entry.sessions[0].anchorOffset, 0)
})

test('serialized history preserves sessions and reload timing', () => {
  const original = write(undefined, 'A', 0)
  const restored = parseHistory(JSON.stringify({'2026-10-14': original}))['2026-10-14']
  assert.deepEqual(restored, original)
  assert.equal(write(restored, 'AB', 119).sessions.length, 1)
  assert.equal(write(restored, 'AB', 120).sessions.length, 2)
})

test('unchanged events cannot reset the session clock', () => {
  const entry = write(undefined, 'A')
  const unchanged = write(entry, 'A', 119)
  assert.strictEqual(unchanged, entry)
  assert.equal(write(unchanged, 'AB', 120).sessions.length, 2)
})

test('edits are immutable and coincident anchors remain distinct', () => {
  const entry = write(undefined, 'abc')
  const snapshot = JSON.stringify(entry)
  const next = write(entry, 'Abc', 120)
  assert.equal(JSON.stringify(entry), snapshot)
  assert.deepEqual(next.sessions.map(session => session.anchorOffset), [0, 0])
  assert.notEqual(next.sessions[0].id, next.sessions[1].id)
})

test('UTF-16 offsets agree with textarea selections and multiline edits', () => {
  assert.deepEqual(changedRange('🌱\nhello', '🌱\nhi'), {start: 4, oldEnd: 8, newEnd: 5})
})

test('malformed session metadata is rejected rather than silently overwritten', () => {
  const entry = write(undefined, 'A')
  const bad = {...entry, sessions: [{...entry.sessions[0], anchorOffset: 10}]}
  assert.throws(() => parseHistory(JSON.stringify({'2026-10-14': bad})))
  assert.throws(() => parseHistory('invalid'))
})

test('input positions disambiguate edits in repeated text', () => {
  assert.deepEqual(changedRange('aaa', 'aaaa', 0), {start: 0, oldEnd: 0, newEnd: 1})
  assert.deepEqual(changedRange('aaa', 'aa', 0), {start: 0, oldEnd: 1, newEnd: 0})
  const entry = write(undefined, 'aaa')
  const next = applyWritingChange(entry, 'aaaa', start + 120000, id, 1)
  assert.equal(next.sessions[1].anchorOffset, 1)
})

const layoutSource = await readFile(new URL('../src/sessionLayout.ts', import.meta.url), 'utf8')
const layoutCompiled = ts.transpileModule(layoutSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { positionSessionLabels, groupTimelineLabels, timelineOffset } = await import(`data:text/javascript;base64,${Buffer.from(layoutCompiled).toString('base64')}`)

test('timeline markers skip empty lines without changing their saved anchors', () => {
  assert.equal(timelineOffset('alpha\n\nbeta', 6), 7)
  assert.equal(timelineOffset('alpha\n   \nbeta', 7), 10)
  assert.equal(timelineOffset('\nalpha', 0), 1)
  assert.equal(timelineOffset('alpha\n', 6), 5)
  assert.equal(timelineOffset('alpha\nbeta', 7), 7)
})

test('labels stay at their anchored word instead of being shifted into a stack', () => {
  let entry = write(undefined, 'abc')
  entry = write(entry, 'Abc', 120)
  const before = JSON.stringify(entry.sessions)
  const labels = positionSessionLabels(entry.sessions, () => ({left: 12, top: 10}), 0)
  assert.deepEqual(labels.map(label => ({left: label.left, top: label.top})), [{left: 12, top: 10}, {left: 12, top: 10}])
  assert.equal(JSON.stringify(entry.sessions), before)
})

test('labels follow word position, wrapping, scrolling, and the editor origin', () => {
  const entry = write(write(undefined, 'alpha\n'), 'alpha\nbeta', 120)
  const labels = positionSessionLabels(entry.sessions, offset => offset === 0 ? {left: 12, top: 8} : {left: 50, top: 80}, 30, 5, {left: 96, top: 0})
  assert.deepEqual(labels.map(label => ({left: label.left, top: label.top})), [{left: 103, top: -22}, {left: 141, top: 50}])
  const rewrapped = positionSessionLabels(entry.sessions, offset => offset === 0 ? {left: 12, top: 8} : {left: 12, top: 112}, 30)
  assert.deepEqual(rewrapped.map(label => label.top), [-22, 82])
})

test('timeline groups sessions on the same line without losing history', () => {
  let entry = write(undefined, 'abc')
  entry = write(entry, 'Abc', 120)
  const labels = positionSessionLabels(entry.sessions, () => ({left: 12, top: 10}), 0)
  const rows = groupTimelineLabels(labels)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].sessions.length, 2)
  assert.equal(rows[0].top, 10)
})
test('timeline orders separate lines and follows editor scrolling', () => {
  const entry = write(write(undefined, 'alpha\n'), 'alpha\nbeta', 120)
  const labels = positionSessionLabels(entry.sessions, offset => ({left: 12, top: offset ? 80 : 10}), 30)
  const rows = groupTimelineLabels([...labels].reverse())
  assert.deepEqual(rows.map(row => row.top), [-20, 50])
  assert.equal(rows[0].sessions[0].id, entry.sessions[0].id)
})
