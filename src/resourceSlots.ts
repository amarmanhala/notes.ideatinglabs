import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { RefinedParagraph } from './refinementState'

export const resourceDecorationKey = new PluginKey<RefinedParagraph[]>('paragraph-resources')

export const ResourceSlots = Extension.create({
  name: 'resourceSlots',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: resourceDecorationKey,
      state: {
        init: () => [],
        apply: (transaction, current) => transaction.getMeta(resourceDecorationKey) ?? current,
      },
      props: {
        decorations(state) {
          const resources = resourceDecorationKey.getState(state) ?? []
          const widgets: Decoration[] = []
          let offset = 0
          state.doc.forEach((paragraph, position) => {
            const start = offset
            const end = start + paragraph.textContent.length
            offset = end + 1
            const item = resources.find(resource => resource.start === start && resource.end === end && resource.resources.length)
            if (!item) return
            widgets.push(Decoration.widget(position + paragraph.nodeSize - 1, () => {
              const slot = document.createElement('span')
              slot.className = 'writing-resource'
              slot.dataset.learningResource = ''
              slot.contentEditable = 'false'
              for (const resource of item.resources) {
                const link = document.createElement('a')
                link.href = resource.url
                link.target = '_blank'
                link.rel = 'noopener noreferrer'
                link.className = 'writing-resource-link'
                link.setAttribute('aria-label', `Open official resource: ${resource.title}`)
                link.title = resource.title
                link.textContent = 'i'
                slot.append(link)
              }
              return slot
            }, { side: 2, key: `resource:${start}:${item.resources.map(resource => resource.url).join(',')}`, stopEvent: () => true, ignoreSelection: true }))
          })
          return DecorationSet.create(state.doc, widgets)
        },
      },
    })]
  },
})
