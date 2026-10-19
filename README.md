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

Runtime tests use Miniflare's local sockets and SQLite; a restricted sandbox may need permission to open the test socket. Authentication UI and approval flows are also verified against the local app and Supabase.

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

Local drafts, revisions and conflict backups use an account-specific `notes.account.<user-id>.` prefix. Earlier anonymous drafts remain untouched in their original keys and are never automatically assigned to an account. Signing out preserves each account’s drafts.

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

For production, configure the `OPENAI_API_KEY` secret on the **notes** Worker and deploy the updated Worker with `npm run deploy`. The existing `cf` CLI also accepts a secrets file during deployment. The Worker validates the Supabase session and current beta approval, allows configured frontend origins, and limits requests to ten per minute per IP at each Cloudflare location. The API integration uses `gpt-5.4-mini` through the Responses API with `store: false`. Paragraphs are sent for refinement only after Enter or completed speech transcription; note text and API keys are not logged by this application. Responses are not cached. A missing key shows a setup message and preserves the note.

## First-time welcome

The first Notes visit shows “What should we call you?” and an optional **Name** field directly in the writing area, followed by a short inline greeting. No dialog or card is shown. **Skip** keeps the name empty. Closing the welcome also marks it seen, so it is not shown again. The name uses Supabase Auth’s `full_name` metadata, and `notes_welcome_seen` tracks completion across devices; neither field authorizes access. Existing metadata is preserved.

An account-scoped `notes.welcome.v1` browser record marks the welcome seen immediately and queues failed profile saves for reconnect or the next visit. Names and greeting copy are never inserted into note content. The avatar uses the saved name automatically after the profile sync.

## Feedback

The writing-page footer has a **Feedback** button that opens a compact UI-library card. Signed-in approved users can submit up to 2,000 characters. Feedback is stored in the Cloudflare **notes-db** D1 database's `feedback` table with the server-derived account owner ID, message, ID and timestamp. Review submissions in Cloudflare’s D1 console; there is no public feedback read endpoint. Retries reuse the submission ID, and failed submissions keep the draft. The API allows five submissions per user per minute.

Apply `worker/migrations/0002_feedback.sql` before deploying the feedback Worker. The `FEEDBACK_LIMITER` binding uses namespace 1004. Feedback does not send note contents or trigger OpenAI.

## Inline task timers

After Enter refines a task with an explicit duration, an idle countdown appears immediately after its text using the same font and color. For example, `Study React for 30 minutes` gets `30:00`. Click the plain play icon to start the countdown. While running, it becomes a stop icon that stops the countdown at its current remaining time; play resumes it. Use the small reset control to restore its original duration. Reaching zero leaves the task unchecked and shows no completion banner. Checking the task stops and hides its timer. Unchecking restores the paused timer. Broad goals, dates, clock times, and delayed reminders do not receive timers.

The refinement response adds nullable `timerSeconds`, capped at seven days. Optional `tasks[].timer` metadata saves `{ durationSeconds, remainingMs, endsAt? }`, with `endsAt` set only while running. Only control actions save metadata; countdown ticks do not generate API calls or writing sessions. A running timer uses its end timestamp to stay accurate after reload or backgrounding. Editing the timed sentence clears its old timer; formatting and edits elsewhere preserve it. Timer controls are editor decorations and are excluded from saved note text and exports. Old notes without timers remain supported. Deploy the updated Worker before relying on timers across devices; the client preserves local timer metadata if an older backend omits it for an otherwise identical task.

## Backend details

Worker: **notes**. Database: **notes-db**. Configuration: `cloudflare.config.ts`. Schema: `worker/migrations/0001_notes.sql`.

| Endpoint | Behavior |
| --- | --- |
| `POST /api/speech/session` | Create a short-lived transcription credential |
| `GET /api/health` | Public Worker/D1 health check |
| `GET /api/notes` | Load this account’s history and revision numbers |
| `PUT /api/notes/:day` | Save `{ entry, baseRevision }`, including session metadata |

