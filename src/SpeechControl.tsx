import { useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type Ref, type RefObject } from 'react'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip'
import { Mic, Stop } from '@openai/apps-sdk-ui/components/Icon'
import { SpeechTranscription, type SpeechPhase } from './speechTranscription'
import type { WritingEditorHandle } from './writingEditorHandle'
import type { Paragraph } from './refinementState'

export type SpeechControlHandle = { cancel: (preserveText?: boolean) => void }
type Props = {
  ref: Ref<SpeechControlHandle>
  editor: RefObject<WritingEditorHandle | null>
  onStart: () => void
  onComplete: (paragraphs: Paragraph[]) => void
}
export function SpeechControl({ ref, editor, onStart, onComplete }: Props) {
  const [phase, setPhase] = useState<SpeechPhase>('idle')
  const [error, setError] = useState('')
  const [levels, setLevels] = useState([0, 0, 0, 0, 0])
  const session = useRef<SpeechTranscription | null>(null)
  const mounted = useRef(false)
  const preserveText = useRef(true)
  useLayoutEffect(() => {
    mounted.current = true
    const leave = () => session.current?.cancel()
    window.addEventListener('pagehide', leave)
    return () => { mounted.current = false; leave(); window.removeEventListener('pagehide', leave) }
  }, [])
  useImperativeHandle(ref, () => ({ cancel: (preserve = true) => { preserveText.current = preserve; session.current?.cancel() } }), [])

  function start() {
    if (session.current || !editor.current) return
    const handle = editor.current
    onStart()
    if (!handle.beginDictation()) { setError('Finish typing your current word, then try the mic again.'); return }
    setError('')
    preserveText.current = true
    const active = new SpeechTranscription({
      phase: next => { if (mounted.current) setPhase(next) },
      levels: next => { if (mounted.current) setLevels(next) },
      transcript: text => handle.previewDictation(text),
      finish: result => {
        const paragraphs = handle.finishDictation(preserveText.current ? result.text : '')
        session.current = null
        if (!mounted.current) return
        setError(preserveText.current ? result.error : 'Notes changed. Speech stopped. Click the mic to try again.')
        if (result.refine) onComplete(paragraphs)
      },
    })
    session.current = active
    void active.start()
  }

  const label = phase === 'connecting' ? 'Connecting…' : phase === 'listening' ? 'Listening…' : phase === 'finishing' ? 'Finishing…' : ''
  return <div data-speech-control className="flex min-h-12 shrink-0 items-center justify-end gap-3 px-6 py-2">
    {error && <span role="status" className="max-w-80 text-xs text-secondary">{error}</span>}
    <span role="status" aria-live="polite" className="sr-only">{phase === 'idle' ? error : `${label}${phase === 'listening' ? ' Speak now. Typing resumes after you stop.' : ''}`}</span>
    {phase !== 'idle' && <>
      <span aria-hidden="true" className="speech-bars">{levels.map((level, index) => <span key={index} style={{ '--bar-height': `${5 + level * (index === 2 ? 21 : index % 2 ? 17 : 12)}px` } as CSSProperties} />)}</span>
      <span aria-hidden="true" className="w-20 text-sm text-secondary">{label}</span>
      <Button color="secondary" variant="soft" size="sm" pill={false} disabled={phase === 'finishing'} onClick={() => session.current?.stop()} aria-label={phase === 'connecting' ? 'Cancel speech connection' : 'Stop speaking'}><Stop />Stop</Button>
    </>}
    {phase === 'idle' && <Tooltip content="Speak to type" compact side="top">
      <Button color="secondary" variant="ghost" size="sm" uniform pill={false} aria-label="Speak to type" onClick={start}><Mic /></Button>
    </Tooltip>}
  </div>
}
