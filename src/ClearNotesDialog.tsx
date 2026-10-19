import { useEffect, useRef } from 'react'
import { Alert } from '@openai/apps-sdk-ui/components/Alert'
import { Button } from '@openai/apps-sdk-ui/components/Button'

export function ClearNotesDialog({ onKeep, onDelete }: { onKeep: () => void; onDelete: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [])
  return <dialog ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby="clear-notes-title" aria-describedby="clear-notes-description"
    onCancel={event => { event.preventDefault(); onKeep() }} onClose={onKeep}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border-0 bg-surface p-6 text-primary shadow-2xl backdrop:bg-black/40 sm:p-8">
    <Alert color="primary" variant="outline" indicator={false} className="p-0 shadow-none!" actionsPlacement="bottom"
      title={<h2 id="clear-notes-title" className="text-xl font-semibold">Delete all notes on this page?</h2>}
      description={<span id="clear-notes-description" className="mt-2 block text-sm leading-relaxed text-secondary">This clears the text on this page and syncs the deletion to your account. You can undo it while this page is open.</span>}
      actionsClassName="flex w-full flex-wrap justify-end gap-3"
      actions={<><Button autoFocus color="secondary" variant="outline" size="lg" pill={false} onClick={onKeep}>Keep notes</Button><Button color="danger" size="lg" pill={false} onClick={onDelete}>Delete notes</Button></>} />
  </dialog>
}
