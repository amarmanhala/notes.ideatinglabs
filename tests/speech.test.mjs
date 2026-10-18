import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const built=await build({stdin:{contents:"export {createSpeechSession} from './worker/speech'; export {TranscriptBuffer,SpeechTranscription} from './src/speechTranscription';",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',write:false,define:{'import.meta.env':JSON.stringify({DEV:false,VITE_API_BASE_URL:''})}})
const {createSpeechSession,TranscriptBuffer,SpeechTranscription}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)

test('speech endpoint issues transcription-only short-lived credentials and strips upstream fields',async()=>{
 let config,headers
 const result=await createSpeechSession('private-server-key','hashed-owner',async(_url,init)=>{
  config=JSON.parse(init.body);headers=init.headers
  return Response.json({value:'ephemeral',expires_at:123,session:{private:'never return'}})
 })
 assert.deepEqual(result,{value:'ephemeral',expires_at:123})
 assert.equal(headers.Authorization,'Bearer private-server-key')
 assert.equal(headers['OpenAI-Safety-Identifier'],'hashed-owner')
 assert.equal(config.session.type,'transcription')
 assert.equal(config.session.audio.input.transcription.model,'gpt-4o-mini-transcribe')
 assert.equal(config.session.audio.input.transcription.language,undefined)
 assert.equal(config.expires_after.seconds,60)
})
test('speech configuration, upstream errors and incomplete credentials fail safely',async()=>{
 await assert.rejects(createSpeechSession(undefined,'owner'),e=>e.status===503)
 await assert.rejects(createSpeechSession('key','owner',async()=>new Response('private upstream error',{status:401})),e=>e.status===502&&!e.message.includes('private'))
 await assert.rejects(createSpeechSession('key','owner',async()=>new Response('',{status:429})),e=>e.status===429)
 await assert.rejects(createSpeechSession('key','owner',async()=>Response.json({value:123})),e=>e.status===502)
})
test('transcript buffer orders out-of-order turns and replaces partial wording once',()=>{
 const b=new TranscriptBuffer()
 b.receive({type:'conversation.item.input_audio_transcription.delta',item_id:'two',delta:'wrong'})
 b.receive({type:'input_audio_buffer.committed',item_id:'two',previous_item_id:'one'})
 b.receive({type:'input_audio_buffer.committed',item_id:'one',previous_item_id:null})
 assert.equal(b.pending,true)
 b.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'two',transcript:'second',usage:{total_tokens:8}})
 b.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'one',transcript:'first',usage:{total_tokens:7}})
 b.receive({type:'conversation.item.input_audio_transcription.delta',item_id:'one',delta:' stale'})
 b.receive({type:'conversation.item.input_audio_transcription.completed',item_id:'one',transcript:'first',usage:{total_tokens:7}})
 assert.equal(b.text,'first second');assert.equal(b.pending,false);assert.equal(b.tokens,15)
})
const setup=t=>{
 const phases=[],results=[],transcripts=[],tracks=[{stopCount:0,stop(){this.stopCount++}}]
 const stream={getTracks:()=>tracks,getAudioTracks:()=>tracks}
 t.mock.method(globalThis,'cancelAnimationFrame',()=>{})
 t.mock.method(globalThis,'requestAnimationFrame',()=>0)
 t.mock.method(globalThis,'fetch',async(url)=>url.includes('/session')?Response.json({value:'ephemeral'}):new Response('answer'))
 t.mock.getter(globalThis,'navigator',()=>({mediaDevices:{getUserMedia:async()=>stream}}))
 let peer
 class Peer {
  constructor(){peer=this;this.connectionState='connected';this.channel={readyState:'open',send:()=>{},close(){this.readyState='closed'}}}
  addTrack(){} createDataChannel(){return this.channel} async createOffer(){return{sdp:'offer'}} async setLocalDescription(){} async setRemoteDescription(){this.channel.onopen()} close(){this.closed=true}
 }
 t.mock.property(globalThis,'RTCPeerConnection',Peer)
 t.mock.property(globalThis,'localStorage',{getItem:()=> 'a'.repeat(64)})
 const speech=new SpeechTranscription({phase:p=>phases.push(p),transcript:text=>transcripts.push(text),levels:()=>{},finish:r=>results.push(r)})
 t.after(()=>speech.cancel())
 return {speech,phases,results,transcripts,tracks,get peer(){return peer},event(e){peer.channel.onmessage({data:JSON.stringify(e)})}}
}
// Globals are installed only for the mocked browser session tests.
if(!globalThis.cancelAnimationFrame)globalThis.cancelAnimationFrame=()=>{}
if(!globalThis.requestAnimationFrame)globalThis.requestAnimationFrame=()=>0
if(!globalThis.RTCPeerConnection)globalThis.RTCPeerConnection=class{}
if(!globalThis.localStorage)globalThis.localStorage={}

