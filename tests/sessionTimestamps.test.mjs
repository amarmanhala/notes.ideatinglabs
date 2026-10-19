import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

test('deleting the last text hides timestamps, while Undo can restore them', async () => {
  const dom = new JSDOM('<div id="root"><div data-writing-surface><div id="editor"></div></div></div>', { pretendToBeVisual: true })
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    Object.defineProperty(globalThis, key, { value: typeof dom.window[key] === 'function' && key.endsWith('AnimationFrame') ? dom.window[key].bind(dom.window) : dom.window[key], configurable: true })
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver = class { observe() {} disconnect() {} }
  const NativeMessageChannel = globalThis.MessageChannel
  const channels = []
  globalThis.MessageChannel = class extends NativeMessageChannel {
    constructor() { super(); channels.push(this) }
  }
  const built = await build({
    stdin: { contents: `export {createElement,act} from 'react'; export {createRoot} from 'react-dom/client'; export {SessionTimestamps} from './src/SessionTimestamps';`, resolveDir: process.cwd() },
    bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', write: false,
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'tooltip', setup(b) {
      b.onResolve({ filter: /^@openai\/apps-sdk-ui\/components\/Tooltip$/ }, () => ({ path: 'tooltip', namespace: 'fixture' }))
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function Tooltip({children}) { return children }', loader: 'js' }))
    } }],
  })
  Object.defineProperty(document, 'fonts', { value: { ready: Promise.resolve() } })
  const { createElement, act, createRoot, SessionTimestamps } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
  const surface = document.querySelector('[data-writing-surface]')
  const host = document.createElement('div')
  surface.append(host)
  const root = createRoot(host)
  const now = new Date().toISOString()
  const sessions = [{ id: 'session', startedAt: now, lastEditedAt: now, anchorOffset: 0 }]
  const editor = { current: { element: document.querySelector('#editor'), pointAt: () => ({ left: 0, top: 0, height: 24 }) } }
  async function render(text) {
    await act(async () => { root.render(createElement(SessionTimestamps, { editor, sessions, text, day: '2026-10-18' })) })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })
  }
  try {
    await render('A')
    assert.equal(host.querySelector('time')?.textContent, 'just now')
    for (const text of ['', '\n  \n']) {
      await render(text)
      assert.equal(host.querySelector('time'), null)
      assert.equal(host.querySelector('aside'), null)
    }
    await render('A')
    assert.equal(host.querySelector('time')?.textContent, 'just now')
    assert.equal(sessions.length, 1)
  } finally {
    await act(async () => root.unmount())
    channels.forEach(channel => { channel.port1.close(); channel.port2.close() })
    globalThis.MessageChannel = NativeMessageChannel
    dom.window.close()
  }
})
