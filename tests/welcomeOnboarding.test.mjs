import test,{after,afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://notes.test',pretendToBeVisual:true})
for(const key of ['window','document','navigator','HTMLElement','Event','getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])Object.defineProperty(globalThis,key,{value:['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key)?dom.window[key].bind(dom.window):dom.window[key],configurable:true})
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const NativeMessageChannel=globalThis.MessageChannel,channels=[]
globalThis.MessageChannel=class extends NativeMessageChannel{constructor(){super();channels.push(this)}}
const built=await build({stdin:{contents:`export {createElement,act} from 'react';export {createRoot} from 'react-dom/client';export {WelcomeOnboarding} from './src/WelcomeOnboarding';export {WELCOME_KEY} from './src/welcomeState';export {fixture} from 'fixture-auth';`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',jsx:'automatic',write:false,define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){
 b.onLoad({filter:/\.css$/},()=>({contents:'export default {}',loader:'js'}))
 b.onResolve({filter:/^(\.\/authClient|fixture-auth)$/},()=>({path:'auth',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`export const fixture={calls:[],userId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',offline:false};export async function getAccessToken(id){if(id!==fixture.userId||fixture.offline)throw Error('Unavailable');return 'test-token'};export function getSupabase(){return {auth:{async updateUser({data}){fixture.calls.push(data);return {data:{user:{id:fixture.userId}},error:null}}}}}`}))
}}]})
const {createElement,act,createRoot,WelcomeOnboarding,WELCOME_KEY,fixture}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
let root,host
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}}
const settle=()=>new Promise(resolve=>setTimeout(resolve,20))
async function mount(local,profile={},onFinish=()=>{},children){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>{root.render(createElement(WelcomeOnboarding,{userId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',profile,storage:local,onFinish},children));await settle()})}
async function unmount(){if(root)await act(async()=>root.unmount());host?.remove();root=null}
async function click(text){await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent===text).click();await settle()})}
afterEach(async()=>{await unmount();fixture.calls=[];fixture.offline=false})
after(()=>{dom.window.close();channels.forEach(c=>{c.port1.close();c.port2.close()});globalThis.MessageChannel=NativeMessageChannel})
test('optional name shows a personalized greeting and never prompts again on this browser',async()=>{
 const local=storage();let finished=0
 await mount(local,{},()=>finished++)
 assert.ok(host.querySelector('section[aria-label="Welcome"]'));assert.equal(host.querySelector('dialog'),null)
 const input=host.querySelector('input')
 assert.equal(input.required,false)
 await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Taylor');input.dispatchEvent(new Event('input',{bubbles:true}));await settle()})
 await act(async()=>{host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await settle()})
 assert.match(host.textContent,/Let’s gather your thoughts, Taylor/)
 assert.deepEqual(fixture.calls.at(-1),{notes_welcome_seen:true,full_name:'Taylor'})
 await click('Start writing');assert.equal(host.querySelector('section[aria-label="Welcome"]'),null)
 await act(settle);assert.equal(finished,1)
 await unmount();await mount(local)
 assert.equal(host.querySelector('section[aria-label="Welcome"]'),null)
})
test('Skip saves an empty name, shows a greeting and does not ask on a new device',async()=>{
 const local=storage()
 await mount(local);await click('Skip')
 assert.match(host.textContent,/Let’s gather your thoughts/)
 assert.deepEqual(fixture.calls.at(-1),{notes_welcome_seen:true,full_name:''})
 await unmount();await mount(storage(),{notes_welcome_seen:true,full_name:''})
 assert.equal(host.querySelector('section[aria-label="Welcome"]'),null)
})
test('Escape dismisses once without requiring a name or changing notes',async()=>{
 const local=storage();await mount(local)
 await act(async()=>{host.querySelector('section').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await settle()})
 assert.equal(host.querySelector('section[aria-label="Welcome"]'),null)
 assert.deepEqual(fixture.calls,[{notes_welcome_seen:true}])
 assert.equal(local.getItem('notes.writing.v1'),null)
 await unmount();await mount(local);assert.equal(host.querySelector('section[aria-label="Welcome"]'),null)
})
test('offline skip remains dismissed and syncs its empty name when the connection returns',async()=>{
 const local=storage();fixture.offline=true
 await mount(local);await click('Skip');await click('Start writing')
 assert.equal(JSON.parse(local.getItem(WELCOME_KEY)).pending,true)
 fixture.offline=false
 await act(async()=>{window.dispatchEvent(new Event('online'));await settle()})
 assert.deepEqual(fixture.calls.at(-1),{notes_welcome_seen:true,full_name:''})
 assert.equal(JSON.parse(local.getItem(WELCOME_KEY)).pending,false)
 assert.equal(host.querySelector('section[aria-label="Welcome"]'),null)
})

test('the same editor stays mounted and its draft is preserved through the inline welcome',async()=>{
 const local=storage()
 await mount(local,{},()=>{},createElement('textarea',{'aria-label':'Existing draft',defaultValue:'Keep my notes'}))
 const editor=host.querySelector('textarea')
 assert.ok(editor.closest('[hidden]'));assert.ok(editor.closest('[inert]'))
 await click('Skip');await click('Start writing')
 assert.equal(host.querySelector('textarea'),editor)
 assert.equal(editor.value,'Keep my notes')
 assert.equal(editor.closest('[hidden]'),null);assert.equal(editor.closest('[inert]'),null)
})
