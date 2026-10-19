import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const built=await build({stdin:{contents:"export * from './worker/auth';export * from './src/accountStorage';",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',write:false})
const {accountAccess,approvedOwner,normalizeEmail,accountStorage}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const env={SUPABASE_URL:'https://auth.test',SUPABASE_PUBLISHABLE_KEY:'publishable'}
const user={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',email:'a@example.test',email_confirmed_at:'2026-10-01'}
const auth='Bearer session.access.token'
const fetcher=(status='approved',account=user)=>async url=>Response.json(url.includes('/auth/v1/user')?account:[{status}])
test('account authorization validates Auth and the live approval table, ignoring editable metadata',async()=>{
 assert.equal((await accountAccess(auth,env,fetcher())).approved,true)
 assert.equal((await accountAccess(auth,env,fetcher('pending'))).approved,false)
 for(const status of ['pending','rejected'])await assert.rejects(approvedOwner(auth,env,fetcher(status,{...user,user_metadata:{approved:true}})),e=>e.status===403)
 await assert.rejects(approvedOwner(auth,env,async()=>new Response('',{status:401})),e=>e.status===401)
 await assert.rejects(approvedOwner(auth,env,fetcher('approved',{...user,email_confirmed_at:null})),e=>e.status===403)
 await assert.rejects(approvedOwner(auth,env,async()=>{throw new Error('secret details')}),e=>e.status===503&&!e.message.includes('secret'))
})
test('old browser keys and missing sessions are rejected before any network call',async()=>{
 for(const header of [null,'Bearer short',`Bearer ${'a'.repeat(64)}`])await assert.rejects(approvedOwner(header,env,async()=>assert.fail('unexpected request')),e=>e.status===401)
})
test('ownership is stable per verified user and separate between accounts',async()=>{
 const a=await approvedOwner(auth,env,fetcher())
 assert.match(a,/^[a-f0-9]{64}$/)
 assert.equal(await approvedOwner('Bearer refreshed.access.token',env,fetcher()),a)
 assert.notEqual(await approvedOwner(auth,env,fetcher('approved',{...user,id:'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb'})),a)
})
test('email validation normalizes manually managed addresses and rejects invalid input',()=>{
 assert.equal(normalizeEmail(' A@Example.test '),'a@example.test')
 for(const input of [null,'not an email','a@b','a\nb@example.test'])assert.throws(()=>normalizeEmail(input),e=>e.status===400)
})
test('account storage isolates drafts, revisions and backups and preserves anonymous drafts',()=>{
 const map=new Map([['notes.writing.v1','anonymous']])
 const storage={get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),clear:()=>map.clear()}
 const a=accountStorage(storage,user.id), b=accountStorage(storage,'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb')
 for(const key of ['notes.writing.v1','revisions','backups'])a.setItem(key,'draft A')
 assert.equal(b.getItem('notes.writing.v1'),null)
 b.setItem('notes.writing.v1','draft B')
 assert.equal(accountStorage(storage,user.id).getItem('notes.writing.v1'),'draft A')
 assert.equal(a.length,3);assert.equal(a.key(0),'notes.writing.v1')
 a.clear()
 assert.equal(a.length,0);assert.equal(b.getItem('notes.writing.v1'),'draft B');assert.equal(storage.getItem('notes.writing.v1'),'anonymous')
})
