export type CalendarViewMode = 'current' | 'week' | 'month' | 'year'

export function dateFromDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function calendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function move(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function weekDays(anchorKey: string): string[] {
  const anchor = dateFromDayKey(anchorKey)
  const start = move(anchor, -anchor.getDay())
  return Array.from({ length: 7 }, (_, index) => calendarDayKey(move(start, index)))
}

export function monthDays(anchorKey: string): string[] {
  const anchor = dateFromDayKey(anchorKey)
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12)
  const start = move(first, -first.getDay())
  return Array.from({ length: 42 }, (_, index) => calendarDayKey(move(start, index)))
}

export function yearMonths(anchorKey: string): { key: string; days: string[] }[] {
  const anchor = dateFromDayKey(anchorKey)
  return Array.from({ length: 12 }, (_, month) => {
    const key = calendarDayKey(new Date(anchor.getFullYear(), month, 1, 12))
    return { key, days: monthDays(key) }
  })
}

export function calendarViewLabel(mode: CalendarViewMode, anchor: string) {
  const date = dateFromDayKey(anchor)
  if (mode === 'current') return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  if (mode === 'month') return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  if (mode === 'year') return String(date.getFullYear())
  const days = weekDays(anchor)
  const start = dateFromDayKey(days[0])
  const end = dateFromDayKey(days[6])
  if (start.getFullYear() !== end.getFullYear()) return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  if (start.getMonth() !== end.getMonth()) return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  return `${start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })} – ${end.getDate()}, ${end.getFullYear()}`
}
