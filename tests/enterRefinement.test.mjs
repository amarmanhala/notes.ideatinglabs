import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const built=await build({stdin:{contents:`export {EnterRefinement} from './src/enterRefinement'; export {noteParagraphs} from './src/refinementState';`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',write:false})
const {EnterRefinement,noteParagraphs}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const settle=()=>new Promise(resolve=>setTimeout(resolve,0))
function fixture(text){
 const calls=[],applied=[]
 const queue=new EnterRefinement((paragraph,signal)=>new Promise((resolve,reject)=>calls.push({paragraph,signal,resolve,reject})),'today')
 queue.apply=(paragraph,result)=>applied.push({paragraph,result})
 queue.update(text,[],undefined,true)
 return {queue,calls,applied}
}
function finish(call,text='Fixed note.') {call.resolve({paragraphs:[{id:call.paragraph.id,text,resources:[]}]})}

test('daily-limit failure clears shimmer, preserves the note and shows the server message', async () => {
 const {queue,calls,applied}=fixture('Keep this thought.\n')
 queue.complete(noteParagraphs('Keep this thought.\n')[0])
 assert.equal(queue.getSnapshot().pending.length,1)
 const message='You’ve used today’s 20 AI refinements. Keep writing—more tomorrow.'
 calls[0].reject(new Error(message));await settle()
 assert.equal(queue.getSnapshot().error,message)
 assert.deepEqual(queue.getSnapshot().pending,[])
 assert.deepEqual(applied,[])
 queue.update('Keep this thought.\nStill writing.',[],undefined,true)
 assert.deepEqual(applied,[])
 assert.equal(queue.getSnapshot().error,message)
})

test('refines completed paragraph while typing the next one, without duplicate requests',async()=>{
 const {queue,calls,applied}=fixture('rough\n')
 queue.complete(noteParagraphs('rough\n')[0]);queue.complete(noteParagraphs('rough\n')[0])
 queue.update('rough\nnext thought')
 assert.equal(calls.length,1);assert.equal(calls[0].signal.aborted,false)
 finish(calls[0]);await settle()
 assert.equal(applied.length,1);assert.equal(queue.getSnapshot().pending.length,0);assert.equal(queue.getSnapshot().error,'')
})
test('editing the source cancels immediately and ignores a late response',async()=>{
 const {queue,calls,applied}=fixture('rough\n')
 queue.complete(noteParagraphs('rough\n')[0]);queue.update('new writing\n')
 assert.equal(calls[0].signal.aborted,true);assert.equal(queue.getSnapshot().pending.length,0)
 finish(calls[0]);await settle();assert.equal(applied.length,0)
 assert.match(queue.getSnapshot().error,/Press Enter/)
})
test('rapid completed paragraphs queue separately and map through earlier replacements',async()=>{
 const {queue,calls,applied}=fixture('one\ntwo\n')
 const [one,two]=noteParagraphs('one\ntwo\n')
 queue.complete(one);queue.complete(two)
 queue.apply=(paragraph,result)=>{applied.push({paragraph,result});if(paragraph.start===0)queue.update('First note.\ntwo\n')}
 finish(calls[0],'First note.');await settle()
 assert.equal(calls.length,2);assert.equal(calls[1].paragraph.start,12)
 finish(calls[1],'Second note.');await settle();assert.equal(applied.length,2)
})
test('duplicate wording stays associated with the correct range',async()=>{
 const {queue,calls,applied}=fixture('same\nsame\n')
 queue.complete(noteParagraphs('same\nsame\n')[1])
 queue.update('insert\nsame\nsame\n',[],[{before:'same\nsame\n',after:'insert\nsame\nsame\n',editStart:0}])
 finish(calls[0]);await settle();assert.equal(applied[0].paragraph.start,12)
})
test('already refined paragraphs do not run, formatting changes keep pending requests',async()=>{
 const {queue,calls}=fixture('same\n')
 queue.update('same\n',[{start:0,end:4,resources:[]}]);queue.complete(noteParagraphs('same\n')[0]);assert.equal(calls.length,0)
 queue.update('same!\n',[],undefined,true);queue.complete(noteParagraphs('same!\n')[0]);queue.update('same!\n',[])
 assert.equal(calls[0].signal.aborted,false);finish(calls[0],'same!');await settle()
})
test('failure clears shimmer and another Enter clears the error; navigation ignores late output',async()=>{
 const {queue,calls,applied}=fixture('rough\n')
 const paragraph=noteParagraphs('rough\n')[0]
 queue.complete(paragraph);calls[0].reject(new Error('Unavailable'));await settle()
 assert.equal(queue.getSnapshot().error,'Unavailable');assert.equal(queue.getSnapshot().pending.length,0)
 queue.complete(paragraph);assert.equal(queue.getSnapshot().error,'')
 queue.cancel();finish(calls[1]);await settle();assert.equal(applied.length,0)
})
test('invalid results never apply any changes',async()=>{
 const {queue,calls,applied}=fixture('rough\n')
 queue.complete(noteParagraphs('rough\n')[0]);calls[0].resolve({paragraphs:[]});await settle()
 assert.equal(applied.length,0);assert.equal(queue.getSnapshot().pending.length,0);assert.match(queue.getSnapshot().error,/incomplete/)
})
test('loading existing unrefined notes and pressing Enter only adds lines without any request',()=>{
 const calls=[]
 const queue=new EnterRefinement(async p=>{calls.push(p);return {paragraphs:[]}},'today')
 queue.update('Existing note')
 queue.update('Existing note\n',[],[{before:'Existing note',after:'Existing note\n',editStart:13}],true)
 queue.complete(noteParagraphs('Existing note\n')[0])
 queue.update('Existing note\n\n',[],[{before:'Existing note\n',after:'Existing note\n\n',editStart:14}],true)
 queue.complete({id:'empty',start:14,end:14,text:''})
 assert.equal(calls.length,0)
 assert.deepEqual(queue.getSnapshot().pending,[])
})
test('editing an existing note makes only that paragraph eligible on the next Enter',async()=>{
 const calls=[]
 const queue=new EnterRefinement(async p=>{calls.push(p);return {paragraphs:[{id:p.id,text:p.text,resources:[]}]}},'today')
 queue.update('First\nSecond')
 queue.update('First!\nSecond',[],[{before:'First\nSecond',after:'First!\nSecond',editStart:5}],true)
 const [first,second]=noteParagraphs('First!\nSecond')
 queue.complete(second);assert.equal(calls.length,0)
 queue.complete(first);await settle();assert.equal(calls.length,1);assert.equal(calls[0].text,'First!')
})
test('restoring a refined paragraph to its original text does not request it again',()=>{
 const calls=[]
 const queue=new EnterRefinement(async p=>{calls.push(p);return {paragraphs:[]}},'today')
 const refined=[{start:0,end:10,resources:[]}]
 queue.update('Have oats.',refined)
 queue.update('Have oats',[],[{before:'Have oats.',after:'Have oats',editStart:9}],true)
 queue.update('Have oats.',[],[{before:'Have oats',after:'Have oats.',editStart:9}],true)
 queue.update('Have oats.\n',[],[{before:'Have oats.',after:'Have oats.\n',editStart:10}],true)
 queue.complete(noteParagraphs('Have oats.\n')[0])
 assert.equal(calls.length,0)
 assert.deepEqual(queue.getSnapshot().pending,[])
})
test('splitting a dirty paragraph keeps the completed prefix eligible',async()=>{
 const {queue,calls}=fixture('rough unfinished')
 queue.update('rough\n unfinished',[],[{before:'rough unfinished',after:'rough\n unfinished',editStart:5}],true)
 queue.complete(noteParagraphs('rough\n unfinished')[0])
 assert.equal(calls.length,1);assert.equal(calls[0].paragraph.text,'rough')
 finish(calls[0]);await settle()
})
test('cloud text changes do not become new user writing',()=>{
 const calls=[]
 const queue=new EnterRefinement(async p=>{calls.push(p);return {paragraphs:[]}},'today')
 queue.update('Old note');queue.update('Cloud note')
 queue.complete(noteParagraphs('Cloud note')[0])
 assert.equal(calls.length,0)
})
