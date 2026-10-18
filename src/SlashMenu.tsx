import { Menu } from '@openai/apps-sdk-ui/components/Menu'
import { ImageSquare, Mic } from '@openai/apps-sdk-ui/components/Icon'

export function SlashMenu({ left, top, onClose, onSelect }: {
  left: number
  top: number
  onClose: () => void
  onSelect: (option: 'Photo' | 'Voice') => void
}) {
  return <div data-slash-menu onKeyDownCapture={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
  }}>
    <Menu forceOpen onClose={onClose}>
      <Menu.Trigger>
        <button type="button" tabIndex={-1} aria-label="Insert into note" className="pointer-events-none fixed size-px opacity-0" style={{ left, top }} />
      </Menu.Trigger>
      <Menu.Content align="start" side="bottom" minWidth={220}>
        <div className="px-3 py-2 text-xs text-secondary">Add to your note</div>
        <Menu.Item onSelect={() => onSelect('Photo')}><ImageSquare /><span>Photo</span></Menu.Item>
        <Menu.Item onSelect={() => onSelect('Voice')}><Mic /><span>Voice</span></Menu.Item>
      </Menu.Content>
    </Menu>
  </div>
}
