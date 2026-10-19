import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const built = await build({ stdin: { contents: `export { refineNote, refineParagraphBatch } from './worker/refine'; export { default as worker } from './worker/index'; export { parseHistory, applyWritingChange } from './src/writingSessions'; export { parseLearningResources } from './src/learningResources';`, resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false })
const { refineNote, refineParagraphBatch, worker, parseHistory, applyWritingChange, parseLearningResources } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const completed = (text, learningTopic = '') => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ text, learningTopic }) }] }] })
const headers = { Authorization: `Bearer ${'a.a.a'}`, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' }
const env = { SUPABASE_URL:'https://auth.test',SUPABASE_PUBLISHABLE_KEY:'public-test', ALLOWED_ORIGINS: 'http://127.0.0.1:5173', OPENAI_API_KEY: 'test-only', REFINE_LIMITER: { limit: async () => ({ success: true }) } }
let mf
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: '2026-10-14', d1Databases: { DB: 'refine-quota-test' } }))
  env.DB = await mf.getD1Database('DB')
  const sql = await readFile(new URL('../worker/migrations/0003_refinement_usage.sql', import.meta.url), 'utf8')
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await env.DB.prepare(statement).run()
})
beforeEach(async () => { await env.DB.prepare('DELETE FROM refinement_usage').run() })
after(async () => { await mf?.dispose() })
const request = (body, customHeaders = headers, method = 'POST') => new Request('https://notes.test/api/refine', { method, headers: customHeaders, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })
const authFetch = (url) => url.includes('/auth/v1/user') ? Response.json({id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',email:'a@test.example',email_confirmed_at:'2026-10-01'}) : url.includes('/rest/v1/') ? Response.json([{status:'approved'}]) : null
const completedBatch = paragraphs => Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({paragraphs:paragraphs.map(p=>({isTodo:false,...p}))})}]}]})

test('batch endpoint edits only the identified paragraphs in one model request',async t=>{
 let calls=0
 t.mock.method(globalThis,'fetch',async (_url,init)=>{
   const auth=authFetch(_url); if(auth)return auth
   calls++
   const body=JSON.parse(init.body)
   assert.equal(body.store,false)
   assert.equal(body.text.format.strict,true)
   assert.deepEqual(JSON.parse(body.input[0].content).paragraphs.map(p=>p.id),['a','b'])
   return completedBatch([{id:'b',text:'Second thought.',learningTopic:''},{id:'a',text:'First thought.',learningTopic:''}])
 })
 const response=await worker.fetch(request({paragraphs:[{id:'a',text:'frst thought'},{id:'b',text:'secnd thought'}]}),env)
 assert.equal(response.status,200)
 assert.equal(calls,1)
 assert.deepEqual(await response.json(),{paragraphs:[{id:'a',text:'First thought.',resources:[],isTodo:false},{id:'b',text:'Second thought.',resources:[],isTodo:false}]})
})
test('grammar rules include the Uber case and add only words needed for a natural sentence',async()=>{
 let calls=0
 const result=await refineParagraphBatch([{id:'uber',text:'Do ubr for four hrs'}],'test-only',async(_url,init)=>{
   calls++
   const body=JSON.parse(init.body)
   assert.match(body.instructions,/grammatically complete sentences/)
   assert.match(body.instructions,/Drive for Uber for four hours\./)
   assert.match(body.instructions,/Add only the few words needed for grammar/)
   assert.match(body.instructions,/Keep ambiguous meaning unchanged/)
   return completedBatch([{id:'uber',text:'Drive for Uber for four hours.',learningTopic:'',isTodo:true}])
 })
 assert.equal(calls,1)
 assert.deepEqual(result.paragraphs,[{id:'uber',text:'Drive for Uber for four hours.',resources:[],isTodo:true}])
})

