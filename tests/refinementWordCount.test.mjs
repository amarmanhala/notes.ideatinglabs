import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built=await build({stdin:{contents:`export {refinementWordCount} from './src/refinementWordCount'; export {validateParagraphResults} from './src/refinementState';`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',write:false})
const {refinementWordCount,validateParagraphResults}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)

test('only one standalone leading emoji is exempt, including composed Unicode emoji',()=>{
 for(const emoji of ['🎂','📅','✈️','👩🏽‍💻','🇨🇦','1️⃣'])assert.equal(refinementWordCount(`${emoji} A clear event.`),3)
 assert.equal(refinementWordCount('A 🎂 clear event.'),4)
 assert.equal(refinementWordCount('🎂 🎉 A clear event.'),4)
 assert.equal(refinementWordCount('123 A clear event.'),4)
 assert.equal(refinementWordCount('  A clear event.  '),3)
 assert.equal(refinementWordCount(''),0)
 assert.equal(refinementWordCount('🎂 Dad’s birthday.\n📅 Team meeting.\n'),4)
})
test('emoji never bypasses extra-word or character-length validation',()=>{
 const text='Dad’s birthday is on October 25 and the family will celebrate together.'
 const requested=[{id:'a',text}]
 assert.equal(validateParagraphResults([{id:'a',text:`🎂 ${text}`}],requested)[0].text,`🎂 ${text}`)
 for(const output of [`🎂 🎉 ${text}`,`🎂 ${text} Extra.`,`🎂 ${'x'.repeat(12000)}`])assert.throws(()=>validateParagraphResults([{id:'a',text:output}],requested))
 const existing=[{id:'a',text:`🎂 ${text}`}]
 assert.throws(()=>validateParagraphResults([{id:'a',text:`🎂 ${text} Extra.`}],existing))
})
