import { useState } from 'react'
import { useAuth } from './authContext'
import { getSupabase } from './authClient'
import { useNavigate } from 'react-router'
import { Avatar } from '@openai/apps-sdk-ui/components/Avatar'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { User } from '@openai/apps-sdk-ui/components/Icon'
import { Menu } from '@openai/apps-sdk-ui/components/Menu'
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip'

export function AccountMenu() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const profile = session?.user.user_metadata
  const image = typeof profile?.avatar_url === 'string' && profile.avatar_url.startsWith('https://') ? profile.avatar_url : undefined
  const name = typeof profile?.full_name === 'string' ? profile.full_name : session?.user.email?.split('@')[0]
  return <><Menu>
    <Menu.Trigger>
      <Tooltip content={error || 'Account'} compact side="bottom">
        <Button color="secondary" variant="ghost" size="sm" uniform pill={false} aria-label="Account menu" className="p-0">
          <Avatar size={28} color="secondary" imageUrl={image} name={name} Icon={name || image ? undefined : User} />
        </Button>
      </Tooltip>
    </Menu.Trigger>
    <Menu.Content align="end" minWidth={140}>
      <Menu.Item disabled={busy} onSelect={() => {
        if (busy) return
        setBusy(true); setError('')
        const supabase = getSupabase()
        if (!supabase) { setBusy(false); return }
        void supabase.auth.signOut({ scope: 'local' }).then(({ error }) => {
          if (error) setError('Unable to sign out. Please try again.')
          else navigate('/', { replace: true })
        }).catch(() => setError('Unable to sign out. Please try again.')).finally(() => setBusy(false))
      }}>Sign out</Menu.Item>
    </Menu.Content>
  </Menu>{error && <span role="status" className="max-w-48 text-xs text-secondary">{error}</span>}</>
}
