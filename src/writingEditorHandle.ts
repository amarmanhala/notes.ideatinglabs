export type EditorPoint = { left: number; top: number; height: number }
export type WritingEditorHandle = {
  element: HTMLElement
  focus: (options?: FocusOptions) => void
  replaceText: (text: string) => void
  replaceParagraphs: (replacements: Replacement[]) => { text: string; formats: TextFormat[]; edits: RefinementEdit[]; tasks?: TaskParagraph[] }
  beginDictation: () => boolean
  previewDictation: (text: string) => void
  finishDictation: (text: string) => Paragraph[]
  pointAt: (offset: number) => EditorPoint
  caret: () => EditorPoint | null
}
import type { Replacement, RefinementEdit, Paragraph } from './refinementState'
import type { TextFormat } from './textFormatting'
import type { TaskParagraph } from './taskParagraphs'
