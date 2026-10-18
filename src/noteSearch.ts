export type TextMatch = { start: number; end: number }

// Literal, case-insensitive matching preserves UTF-16 offsets used by the editor.
export function findTextMatches(text: string, query: string): TextMatch[] {
  if (!query) return []
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return Array.from(text.matchAll(new RegExp(literal, 'giu')), match => ({
    start: match.index,
    end: match.index + match[0].length,
  }))
}

export function moveSearchMatch(current: number, direction: number, count: number) {
  return count ? ((current + direction) % count + count) % count : 0
}

type SearchRect = { left: number; top: number; width: number; height: number }

// A DOM Range may include both an inline mark's box and its text's box.
// Merge those boxes so bold/italic matches have an even highlight.
export function mergeSearchRects(rects: SearchRect[]): SearchRect[] {
  const merged: SearchRect[] = []
  for (const rect of [...rects].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const previous = merged.at(-1)
    if (previous && Math.abs(previous.top - rect.top) < 0.5 && Math.abs(previous.height - rect.height) < 0.5 && rect.left <= previous.left + previous.width + 0.5) {
      previous.width = Math.max(previous.left + previous.width, rect.left + rect.width) - previous.left
    } else merged.push({ ...rect })
  }
  return merged
}
