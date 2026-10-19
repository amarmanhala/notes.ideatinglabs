export type AuthSettings = { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY: string }
export type Account = { id: string; email: string }
export class AuthError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}
function settings(env: AuthSettings) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new AuthError(503, 'Account access is not configured yet.')
  return env.SUPABASE_URL.replace(/\/$/, '')
}
function failure() { return new AuthError(503, 'Unable to check account access. Please try again.') }
export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new AuthError(400, 'Enter a valid email address.')
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError(400, 'Enter a valid email address.')
  return email
}
export async function accountAccess(authorization: string | null, env: AuthSettings, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
  const token = /^Bearer (\S+\.\S+\.\S+)$/.exec(authorization ?? '')?.[1]
  if (!token) throw new AuthError(401, 'Please log in to use Notes.')
  const base = settings(env)
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }
  const lifecycle = AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])])
  try {
    // Validate with Auth rather than trusting a decoded JWT or user-editable metadata.
    const response = await fetcher(`${base}/auth/v1/user`, { headers, signal: lifecycle })
    if (response.status === 401 || response.status === 403) throw new AuthError(401, 'Your session expired. Please log in again.')
    if (!response.ok) throw failure()
    const user = await response.json() as { id?: unknown; email?: unknown; email_confirmed_at?: unknown }
    if (typeof user.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(user.id) || typeof user.email !== 'string' || !user.email_confirmed_at) throw new AuthError(403, 'Confirm your email before using Notes.')
    const account: Account = { id: user.id, email: normalizeEmail(user.email) }
    const query = new URLSearchParams({ select: 'status', email: `eq.${account.email}`, limit: '1' })
    const approval = await fetcher(`${base}/rest/v1/beta_access?${query}`, { headers, signal: lifecycle })
    if (!approval.ok) throw failure()
    const rows = await approval.json() as { status: string }[]
    if (!Array.isArray(rows)) throw failure()
    return { account, approved: rows[0]?.status === 'approved' }
  } catch (error) {
    if (error instanceof AuthError) throw error
    throw failure()
  }
}
export async function approvedOwner(authorization: string | null, env: AuthSettings, fetcher: typeof fetch = fetch, signal?: AbortSignal) {
  const access = await accountAccess(authorization, env, fetcher, signal)
  if (!access.approved) throw new AuthError(403, 'This email does not have access to Notes. Contact the administrator.')
  // D1's existing owner_id is a 64-character hash. Namespace account identities
  // separately from the previous anonymous browser keys; never claim old notes automatically.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`supabase:${access.account.id}`))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
