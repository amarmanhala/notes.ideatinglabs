import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'https://notes.test' })
for (const key of ['window', 'document', 'navigator', 'localStorage', 'Node', 'Element', 'HTMLElement', 'DocumentFragment', 'MutationObserver', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'Event', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  const value = dom.window[key]
  Object.defineProperty(globalThis, key, { value: ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(key) ? value.bind(dom.window) : value, configurable: true, writable: true })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
// React's browser act scheduler creates channels that Node keeps alive.
// Track and close only channels created during this DOM test's lifetime.
const NativeMessageChannel = globalThis.MessageChannel
const channels = []
globalThis.MessageChannel = class extends NativeMessageChannel {
  constructor() { super(); channels.push(this) }
}
dom.window.HTMLElement.prototype.scrollTo = function ({ top }) { this.scrollTop = top }
const captures = new WeakMap()
dom.window.HTMLElement.prototype.setPointerCapture = function (id) { captures.set(this, id) }
dom.window.HTMLElement.prototype.hasPointerCapture = function (id) { return captures.get(this) === id }
dom.window.HTMLElement.prototype.releasePointerCapture = function () { captures.delete(this) }
const bundled = await build({ stdin: { contents: `
  export { createElement, act } from 'react';
  export { createRoot } from 'react-dom/client';
  export { ReviewPanel } from './src/ReviewPanel';
  export { AskAIPanel } from './src/AskAIPanel';
  export { LearningResources } from './src/LearningResourceGroup';
  export { SlashMenu } from './src/SlashMenu';
  export { isSlashCommand } from './src/slashCommands';
  import { createElement } from 'react';
  import { AskAIPanel } from './src/AskAIPanel';
  import { ResizableSidebar } from './src/ResizableSidebar';
  export function ResizableAskAIPanel(props) { return createElement(ResizableSidebar, null, createElement(AskAIPanel, props)); }
`, resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', plugins: [{ name: 'omit-styles-in-dom-tests', setup(build) { build.onLoad({ filter: /\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' })) } }], define: { 'process.env.NODE_ENV': '"development"' }, write: false })
const { createElement, act, createRoot, ReviewPanel, AskAIPanel, ResizableAskAIPanel, LearningResources, SlashMenu, isSlashCommand } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const at = hour => `2026-10-14T${hour}:00:00.000Z`
const note = { text: 'first thought\nsecond thought', createdAt: at('09'), updatedAt: at('10'), sessions: [{ id: 'a', startedAt: at('09'), lastEditedAt: at('09'), anchorOffset: 0 }, { id: 'b', startedAt: at('10'), lastEditedAt: at('10'), anchorOffset: 14 }], formats: [{ start: 0, end: 5, marks: ['bold', 'italic'] }] }
let root, host, writing, props, closed, component
async function mount(entry = note, extra = {}, Component = ReviewPanel) {
  component = Component
  host = document.createElement('div')
  writing = document.createElement('div')
  writing.tabIndex = 0
  document.body.append(writing, host)
  root = createRoot(host)
  closed = 0
  props = { entry, dateLabel: 'October 14, 2026', isToday: true, onClose: () => { closed++; writing.focus() }, ...extra }
  await act(async () => root.render(createElement(component, props)))
}
async function update(extra) {
  props = { ...props, ...extra }
  await act(async () => root.render(createElement(component, props)))
}
const button = name => [...host.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') ?? node.textContent).trim() === name)
const passage = () => host.querySelector('[aria-label="Original passage"]')
const click = async name => { assert.ok(button(name), name); await act(async () => button(name).click()) }
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); writing?.remove(); root = undefined })
after(() => {
  dom.window.close()
  channels.forEach(channel => { channel.port1.close(); channel.port2.close() })
  globalThis.MessageChannel = NativeMessageChannel
})

test('learning AvatarGroup opens accessible resource links', async () => {
  await mount(note, { resources: [
    { title: 'Learn React', url: 'https://react.dev/learn' },
    { title: 'React tutorial', url: 'https://react.dev/learn/tutorial-tic-tac-toe' },
  ] }, LearningResources)
  await click('View 2 learning resources')
  const links = [...document.querySelectorAll('[data-learning-resources] a')]
  assert.equal(links.length, 2)
  assert.equal(links[0].href, 'https://react.dev/learn')
  assert.match(links[0].textContent, /Learn React/)
  assert.equal(links[0].target, '_blank')
  assert.equal(links[0].rel, 'noopener noreferrer')
})

test('slash commands open at word boundaries without matching links or paths', () => {
  for (const text of ['/', 'a thought /', '\t/']) assert.equal(isSlashCommand(text), true)
  for (const text of ['', 'https:/', 'https://', 'folder/', 'a/b', '/photo']) assert.equal(isSlashCommand(text), false)
})

