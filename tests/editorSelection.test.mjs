import test,{after,afterEach} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
const dom=new JSDOM('<!doctype html><html><body></body></html>',{pretendToBeVisual:true,url:'https://notes.test'})
for(const key of ['window','document','navigator','Node','Element','HTMLElement','DocumentFragment','MutationObserver','DOMParser','CustomEvent','KeyboardEvent','MouseEvent','Event','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']){
 const value=dom.window[key]
 Object.defineProperty(globalThis,key,{value:['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key)?value.bind(dom.window):value,configurable:true,writable:true})
}
globalThis.ResizeObserver=class{observe(){} disconnect(){}}
dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true}
dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new Event('close'))}
Object.defineProperty(document,'fonts',{value:{ready:Promise.resolve()},configurable:true})
Object.defineProperty(document,'hasFocus',{value:()=>true,configurable:true})
dom.window.HTMLElement.prototype.scrollTo=function({top}){this.scrollTop=top}
dom.window.scrollBy=()=>{}
const rect={left:0,right:1,top:0,bottom:20,width:1,height:20}
dom.window.Range.prototype.getClientRects=()=>[rect]
dom.window.Range.prototype.getBoundingClientRect=()=>rect
globalThis.IS_REACT_ACT_ENVIRONMENT=true
const NativeMessageChannel=globalThis.MessageChannel,channels=[]
globalThis.MessageChannel=class extends NativeMessageChannel{constructor(){super();channels.push(this)}}
const built=await build({stdin:{contents:`export {createElement,createRef,act} from 'react';export {createRoot} from 'react-dom/client';export {Editor} from '@tiptap/core';export {RichWritingEditor} from './src/RichWritingEditor';export {EnterRefinement} from './src/enterRefinement';export {applyWritingChange} from './src/writingSessions';export {refinementMetadata} from './src/refinementState';`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',jsx:'automatic',write:false,define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'ignore-css',setup(build){build.onLoad({filter:/\.css$/},()=>({contents:'export default {}',loader:'js'}))}}]})
const {createElement,createRef,act,createRoot,Editor,RichWritingEditor,EnterRefinement,applyWritingChange,refinementMetadata}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
let root,host,props
const settle=()=>new Promise(resolve=>setTimeout(resolve,40))
async function mount(overrides={}){
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 props={ref:createRef(),text:'Sample note text.',formats:[],hideCaret:false,searchQuery:'',matches:[],activeMatch:0,onChange:()=>{},...overrides}
 await act(async()=>{root.render(createElement(RichWritingEditor,props));await settle()})
 await act(settle)
}
function select(element,start,end){const range=document.createRange();const textNode=[...element.childNodes].find(n=>n.nodeType===Node.TEXT_NODE)??element.firstChild;range.setStart(textNode,start);range.setEnd(textNode,end);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'))}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove();root=null;window.getSelection().removeAllRanges()})
after(()=>{dom.window.close();channels.forEach(c=>{c.port1.close();c.port2.close()});globalThis.MessageChannel=NativeMessageChannel})

test('leaving the editor to select ordinary page text never pulls focus back',async()=>{
 await mount()
 const date=document.createElement('span');date.textContent='October 18, 2026';document.body.append(date)
 const input=host.querySelector('[role="textbox"]')
 await act(async()=>{input.focus();input.blur();select(date,0,date.textContent.length);await settle()})
 assert.equal(window.getSelection().toString(),'October 18, 2026')
 assert.notEqual(document.activeElement,input)
 date.remove()
})
test('caret visibility rerenders preserve selected note text without resetting editor options',async t=>{
 await mount()
 const input=host.querySelector('[role="textbox"]'),paragraph=input.querySelector('p')
 await act(async()=>{input.focus();select(paragraph,0,6);await settle()})
 assert.equal(window.getSelection().toString(),'Sample')
 const original=Editor.prototype.setOptions
 let updates=0
 t.mock.method(Editor.prototype,'setOptions',function(...args){updates++;return original.apply(this,args)})
 props={...props,hideCaret:true,formats:[]}
 await act(async()=>{root.render(createElement(RichWritingEditor,props));await settle()})
 assert.equal(updates,0)
 assert.equal(window.getSelection().toString(),'Sample')
 assert.equal(host.querySelector('[style*="--writing-caret-color"]').style.getPropertyValue('--writing-caret-color'),'transparent')
})

test('Enter saves the split before emitting the completed paragraph and leaves the caret on the next line',async()=>{
 const events=[]
 await mount({text:'Do ubr for four hrs',onChange:text=>events.push({text}),onParagraphComplete:paragraph=>events.push({paragraph})})
 const input=host.querySelector('[role="textbox"]')
 await act(async()=>{input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));await settle()})
 assert.equal(events[0].text,'Do ubr for four hrs\n')
 assert.deepEqual(events[1].paragraph,{id:'p:0',start:0,end:19,text:'Do ubr for four hrs'})
 assert.equal(input.querySelectorAll('p').length,2)
 const anchor=window.getSelection().anchorNode
 assert.equal((anchor.nodeType===Node.ELEMENT_NODE?anchor:anchor.parentElement).closest('p')===input.lastElementChild,true,'caret stays in the new paragraph')
})
test('Shift+Enter inserts a paragraph without refining and composition never submits',async()=>{
 const completed=[]
 await mount({onParagraphComplete:p=>completed.push(p)})
 const input=host.querySelector('[role="textbox"]')
 await act(async()=>{input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));await settle()})
 assert.equal(input.querySelectorAll('p').length,2);assert.equal(completed.length,0)
 await act(async()=>{input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));await settle()})
 assert.equal(completed.length,0)
})
test('Enter in the middle refines only the preceding text and leaves the rest on the next line',async()=>{
 const completed=[]
 await mount({text:'first rest',onParagraphComplete:p=>completed.push(p)})
 const input=host.querySelector('[role="textbox"]')
 await act(async()=>{select(input.querySelector('p'),5,5);await settle();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await settle()})
 assert.equal(completed.length,1);assert.equal(completed[0].text,'first')
 assert.equal(input.lastElementChild.textContent,' rest')
})
test('UI library task checkbox changes only completion metadata and supports undo',async t=>{
 t.mock.method(dom.window.HTMLElement.prototype,'getBoundingClientRect',()=>({...rect,right:800,bottom:600,width:800,height:600}))
 const changes=[]
 await mount({text:'Buy milk',tasks:[{start:0,end:8,checked:false}],onChange:(text,formats,_start,_edits,tasks)=>changes.push({text,formats,tasks})})
 const checkbox=host.querySelector('[role="checkbox"]')
 assert.equal(checkbox.getAttribute('aria-checked'),'false')
 await act(async()=>{checkbox.click();await settle()})
 assert.deepEqual(changes.at(-1),{text:'Buy milk',formats:[],tasks:[{start:0,end:8,checked:true}]})
 const input=host.querySelector('[role="textbox"]')
 assert.equal(input.textContent,'Buy milk')
 assert.equal(checkbox.closest('p'),input.querySelector('p'))
 assert.equal(checkbox.getAttribute('aria-label'),'Buy milk')
 assert.equal(input.querySelector('p').getAttribute('data-checked'),'true')
 await act(async()=>{input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true}));await settle()})
 assert.deepEqual(changes.at(-1).tasks,[{start:0,end:8,checked:false}])
})

