import { TaskTimerTextChanges } from './taskTimerSlots'
import { DictationPreview } from './dictationEditor'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import { UndoRedo } from '@tiptap/extensions'
import { RefinementDecorations } from './refinementEditor'
import { TaskCheckboxSlots } from './taskCheckboxSlots'
import { ConfirmClearNotes } from './confirmClearNotes'

const SelectedBold = Bold.extend({
  addKeyboardShortcuts() {
    return { 'Mod-b': () => this.editor.state.selection.empty || this.editor.commands.toggleBold() }
  },
})
const SelectedItalic = Italic.extend({
  addKeyboardShortcuts() {
    return { 'Mod-i': () => this.editor.state.selection.empty || this.editor.commands.toggleItalic() }
  },
})
const WritingParagraph = Paragraph.extend({
  addAttributes() {
    return {
      timerSet: { default: false, keepOnSplit: false, renderHTML: () => ({}) },
      timer: { default: null, keepOnSplit: false, renderHTML: () => ({}) },
      timerText: { default: null, keepOnSplit: false, renderHTML: () => ({}) },
      todo: { default: false, keepOnSplit: false, parseHTML: element => element.getAttribute('data-todo') === 'true', renderHTML: attrs => attrs.todo ? { 'data-todo': 'true' } : {} },
      checked: { default: false, keepOnSplit: false, parseHTML: element => element.getAttribute('data-checked') === 'true', renderHTML: attrs => attrs.checked ? { 'data-checked': 'true' } : {} },
    }
  },
  addKeyboardShortcuts() { return { 'Shift-Enter': () => this.editor.commands.splitBlock() } },
})

export const writingExtensions = [Document, WritingParagraph, Text, SelectedBold, SelectedItalic, UndoRedo, ConfirmClearNotes, RefinementDecorations, TaskCheckboxSlots, DictationPreview, TaskTimerTextChanges]
