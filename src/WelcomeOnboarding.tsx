import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Input } from '@openai/apps-sdk-ui/components/Input'
import { ArrowRight } from '@openai/apps-sdk-ui/components/Icon'
import { getAccessToken, getSupabase } from './authClient'
import { WelcomeSync } from './welcomeState'

type Props = { userId: string; profile: Record<string, unknown>; storage: Storage; onFinish: () => void; children?: ReactNode }
export function WelcomeOnboarding({ userId, profile, storage, onFinish, children }: Props) {
  const [sync] = useState(() => new WelcomeSync(storage, async data => {
    await getAccessToken(userId)
    const client = getSupabase()
    if (!client) throw new Error('Account access is unavailable')
    const result = await client.auth.updateUser({ data })
    if (result.error) throw result.error
  }))
  const [phase, setPhase] = useState<'name' | 'greeting' | 'closed'>(() => profile.notes_welcome_seen === true || sync.record?.seen ? 'closed' : 'name')
  const [name, setName] = useState('')
  const [greetingName, setGreetingName] = useState('')
  const surface = useRef<HTMLElement>(null)
  useEffect(() => {
    // Mark it when first shown, including when someone closes the tab without answering.
    if (profile.notes_welcome_seen !== true && !sync.record?.seen) sync.mark()
    else void sync.flush()
    const retry = () => { void sync.flush() }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [profile.notes_welcome_seen, sync])
  useEffect(() => {
    if (phase === 'name') surface.current?.querySelector<HTMLInputElement>('input')?.focus()
    if (phase === 'greeting') surface.current?.querySelector<HTMLButtonElement>('[data-start-writing]')?.focus()
  }, [phase])
  function finish() { setPhase('closed'); requestAnimationFrame(onFinish) }
  function introduce(value: string) {
    const trimmed = value.trim().slice(0, 60)
    sync.mark(trimmed)
    setGreetingName(trimmed); setPhase('greeting')
  }
  return <div className="relative h-full w-full min-h-0 min-w-0 flex-1">
    <div className="h-full w-full min-h-0" hidden={phase !== 'closed'} inert={phase !== 'closed'}>{children}</div>
    {phase !== 'closed' && <section ref={surface} aria-label="Welcome" className="px-2 py-1.5 text-left text-xl leading-relaxed text-primary sm:pl-10 sm:pr-3" onKeyDown={event => { if (event.key === 'Escape') finish() }}>
      {phase === 'name' ? <form onSubmit={event => { event.preventDefault(); introduce(name) }}>
        <p>What should we call you?</p>
        <Input className="welcome-name-input mt-3" aria-label="Name" placeholder="Name" autoComplete="given-name" value={name} maxLength={60} size="3xl" pill={false} onChange={event => setName(event.target.value)}
          endAdornment={<Button type="submit" aria-label="Continue" color="secondary" variant="ghost" size="sm" uniform pill={false}><ArrowRight /></Button>} />
        <div className="mt-2"><Button type="button" color="secondary" variant="ghost" pill={false} size="sm" opticallyAlign="start" onClick={() => introduce('')}>Skip</Button></div>
      </form> : <>
        <p className="break-words">{greetingName ? `Let’s gather your thoughts, ${greetingName}. 🌱` : 'Let’s gather your thoughts. 🌱'}</p>
        <Button data-start-writing color="secondary" variant="ghost" size="sm" pill={false} opticallyAlign="start" className="mt-3" onClick={finish}>Start writing</Button>
      </>}
    </section>}
  </div>
}
