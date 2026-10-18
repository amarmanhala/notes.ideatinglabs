import { useState } from 'react'
import { Alert } from '@openai/apps-sdk-ui/components/Alert'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import type { NoteConflict } from './cloudSync'
import type { Entry } from './writingSessions'
import { toRichDocument } from './richDocument'

function VersionPreview({ entry, title }: { entry: Entry; title: string }) {
  const document = toRichDocument(entry.text, entry.formats, entry.tasks)
  return <div className="min-w-0">
    <h4 className="mb-1 text-sm font-medium">{title}</h4>
    <p className="mb-2 text-xs text-secondary">Updated {new Date(entry.updatedAt).toLocaleString()}</p>
    <div tabIndex={0} aria-label={title} className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-subtle bg-surface p-3 text-sm">
      {document.content?.map((paragraph, index) => <p key={index} className="min-h-5">
        {paragraph.attrs?.todo && <span aria-label={paragraph.attrs.checked ? 'Completed task' : 'Task'} className="mr-2">{paragraph.attrs.checked ? '☑' : '☐'}</span>}
        {paragraph.content?.map((node, index) => <span key={index} className={`${node.marks?.some(mark => mark.type === 'bold') ? 'font-bold' : ''} ${node.marks?.some(mark => mark.type === 'italic') ? 'italic' : ''}`}>{node.text}</span>)}
      </p>)}
    </div>
  </div>
}

export function SyncConflictNotice({ conflicts, onRetry, onResolve }: {
  conflicts: NoteConflict[]
  onRetry: () => Promise<void>
  onResolve: (conflict: NoteConflict, choice: 'local' | 'cloud') => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to resolve this version. Your draft is safe.') }
    finally { setBusy(false) }
  }
  return <section aria-label="Resolve cloud versions" className="max-h-[60dvh] shrink-0 overflow-y-auto px-6 pt-4">
    <Alert color="caution" title="Choose the version to keep" description="Your local draft is safe. Review both versions to resume cloud saving." actions={<Button color="secondary" variant="outline" size="sm" pill={false} disabled={busy} onClick={() => { setExpanded(true); void run(onRetry) }}>{busy ? 'Checking…' : expanded ? 'Check again' : 'Review versions'}</Button>} />
    {expanded && <div className="mt-3 space-y-4">
      <p className="text-xs text-secondary">Both copies, including formatting and task status, are backed up in this browser before a version is applied.</p>
      {!conflicts.length && <p className="text-sm text-secondary">Check again to load the latest cloud version.</p>}
      {conflicts.map(conflict => <div key={conflict.day} className="rounded-xl border border-subtle p-4">
        <h3 className="mb-3 text-sm font-semibold">Notes for {new Date(`${conflict.day}T12:00:00`).toLocaleDateString()}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <VersionPreview entry={conflict.local} title="This draft" />
          <VersionPreview entry={conflict.cloud} title="Cloud version" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button color="info" size="sm" pill={false} disabled={busy} onClick={() => { void run(() => onResolve(conflict, 'local')) }}>Keep this draft</Button>
          <Button color="secondary" variant="outline" size="sm" pill={false} disabled={busy} onClick={() => { void run(() => onResolve(conflict, 'cloud')) }}>Use cloud version</Button>
        </div>
      </div>)}
    </div>}
    {error && <p role="status" className="mt-2 text-sm text-secondary">{error}</p>}
  </section>
}
