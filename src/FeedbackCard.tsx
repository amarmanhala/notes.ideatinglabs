import { useEffect, useRef, useState } from 'react'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea'
import { X } from '@openai/apps-sdk-ui/components/Icon'
import { API_BASE, getAccessToken } from './authClient'

export function FeedbackCard({ userId, onClose }: { userId: string; onClose?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const attempt = useRef<{ id: string; message: string } | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
    return () => request.current?.abort()
  }, [])
  async function submit() {
    const text = message.trim()
    if (!text || request.current) return
    const controller = new AbortController()
    request.current = controller
    if (attempt.current?.message !== text) attempt.current = { id: crypto.randomUUID(), message: text }
    setBusy(true); setStatus('')
    try {
      const token = await getAccessToken(userId)
      controller.signal.throwIfAborted()
      const response = await fetch(`${API_BASE}/api/feedback`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(attempt.current), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to send feedback. Please try again.')
      if (!controller.signal.aborted) { setMessage(''); attempt.current = null; setStatus('Thanks for your feedback!') }
    } catch (error) {
      if (!controller.signal.aborted) setStatus(error instanceof Error && !['TimeoutError', 'TypeError', 'SyntaxError'].includes(error.name) ? error.message : 'Unable to send feedback. Please try again.')
    } finally {
      if (request.current === controller) request.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  return <dialog ref={dialog} id="feedback-dialog" aria-labelledby="feedback-title" aria-describedby="feedback-description" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close() } }}
    className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border-0 bg-surface p-6 text-primary shadow-2xl backdrop:bg-black/40 sm:p-8">
    <form aria-label="Send feedback" className="space-y-3" onSubmit={event => { event.preventDefault(); void submit() }}>
        <div className="flex items-start justify-between gap-2"><div><h2 id="feedback-title" className="text-xl font-semibold text-primary">Feedback</h2><p id="feedback-description" className="mt-1 text-sm text-secondary">What could we make better?</p></div>
          <Button type="button" color="secondary" variant="ghost" size="sm" uniform pill={false} aria-label="Close feedback" onClick={() => dialog.current?.close()}><X /></Button>
        </div>
        <Textarea aria-label="Your feedback" placeholder="Share your thoughts…" rows={2} maxLength={2000} size="lg" value={message} disabled={busy} onChange={event => { setMessage(event.target.value); setStatus('') }} />
        <div className="flex justify-end"><Button type="submit" color="primary" pill={false} size="md" loading={busy} disabled={busy || !message.trim()}>Submit</Button></div>
        {status && <p role="status" className="text-sm text-secondary">{status}</p>}
      </form>
    </dialog>
}
