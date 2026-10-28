import type { Entry, History } from './writingSessions'
import { dateFromDayKey, monthDays, weekDays, yearMonths, type CalendarViewMode } from './calendarViews'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function preview(entry?: Entry) {
  return entry?.text.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 3) ?? []
}

function DayNumber({ day, today }: { day: string; today: string }) {
  const number = dateFromDayKey(day).getDate()
  return <span className={day === today ? 'flex size-7 items-center justify-center rounded-full bg-[var(--blue-400)] font-semibold text-white' : 'flex size-7 items-center justify-center'}>{number}</span>
}

function DayCell({ day, today, history, onOpen, muted = false }: { day: string; today: string; history: History; onOpen: (day: string) => void; muted?: boolean }) {
  const lines = preview(history[day])
  return <button type="button" aria-label={`${dateFromDayKey(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${lines.length ? ', has notes' : ''}`} onClick={() => onOpen(day)} className={`min-h-28 min-w-0 border-r border-b border-subtle p-2 text-left align-top transition-colors hover:bg-surface-secondary focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${muted ? 'bg-surface-secondary/40 text-tertiary' : 'bg-surface'}`}>
    <DayNumber day={day} today={today} />
    <span className="pointer-events-none mt-1 block space-y-1" aria-hidden="true">
      {lines.map((line, index) => <span key={`${index}:${line}`} className="block truncate rounded bg-[var(--blue-a50)] px-1.5 py-0.5 text-xs text-primary">{line}</span>)}
    </span>
  </button>
}

function WeekHeader() {
  return <>{WEEKDAYS.map(day => <div key={day} className="border-r border-b border-subtle bg-surface-secondary px-2 py-2 text-center text-xs font-medium text-secondary">{day}</div>)}</>
}

function WeekCalendar({ anchor, today, history, onOpen }: CalendarProps) {
  const days = weekDays(anchor)
  return <div className="h-full overflow-auto p-3 sm:p-6">
    <div className="grid min-h-full min-w-[700px] grid-cols-7 overflow-hidden rounded-xl border border-subtle bg-surface shadow-sm">
      <WeekHeader />
      {days.map(day => <DayCell key={day} day={day} today={today} history={history} onOpen={onOpen} />)}
    </div>
  </div>
}

function MonthCalendar({ anchor, today, history, onOpen }: CalendarProps) {
  const anchorMonth = dateFromDayKey(anchor).getMonth()
  return <div className="h-full overflow-auto p-3 sm:p-6">
    <div className="grid min-w-[700px] grid-cols-7 overflow-hidden rounded-xl border border-subtle bg-surface shadow-sm">
      <WeekHeader />
      {monthDays(anchor).map(day => <DayCell key={day} day={day} today={today} history={history} onOpen={onOpen} muted={dateFromDayKey(day).getMonth() !== anchorMonth} />)}
    </div>
  </div>
}

function MiniMonth({ monthKey, today, history, onOpen }: { monthKey: string; today: string; history: History; onOpen: (day: string) => void }) {
  const month = dateFromDayKey(monthKey).getMonth()
  return <section className="rounded-xl border border-subtle bg-surface p-3 shadow-sm">
    <h3 className="mb-2 text-sm font-semibold">{dateFromDayKey(monthKey).toLocaleDateString(undefined, { month: 'long' })}</h3>
    <div className="grid grid-cols-7 gap-y-1 text-center text-[11px]">
      {WEEKDAYS.map(day => <span key={day} className="text-secondary">{day[0]}</span>)}
      {monthDays(monthKey).map(day => {
        const date = dateFromDayKey(day)
        const outside = date.getMonth() !== month
        const hasNote = !!history[day]?.text.trim()
        return <button type="button" key={day} disabled={outside} aria-label={outside ? undefined : date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} onClick={() => onOpen(day)} className={`mx-auto flex size-7 items-center justify-center rounded-full ${outside ? 'invisible' : day === today ? 'bg-[var(--blue-400)] font-semibold text-white' : hasNote ? 'bg-[var(--blue-a50)] font-semibold text-primary hover:bg-[var(--blue-a100)]' : 'hover:bg-surface-secondary'} focus-visible:outline-2`}>
          {date.getDate()}
        </button>
      })}
    </div>
  </section>
}

function YearCalendar({ anchor, today, history, onOpen }: CalendarProps) {
  return <div className="h-full overflow-auto p-3 sm:p-6">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {yearMonths(anchor).map(month => <MiniMonth key={month.key} monthKey={month.key} today={today} history={history} onOpen={onOpen} />)}
    </div>
  </div>
}

type CalendarProps = { anchor: string; today: string; history: History; onOpen: (day: string) => void }

export function CalendarView({ mode, ...props }: CalendarProps & { mode: Exclude<CalendarViewMode, 'current'> }) {
  if (mode === 'week') return <WeekCalendar {...props} />
  if (mode === 'month') return <MonthCalendar {...props} />
  return <YearCalendar {...props} />
}
