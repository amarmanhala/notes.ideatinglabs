import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import { lookup } from 'node:dns'
import { Agent } from 'node:https'
import { isIP } from 'node:net'
import { refineNote, refineParagraphBatch, RefineError } from './worker/refine.ts'
import { createSpeechSession } from './worker/speech.ts'
import { createHash } from 'node:crypto'
import { openaiDiagnostics } from './server/openaiDiagnostics.ts'

const backendHost = 'notes.ideatinglabs.com'
const backendAgent = new Agent({
  lookup(hostname, options, callback) {
    const respond = (address: string, family: number) => {
      if (options.all) callback(null, [{ address, family }])
      else callback(null, address, family)
    }
    lookup(hostname, { family: 4 }, (error, address, family) => {
      if (!error) { respond(address, family); return }
      if (error.code !== 'ENOTFOUND' || hostname !== backendHost) { callback(error, '', 4); return }
      // New DNS records may still be negatively cached by the local resolver.
      // Resolve only our approved hostname through Cloudflare's public DNS;
      // HTTPS hostname and certificate verification remain enabled.
      void fetch(`https://cloudflare-dns.com/dns-query?name=${backendHost}&type=A`, {
        headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(8_000),
      }).then(response => response.json()).then(result => {
        if (!result || typeof result !== 'object' || !('Answer' in result) || !Array.isArray(result.Answer)) throw error
        const record = result.Answer.find(answer => answer?.type === 1 && typeof answer.data === 'string' && isIP(answer.data) === 4)
        if (!record) throw error
        respond(record.data, 4)
      }).catch(() => callback(error, '', 4))
    })
  },
})

export default defineConfig(({ mode }) => {
  const serverEnv = loadEnv(mode, process.cwd(), '')
  return {
  plugins: [react(), tailwindcss(), {
    name: 'local-note-refine',
    configureServer(server) {
      const speechAttempts = new Map<string, { count: number; until: number }>()
      server.middlewares.use('/api/speech/session', async (request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        const lifecycle = new AbortController()
        response.on('close', () => lifecycle.abort())
        try {
          if (request.method !== 'POST') throw new RefineError(405, 'Method not allowed')
          if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) throw new RefineError(403, 'Origin not allowed')
          if (!/^Bearer [a-f0-9]{64}$/.test(request.headers.authorization ?? '')) throw new RefineError(401, 'A private browser key is required')
          const now = Date.now()
          for (const [key, attempt] of speechAttempts) if (attempt.until <= now) speechAttempts.delete(key)
          const owner = createHash('sha256').update(request.headers.authorization!.slice(7)).digest('hex')
          const limitKey = request.socket.remoteAddress ?? owner
          const attempt = speechAttempts.get(limitKey) ?? { count: 0, until: now + 60_000 }
          if (++attempt.count > 5) throw new RefineError(429, 'Please wait a minute before speaking again.')
          speechAttempts.set(limitKey, attempt)
          const result = await createSpeechSession(serverEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY, owner, fetch, lifecycle.signal)
          response.end(JSON.stringify(result))
        } catch (error) {
          response.statusCode = error instanceof RefineError ? error.status : 500
          response.end(JSON.stringify({ error: error instanceof RefineError ? error.message : 'Could not connect. Click the mic to try again.' }))
        }
      })
      // This middleware runs only in Node during local development. The key is never bundled.
      server.middlewares.use('/api/refine', async (request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        try {
          if (request.method !== 'POST') throw new RefineError(405, 'Method not allowed')
          if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) throw new RefineError(403, 'Origin not allowed')
          if (!/^Bearer [a-f0-9]{64}$/.test(request.headers.authorization ?? '')) throw new RefineError(401, 'A private browser key is required')
          if (!request.headers['content-type']?.startsWith('application/json')) throw new RefineError(415, 'Expected application/json')
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of request) {
            size += chunk.length
            if (size > 64 * 1024) throw new RefineError(413, 'Note is too large')
            chunks.push(Buffer.from(chunk))
          }
          let body: unknown
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
          catch { throw new RefineError(400, 'Invalid JSON') }
          const text = body && typeof body === 'object' && 'text' in body ? body.text : undefined
          const lifecycle = new AbortController()
          response.on('close', () => lifecycle.abort())
          const key = serverEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY
          // Vite's existing dev socket reports upstream calls to the requesting tab.
          // Show only the visible response and measured tokens for development.
          const clientId = request.headers['x-notes-dev-client']
          const diagnosticFetch: typeof fetch = async (input, init) => {
            const id = crypto.randomUUID()
            const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
            const label = body.tools?.some((tool: { type?: string }) => tool.type === 'web_search') ? 'OpenAI · Learning links' : 'OpenAI · Refine'
            const publish = (state: string, details: { tokens?: number; response?: string } = {}) => {
              if (typeof clientId === 'string' && /^[a-f0-9-]{36}$/.test(clientId)) server.ws.send('notes:api-call', { clientId, id, label, state, ...details })
            }
            publish('pending')
            try {
              const upstream = await fetch(input, init)
              const details = typeof clientId === 'string' ? openaiDiagnostics(await upstream.clone().json().catch(() => null)) : {}
              publish(upstream.ok ? 'success' : 'error', details)
              return upstream
            } catch (error) {
              publish(error instanceof Error && error.name === 'AbortError' ? 'cancelled' : 'error')
              throw error
            }
          }
          const refined = body && typeof body === 'object' && 'paragraphs' in body
            ? await refineParagraphBatch(body.paragraphs, key, diagnosticFetch, lifecycle.signal)
            : await refineNote(text, key, diagnosticFetch)
          response.end(JSON.stringify(refined))
        } catch (error) {
          response.statusCode = error instanceof RefineError ? error.status : 500
          response.end(JSON.stringify({ error: error instanceof RefineError ? error.message : 'Unable to refine. Your note is unchanged.' }))
        }
      })
    },
  }],
  server: {
    proxy: { '/api': { target: `https://${backendHost}`, changeOrigin: true, agent: backendAgent } },
  },
  }
})
