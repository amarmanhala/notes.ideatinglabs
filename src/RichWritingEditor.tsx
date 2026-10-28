import './writingEditor.css'
import { beginDictation, previewDictation, finishDictation, dictationKey } from './dictationEditor'
import { useCallback, useEffect, useLayoutEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { EditorOptions } from '@tiptap/core'
import { writingExtensions } from './writingExtensions'
import { fromRichDocument, toRichDocument, documentPosition, plainOffset } from './richDocument'
import type { TextFormat } from './textFormatting'
import type { WritingEditorHandle } from './writingEditorHandle'
import { SearchHighlights } from './SearchHighlights'
import type { TextMatch } from './noteSearch'
import { SlashMenu } from './SlashMenu'
import { isSlashCommand } from './slashCommands'
import { refinementDecorationKey, replaceRefinedParagraphs } from './refinementEditor'
import type { Paragraph, RefinedParagraph, RefinementEdit } from './refinementState'
import type { TaskParagraph } from './taskParagraphs'
import { TaskTimers } from './TaskTimers'
import { TaskCheckboxes } from './TaskCheckboxes'
import { ClearNotesDialog } from './ClearNotesDialog'
import { ConfirmClearNotes, type ClearNotesRequest } from './confirmClearNotes'
import { answerDecorationKey } from './answerSlots'
import { resourceDecorationKey } from './resourceSlots'

const NO_REFINING: Paragraph[] = []
const NO_ANSWERS: RefinedParagraph[] = []
const NO_TASKS: TaskParagraph[] = []
const SLASH_MENU_ENABLED = false
const LOCAL_ECHO_LIMIT = 50

function documentSignature(text: string, formats: TextFormat[], tasks: TaskParagraph[]) {
  return JSON.stringify([text, formats, tasks])
}
// Stable view options let native selections survive React caret updates.
const WRITING_EDITOR_PROPS: EditorOptions['editorProps'] = {
  attributes: {
    role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Your thoughts',
    enterkeyhint: 'done',
    spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off',
    'data-gramm': 'false', 'data-gramm_editor': 'false', 'data-enable-grammarly': 'false',
    class: 'writing-editor h-full w-full overflow-y-auto whitespace-pre-wrap break-words py-1.5 pl-8 pr-2 text-left text-xl leading-relaxed text-primary outline-none sm:pl-10 sm:pr-3',
    style: 'caret-color: var(--writing-caret-color, var(--blue-400))',
  },
}

type Props = {
  ref: Ref<WritingEditorHandle | null>
  text: string
  formats: TextFormat[]
  hideCaret: boolean
  searchQuery: string
  matches: TextMatch[]
  activeMatch: number
  refiningParagraphs?: Paragraph[]
  answerParagraphs?: RefinedParagraph[]
  resourceParagraphs?: RefinedParagraph[]
  tasks?: TaskParagraph[]
  onDictationInvalidated?: () => void
  onParagraphComplete?: (paragraph: Paragraph) => void
  onChange: (text: string, formats: TextFormat[], editStart?: number, edits?: RefinementEdit[], tasks?: TaskParagraph[]) => void
}
export function RichWritingEditor({ ref, text, formats, hideCaret, searchQuery, matches, activeMatch, onChange, onParagraphComplete, onDictationInvalidated, refiningParagraphs = NO_REFINING, answerParagraphs = NO_ANSWERS, resourceParagraphs = NO_ANSWERS, tasks = NO_TASKS }: Props) {
  const [clearRequest, setClearRequest] = useState<ClearNotesRequest | null>(null)
  const [extensions] = useState(() => writingExtensions.map(extension => extension.name === 'confirmClearNotes' ? ConfirmClearNotes.configure({ onRequest: setClearRequest }) : extension))
  const [slash, setSlash] = useState<{ left: number; top: number } | null>(null)
  const [insertNotice, setInsertNotice] = useState('')
  const skipParagraphInput = useRef(false)
  // React can render an earlier onChange value after ProseMirror has already
  // accepted more keystrokes. Keep those local echoes from replacing the newer
  // document and moving its selection backwards during fast typing.
  const localEchoes = useRef<string[]>([])
  const [initialContent] = useState(() => toRichDocument(text, formats, tasks))
  const editor = useEditor({
    extensions,
    content: initialContent,
    autofocus: text ? false : 'end',
    injectCSS: false,
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: WRITING_EDITOR_PROPS,
    onCreate: ({ editor }) => {
      if (text) editor.commands.setTextSelection(editor.state.doc.content.size - 1)
    },
    onTransaction: ({ editor }) => { editor.view.dom.dispatchEvent(new Event('writing-layout')) },
    onUpdate: ({ editor, transaction }) => {
      const next = fromRichDocument(editor.state.doc)
      const signature = documentSignature(next.text, next.formats, next.tasks ?? NO_TASKS)
      if (localEchoes.current.at(-1) !== signature) {
        localEchoes.current.push(signature)
        if (localEchoes.current.length > LOCAL_ECHO_LIMIT) localEchoes.current.shift()
      }
      let editStart: number | undefined
      transaction.steps[0]?.getMap().forEach(from => { editStart ??= plainOffset(transaction.before, from) })
      const edits: RefinementEdit[] = transaction.steps.map((step, index) => {
        const before = transaction.docs[index]
        const after = transaction.docs[index + 1] ?? transaction.doc
        let start: number | undefined
        step.getMap().forEach(from => { start ??= plainOffset(before, from) })
        return { before: fromRichDocument(before).text, after: fromRichDocument(after).text, editStart: start }
      })
      onChange(next.text, next.formats, editStart, edits, next.tasks ?? NO_TASKS)
      const completed: Paragraph | undefined = transaction.getMeta('refine-enter')
      if (completed) onParagraphComplete?.(completed)
      const { $from, empty } = editor.state.selection
      const beforeCaret = $from.parent.textBetween(0, $from.parentOffset, '', '\ufffc')
      if (SLASH_MENU_ENABLED && empty && !editor.view.composing && isSlashCommand(beforeCaret)) {
        const caret = editor.view.coordsAtPos($from.pos)
        setSlash({ left: caret.left, top: caret.bottom })
        setInsertNotice('')
      } else setSlash(null)
    },
    onSelectionUpdate: () => setSlash(null),
  })

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.view.dispatch(editor.state.tr.setMeta(refinementDecorationKey, refiningParagraphs).setMeta('addToHistory', false))
    editor.view.dom.setAttribute('aria-busy', String(refiningParagraphs.length > 0 || !!dictationKey.getState(editor.state)))
  }, [editor, refiningParagraphs])

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.view.dispatch(editor.state.tr.setMeta(answerDecorationKey, answerParagraphs).setMeta('addToHistory', false))
  }, [editor, answerParagraphs])

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.view.dispatch(editor.state.tr.setMeta(resourceDecorationKey, resourceParagraphs).setMeta('addToHistory', false))
  }, [editor, resourceParagraphs])

  function closeSlashMenu() {
    setSlash(null)
    requestAnimationFrame(() => {
      if (!editor || editor.isDestroyed) return
      const active = document.activeElement
      if (active === document.body || active?.closest('[data-slash-menu], [role="menu"]')) editor.commands.focus(undefined, { scrollIntoView: false })
    })
  }

  const completeCurrentParagraph = useCallback((target: EventTarget | null) => {
    if (!editor?.isEditable || !onParagraphComplete || editor.view.composing || slash || !editor.view.dom.contains(target as Node)) return false
    if ((target as Element).closest?.('[data-task-checkbox], [data-task-timer]')) return false
    const { $from, empty } = editor.state.selection
    if (!empty || $from.depth !== 1) return false
    const content = $from.parent.textBetween(0, $from.parentOffset, '', '\ufffc')
    if (!content.trim()) return false
    const start = plainOffset(editor.state.doc, $from.start())
    const paragraph = { id: `p:${start}`, start, end: start + content.length, text: content }
    return editor.chain().splitBlock().setMeta('refine-enter', paragraph).run()
  }, [editor, onParagraphComplete, slash])

  useEffect(() => {
    if (!editor) return
    const close = () => setSlash(null)
    const element = editor.view.dom
    const beforeInput = (event: Event) => {
      const inputEvent = event as InputEvent
      if (inputEvent.inputType !== 'insertParagraph' || inputEvent.isComposing || skipParagraphInput.current) return
      if (completeCurrentParagraph(event.target)) event.preventDefault()
    }
    element.addEventListener('scroll', close)
    element.addEventListener('beforeinput', beforeInput)
    window.addEventListener('resize', close)
    return () => { element.removeEventListener('scroll', close); element.removeEventListener('beforeinput', beforeInput); window.removeEventListener('resize', close) }
  }, [editor, completeCurrentParagraph])

  useImperativeHandle<WritingEditorHandle | null, WritingEditorHandle | null>(ref, () => {
    if (!editor) return null
    const pointAtPosition = (position: number) => {
      const element = editor.view.dom
      const rect = element.getBoundingClientRect()
      const point = editor.view.coordsAtPos(position)
      return { left: point.left - rect.left + element.scrollLeft, top: point.top - rect.top + element.scrollTop, height: point.bottom - point.top }
    }
    return {
      element: editor.view.dom,
      focus: () => { editor.commands.focus(undefined, { scrollIntoView: false }) },
      replaceParagraphs: replacements => replaceRefinedParagraphs(editor, replacements),
      replaceText: text => {
        editor.commands.setContent(toRichDocument(text), { emitUpdate: false })
        editor.commands.focus('end', { scrollIntoView: false })
      },
      beginDictation: () => beginDictation(editor),
      previewDictation: text => previewDictation(editor, text),
      finishDictation: text => finishDictation(editor, text),
      pointAt: offset => pointAtPosition(documentPosition(editor.state.doc, offset)),
      caret: () => editor.state.selection.empty && !editor.view.composing ? pointAtPosition(editor.state.selection.head) : null,
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const current = fromRichDocument(editor.state.doc)
    const incomingSignature = documentSignature(text, formats, tasks)
    const currentSignature = documentSignature(current.text, current.formats, current.tasks ?? NO_TASKS)
    const echoIndex = localEchoes.current.indexOf(incomingSignature)
    if (incomingSignature === currentSignature) {
      if (echoIndex >= 0) localEchoes.current.splice(0, echoIndex + 1)
      return
    }
    if (echoIndex >= 0) {
      localEchoes.current.splice(0, echoIndex + 1)
      return
    }
    localEchoes.current.length = 0
    if (dictationKey.getState(editor.state)) {
      // A replacement from another device must never receive a stale dictation insertion.
      onDictationInvalidated?.()
    }
    const selection = editor.state.selection
    const scroll = editor.view.dom.scrollTop
    editor.commands.setContent(toRichDocument(text, formats, tasks), { emitUpdate: false })
    const limit = editor.state.doc.content.size - 1
    editor.commands.setTextSelection({ from: Math.min(selection.from, limit), to: Math.min(selection.to, limit) })
    editor.view.dom.scrollTo({ top: scroll })
  }, [editor, text, formats, tasks, onDictationInvalidated])

  return <div className="relative h-full w-full min-h-0" style={{ '--writing-caret-color': hideCaret ? 'transparent' : 'var(--blue-400)' } as CSSProperties} onKeyDownCapture={event => {
    if (!editor?.isEditable || event.key !== 'Enter' || event.nativeEvent.isComposing) return
    if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
      skipParagraphInput.current = true
      requestAnimationFrame(() => { skipParagraphInput.current = false })
      return
    }
    if (completeCurrentParagraph(event.target)) event.preventDefault()
  }}>
    {clearRequest && <ClearNotesDialog onKeep={() => {
      clearRequest.cancel()
      setClearRequest(null)
      requestAnimationFrame(() => { if (editor && !editor.isDestroyed) editor.commands.focus(undefined, { scrollIntoView: false }) })
    }} onDelete={() => {
      clearRequest.confirm()
      setClearRequest(null)
      requestAnimationFrame(() => { if (editor && !editor.isDestroyed) editor.commands.focus(undefined, { scrollIntoView: false }) })
    }} />}
    <SearchHighlights editor={editor} query={searchQuery} matches={matches} activeMatch={activeMatch} />
    <EditorContent editor={editor} className="relative h-full w-full min-h-0" />
    <TaskCheckboxes editor={editor} tasks={tasks} />
    <TaskTimers editor={editor} tasks={tasks} />
    {SLASH_MENU_ENABLED && slash && <SlashMenu left={slash.left} top={slash.top} onClose={closeSlashMenu} onSelect={option => { setInsertNotice(`${option === 'Photo' ? 'Photo uploads' : 'Voice recording'} aren’t connected yet.`); closeSlashMenu() }} />}
    {insertNotice && <p role="status" className="absolute bottom-3 left-3 rounded-lg border border-default bg-surface px-3 py-2 text-sm text-secondary">{insertNotice}</p>}
  </div>
}
