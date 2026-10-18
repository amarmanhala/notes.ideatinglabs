export type TaskTimer = { durationSeconds: number; remainingMs: number; endsAt?: number }
export const MAX_TIMER_SECONDS = 7 * 24 * 60 * 60

export function parseTaskTimer(value: unknown): TaskTimer | undefined {
  if (value === undefined || value === null) return undefined
  if (!value || typeof value !== 'object') throw new Error('Invalid task timer')
  const timer = value as Partial<TaskTimer>
  if (!Number.isInteger(timer.durationSeconds) || timer.durationSeconds! <= 0 || timer.durationSeconds! > MAX_TIMER_SECONDS ||
    !Number.isFinite(timer.remainingMs) || timer.remainingMs! < 0 || timer.remainingMs! > timer.durationSeconds! * 1000 ||
    (timer.endsAt !== undefined && (!Number.isSafeInteger(timer.endsAt) || timer.endsAt <= 0 || timer.endsAt > 8_640_000_000_000_000))) throw new Error('Invalid task timer')
  return { durationSeconds: timer.durationSeconds!, remainingMs: timer.remainingMs!, ...(timer.endsAt !== undefined ? { endsAt: timer.endsAt } : {}) }
}
export const remainingTime = (timer: TaskTimer, now = Date.now()) => timer.endsAt !== undefined ? Math.max(0, Math.min(timer.durationSeconds * 1000, timer.endsAt - now)) : timer.remainingMs
export function pauseTimer(timer: TaskTimer, now = Date.now()): TaskTimer {
  return { durationSeconds: timer.durationSeconds, remainingMs: remainingTime(timer, now) }
}
export function startTimer(timer: TaskTimer, now = Date.now()): TaskTimer {
  const remainingMs = remainingTime(timer, now) || timer.durationSeconds * 1000
  return { durationSeconds: timer.durationSeconds, remainingMs, endsAt: now + remainingMs }
}
export const resetTimer = (timer: TaskTimer): TaskTimer => ({ durationSeconds: timer.durationSeconds, remainingMs: timer.durationSeconds * 1000 })
export function formatTimer(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const rest = seconds % 60
  return `${hours ? `${hours}:` : ''}${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}