test('slash menu shows Photo and Voice and supports selection and Escape', async () => {
  let selected
  await mount(note, { left: 100, top: 100, onSelect: value => { selected = value } }, SlashMenu)
  const items = [...document.querySelectorAll('[role="menuitem"]')]
  assert.deepEqual(items.map(item => item.textContent.trim()), ['Photo', 'Voice'])
  await act(async () => items[0].click())
  assert.equal(selected, 'Photo')
  const menu = document.querySelector('[role="menu"]')
  await act(async () => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  assert.ok(closed > 0)
})

test('review opens on a real formatted passage and moves through timestamps without changing storage', async () => {
  dom.window.localStorage.setItem('notes.writing.v1', JSON.stringify(note))
  const original = dom.window.localStorage.getItem('notes.writing.v1')
  await mount()
  assert.equal(host.querySelector('h2').textContent, 'Ask AI')
  assert.equal(document.activeElement, button('Close review'))
  assert.equal(passage().textContent.trim(), 'first thought')
  assert.equal(passage().querySelector('strong em').textContent, 'first')
  assert.equal(host.querySelector('time').dateTime, at('09'))
  assert.ok(host.textContent.includes('1 of 2'))
  assert.equal(button('Previous').disabled, true)
  assert.ok(host.textContent.includes('AI reflections aren’t connected yet.'))
  assert.equal(button('Explore a question'), undefined)
  await click('Next')
  assert.equal(passage().textContent, 'second thought')
  assert.equal(host.querySelector('time').dateTime, at('10'))
  assert.ok(host.textContent.includes('2 of 2'))
  assert.equal(button('Next'), undefined)
  await click('Previous')
  assert.equal(passage().textContent.trim(), 'first thought')
  assert.equal(dom.window.localStorage.getItem('notes.writing.v1'), original)
  assert.equal(JSON.stringify(props.entry), JSON.stringify(note))
})

test('edits leave the current walkthrough frozen until Refresh resets it', async () => {
  await mount()
  await click('Next')
  await update({ entry: { ...note, text: 'new first\nnew second', formats: [], sessions: [{ ...note.sessions[0] }, { ...note.sessions[1], anchorOffset: 10 }], updatedAt: at('11') } })
  assert.equal(passage().textContent, 'second thought')
  assert.ok(host.textContent.includes('Notes changed'))
  assert.ok(host.textContent.includes('2 of 2'))
  await click('Refresh')
  assert.equal(passage().textContent.trim(), 'new first')
  assert.ok(host.textContent.includes('1 of 2'))
  assert.equal(button('Refresh'), undefined)
})

test('one passage shows Done, and Done, Close and Escape invoke focus restoration', async () => {
  await mount({ ...note, sessions: [note.sessions[0]] })
  assert.ok(host.textContent.includes('1 of 1'))
  assert.equal(button('Next'), undefined)
  assert.equal(button('Previous'), undefined)
  await click('Done')
  assert.equal(document.activeElement, writing)
  await click('Close review')
  assert.equal(document.activeElement, writing)
  await act(async () => host.querySelector('aside').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  assert.equal(closed, 3)
  assert.equal(document.activeElement, writing)
})

test('empty notes show a writing invitation rather than sample content', async () => {
  await mount({ ...note, text: ' \n', sessions: [], formats: [] })
  assert.ok(host.textContent.includes('Nothing to review yet'))
  assert.equal(passage(), null)
  assert.equal(host.querySelector('time'), null)
  assert.ok(button('Done'))
})

test('the sidebar new-review action captures current writing and restarts at the first passage', async () => {
  await mount()
  await click('Next')
  await update({ entry: { ...note, text: 'fresh thought', sessions: [note.sessions[0]], formats: [], updatedAt: at('11') } })
  await click('Start a new review')
  assert.equal(passage().textContent, 'fresh thought')
  assert.ok(host.textContent.includes('1 of 1'))
  assert.equal(button('Refresh'), undefined)
  assert.ok(button('Done'))
})

test('provided reflections reveal only one optional response and reset it on navigation', async () => {
  await mount(note, { insights: { 'session:a': { sourceText: 'first thought\n', reflection: 'A short grounded reflection.', question: 'A focused question?', nextStep: 'A small step.' } } })
  assert.ok(host.textContent.includes('A short grounded reflection.'))
  await click('Explore a question')
  assert.equal(host.querySelector('#review-response').textContent, 'A focused question?')
  await click('Suggest a next step')
  assert.equal(host.querySelector('#review-response').textContent, 'A small step.')
  assert.equal(host.querySelectorAll('#review-response').length, 1)
  await click('Next')
  await click('Previous')
  assert.equal(host.querySelector('#review-response'), null)
  await update({ insights: { 'session:a': { sourceText: 'a different version', reflection: 'Outdated reflection.' } } })
  assert.ok(!host.textContent.includes('Outdated reflection.'))
})

test('Ask AI opens with starter actions and a native composer, and review remains available', async () => {
  await mount(note, {}, AskAIPanel)
  assert.ok(host.textContent.includes('What can I help you with?'))
  for (const label of ['Ask a question', 'Review today’s notes', 'Explore an idea', 'Send message', 'Start a new chat', 'Close Ask AI']) assert.ok(button(label), label)
  assert.equal(button('Send message').disabled, true)
  await click('Ask a question')
  assert.equal(document.activeElement, host.querySelector('textarea'))
  await click('Explore an idea')
  assert.equal(host.querySelector('textarea').value, 'Help me explore this idea: ')
  assert.equal(button('Send message').disabled, false)
  await click('Review today’s notes')
  assert.equal(passage().textContent.trim(), 'first thought')
  assert.equal(host.querySelectorAll('aside').length, 1)
  assert.ok(host.querySelector('[aria-label="Message composer"]'))
  await click('Next')
  assert.equal(passage().textContent, 'second thought')
  await click('Start a new chat')
  assert.equal(passage(), null)
  assert.ok(host.textContent.includes('What can I help you with?'))
  assert.equal(host.querySelector('textarea').value, '')
})

test('the disconnected composer keeps its draft, handles keyboard input, and leaves notes untouched', async () => {
  const original = JSON.stringify(note)
  await mount(note, {}, AskAIPanel)
  await click('Explore an idea')
  const textarea = host.querySelector('textarea')
  const draft = textarea.value
  await click('Send message')
  assert.ok(host.textContent.includes('Your message hasn’t been sent.'))
  assert.equal(textarea.value, draft)
  const newline = new dom.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })
  await act(async () => textarea.dispatchEvent(newline))
  assert.equal(newline.defaultPrevented, false)
  const send = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  await act(async () => textarea.dispatchEvent(send))
  assert.equal(send.defaultPrevented, true)
  assert.equal(JSON.stringify(props.entry), original)
  await click('Start a new chat')
  assert.equal(host.querySelector('textarea').value, '')
  assert.ok(!host.textContent.includes('Your message hasn’t been sent.'))
  assert.equal(button('Send message').disabled, true)
})

