import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const built = await build({entryPoints:['src/cloudSync.ts'],bundle:true,format:'esm',platform:'browser',write:false})
const {reconcile,NotesSync,CloudError,createCloudApi} = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const entry = text => ({text,createdAt:'2026-10-14T14:00:00.000Z',updatedAt:'2026-10-14T14:00:00.000Z',sessions:[{id:'one',startedAt:'2026-10-14T14:00:00.000Z',lastEditedAt:'2026-10-14T14:00:00.000Z',anchorOffset:0}]})
const day='2026-10-14'
const local=entry('Local')
const remote=entry('Cloud')

test('existing browser writing is queued for its first cloud import',()=>{
  const result=reconcile({[day]:local},{},{history:{},revisions:{}})
  assert.deepEqual(result.history,{[day]:local})
  assert.equal(result.pending.has(day),true)
})
test('a clean local note adopts a newer cloud revision',()=>{
  const result=reconcile({[day]:local},{[day]:{entry:local,revision:1}},{history:{[day]:remote},revisions:{[day]:2}})
  assert.deepEqual(result.history[day],remote)
  assert.equal(result.bases[day].revision,2)
})
test('an older cloud backend cannot strip learning links from identical local text',()=>{
  const resources=[{title:'Learn React',url:'https://react.dev/learn'}]
  const withLinks={...entry('Learn React'),learningResources:resources}
  const result=reconcile({[day]:withLinks},{[day]:{entry:withLinks,revision:1}},{history:{[day]:entry('Learn React')},revisions:{[day]:1}})
  assert.deepEqual(result.history[day].learningResources,resources)
  assert.equal(result.conflicts.size,0)
  const changed=reconcile({[day]:withLinks},{[day]:{entry:withLinks,revision:1}},{history:{[day]:entry('Learn cooking')},revisions:{[day]:2}})
  assert.equal(changed.history[day].learningResources,undefined)
})
test('refinement metadata survives an older cloud backend and adopts updated metadata',()=>{
 const done={...entry('Clear note'),refinedParagraphs:[{start:0,end:10,resources:[]}]}
 const original={...done};delete original.refinedParagraphs
 const preserved=reconcile({[day]:done},{[day]:{entry:done,revision:1}},{history:{[day]:original},revisions:{[day]:1}})
 assert.deepEqual(preserved.history[day].refinedParagraphs,done.refinedParagraphs)
 assert.equal(preserved.conflicts.size,0)
 const adopted=reconcile({[day]:original},{[day]:{entry:original,revision:1}},{history:{[day]:done},revisions:{[day]:2}})
 assert.deepEqual(adopted.history[day].refinedParagraphs,done.refinedParagraphs)
})
test('unsynced edits survive hydration and do not replace a divergent cloud note',()=>{
  const result=reconcile({[day]:local},{[day]:{entry:entry('Original'),revision:1}},{history:{[day]:remote},revisions:{[day]:2}})
  assert.deepEqual(result.history[day],local)
  assert.equal(result.conflicts.has(day),true)
  assert.equal(result.pending.size,0)
})
test('unsynced local changes can save against an unchanged cloud base',()=>{
  const base=entry('Original')
  const result=reconcile({[day]:local},{[day]:{entry:base,revision:1}},{history:{[day]:base},revisions:{[day]:1}})
  assert.equal(result.pending.has(day),true)
  assert.equal(result.conflicts.size,0)
})
test('cloud-only writing is restored into the browser',()=>{
  const result=reconcile({}, {}, {history:{[day]:remote},revisions:{[day]:1}})
  assert.deepEqual(result.history[day],remote)
})
test('a lost save response reconciles as saved when the cloud contains the draft',()=>{
  const result=reconcile({[day]:local},{},{history:{[day]:local},revisions:{[day]:3}})
  assert.equal(result.pending.size,0)
  assert.equal(result.bases[day].revision,3)
})
test('edits made while cloud loading stay queued and are saved',async()=>{
  let finishLoad
  const loading=new Promise(resolve=>{finishLoad=resolve})
  const saved=[]
  const status=[]
  const engine=new NotesSync({history:{},bases:{},api:{load:()=>loading,save:async(day,entry,revision)=>{saved.push({day,entry,revision});return 1}},persist:()=>{},onHistory:()=>{},onStatus:value=>status.push(value)})
  const startup=engine.start()
  engine.update({[day]:local},day)
  finishLoad({history:{},revisions:{}})
  await startup
  assert.deepEqual(saved,[{day,entry:local,revision:0}])
  assert.equal(status.at(-1),'saved')
  engine.stop()
})
test('typing during a save sends the newest draft after the first acknowledgement',async()=>{
  let finishSave
  let engine
  let calls=0
  const saved=[]
  engine=new NotesSync({history:{[day]:local},bases:{},api:{load:async()=>({history:{},revisions:{}}),save:async(_day,entry)=>{saved.push(entry);calls++;if(calls===1)return new Promise(resolve=>{finishSave=resolve});return 2}},persist:()=>{},onHistory:()=>{},onStatus:()=>{}})
  const startup=engine.start()
  while(!finishSave)await new Promise(resolve=>setImmediate(resolve))
  engine.update({[day]:remote},day)
  finishSave(1)
  await startup
  assert.deepEqual(saved,[local,remote])
  engine.stop()
})
test('offline startup can retry and import the local draft',async()=>{
  let online=false
  const saved=[]
  const statuses=[]
  const engine=new NotesSync({history:{[day]:local},bases:{},api:{load:async()=>{if(!online)throw new TypeError('Offline');return {history:{},revisions:{}}},save:async(_day,entry)=>{saved.push(entry);return 1}},persist:()=>{},onHistory:()=>{},onStatus:value=>statuses.push(value)})
  await engine.start()
  assert.equal(statuses.at(-1),'offline')
  online=true
  await engine.retry()
  assert.deepEqual(saved,[local])
  assert.equal(statuses.at(-1),'saved')
  engine.stop()
})
test('revision conflicts retain the local draft and stop unsafe retries',async()=>{
  let calls=0
  const statuses=[]
  const engine=new NotesSync({history:{[day]:local},bases:{},api:{load:async()=>({history:calls?{[day]:remote}:{},revisions:calls?{[day]:1}:{}}),save:async()=>{calls++;throw new CloudError(409,'Conflict')}},persist:()=>{},onHistory:()=>{},onStatus:value=>statuses.push(value)})
  await engine.start()
  await engine.retry()
  assert.equal(calls,1)
  assert.equal(statuses.at(-1),'conflict')
  engine.stop()
})
test('cloud adapter sends private credentials in headers and validates loaded entries',async()=>{
  let captured
  const api=createCloudApi('https://notes.test','a'.repeat(64),new AbortController().signal,async(url,init)=>{captured={url,init};return Response.json({history:{[day]:local},revisions:{[day]:1}})})
  assert.deepEqual((await api.load()).history[day],local)
  assert.equal(captured.url,'https://notes.test/api/notes')
  assert.equal(captured.init.headers.Authorization,`Bearer ${'a'.repeat(64)}`)
  assert.equal(captured.url.includes('Bearer'),false)
})

