import { useEffect, useRef, useState } from 'react'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea'
import { Popover } from '@openai/apps-sdk-ui/components/Popover'
import { API_BASE, getAccessToken } from './authClient'

export function FeedbackCard({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const attempt = useRef<{ id: string; message: string } | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
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
  return <Popover open={open} onOpenChange={setOpen}>
    <Popover.Trigger><Button color="secondary" variant="ghost" size="sm" pill={false}>Feedback</Button></Popover.Trigger>
    <Popover.Content side="top" align="end" sideOffset={10} width={320} minWidth={0} className="max-w-[calc(100vw-2rem)]">
      <form aria-label="Send feedback" className="space-y-3 p-4" onSubmit={event => { event.preventDefault(); void submit() }}>
        <div><h2 className="text-base font-semibold text-primary">Feedback</h2><p className="mt-1 text-sm text-secondary">What could we make better?</p></div>
        <Textarea aria-label="Your feedback" placeholder="Share your thoughts…" rows={3} maxLength={2000} size="lg" value={message} disabled={busy} onChange={event => { setMessage(event.target.value); setStatus('') }} />
        <div className="flex justify-end"><Button type="submit" color="primary" pill={false} size="md" loading={busy} disabled={busy || !message.trim()}>Submit</Button></div>
        {status && <p role="status" className="text-sm text-secondary">{status}</p>}
      </form>
    </Popover.Content>
  </Popover>
}
