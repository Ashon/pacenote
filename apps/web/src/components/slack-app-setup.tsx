import { ExternalLink } from 'lucide-react'
import manifest from '../../../../slack-app-manifest.yaml?raw'
import { Button } from '@/components/ui/button'
import { useText } from '@/lib/i18n'
import { text } from './slack-app-setup.text'

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
  const t = useText(text)
  return (
    <div className="border-t border-border bg-well/60 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-row">{t.noAppYet}</p>
          <p className="mt-0.5 text-meta text-muted-foreground">
            {t.opensWith}
          </p>
        </div>
        <Button size="sm" asChild>
          <a href={SLACK_APP_URL} target="_blank" rel="noreferrer">
            <ExternalLink />
            {t.create}
          </a>
        </Button>
      </div>
      <ol className="mt-2.5 list-decimal space-y-1 pl-5 text-meta text-muted-foreground">
        <li>{t.appToken}</li>
        <li>{t.botToken}</li>
        <li>{t.memberId}</li>
      </ol>
    </div>
  )
}
