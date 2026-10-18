import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

// Editing the timed sentence invalidates its clock. Formatting and surrounding
// edits leave it running; refinement can attach a fresh duration on the next Enter.
export const TaskTimerTextChanges = Extension.create({
  name: 'taskTimerTextChanges',
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, _old, state) {
        if (!transactions.some(tr => tr.docChanged)) return null
        const tr = state.tr
        state.doc.forEach((paragraph, position) => {
          if (paragraph.attrs.timer && (!paragraph.attrs.todo || paragraph.textContent !== paragraph.attrs.timerText)) {
            tr.setNodeMarkup(position, undefined, { ...paragraph.attrs, timer: null, timerText: null })
          }
        })
        return tr.docChanged ? tr : null
      },
    })]
  },
})
