import { useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { pauseTimer } from './taskTimer'
import { closeHistory } from '@tiptap/pm/history'
import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox'
import { taskCheckboxPosition } from './taskCheckboxSlots'
import type { TaskParagraph } from './taskParagraphs'

export function TaskCheckboxes({ editor, tasks }: { editor: Editor | null; tasks: TaskParagraph[] }) {
  const [slots, setSlots] = useState<HTMLElement[]>([])
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return
    const element = editor.view.dom
    const sync = () => setSlots([...element.querySelectorAll<HTMLElement>('[data-task-checkbox]')])
    sync()
    element.addEventListener('writing-layout', sync)
    return () => element.removeEventListener('writing-layout', sync)
  }, [editor, tasks])

  if (!editor || editor.isDestroyed) return null
  return <>{slots.map(slot => {
    const position = taskCheckboxPosition(slot)
    const paragraph = position !== undefined ? editor.state.doc.nodeAt(position - 1) : null
    if (!paragraph?.attrs.todo || !editor.view.dom.contains(slot)) return null
    return createPortal(<Checkbox disabled={!editor.isEditable} aria-label={paragraph.textContent} checked={paragraph.attrs.checked === true} onCheckedChange={checked => {
      const currentPosition = taskCheckboxPosition(slot)
      if (editor.isDestroyed || currentPosition === undefined) return
      const current = editor.state.doc.nodeAt(currentPosition - 1)
      if (!current?.attrs.todo) return
      editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(currentPosition - 1, undefined, { ...current.attrs, checked, ...(checked && current.attrs.timer ? { timer: pauseTimer(current.attrs.timer) } : {}) }))
      editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
    }} />, slot, `task:${position}`)
  })}</>
}