Private endpoints require `Authorization: Bearer <Supabase-access-token>`. The server verifies the session with Supabase Auth and checks the email’s current approval. D1 scopes notes to a SHA-256 hash of `supabase:<user-id>`. Previous browser keys cannot authorize requests. Notes and credentials are not logged; responses are not cached. Request bodies are limited to 512 KiB. Application-level end-to-end encryption has not been added.

## Email and password access

Google sign-in is intentionally unavailable. Supabase’s **notes** project handles email/password accounts, email confirmation, sessions and sign-out.

1. In the [Supabase Table Editor](https://supabase.com/dashboard/project/gcntpdfxhsqecqecukyj/editor), open **beta_access** and insert the user’s lowercase email. New rows default to **approved**. No invitation or access request is needed.
2. The user chooses **Sign up**, enters that email and a password, and confirms their email. They can then **Log in** with email and password.
3. Change status to **rejected** or delete the email to block subsequent API requests, including sessions already signed in. Existing pending/rejected rows remain blocked until explicitly approved.

The homepage has no invite link, and the public invite-request API is removed. Users cannot add themselves to the access list. Passwords are handled exclusively by Supabase Auth; adding an email to the access table does not create an Auth account by itself.

The migrations in `supabase/migrations` create the approval table, row security and the before-user-created hook. Users can only read their own status and cannot add or approve accounts. The hook blocks unlisted account creation, including direct Auth API calls. `supabase/config.toml` records callback URLs and hook settings.

Copy `.env.example` to `.env.local`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the browser. `OPENAI_API_KEY` stays server-only. The running app no longer needs a Supabase secret key because it does not write access-list rows.

Before publishing a frontend, set its public URL in **Supabase Authentication → URL Configuration** (Site URL and `/auth/callback` redirect), update `supabase/config.toml`, and add its origin to the Worker’s `ALLOWED_ORIGINS`. Current callbacks support local ports 5173, 5175 and 4173. Dashboard invitations use the configured Site URL by default.

## Authentication and account-isolation verification

The Worker verifies each session with Supabase Auth, checks email confirmation and the current access-list row, and derives every D1 owner from the verified user ID. Client-supplied owner IDs never select the database owner. The frontend also requires the server-verified account ID to match the account whose local drafts it opens.

The regression suite covers forged credentials, unconfirmed/unlisted accounts, cross-account owner parameters, separate local drafts, sign-out during credential retrieval, and late responses after switching accounts. A live check with two disposable Supabase accounts verified isolated D1 saves/loads, same-user access from another login, tampered-token rejection, approval revocation and signed-out token replay rejection. Test accounts and their D1 notes were removed afterward. Server secrets were checked against the frontend bundle and source configuration.

Supabase's security advisor currently reports **leaked-password protection disabled**. That additional protection is available on Pro and above; see [Supabase password security](https://supabase.com/docs/guides/auth/password-security). Email confirmation remains enabled. Browser sessions and per-user drafts are persisted locally, so shared browser profiles retain cached drafts after sign-out.

## Cloudflare setup and deployment

The requested [Cloudflare setup instructions](https://developers.cloudflare.com/agent-setup/prompt.md) were followed: Cloudflare skills installed globally, the existing Codex Cloudflare MCP connection authenticated, and `cf` installed in this project's development dependencies and authenticated. No global CLI installation or unrelated configuration replacement was needed.

```sh
npm run deploy
```

This builds a typed Worker and deploys its prebuilt output using the pinned Cloudflare CLI. The frontend continues to run locally; this command deploys the backend only. For a new database, apply the SQL migration and update the D1 binding before deployment. Logs and traces are enabled; preview URLs are disabled.

The live check in `scripts/check-live.mjs` verifies public HTTPS, D1 round-trip, sessions, authorization, CORS, isolation, revision conflicts, and safe retry using two explicitly supplied disposable approved account sessions. The initial rollout also used a temporary Cloudflare check Worker, which was removed along with its schedule and test records. Existing personal notes are never read or uploaded for testing.

## Next steps

Password recovery, beta feedback, and production frontend URL configuration.

## Dependency status

Apps SDK UI's Lodash and math dependencies currently report six npm advisories, including one high severity advisory. The app does not use Markdown/math rendering or Lodash template functions. Review upstream updates before a wider production release.
# notes.ideatinglabs
