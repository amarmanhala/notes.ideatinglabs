import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const built=await build({stdin:{contents:"export * from './src/welcomeState';export * from './src/accountStorage';",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',write:false})
const {WelcomeSync,readWelcome,WELCOME_KEY,accountStorage}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
function storage(){const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()}}
test('showing the welcome marks it seen without inventing or changing a name',async()=>{
 const local=storage(),calls=[],sync=new WelcomeSync(local,async data=>{calls.push(data)})
 sync.mark();assert.equal(readWelcome(local).seen,true)
 await sync.flush()
 assert.deepEqual(calls,[{notes_welcome_seen:true}]);assert.equal(readWelcome(local).pending,false)
 assert.equal(new WelcomeSync(local,async()=>{}).record.seen,true)
})
test('skipping persists an empty name and never creates note content',async()=>{
 const local=storage(),calls=[],sync=new WelcomeSync(local,async data=>calls.push(data))
 sync.mark('   ');await sync.flush()
 assert.deepEqual(calls,[{notes_welcome_seen:true,full_name:''}])
 assert.equal(readWelcome(local).name,'');assert.equal(local.getItem('notes.writing.v1'),null)
})
test('a name entered during the initial save is queued and cannot be lost',async()=>{
 const local=storage(),calls=[]
 let finish
 const sync=new WelcomeSync(local,async data=>{calls.push(data);if(calls.length===1)await new Promise(resolve=>{finish=resolve})})
 sync.mark();sync.mark('  Taylor  ');finish();await sync.flush()
 assert.deepEqual(calls,[{notes_welcome_seen:true},{notes_welcome_seen:true,full_name:'Taylor'}])
 assert.deepEqual(readWelcome(local),{seen:true,pending:false,name:'Taylor'})
})
test('offline completion stays seen and retries its name on a later visit',async()=>{
 const local=storage(),sync=new WelcomeSync(local,async()=>{throw new Error('Offline')})
 sync.mark('Sam');await sync.flush()
 assert.deepEqual(readWelcome(local),{seen:true,pending:true,name:'Sam'})
 const calls=[],retry=new WelcomeSync(local,async data=>calls.push(data))
 await retry.flush()
 assert.deepEqual(calls,[{notes_welcome_seen:true,full_name:'Sam'}]);assert.equal(readWelcome(local).pending,false)
})
test('welcome state is isolated between accounts and malformed storage fails safely',async()=>{
 const local=storage(),a=accountStorage(local,'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'),b=accountStorage(local,'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb')
 const sync=new WelcomeSync(a,async()=>{})
 sync.mark('Alex');await sync.flush()
 assert.equal(readWelcome(b),null)
 b.setItem(WELCOME_KEY,'broken json');assert.equal(readWelcome(b),null)
})
test('unavailable browser storage does not prevent saving the welcome to the account',async()=>{
 const broken={getItem(){throw new Error()},setItem(){throw new Error()}},calls=[],sync=new WelcomeSync(broken,async data=>calls.push(data))
 sync.mark('A'.repeat(80));await sync.flush()
 assert.equal(calls[0].full_name.length,60);assert.equal(sync.record.seen,true);assert.equal(sync.record.pending,false)
})
