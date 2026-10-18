import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const built=await build({stdin:{contents:`export * from './src/taskParagraphs';export {applyWritingChange,parseHistory} from './src/writingSessions';export {reconcile} from './src/cloudSync';`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',write:false})
const {parseTasks,applyWritingChange,parseHistory,reconcile}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const day='2026-10-18',time=Date.parse('2026-10-18T12:00:00Z')
const tasks=[{start:0,end:8,checked:false}]
const note=applyWritingChange(undefined,'Buy milk',time,()=> 'session',undefined,[],undefined,tasks)
test('task state persists locally and a checkbox-only edit does not change capture sessions',()=>{
 const checked=applyWritingChange(note,note.text,time+130000,()=>assert.fail('must not create session'),undefined,[],undefined,[{...tasks[0],checked:true}])
 assert.deepEqual(checked.sessions,note.sessions)
 assert.equal(checked.text,note.text)
 assert.equal(parseHistory(JSON.stringify({[day]:checked}))[day].tasks[0].checked,true)
 assert.deepEqual(parseHistory(JSON.stringify({[day]:{...checked,tasks:[]}}))[day].tasks,[])
})
test('only complete nonempty unique paragraph ranges and boolean states are accepted',()=>{
 for(const value of [[{start:0,end:3,checked:false}],[{start:0,end:8,checked:'yes'}],[tasks[0],tasks[0]],[{start:-1,end:8,checked:false}]])assert.throws(()=>parseTasks(value,'Buy milk'))
 assert.deepEqual(parseTasks(undefined,'Old note'),[])
 assert.throws(()=>parseTasks([{start:0,end:0,checked:false}],''))
})
test('cloud merge preserves tasks against an older backend and adopts explicit removals and toggles',()=>{
 const old={...note};delete old.tasks
 const base={[day]:{entry:note,revision:1}}
 const preserved=reconcile({[day]:note},base,{history:{[day]:old},revisions:{[day]:1}})
 assert.deepEqual(preserved.history[day].tasks,tasks)
 const checked={...note,tasks:[{...tasks[0],checked:true}]}
 assert.equal(reconcile({[day]:note},base,{history:{[day]:checked},revisions:{[day]:2}}).history[day].tasks[0].checked,true)
 assert.deepEqual(reconcile({[day]:note},base,{history:{[day]:{...note,tasks:[]}},revisions:{[day]:2}}).history[day].tasks,[])
})
