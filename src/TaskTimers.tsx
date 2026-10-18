import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip'
import { PlayTriangle, Stop, ArrowRotateCcw } from '@openai/apps-sdk-ui/components/Icon'
import { taskCheckboxPosition } from './taskCheckboxSlots'
import { formatTimer, remainingTime, startTimer, pauseTimer, resetTimer, type TaskTimer } from './taskTimer'
import type { TaskParagraph } from './taskParagraphs'

function Timer({ timer, disabled, onChange }: { timer: TaskTimer; disabled: boolean; onChange: (timer: TaskTimer) => void }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (timer.endsAt === undefined) return
    const tick = () => {
      const time = Date.now()
      setNow(time)
      if (time >= timer.endsAt!) window.clearInterval(interval)
    }
    const interval = window.setInterval(tick, 1000)
    tick()
    const visibility = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', visibility)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', visibility) }
  }, [timer])
  const remaining = remainingTime(timer, now)
  const running = timer.endsAt !== undefined && remaining > 0
  const completed = remaining === 0
  const action = running ? 'Stop timer' : completed ? 'Restart timer' : 'Start timer'
  return <>
    <Tooltip content={action} compact side="top">
      <Button color="secondary" variant="ghost" size="sm" uniform pill={false} disabled={disabled} className="task-timer-button" aria-label={`${action}: ${formatTimer(remaining)}`} onClick={() => { setNow(Date.now()); onChange(running ? pauseTimer(timer) : startTimer(timer)) }}>
        {running ? <Stop /> : <PlayTriangle />}
      </Button>
    </Tooltip>
    <span className="task-timer-countdown tabular-nums">{formatTimer(remaining)}</span>
    <Tooltip content="Reset timer" compact side="top">
      <Button color="secondary" variant="ghost" size="sm" uniform pill={false} disabled={disabled || (timer.endsAt === undefined && timer.remainingMs === timer.durationSeconds * 1000)} className="task-timer-reset" aria-label="Reset timer" onClick={() => { setNow(Date.now()); onChange(resetTimer(timer)) }}><ArrowRotateCcw /></Button>
    </Tooltip>
    <span className="sr-only" role="status" aria-live="polite">{completed ? 'Timer finished.' : ''}</span>
  </>
}
export function TaskTimers({ editor, tasks }: { editor: Editor | null; tasks: TaskParagraph[] }) {
  const [slots, setSlots] = useState<HTMLElement[]>([])
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return
    const element = editor.view.dom
    const sync = () => setSlots([...element.querySelectorAll<HTMLElement>('[data-task-timer]')])
    sync()
    element.addEventListener('writing-layout', sync)
    return () => element.removeEventListener('writing-layout', sync)
  }, [editor, tasks])
  if (!editor || editor.isDestroyed) return null
  return <>{slots.map(slot => {
    const position = taskCheckboxPosition(slot)
    if (position === undefined || !editor.view.dom.contains(slot)) return null
    const node = editor.state.doc.resolve(position).parent
    if (!node.attrs.todo || !node.attrs.timer || node.attrs.checked) return null
    return createPortal(<Timer timer={node.attrs.timer} disabled={!editor.isEditable || node.attrs.checked} onChange={timer => {
      const currentPosition = taskCheckboxPosition(slot)
      if (currentPosition === undefined || editor.isDestroyed || !editor.isEditable) return
      const resolved = editor.state.doc.resolve(currentPosition)
      const current = resolved.parent
      if (!current.attrs.todo || !current.attrs.timer || current.attrs.checked) return
      editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(resolved.before(), undefined, { ...current.attrs, timer }))
      editor.view.dispatch(closeHistory(editor.state.tr).setMeta('addToHistory', false))
    }} />, slot, `timer:${position}`)
  })}</>
}
