import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const built=await build({stdin:{contents:"export * from './src/taskTimer';export {parseTasks} from './src/taskParagraphs';export {parseHistory,applyWritingChange} from './src/writingSessions';export {reconcile} from './src/cloudSync';export {validateParagraphResults,refinementMetadata} from './src/refinementState';",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',write:false})
const {remainingTime,startTimer,pauseTimer,resetTimer,formatTimer,parseTasks,parseHistory,applyWritingChange,reconcile,validateParagraphResults,refinementMetadata}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const idle={durationSeconds:1800,remainingMs:1800000}
const text='Study React for 30 minutes.'
const task={start:0,end:text.length,checked:false,timer:idle}
const day='2026-10-18',now=Date.parse('2026-10-18T12:00:00Z')
test('timer starts only on click, pauses, resumes, resets, and reaches zero without drift',()=>{
 assert.equal(remainingTime(idle,now),1800000)
 const running=startTimer(idle,now)
 assert.equal(remainingTime(running,now+61000),1739000)
 const paused=pauseTimer(running,now+61000)
 assert.equal(remainingTime(paused,now+600000),1739000)
 const resumed=startTimer(paused,now+600000)
 assert.equal(remainingTime(resumed,now+2339000),0)
 assert.deepEqual(resetTimer(resumed),idle)
 assert.equal(startTimer(pauseTimer(resumed,now+2339000),now+2400000).remainingMs,1800000)
})
test('countdown formats seconds, hours, and completion correctly',()=>{
 assert.equal(formatTimer(1800000),'30:00');assert.equal(formatTimer(3599000),'59:59')
 assert.equal(formatTimer(3600000),'1:00:00');assert.equal(formatTimer(1),'00:01');assert.equal(formatTimer(-1),'00:00')
})
test('timer metadata persists locally without changing text, formatting, or writing sessions',()=>{
 const note=applyWritingChange(undefined,text,now,()=> 'session',undefined,[],undefined,[task])
 const running={...task,timer:startTimer(idle,now)}
 const changed=applyWritingChange(note,text,now+1,()=>assert.fail('must not create session'),undefined,[],undefined,[running])
 const loaded=parseHistory(JSON.stringify({[day]:changed}))[day]
 assert.equal(loaded.text,text);assert.deepEqual(loaded.tasks,[running]);assert.deepEqual(loaded.sessions,note.sessions)
 assert.equal(remainingTime(loaded.tasks[0].timer,now+60000),1740000)
 for(const timer of [{...idle,durationSeconds:0},{...idle,remainingMs:-1},{...idle,endsAt:'bad'},{...idle,remainingMs:1800001}])assert.throws(()=>parseTasks([{...task,timer}],text))
 assert.deepEqual(parseTasks([{...task,timer:null}],text),[{...task,timer:null}])
})
test('older cloud backends preserve local timers and explicit new timer updates are adopted',()=>{
 const note=applyWritingChange(undefined,text,now,()=> 'session',undefined,[],undefined,[task])
 const old={...note,tasks:[{start:0,end:text.length,checked:false}]}
 const bases={[day]:{entry:note,revision:1}}
 assert.deepEqual(reconcile({[day]:note},bases,{history:{[day]:old},revisions:{[day]:1}}).history[day].tasks,[task])
 const cleared={...note,tasks:[{...task,timer:null}]}
 assert.equal(reconcile({[day]:note},bases,{history:{[day]:cleared},revisions:{[day]:2}}).history[day].tasks[0].timer,null)
})
test('refinement validates durations and passes them to the replacement transaction',()=>{
 const p={id:'timed',start:0,end:text.length,text}
 const result={id:'timed',text,resources:[],isTodo:true,timerSeconds:1800}
 assert.equal(refinementMetadata(text,[],[p],[result]).replacements[0].timerSeconds,1800)
 for(const invalid of [0,-1,1.5,604801,'1800'])assert.throws(()=>validateParagraphResults([{...result,timerSeconds:invalid}],[p]))
 assert.throws(()=>validateParagraphResults([{...result,isTodo:false}],[p]))
 assert.equal(validateParagraphResults([{...result,isTodo:false,timerSeconds:null}],[p])[0].timerSeconds,null)
})
test('a direct twenty-minute timer result is saved as timer metadata',()=>{
 const source='Set timer for 20 mins'
 const refined='Set a timer for 20 minutes.'
 const p={id:'timer',start:0,end:source.length,text:source}
 const result={id:'timer',text:refined,resources:[],isTodo:true,timerSeconds:1200}
 const replacement=refinementMetadata(source,[],[p],[result]).replacements[0]
 assert.deepEqual(replacement,{start:0,end:source.length,text:refined,isTodo:true,timerSeconds:1200})
 const saved=applyWritingChange(undefined,refined,now,()=> 'timer',undefined,[],undefined,[{start:0,end:refined.length,checked:false,timer:{durationSeconds:1200,remainingMs:1200000}}])
 assert.equal(parseHistory(JSON.stringify({[day]:saved}))[day].tasks[0].timer.durationSeconds,1200)
 assert.equal(formatTimer(1200000),'20:00')
})
