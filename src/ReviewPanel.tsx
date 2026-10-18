import { useEffect, useRef, useState } from 'react'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { EmptyMessage } from '@openai/apps-sdk-ui/components/EmptyMessage'
import { ChatCompose, ChevronLeft, ChevronRight, Sparkles, X } from '@openai/apps-sdk-ui/components/Icon'
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip'
import { AnimateLayout } from '@openai/apps-sdk-ui/components/Transition'
import { captureReview, type ReviewInsight, type ReviewPassage } from './reviewPassages'
import { toRichDocument } from './richDocument'
import type { Entry } from './writingSessions'

function OriginalPassage({ passage }: { passage: ReviewPassage }) {
  return <div aria-label="Original passage" className="whitespace-pre-wrap break-words text-base leading-relaxed">
    {toRichDocument(passage.text, passage.formats).content?.map((paragraph, index) => <p key={index} className="m-0">
      {paragraph.content?.length ? paragraph.content.map((run, runIndex) => {
        let content = <>{run.text}</>
        if (run.marks?.some(mark => mark.type === 'italic')) content = <em>{content}</em>
        if (run.marks?.some(mark => mark.type === 'bold')) content = <strong>{content}</strong>
        return <span key={runIndex}>{content}</span>
      }) : <br />}
    </p>)}
  </div>
}

type Props = {
  entry?: Entry
  dateLabel: string
  isToday: boolean
  onClose: () => void
  insights?: Record<string, ReviewInsight>
  embedded?: boolean
}

export function ReviewPanel({ entry, dateLabel, isToday, onClose, insights, embedded = false }: Props) {
  const [snapshot, setSnapshot] = useState(() => captureReview(entry))
  const [index, setIndex] = useState(0)
  const [detail, setDetail] = useState<'question' | 'nextStep' | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const scrollArea = useRef<HTMLDivElement>(null)
  const passage = snapshot.passages[index]
  const changed = snapshot.fingerprint !== (JSON.stringify(entry) ?? '')
  const candidate = passage && insights?.[passage.id]
  const insight = candidate?.sourceText === passage?.text ? candidate : undefined
  const response = detail && insight?.[detail]

  useEffect(() => { if (!embedded) closeButton.current?.focus({ preventScroll: true }) }, [embedded])
  useEffect(() => { scrollArea.current?.scrollTo({ top: 0 }) }, [index, snapshot])

  function refresh() {
    setSnapshot(captureReview(entry))
    setIndex(0)
    setDetail(null)
  }
  function navigate(next: number) {
    setIndex(next)
    setDetail(null)
  }

  const content = <>
    {!embedded && <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4">
      <h2 id="review-title" className="text-sm font-semibold">Ask AI</h2>
      <div className="flex items-center gap-1">
        <Tooltip content="Start a new review" compact side="bottom"><Button color="secondary" variant="ghost" size="sm" uniform pill={false} aria-label="Start a new review" onClick={refresh}><ChatCompose /></Button></Tooltip>
        <Tooltip content="Close review" compact side="bottom"><Button ref={closeButton} color="secondary" variant="ghost" size="sm" uniform pill={false} aria-label="Close review" onClick={onClose}><X /></Button></Tooltip>
      </div>
    </header>}

    <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-1 text-xs text-secondary">
      <span>{isToday ? 'Today’s notes' : dateLabel}</span>
      {passage && <span role="status" aria-live="polite" className="tabular-nums">{index + 1} of {snapshot.passages.length}</span>}
    </div>

    {changed && <div className="flex shrink-0 items-center gap-1 px-5 pt-2 text-xs text-secondary" role="status">Notes changed · <Button color="secondary" variant="ghost" size="xs" pill={false} onClick={refresh}>Refresh</Button></div>}

    <div ref={scrollArea} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
      <AnimateLayout as="div" hideOverflow initial={{ opacity: 0 }} enter={{ opacity: 1, duration: 180 }} exit={{ opacity: 0, duration: 100 }} layoutEnter={{ duration: 200 }} layoutExit={{ duration: 150 }} layoutMove={{ duration: 200 }}>
        {passage ? <div key={passage.id} className="space-y-8">
          <section aria-label="Timestamped passage" className="space-y-3">
            <time dateTime={passage.startedAt} title={new Date(passage.startedAt).toLocaleString()} className="text-xs text-secondary">{new Date(passage.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
            <OriginalPassage passage={passage} />
          </section>
          {insight ? <section aria-label="AI reflection" className="space-y-3">
            <p className="text-sm leading-relaxed text-secondary">{insight.reflection}</p>
            <div className="flex flex-wrap gap-1">
              {insight.question && <Button color="secondary" variant="ghost" size="xs" pill={false} selected={detail === 'question'} aria-expanded={detail === 'question'} aria-controls="review-response" onClick={() => setDetail(detail === 'question' ? null : 'question')}>Explore a question</Button>}
              {insight.nextStep && <Button color="secondary" variant="ghost" size="xs" pill={false} selected={detail === 'nextStep'} aria-expanded={detail === 'nextStep'} aria-controls="review-response" onClick={() => setDetail(detail === 'nextStep' ? null : 'nextStep')}>Suggest a next step</Button>}
            </div>
            <AnimateLayout as="div" hideOverflow initial={{ opacity: 0 }} enter={{ opacity: 1, duration: 180 }} exit={{ opacity: 0, duration: 100 }}>
              {response && <p key={detail} id="review-response" className="text-sm leading-relaxed">{response}</p>}
            </AnimateLayout>
          </section> : <p className="text-xs leading-relaxed text-secondary">AI reflections aren’t connected yet.</p>}
        </div> : <EmptyMessage key="empty" fill="none">
          <EmptyMessage.Icon><Sparkles /></EmptyMessage.Icon>
          <EmptyMessage.Title>Nothing to review yet</EmptyMessage.Title>
          <EmptyMessage.Description>Write a few words, then come back to review your thoughts.</EmptyMessage.Description>
        </EmptyMessage>}
      </AnimateLayout>
    </div>

    <footer className="flex shrink-0 items-center justify-between gap-2 px-5 py-4">
      {passage && snapshot.passages.length > 1 ? <Button color="secondary" variant="ghost" size="sm" pill={false} disabled={index === 0} onClick={() => navigate(index - 1)}><ChevronLeft />Previous</Button> : <span />}
      {passage && index < snapshot.passages.length - 1 ? <Button color="primary" size="sm" pill={false} onClick={() => navigate(index + 1)}>Next<ChevronRight /></Button> : <Button color="primary" size="sm" pill={false} onClick={onClose}>Done</Button>}
    </footer>
  </>

  return embedded ? <div className="flex min-h-0 flex-1 flex-col">{content}</div> : <aside id="review-panel" data-review-panel aria-labelledby="review-title" className="flex h-full w-screen flex-col bg-surface-secondary text-primary md:w-[440px] md:border-l md:border-default" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
  }}>{content}</aside>
}
