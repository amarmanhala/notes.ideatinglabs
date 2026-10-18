import type { InferEnv } from 'cf/config'
import type config from '../cloudflare.config'
import { parseHistory, type Entry } from '../src/writingSessions'
import { createSpeechSession } from './speech'
import { refineNote, refineParagraphBatch, RefineError } from './refine'

type Env = InferEnv<typeof config.worker>
const MAX_BODY_BYTES = 512 * 1024
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'Expected application/json')
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new HttpError(413, 'Note is too large')
  const reader = request.body?.getReader()
  if (!reader) throw new HttpError(400, 'Missing request body')
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new HttpError(413, 'Note is too large') }
    chunks.push(value)
  }
  const data = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder().decode(data)) }
  catch { throw new HttpError(400, 'Invalid JSON') }
}
async function ownerId(request: Request) {
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '')
  if (!match) throw new HttpError(401, 'A private browser key is required')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(match[1]))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
function validDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day
}

type NoteRow = { day: string; entry: string; revision: number }
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (url.pathname === '/' || url.pathname === '/api/health') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    await env.DB.prepare('SELECT 1').first()
    return json({ ok: true, service: 'notes', storage: 'D1' })
  }
  if (url.pathname !== '/api/speech/session' && url.pathname !== '/api/refine' && url.pathname !== '/api/notes' && !/^\/api\/notes\/[^/]+$/.test(url.pathname)) return json({ error: 'Not found' }, 404)
  const owner = await ownerId(request)
  if (url.pathname === '/api/speech/session') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const key = request.headers.get('CF-Connecting-IP') ?? owner
    if (!(await env.SPEECH_LIMITER.limit({ key })).success) return json({ error: 'Please wait a minute before speaking again.' }, 429)
    return json(await createSpeechSession(env.OPENAI_API_KEY, owner, fetch, request.signal))
  }
  if (url.pathname === '/api/refine') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const body = await readBody(request)
    if (!body || typeof body !== 'object' || !('text' in body || 'paragraphs' in body)) return json({ error: 'Expected note text or paragraphs' }, 400)
    const key = request.headers.get('CF-Connecting-IP') ?? owner
    if (!(await env.REFINE_LIMITER.limit({ key })).success) return json({ error: 'Please wait a minute before refining again.' }, 429)
    return json('paragraphs' in body ? await refineParagraphBatch(body.paragraphs, env.OPENAI_API_KEY, fetch, request.signal) : await refineNote(body.text, env.OPENAI_API_KEY))
  }
  if (url.pathname === '/api/notes') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    const { results } = await env.DB.prepare('SELECT day, entry, revision FROM notes WHERE owner_id = ?1 ORDER BY day DESC').bind(owner).all<NoteRow>()
    const history: Record<string, Entry> = {}
    const revisions: Record<string, number> = {}
    for (const row of results) { history[row.day] = JSON.parse(row.entry); revisions[row.day] = row.revision }
    return json({ history, revisions })
  }
  const day = url.pathname.slice('/api/notes/'.length)
  try { if (!validDay(day)) throw new Error() } catch { return json({ error: 'Invalid note date' }, 400) }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405)
  const body = await readBody(request)
  if (!body || typeof body !== 'object' || !('entry' in body) || !('baseRevision' in body) || !Number.isInteger(body.baseRevision) || (body.baseRevision as number) < 0) return json({ error: 'Invalid note payload' }, 400)
  let entry: Entry
  try { entry = parseHistory(JSON.stringify({ [day]: body.entry }))[day] }
  catch { return json({ error: 'Invalid note or session data' }, 400) }
  const serialized = JSON.stringify(entry)
  const revision = body.baseRevision as number
  const savedAt = new Date().toISOString()
  // Compare-and-swap is a single atomic SQL statement, including creation.
  const saved = await env.DB.prepare(`
    INSERT INTO notes (owner_id, day, entry, revision, saved_at)
    SELECT ?1, ?2, ?3, 1, ?4
    WHERE ?5 = 0 OR EXISTS (SELECT 1 FROM notes WHERE owner_id = ?1 AND day = ?2 AND revision = ?5)
    ON CONFLICT(owner_id, day) DO UPDATE SET
      entry = excluded.entry, revision = notes.revision + 1, saved_at = excluded.saved_at
    WHERE notes.revision = ?5
    RETURNING revision
  `).bind(owner, day, serialized, savedAt, revision).first<{ revision: number }>()
  if (!saved) {
    const current = await env.DB.prepare('SELECT entry, revision FROM notes WHERE owner_id = ?1 AND day = ?2').bind(owner, day).first<{ entry: string; revision: number }>()
    // A retry after a lost response is safe when the cloud already has this draft.
    if (current?.entry === serialized) return json({ revision: current.revision, savedAt })
    return json({ error: 'This note changed elsewhere. Your local draft has been kept.', currentRevision: current?.revision ?? 0 }, 409)
  }
  return json({ revision: saved.revision, savedAt })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin')
    const allowed = new Set(env.ALLOWED_ORIGINS.split(','))
    const sameOrigin = origin === new URL(request.url).origin
    const corsOrigin = origin && (allowed.has(origin) || sameOrigin) ? origin : null
    if (origin && !corsOrigin) return json({ error: 'Origin not allowed' }, 403)
    let response: Response
    try {
      response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env)
    } catch (error) {
      if (error instanceof HttpError || error instanceof RefineError) response = json({ error: error.message }, error.status)
      else {
        const requestId = crypto.randomUUID()
        console.error(JSON.stringify({ event: 'request_failed', requestId }))
        response = json({ error: 'Unable to access saved writing', requestId }, 500)
      }
    }
    response.headers.set('Vary', 'Origin')
    if (corsOrigin) {
      response.headers.set('Access-Control-Allow-Origin', corsOrigin)
      response.headers.set('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      response.headers.set('Access-Control-Max-Age', '86400')
    }
    return response
  },
} satisfies ExportedHandler<Env>