test('identical writing with different capture metadata merges sessions without a conflict',()=>{
 const draft={...local,updatedAt:'2026-10-14T15:00:00.000Z',sessions:[...local.sessions,{id:'local',startedAt:'2026-10-14T15:00:00.000Z',lastEditedAt:'2026-10-14T15:00:00.000Z',anchorOffset:0}]}
 const cloud={...local,sessions:[...local.sessions,{id:'cloud',startedAt:'2026-10-14T14:30:00.000Z',lastEditedAt:'2026-10-14T14:30:00.000Z',anchorOffset:0}]}
 const merged=reconcile({[day]:draft},{},{history:{[day]:cloud},revisions:{[day]:7}})
 assert.equal(merged.conflicts.size,0)
 assert.deepEqual(new Set(merged.history[day].sessions.map(s=>s.id)),new Set(['one','local','cloud']))
 assert.equal(merged.pending.has(day),true)
 assert.equal(merged.bases[day].revision,7)
})
test('different checkbox states remain a real conflict even when the text matches',()=>{
 const a={...entry('Buy milk'),tasks:[{start:0,end:8,checked:false}]}
 const b={...a,tasks:[{start:0,end:8,checked:true}]}
 assert.equal(reconcile({[day]:a},{},{history:{[day]:b},revisions:{[day]:2}}).conflicts.has(day),true)
})
function conflictFixture(overrides={}){
 const backups=[],saved=[],statuses=[],published=[]
 let cloud={history:{[day]:remote},revisions:{[day]:7}}
 const engine=new NotesSync({history:{[day]:local},bases:{},api:{load:async()=>cloud,save:async(day,entry,revision)=>{saved.push({day,entry,revision});return 8}},persist:()=>{},onHistory:()=>{},onStatus:state=>statuses.push(state),onConflicts:conflicts=>published.push(conflicts),backupConflict:conflict=>backups.push(conflict),...overrides})
 return {engine,backups,saved,statuses,published,setCloud:value=>{cloud=value}}
}
test('retry reloads conflicting notes and clears a conflict if the cloud now matches',async()=>{
 const f=conflictFixture();await f.engine.start()
 assert.equal(f.statuses.at(-1),'conflict')
 f.setCloud({history:{[day]:local},revisions:{[day]:8}})
 await f.engine.retry()
 assert.equal(f.statuses.at(-1),'saved');assert.deepEqual(f.published.at(-1),[])
 assert.equal(f.saved.length,0);f.engine.stop()
})
test('keeping the draft backs up both versions before saving against the reviewed cloud revision',async()=>{
 const f=conflictFixture();await f.engine.start()
 const conflict=f.published.at(-1)[0]
 await f.engine.resolve(conflict,'local')
 assert.deepEqual(f.backups,[conflict])
 assert.deepEqual(f.saved,[{day,entry:local,revision:7}])
 assert.equal(f.statuses.at(-1),'saved');assert.deepEqual(f.published.at(-1),[]);f.engine.stop()
})
test('using the cloud version backs up both copies and never uploads the discarded draft',async()=>{
 const histories=[]
 const f=conflictFixture({onHistory:h=>histories.push(h)});await f.engine.start()
 const conflict=f.published.at(-1)[0]
 await f.engine.resolve(conflict,'cloud')
 assert.deepEqual(f.backups,[conflict]);assert.equal(f.saved.length,0)
 assert.deepEqual(histories.at(-1)[day],remote);assert.equal(f.statuses.at(-1),'saved');f.engine.stop()
})
test('new writing or a newer cloud revision invalidates a stale choice before any backup or overwrite',async()=>{
 const f=conflictFixture();await f.engine.start()
 const old=f.published.at(-1)[0]
 f.engine.update({[day]:entry('Newer writing')},day)
 await assert.rejects(f.engine.resolve(old,'cloud'),/versions changed/)
 assert.equal(f.backups.length,0);assert.equal(f.saved.length,0)
 const current=f.published.at(-1)[0]
 f.setCloud({history:{[day]:entry('New cloud version')},revisions:{[day]:9}})
 await assert.rejects(f.engine.resolve(current,'local'),/versions changed/)
 assert.equal(f.backups.length,0);assert.equal(f.saved.length,0);f.engine.stop()
})
test('backup failure or an offline preflight cannot overwrite either version',async()=>{
 const f=conflictFixture({backupConflict:()=>{throw new Error('Storage full')}});await f.engine.start()
 const conflict=f.published.at(-1)[0]
 await assert.rejects(f.engine.resolve(conflict,'local'),/Storage full/)
 assert.equal(f.saved.length,0);assert.equal(f.statuses.at(-1),'conflict');f.engine.stop()
 let online=true
 const g=conflictFixture({api:{load:async()=>{if(!online)throw new TypeError('Offline');return {history:{[day]:remote},revisions:{[day]:7}}},save:async()=>assert.fail('must not save')}})
 await g.engine.start();const other=g.published.at(-1)[0];online=false
 await assert.rejects(g.engine.resolve(other,'cloud'),/Unable to check/)
 assert.equal(g.backups.length,0);g.engine.stop()
})
test('a new cloud write during resolution is protected by revision checks',async()=>{
 const f=conflictFixture({api:{load:async()=>({history:{[day]:remote},revisions:{[day]:7}}),save:async()=>{throw new CloudError(409,'Conflict')}}})
 await f.engine.start();const conflict=f.published.at(-1)[0]
 await assert.rejects(f.engine.resolve(conflict,'local'),/changed again/)
 assert.deepEqual(f.backups,[conflict]);assert.equal(f.statuses.at(-1),'conflict');f.engine.stop()
})

test('sign-out while retrieving a credential prevents a late account request',async()=>{
 const lifecycle=new AbortController()
 let finishToken
 let calls=0
 const api=createCloudApi('https://notes.test',()=>new Promise(resolve=>{finishToken=resolve}),lifecycle.signal,async()=>{calls++;return Response.json({history:{},revisions:{}})})
 const loading=api.load()
 lifecycle.abort();finishToken('old-account-token')
 await assert.rejects(loading,error=>error.name==='AbortError')
 assert.equal(calls,0)
})
test('a stopped account sync ignores a late cloud history response',async()=>{
 let finishLoad
 let published=0,persisted=0,saved=0
 const engine=new NotesSync({history:{},bases:{},api:{load:()=>new Promise(resolve=>{finishLoad=resolve}),save:async()=>{saved++;return 1}},persist:()=>persisted++,onHistory:()=>published++,onStatus:()=>{}})
 const loading=engine.start()
 engine.stop();finishLoad({history:{[day]:entry('Other account history')},revisions:{[day]:1}})
 await loading
 assert.equal(published,0);assert.equal(persisted,0);assert.equal(saved,0)
})
