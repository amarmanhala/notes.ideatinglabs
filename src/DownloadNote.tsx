import { useState } from 'react'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Download } from '@openai/apps-sdk-ui/components/Icon'
import { Menu } from '@openai/apps-sdk-ui/components/Menu'
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip'
import { createNoteDownload, saveDownload, type DownloadFormat } from './exportNote'
import type { TextFormat } from './textFormatting'

type Props = { text: string; formats: TextFormat[]; day: string; onError: (message: string | null) => void }

export function DownloadNote({ text, formats, day, onError }: Props) {
  const [busy, setBusy] = useState(false)
  async function download(format: DownloadFormat) {
    if (busy) return
    setBusy(true)
    onError(null)
    try {
      const file = await createNoteDownload(text, formats, day, format)
      saveDownload(file.blob, file.filename)
    } catch {
      onError('The note could not be downloaded. Please try again.')
    } finally { setBusy(false) }
  }

  return <div data-note-download>
    <Menu>
      <Menu.Trigger disabled={!text.trim() || busy}>
        <Tooltip content="Download note" compact side="bottom">
        <Button color="secondary" variant="ghost" size="sm" uniform pill={false} disabled={!text.trim() || busy} loading={busy} aria-label="Download note"><Download /></Button>
        </Tooltip>
      </Menu.Trigger>
      <Menu.Content align="end" minWidth={160}>
        <Menu.Item onSelect={() => { void download('txt') }}>Plain text (.txt)</Menu.Item>
        <Menu.Item onSelect={() => { void download('docx') }}>Word document (.docx)</Menu.Item>
        <Menu.Item onSelect={() => { void download('pdf') }}>PDF document (.pdf)</Menu.Item>
        <Menu.Item onSelect={() => { void download('md') }}>Markdown (.md)</Menu.Item>
      </Menu.Content>
    </Menu>
  </div>
}
