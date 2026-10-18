import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import JSZip from 'jszip'
import { JSDOM } from 'jsdom'
import { defaultMarkdownParser } from 'prosemirror-markdown'

const bundled = await build({ entryPoints: ['src/exportNote.ts'], bundle: true, platform: 'browser', format: 'esm', write: false })
const { createNoteDownload } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const text = '  Hello 🌱\t<&>\n\nworld\n'
const formats = [{ start: 2, end: 10, marks: ['bold'] }, { start: 8, end: 10, marks: ['italic'] }]

test('plain text export preserves exact Unicode, whitespace and line breaks', async () => {
  const file = await createNoteDownload(text, formats, '2026-10-14', 'txt')
  assert.equal(file.filename, 'notes-2026-10-14.txt')
  assert.equal(file.blob.type, 'text/plain;charset=utf-8')
  assert.equal(await file.blob.text(), text)
})

test('Word export is a valid DOCX archive with original text and combined formatting', async () => {
  const snapshot = JSON.stringify(formats)
  const file = await createNoteDownload(text, formats, '2026-10-14', 'docx')
  assert.equal(file.filename, 'notes-2026-10-14.docx')
  assert.equal(file.blob.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  const zip = await JSZip.loadAsync(await file.blob.arrayBuffer())
  assert.ok(zip.file('[Content_Types].xml'))
  const xml = await zip.file('word/document.xml').async('string')
  const dom = new JSDOM(xml, { contentType: 'text/xml' })
  try {
    const paragraphs = [...dom.window.document.getElementsByTagName('w:p')]
    const restored = paragraphs.map(paragraph => [...paragraph.getElementsByTagName('w:r')].map(run => [...run.children].map(child => child.tagName === 'w:t' ? child.textContent : child.tagName === 'w:tab' ? '\t' : '').join('')).join('')).join('\n')
    assert.equal(restored, text)
    const emoji = [...dom.window.document.getElementsByTagName('w:r')].find(run => run.textContent === '🌱')
    assert.ok(emoji.getElementsByTagName('w:b').length)
    assert.ok(emoji.getElementsByTagName('w:i').length)
    assert.equal(JSON.stringify(formats), snapshot)
  } finally { dom.window.close() }
})

test('an empty note still creates a valid Word document', async () => {
  const { blob } = await createNoteDownload('', [], '2026-10-14', 'docx')
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  assert.match(await zip.file('word/document.xml').async('string'), /<w:p[\s/>]/)
})

test('Markdown escapes literal syntax and preserves overlapping bold/italic marks', async () => {
  const source = 'A *literal* [link](url) and hello 🌱'
  const hello = source.indexOf('hello')
  const emoji = source.indexOf('🌱')
  const file = await createNoteDownload(source, [{ start: hello, end: source.length, marks: ['bold'] }, { start: emoji, end: source.length, marks: ['italic'] }], '2026-10-14', 'md')
  assert.equal(file.filename, 'notes-2026-10-14.md')
  assert.equal(file.blob.type, 'text/markdown;charset=utf-8')
  const restored = defaultMarkdownParser.parse(await file.blob.text())
  assert.equal(restored.textContent, source)
  const runs = []
  restored.descendants(node => { if (node.isText) runs.push(node) })
  assert.ok(runs.some(run => run.text.includes('hello') && run.marks.some(mark => mark.type.name === 'strong')))
  const emojiRun = runs.find(run => run.text.includes('🌱'))
  assert.deepEqual(emojiRun.marks.map(mark => mark.type.name).sort(), ['em', 'strong'])
})

test('PDF export creates a complete multipage PDF with embedded regular, bold and italic fonts', async () => {
  const source = 'Regular bold italic both\n' + 'A longer thought with café and naïve ideas.\n'.repeat(100)
  const file = await createNoteDownload(source, [{ start: 8, end: 12, marks: ['bold'] }, { start: 13, end: 19, marks: ['italic'] }, { start: 20, end: 24, marks: ['bold', 'italic'] }], '2026-10-14', 'pdf')
  assert.equal(file.filename, 'notes-2026-10-14.pdf')
  assert.equal(file.blob.type, 'application/pdf')
  const pdf = Buffer.from(await file.blob.arrayBuffer()).toString('latin1')
  assert.match(pdf, /^%PDF-/)
  assert.match(pdf, /%%EOF\s*$/)
  assert.ok([...pdf.matchAll(/\/Type \/Page\b/g)].length > 1)
  for (const font of ['Roboto-Regular', 'Roboto-Medium', 'Roboto-Italic', 'Roboto-MediumItalic']) assert.ok(pdf.includes(font), font)
})