test('Enter on a task checkbox never inserts a line or requests refinement',async()=>{
 const completed=[],changes=[]
 await mount({text:'Buy milk',tasks:[{start:0,end:8,checked:false}],onParagraphComplete:p=>completed.push(p),onChange:text=>changes.push(text)})
 const checkbox=host.querySelector('[role="checkbox"]')
 await act(async()=>{checkbox.focus();checkbox.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await settle()})
 assert.equal(host.querySelectorAll('[role="textbox"] p').length,1)
 assert.equal(completed.length,0)
 assert.equal(changes.length,0)
})

 test('repeated Enter after refinement or on empty lines never requests refinement again',async()=>{
 let entry=applyWritingChange(undefined,'rough note',Date.now(),()=> 'one'),calls=0
 const queue=new EnterRefinement(async p=>{calls++;return {paragraphs:[{id:p.id,text:'Clear note.',resources:[],isTodo:true}]}},'test')
 function save(text,formats,start,edits,tasks,refined){
  entry=applyWritingChange(entry,text,Date.now(),()=> 'new',start,formats,edits,tasks)
  if(refined)entry={...entry,refinedParagraphs:refined}
  queue.update(entry.text,entry.refinedParagraphs,edits,refined===undefined)
  props={...props,text:entry.text,formats:entry.formats??[],tasks:entry.tasks??[]}
  root.render(createElement(RichWritingEditor,props))
 }
 queue.update(entry.text,[],undefined,true)
 queue.setApply((p,result)=>{
  const next=refinementMetadata(entry.text,entry.refinedParagraphs??[],[p],result.paragraphs)
  const document=props.ref.current.replaceParagraphs(next.replacements)
  save(document.text,document.formats,undefined,document.edits,document.tasks??[],next.refinedParagraphs)
 })
 await mount({text:entry.text,onChange:save,onParagraphComplete:p=>queue.complete(p)})
 const input=host.querySelector('[role="textbox"]')
 const enter=async()=>act(async()=>{input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await settle()})
 await enter()
 assert.equal(calls,1);assert.equal(input.querySelector('p').lastChild.textContent,'Clear note.')
 for(let i=0;i<3;i++)await enter()
 assert.equal(calls,1,'empty paragraphs do not make requests')
 await act(async()=>{const p=input.querySelector('p'),length=p.lastChild.textContent.length;select(p,length,length);await settle()})
 await enter()
 assert.equal(calls,1,'an unchanged refined paragraph does not make another request')
 queue.cancel()
 })


