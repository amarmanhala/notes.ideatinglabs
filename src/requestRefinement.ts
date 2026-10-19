import { getAccessToken } from './authClient'
import type { Paragraph, ParagraphBatch } from './refinementState'
import { devApiHeaders } from './apiActivityStore'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? '' : 'https://notes.ideatinglabs.com')
export async function requestRefinement(paragraph: Paragraph, signal: AbortSignal): Promise<ParagraphBatch> {
  const response = await fetch(`${API_BASE.replace(/\/$/, '')}/api/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessToken()}`, ...(!API_BASE ? devApiHeaders() : {}) },
    body: JSON.stringify({ paragraphs: [{ id: paragraph.id, text: paragraph.text }] }), signal,
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Unable to refine. Press Enter on that note to try again.')
  return result
}
