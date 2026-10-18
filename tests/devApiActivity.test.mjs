import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'

async function load(dev) {
 const built=await build({entryPoints:['src/apiActivityStore.ts'],bundle:true,format:'esm',platform:'browser',write:false,define:{'import.meta.env.DEV':JSON.stringify(dev),'import.meta.hot':'undefined'}})
 return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
}
const dev=await load(true),production=await load(false)
const built=await build({entryPoints:['server/openaiDiagnostics.ts'],bundle:true,format:'esm',platform:'node',write:false})
const {openaiDiagnostics}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const completed=(text,usage=123)=>({usage:{total_tokens:usage},output:[{type:'reasoning',content:[{type:'output_text',text:'hidden'}]},{type:'message',content:[{type:'output_text',text}]}]})

test('only the latest OpenAI call is kept, ignoring cloud calls and late older responses',()=>{
 assert.equal(dev.getApiActivity(),null)
 dev.recordApiActivity({id:'cloud',label:'Cloud · Save notes',state:'pending'})
 assert.equal(dev.getApiActivity(),null)
 dev.recordApiActivity({id:'first',label:'OpenAI · Refine',state:'pending'})
 dev.recordApiActivity({id:'second',label:'OpenAI · Refine',state:'pending'})
 dev.recordApiActivity({id:'first',label:'OpenAI · Refine',state:'success',tokens:10,response:'Old response'})
 assert.equal(dev.getApiActivity().id,'second')
 dev.recordApiActivity({id:'second',label:'OpenAI · Refine',state:'success',tokens:123,response:'Clear note.'})
 assert.equal(dev.getApiActivity().tokens,123)
 assert.equal(dev.getApiActivity().response,'Clear note.')
})
test('structured answers are readable and use actual token totals',()=>{
 assert.deepEqual(openaiDiagnostics(completed(JSON.stringify({paragraphs:[{id:'a',text:'Drive for Uber for four hours.',isTodo:true}]}),456)),{tokens:456,response:'Drive for Uber for four hours.'})
 assert.deepEqual(openaiDiagnostics(completed(JSON.stringify({text:'Learn React'}))),{tokens:123,response:'Learn React'})
 assert.deepEqual(openaiDiagnostics(completed('React documentation\nA useful course')),{tokens:123,response:'React documentation A useful course'})
 assert.equal(openaiDiagnostics(completed('x'.repeat(1000))).response.length,500)
})
test('missing or invalid token usage is never replaced with an estimated or zero count',()=>{
 for(const usage of [undefined,-1,'123',1.5])assert.deepEqual(openaiDiagnostics({...completed('Answer'),usage:{total_tokens:usage}}),{response:'Answer'})
 assert.deepEqual(openaiDiagnostics(completed('Answer',0)),{tokens:0,response:'Answer'})
 assert.deepEqual(openaiDiagnostics({error:{message:'private provider error'}}),{})
 assert.deepEqual(openaiDiagnostics(null),{})
})
test('production stores no call details and sends no diagnostic headers',()=>{
 assert.deepEqual(production.devApiHeaders(),{})
 production.recordApiActivity({id:'ignored',label:'OpenAI · Refine',state:'pending'})
 assert.equal(production.getApiActivity(),null)
 assert.match(dev.devApiHeaders()['X-Notes-Dev-Client'],/^[a-f0-9-]{36}$/)
})
