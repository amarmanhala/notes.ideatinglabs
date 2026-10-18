import { useEffect, useState, type RefObject } from 'react'
import { useSessionPositions } from './useSessionPositions'
import { formatRelativeTime } from './relativeTime'
import type { WritingEditorHandle } from './writingEditorHandle'
import type { WritingSession } from './writingSessions'
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip'
import { groupTimelineLabels } from './sessionLayout'

type Props = {
  editor: RefObject<WritingEditorHandle | null>
  sessions: WritingSession[]
  text: string
  day: string
  taskGutter?: boolean
}
export function SessionTimestamps({ editor, sessions, text, day, taskGutter = false }: Props) {
  const labels = useSessionPositions(editor, sessions, text, day, true)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const update = () => setNow(Date.now())
    const timer = window.setInterval(update, 15_000)
    window.addEventListener('focus', update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', update)
    }
  }, [])
  const rows = groupTimelineLabels(labels)
  return <aside className="relative h-full w-24 overflow-hidden text-xs text-primary" aria-label="Writing timeline">
    {rows.map(({ sessions: rowSessions, top, height }) => {
      const latest = rowSessions.at(-1)!
      return <div key={rowSessions[0].id}>
        <div className="pointer-events-auto absolute left-0 text-right leading-[16px]" style={{ top: top + (height - 16) / 2, width: taskGutter ? 'calc(100% - 24px)' : '100%' }}>
          <Tooltip side="right" content={<div className="flex flex-col gap-2">{rowSessions.map(session => <div key={session.id}>
            <p>Started {new Date(session.startedAt).toLocaleString()}</p>
            <p className="text-secondary">Last edited {new Date(session.lastEditedAt).toLocaleString()}</p>
          </div>)}</div>}>
            <time dateTime={latest.startedAt}>{formatRelativeTime(latest.startedAt, now)}</time>
          </Tooltip>
        </div>
      </div>
    })}
  </aside>
}