test('both refinement paths add event emoji guidance without another request or changing the response schema', async () => {
  const cases = [
    ['Dad’s birthday, October 25.', '🎂 Dad’s birthday, October 25.', false, null],
    ['Team meeting tomorrow at 3.', '📅 Team meeting tomorrow at 3.', false, null],
    ['Flight to Toronto on Friday.', '✈️ Flight to Toronto on Friday.', false, null],
    ['I am going to India on 26 Oct.', '✈️ I am going to India on 26 Oct.', false, null],
    ['We are traveling to Japan next month.', '✈️ We are traveling to Japan next month.', false, null],
    ['Book tickets to India for 26 Oct.', 'Book tickets to India for 26 Oct.', true, null],
    ['I want to go to India someday.', 'I want to go to India someday.', false, null],
    ['🎂 Dad’s birthday, October 25.', '🎂 Dad’s birthday, October 25.', false, null],
    ['Maybe a party someday.', 'Maybe a party someday.', false, null],
    ['I felt happy yesterday.', 'I felt happy yesterday.', false, null],
    ['Buy milk.', 'Buy milk.', true, null],
    ['Study React for 30 minutes.', 'Study React for 30 minutes.', true, 1800],
  ]
  let calls = 0
  const fetcher = async (_url, init) => {
    calls++
    const body = JSON.parse(init.body)
    assert.match(body.instructions, /prefix its paragraph with one relevant emoji/)
    assert.match(body.instructions, /without adding or duplicating one/)
    assert.match(body.instructions, /preserve all names, dates, times/i)
    assert.match(body.instructions, /ordinary tasks.*reflections.*ambiguous notes/)
    assert.equal(body.tools, undefined)
    if (body.text.format.name === 'refined_note') return completed(cases[0][1])
    assert.deepEqual(Object.keys(body.text.format.schema.properties), ['paragraphs'])
    return completedBatch(cases.map(([, text, isTodo, timerSeconds], i) => ({ id: `p${i}`, text, isTodo, timerSeconds })))
  }
  const input = cases.map(([text], i) => ({ id: `p${i}`, text }))
  const result = await refineParagraphBatch(input, 'test-only', fetcher)
  assert.equal(calls, 1)
  assert.deepEqual(result.paragraphs.map(p => [p.text, p.isTodo, p.timerSeconds]), cases.map(([, ...expected]) => expected))
  const single = await refineNote(cases[0][0], 'test-only', fetcher)
  assert.equal(calls, 2)
  assert.equal(single.text, cases[0][1])
})

test('a leading event emoji is exempt from the existing word limit in single-note and batch validation', async () => {
  const text = 'Dad’s birthday is on October 25 and the family will celebrate together.'
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body)
    return body.text.format.name === 'refined_note' ? completed(`🎂 ${text}`) : completedBatch([{ id: 'a', text: `🎂 ${text}`, isTodo: false }])
  }
  assert.equal((await refineNote(text, 'test-only', fetcher)).text, `🎂 ${text}`)
  assert.equal((await refineParagraphBatch([{ id: 'a', text }], 'test-only', fetcher)).paragraphs[0].text, `🎂 ${text}`)
})
test('batch rejects partial, duplicate and malformed outputs',async()=>{
 const input=[{id:'a',text:'learn rect'},{id:'b',text:'other note'}]
 const a={id:'a',text:'Learn React',learningTopic:'React'},b={id:'b',text:'Other note',learningTopic:''}
 for(const output of [[a],[a,a],[{...a,text:'\n'},b],[{...a,id:'x'},b],[{...a,isTodo:'yes'},b],[{...a,isTodo:undefined},b]]){
   let calls=0
   await assert.rejects(refineParagraphBatch(input,'key',async()=>{calls++;return completedBatch(output)}),error=>error.status===502)
   assert.equal(calls,1)
 }
})
test('batch validates inputs and credentials before making API calls',async()=>{
 const unused=async()=>assert.fail('unexpected API call')
 for(const [input,status] of [[[],400],[[{id:'a',text:'x'},{id:'a',text:'y'}],400],[[{id:'a',text:'x\ny'}],400],[[{id:'a',text:'x'.repeat(12001)}],413]])await assert.rejects(refineParagraphBatch(input,'key',unused),error=>error.status===status)
 await assert.rejects(refineParagraphBatch([{id:'a',text:'note'}],undefined,unused),error=>error.status===503)
})

