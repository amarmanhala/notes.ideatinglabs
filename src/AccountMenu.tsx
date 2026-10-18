import { useNavigate } from 'react-router'
import { Avatar } from '@openai/apps-sdk-ui/components/Avatar'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { User } from '@openai/apps-sdk-ui/components/Icon'
import { Menu } from '@openai/apps-sdk-ui/components/Menu'
import { Tooltip } from '@openai/apps-sdk-ui/components/Tooltip'

export function AccountMenu() {
  const navigate = useNavigate()
  return <Menu>
    <Menu.Trigger>
      <Tooltip content="Account" compact side="bottom">
        <Button color="secondary" variant="ghost" size="sm" uniform pill={false} aria-label="Account menu" className="p-0">
          <Avatar size={28} color="secondary" Icon={User} />
        </Button>
      </Tooltip>
    </Menu.Trigger>
    <Menu.Content align="end" minWidth={140}>
      {/* Sign-in is currently a placeholder. Preserve the browser identity and
          saved notes until a real account/session provider is connected. */}
      <Menu.Item onSelect={() => navigate('/', { replace: true })}>Sign out</Menu.Item>
    </Menu.Content>
  </Menu>
}
