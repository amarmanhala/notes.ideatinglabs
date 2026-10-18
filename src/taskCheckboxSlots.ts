import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const positions = new WeakMap<HTMLElement, () => number | undefined>()
export const taskCheckboxPosition = (element: HTMLElement) => positions.get(element)?.()

// Document widgets scroll natively with their paragraphs. React renders the UI
// checkbox into each empty slot without adding anything to the saved writing.
export const TaskCheckboxSlots = Extension.create({
  name: 'taskCheckboxSlots',
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations(state) {
          const widgets: Decoration[] = []
          state.doc.forEach((paragraph, position) => {
            if (!paragraph.attrs.todo || !paragraph.textContent.trim()) return
            if (paragraph.attrs.timer && !paragraph.attrs.checked) widgets.push(Decoration.widget(position + paragraph.nodeSize - 1, (_view, getPos) => {
              const slot = document.createElement('span')
              slot.className = 'writing-task-timer'
              slot.dataset.taskTimer = ''
              slot.contentEditable = 'false'
              positions.set(slot, getPos)
              return slot
            }, { side: 1, key: `timer:${position}`, stopEvent: () => true, ignoreSelection: true }))
            widgets.push(Decoration.widget(position + 1, (_view, getPos) => {
              const slot = document.createElement('span')
              slot.className = 'writing-task-checkbox'
              slot.dataset.taskCheckbox = ''
              slot.contentEditable = 'false'
              positions.set(slot, getPos)
              return slot
            }, { side: -1, key: `task:${position}`, stopEvent: () => true, ignoreSelection: true }))
          })
          return DecorationSet.create(state.doc, widgets)
        },
      },
    })]
  },
})
