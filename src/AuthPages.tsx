import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Input } from '@openai/apps-sdk-ui/components/Input'
import { getSupabase } from './authClient'
import { useAuth } from './authContext'

function AuthScreen({ children }: { children: ReactNode }) {
  return <main data-theme="light" className="flex min-h-dvh items-center justify-center bg-surface px-6 text-primary"><section className="w-full max-w-sm space-y-5 text-center">{children}</section></main>
}
export function RequireApproved({ children }: { children: ReactNode }) {
  const auth = useAuth()
  if (auth.status === 'loading') return <AuthScreen><p role="status">Opening your notes…</p></AuthScreen>
  if (auth.status === 'signedOut' || auth.status === 'unconfigured') return <Navigate to="/" replace />
  if (auth.status === 'approved') return children
  return <AuthScreen>
    <h1 className="text-2xl font-semibold">{auth.status === 'pending' ? 'Access is restricted' : 'Unable to open Notes'}</h1>
    <p role="status" className="text-secondary">{auth.error || 'Ask the administrator to add your email before using Notes.'}</p>
    <Button color="primary" pill={false} onClick={auth.retry}>Check again</Button>
    <div><Link to="/" className="text-sm underline">Back to homepage</Link></div>
  </AuthScreen>
}
async function finishCallback() {
  const client = getSupabase()
  if (!client) throw new Error('Account access is not configured yet.')
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const callbackError = url.searchParams.get('error_description') || hash.get('error_description')
  if (callbackError) throw new Error(callbackError)
  let passwordRequired: boolean
  const type = url.searchParams.get('type') || hash.get('type')
  if (url.searchParams.has('token_hash') && ['invite', 'recovery', 'signup', 'email'].includes(type ?? '')) {
    const { error } = await client.auth.verifyOtp({ token_hash: url.searchParams.get('token_hash')!, type: type as 'invite' | 'recovery' | 'signup' | 'email' })
    if (error) throw error
    passwordRequired = type === 'invite' || type === 'recovery'
  } else if (url.searchParams.has('code')) {
    const { error } = await client.auth.exchangeCodeForSession(url.searchParams.get('code')!)
    if (error) throw error
    passwordRequired = type === 'invite' || type === 'recovery'
  } else if (hash.has('access_token') && hash.has('refresh_token')) {
    const { error } = await client.auth.setSession({ access_token: hash.get('access_token')!, refresh_token: hash.get('refresh_token')! })
    if (error) throw error
    passwordRequired = type === 'invite' || type === 'recovery'
  } else throw new Error('This link is missing sign-in information. Open your latest confirmation link or log in again.')
  // Remove credentials from the URL immediately after consuming the link.
  window.history.replaceState(null, '', '/auth/callback')
  return passwordRequired ? '/auth/set-password' : '/today'
}
export function AuthCallback() {
  const pending = useRef<Promise<string> | null>(null)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    let current = true
    pending.current ??= finishCallback()
    void pending.current.then(path => { if (current) navigate(path, { replace: true }) }).catch(error => {
      // OAuth error descriptions are plain text, never rendered as HTML.
      window.history.replaceState(null, '', '/auth/callback')
      if (current) setError(error instanceof Error ? error.message : 'This sign-in link could not be used.')
    })
    return () => { current = false }
  }, [navigate])
  return <AuthScreen><h1 className="text-2xl font-semibold">{error ? 'Unable to sign in' : 'Finishing sign-in…'}</h1><p role="status" className="text-secondary">{error}</p>{error && <Link to="/" className="underline">Back to homepage</Link>}</AuthScreen>
}
export function SetPassword() {
  const { session, status } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  if (status === 'loading') return <AuthScreen><p role="status">Opening your account…</p></AuthScreen>
  if (!session) return <Navigate to="/" replace />
  return <AuthScreen><h1 className="text-2xl font-semibold">Choose your password</h1><p className="text-secondary">Use at least 8 characters to secure your Notes account.</p>
    <form className="space-y-3" onSubmit={event => {
      event.preventDefault(); if (busy) return; setBusy(true); setError('')
      void getSupabase()!.auth.updateUser({ password }).then(({ error }) => {
        if (error) setError(error.message)
        else { setPassword(''); navigate('/today', { replace: true }) }
      }).catch(() => setError('Unable to save your password. Please try again.')).finally(() => setBusy(false))
    }}><Input type="password" autoComplete="new-password" aria-label="New password" placeholder="New password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required pill={false} size="3xl" /><Button type="submit" color="primary" pill={false} block size="3xl" loading={busy} disabled={busy}>Save password</Button></form>
    <p role="status" className="text-sm text-secondary">{error}</p>
  </AuthScreen>
}
