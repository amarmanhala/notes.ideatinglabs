import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import https from 'node:https'

const base = process.env.NOTES_API_URL || 'https://notes.ideatinglabs.com'
const token = process.env.NOTES_TEST_ACCESS_TOKEN
const otherToken = process.env.NOTES_TEST_OTHER_ACCESS_TOKEN
if (!token || !otherToken) throw new Error('Set NOTES_TEST_ACCESS_TOKEN and NOTES_TEST_OTHER_ACCESS_TOKEN for two disposable approved accounts.')
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
if (!claims.sub) throw new Error('The test session must identify a Supabase account.')
const ownerId = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`supabase:${claims.sub}`))), b => b.toString(16).padStart(2, '0')).join('')
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const checks = []
// Optional DNS override for a newly published hostname. TLS still verifies the
// hostname and certificate normally; use only its independently verified public IP.
const resolvedIp = process.env.NOTES_RESOLVED_IP
async function requestFetch(url, init) {
  if (!resolvedIp) return fetch(url, init)
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: init.method || 'GET', headers: init.headers, signal: init.signal,
      family: 4,
      lookup: (hostname, options, callback) => {
        if (hostname !== new URL(base).hostname) return callback(new Error('Unexpected hostname'))
        if (options.all) callback(null, [{address: resolvedIp, family: 4}])
        else callback(null, resolvedIp, 4)
      },
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve(new Response(response.statusCode === 204 ? null : Buffer.concat(chunks), {
        status: response.statusCode,
        headers: Object.fromEntries(Object.entries(response.headers).filter(([, value]) => value !== undefined).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value])),
      })))
      response.on('error', reject)
    })
    req.on('error', reject)
    req.end(init.body)
  })
}
async function request(name, path, init, expected) {
  const response = await requestFetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(20_000) })
  assert.equal(response.status, expected, `${name}: HTTP ${response.status}`)
  checks.push(name)
  return response
}
try {
  const health = await (await request('Public HTTPS and D1 health', '/api/health', undefined, 200)).json()
  assert.equal(health.ok, true)
  assert.equal(health.storage, 'D1')
  await request('Private notes require authorization', '/api/notes', undefined, 401)
  const cors = await request('Frontend CORS preflight', '/api/notes', { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5173' } }, 204)
  assert.equal(cors.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:5173')
  await request('Unexpected origins rejected', '/api/notes', { headers: { ...headers, Origin: 'https://untrusted.example' } }, 403)
  for (const candidate of [token, otherToken]) {
    const existing = await (await request('Disposable account is empty', '/api/notes', {headers:{Authorization:`Bearer ${candidate}`}}, 200)).json()
    assert.deepEqual(existing.history, {}, 'Refusing to write to an account with existing notes')
  }
  const now = new Date().toISOString()
  const entry = { text: 'Disposable live verification note', createdAt: now, updatedAt: now, sessions: [{ id: crypto.randomUUID(), startedAt: now, lastEditedAt: now, anchorOffset: 0 }], formats: [{ start: 0, end: 10, marks: ['bold'] }, { start: 11, end: 15, marks: ['italic'] }] }
  const put = (entry, baseRevision) => ({ method: 'PUT', headers, body: JSON.stringify({ entry, baseRevision }) })
  await request('Save writing with timestamp metadata', '/api/notes/2026-10-14', put(entry, 0), 200)
  const loaded = await (await request('Reload cloud writing', '/api/notes', { headers }, 200)).json()
  assert.deepEqual(loaded.history['2026-10-14'], entry)
  const edited = { ...entry, text: `${entry.text} edited` }
  await request('Reject stale revisions', '/api/notes/2026-10-14', put(edited, 0), 409)
  await request('Save the next revision', '/api/notes/2026-10-14', put(edited, 1), 200)
  await request('Retry a lost response safely', '/api/notes/2026-10-14', put(edited, 1), 200)
  const isolated = await (await request('Isolate another account', '/api/notes', { headers: { Authorization: `Bearer ${otherToken}` } }, 200)).json()
  assert.deepEqual(isolated.history, {})
  console.log(JSON.stringify({ ok: true, base, checks }, null, 2))
} finally {
  await mkdir('.cloudflare', { recursive: true })
  // Only the hash of this disposable test identity is written for targeted cleanup.
  await writeFile(`.cloudflare/live-check-cleanup-${ownerId}.json`, JSON.stringify({ ownerId }))
}
