import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Input } from '@openai/apps-sdk-ui/components/Input'
import { CloseBold } from '@openai/apps-sdk-ui/components/Icon'
import { getSupabase } from './authClient'
import { useAuth } from './authContext'

export type AuthMode = 'login' | 'signup'
export function AuthDialog({ onClose, initialMode = 'login' }: { onClose: () => void; initialMode?: AuthMode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const { status, error: accessError } = useAuth()
  const navigate = useNavigate()
  const configured = !!getSupabase()
  useEffect(() => { const element = dialog.current; if (element && !element.open) element.showModal() }, [])
  useEffect(() => { if (status === 'approved') { onClose(); navigate('/today', { replace: true }) } }, [status, onClose, navigate])
  function changeMode(next: AuthMode) { setMode(next); setPassword(''); setMessage('') }
  async function submit() {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      const supabase = getSupabase()
      if (!supabase) throw new Error('Account access is not configured yet.')
      const address = email.trim().toLowerCase()
      if (mode === 'signup') {
        const { error, data } = await supabase.auth.signUp({ email: address, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } })
        if (error) throw error
        setPassword('')
        if (!data.session) setMessage('Check your email to finish creating your account.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: address, password })
        if (error) throw error
        setPassword('')
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to continue. Please try again.') }
    finally { setBusy(false) }
  }
  const title = mode === 'signup' ? 'Create your account' : 'Welcome back'
  return <dialog ref={dialog} data-theme="light" aria-labelledby="auth-title" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close() } }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[460px] overflow-y-auto rounded-2xl border-0 bg-surface p-6 text-primary shadow-2xl backdrop:bg-black/40 sm:p-9">
    <div className="absolute right-3 top-3"><Button color="secondary" variant="ghost" size="sm" pill={false} uniform aria-label="Close login" onClick={() => dialog.current?.close()}><CloseBold /></Button></div>
    <h1 id="auth-title" className="mt-2 text-center text-3xl font-semibold tracking-tight">{title}</h1>
    <p className="mt-4 text-center text-sm text-secondary">{mode === 'signup' ? 'Use the email added by the Notes administrator.' : 'Log in to your space for notes.'}</p>
    <form className="mt-7 flex flex-col gap-3" onSubmit={event => { event.preventDefault(); void submit() }}>
      <Input type="email" name="email" autoComplete="email" aria-label="Email address" placeholder="Email address" value={email} onChange={event => setEmail(event.target.value)} required size="3xl" pill={false} disabled={busy} />
      <Input type="password" name="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} aria-label="Password" placeholder={mode === 'signup' ? 'Password (at least 8 characters)' : 'Password'} minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} required size="3xl" pill={false} disabled={busy} />
      <Button type="submit" color="primary" size="3xl" pill={false} block loading={busy} disabled={!configured || busy}>{mode === 'signup' ? 'Create account' : 'Log in'}</Button>
    </form>
    <div className="mt-5 flex flex-wrap justify-center gap-x-3 gap-y-1 text-sm">
      {mode !== 'login' && <Button color="secondary" variant="ghost" size="sm" pill={false} disabled={busy} onClick={() => changeMode('login')}>Already have an account? Log in</Button>}
      {mode === 'login' && <Button color="secondary" variant="ghost" size="sm" pill={false} disabled={busy} onClick={() => changeMode('signup')}>Create an account</Button>}
    </div>
    <p role="status" aria-live="polite" className="mt-3 text-center text-sm text-secondary">{!configured ? 'Account access is being set up. Please check back shortly.' : message || accessError || (status === 'pending' ? 'This email does not have access. Contact the Notes administrator.' : '')}</p>
  </dialog>
}
