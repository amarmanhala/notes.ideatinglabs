import type { LearningResource } from './learningResources.ts'

const JAVASCRIPT: LearningResource = {
  title: 'MDN JavaScript Guide',
  url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
}
const HTML: LearningResource = {
  title: 'MDN: Structuring content with HTML',
  url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content',
}

// Keep approved learning destinations explicit and deterministic. This avoids
// sending users to invented, unsafe, or low-quality links from model output.
export function officialLearningResources(text: string): LearningResource[] {
  const note = text.trim().replace(/[.!]$/u, '').trim()
  if (/^learn\s+(?:js|javascript)$/iu.test(note)) return [JAVASCRIPT]
  if (/^learn\s+html$/iu.test(note)) return [HTML]
  return []
}
