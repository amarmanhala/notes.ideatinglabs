export type LearningResource = { title: string; url: string }

export function parseLearningResources(value: unknown): LearningResource[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 3) throw new Error('Invalid learning resources')
  return value.map(item => {
    if (!item || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200 || typeof item.url !== 'string' || item.url.length > 2048) throw new Error('Invalid learning resource')
    const url = new URL(item.url)
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(url.hostname)) throw new Error('Invalid learning resource URL')
    return { title: item.title.trim(), url: url.href }
  })
}

export type Refinement = { text: string; resources: LearningResource[]; resourceNotice?: string }
