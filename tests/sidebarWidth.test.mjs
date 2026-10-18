import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundled = await build({ entryPoints: ['src/sidebarWidth.ts'], bundle: true, format: 'esm', write: false })
const { sidebarWidthBounds, clampSidebarWidth } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)

test('sidebar sizing reserves 320px for writing and limits very wide panels', () => {
  assert.deepEqual(sidebarWidthBounds(1024), { min: 320, max: 704 })
  assert.deepEqual(sidebarWidthBounds(1920), { min: 320, max: 760 })
  assert.deepEqual(sidebarWidthBounds(768), { min: 320, max: 448 })
})

test('dragged and stored widths clamp to valid bounds and pixel sizes', () => {
  assert.equal(clampSidebarWidth(200, 1024), 320)
  assert.equal(clampSidebarWidth(900, 1024), 704)
  assert.equal(clampSidebarWidth(550.6, 1024), 551)
  assert.equal(clampSidebarWidth(NaN, 1024), 440)
})

test('preferred wide sizing adapts to a smaller viewport and can restore afterwards', () => {
  assert.equal(clampSidebarWidth(700, 800), 480)
  assert.equal(clampSidebarWidth(700, 1440), 700)
})
