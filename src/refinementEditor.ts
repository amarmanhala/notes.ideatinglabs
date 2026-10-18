import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { closeHistory } from '@tiptap/pm/history'
import { documentPosition, fromRichDocument } from './richDocument'
import type { Replacement, RefinementEdit } from './refinementState'

export const refinementDecorationKey = new PluginKey<DecorationSet>('refinement-thinking')
export const RefinementDecorations = Extension.create({
  name: 'refinementThinking',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: refinementDecorationKey,
      state: {
        init: () => DecorationSet.empty,
        apply(transaction, current) {
          const ranges: Replacement[] | undefined = transaction.getMeta(refinementDecorationKey)
          if (ranges !== undefined) return DecorationSet.create(transaction.doc, ranges.map(range => Decoration.node(documentPosition(transaction.doc, range.start) - 1, documentPosition(transaction.doc, range.end) + 1, { class: 'refine-thinking' })))
          return transaction.docChanged ? DecorationSet.empty : current
        },
      },
      props: { decorations: state => refinementDecorationKey.getState(state) },
    })]
  },
})

export function replaceRefinedParagraphs(editor: Editor, replacements: Replacement[]) {
  const edits: RefinementEdit[] = []
  if (replacements.length) {
    const transaction = closeHistory(editor.state.tr)
    for (const replacement of [...replacements].sort((a, b) => b.start - a.start)) {
      const before = fromRichDocument(transaction.doc).text
      const from = documentPosition(editor.state.doc, replacement.start)
      const to = documentPosition(editor.state.doc, replacement.end)
      if (before.slice(replacement.start, replacement.end) !== replacement.text) transaction.replaceWith(from, to, editor.schema.text(replacement.text))
      if (replacement.isTodo !== undefined || replacement.timerSeconds !== undefined) {
        const paragraph = transaction.doc.nodeAt(from - 1)!
        const todo = replacement.isTodo ?? paragraph.attrs.todo
        const duration = replacement.timerSeconds
        const timer = !todo || duration === null ? null : duration !== undefined
          ? (paragraph.attrs.timer?.durationSeconds === duration ? paragraph.attrs.timer : { durationSeconds: duration, remainingMs: duration * 1000 })
          : paragraph.attrs.timer
        transaction.setNodeMarkup(from - 1, undefined, { ...paragraph.attrs, todo, checked: todo && paragraph.attrs.todo ? paragraph.attrs.checked : false, timer, timerSet: !!timer || paragraph.attrs.timerSet, timerText: timer ? replacement.text : null })
      }
      edits.push({ before, after: fromRichDocument(transaction.doc).text, editStart: replacement.start })
    }
    editor.view.dispatch(transaction.setMeta('preventUpdate', true))
    editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
  }
  return { ...fromRichDocument(editor.state.doc), edits }
}
