import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built = await build({ stdin: { contents: `export { refineNote, refineParagraphBatch } from './worker/refine'; export { default as worker } from './worker/index'; export { parseHistory, applyWritingChange } from './src/writingSessions'; export { parseLearningResources } from './src/learningResources';`, resolveDir: process.cwd() }, bundle: true, platform: 'browser', format: 'esm', write: false })
const { refineNote, refineParagraphBatch, worker, parseHistory, applyWritingChange, parseLearningResources } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const completed = (text, learningTopic = '') => Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ text, learningTopic }) }] }] })
const headers = { Authorization: `Bearer ${'a'.repeat(64)}`, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' }
const env = { ALLOWED_ORIGINS: 'http://127.0.0.1:5173', OPENAI_API_KEY: 'test-only', REFINE_LIMITER: { limit: async () => ({ success: true }) } }
const request = (body, customHeaders = headers, method = 'POST') => new Request('https://notes.test/api/refine', { method, headers: customHeaders, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })
const completedBatch = paragraphs => Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({paragraphs:paragraphs.map(p=>({isTodo:false,...p}))})}]}]})

test('batch endpoint edits only the identified paragraphs in one model request',async t=>{
 let calls=0
 t.mock.method(globalThis,'fetch',async (_url,init)=>{
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
  t.mock.method(globalThis, 'fetch', async () => completed('A clear note.'))
  const response = await worker.fetch(request({ text: 'a rough note' }), env)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), headers.Origin)
  assert.match(response.headers.get('Access-Control-Allow-Methods'), /POST/)
  assert.deepEqual(await response.json(), { text: 'A clear note.', resources: [] })
})

test('Refine rejects unauthenticated, disallowed-origin, wrong-method and rate-limited requests', async () => {
  assert.equal((await worker.fetch(request({ text: 'note' }, { 'Content-Type': 'application/json' }), env)).status, 401)
  assert.equal((await worker.fetch(request({ text: 'note' }, { ...headers, Origin: 'https://other.example' }), env)).status, 403)
  assert.equal((await worker.fetch(request(undefined, headers, 'GET'), env)).status, 405)
  assert.equal((await worker.fetch(request({ text: 'note' }), { ...env, REFINE_LIMITER: { limit: async () => ({ success: false }) } })).status, 429)
  assert.equal((await worker.fetch(request({ text: 'note' }), { ...env, OPENAI_API_KEY: undefined })).status, 503)
})
