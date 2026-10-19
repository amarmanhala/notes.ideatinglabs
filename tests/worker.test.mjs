import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

let mf
let db
const owner = 'a.a.a'
const auth = {Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json'}
const day = '2026-10-14'
const original = {
  text: 'First thought\nSecond thought', createdAt:'2026-10-14T14:00:00.000Z', updatedAt:'2026-10-14T14:02:00.000Z',
  sessions: [{id:'one',startedAt:'2026-10-14T14:00:00.000Z',lastEditedAt:'2026-10-14T14:00:00.000Z',anchorOffset:0}, {id:'two',startedAt:'2026-10-14T14:02:00.000Z',lastEditedAt:'2026-10-14T14:02:00.000Z',anchorOffset:14}],
}
const request = (path, init) => mf.dispatchFetch(`https://notes.test${path}`, init)
const save = (entry, revision = 0, headers = auth) => request(`/api/notes/${day}`, {method:'PUT',headers,body:JSON.stringify({entry,baseRevision:revision})})

before(async () => {
  const built = await build({entryPoints:['worker/index.ts'],bundle:true,format:'esm',platform:'browser',write:false})
  const options = convertV4MiniflareOptions({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-10-14',d1Databases:{DB:'notes-test'},ratelimits:{FEEDBACK_LIMITER:{namespace_id:'1004',simple:{limit:5,period:60}},SPEECH_LIMITER:{namespace_id:'1002',simple:{limit:5,period:60}}},bindings:{ALLOWED_ORIGINS:'http://127.0.0.1:5173',SUPABASE_URL:'https://auth.test',SUPABASE_PUBLISHABLE_KEY:'public-test'}})
  options.workers[0].dev={...options.workers[0].dev,outboundService:{type:'fetcher',handler:async request=>{
    const token=request.headers.get('Authorization')
    if(!['Bearer a.a.a','Bearer b.b.b','Bearer unconfirmed.test.token','Bearer unlisted.test.token'].includes(token))return new Response(null,{status:401})
    const other=token==='Bearer b.b.b'
    if(new URL(request.url).pathname==='/auth/v1/user')return Response.json({id:other?'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb':'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',email:other?'b@test.example':'a@test.example',email_confirmed_at:token==='Bearer unconfirmed.test.token'?null:'2026-10-01'})
    return Response.json(token==='Bearer unlisted.test.token'?[]:[{status:'approved'}])
  }}}
  mf = new Miniflare(options)
  db = await mf.getD1Database('DB')
  const sql = await readFile(new URL('../worker/migrations/0001_notes.sql', import.meta.url),'utf8')
  await db.prepare(sql).run()
  await db.prepare(await readFile(new URL('../worker/migrations/0002_feedback.sql',import.meta.url),'utf8')).run()
})
beforeEach(async () => {await db.prepare('DELETE FROM notes').run();await db.prepare('DELETE FROM feedback').run()})
after(async () => {await mf?.dispose()})

test('health confirms the running Worker can reach D1', async () => {
  const response = await request('/api/health')
  assert.equal(response.status,200)
  assert.deepEqual(await response.json(),{ok:true,service:'notes',storage:'D1'})
})
test('notes require a verified account session', async () => {
  assert.equal((await request('/api/notes')).status,401)
  assert.equal((await request('/api/notes',{headers:{Authorization:'Bearer short'}})).status,401)
})
test('save and reload preserve writing and all timestamps', async () => {
  const saved = await save(original)
  assert.equal(saved.status,200)
  assert.equal((await saved.json()).revision,1)
  const response = await request('/api/notes',{headers:auth})
  assert.equal(response.headers.get('cache-control'),'no-store')
  assert.deepEqual(await response.json(),{history:{[day]:original},revisions:{[day]:1}})
})
test('task ranges and checkbox completion round trip through cloud storage',async()=>{
 const task={...original,tasks:[{start:0,end:13,checked:false}]}
 assert.equal((await save(task)).status,200)
 const checked={...task,tasks:[{...task.tasks[0],checked:true}]}
 assert.equal((await save(checked,1)).status,200)
 const loaded=await (await request('/api/notes',{headers:auth})).json()
 assert.deepEqual(loaded.history[day].tasks,checked.tasks)
 assert.equal((await save({...checked,tasks:[{start:0,end:3,checked:true}]},2)).status,400)
 assert.equal((await save({...checked,tasks:[]},2)).status,200)
 assert.deepEqual((await (await request('/api/notes',{headers:auth})).json()).history[day].tasks,[])
})
test('different accounts cannot access or overwrite another account’s writing', async () => {
  await save(original)
  const otherAuth = {...auth,Authorization:`Bearer ${'b.b.b'}`}
  assert.deepEqual(await (await request('/api/notes',{headers:otherAuth})).json(),{history:{},revisions:{}})
  assert.equal((await save({...original,text:'Different browser'},0,otherAuth)).status,200)
  assert.deepEqual((await (await request('/api/notes',{headers:auth})).json()).history[day],original)
})
test('stale updates fail atomically and a retry of the same saved draft is safe', async () => {
  await save(original)
  assert.equal((await save(original,0)).status,200)
  const edited = {...original,text:'Edited writing'}
  assert.equal((await save(edited,0)).status,409)
  const updated = await save(edited,1)
  assert.equal((await updated.json()).revision,2)
  assert.equal((await save(edited,1)).status,200)
  assert.equal((await save(original,1)).status,409)
})
test('concurrent writers with the same base revision cannot silently replace each other', async () => {
  await save(original)
  const responses = await Promise.all([save({...original,text:'First thought\nVersion A'},1),save({...original,text:'First thought\nVersion B'},1)])
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409])
})
test('frontend CORS allows configured origins and rejects unconfigured ones', async () => {
  const allowed = await request('/api/notes',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:5173'}})
  assert.equal(allowed.status,204)
  assert.equal(allowed.headers.get('access-control-allow-origin'),'http://127.0.0.1:5173')
  assert.equal((await request('/api/notes',{headers:{...auth,Origin:'https://untrusted.example'}})).status,403)
})
test('invalid dates, invalid sessions, oversized bodies, and unknown endpoints are rejected', async () => {
  assert.equal((await request('/api/notes/2026-02-31',{method:'PUT',headers:auth,body:JSON.stringify({entry:original,baseRevision:0})})).status,400)
  assert.equal((await save({...original,sessions:[{...original.sessions[0],anchorOffset:999}]})).status,400)
  assert.equal((await save({...original,text:'x'.repeat(600000)})).status,413)
  assert.equal((await request('/unknown')).status,404)
})

test('bold and italic ranges survive cloud save and reload', async () => {
  const formatted = {...original, formats:[{start:0,end:5,marks:['bold']},{start:14,end:20,marks:['italic']}]}
  assert.equal((await save(formatted)).status,200)
  const loaded = await (await request('/api/notes',{headers:auth})).json()
  assert.deepEqual(loaded.history[day],formatted)
})

test('learning resources survive cloud save and reload', async () => {
  const note = { ...original, learningResources: [{ title: 'Learn React', url: 'https://react.dev/learn' }] }
  assert.equal((await save(note)).status, 200)
  const loaded = await (await request('/api/notes', { headers: auth })).json()
  assert.deepEqual(loaded.history[day], note)
})
test('refinement ranges and resources survive cloud save and reload',async()=>{
 const note={...original,refinedParagraphs:[{start:0,end:13,resources:[]},{start:14,end:28,resources:[]}]}
 // Derive exact nonempty paragraph boundaries from the fixture.
 note.refinedParagraphs=original.text.split('\n').reduce((all,text,index)=>{const start=index?all[index-1].end+1:0;all.push({start,end:start+text.length,resources:[]});return all},[])
 assert.equal((await save(note)).status,200)
 const loaded=await(await request('/api/notes',{headers:auth})).json()
 assert.deepEqual(loaded.history[day].refinedParagraphs,note.refinedParagraphs)
})

test('speech sessions require authentication and configured origins, reject wrong methods, and fail closed without a server key',async()=>{
 assert.equal((await request('/api/speech/session',{method:'POST'})).status,401)
 assert.equal((await request('/api/speech/session',{method:'POST',headers:{...auth,Origin:'https://evil.test'}})).status,403)
 assert.equal((await request('/api/speech/session',{headers:auth})).status,405)
 const response=await request('/api/speech/session',{method:'POST',headers:auth})
 assert.equal(response.status,503)
 assert.equal(response.headers.get('cache-control'),'no-store')
 assert.equal((await response.json()).error.includes('typing'),true)
})
test('speech session rate limiting rejects excessive starts before calling OpenAI',async()=>{
 const responses=[]
 for(let i=0;i<7;i++)responses.push((await request('/api/speech/session',{method:'POST',headers:auth})).status)
 assert.equal(responses.includes(429),true)
})
test('idle, running, and cleared task timers survive cloud save and reload',async()=>{
 let revision=0
 for(const timer of [{durationSeconds:1800,remainingMs:1800000},{durationSeconds:1800,remainingMs:1700000,endsAt:Date.now()+1700000},null]){
  const note={...original,tasks:[{start:0,end:13,checked:false,timer}]}
  assert.equal((await save(note,revision++)).status,200)
  const snapshot=await (await request('/api/notes',{headers:auth})).json()
  assert.deepEqual(snapshot.history[day].tasks,note.tasks)
 }
 assert.equal((await save({...original,tasks:[{start:0,end:13,checked:false,timer:{durationSeconds:0,remainingMs:0}}]},revision)).status,400)
})

test('the retired invite endpoint is unavailable for every method',async()=>{
 for(const method of ['GET','POST'])assert.equal((await request('/api/access/request',{method,headers:auth,...(method==='POST'?{body:JSON.stringify({email:'test@example.test'})}:{})})).status,404)
})

test('forged sessions cannot read, write, refine or request speech credentials',async()=>{
 const forged={...auth,Authorization:'Bearer forged.jwt.signature'}
 for(const [path,method] of [['/api/notes','GET'],[`/api/notes/${day}`,'PUT'],['/api/refine','POST'],['/api/speech/session','POST']]){
  const response=await request(path,{method,headers:forged,...(method!=='GET'?{body:JSON.stringify({entry:original,baseRevision:0,text:'note'})}:{})})
  assert.equal(response.status,401)
 }
 assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM notes').first()).count,0)
})
test('unconfirmed and unlisted accounts cannot read or write notes',async()=>{
 for(const token of ['unconfirmed.test.token','unlisted.test.token']){
  const blocked={...auth,Authorization:`Bearer ${token}`}
  assert.equal((await request('/api/notes',{headers:blocked})).status,403)
  assert.equal((await save(original,0,blocked)).status,403)
 }
 assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM notes').first()).count,0)
})
test('client-supplied owner IDs cannot select or overwrite another account',async()=>{
 await save(original)
 const other={...auth,Authorization:'Bearer b.b.b'}
 const rows=await db.prepare('SELECT owner_id FROM notes').all()
 const victimOwner=rows.results[0].owner_id
 const loaded=await request(`/api/notes?owner_id=${victimOwner}&user_id=aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa`,{headers:other})
 assert.deepEqual(await loaded.json(),{history:{},revisions:{}})
 const payload={entry:{...original,text:'Attacker writing',owner_id:victimOwner,user_id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'},owner_id:victimOwner,user_id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',baseRevision:1}
 const put=()=>request(`/api/notes/${day}?owner_id=${victimOwner}`,{method:'PUT',headers:other,body:JSON.stringify(payload)})
 assert.equal((await put()).status,409)
 payload.baseRevision=0
 assert.equal((await put()).status,200)
 assert.deepEqual((await(await request('/api/notes',{headers:auth})).json()).history[day],original)
 const attacker=(await(await request('/api/notes',{headers:other})).json()).history[day]
 assert.equal(attacker.text,'Attacker writing');assert.equal(attacker.owner_id,undefined);assert.equal(attacker.user_id,undefined)
 const owners=await db.prepare('SELECT owner_id FROM notes').all()
 assert.equal(new Set(owners.results.map(r=>r.owner_id)).size,2)
})

test('feedback validates input, requires approval, associates the verified account and retries without duplication',async()=>{
 const id=crypto.randomUUID(),other={...auth,Authorization:'Bearer b.b.b'}
 const submit=(body,headers=auth)=>request('/api/feedback',{method:'POST',headers,body:JSON.stringify(body)})
 assert.equal((await submit({id,message:'Feedback'},{'Content-Type':'application/json'})).status,401)
 assert.equal((await submit({id,message:'Feedback'},{...auth,Authorization:'Bearer unlisted.test.token'})).status,403)
 assert.equal((await request('/api/feedback',{headers:auth})).status,405)
 for(const body of [{},{id,message:'   '},{id:'bad',message:'test'},{id,message:123}])assert.equal((await submit(body)).status,400)
 assert.equal((await submit({id,message:'x'.repeat(2001)})).status,413)
 assert.equal((await submit({id,message:'  Make search easier.  ',owner_id:'forged-owner',user_id:'forged-user'})).status,201)
 const saved=await db.prepare('SELECT * FROM feedback').all()
 assert.equal(saved.results.length,1)
 const row=saved.results[0]
 assert.equal(row.message,'Make search easier.');assert.match(row.owner_id,/^[a-f0-9]{64}$/);assert.ok(Date.parse(row.created_at))
 assert.equal((await submit({id,message:'Make search easier.'})).status,201)
 assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM feedback').first()).count,1)
 assert.equal((await submit({id,message:'Different text'})).status,409)
 assert.equal((await submit({id,message:'Other user feedback',owner_id:row.owner_id},other)).status,201)
 const rows=await db.prepare('SELECT * FROM feedback').all()
 assert.equal(rows.results.length,2);assert.equal(new Set(rows.results.map(r=>r.owner_id)).size,2)
 assert.equal(rows.results.find(r=>r.owner_id===row.owner_id).message,row.message)
 assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM notes').first()).count,0)
})
test('feedback rate limiting rejects excessive submissions',async()=>{
 const responses=[]
 for(let i=0;i<7;i++)responses.push((await request('/api/feedback',{method:'POST',headers:auth,body:JSON.stringify({id:crypto.randomUUID(),message:'Test feedback'})})).status)
 assert.ok(responses.includes(429))
})
