import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
export type AuthState = { session: Session | null; status: 'loading' | 'signedOut' | 'approved' | 'pending' | 'error' | 'unconfigured'; error: string; retry: () => void }
export const AuthContext = createContext<AuthState | null>(null)
export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('AuthProvider is missing')
  return auth
}
