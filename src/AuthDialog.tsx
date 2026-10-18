import { useEffect, useRef, useState } from 'react'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Input } from '@openai/apps-sdk-ui/components/Input'
import { CloseBold, Phone } from '@openai/apps-sdk-ui/components/Icon'

function GoogleLogo() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z" />
    <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.72 9.4 5.96 12 5.96Z" />
  </svg>
}

function AppleLogo() {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.05 12.54c.03 3.18 2.79 4.24 2.82 4.25-.02.08-.44 1.51-1.45 2.99-.87 1.28-1.78 2.55-3.21 2.58-1.4.03-1.85-.83-3.45-.83s-2.1.8-3.42.86c-1.38.05-2.43-1.39-3.31-2.66-1.8-2.6-3.17-7.36-1.33-10.57a5.14 5.14 0 0 1 4.34-2.64c1.36-.03 2.64.91 3.46.91.83 0 2.38-1.13 4.01-.96.68.03 2.6.27 3.83 2.07-.1.06-2.29 1.33-2.29 4Zm-2.63-7.8c.73-.88 1.22-2.1 1.09-3.32-1.05.04-2.32.7-3.08 1.58-.67.77-1.26 2-1.1 3.18 1.17.09 2.36-.59 3.09-1.44Z" />
  </svg>
}

export function AuthDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  function unavailable(method: string) {
    setMessage(`${method} sign-in isn't available yet. You can use Open Notes without an account for now.`)
  }

  return (
    <dialog ref={dialog} data-theme="light" aria-labelledby="auth-title" aria-describedby="auth-description" onClose={onClose}
      onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close() } }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[500px] overflow-y-auto rounded-3xl border-0 bg-surface p-6 text-primary shadow-2xl backdrop:bg-black/50 sm:p-10">
      <div className="absolute right-4 top-4">
        <Button color="secondary" variant="ghost" size="sm" pill={false} uniform aria-label="Close login" onClick={() => dialog.current?.close()}><CloseBold /></Button>
      </div>
      <h1 id="auth-title" className="mt-2 text-center text-3xl font-semibold tracking-tight" tabIndex={-1} autoFocus>Log in or sign up</h1>
      <p id="auth-description" className="mx-auto mt-5 max-w-xs text-center text-base text-secondary">A space for your thoughts. Keep your notes together, wherever you write.</p>
      <div className="mt-8 flex flex-col gap-3">
        <Button color="secondary" variant="outline" size="3xl" pill={false} block onClick={() => unavailable('Google')}><GoogleLogo />Continue with Google</Button>
        <Button color="secondary" variant="outline" size="3xl" pill={false} block onClick={() => unavailable('Apple')}><AppleLogo />Continue with Apple</Button>
        <Button color="secondary" variant="outline" size="3xl" pill={false} block onClick={() => unavailable('Phone')}><Phone />Continue with phone</Button>
      </div>
      <div className="my-6 flex items-center gap-5" aria-hidden="true"><span className="h-px flex-1 bg-[var(--color-border-primary-outline)]" /><span className="text-xs text-secondary">OR</span><span className="h-px flex-1 bg-[var(--color-border-primary-outline)]" /></div>
      <form className="flex flex-col gap-3" onSubmit={event => { event.preventDefault(); unavailable('Email') }}>
        <Input type="email" name="email" autoComplete="email" aria-label="Email address" placeholder="email@example.com" required size="3xl" pill={false} />
        <Button type="submit" color="primary" size="3xl" pill={false} block>Continue</Button>
      </form>
      {message && <p role="status" className="mt-4 text-center text-sm text-secondary">{message}</p>}
    </dialog>
  )
}