test('dictation previews are temporary, typing pauses, selected text survives, and final insertion is undoable', async()=>{
 const changes=[]
 await mount({text:'Keep this text',formats:[{start:0,end:4,marks:['bold']}],onChange:(text,formats)=>changes.push({text,formats})})
 const input=host.querySelector('[role="textbox"]')
 await act(async()=>{input.focus();select(input.querySelector('strong'),0,4);await settle()})
 await act(async()=>{assert.equal(props.ref.current.beginDictation(),true);props.ref.current.previewDictation('and that');await settle()})
 assert.equal(input.getAttribute('contenteditable'),'false')
 assert.equal(input.getAttribute('aria-busy'),'true')
 assert.equal(input.querySelector('.dictation-preview').textContent,' and that')
 assert.equal(changes.length,0,'preview must never save provisional text')
 let paragraphs
 await act(async()=>{paragraphs=props.ref.current.finishDictation('and that');await settle()})
 assert.equal(input.getAttribute('contenteditable'),'true')
 assert.equal(input.querySelector('.dictation-preview'),null)
 assert.equal(changes.at(-1).text,'Keep and that this text')
 assert.deepEqual(changes.at(-1).formats,[{start:0,end:4,marks:['bold']}])
 assert.equal(paragraphs[0].text,'Keep and that this text')
 await act(async()=>{input.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));await settle()})
 assert.equal(changes.at(-1).text,'Keep this text')
})
test('multiline dictation inserts at the cursor without changing following paragraphs or tasks', async()=>{
 const changes=[]
 await mount({text:'Start\nBuy milk',tasks:[{start:6,end:14,checked:false}],onChange:(text,_f,_s,_e,tasks)=>changes.push({text,tasks})})
 const input=host.querySelector('[role="textbox"]')
 await act(async()=>{input.focus();select(input.querySelector('p'),5,5);await settle()})
 await act(async()=>{props.ref.current.beginDictation();props.ref.current.previewDictation('one\ntwo');props.ref.current.finishDictation('one\ntwo');await settle()})
 assert.equal(changes.at(-1).text,'Start one\ntwo\nBuy milk')
 assert.deepEqual(changes.at(-1).tasks,[{start:14,end:22,checked:false}])
})
test('stopping empty dictation restores editing without a document change', async()=>{
 const changes=[]
 await mount({onChange:text=>changes.push(text)})
 await act(async()=>{props.ref.current.beginDictation();props.ref.current.finishDictation('');await settle()})
 assert.equal(changes.length,0)
 assert.equal(host.querySelector('[role="textbox"]').getAttribute('contenteditable'),'true')
})
test('replacement from another device cancels dictation without applying speech to the newer document',async()=>{
 const changes=[]
 await mount({onChange:text=>changes.push(text),onDictationInvalidated:()=>props.ref.current.finishDictation('')})
 await act(async()=>{props.ref.current.beginDictation();props.ref.current.previewDictation('stale speech');await settle()})
 props={...props,text:'Newer cloud writing'}
 await act(async()=>{root.render(createElement(RichWritingEditor,props));await settle()})
 const input=host.querySelector('[role="textbox"]')
 assert.equal(input.textContent,'Newer cloud writing')
 assert.equal(input.getAttribute('contenteditable'),'true')
 assert.equal(input.getAttribute('aria-busy'),'false')
 assert.equal(changes.length,0)
})
test('inline timer buttons start and pause without entering the countdown into saved text',async()=>{
 const text='Study React for 30 minutes.',changes=[]
 await mount({text,tasks:[{start:0,end:text.length,checked:false,timer:{durationSeconds:1800,remainingMs:1800000}}],onChange:(text,_f,_s,_e,tasks)=>changes.push({text,tasks})})
 let start=host.querySelector('[aria-label="Start timer: 30:00"]')
 assert.ok(start)
 await act(async()=>{start.click();await settle()})
 assert.equal(changes.at(-1).text,text)
 assert.ok(changes.at(-1).tasks[0].timer.endsAt)
 const pause=host.querySelector('[aria-label^="Stop timer:"]')
 assert.ok(pause)
 assert.equal(pause,start,'timer control stays mounted when its state changes')
 await act(async()=>{pause.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await settle()})
 assert.equal(host.querySelector('[role="textbox"]').querySelectorAll('p').length,1)
 await act(async()=>{pause.click();await settle()})
 assert.equal(changes.at(-1).tasks[0].timer.endsAt,undefined)
 assert.equal(changes.at(-1).text,text)
 const checkbox=host.querySelector('[role="checkbox"]')
 await act(async()=>{checkbox.click();await settle()})
 assert.equal(changes.at(-1).tasks[0].checked,true)
 assert.equal(host.querySelector('[data-task-timer]'),null,'completed task hides the timer')
 await act(async()=>{host.querySelector('[role="checkbox"]').click();await settle()})
 assert.equal(changes.at(-1).tasks[0].checked,false)
 assert.ok(host.querySelector('[data-task-timer]'),'unchecking restores the paused timer')
 assert.equal(changes.at(-1).tasks[0].timer.endsAt,undefined)
})

