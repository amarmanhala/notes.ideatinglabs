import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Fragment, Slice } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import { fromRichDocument, plainOffset } from './richDocument'
import { noteParagraphs } from './refinementState'

type Preview = { position: number; text: string }
export const dictationKey = new PluginKey<Preview | null>('dictation')
export const DictationPreview = Extension.create({
  name: 'dictationPreview',
  addProseMirrorPlugins() {
    return [new Plugin<Preview | null>({
      key: dictationKey,
      state: {
        init: () => null,
        apply(tr, previous) {
          const next: Preview | null | undefined = tr.getMeta(dictationKey)
          if (next !== undefined) return next
          return previous ? { ...previous, position: tr.mapping.map(previous.position, 1) } : null
        },
      },
      props: {
        decorations(state) {
          const preview = dictationKey.getState(state)
          if (!preview?.text) return DecorationSet.empty
          return DecorationSet.create(state.doc, [Decoration.widget(preview.position, () => {
            const span = document.createElement('span')
            span.className = 'dictation-preview'
            span.textContent = spacedTranscript(state.doc.textBetween(Math.max(0, preview.position - 1), preview.position), preview.text, state.doc.textBetween(preview.position, Math.min(state.doc.content.size, preview.position + 1)))
            span.setAttribute('aria-hidden', 'true')
            return span
          }, { side: 1, key: preview.text })])
        },
      },
    })]
  },
})

export function spacedTranscript(before: string, spoken: string, after: string) {
  const text = spoken.replace(/\r\n?/g, '\n').trim()
  if (!text) return ''
  const prefix = before && !/\s$/u.test(before) && !/^[,.;:!?)]/u.test(text) ? ' ' : ''
  const suffix = after && !/^\s|^[,.;:!?)]/u.test(after) ? ' ' : ''
  return prefix + text + suffix
}

export function beginDictation(editor: Editor) {
  if (editor.isDestroyed || editor.view.composing) return false
  const selection = editor.state.selection
  // The ProseMirror selection survives moving focus to the mic. Selected text stays intact.
  const position = selection.to
  editor.view.dispatch(editor.state.tr.setMeta(dictationKey, { position, text: '' }).setMeta('addToHistory', false))
  editor.setEditable(false, false)
  editor.view.dom.setAttribute('aria-busy', 'true')
  return true
}
export function previewDictation(editor: Editor, text: string) {
  if (editor.isDestroyed) return
  const preview = dictationKey.getState(editor.state)
  if (preview) editor.view.dispatch(editor.state.tr.setMeta(dictationKey, { ...preview, text }).setMeta('addToHistory', false))
}
export function finishDictation(editor: Editor, spoken: string) {
  if (editor.isDestroyed) return []
  const preview = dictationKey.getState(editor.state)
  editor.setEditable(true, false)
  editor.view.dom.setAttribute('aria-busy', 'false')
  if (!preview) return []
  const position = preview.position
  const before = fromRichDocument(editor.state.doc).text
  const offset = plainOffset(editor.state.doc, position)
  const text = spacedTranscript(before.slice(0, offset), spoken, before.slice(offset))
  const tr = closeHistory(editor.state.tr).setMeta(dictationKey, null)
  if (!text) { editor.view.dispatch(tr.setMeta('addToHistory', false)); return [] }
  const blocks = text.split('\n').map(line => editor.schema.nodes.paragraph.create(null, line ? editor.schema.text(line) : undefined))
  tr.replaceRange(position, position, new Slice(Fragment.fromArray(blocks), 1, 1))
  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(position, 1)))
  editor.view.dispatch(tr)
  editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
  const next = fromRichDocument(editor.state.doc).text
  return noteParagraphs(next).filter(p => p.start < offset + text.length && p.end > offset)
}
