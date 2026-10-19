import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Navigate, Route, Routes, useParams, useLocation } from 'react-router'
import { SpeechControl, type SpeechControlHandle } from './SpeechControl'
import { RichWritingEditor } from './RichWritingEditor'
import { HomePage } from './HomePage'
import { EnterRefinement } from './enterRefinement'
import { requestRefinement } from './requestRefinement'
import { DevApiActivity } from './DevApiActivity'
import { SyncConflictNotice } from './SyncConflictNotice'
import { paragraphResources, refinementMetadata, type RefinedParagraph, type RefinementEdit } from './refinementState'
import { AuthCallback, RequireApproved, SetPassword } from './AuthPages'
import { useAuth } from './authContext'
import { accountStorage } from './accountStorage'
import { AccountMenu } from './AccountMenu'
import { FeedbackCard } from './FeedbackCard'
import { WelcomeOnboarding } from './WelcomeOnboarding'
import { DownloadNote } from './DownloadNote'
import { AskAIPanel } from './AskAIPanel'
import { ResizableSidebar } from './ResizableSidebar'
import type { WritingEditorHandle } from './writingEditorHandle'
import type { TextFormat } from './textFormatting'
import type { TaskParagraph } from './taskParagraphs'
import { Input } from '@openai/apps-sdk-ui/components/Input'
import { Alert } from '@openai/apps-sdk-ui/components/Alert'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip'
import { useWritingCaret } from './useWritingCaret'
import { Search, ChevronUp, ChevronDown, Moon, Sun } from '@openai/apps-sdk-ui/components/Icon'
import { applyDocumentTheme } from '@openai/apps-sdk-ui/theme'
import { findTextMatches, moveSearchMatch } from './noteSearch'
import { AnimateLayout } from '@openai/apps-sdk-ui/components/Transition'
import { useCloudNotes } from './useCloudNotes'
import { applyWritingChange, parseHistory, STORAGE_KEY, type History } from './writingSessions'

const NO_FORMATS: TextFormat[] = []
const THEME_KEY = 'notes.theme'
type Theme = 'light' | 'dark'

function storedTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function loadHistory(storage: Storage): { history: History; error: boolean } {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { history: {}, error: false }
    return { history: parseHistory(raw), error: false }
  } catch { return { history: {}, error: true } }
}
function formatDay(key: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${key}T12:00:00`).toLocaleDateString(undefined, options)
}

function WritingPage() {
  const { session } = useAuth()
  const userId = session!.user.id
  const storage = useMemo(() => accountStorage(localStorage, userId), [userId])
  const { date } = useParams()
  const today = dayKey()
  const selectedDay = date || today
  const editor = useRef<WritingEditorHandle>(null)
  const speech = useRef<SpeechControlHandle>(null)
  const [initial] = useState(() => loadHistory(storage))
  const [history, setHistory] = useState(initial.history)
  const historyRef = useRef(history)
  const refinement = useMemo(() => new EnterRefinement(requestRefinement, selectedDay), [selectedDay])
  const refining = useSyncExternalStore(refinement.subscribe, refinement.getSnapshot)
  const [saveFailed, setSaveFailed] = useState(initial.error)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(storedTheme)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const [searchShortcut] = useState(() => /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K')
  const [matchIndex, setMatchIndex] = useState(0)
  const cloud = useCloudNotes(initial.history, !initial.error, setHistory, storage, userId)
  const entry = history[selectedDay]
  const text = entry?.text || ''
  const matches = useMemo(() => findTextMatches(text, searchQuery), [text, searchQuery])
  const activeMatch = Math.min(matchIndex, Math.max(0, matches.length - 1))
  const caret = useWritingCaret(editor, text, selectedDay)

  useLayoutEffect(() => {
    applyDocumentTheme(theme)
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* Keep the theme for this page. */ }
  }, [theme])

  function write(value: string, formats: TextFormat[], editStart?: number, refined?: RefinedParagraph[], edits?: RefinementEdit[], tasks?: TaskParagraph[]) {
    const current = historyRef.current[selectedDay]
    let updated = applyWritingChange(current, value, Date.now(), () => crypto.randomUUID(), editStart, formats, edits, tasks)
    if (updated && refined !== undefined) {
      updated = { ...updated, updatedAt: new Date().toISOString() }
      updated.refinedParagraphs = refined
      const resources = paragraphResources(refined)
      if (resources.length) updated.learningResources = resources
      else delete updated.learningResources
    }
    if (!updated || updated === current) return
    const next = { ...historyRef.current, [selectedDay]: updated }
    historyRef.current = next
    refinement.update(updated.text, updated.refinedParagraphs, edits, refined === undefined)
    setHistory(next)
    // Save each change immediately so closing the page cannot lose a pending debounce.
    if (initial.error) return
    try { storage.setItem(STORAGE_KEY, JSON.stringify(next)); setSaveFailed(false) }
    catch { setSaveFailed(true); return }
    cloud.changed(next, selectedDay)
  }

  useLayoutEffect(() => {
    historyRef.current = history
    refinement.update(text, entry?.refinedParagraphs)
    refinement.setApply((paragraph, result) => {
      const current = historyRef.current[selectedDay]
      if (!editor.current || current?.text.slice(paragraph.start, paragraph.end) !== paragraph.text) return
      const next = refinementMetadata(current.text, current.refinedParagraphs ?? [], [paragraph], result.paragraphs)
      const document = editor.current.replaceParagraphs(next.replacements)
      write(document.text, document.formats, undefined, next.refinedParagraphs, document.edits, document.tasks ?? [])
    })
  })
  useEffect(() => () => refinement.cancel(), [refinement])
  useLayoutEffect(() => {
    if (searchOpen) searchInput.current?.focus()
  }, [searchOpen])
  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing) return
      event.preventDefault()
      setSearchOpen(true)
      searchInput.current?.focus()
      searchInput.current?.select()
    }
    window.addEventListener('keydown', openSearch)
    return () => window.removeEventListener('keydown', openSearch)
  }, [])

  function closeSearch() {
    setSearchOpen(false)
    setSearchQuery('')
    setMatchIndex(0)
    editor.current?.focus({ preventScroll: true })
  }


  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00`)) || dayKey(new Date(`${date}T12:00:00`)) !== date || date > today)) return <Navigate to="/today" replace />


  return (
    <main className="flex h-dvh overflow-hidden bg-surface text-primary">
      <div className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${reviewOpen ? 'hidden md:flex' : 'flex'}`}>
      <header className="flex min-h-16 shrink-0 flex-wrap content-center items-center justify-between gap-4 px-6">
        <span className="text-sm text-secondary"><span className="text-primary">Today</span> · {formatDay(selectedDay, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {text.trim() && <DownloadNote text={text} formats={entry?.formats ?? NO_FORMATS} day={selectedDay} onError={setDownloadError} />}
          {refining.error && <span role="status" className="max-w-64 text-xs text-secondary">{refining.error}</span>}
          <span className="sr-only" role="status" aria-live="polite">{refining.announcement}</span>
          <div data-search-field className="flex items-center">
            {!searchOpen ? <Tooltip content={<>Search notes <kbd className="ml-2 opacity-70">{searchShortcut}</kbd></>} compact side="bottom">
              <Button color="secondary" variant="ghost" size="sm" uniform pill={false} aria-label="Search notes" aria-keyshortcuts="Meta+K Control+K" aria-expanded={false} aria-controls="note-search" onClick={() => setSearchOpen(true)}><Search /></Button>
            </Tooltip> : <>
            <div className="w-44 shrink-0 sm:w-56">
            <Input ref={searchInput} id="note-search" type="search" size="lg" aria-label="Search notes" placeholder="Search notes" startAdornment={<Search />} value={searchQuery} onChange={event => { setSearchQuery(event.target.value); setMatchIndex(0) }} onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); setMatchIndex(moveSearchMatch(activeMatch, event.shiftKey ? -1 : 1, matches.length)) }
              if (event.key === 'Escape') { event.preventDefault(); closeSearch() }
            }} />
            </div>
            <AnimateLayout as="div" dimension="width" itemAnchor="end" className="h-9" hideOverflow initial={{ opacity: 0 }} enter={{ opacity: 1, duration: 180, delay: 40 }} exit={{ opacity: 0, duration: 140 }} layoutEnter={{ duration: 220 }} layoutExit={{ duration: 180 }} layoutMove={{ duration: 220 }}>
            {searchQuery && <div key="search-controls" className="flex h-9 w-max items-center gap-1 pl-1">
              <span role="status" aria-live="polite" className="w-28 shrink-0 truncate whitespace-nowrap px-2 text-center text-xs text-secondary tabular-nums" title={matches.length ? `${activeMatch + 1} of ${matches.length}` : 'No matches'}>{matches.length ? `${activeMatch + 1} of ${matches.length}` : 'No matches'}</span>
              <Tooltip content="Previous match (Shift+Enter)" compact side="bottom"><Button color="secondary" variant="ghost" size="sm" uniform pill={false} disabled={!matches.length} aria-label="Previous match" onClick={() => setMatchIndex(moveSearchMatch(activeMatch, -1, matches.length))}><ChevronUp /></Button></Tooltip>
              <Tooltip content="Next match (Enter)" compact side="bottom"><Button color="secondary" variant="ghost" size="sm" uniform pill={false} disabled={!matches.length} aria-label="Next match" onClick={() => setMatchIndex(moveSearchMatch(activeMatch, 1, matches.length))}><ChevronDown /></Button></Tooltip>
            </div>}
            </AnimateLayout>
            <Tooltip content="Close search (Esc)" compact side="bottom"><Button className="ml-2" color="secondary" variant="ghost" size="sm" pill={false} onClick={closeSearch}>Done</Button></Tooltip>
            </>}
          </div>
          <AccountMenu />
        </div>
      </header>
      {downloadError && <div className="shrink-0 px-6 pt-4"><Alert color="danger" title="Unable to download" description={downloadError} /></div>}
      {saveFailed && <div className="shrink-0 px-6 pt-4"><Alert color="danger" title="Unable to save" description={initial.error ? 'Saved writing could not be loaded. Existing data has been preserved. New writing will only remain on this page until storage is repaired.' : 'Your changes are on this page, but could not be saved. Keep this page open and copy your writing somewhere safe.'} /></div>}
      {!saveFailed && (cloud.status === 'conflict' || cloud.conflicts.length > 0) && <SyncConflictNotice conflicts={cloud.conflicts} onRetry={cloud.retry} onResolve={cloud.resolve} />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <section className="min-h-0 min-w-0 flex-1 overflow-hidden px-6" aria-label="Writing">
        <div data-writing-surface className="relative flex h-full min-w-0">
        <div className="relative h-full min-w-0 flex-1">
        <WelcomeOnboarding userId={userId} profile={session!.user.user_metadata} storage={storage} onFinish={() => editor.current?.focus({ preventScroll: true })}>
        <RichWritingEditor key={selectedDay} ref={editor} text={text} formats={entry?.formats ?? NO_FORMATS} hideCaret={!!caret} searchQuery={searchQuery} matches={matches} activeMatch={activeMatch} tasks={entry?.tasks} onChange={(value, formats, editStart, edits, tasks) => write(value, formats, editStart, undefined, edits, tasks)} onDictationInvalidated={() => speech.current?.cancel(false)} onParagraphComplete={paragraph => refinement.complete(paragraph)} refiningParagraphs={refining.pending} />
        </WelcomeOnboarding>
        {caret && <span aria-hidden="true" className="pointer-events-none absolute w-0.5 bg-[var(--blue-400)] animate-writing-caret" style={{ left: caret.left, top: caret.top, height: caret.height }} />}
        </div>
        </div>
      </section>
      </div>
      {!reviewOpen && <div hidden className="shrink-0 justify-end px-6 py-2">
        <Button data-review-trigger color="primary" size="2xl" pill={false} aria-expanded={false} aria-controls="review-panel" onClick={() => setReviewOpen(true)}>Ask AI</Button>
      </div>}
      {(import.meta.env.VITE_SPEECH_ENABLED === 'true') && <SpeechControl key={selectedDay} ref={speech} editor={editor} onStart={() => refinement.cancel()} onComplete={paragraphs => paragraphs.forEach(paragraph => refinement.complete(paragraph))} />}
      <div className="shrink-0 px-6 py-2">
        <FeedbackCard userId={userId} />
      </div>
      <footer className="flex min-h-9 shrink-0 flex-wrap content-center items-center justify-between gap-2 px-6 py-1 text-sm text-secondary">
        <span role="status">{saveFailed ? 'Unable to save' : cloud.status === 'loading' ? 'Connecting…' : cloud.status === 'saving' ? 'Saving to cloud…' : cloud.status === 'saved' ? (entry ? 'Saved to cloud' : 'Ready when you are') : cloud.status === 'conflict' ? 'Local draft · conflict' : cloud.status === 'offline' ? 'Saved locally · offline' : 'Saved locally · cloud unavailable'}</span>
        <div className="flex items-center gap-2">
          {import.meta.env.DEV && <DevApiActivity />}
          <Tooltip content={`Use ${theme === 'light' ? 'dark' : 'light'} mode`} compact side="top">
            <Button color="secondary" variant="ghost" size="sm" uniform pill={false} aria-label={`Use ${theme === 'light' ? 'dark' : 'light'} mode`} onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? <Moon /> : <Sun />}
            </Button>
          </Tooltip>
        </div>
      </footer>
      </div>
      <AnimateLayout as="div" dimension="width" itemAnchor="end" className="h-full" transitionClassName="h-full" hideOverflow initial={{ opacity: 0, x: 12 }} enter={{ opacity: 1, x: 0, duration: 200, delay: 40 }} exit={{ opacity: 0, x: 12, duration: 140 }} layoutEnter={{ duration: 240 }} layoutExit={{ duration: 200 }} layoutMove={{ duration: 240 }}>
        {reviewOpen && <ResizableSidebar key={selectedDay}><AskAIPanel entry={entry} dateLabel={formatDay(selectedDay, { month: 'long', day: 'numeric', year: 'numeric' })} isToday={selectedDay === today} onClose={() => { setReviewOpen(false); requestAnimationFrame(() => editor.current?.focus({ preventScroll: true })) }} /></ResizableSidebar>}
      </AnimateLayout>
    </main>
  )
}

export default function App() {
  const location = useLocation()
  const { session } = useAuth()
  const invitation = new URLSearchParams(location.hash.slice(1))
  // Dashboard invitation emails can return to the Site URL rather than the callback.
  if (location.pathname !== '/auth/callback' && (invitation.has('access_token') || new URLSearchParams(location.search).has('token_hash'))) return <Navigate to={{ pathname: '/auth/callback', search: location.search, hash: location.hash }} replace />
  const writing = <RequireApproved><WritingPage key={session?.user.id} /></RequireApproved>
  return <Routes><Route path="/" element={<HomePage />} /><Route path="/today" element={writing} /><Route path="/day/:date" element={writing} /><Route path="/auth/callback" element={<AuthCallback />} /><Route path="/auth/set-password" element={<SetPassword />} /><Route path="*" element={<Navigate to="/today" replace />} /></Routes>
}
