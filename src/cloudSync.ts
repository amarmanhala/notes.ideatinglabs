import { parseHistory, type Entry, type History } from './writingSessions'

export type RevisionMap = Record<string, number>
export type CloudSnapshot = { history: History; revisions: RevisionMap }
export type SyncStatus = 'loading' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error'
export type SyncBase = { revision: number; entry: Entry }
export type SyncBases = Record<string, SyncBase>
export type NoteConflict = { day: string; local: Entry; cloud: Entry; revision: number }
export const SYNC_KEY = 'notes.cloud-sync.v1'
export const IDENTITY_KEY = 'notes.identity.v1'
export class CloudError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
export function sameEntry(a: Entry | undefined, b: Entry | undefined) {
  const canonical = (entry?: Entry) => entry && [entry.text, entry.createdAt, entry.updatedAt, entry.sessions, entry.formats ?? [], entry.learningResources ?? [], entry.refinedParagraphs ?? [], entry.tasks ?? []]
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}
function sameWriting(a: Entry, b: Entry) {
  const content = (entry: Entry) => [entry.text, entry.formats ?? [], entry.learningResources ?? [], entry.refinedParagraphs ?? [], entry.tasks ?? []]
  return JSON.stringify(content(a)) === JSON.stringify(content(b))
}
function mergeCaptureHistory(local: Entry, remote: Entry): Entry {
  const sessions = new Map(remote.sessions.map(session => [session.id, session]))
  for (const session of local.sessions) {
    const other = sessions.get(session.id)
    sessions.set(session.id, other ? { ...session, startedAt: Date.parse(session.startedAt) < Date.parse(other.startedAt) ? session.startedAt : other.startedAt, lastEditedAt: Date.parse(session.lastEditedAt) > Date.parse(other.lastEditedAt) ? session.lastEditedAt : other.lastEditedAt } : session)
  }
  return { ...local,
    createdAt: Date.parse(local.createdAt) < Date.parse(remote.createdAt) ? local.createdAt : remote.createdAt,
    updatedAt: Date.parse(local.updatedAt) > Date.parse(remote.updatedAt) ? local.updatedAt : remote.updatedAt,
    sessions: [...sessions.values()].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id)),
  }
}
export function browserKey(storage: Storage) {
  const existing = storage.getItem(IDENTITY_KEY)
  if (existing) {
    if (!/^[a-f0-9]{64}$/.test(existing)) throw new Error('Invalid private browser key')
    return existing
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
  storage.setItem(IDENTITY_KEY, token)
  return token
}
export function parseBases(raw: string | null): SyncBases {
  if (!raw) return {}
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid sync metadata')
  const bases: SyncBases = {}
  for (const [day, base] of Object.entries(value)) {
    if (!base || !Number.isInteger(base.revision) || base.revision < 1) throw new Error('Invalid revision')
    bases[day] = { revision: base.revision, entry: parseHistory(JSON.stringify({ [day]: base.entry }))[day] }
  }
  return bases
}

// Merge against the exact last acknowledged cloud value, never device clocks.
export function reconcile(local: History, bases: SyncBases, cloud: CloudSnapshot) {
  const history = { ...local }
  const nextBases = { ...bases }
  const pending = new Set<string>()
  const conflicts = new Set<string>()
  const days = new Set([...Object.keys(local), ...Object.keys(cloud.history)])
  for (const day of days) {
    const draft = local[day]
    const remoteNote = cloud.history[day]
    // Older backends strip optional resource metadata. Keep local links when the
    // actual note text is identical, until the updated Worker is deployed.
    const remote = remoteNote && draft && remoteNote.text === draft.text ? {
      ...remoteNote,
      ...(!remoteNote.learningResources && draft.learningResources ? { learningResources: draft.learningResources } : {}),
      ...(!remoteNote.refinedParagraphs && draft.refinedParagraphs ? { refinedParagraphs: draft.refinedParagraphs } : {}),
      ...(remoteNote.tasks === undefined && draft.tasks !== undefined ? { tasks: draft.tasks } : remoteNote.tasks ? { tasks: remoteNote.tasks.map(task => {
        const previous = draft.tasks?.find(p => p.start === task.start && p.end === task.end && p.checked === task.checked)
        return task.timer === undefined && previous?.timer !== undefined ? { ...task, timer: previous.timer } : task
      }) } : {}),
    } : remoteNote
    const base = bases[day]
    if (sameEntry(draft, remote)) {
      if (remote) nextBases[day] = { entry: remote, revision: cloud.revisions[day] }
    } else if (draft && remote && sameWriting(draft, remote)) {
      const combined = mergeCaptureHistory(draft, remote)
      history[day] = combined
      nextBases[day] = { entry: remote, revision: cloud.revisions[day] }
      if (!sameEntry(combined, remote)) pending.add(day)
    } else if (!draft || sameEntry(draft, base?.entry)) {
      if (remote) { history[day] = remote; nextBases[day] = { entry: remote, revision: cloud.revisions[day] } }
      else if (draft) { delete nextBases[day]; pending.add(day) }
    } else if (!remote) {
      delete nextBases[day]
      pending.add(day)
    } else if (base && (base.revision === cloud.revisions[day] || sameEntry(base.entry, remote))) {
      nextBases[day] = { entry: remote, revision: cloud.revisions[day] }
      pending.add(day)
    } else conflicts.add(day)
  }
  return { history, bases: nextBases, pending, conflicts }
}

export function createCloudApi(baseUrl: string, token: string, lifecycle: AbortSignal, requestFetch: typeof fetch = fetch) {
  async function request(path: string, init?: RequestInit) {
    const response = await requestFetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.any([lifecycle, AbortSignal.timeout(12_000)]),
    })
    const result = await response.json()
    if (!response.ok) throw new CloudError(response.status, result.error || 'Cloud saving failed')
    return result
  }
  return {
    async load(): Promise<CloudSnapshot> {
      const result = await request('/api/notes')
      const history = parseHistory(JSON.stringify(result.history))
      const revisions: RevisionMap = result.revisions
      for (const day of Object.keys(history)) if (!Number.isInteger(revisions?.[day]) || revisions[day] < 1) throw new Error('Invalid cloud revision')
      return { history, revisions }
    },
    async save(day: string, entry: Entry, baseRevision: number): Promise<number> {
      const result = await request(`/api/notes/${day}`, { method: 'PUT', body: JSON.stringify({ entry, baseRevision }) })
      if (!Number.isInteger(result.revision) || result.revision < 1) throw new Error('Invalid cloud revision')
      return result.revision
    },
  }
}

