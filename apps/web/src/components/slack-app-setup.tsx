import { ExternalLink } from 'lucide-react'
import manifest from '../../../../slack-app-manifest.yaml?raw'
import { Button } from '@/components/ui/button'

/**
 * Slack's link that opens app creation with Pacenote's manifest filled in
 * (slack-app-manifest.yaml, without its comments)
 */
export const SLACK_APP_URL = `https://api.slack.com/apps?new_app=1&manifest_yaml=${encodeURIComponent(
  manifest
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
)}`

/**
 * Your own Slack app before its tokens are in: Slack opens with the manifest,
 * and the steps say where the two tokens come from.
 */
export function SlackAppSetup() {
  return (
    <div className="border-t border-border bg-well/60 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">No Slack app yet?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Slack opens with Pacenote's manifest filled in: choose your
            workspace and create the app.
          </p>
        </div>
        <Button size="sm" asChild>
          <a href={SLACK_APP_URL} target="_blank" rel="noreferrer">
            <ExternalLink />
            Create the Slack app
          </a>
        </Button>
      </div>
      <ol className="mt-2.5 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        <li>
          Basic Information &gt; App-Level Tokens: generate a token with the
          connections:write scope. That is the App token.
        </li>
        <li>
          Install App: install it to your workspace and copy the Bot User OAuth
          Token. That is the Bot token.
        </li>
        <li>
          Add your Slack member ID under Who can ask, save, and invite Pace to a
          public channel with /invite @Pace.
        </li>
      </ol>
    </div>
  )
}
