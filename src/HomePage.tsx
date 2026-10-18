import { useState } from 'react'
import { Link } from 'react-router'
import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button'
import { AuthDialog } from './AuthDialog'

export function HomePage() {
  const [authOpen, setAuthOpen] = useState(false)

  return (
    <div data-theme="light" className="flex h-dvh flex-col overflow-hidden bg-surface text-default">
      <header className="flex shrink-0 items-center justify-between gap-4 px-5 py-4 sm:px-10">
        <Link to="/" aria-label="Notes home" className="heading-lg rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4">Notes</Link>
        <nav aria-label="Account" className="flex items-center gap-2 sm:gap-3">
          <Button color="secondary" variant="ghost" size="lg" pill={false} onClick={() => setAuthOpen(true)}>Log in</Button>
          <Button color="primary" size="lg" pill={false} onClick={() => setAuthOpen(true)}>Sign up</Button>
        </nav>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
        <section aria-labelledby="hero-title">
          <h1 id="hero-title" className="heading-5xl text-[clamp(1.25rem,min(9vw,10dvh),4.5rem)] leading-none">One file.<br />All your thoughts.<br />Refined with AI.</h1>
          <div className="mt-8">
            <ButtonLink to="/today" color="primary" size="3xl" pill={false}>Let’s start</ButtonLink>
          </div>
        </section>
      </main>

      <footer className="shrink-0 px-5 py-4 text-center text-sm text-secondary">
        Developed by Amar
      </footer>
      {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

// Full marketing homepage — restore when videos and photos are ready.
// import { useState } from 'react'
// import { Link } from 'react-router'
// import { Button, ButtonLink } from '@openai/apps-sdk-ui/components/Button'
// import { Checkbox } from '@openai/apps-sdk-ui/components/Checkbox'
// import { ArrowDown, ArrowRight, ImageWide, Play } from '@openai/apps-sdk-ui/components/Icon'
// import { SegmentedControl } from '@openai/apps-sdk-ui/components/SegmentedControl'
// import { AuthDialog } from './AuthDialog'
//
// const chapters = [
//   { id: 'why-notes', label: 'Why Notes' },
//   { id: 'capture', label: 'Write freely' },
//   { id: 'revisit', label: 'Find your way back' },
//   { id: 'refine', label: 'Refine with AI' },
//   { id: 'export', label: 'Take it with you' },
//   { id: 'questions', label: 'A few questions' },
// ]
//
// const examples = {
//   everyday: {
//     label: 'Everyday thoughts',
//     title: 'A thought before the day gets busy.',
//     description: 'Something you noticed. Something to remember. A few words about how today feels. Add it to the same file and get on with your day.',
//     media: 'Everyday writing',
//   },
//   work: {
//     label: 'Work in progress',
//     title: 'Catch the idea between meetings.',
//     description: 'An unfinished plan, a question from a conversation, a different way to approach the problem. Keep it alongside your other thoughts while it’s fresh.',
//     media: 'Work notes',
//   },
//   ideas: {
//     label: 'The next idea',
//     title: 'Let the first version be rough.',
//     description: 'A name, a sentence, a what-if. Add the first few words to your file, then come back and keep thinking whenever you’re ready.',
//     media: 'Idea capture',
//   },
// }
//
// const questions = [
//   {
//     question: 'Do I need an account to start?',
//     answer: 'No. Open Notes and start writing. Account sign-in is still being developed, so you can try the writing experience without signing up.',
//   },
//   {
//     question: 'Why one file?',
//     answer: 'So there’s always one place to write and one place to return to. Quick reminders, work in progress, and personal thoughts belong together. No titles, folders, or tags are required. Timestamps give your writing context without splitting it into separate documents.',
//   },
//   {
//     question: 'How does saving work?',
//     answer: 'Your writing saves automatically as you make changes. There’s no submit button and no need to press Enter to save a thought.',
//   },
//   {
//     question: 'What does AI do with my notes?',
//     answer: 'AI refines spelling, grammar, and phrasing while keeping your meaning. When a note describes something to do, like “buy coffee,” it becomes a to-do you can check off. You can write quickly without polishing every sentence first.',
//   },
//   {
//     question: 'Can I download my writing?',
//     answer: 'Yes. Use the download menu while viewing your writing to export it as a text file, Markdown, a Word document, or a PDF.',
//   },
// ]
//
// function MediaPlaceholder({ title, video = false, wide = false }: { title: string; video?: boolean; wide?: boolean }) {
//   const Icon = video ? Play : ImageWide
//   return (
//     <figure>
//       <div
//         role="img"
//         aria-label={`${title} — ${video ? 'video' : 'image'} placeholder`}
//         className={`flex items-center justify-center bg-surface-secondary px-6 ${wide ? 'aspect-video min-h-64' : 'aspect-[4/3] sm:aspect-[3/2]'}`}
//       >
//         <div className="flex flex-col items-center gap-4 text-center text-secondary">
//           <Icon className="size-8" aria-hidden="true" />
//           <span className="text-sm">{title}</span>
//           <span className="text-xs text-tertiary">{video ? 'Video placeholder' : 'Image placeholder'}</span>
//         </div>
//       </div>
//     </figure>
//   )
// }
//
// export function HomePage() {
//   const [authOpen, setAuthOpen] = useState(false)
//   const [example, setExample] = useState<keyof typeof examples>('everyday')
//   const selectedExample = examples[example]
//
//   return (
//     <div data-theme="light" className="min-h-dvh bg-surface text-default">
//       <a href="#homepage-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-4">Skip to content</a>
//
//       <header className="mx-auto max-w-[1440px] px-5 sm:px-10">
//         <div className="flex min-h-20 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
//           <Link to="/" aria-label="Notes home" className="heading-lg rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4">Notes</Link>
//           <nav aria-label="Main navigation" className="order-last flex w-full items-center justify-center gap-1 sm:gap-4 lg:order-none lg:w-auto">
//             <ButtonLink as="a" href="#capture" color="secondary" variant="ghost" size="lg" pill={false}>Product</ButtonLink>
//             <ButtonLink as="a" href="#revisit" color="secondary" variant="ghost" size="lg" pill={false}>How it works</ButtonLink>
//             <ButtonLink as="a" href="#refine" color="secondary" variant="ghost" size="lg" pill={false}>AI refinement</ButtonLink>
//           </nav>
//           <nav aria-label="Account" className="flex items-center gap-2 sm:gap-3">
//             <Button color="secondary" variant="ghost" size="lg" pill={false} onClick={() => setAuthOpen(true)}>Log in</Button>
//             <ButtonLink to="/today" color="primary" size="lg" pill={false}>Open Notes <ArrowRight /></ButtonLink>
//           </nav>
//         </div>
//       </header>
//
//       <main id="homepage-content" tabIndex={-1}>
//         <section aria-labelledby="hero-title" className="mx-auto max-w-5xl px-6 pb-16 pt-16 text-center sm:pb-20 sm:pt-24 lg:pt-28">
//           <p className="mb-6 text-sm">A little room to think</p>
//           <h1 id="hero-title" className="heading-3xl sm:heading-5xl">One file.<br />All your thoughts.<br />Refined with AI.</h1>
//           <p className="mx-auto mt-6 max-w-xl text-lg text-secondary">
//             Write freely in one continuous notes file. AI tidies spelling, grammar, and phrasing, and turns things you need to do into to-dos. You bring the thoughts. Notes helps make them clear.
//           </p>
//           <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
//             <ButtonLink to="/today" color="primary" size="3xl" pill={false}>Start writing <ArrowRight /></ButtonLink>
//             <ButtonLink as="a" href="#capture" color="secondary" variant="ghost" size="3xl" pill={false}>Explore Notes <ArrowDown /></ButtonLink>
//           </div>
//           <p className="mt-4 text-xs text-secondary">No account needed to start.</p>
//         </section>
//
//         <div className="mx-auto max-w-[1280px] px-5 sm:px-10">
//           <MediaPlaceholder title="Meet Notes" video wide />
//           <p className="mt-4 text-sm text-secondary">One file to come back to. Room for whatever comes next.</p>
//         </div>
//
//         <div className="mx-auto grid max-w-[1280px] gap-12 px-5 pb-24 pt-20 sm:px-10 sm:pt-28 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16 xl:gap-24">
//           <aside className="hidden lg:block">
//             <nav aria-label="On this page" className="sticky top-10 flex flex-col items-start gap-2">
//               <p className="mb-3 px-3 text-xs text-secondary">Discover Notes</p>
//               {chapters.map(chapter => (
//                 <ButtonLink key={chapter.id} as="a" href={`#${chapter.id}`} color="secondary" variant="ghost" size="lg" pill={false}>
//                   {chapter.label}
//                 </ButtonLink>
//               ))}
//             </nav>
//           </aside>
//
//           <div className="min-w-0 space-y-24 sm:space-y-32">
//             <section id="why-notes" aria-labelledby="why-notes-title" className="scroll-mt-10">
//               <div className="max-w-2xl">
//                 <h2 id="why-notes-title" className="heading-2xl sm:heading-3xl">Writing shouldn’t start with organizing.</h2>
//                 <p className="mt-6 text-lg text-secondary">You have a thought to write down. Then come the decisions: which folder, which subfolder, a new file or an existing one? Add titles and formatting, and capturing a few words becomes more work than it needs to be.</p>
//                 <p className="mt-5 text-lg text-secondary">As the files pile up, there’s more to manage and more places to look. The thought you wanted to save gets buried in the system you built to keep it.</p>
//                 <p className="mt-5 text-lg text-secondary">Notes gives you one file to open and keep writing in. No folders to maintain, no documents to name, no formatting required. Put your attention into the words, with AI there to help refine them.</p>
//               </div>
//             </section>
//
//             <section id="capture" aria-labelledby="capture-title" className="scroll-mt-10">
//               <div className="max-w-2xl">
//                 <h2 id="capture-title" className="heading-2xl sm:heading-3xl">Open the same file. Keep thinking.</h2>
//                 <p className="mt-6 text-lg text-secondary">Ideas rarely arrive fully formed. Sometimes it’s a few words between things. Sometimes it’s a longer reflection. Add them all to one place, as they come.</p>
//                 <p className="mt-5 text-lg text-secondary">No new document to create. No title to invent or folder to choose. Your file saves as you write, so you can stay with the thought.</p>
//               </div>
//               <div className="my-8 overflow-x-auto pb-1">
//                 <SegmentedControl aria-label="Ways to use Notes" value={example} onChange={setExample} size="lg" pill={false} className="w-max">
//                   {Object.entries(examples).map(([value, item]) => <SegmentedControl.Option key={value} value={value}>{item.label}</SegmentedControl.Option>)}
//                 </SegmentedControl>
//               </div>
//               <MediaPlaceholder title={selectedExample.media} />
//               <div aria-live="polite" aria-atomic="true" className="mt-6 max-w-2xl">
//                 <h3 className="heading-lg">{selectedExample.title}</h3>
//                 <p className="mt-3 text-base text-secondary">{selectedExample.description}</p>
//               </div>
//             </section>
//
//             <section id="revisit" aria-labelledby="revisit-title" className="scroll-mt-10">
//               <div className="max-w-2xl">
//                 <h2 id="revisit-title" className="heading-2xl sm:heading-3xl">A thought worth coming back to.</h2>
//                 <p className="mt-6 text-lg text-secondary">You don’t always know which idea will matter later. Keeping your thoughts together gives you a familiar place to return to, whether you’re adding something new or picking up an earlier idea.</p>
//                 <p className="mt-5 text-lg text-secondary">Quiet timestamps add a sense of when to your continuous writing. Reveal them when you want context, and hide them when you want to focus on the words.</p>
//               </div>
//               <div className="mt-8"><MediaPlaceholder title="Search and timestamps" /></div>
//               <div className="mt-8 grid gap-8 sm:grid-cols-2">
//                 <div>
//                   <h3 className="heading-md">Find the words you remember.</h3>
//                   <p className="mt-3 text-base text-secondary">Search highlights matching text in the writing you’re viewing. Move between matches without losing your place.</p>
//                 </div>
//                 <div>
//                   <h3 className="heading-md">Keep a sense of when.</h3>
//                   <p className="mt-3 text-base text-secondary">A new writing session gets a timestamp after a two-minute pause. Your writing stays uninterrupted.</p>
//                 </div>
//               </div>
//             </section>
//
//             <section id="refine" aria-labelledby="refine-title" className="scroll-mt-10">
//               <p className="mb-4 text-sm text-secondary">AI refinement</p>
//               <div className="max-w-2xl">
//                 <h2 id="refine-title" className="heading-2xl sm:heading-3xl">Get the thought down. Let AI tidy it up.</h2>
//                 <p className="mt-6 text-lg text-secondary">A typo shouldn’t slow down an idea. Write in your own words, however rough. AI improves spelling, grammar, and phrasing while keeping what you mean.</p>
//                 <p className="mt-5 text-lg text-secondary">And when a thought is something to do, Notes makes it a to-do. Type “buy coffee” and it becomes a task you can check off, right alongside the rest of your writing.</p>
//               </div>
//               <div className="mt-8 grid gap-6 bg-surface-secondary p-6 sm:grid-cols-2 sm:p-8" aria-label="AI refinement example">
//                 <div>
//                   <p className="mb-4 text-sm text-secondary">You write</p>
//                   <p className="text-lg">buy coffee</p>
//                 </div>
//                 <div>
//                   <p className="mb-4 text-sm text-secondary">Notes refines · Example</p>
//                   <Checkbox label="Buy coffee" defaultChecked={false} />
//                 </div>
//               </div>
//               <div className="mt-8"><MediaPlaceholder title="From rough thoughts to clear notes and to-dos" video /></div>
//             </section>
//
//             <section id="export" aria-labelledby="export-title" className="scroll-mt-10">
//               <h2 id="export-title" className="heading-2xl sm:heading-3xl">Your thoughts can go places.</h2>
//               <p className="mt-6 max-w-2xl text-lg text-secondary">A rough note can become a draft, a plan, or the beginning of something bigger. Download your writing in the format that fits what’s next.</p>
//               <div className="mt-8 grid grid-cols-2 border-t border-default sm:grid-cols-4">
//                 {[
//                   ['.txt', 'Keep it simple'],
//                   ['.md', 'Keep writing'],
//                   ['.docx', 'Make it a document'],
//                   ['.pdf', 'Keep a copy'],
//                 ].map(([format, description]) => (
//                   <div key={format} className="py-6 pr-4">
//                     <p className="heading-xl">{format}</p>
//                     <p className="mt-2 text-sm text-secondary">{description}</p>
//                   </div>
//                 ))}
//               </div>
//             </section>
//
//             <section id="questions" aria-labelledby="questions-title" className="scroll-mt-10">
//               <h2 id="questions-title" className="heading-2xl sm:heading-3xl">A few things to know.</h2>
//               <div className="mt-8 border-t border-default">
//                 {questions.map(item => (
//                   <details key={item.question} className="border-b border-default py-5">
//                     <summary className="cursor-pointer rounded-sm text-lg font-medium focus-visible:outline-2 focus-visible:outline-offset-4">{item.question}</summary>
//                     <p className="mt-4 max-w-2xl text-base text-secondary">{item.answer}</p>
//                   </details>
//                 ))}
//               </div>
//             </section>
//           </div>
//         </div>
//
//         <section aria-labelledby="start-title" className="bg-surface-secondary px-6 py-20 text-center sm:py-28">
//           <h2 id="start-title" className="heading-3xl sm:heading-4xl">What’s on your mind?</h2>
//           <p className="mx-auto mt-5 max-w-md text-lg text-secondary">One file for your thoughts. A little help from AI to make them clear.</p>
//           <div className="mt-8"><ButtonLink to="/today" color="primary" size="3xl" pill={false}>Start writing <ArrowRight /></ButtonLink></div>
//         </section>
//       </main>
//
//       <footer className="mx-auto max-w-[1280px] px-5 py-12 sm:px-10">
//         <div className="flex flex-col justify-between gap-8 sm:flex-row">
//           <div>
//             <Link to="/" className="heading-lg">Notes</Link>
//             <p className="mt-3 text-sm text-secondary">One file for thoughts in progress.</p>
//           </div>
//           <nav aria-label="Footer" className="flex flex-wrap items-start gap-x-6 gap-y-3 text-sm">
//             <a href="#capture" className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">Product</a>
//             <a href="#refine" className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">AI refinement</a>
//             <a href="#questions" className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">Questions</a>
//             <Link to="/today" className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4">Open Notes</Link>
//           </nav>
//         </div>
//       </footer>
//       {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} />}
//     </div>
//   )
// }
