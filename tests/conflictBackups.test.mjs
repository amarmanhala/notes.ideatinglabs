import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const built=await build({entryPoints:['src/conflictBackups.ts'],bundle:true,format:'esm',platform:'browser',write:false})
const {backupConflict,CONFLICT_BACKUP_KEY}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const entry={text:'Buy milk',createdAt:'2026-10-18T12:00:00Z',updatedAt:'2026-10-18T12:00:00Z',sessions:[],tasks:[{start:0,end:8,checked:true}],formats:[{start:0,end:3,marks:['bold']}],refinedParagraphs:[{start:0,end:8,resources:[]}]}
test('both complete versions are appended to recoverable browser backups',()=>{
 const values=new Map([[CONFLICT_BACKUP_KEY,JSON.stringify([{older:'backup'}])]])
 const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)}
 const conflict={day:'2026-10-18',local:entry,cloud:{...entry,text:'Buy oats'},revision:8}
 backupConflict(storage,conflict)
 const saved=JSON.parse(values.get(CONFLICT_BACKUP_KEY))
 assert.deepEqual(saved[0],{older:'backup'})
 assert.deepEqual(saved[1].local,entry)
 assert.deepEqual(saved[1].cloud,conflict.cloud)
 assert.equal(saved[1].revision,8)
 assert.ok(Number.isFinite(Date.parse(saved[1].savedAt)))
})
test('corrupt backups and storage limits fail before applying a version',()=>{
 for(const raw of ['invalid','{}'])assert.throws(()=>backupConflict({getItem:()=>raw,setItem:()=>assert.fail('must preserve the existing backup')},{}),/could not be read/)
 assert.throws(()=>backupConflict({getItem:()=>null,setItem:()=>{throw new Error('Quota exceeded')}},{}),/could not be backed up/)
})
