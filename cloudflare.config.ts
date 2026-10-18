import { bindings, defineConfig } from 'cf/config'

export default defineConfig({
  accountId: '63ff85300a67b5fe6be015ba4e55d394',
  worker: {
    name: 'notes',
    domains: ['notes.ideatinglabs.com'],
    workersDev: true,
    previewUrls: false,
    entrypoint: './worker/index.ts',
    compatibilityDate: '2026-10-14',
    env: {
      DB: bindings.d1({ id: '06d0b496-2252-4a5a-b486-0924eff2f04a', name: 'notes-db' }),
      OPENAI_API_KEY: bindings.secret(),
      SPEECH_LIMITER: bindings.rateLimit({ namespace: '1002', simple: { limit: 5, period: 60 } }),
      REFINE_LIMITER: bindings.rateLimit({ namespace: '1001', simple: { limit: 10, period: 60 } }),
      ALLOWED_ORIGINS: bindings.text('http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5175,http://localhost:5175,http://127.0.0.1:4173,http://localhost:4173'),
    },
    observability: {
      enabled: true,
      redactQueryString: true,
      logs: { enabled: true, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 0.01 },
    },
  },
})
