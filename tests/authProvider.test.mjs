import test,{after,afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://notes.test'})
for(const key of ['window','document','navigator'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const NativeMessageChannel=globalThis.MessageChannel,channels=[]
globalThis.MessageChannel=class extends NativeMessageChannel{constructor(){super();channels.push(this)}}
const built=await build({stdin:{contents:`export {createElement,act} from 'react';export {createRoot} from 'react-dom/client';export {AuthProvider} from './src/AuthProvider';export {useAuth} from './src/authContext';export {fixture} from 'fixture-auth';`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',jsx:'automatic',write:false,define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'auth-fixture',setup(b){
 b.onResolve({filter:/^(\.\/authClient|fixture-auth)$/},()=>({path:'auth-fixture',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`export const fixture={session:null,callback:null};export const API_BASE='https://notes.test';export function getSupabase(){return {auth:{onAuthStateChange(callback){fixture.callback=callback;return {data:{subscription:{unsubscribe(){fixture.callback=null}}}}},async getSession(){return {data:{session:fixture.session},error:null}}}}}`}))
}}]})
const {createElement,act,createRoot,AuthProvider,useAuth,fixture}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const a='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb'
let root,host
const session=(id,token)=>({access_token:token,user:{id}})
function View(){const auth=useAuth();return createElement('div',{'data-status':auth.status},auth.error)}
async function mount(){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(AuthProvider,null,createElement(View)));await Promise.resolve()})}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove();root=null;fixture.session=null})
after(()=>{dom.window.close();channels.forEach(c=>{c.port1.close();c.port2.close()});globalThis.MessageChannel=NativeMessageChannel})
test('server identity mismatch cannot open another account’s cached drafts',async t=>{
 fixture.session=session(a,'token-for-b')
 t.mock.method(globalThis,'fetch',async()=>Response.json({account:{id:b},approved:true}))
 await mount()
 assert.equal(host.firstChild.dataset.status,'error')
 assert.match(host.textContent,/account changed/)
})
test('matching approved identity opens notes while an unlisted identity stays blocked',async t=>{
 fixture.session=session(a,'token-for-a')
 let approved=true
 t.mock.method(globalThis,'fetch',async()=>Response.json({account:{id:a},approved}))
 await mount()
 assert.equal(host.firstChild.dataset.status,'approved')
 approved=false
 await act(async()=>{fixture.callback('TOKEN_REFRESHED',session(a,'refreshed-token'));await Promise.resolve()})
 assert.equal(host.firstChild.dataset.status,'pending')
})
test('a late approval from the previous account cannot authorize the next account',async t=>{
 fixture.session=session(a,'token-a')
 let finishA
 t.mock.method(globalThis,'fetch',async(_url,init)=>init.headers.Authorization==='Bearer token-a'?new Promise(resolve=>{finishA=resolve}):Response.json({account:{id:b},approved:false}))
 await mount()
 await act(async()=>{fixture.callback('SIGNED_IN',session(b,'token-b'));await Promise.resolve()})
 assert.equal(host.firstChild.dataset.status,'pending')
 await act(async()=>{finishA(Response.json({account:{id:a},approved:true}));await Promise.resolve()})
 assert.equal(host.firstChild.dataset.status,'pending')
})
