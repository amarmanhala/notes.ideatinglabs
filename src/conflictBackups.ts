import type { NoteConflict } from './cloudSync'

export const CONFLICT_BACKUP_KEY = 'notes.conflict-backups.v1'
export function backupConflict(storage: Storage, conflict: NoteConflict) {
  let backups: unknown
  try {
    const raw = storage.getItem(CONFLICT_BACKUP_KEY)
    backups = raw ? JSON.parse(raw) : []
  } catch { throw new Error('Existing version backups could not be read. Your notes are unchanged.') }
  if (!Array.isArray(backups)) throw new Error('Existing version backups could not be read. Your notes are unchanged.')
  try { storage.setItem(CONFLICT_BACKUP_KEY, JSON.stringify([...backups, { ...conflict, savedAt: new Date().toISOString() }])) }
  catch { throw new Error('Both versions could not be backed up. Your draft is unchanged. Free up browser storage and try again.') }
}
