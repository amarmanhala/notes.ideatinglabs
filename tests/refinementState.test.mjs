import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const built=await build({stdin:{contents:`export * from './src/refinementState'; export {applyWritingChange,parseHistory} from './src/writingSessions';`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',write:false})
const {noteParagraphs,pendingParagraphs,refinementMetadata,validateParagraphResults,applyWritingChange,parseHistory}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const make=text=>applyWritingChange(undefined,text,Date.parse('2026-10-18T12:00:00Z'),()=> 'session')
const mark=text=>({...make(text),refinedParagraphs:noteParagraphs(text).map(p=>({start:p.start,end:p.end,resources:[]}))})
const edit=(entry,text,start)=>applyWritingChange(entry,text,Date.parse('2026-10-18T12:01:00Z'),()=> 'new',start)

test('legacy notes begin unrefined and blank lines are skipped',()=>{
 assert.equal(pendingParagraphs('rough\n\nsecond\n  ').length,2)
 assert.deepEqual(noteParagraphs('😀\nnext').map(p=>[p.start,p.end]),[[0,2],[3,7]])
})
test('only edited or newly inserted paragraphs become eligible',()=>{
 const before=mark('First\nSecond\nThird')
 const after=edit(before,'First\nChanged\nThird')
 assert.deepEqual(pendingParagraphs(after.text,after.refinedParagraphs).map(p=>p.text),['Changed'])
 const inserted=edit(before,'New\nFirst\nSecond\nThird',0)
 assert.deepEqual(pendingParagraphs(inserted.text,inserted.refinedParagraphs).map(p=>p.text),['New'])
 const tail=edit(before,'First\nSecond\nThird\nFourth')
 assert.deepEqual(pendingParagraphs(tail.text,tail.refinedParagraphs).map(p=>p.text),['Fourth'])
})
test('duplicate paragraphs are tracked by location, never by matching text',()=>{
 const before=mark('Same\nSame')
 const after=edit(before,'Same\nSame\nSame',0)
 assert.deepEqual(pendingParagraphs(after.text,after.refinedParagraphs).map(p=>p.start),[0])
})
test('splitting or joining invalidates affected paragraphs, deleting preserves untouched ones',()=>{
 const before=mark('First\nSecond\nThird')
 const deleted=edit(before,'First\nThird',6)
 assert.equal(pendingParagraphs(deleted.text,deleted.refinedParagraphs).length,0)
 assert.equal(pendingParagraphs('Fir\nst\nSecond\nThird',edit(before,'Fir\nst\nSecond\nThird').refinedParagraphs).length,2)
 const joined=edit(before,'FirstSecond\nThird')
 assert.deepEqual(pendingParagraphs(joined.text,joined.refinedParagraphs).map(p=>p.text),['FirstSecond'])
})
test('formatting and reload preserve processed paragraphs and resources',()=>{
 const before=mark('Learn React\nNext')
 before.refinedParagraphs[0].resources=[{title:'Learn React',url:'https://react.dev/learn'}]
 const after=applyWritingChange(before,before.text,Date.now(),()=> 'unused',undefined,[{start:0,end:5,marks:['bold']}])
 assert.deepEqual(after.refinedParagraphs,before.refinedParagraphs)
 const restored=parseHistory(JSON.stringify({'2026-10-18':after}))['2026-10-18']
 assert.deepEqual(restored.refinedParagraphs,before.refinedParagraphs)
 assert.equal(pendingParagraphs(restored.text,restored.refinedParagraphs).length,0)
 for(const refinedParagraphs of [[{start:1,end:11}], [{start:0,end:11},{start:0,end:11}]])assert.throws(()=>parseHistory(JSON.stringify({'2026-10-18':{...before,refinedParagraphs}})))
})
test('batch merging keeps line breaks and unchanged metadata; identical outputs still count as refined',()=>{
 const text='rough\n\nAlready clear\nother rough'
 const all=noteParagraphs(text)
 const previous=[{start:all[1].start,end:all[1].end,resources:[]}]
 const requested=pendingParagraphs(text,previous)
 const next=refinementMetadata(text,previous,requested,[{id:requested[0].id,text:'Clear',resources:[]},{id:requested[1].id,text:'other rough',resources:[]}])
 assert.equal(next.text,'Clear\n\nAlready clear\nother rough')
 assert.equal(next.replacements.length,1)
 assert.equal(pendingParagraphs(next.text,next.refinedParagraphs).length,0)
})
test('partial, duplicate, unknown, multiline, empty or long model results fail atomically',()=>{
 const requested=[{id:'a',text:'rough'},{id:'b',text:'second'}]
 const a={id:'a',text:'Clear',resources:[]},b={id:'b',text:'Second',resources:[]}
 assert.deepEqual(validateParagraphResults([b,a],requested),[a,b])
 for(const result of [[a],[a,a],[a,{...b,id:'unknown'}],[a,{...b,text:''}],[a,{...b,text:'two\nlines'}],[a,{...b,text:'more '.repeat(20)}]])assert.throws(()=>validateParagraphResults(result,requested))
})
