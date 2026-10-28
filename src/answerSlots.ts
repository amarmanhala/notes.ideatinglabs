import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { RefinedParagraph } from './refinementState'

export const answerDecorationKey = new PluginKey<RefinedParagraph[]>('paragraph-answers')

// Answers scroll with their question but never become editable note text.
export const AnswerSlots = Extension.create({
  name: 'answerSlots',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: answerDecorationKey,
      state: {
        init: () => [],
        apply: (transaction, current) => transaction.getMeta(answerDecorationKey) ?? current,
      },
      props: {
        decorations(state) {
          const answers = answerDecorationKey.getState(state) ?? []
          const widgets: Decoration[] = []
          let offset = 0
          state.doc.forEach((paragraph, position) => {
            const start = offset
            const end = start + paragraph.textContent.length
            offset = end + 1
            const item = answers.find(answer => answer.start === start && answer.end === end && answer.answer)
            if (!item?.answer) return
            widgets.push(Decoration.widget(position + paragraph.nodeSize - 1, () => {
              const slot = document.createElement('span')
              slot.className = 'writing-answer'
              slot.dataset.answer = ''
              slot.contentEditable = 'false'
              const button = document.createElement('button')
              button.type = 'button'
              button.className = 'writing-answer-toggle'
              button.textContent = 'Show answer'
              button.setAttribute('aria-expanded', 'false')
              let open = false
              button.addEventListener('click', () => {
                open = !open
                button.textContent = open ? item.answer! : 'Show answer'
                button.setAttribute('aria-expanded', String(open))
              })
              slot.append(button)
              return slot
            }, { side: 1, key: `answer:${start}:${item.answer}`, stopEvent: () => true, ignoreSelection: true }))
          })
          return DecorationSet.create(state.doc, widgets)
        },
      },
    })]
  },
})
