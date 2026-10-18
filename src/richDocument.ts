import type { JSONContent } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import type { TextFormat, TextMark } from './textFormatting'
import type { TaskParagraph } from './taskParagraphs'

export function toRichDocument(text: string, formats: TextFormat[] = [], tasks: TaskParagraph[] = []): JSONContent {
  let offset = 0
  const content = text.split('\n').map(line => {
    const start = offset
    const end = start + line.length
    const cuts = new Set([start, end])
    for (const format of formats) {
      if (format.start < end && format.end > start) {
        cuts.add(Math.max(start, format.start))
        cuts.add(Math.min(end, format.end))
      }
    }
    const boundaries = [...cuts].sort((a, b) => a - b)
    const nodes: JSONContent[] = []
    for (let index = 0; index < boundaries.length - 1; index++) {
      const from = boundaries[index]
      const to = boundaries[index + 1]
      const marks = [...new Set(formats.filter(format => format.start <= from && format.end >= to).flatMap(format => format.marks))].sort()
      nodes.push({ type: 'text', text: text.slice(from, to), ...(marks.length ? { marks: marks.map(type => ({ type })) } : {}) })
    }
    offset = end + 1
    const task = tasks.find(task => task.start === start && task.end === end)
    return { type: 'paragraph', content: nodes, ...(task ? { attrs: { todo: true, checked: task.checked, ...(task.timer !== undefined ? { timer: task.timer, timerText: task.timer ? line : null, timerSet: true } : {}) } } : {}) }
  })
  return { type: 'doc', content }
}

export function fromRichDocument(doc: Node): { text: string; formats: TextFormat[]; tasks?: TaskParagraph[] } {
  let text = ''
  const formats: TextFormat[] = []
  const tasks: TaskParagraph[] = []
  doc.forEach((paragraph, _position, paragraphIndex) => {
    if (paragraphIndex) text += '\n'
    const paragraphStart = text.length
    paragraph.forEach(node => {
      const start = text.length
      text += node.text ?? ''
      const marks = node.marks.map(mark => mark.type.name).filter((mark): mark is TextMark => mark === 'bold' || mark === 'italic').sort()
      if (!marks.length || start === text.length) return
      const previous = formats.at(-1)
      if (previous && previous.end === start && JSON.stringify(previous.marks) === JSON.stringify(marks)) previous.end = text.length
      else formats.push({ start, end: text.length, marks })
    })
    if (paragraph.attrs.todo && paragraph.textContent.trim()) tasks.push({ start: paragraphStart, end: text.length, checked: paragraph.attrs.checked === true, ...(paragraph.attrs.timerSet ? { timer: paragraph.attrs.timer } : {}) })
  })
  return { text, formats, ...(tasks.length ? { tasks } : {}) }
}

// Stored anchors are plain UTF-16 offsets; ProseMirror also counts block tokens.
export function documentPosition(doc: Node, offset: number) {
  let remaining = Math.max(0, offset)
  let result = 1
  let found = false
  doc.forEach((paragraph, position) => {
    if (found) return
    if (remaining <= paragraph.textContent.length) { result = position + 1 + remaining; found = true }
    else remaining -= paragraph.textContent.length + 1
  })
  return found ? result : Math.max(1, doc.content.size - 1)
}
export function plainOffset(doc: Node, position: number) {
  let offset = 0
  let found = false
  doc.forEach((paragraph, start, index) => {
    if (found) return
    if (index) offset++
    if (position <= start + paragraph.nodeSize - 1) {
      offset += Math.max(0, Math.min(paragraph.textContent.length, position - start - 1))
      found = true
    } else offset += paragraph.textContent.length
  })
  return offset
}
