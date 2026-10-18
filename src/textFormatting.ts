export type TextMark = 'bold' | 'italic'
export type TextFormat = { start: number; end: number; marks: TextMark[] }

export function parseFormats(value: unknown, text: string): TextFormat[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('Invalid text formatting')
  return value.map(format => {
    if (!format || !Number.isInteger(format.start) || !Number.isInteger(format.end) || format.start < 0 || format.end <= format.start || format.end > text.length || !Array.isArray(format.marks) || !format.marks.length || format.marks.length > 2 || new Set(format.marks).size !== format.marks.length || format.marks.some((mark: unknown) => mark !== 'bold' && mark !== 'italic')) throw new Error('Invalid text formatting')
    return { start: format.start, end: format.end, marks: [...format.marks].sort() as TextMark[] }
  })
}