test('the library deletion dialog keeps notes on cancel and clears only after its destructive action',async t=>{
 const changes=[]
 await mount({text:'My important notes',onChange:text=>changes.push(text)})
 t.mock.method(window,'confirm',()=>assert.fail('Native browser alerts are not allowed'))
 const input=host.querySelector('[role="textbox"]')
 await act(async()=>{input.focus();select(input.querySelector('p'),0,18);input.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}));await settle()})
 let dialog=host.querySelector('[role="alertdialog"]')
 assert.ok(dialog?.open)
 assert.match(dialog.textContent,/syncs the deletion to your account/)
 assert.equal(input.textContent,'My important notes');assert.deepEqual(changes,[])
 await act(async()=>{[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Keep notes').click();await settle()})
 assert.equal(host.querySelector('[role="alertdialog"]'),null)
 assert.equal(input.textContent,'My important notes');assert.deepEqual(changes,[])
 await act(async()=>{select(input.querySelector('p'),0,18);input.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}));await settle()})
 dialog=host.querySelector('[role="alertdialog"]')
 await act(async()=>{[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Delete notes').click();await settle()})
 assert.deepEqual(changes,[''])
 assert.equal(host.querySelector('[role="alertdialog"]'),null)
})
test('Escape dismisses the library delete dialog without saving a deletion',async()=>{
 const changes=[]
 await mount({text:'Keep these notes',onChange:text=>changes.push(text)})
 const input=host.querySelector('[role="textbox"]')
 await act(async()=>{select(input.querySelector('p'),0,16);input.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));await settle()})
 const dialog=host.querySelector('[role="alertdialog"]')
 assert.ok(dialog)
 await act(async()=>{dialog.dispatchEvent(new Event('cancel',{cancelable:true}));await settle()})
 assert.equal(host.querySelector('[role="alertdialog"]'),null)
 assert.equal(input.textContent,'Keep these notes');assert.deepEqual(changes,[])
})
