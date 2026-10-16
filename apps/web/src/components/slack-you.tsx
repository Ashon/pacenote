import { useSlackYou } from '@/lib/tasks'

/**
 * Who Collect now reads Slack as, under the names and groups that mean you:
 * looked up by a collection, with a word when it is not the account Pace
 * answers (owners: Pace's allowed members, when set)
 */
export function SlackYou({ owners }: { owners: string[] }) {
  const { data: you } = useSlackYou()
  if (you === undefined) return null
  const name = you ? (you.name ?? you.id) : undefined
  return (
    <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
      {you ? (
        <p>
          In Slack you are{' '}
          <span className="font-medium text-foreground">{name}</span>
          {you.realName && you.realName !== you.name && ` (${you.realName})`}
          {you.team && ` in ${you.team}`}, as Collect now last looked you up.
        </p>
      ) : (
        <p>
          The next collection looks up who you are in Slack, so a request that
          calls you by your name counts.
        </p>
      )}
      {you && owners.length > 0 && !owners.includes(you.id) && (
        <p className="mt-1 text-status-interrupted">
          Collect now reads Slack as {name}, not as the account Pace answers.
        </p>
      )}
    </div>
  )
}
