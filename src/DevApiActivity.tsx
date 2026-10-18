import { useSyncExternalStore } from 'react'
import { getApiActivity, subscribeApiActivity } from './apiActivityStore'

export function DevApiActivity() {
  const call = useSyncExternalStore(subscribeApiActivity, getApiActivity)
  return <div aria-label="OpenAI development status" className="flex w-full min-w-0 items-center gap-2 text-xs text-secondary">
    <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${call ? 'bg-[var(--green-500)]' : 'bg-[var(--gray-400)]'}`} />
    <span className="shrink-0">OpenAI: {!call ? 'No call' : call.state === 'pending' ? 'Calling…' : call.state === 'error' ? 'Failed' : call.state === 'cancelled' ? 'Cancelled' : 'Called'}</span>
    {call && call.state !== 'pending' && <>
      <span className="shrink-0">· {call.tokens !== undefined ? `${call.tokens.toLocaleString()} tokens` : 'Tokens unavailable'}</span>
      <span className="min-w-0 truncate" title={call.response}>· {call.response || 'No response'}</span>
    </>}
  </div>
}
