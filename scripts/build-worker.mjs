import { build } from 'esbuild'
import { mkdir, copyFile } from 'node:fs/promises'
import { resolveAndParseConfig } from '@cloudflare/config'
import { getWorkerBundleDir, writeRootConfig, writeWorkerConfig, writeAssets } from '@cloudflare/build-output-utils'
import config from '../cloudflare.config.ts'

const root = process.cwd()
const context = { isPreview: false, mode: 'production' }
const parsed = await resolveAndParseConfig(config, context)
if (!parsed.success) throw parsed.error
const worker = parsed.data.worker
if (!worker) throw new Error('Missing Worker configuration')
await build({ entryPoints: ['worker/index.ts'], outfile: '.cloudflare/worker.mjs', bundle: true, format: 'esm', platform: 'browser', target: 'es2023', sourcemap: false })
const bundle = getWorkerBundleDir(root)
await mkdir(bundle, { recursive: true })
await copyFile('.cloudflare/worker.mjs', `${bundle}/worker.mjs`)
await writeAssets({ root, sourceDirectory: `${root}/dist` })
await writeRootConfig(root, { accountId: config.accountId }, context)
await writeWorkerConfig({ root, config: worker, manifest: { type: 'complete', mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm' } } } })
console.log('Built .cloudflare/worker.mjs and Cloudflare prebuilt deployment output')
