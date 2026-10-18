import { useEffect, useRef, useState } from 'react'
import { Alert } from '@openai/apps-sdk-ui/components/Alert'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Textarea } from '@openai/apps-sdk-ui/components/Textarea'
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip'
import { Animate } from '@openai/apps-sdk-ui/components/Transition'
import { ArrowUp, ChatCompose, CircleQuestion, Lightbulb, Paperclip, Sparkles, X } from '@openai/apps-sdk-ui/components/Icon'
import { ReviewPanel } from './ReviewPanel'
import type { Entry } from './writingSessions'

type Props = { entry?: Entry; dateLabel: string; isToday: boolean; onClose: () => void }

export function AskAIPanel({ entry, dateLabel, isToday, onClose }: Props) {
  const [reviewing, setReviewing] = useState(false)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [notice, setNotice] = useState(false)
  const composer = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const canSend = !!draft.trim() || files.length > 0

  useEffect(() => { closeButton.current?.focus({ preventScroll: true }) }, [])

  function startNew() {
    setReviewing(false)
    setDraft('')
    setFiles([])
    setNotice(false)
    composer.current?.focus({ preventScroll: true })
  }
  function explore() {
    setDraft('Help me explore this idea: ')
    setNotice(false)
    composer.current?.focus({ preventScroll: true })
  }
  function send() {
    if (canSend) setNotice(true)
  }

  return <aside id="review-panel" data-review-panel aria-labelledby="ask-ai-title" className="flex h-full w-full flex-col bg-surface-secondary text-primary md:border-l md:border-default" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
  }}>
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4">
      <h2 id="ask-ai-title" className="text-sm font-semibold">Ask AI</h2>
      <div className="flex items-center gap-1">
        <Tooltip content="Start a new chat" compact side="bottom"><Button color="secondary" variant="ghost" size="sm" uniform pill={false} aria-label="Start a new chat" onClick={startNew}><ChatCompose /></Button></Tooltip>
        <Tooltip content="Close Ask AI" compact side="bottom"><Button ref={closeButton} color="secondary" variant="ghost" size="sm" uniform pill={false} aria-label="Close Ask AI" onClick={onClose}><X /></Button></Tooltip>
      </div>
    </header>

    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {reviewing ? <ReviewPanel embedded entry={entry} dateLabel={dateLabel} isToday={isToday} onClose={onClose} /> : <div className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-4 pt-6 pb-4">
        <div className="space-y-4">
          <h3 className="heading-lg">What can I help you with?</h3>
          <div className="flex flex-col">
            <Button color="secondary" variant="ghost" size="3xl" iconSize="lg" pill={false} block gutterSize="sm" className="justify-start text-base" onClick={() => composer.current?.focus({ preventScroll: true })}><CircleQuestion /><span className="flex-1 text-left">Ask a question</span></Button>
            <Button color="secondary" variant="ghost" size="3xl" iconSize="lg" pill={false} block gutterSize="sm" className="justify-start text-base" onClick={() => { setReviewing(true); setNotice(false) }}><Sparkles /><span className="flex-1 text-left">{isToday ? 'Review today’s notes' : 'Review this day’s notes'}</span></Button>
            <Button color="secondary" variant="ghost" size="3xl" iconSize="lg" pill={false} block gutterSize="sm" className="justify-start text-base" onClick={explore}><Lightbulb /><span className="flex-1 text-left">Explore an idea</span></Button>
          </div>
        </div>
      </div>}
    </div>

    <div className="shrink-0 space-y-2 px-2 pb-2">
      <Animate as="div" transitionPosition="static" initial={{ opacity: 0 }} enter={{ opacity: 1, duration: 150 }} exit={{ opacity: 0, duration: 100 }}>
        {notice && <Alert key="not-sent" color="info" indicator={false} description="Your message hasn’t been sent. AI isn’t connected yet; your draft and attachments are still here." />}
      </Animate>
      {files.length > 0 && <ul aria-label="Attached files" className="flex max-h-24 flex-wrap gap-2 overflow-y-auto px-2">
          {files.map((file, index) => <li key={`${file.name}:${file.size}:${file.lastModified}`} className="flex max-w-full items-center gap-1 rounded-lg bg-surface-secondary px-2 py-1 text-xs">
            <Paperclip className="size-3 shrink-0" /><span className="max-w-48 truncate" title={file.name}>{file.name}</span>
            <Tooltip content="Remove attachment" compact><Button type="button" color="secondary" variant="ghost" size="3xs" uniform pill={false} aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, fileIndex) => fileIndex !== index))}><X /></Button></Tooltip>
          </li>)}
      </ul>}
      <form aria-label="Message composer" className="flex min-h-14 items-end gap-2 rounded-xl border border-subtle bg-surface-elevated p-2 pl-4 focus-within:border-strong" onSubmit={event => { event.preventDefault(); send() }}>
        <Textarea ref={composer} aria-label="Message to AI" placeholder="Ask about your notes or an idea" variant="soft" size="lg" className="min-w-0 flex-1 rounded-none bg-transparent text-base shadow-none [&_textarea]:px-0" rows={1} autoResize maxRows={5} value={draft} onChange={event => { setDraft(event.target.value); setNotice(false) }} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() }
        }} />
        <Tooltip content={canSend ? 'Send message' : 'Write a message to send'} compact side="top"><Button type="submit" color="primary" size="lg" uniform pill={false} disabled={!canSend} aria-label="Send message"><ArrowUp /></Button></Tooltip>
      </form>
    </div>
    <input ref={fileInput} type="file" multiple className="hidden" aria-label="Choose attachments" onChange={event => {
      const incoming = Array.from(event.target.files ?? [])
      setFiles(previous => [...previous, ...incoming].filter((file, index, all) => all.findIndex(other => other.name === file.name && other.size === file.size && other.lastModified === file.lastModified) === index))
      setNotice(false)
      event.target.value = ''
    }} />
  </aside>
}
