import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { API_BASE, getSupabase } from './authClient'
import { AuthContext, type AuthState } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [access, setAccess] = useState<{ token: string; userId: string; status: AuthState['status']; error: string } | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return
    let current = true
    // Ignore an older initial read if an auth event already supplied a newer session.
    let eventReceived = false
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      eventReceived = true
      if (current) { setSession(next); setInitialized(true) }
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (current && !eventReceived) { setSession(error ? null : data.session); setInitialized(true) }
    }).catch(() => { if (current) setInitialized(true) })
    return () => { current = false; data.subscription.unsubscribe() }
  }, [])
  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    const token = session.access_token
    void fetch(`${API_BASE}/api/auth/access`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Unable to check your access.')
      // The server-verified identity must match the account whose local drafts we open.
      if (result?.account?.id !== session.user.id) throw new Error('Your account changed. Please log in again.')
      if (!controller.signal.aborted) setAccess({ token, userId: session.user.id, status: result.approved === true ? 'approved' : 'pending', error: '' })
    }).catch(error => {
      if (!controller.signal.aborted) setAccess({ token, userId: session.user.id, status: 'error', error: error instanceof Error ? error.message : 'Unable to check your access.' })
    })
    return () => controller.abort()
  }, [session, retry])
  const configured = !!getSupabase()
  const status = !configured ? 'unconfigured' : !initialized ? 'loading' : !session ? 'signedOut' : access?.userId === session.user.id && (access.token === session.access_token || access.status === 'approved') ? access.status : 'loading'
  return <AuthContext.Provider value={{ session, status, error: status === 'error' ? access?.error ?? '' : '', retry: () => setRetry(value => value + 1) }}>{children}</AuthContext.Provider>
}
