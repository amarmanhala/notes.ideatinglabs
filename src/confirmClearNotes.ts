import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { closeHistory, isHistoryTransaction } from '@tiptap/pm/history'
import { fromRichDocument, plainOffset } from './richDocument'

export type ClearNotesRequest = { confirm: () => boolean; cancel: () => void }
const confirmedClear = new PluginKey('confirmedClearNotes')

export const ConfirmClearNotes = Extension.create<{ onRequest: (request: ClearNotesRequest | null) => void }>({
  name: 'confirmClearNotes',
  addOptions() { return { onRequest: () => {} } },
  addProseMirrorPlugins() {
    const onRequest = this.options.onRequest
    let view: EditorView | null = null
    let destroyed = false
    let pending: { transaction: Transaction; request: ClearNotesRequest } | null = null
    const dismiss = () => {
      pending = null
      queueMicrotask(() => { if (!destroyed && !pending) onRequest(null) })
    }
    return [new Plugin({
      view(editorView) {
        view = editorView
        destroyed = false
        return {
          update(current) {
            // An external edit invalidates the original confirmation instead of deleting newer writing.
            if (pending && !current.state.doc.eq(pending.transaction.before)) dismiss()
          },
          destroy() { destroyed = true; pending = null; view = null },
        }
      },
      filterTransaction(transaction, state) {
        if (transaction.getMeta(confirmedClear) || !transaction.docChanged || transaction.getMeta('preventUpdate') || isHistoryTransaction(transaction) || state.selection.empty) return true
        const before = fromRichDocument(state.doc).text
        if (!before.trim() || fromRichDocument(transaction.doc).text.trim()) return true
        const start = plainOffset(state.doc, state.selection.from)
        const end = plainOffset(state.doc, state.selection.to)
        if (before.slice(0, start).trim() || before.slice(end).trim()) return true
        if (!pending) {
          const request: ClearNotesRequest = {
            cancel: () => { if (pending?.request === request) dismiss() },
            confirm: () => {
              if (pending?.request !== request || !view || view.isDestroyed) return false
              const original = pending.transaction
              const currentView = view
              dismiss()
              if (!currentView.state.doc.eq(original.before)) return false
              currentView.dispatch(closeHistory(original).setMeta(confirmedClear, true))
              return true
            },
          }
          pending = { transaction, request }
          // Notify React after the rejected editor transaction has finished.
          queueMicrotask(() => { if (!destroyed && pending?.request === request) onRequest(request) })
        }
        return false
      },
    })]
  },
})
