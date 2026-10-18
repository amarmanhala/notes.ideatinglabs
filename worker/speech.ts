import { RefineError } from './refine.ts'

// Both the Worker and Vite use this configuration. No permanent key leaves the server.
export async function createSpeechSession(key: string | undefined, owner: string, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
  if (!key) throw new RefineError(503, 'Speaking is not available yet. You can keep typing.')
  const response = await fetcher('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'OpenAI-Safety-Identifier': owner },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 60 },
      session: {
        type: 'transcription',
        audio: { input: {
          transcription: { model: 'gpt-4o-mini-transcribe' },
          noise_reduction: { type: 'near_field' },
          turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 },
        } },
      },
    }),
    signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]),
  })
  if (!response.ok) throw new RefineError(response.status === 429 ? 429 : 502, response.status === 429 ? 'Speaking is busy. Please try again shortly.' : 'Could not connect. Click the mic to try again.')
  const result = await response.json() as { value?: unknown; expires_at?: unknown }
  if (typeof result.value !== 'string' || !result.value || typeof result.expires_at !== 'number') throw new RefineError(502, 'Could not start speech transcription. Please try again.')
  return { value: result.value, expires_at: result.expires_at }
}