type CloudApi = ReturnType<typeof createCloudApi>
type Options = {
  history: History
  bases: SyncBases
  api: CloudApi
  persist: (history: History, bases: SyncBases) => void
  onHistory: (history: History) => void
  onStatus: (status: SyncStatus) => void
  onConflicts?: (conflicts: NoteConflict[]) => void
  backupConflict?: (conflict: NoteConflict) => void
}
export class NotesSync {
  private history: History
  private bases: SyncBases
  private pending = new Set<string>()
  private conflicts = new Set<string>()
  private remote: CloudSnapshot = { history: {}, revisions: {} }
  private ready = false
  private busy = false
  private stopped = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private options: Options
  constructor(options: Options) { this.options = options; this.history = options.history; this.bases = options.bases }
  private publishConflicts() {
    this.options.onConflicts?.([...this.conflicts].flatMap(day => this.history[day] && this.remote.history[day] ? [{ day, local: this.history[day], cloud: this.remote.history[day], revision: this.remote.revisions[day] }] : []))
  }

  update(history: History, day: string) {
    this.history = history
    if (this.conflicts.has(day)) this.publishConflicts()
    this.pending.add(day)
    if (!this.conflicts.has(day)) this.options.onStatus('saving')
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush() }, 500)
  }
  async start() {
    if (this.busy || this.stopped) return false
    this.busy = true
    let loaded = false
    this.options.onStatus('loading')
    try {
      const cloud = await this.options.api.load()
      if (this.stopped) return
      const merged = reconcile(this.history, this.bases, cloud)
      // Persist before publishing cloud data to React; don't pretend it is local if storage fails.
      this.options.persist(merged.history, merged.bases)
      this.history = merged.history
      this.bases = merged.bases
      this.pending = merged.pending
      this.conflicts = merged.conflicts
      this.remote = { history: { ...cloud.history }, revisions: { ...cloud.revisions } }
      this.ready = true
      this.options.onHistory(this.history)
      this.publishConflicts()
      loaded = true
    } catch (error) {
      if (!this.stopped) this.options.onStatus(error instanceof CloudError ? 'error' : 'offline')
    } finally { this.busy = false }
    if (loaded && !this.stopped) await this.flush()
    return loaded
  }
  async retry() {
    if (this.stopped || this.busy) return
    if (!this.ready || this.conflicts.size) await this.start()
    else await this.flush()
  }
  async resolve(conflict: NoteConflict, choice: 'local' | 'cloud') {
    if (this.busy || this.stopped) throw new Error('Sync is busy. Try again in a moment.')
    if (!await this.start()) throw new Error('Unable to check the latest cloud version. Your draft is unchanged.')
    const { day } = conflict
    if (!this.conflicts.has(day)) return
    if (!this.conflicts.has(day) || !sameEntry(this.history[day], conflict.local) || !sameEntry(this.remote.history[day], conflict.cloud) || this.remote.revisions[day] !== conflict.revision) throw new Error('The versions changed. Check again before choosing.')
    if (!this.options.backupConflict) throw new Error('Version backup is unavailable. Your notes are unchanged.')
    // Back up both complete entries before changing the local draft or cloud base.
    this.options.backupConflict(conflict)
    const history = choice === 'cloud' ? { ...this.history, [day]: conflict.cloud } : this.history
    const bases = { ...this.bases, [day]: { entry: conflict.cloud, revision: conflict.revision } }
    this.options.persist(history, bases)
    this.history = history
    this.bases = bases
    this.conflicts.delete(day)
    if (choice === 'local') this.pending.add(day)
    else this.pending.delete(day)
    this.options.onHistory(history)
    this.publishConflicts()
    await this.flush()
    if (this.conflicts.has(day)) throw new Error('The cloud version changed again. Check the latest versions before choosing.')
  }
  private async flush() {
    if (!this.ready || this.busy || this.stopped) return
    this.busy = true
    let savingDay: string | undefined
    try {
      for (const day of this.pending) {
        if (this.conflicts.has(day)) continue
        savingDay = day
        this.options.onStatus('saving')
        while (this.pending.has(day) && !this.stopped) {
          const draft = this.history[day]
          const revision = await this.options.api.save(day, draft, this.bases[day]?.revision ?? 0)
          if (this.stopped) return
          const bases = { ...this.bases, [day]: { entry: draft, revision } }
          this.options.persist(this.history, bases)
          this.bases = bases
          if (sameEntry(draft, this.history[day])) this.pending.delete(day)
        }
      }
      if (!this.stopped) this.options.onStatus(this.conflicts.size ? 'conflict' : 'saved')
    } catch (error) {
      if (!this.stopped) {
        if (error instanceof CloudError && error.status === 409) {
          // Do not repeatedly overwrite or retry a divergent cloud note.
          if (savingDay) this.conflicts.add(savingDay)
          if (savingDay) { delete this.remote.history[savingDay]; delete this.remote.revisions[savingDay] }
          this.publishConflicts()
          this.options.onStatus('conflict')
        } else this.options.onStatus(error instanceof CloudError ? 'error' : 'offline')
      }
    } finally { this.busy = false }
  }
  stop() { this.stopped = true; clearTimeout(this.timer) }
}
