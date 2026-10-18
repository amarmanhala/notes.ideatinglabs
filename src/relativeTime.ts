const relative = new Intl.RelativeTimeFormat('en', { numeric: 'always' })

export function formatRelativeTime(timestamp: string, now = Date.now()) {
  const seconds = Math.max(0, (now - Date.parse(timestamp)) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `${minutes} ${minutes === 1 ? 'min' : 'mins'} ago`
  }
  if (seconds < 86400) return relative.format(-Math.floor(seconds / 3600), 'hour')
  if (seconds < 30 * 86400) return relative.format(-Math.floor(seconds / 86400), 'day')
  if (seconds < 365 * 86400) return relative.format(-Math.floor(seconds / (30 * 86400)), 'month')
  return relative.format(-Math.floor(seconds / (365 * 86400)), 'year')
}
