export const WELCOME_KEY = 'notes.welcome.v1'
export type WelcomeRecord = { seen: true; pending: boolean; name?: string }
export function readWelcome(storage: Storage): WelcomeRecord | null {
  try {
    const value = JSON.parse(storage.getItem(WELCOME_KEY) || 'null')
    return value?.seen === true && typeof value.pending === 'boolean' && (value.name === undefined || typeof value.name === 'string') ? value : null
  } catch { return null }
}
// Metadata is only used for this welcome and display name, never authorization.
export class WelcomeSync {
  record: WelcomeRecord | null
  private inflight: Promise<void> | null = null
  private storage: Storage
  private update: (data: { notes_welcome_seen: true; full_name?: string }) => Promise<void>
  constructor(storage: Storage, update: WelcomeSync['update']) { this.storage = storage; this.update = update; this.record = readWelcome(storage) }
  private save(record: WelcomeRecord) {
    this.record = record
    try { this.storage.setItem(WELCOME_KEY, JSON.stringify(record)) } catch { /* Account sync still works if browser storage is unavailable. */ }
  }
  mark(name?: string) {
    this.save({ ...this.record, seen: true, pending: true, ...(name !== undefined ? { name: name.trim().slice(0, 60) } : {}) })
    void this.flush()
  }
  flush(): Promise<void> {
    this.inflight ??= this.run().finally(() => { this.inflight = null })
    return this.inflight
  }
  private async run() {
    try {
      while (this.record?.pending) {
        const queued = this.record
        await this.update({ notes_welcome_seen: true, ...(queued.name !== undefined ? { full_name: queued.name } : {}) })
        // A name entered while the first request was running must still be saved.
        if (this.record === queued) this.save({ ...queued, pending: false })
      }
    } catch { /* Keep the pending profile for reconnect or the next visit. */ }
  }
}
