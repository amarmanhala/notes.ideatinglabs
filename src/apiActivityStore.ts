export type ApiActivity = {
  id: string
  label: string
  state: 'pending' | 'success' | 'error' | 'cancelled'
  tokens?: number
  response?: string
}

const enabled = import.meta.env?.DEV === true
const clientId = enabled ? crypto.randomUUID() : ''
const listeners = new Set<() => void>()
let activity: ApiActivity | null = null

export const subscribeApiActivity = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const getApiActivity = () => activity
export const devApiHeaders = (): Record<string, string> => enabled ? { 'X-Notes-Dev-Client': clientId } : {}

export function recordApiActivity(event: ApiActivity) {
  if (!enabled || !event.label.startsWith('OpenAI')) return
  // Keep only the latest call; an older response cannot replace a newer call.
  if (event.state !== 'pending' && activity?.id !== event.id) return
  activity = { id: event.id, label: event.label, state: event.state, tokens: event.tokens, response: event.response }
  listeners.forEach(listener => listener())
}

if (enabled && import.meta.hot) {
  const receive = (event: ApiActivity & { clientId: string }) => {
    if (event.clientId === clientId) recordApiActivity(event)
  }
  import.meta.hot.on('notes:api-call', receive)
  import.meta.hot.dispose(() => { import.meta.hot?.off('notes:api-call', receive) })
}
