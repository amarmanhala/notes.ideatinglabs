import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null
export function getSupabase() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  if (key.startsWith('sb_secret_')) throw new Error('Use the Supabase publishable key in the frontend.')
  // Reject accidentally configured legacy service-role keys without logging them.
  if (key.split('.').length === 3) {
    try { if (JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role') throw new Error('Private Supabase keys must stay on the server.') }
    catch (error) { if (error instanceof Error && error.message.startsWith('Private Supabase')) throw error }
  }
  client ??= createClient(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: false, autoRefreshToken: true, persistSession: true } })
  return client
}
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? '' : 'https://notes.ideatinglabs.com')).replace(/\/$/, '')
export async function getAccessToken(expectedUserId?: string) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Account access is not configured yet.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session || (expectedUserId && data.session.user.id !== expectedUserId)) throw new Error('Please log in again.')
  return data.session.access_token
}
