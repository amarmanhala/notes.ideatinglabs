import { Avatar, AvatarGroup } from '@openai/apps-sdk-ui/components/Avatar'
import { Button } from '@openai/apps-sdk-ui/components/Button'
import { Popover } from '@openai/apps-sdk-ui/components/Popover'
import type { LearningResource } from './learningResources'

export function LearningResources({ resources }: { resources: LearningResource[] }) {
  if (!resources.length) return null
  return <div data-learning-resources className="shrink-0 px-6 py-3 sm:pl-[120px]">
    <Popover>
      <Popover.Trigger>
        <Button color="secondary" variant="ghost" size="3xl" pill={false} aria-label={`View ${resources.length} learning resources`}>
          <AvatarGroup size={26}>
            {resources.map(resource => <Avatar key={resource.url} name={new URL(resource.url).hostname.replace(/^www\./, '')} color="info" />)}
          </AvatarGroup>
          <span>Learning resources</span>
        </Button>
      </Popover.Trigger>
      <Popover.Content side="top" align="start" width={360} minWidth="auto" maxWidth={360}>
        <div data-learning-resources className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Start learning</h2>
          <ul className="space-y-1">
            {resources.map(resource => <li key={resource.url}>
              <a href={resource.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-md p-2 hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2">
                <Avatar name={new URL(resource.url).hostname.replace(/^www\./, '')} color="info" size={28} />
                <span className="min-w-0"><span className="block text-sm font-medium">{resource.title}</span><span className="block truncate text-xs text-secondary">{new URL(resource.url).hostname}</span></span>
              </a>
            </li>)}
          </ul>
        </div>
      </Popover.Content>
    </Popover>
  </div>
}
