# Notes

A quiet writing app using React, React Router, native OpenAI Apps SDK UI, and a Cloudflare Worker backed by D1.

## Run and verify

```sh
npm install
npm run dev
npm test
npm run lint
npm run build
npm run build:worker
```

Runtime tests use Miniflare's local sockets and SQLite; a restricted sandbox may need permission to open the test socket. Browser UI testing is intentionally deferred.

The production frontend defaults to `https://notes.ideatinglabs.com`. Local Vite development proxies `/api` to the same live backend. For newly published DNS records, the proxy can resolve this exact hostname through Cloudflare public DNS while keeping HTTPS certificate verification enabled. To target another backend, copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL`. The backend must allow that frontend origin in `ALLOWED_ORIGINS` in `cloudflare.config.ts`. Current allowed development origins are localhost and 127.0.0.1 on ports 5173 and 4173.

## Writing and saving

- A fixed header/footer and borderless writing area, with scrolling only inside the editor.
- Automatic local saving on every text change, and cloud saving after a 500ms pause.
- A new writing session after at least two minutes without a text change, including edits, paste, and deletion. Original capture and latest edit times stay separate.
- The Clock button reveals relative timestamps beside writing with native Animate and Tooltip. It is hidden on empty pages. Timestamps do not shift note text.
- Sessions on the same visual line share a relative label; its tooltip lists every session's exact timestamps.
- A 20px writing font, thicker blue caret, word count, and disabled spelling/grammar highlights.
- Select text and press Cmd+B for bold or Cmd+I for italic (Ctrl on Windows/Linux). These shortcuts toggle the selected style; no formatting buttons are shown. Validated formatting ranges are saved alongside plain text in local storage and D1. Undo/redo is supported; old plain-text notes remain compatible.
- React Router serves `/today` and `/day/:date`. Search currently has a native field; search results and time-view navigation are future work.

Local writing is kept under `notes.writing.v1`. Existing browser notes become one initial session and are uploaded automatically when connecting to an empty cloud history. Migration preserves original text and dates.

The footer distinguishes Connecting, Saving to cloud, Saved to cloud, and offline/cloud-unavailable local drafts. Network failures retain local drafts and retry every 15 seconds and on reconnection. A single save queue keeps rapid edits in order. Atomic cloud revision checks reject stale writes. Conflicts retain the local draft and show an alert rather than silently replacing cloud writing; resolving competing versions has not yet been added.

## Speak to type

The mic above the footer inserts speech at the editor selection's end, preserving selected text. The browser requests microphone access on first use. Five volume-reactive bars appear beside **Listening…** and **Stop**; reduced motion uses static bars. Typing pauses until transcription finishes, while scrolling remains available. Live words are temporary editor decorations. Stop commits the transcript as one undoable insertion, then sends only its affected paragraphs through the existing refinement and to-do flow.

The local Vite server and Worker share `POST /api/speech/session`. It requires the existing browser identity, checks origins, limits starts to five per minute, and issues a 60-second OpenAI client credential. WebRTC streams audio directly to OpenAI using `gpt-4o-mini-transcribe` with automatic language detection. The permanent API key remains on the server; the app stores only finalized note text. The development footer shows speech activity, returned token usage when available, and the transcript.

Stop releases microphone capture immediately and waits up to 15 seconds for final text. Timeout or failure keeps received words editable and unrefined. Day navigation and page cleanup close the connection; replacement by a newer cloud document cancels the insertion without overwriting that document. Sessions stop after five minutes. Speech is temporarily hidden for launch in both development and production. Its implementation is retained; set `VITE_SPEECH_ENABLED=true` to re-enable the controls when ready. Local speech uses the existing server-only `OPENAI_API_KEY`. For production, deploy the updated Worker with its `OPENAI_API_KEY` secret and `SPEECH_LIMITER` binding, then build the frontend with `VITE_SPEECH_ENABLED=true`. Production speech is hidden by default.

## Refine rough notes

Press **Enter** after writing a paragraph to clean it up with OpenAI. Stopping speech transcription uses the same refinement flow. Each nonempty line is a paragraph. Existing writing starts as unrefined; processed paragraphs are skipped until their text changes, and formatting-only edits do not reset their status. Eligible text becomes lighter with a three-second moving highlight while the request runs. Reduced motion uses static lighter text. The effect is a temporary ProseMirror decoration, never saved formatting. There are no success alerts or badges; errors appear as small text in the toolbar.

The batch endpoint accepts `{ paragraphs: [{ id, text }] }` and returns one `{ id, text, resources }` result per requested id. Eligible paragraphs share one model request. Every result is validated before any text is applied; missing, duplicate, empty, multiline, truncated, or unexpectedly expanded results leave all writing untouched. The previous `{ text }` endpoint shape remains supported for older clients. Each output keeps the original meaning and stays within its source word count (with a small allowance for fragments), capped at 300 words per paragraph. Batches are limited to 100 paragraphs and 12,000 input characters. Text changes affecting the paragraph cancel its request; formatting-only changes retain it; day navigation aborts without updating the old day.

Refined replacements form one undoable editor transaction and preserve untouched paragraphs, formatting, and timestamp anchors. Optional `refinedParagraphs` metadata stores processed text ranges and their learning links. Metadata persists locally and in D1 without a database migration. Older cloud responses missing metadata cannot strip it when the text is identical. Text edits invalidate the affected paragraphs and shift unchanged ranges, including duplicate paragraphs. Deploy the updated Worker before relying on cross-device refinement tracking.

Learning goals are corrected like other notes (for example, `Learn rect` becomes `Learn React`) without web searches or added resources. Previously saved resource metadata remains compatible with storage, but resource links are no longer shown in the notes view.

For local development, set `OPENAI_API_KEY` in `.env.local` and keep `VITE_API_BASE_URL` blank. Restart `npm run dev` after changing environment variables if Vite does not reload them automatically. The local `/api/refine` handler runs in the Vite server; the secret is never sent to the browser. The `/api/speech/session` handler also runs locally. Other `/api` calls still proxy to the existing cloud backend.

For production, configure the `OPENAI_API_KEY` secret on the **notes** Worker and deploy the updated Worker with `npm run deploy`. The existing `cf` CLI also accepts a secrets file during deployment. The Worker authenticates with the existing private browser key, allows configured frontend origins, and limits requests to ten per minute per IP at each Cloudflare location. The API integration uses `gpt-5.4-mini` through the Responses API with `store: false`. Paragraphs are sent for refinement only after Enter or completed speech transcription; note text and API keys are not logged by this application. Responses are not cached. A missing key shows a setup message and preserves the note.

## Inline task timers

After Enter refines a task with an explicit duration, an idle countdown appears immediately after its text using the same font and color. For example, `Study React for 30 minutes` gets `30:00`. Click the plain play icon to start the countdown. While running, it becomes a stop icon that stops the countdown at its current remaining time; play resumes it. Use the small reset control to restore its original duration. Reaching zero leaves the task unchecked and shows no completion banner. Checking the task stops and hides its timer. Unchecking restores the paused timer. Broad goals, dates, clock times, and delayed reminders do not receive timers.

The refinement response adds nullable `timerSeconds`, capped at seven days. Optional `tasks[].timer` metadata saves `{ durationSeconds, remainingMs, endsAt? }`, with `endsAt` set only while running. Only control actions save metadata; countdown ticks do not generate API calls or writing sessions. A running timer uses its end timestamp to stay accurate after reload or backgrounding. Editing the timed sentence clears its old timer; formatting and edits elsewhere preserve it. Timer controls are editor decorations and are excluded from saved note text and exports. Old notes without timers remain supported. Deploy the updated Worker before relying on timers across devices; the client preserves local timer metadata if an older backend omits it for an otherwise identical task.

## Backend details

Worker: **notes**. Database: **notes-db**. Configuration: `cloudflare.config.ts`. Schema: `worker/migrations/0001_notes.sql`.

| Endpoint | Behavior |
| --- | --- |
| `POST /api/speech/session` | Create a short-lived transcription credential |
| `GET /api/health` | Public Worker/D1 health check |
| `GET /api/notes` | Load this browser's history and revision numbers |
| `PUT /api/notes/:day` | Save `{ entry, baseRevision }`, including session metadata |

Private endpoints require `Authorization: Bearer <browser-key>`. The app generates a cryptographically random 256-bit key and stores it under `notes.identity.v1`; D1 stores only its SHA-256 owner identifier. There are no hardcoded frontend credentials or shared public notes. Each browser identity has separate data. Notes are not logged and responses are not cached. Request bodies are limited to 512 KiB.

This is browser-key access, not account sign-in. Another browser/device cannot recover the same notes yet. Clearing the browser key removes access to its cloud notes even though they remain in D1. Keep browser data until account login/recovery or export is added. Notes are stored in D1; application-level end-to-end encryption has not been added.

## Cloudflare setup and deployment

The requested [Cloudflare setup instructions](https://developers.cloudflare.com/agent-setup/prompt.md) were followed: Cloudflare skills installed globally, the existing Codex Cloudflare MCP connection authenticated, and `cf` installed in this project's development dependencies and authenticated. No global CLI installation or unrelated configuration replacement was needed.

```sh
npm run deploy
```

This builds a typed Worker and deploys its prebuilt output using the pinned Cloudflare CLI. The frontend continues to run locally; this command deploys the backend only. For a new database, apply the SQL migration and update the D1 binding before deployment. Logs and traces are enabled; preview URLs are disabled.

The live check in `scripts/check-live.mjs` verifies public HTTPS, D1 round-trip, sessions, authorization, CORS, isolation, revision conflicts, and safe retry using a disposable browser identity. The initial rollout also used a temporary Cloudflare check Worker, which was removed along with its schedule and test records. Existing personal notes are never read or uploaded for testing.

## Next steps

Account sign-in and recovery, revision history/export, working search, Today/Week/Month/Year navigation, then user-controlled AI review and idea development.

## Dependency status

Apps SDK UI's Lodash and math dependencies currently report six npm advisories, including one high severity advisory. The app does not use Markdown/math rendering or Lodash template functions. Review upstream updates before a wider production release.
# notes.ideatinglabs
