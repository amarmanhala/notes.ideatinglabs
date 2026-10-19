import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {pretendToBeVisual:true,url:'https://notes.test'})
Object.defineProperty(dom.window.navigator,'platform',{value:'MacIntel',configurable:true})
for (const key of ['window','document','navigator','Node','Element','HTMLElement','MutationObserver','DOMParser','KeyboardEvent','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
  const value = dom.window[key]
  Object.defineProperty(globalThis,key,{value: typeof value === 'function' && ['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key) ? value.bind(dom.window) : value,configurable:true,writable:true})
}
const bundled = await build({stdin:{contents:`
  export { Editor, getSchema } from '@tiptap/core';
  export { writingExtensions } from './src/writingExtensions';
  export { toRichDocument, fromRichDocument, documentPosition, plainOffset } from './src/richDocument';
  export { applyWritingChange, parseHistory } from './src/writingSessions';
  export {replaceRefinedParagraphs,refinementDecorationKey} from './src/refinementEditor';
`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',write:false})
const {Editor,getSchema,writingExtensions,toRichDocument,fromRichDocument,documentPosition,plainOffset,applyWritingChange,parseHistory,replaceRefinedParagraphs,refinementDecorationKey} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const schema = getSchema(writingExtensions)
const node = (text,formats=[]) => schema.nodeFromJSON(toRichDocument(text,formats))
const start = Date.parse('2026-10-14T14:00:00Z')
const editors=[]
function createEditor(text='hello world',onRequest=()=>{}) {
  const element=document.createElement('div')
  document.body.append(element)
  const editor=new Editor({element,extensions:writingExtensions.map(extension=>extension.name==='confirmClearNotes'?extension.configure({onRequest}):extension),content:toRichDocument(text),injectCSS:false,editorProps:{handleScrollToSelection:()=>true}})
  editors.push(editor)
  return editor
}
function shortcut(editor,key) {
  const event=new dom.window.KeyboardEvent('keydown',{key,code:`Key${key.toUpperCase()}`,metaKey:true,bubbles:true,cancelable:true})
  editor.view.dom.dispatchEvent(event)
  assert.equal(event.defaultPrevented,true)
}
after(()=>{editors.forEach(editor=>editor.destroy());dom.window.close()})

test('Cmd+B bolds only selected text and a second press removes bold',()=>{
  const editor=createEditor()
  editor.commands.setTextSelection({from:1,to:6})
  shortcut(editor,'b')
  assert.deepEqual(fromRichDocument(editor.state.doc),{text:'hello world',formats:[{start:0,end:5,marks:['bold']}]})
  shortcut(editor,'b')
  assert.deepEqual(fromRichDocument(editor.state.doc),{text:'hello world',formats:[]})
})
test('Cmd+I italicizes selected text and combines with bold',()=>{
  const editor=createEditor()
  editor.commands.setTextSelection({from:1,to:6})
  shortcut(editor,'i')
  shortcut(editor,'b')
  assert.deepEqual(fromRichDocument(editor.state.doc).formats,[{start:0,end:5,marks:['bold','italic']}])
  shortcut(editor,'i')
  assert.deepEqual(fromRichDocument(editor.state.doc).formats,[{start:0,end:5,marks:['bold']}])
})
test('shortcuts with no selected text do not enable formatting for future typing',()=>{
  const editor=createEditor()
  editor.commands.setTextSelection(3)
  shortcut(editor,'b')
  shortcut(editor,'i')
  editor.commands.insertContent('x')
  assert.deepEqual(fromRichDocument(editor.state.doc).formats,[])
})
test('Cmd+Z can undo formatting without changing the writing',()=>{
  const editor=createEditor()
  editor.commands.setTextSelection({from:1,to:6})
  shortcut(editor,'b')
  shortcut(editor,'z')
  assert.deepEqual(fromRichDocument(editor.state.doc),{text:'hello world',formats:[]})
})

test('event emoji stays plain text, preserves neighboring marks, reloads and is undoable', () => {
 const event='Dad’s birthday, October 25.'
 const editor=createEditor(`${event}\nKeep bold`)
 const start=event.length+1
 editor.commands.setTextSelection({from:documentPosition(editor.state.doc,start),to:documentPosition(editor.state.doc,start+9)})
 shortcut(editor,'b')
 const before=fromRichDocument(editor.state.doc)
 replaceRefinedParagraphs(editor,[{start:0,end:event.length,text:`🎂 ${event}`,isTodo:false,timerSeconds:null}])
 const refined=fromRichDocument(editor.state.doc)
 assert.equal(refined.text,`🎂 ${event}\nKeep bold`)
 assert.deepEqual(refined.formats,[{start:start+3,end:start+12,marks:['bold']}])
 assert.equal(refined.tasks?.length??0,0)
 assert.equal(editor.view.dom.querySelector('[data-todo="true"]'),null)
 assert.deepEqual(fromRichDocument(schema.nodeFromJSON(toRichDocument(refined.text,refined.formats))),refined)
 const entry=applyWritingChange(undefined,refined.text,Date.now(),()=> 'event',undefined,refined.formats)
 const saved=parseHistory(JSON.stringify({'2026-10-19':entry}))['2026-10-19']
 assert.equal(saved.text,refined.text)
 assert.deepEqual(saved.formats,refined.formats)
 editor.commands.undo()
 assert.deepEqual(fromRichDocument(editor.state.doc),before)
})
test('refinement decorations change only pending paragraphs without changing text or marks',()=>{
 const editor=createEditor('Done\nrough note')
 editor.commands.setTextSelection({from:7,to:12})
 shortcut(editor,'b')
 const original=fromRichDocument(editor.state.doc)
 editor.view.dispatch(editor.state.tr.setMeta(refinementDecorationKey,[{start:5,end:15}]).setMeta('addToHistory',false))
 const paragraphs=editor.view.dom.querySelectorAll('p')
 assert.equal(paragraphs[0].querySelector('.refine-thinking'),null)
 assert.equal([...paragraphs[1].querySelectorAll('.refine-thinking')].map(node=>node.textContent).join(''),'rough note')
 assert.deepEqual(fromRichDocument(editor.state.doc),original)
 editor.view.dispatch(editor.state.tr.setMeta(refinementDecorationKey,[]).setMeta('addToHistory',false))
 assert.equal(editor.view.dom.querySelectorAll('.refine-thinking').length,0)
})
test('batch replacements preserve untouched formatting and undo in one step',()=>{
 const editor=createEditor('rough one\nKeep bold\nrough two')
 editor.commands.setTextSelection({from:12,to:21})
 shortcut(editor,'b')
 const original=fromRichDocument(editor.state.doc)
 replaceRefinedParagraphs(editor,[{start:0,end:9,text:'Clear one.'},{start:20,end:29,text:'Clear two.'}])
 const next=fromRichDocument(editor.state.doc)
 assert.equal(next.text,'Clear one.\nKeep bold\nClear two.')
 assert.ok(next.formats.some(format=>next.text.slice(format.start,format.end)==='Keep bold'))
 shortcut(editor,'z')
 assert.deepEqual(fromRichDocument(editor.state.doc),original)
 shortcut(editor,'z')
 assert.deepEqual(fromRichDocument(editor.state.doc).formats,[])
})
test('refining a note is one undoable change and restores original formatting',()=>{
  const editor=createEditor('need send proposal tomorow')
  editor.commands.setTextSelection({from:1,to:5})
  shortcut(editor,'b')
  const original=fromRichDocument(editor.state.doc)
  editor.commands.setContent(toRichDocument('Send the proposal tomorrow.'),{emitUpdate:true})
  assert.equal(fromRichDocument(editor.state.doc).text,'Send the proposal tomorrow.')
  shortcut(editor,'z')
  assert.deepEqual(fromRichDocument(editor.state.doc),original)
})
test('refinement converts task text and unchanged wording to undoable todos',()=>{
 const editor=createEditor('Buy milk\nI feel sick.\ncall mom')
 replaceRefinedParagraphs(editor,[{start:0,end:8,text:'Buy milk',isTodo:true},{start:22,end:30,text:'Call Mom.',isTodo:true}])
 assert.equal(fromRichDocument(editor.state.doc).text,'Buy milk\nI feel sick.\nCall Mom.')
 assert.deepEqual(fromRichDocument(editor.state.doc).tasks,[{start:0,end:8,checked:false},{start:22,end:31,checked:false}])
 shortcut(editor,'z')
 assert.equal(fromRichDocument(editor.state.doc).tasks,undefined)
 assert.equal(fromRichDocument(editor.state.doc).text,'Buy milk\nI feel sick.\ncall mom')
})
test('task attributes survive typing, move with insertions, and do not carry into a new paragraph',()=>{
 const editor=createEditor('Buy milk\nplain')
 replaceRefinedParagraphs(editor,[{start:0,end:8,text:'Buy milk',isTodo:true}])
 editor.commands.setTextSelection(9)
 editor.commands.splitBlock()
 const result=fromRichDocument(editor.state.doc)
 assert.deepEqual(result.tasks,[{start:0,end:8,checked:false}])
 assert.equal(editor.state.selection.$from.parent.attrs.todo,false)
 editor.commands.setTextSelection(1)
 editor.commands.insertContent('Please ')
 assert.deepEqual(fromRichDocument(editor.state.doc).tasks,[{start:0,end:15,checked:false}])
})
test('checked tasks reload with marks and checkbox changes preserve text and undo',()=>{
 const editor=createEditor('Buy milk')
 editor.commands.setContent(toRichDocument('Buy milk',[{start:0,end:3,marks:['bold']}],[{start:0,end:8,checked:true}]))
 const original=fromRichDocument(editor.state.doc)
 editor.commands.updateAttributes('paragraph',{checked:false})
 assert.equal(fromRichDocument(editor.state.doc).text,original.text)
 assert.deepEqual(fromRichDocument(editor.state.doc).formats,original.formats)
 assert.deepEqual(fromRichDocument(editor.state.doc).tasks,[{start:0,end:8,checked:false}])
})
test('task checkbox slots stay inside their own paragraphs through edits and never enter copied text',()=>{
 const editor=createEditor('Buy milk\nA reflection\nCall Mom')
 replaceRefinedParagraphs(editor,[{start:0,end:8,text:'Buy milk',isTodo:true},{start:22,end:30,text:'Call Mom',isTodo:true}])
 const tasks=()=>[...editor.view.dom.querySelectorAll('[data-task-checkbox]')].map(slot=>slot.parentElement.textContent)
 assert.deepEqual(tasks(),['Buy milk','Call Mom'])
 editor.commands.setTextSelection(1)
 editor.commands.insertContent('Please ')
 assert.deepEqual(tasks(),['Please Buy milk','Call Mom'])
 const slice=editor.state.doc.slice(0,editor.state.doc.content.size)
 const copied=editor.view.serializeForClipboard(slice)
 assert.equal(copied.text,'Please Buy milk\n\nA reflection\n\nCall Mom')
 assert.equal(fromRichDocument(editor.state.doc).text,'Please Buy milk\nA reflection\nCall Mom')
})
test('plain notes preserve blank lines, trailing newlines, spaces and emoji',()=>{
  const text='  hello 🌱\n\nworld\n'
  assert.deepEqual(fromRichDocument(node(text)),{text,formats:[]})
  for(let offset=0;offset<=text.length;offset++)assert.equal(plainOffset(node(text),documentPosition(node(text),offset)),offset)
})
test('formatting survives multiline serialization and cloud history validation',()=>{
  const text='hello\nworld'
  const formats=[{start:0,end:5,marks:['bold']},{start:6,end:11,marks:['italic']}]
  const saved=applyWritingChange(undefined,text,start,()=> 'one',undefined,formats)
  const restored=parseHistory(JSON.stringify({'2026-10-14':saved}))['2026-10-14']
  assert.deepEqual(fromRichDocument(node(restored.text,restored.formats)),{text,formats})
})
test('format-only saves keep capture timestamps and anchor offsets unchanged',()=>{
  const original=applyWritingChange(undefined,'hello world',start,()=> 'one')
  const updated=applyWritingChange(original,original.text,start+180000,()=> 'two',undefined,[{start:0,end:5,marks:['bold']}])
  assert.equal(updated.createdAt,original.createdAt)
  assert.deepEqual(updated.sessions,original.sessions)
  assert.notEqual(updated.updatedAt,original.updatedAt)
})
test('format ranges reject HTML-like marks, out-of-range offsets, and duplicate marks',()=>{
  const original=applyWritingChange(undefined,'hello',start,()=> 'one')
  for(const formats of [[{start:0,end:10,marks:['bold']}],[{start:0,end:5,marks:['script']}],[{start:0,end:5,marks:['bold','bold']}]]) {
    assert.throws(()=>parseHistory(JSON.stringify({'2026-10-14':{...original,formats}})))
  }
})
test('timed refinement creates an idle inline timer, preserves neighboring marks, and is undoable',()=>{
 const editor=createEditor('Study React for 30 minutes.\nKeep bold')
 editor.commands.setTextSelection({from:30,to:39});shortcut(editor,'b')
 const original=fromRichDocument(editor.state.doc)
 replaceRefinedParagraphs(editor,[{start:0,end:27,text:'Study React for 30 minutes.',isTodo:true,timerSeconds:1800}])
 const next=fromRichDocument(editor.state.doc)
 assert.equal(next.text,original.text);assert.deepEqual(next.formats,original.formats)
 assert.deepEqual(next.tasks,[{start:0,end:27,checked:false,timer:{durationSeconds:1800,remainingMs:1800000}}])
 assert.equal(editor.view.dom.querySelectorAll('[data-task-timer]').length,1)
 shortcut(editor,'z');assert.deepEqual(fromRichDocument(editor.state.doc),original)
})
test('timer survives formatting and surrounding insertions, but edits to the timed sentence remove it',()=>{
 const editor=createEditor('Above\nStudy React for 30 minutes.')
 replaceRefinedParagraphs(editor,[{start:6,end:33,text:'Study React for 30 minutes.',isTodo:true,timerSeconds:1800}])
 editor.commands.setTextSelection({from:8,to:13});shortcut(editor,'b')
 assert.equal(fromRichDocument(editor.state.doc).tasks[0].timer.durationSeconds,1800)
 editor.commands.setTextSelection(1);editor.commands.insertContent('New ')
 assert.equal(fromRichDocument(editor.state.doc).tasks[0].start,10)
 assert.equal(fromRichDocument(editor.state.doc).tasks[0].timer.durationSeconds,1800)
 editor.commands.setTextSelection(13);editor.commands.insertContent('x')
 assert.equal(fromRichDocument(editor.state.doc).tasks[0].timer,null)
 assert.equal(editor.view.dom.querySelector('[data-task-timer]'),null)
 shortcut(editor,'z');assert.equal(fromRichDocument(editor.state.doc).tasks[0].timer.durationSeconds,1800)
})

test('cancelling a full-page deletion preserves text, formatting, tasks and selection without saving',async t=>{
 let request
 const editor=createEditor('hello world',next=>{request=next})
 const text='Keep this thought\nBuy milk'
 editor.commands.setContent(toRichDocument(text,[{start:0,end:4,marks:['bold']}],[{start:18,end:26,checked:false}]),{emitUpdate:false})
 editor.commands.selectAll()
 const before=editor.state.doc.toJSON(),selection=editor.state.selection.toJSON()
 let saves=0
 editor.on('update',()=>saves++)
 t.mock.method(window,'confirm',()=>assert.fail('Browser confirmations must never be used'))
 editor.commands.deleteSelection();await Promise.resolve()
 assert.ok(request);assert.equal(saves,0)
 request.cancel();await Promise.resolve()
 assert.equal(request,null)
 assert.deepEqual(editor.state.doc.toJSON(),before)
 assert.deepEqual(editor.state.selection.toJSON(),selection)
})
test('confirming a full deletion saves once and one Undo restores the complete note',async()=>{
 let request,calls=0
 const editor=createEditor('Original thought\nSecond thought',next=>{request=next;if(next)calls++})
 editor.commands.setTextSelection({from:1,to:9});editor.commands.toggleBold()
 const before=editor.state.doc.toJSON()
 let saves=0
 editor.on('update',()=>saves++)
 editor.commands.selectAll();editor.commands.deleteSelection();await Promise.resolve()
 assert.equal(saves,0)
 assert.equal(request.confirm(),true)
 assert.equal(fromRichDocument(editor.state.doc).text,'');assert.equal(saves,1)
 editor.commands.undo();assert.deepEqual(editor.state.doc.toJSON(),before)
 editor.commands.redo();assert.equal(fromRichDocument(editor.state.doc).text,'')
 assert.equal(calls,1,'Undo and Redo do not open another confirmation')
})
test('a full cut is blocked until confirmation and duplicate requests share one dialog',async()=>{
 let request,calls=0
 const editor=createEditor('Keep all my notes',next=>{request=next;if(next)calls++})
 editor.commands.selectAll()
 editor.view.dispatch(editor.state.tr.deleteSelection().setMeta('uiEvent','cut'))
 editor.commands.deleteSelection()
 await Promise.resolve()
 assert.equal(calls,1);assert.ok(request)
 assert.equal(fromRichDocument(editor.state.doc).text,'Keep all my notes')
 request.cancel()
})
test('partial deletions, replacement text, and silent document changes do not ask to clear notes',async()=>{
 const editor=createEditor('First thought\nSecond thought',()=>assert.fail('Unexpected confirmation'))
 editor.commands.setTextSelection({from:1,to:6});editor.commands.deleteSelection()
 assert.equal(fromRichDocument(editor.state.doc).text,' thought\nSecond thought')
 editor.commands.selectAll();editor.commands.insertContent('Replacement thought')
 assert.equal(fromRichDocument(editor.state.doc).text,'Replacement thought')
 editor.commands.selectAll();editor.commands.setContent(toRichDocument(''),{emitUpdate:false})
 assert.equal(fromRichDocument(editor.state.doc).text,'')
 editor.commands.selectAll();editor.commands.deleteSelection()
 await Promise.resolve()
})
test('newer writing and editor destruction invalidate an old delete confirmation',async()=>{
 let request
 const editor=createEditor('Original thought',next=>{request=next})
 editor.commands.selectAll();editor.commands.deleteSelection();await Promise.resolve()
 const stale=request
 editor.commands.setContent(toRichDocument('Newer cloud writing'),{emitUpdate:false})
 await Promise.resolve()
 assert.equal(request,null);assert.equal(stale.confirm(),false)
 assert.equal(fromRichDocument(editor.state.doc).text,'Newer cloud writing')
 editor.commands.selectAll();editor.commands.deleteSelection();await Promise.resolve()
 const removed=request
 editor.destroy()
 assert.equal(removed.confirm(),false)
})
