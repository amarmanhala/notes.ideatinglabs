import { useEffect, useRef, useState } from 'react'
import { browserKey, createCloudApi, NotesSync, parseBases, SYNC_KEY, type SyncStatus, type NoteConflict } from './cloudSync'
import { backupConflict } from './conflictBackups'
import { STORAGE_KEY, type History } from './writingSessions'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? '' : 'https://notes.ideatinglabs.com')
export function useCloudNotes(initial: History, enabled: boolean, onHistory: (history: History) => void) {
  const engine = useRef<NotesSync | null>(null)
  const latest = useRef(initial)
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [conflicts, setConflicts] = useState<NoteConflict[]>([])
  useEffect(() => {
    if (!enabled) return
    const lifecycle = new AbortController()
    try {
      const token = browserKey(localStorage)
      const sync = new NotesSync({
        history: latest.current,
        bases: parseBases(localStorage.getItem(SYNC_KEY)),
        api: createCloudApi(API_BASE, token, lifecycle.signal),
        persist: (history, bases) => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
          localStorage.setItem(SYNC_KEY, JSON.stringify(bases))
        },
        onHistory: history => { latest.current = history; onHistory(history) },
        onStatus: setStatus,
        onConflicts: setConflicts,
        backupConflict: conflict => backupConflict(localStorage, conflict),
      })
      engine.current = sync
      const retry = () => { void sync.retry() }
      window.addEventListener('online', retry)
      const timer = window.setInterval(retry, 15_000)
      void sync.start()
      return () => {
        lifecycle.abort()
        sync.stop()
        engine.current = null
        window.removeEventListener('online', retry)
        window.clearInterval(timer)
      }
    } catch {
      // Schedule the notification without setting React state synchronously in an effect.
      const timer = window.setTimeout(() => setStatus('error'), 0)
      return () => window.clearTimeout(timer)
    }
  }, [enabled, onHistory])
  return {
    status,
    conflicts,
    async resolve(conflict: NoteConflict, choice: 'local' | 'cloud') {
      if (!engine.current) throw new Error('Cloud sync is not connected yet.')
      await engine.current.resolve(conflict, choice)
    },
    changed(history: History, day: string) {
      latest.current = history
      engine.current?.update(history, day)
    },
    async retry() { await engine.current?.retry() },
  }
}
