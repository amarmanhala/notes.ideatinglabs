// Extract only the visible answer and the API's measured token total.
export function openaiDiagnostics(value: unknown): { tokens?: number; response?: string } {
  if (!value || typeof value !== 'object') return {}
  const data = value as { usage?: { total_tokens?: unknown }; output?: { type?: string; content?: { type?: string; text?: unknown }[] }[] }
  const tokens = data.usage?.total_tokens
  const output = Array.isArray(data.output) ? data.output.filter(item => item?.type === 'message').flatMap(item => Array.isArray(item.content) ? item.content : []).filter(item => item?.type === 'output_text' && typeof item.text === 'string').map(item => item.text as string).join(' ').trim() : ''
  let response = output
  try {
    const parsed = JSON.parse(output)
    if (typeof parsed.text === 'string') response = parsed.text
    else if (Array.isArray(parsed.paragraphs)) response = parsed.paragraphs.map((p: { text?: unknown }) => typeof p?.text === 'string' ? p.text : '').filter(Boolean).join(' ')
  } catch { /* Learning search returns ordinary text rather than structured notes. */ }
  return {
    ...(typeof tokens === 'number' && Number.isSafeInteger(tokens) && tokens >= 0 ? { tokens } : {}),
    ...(response ? { response: response.replace(/\s+/g, ' ').slice(0, 500) } : {}),
  }
}