test('Stop releases microphone immediately, waits for final transcript, and ignores late events',async t=>{
 const s=setup(t);await s.speech.start()
 s.event({type:'input_audio_buffer.speech_started',item_id:'one'})
 s.event({type:'conversation.item.input_audio_transcription.delta',item_id:'one',delta:'Buy mi'})
 s.speech.stop();assert.equal(s.tracks[0].stopCount,1);assert.equal(s.results.length,0)
 s.event({type:'input_audio_buffer.committed',item_id:'one',previous_item_id:null})
 s.event({type:'conversation.item.input_audio_transcription.completed',item_id:'one',transcript:'Buy milk'})
 await new Promise(r=>setTimeout(r,700))
 assert.deepEqual(s.results,[{text:'Buy milk',refine:true,error:''}])
 s.event({type:'conversation.item.input_audio_transcription.delta',item_id:'one',delta:'stale'})
 assert.equal(s.results.length,1);assert.equal(s.peer.closed,true)
})
test('connection failure and cancellation preserve provisional text and never refine',async t=>{
 const s=setup(t);await s.speech.start()
 s.event({type:'conversation.item.input_audio_transcription.delta',item_id:'one',delta:'Keep these words'})
 s.peer.channel.onerror()
 assert.equal(s.results[0].text,'Keep these words');assert.equal(s.results[0].refine,false)
 assert.equal(s.results[0].error.includes('kept'),true)
 s.speech.cancel();assert.equal(s.results.length,1)
})
test('cancellation while microphone permission is pending releases a late stream',async t=>{
 const s=setup(t);let resolve
 t.mock.getter(globalThis,'navigator',()=>({mediaDevices:{getUserMedia:()=>new Promise(r=>resolve=r)}}))
 const pending=s.speech.start();s.speech.cancel()
 resolve({getTracks:()=>s.tracks});await pending
 assert.equal(s.tracks[0].stopCount,1);assert.equal(s.results.length,1);assert.equal(s.results[0].refine,false)
})
test('silence stops cleanly without invented text or a refinement request',async t=>{
 const s=setup(t);await s.speech.start();s.speech.stop()
 s.event({type:'error',error:{code:'input_audio_buffer_commit_empty'}})
 await new Promise(r=>setTimeout(r,700))
 assert.equal(s.results[0].text,'');assert.equal(s.results[0].error,'No speech heard. Click the mic to try again.')
})
test('timeout keeps partial transcription editable and does not refine',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const s=setup(t);await s.speech.start()
 s.event({type:'conversation.item.input_audio_transcription.delta',item_id:'one',delta:'Keep this draft'})
 s.speech.stop();t.mock.timers.tick(15_000)
 assert.equal(s.results[0].text,'Keep this draft');assert.equal(s.results[0].refine,false)
 assert.equal(s.results[0].error.includes('timed out'),true);assert.equal(s.peer.closed,true)
})
test('five minute session limit follows the normal Stop flow',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const s=setup(t);await s.speech.start();t.mock.timers.tick(5*60_000)
 assert.equal(s.phases.at(-1),'finishing');assert.ok(s.tracks[0].stopCount>0)
 s.event({type:'error',error:{code:'input_audio_buffer_commit_empty'}})
 t.mock.timers.tick(700);assert.equal(s.results.length,1)
})
test('malformed transcript results preserve previous text and release the microphone',async t=>{
 const s=setup(t);await s.speech.start()
 s.event({type:'conversation.item.input_audio_transcription.delta',item_id:'one',delta:'Keep me'})
 s.event({type:'conversation.item.input_audio_transcription.completed',item_id:'one',transcript:{invalid:true}})
 assert.equal(s.results[0].text,'Keep me');assert.equal(s.results[0].refine,false)
 assert.ok(s.tracks[0].stopCount>0)
})
test('permission denial returns a useful plain message and no upstream call',async t=>{
 const s=setup(t)
 t.mock.getter(globalThis,'navigator',()=>({mediaDevices:{getUserMedia:async()=>{throw new DOMException('blocked','NotAllowedError')}}}))
 await s.speech.start()
 assert.equal(s.results[0].error.includes('Allow it in your browser'),true)
 assert.equal(s.peer,undefined);assert.equal(s.results[0].refine,false)
})