test('Refine sends only supplied notes to OpenAI and asks for concise editing without storing the response', async () => {
  const text = 'need send proposal tomorow. check price first'
  const result = await refineNote(text, 'test-only', async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses')
    assert.equal(init.headers.Authorization, 'Bearer test-only')
    const body = JSON.parse(init.body)
    assert.equal(body.store, false)
    assert.equal(body.model, 'gpt-5.4-mini')
    assert.deepEqual(body.input, [{ role: 'user', content: text }])
    assert.match(body.instructions, /Do not invent facts/)
    assert.match(body.instructions, /never exceed 12 words/)
    assert.ok(init.signal)
    return completed('Send the proposal tomorrow. Check the price first.')
  })
  assert.deepEqual(result, { text: 'Send the proposal tomorrow. Check the price first.', resources: [] })
})

test('empty, oversized notes and missing credentials fail before calling OpenAI', async () => {
  const unused = async () => { assert.fail('OpenAI must not be called') }
  for (const [text, key, status] of [[' ', 'key', 400], [null, 'key', 400], ['x'.repeat(12001), 'key', 413], ['rough note', undefined, 503]]) {
    await assert.rejects(refineNote(text, key, unused), error => error.status === status)
  }
})

test('learning notes are corrected without searching or adding resources', async () => {
  for (const batch of [false, true]) {
    let calls = 0
    const fetcher = async (_url, init) => {
      calls++
      const body = JSON.parse(init.body)
      assert.equal(body.tools, undefined)
      assert.doesNotMatch(JSON.stringify(body.text.format.schema), /learningTopic/)
      return batch ? completedBatch([{id:'learn',text:'Learn React',isTodo:false}]) : completed('Learn React', 'React')
    }
    const result = batch
      ? await refineParagraphBatch([{id:'learn',text:'Learn rect'}], 'key', fetcher)
      : await refineNote('Learn rect', 'key', fetcher)
    assert.equal(calls, 1)
    assert.deepEqual(batch ? result.paragraphs[0].resources : result.resources, [])
    assert.equal(batch ? result.paragraphs[0].text : result.text, 'Learn React')
    assert.equal(result.resourceNotice, undefined)
  }
})

test('learning links survive saved history and formatting but clear when note text changes', () => {
  const resources = [{ title: 'Learn React', url: 'https://react.dev/learn' }]
  const note = { ...applyWritingChange(undefined, 'Learn React', Date.now(), () => 'session'), learningResources: resources }
  assert.deepEqual(parseHistory(JSON.stringify({ '2026-10-17': note }))['2026-10-17'].learningResources, resources)
  assert.deepEqual(applyWritingChange(note, note.text, Date.now(), () => 'unused', undefined, [{ start: 0, end: 5, marks: ['bold'] }]).learningResources, resources)
  assert.equal(applyWritingChange(note, 'Learn cooking', Date.now(), () => 'unused').learningResources, undefined)
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://localhost', 'https://127.0.0.1/test', 'https://name:password@example.com/']) {
    assert.throws(() => parseLearningResources([{ title: 'Unsafe', url }]))
  }
})

test('empty, incomplete, refusal and expanded output are never applied', async () => {
  for (const result of [
    { status: 'completed', output: [] },
    { status: 'incomplete', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Truncated note' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'extra '.repeat(20) }] }] },
  ]) await assert.rejects(refineNote('rough note', 'key', async () => Response.json(result)), error => error.status === 502)
})

test('upstream failures and timeouts return helpful messages without exposing credentials', async () => {
  for (const [fetcher, status] of [
    [async () => new Response('private upstream error', { status: 401 }), 502],
    [async () => new Response('', { status: 429 }), 429],
    [async () => { throw new Error('private connection details') }, 504],
    [async () => new Response('not json'), 502],
  ]) await assert.rejects(refineNote('rough note', 'test-secret', fetcher), error => error.status === status && !/private|test-secret/.test(error.message))
})

test('authenticated POST returns a refinement with CORS and no caching', async t => {
  t.mock.method(globalThis, 'fetch', async url => authFetch(url) ?? completed('A clear note.'))
  const response = await worker.fetch(request({ text: 'a rough note' }), env)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), headers.Origin)
  assert.match(response.headers.get('Access-Control-Allow-Methods'), /POST/)
  assert.deepEqual(await response.json(), { text: 'A clear note.', resources: [] })
})