test('local attachments can be selected and removed, and new chat clears them', async () => {
  await mount(note, {}, AskAIPanel)
  const input = host.querySelector('input[type="file"]')
  const file = new dom.window.File(['local draft'], 'thought.md', { type: 'text/markdown', lastModified: 1 })
  Object.defineProperty(input, 'files', { value: [file, file], configurable: true })
  await act(async () => input.dispatchEvent(new dom.window.Event('change', { bubbles: true })))
  assert.equal(host.querySelectorAll('[aria-label="Attached files"] li').length, 1)
  assert.equal(button('Send message').disabled, false)
  await click('Remove thought.md')
  assert.equal(host.querySelector('[aria-label="Attached files"]'), null)
  assert.equal(button('Send message').disabled, true)
  await act(async () => input.dispatchEvent(new dom.window.Event('change', { bubbles: true })))
  await click('Start a new chat')
  assert.equal(host.querySelector('[aria-label="Attached files"]'), null)
  await click('Close Ask AI')
  assert.equal(document.activeElement, writing)
  await act(async () => host.querySelector('aside').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  assert.equal(closed, 2)
})

test('sidebar separator supports keyboard resizing, clamping, reset and remembering width', async () => {
  localStorage.setItem('notes.sidebar-width.v1', '440')
  await mount(note, {}, ResizableAskAIPanel)
  const separator = host.querySelector('[role="separator"]')
  const key = async (value, shiftKey = false) => act(async () => separator.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })))
  assert.equal(separator.getAttribute('aria-valuenow'), '440')
  await key('ArrowLeft')
  assert.equal(separator.getAttribute('aria-valuenow'), '456')
  await key('ArrowLeft', true)
  assert.equal(separator.getAttribute('aria-valuenow'), '520')
  await key('ArrowRight')
  assert.equal(separator.getAttribute('aria-valuenow'), '504')
  assert.equal(localStorage.getItem('notes.sidebar-width.v1'), '504')
  await key('Home')
  assert.equal(separator.getAttribute('aria-valuenow'), '320')
  await key('End')
  assert.equal(separator.getAttribute('aria-valuenow'), '704')
  await act(async () => separator.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true })))
  assert.equal(separator.getAttribute('aria-valuenow'), '440')
  await key('ArrowLeft')
  await act(async () => root.render(createElement(ResizableAskAIPanel, { ...props, key: 'reopened' })))
  assert.equal(host.querySelector('[role="separator"]').getAttribute('aria-valuenow'), '456')
})

test('dragging the sidebar left expands it and commits the preference without changing the note', async () => {
  localStorage.setItem('notes.sidebar-width.v1', '440')
  await mount(note, {}, ResizableAskAIPanel)
  const original = JSON.stringify(note)
  const separator = host.querySelector('[role="separator"]')
  async function pointer(type, x) {
    const event = new dom.window.MouseEvent(type, { clientX: x, button: 0, bubbles: true, cancelable: true })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    await act(async () => separator.dispatchEvent(event))
  }
  await pointer('pointerdown', 600)
  await pointer('pointermove', 500)
  assert.equal(separator.getAttribute('aria-valuenow'), '540')
  assert.equal(localStorage.getItem('notes.sidebar-width.v1'), '440')
  await pointer('pointerup', 500)
  assert.equal(localStorage.getItem('notes.sidebar-width.v1'), '540')
  assert.equal(JSON.stringify(props.entry), original)
  assert.ok(host.querySelector('textarea'))
})
