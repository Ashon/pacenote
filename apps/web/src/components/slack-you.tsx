import { useText } from '@/lib/i18n'
import { useSlackYou } from '@/lib/tasks'
import { text } from './slack-you.text'

/**
 * Who Collect now reads Slack as, under the names and groups that mean you:
 * looked up by a collection, with a word when it is not the account Pace
 * answers (owners: Pace's allowed members, when set)
 */
export function SlackYou({ owners }: { owners: string[] }) {
  const t = useText(text)
  const { data: you } = useSlackYou()
  if (you === undefined) return null
  const name = you ? (you.name ?? you.id) : undefined
  return (
    <div className="border-t border-border px-4 py-3 text-meta text-muted-foreground">
      {you ? (
        <p>
          {t.youAre(
            <span className="font-medium text-foreground">{name}</span>,
            you.realName !== you.name ? you.realName : undefined,
            you.team
          )}
        </p>
      ) : (
        <p>{t.notYet}</p>
      )}
      {you && owners.length > 0 && !owners.includes(you.id) && (
        <p className="mt-1 text-status-interrupted">{t.notPace(name)}</p>
      )}
    </div>
  )
}