test('Refine rejects unauthenticated, disallowed-origin, wrong-method and rate-limited requests', async t => {
  t.mock.method(globalThis,'fetch',async url=>authFetch(url) ?? assert.fail('Unexpected OpenAI call'))
  assert.equal((await worker.fetch(request({ text: 'note' }, { 'Content-Type': 'application/json' }), env)).status, 401)
  assert.equal((await worker.fetch(request({ text: 'note' }, { ...headers, Origin: 'https://other.example' }), env)).status, 403)
  assert.equal((await worker.fetch(request(undefined, headers, 'GET'), env)).status, 405)
  assert.equal((await worker.fetch(request({ text: 'note' }), { ...env, REFINE_LIMITER: { limit: async () => ({ success: false }) } })).status, 429)
  assert.equal((await worker.fetch(request({ text: 'note' }), { ...env, OPENAI_API_KEY: undefined })).status, 503)
})

test('daily allowance counts each successful paragraph across requests and blocks OpenAI after twenty', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const auth = authFetch(url); if (auth) return auth
    calls++
    const input = JSON.parse(JSON.parse(init.body).input[0].content)
    return completedBatch(input.paragraphs.map(p => ({ id: p.id, text: p.text })))
  })
  const paragraphs = Array.from({ length: 19 }, (_, i) => ({ id: `p${i}`, text: 'A thought.' }))
  assert.equal((await worker.fetch(request({ paragraphs }), env)).status, 200)
  // A batch cannot take more than the remaining allowance, even via owner spoofing.
  const rejected = await worker.fetch(request({ paragraphs: paragraphs.slice(0, 2), owner_id: 'other' }), env)
  assert.equal(rejected.status, 429)
  const error = await rejected.json()
  assert.equal(error.code, 'daily_refinement_limit')
  assert.match(error.resetAt, /T00:00:00\.000Z$/)
  assert.match(error.error, /Keep writing—more tomorrow/)
  assert.equal(calls, 1)
  assert.equal((await worker.fetch(request({ paragraphs: paragraphs.slice(0, 1) }), env)).status, 200)
  const blocked = await worker.fetch(request({ text: 'A thought.' }), env)
  assert.equal(blocked.status, 429)
  assert.equal((await blocked.json()).code, 'daily_refinement_limit')
  assert.equal(calls, 2)
  const row = await env.DB.prepare('SELECT SUM(paragraphs) AS used FROM refinement_usage WHERE completed = 1').first()
  assert.equal(row.used, 20)
})

test('invalid, failed, timed-out and cancelled responses consume no daily allowance', async t => {
  const controller = new AbortController()
  let mode = 'invalid'
  t.mock.method(globalThis, 'fetch', async (url) => {
    const auth = authFetch(url); if (auth) return auth
    if (mode === 'invalid') return completedBatch([])
    if (mode === 'failure') return new Response(null, { status: 500 })
    if (mode === 'timeout') throw new DOMException('Timed out', 'TimeoutError')
    controller.abort()
    return completedBatch([{ id: 'a', text: 'A thought.' }])
  })
  for (mode of ['invalid', 'failure', 'timeout', 'cancelled']) {
    const req = request({ paragraphs: [{ id: 'a', text: 'A thought.' }] })
    const response = await worker.fetch(mode === 'cancelled' ? new Request(req, { signal: controller.signal }) : req, env)
    assert.notEqual(response.status, 200)
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS count FROM refinement_usage').first()).count, 0)
  }
})
