# Recap

**Recap**, in the sidebar between Todo and You, shows what you did: a day as a standup, a week by area, a month by
where it went. Todo is what is ahead, Recap what is behind, and You where you contribute.

## Three distances

| Recap | For | Shows | Copies as |
| --- | --- | --- | --- |
| Day | A standup, the end of a day | Done (tasks, your commits by repository), Doing (open tasks worked on today), Next (open tasks, due ones first). In the morning, yesterday's done comes first | A standup: done, doing, next |
| Week | A weekly update, a 1:1 | Each area's done tasks and its feature and release commits, the rest of the commits as a count, what carries over, and its share of the week | An update by area |
| Month | A retrospective | The same by area for the month, which areas started in it and which went quiet, and who asked you most | A recap by area |

A week starts on Monday, counted as ISO weeks (2026-W42). ‹ and › step to the period before and after, and each period
has its own address: `#/recap/day/2026-10-15`, `#/recap/week/2026-W42`, `#/recap/month/2026-10`. An area's name opens
it on the You screen, and an area's Lately on You opens this week's recap.

## Where it comes from

The record is counted again each time, at most every minute, with no model asked:

- **Tasks**: the ones done in the period (done, closed by a session or in Slack, or dismissed as done already) and how
  they ended, the new asks of you, and the ones still open at the end. Maybes and tasks you dismissed as not yours are
  left out.
- **Your commits**, by their subjects only: `git log --all --no-merges` by your git email (and the email a checkout's
  own config gives), in your repositories' folders on this Mac, the remembered ones and the ones your sessions ran in.
  Diffs are never read. The same commit under another hash counts once.
- **Days of work** in each area: days with a session, a commit or a task done.
- **What you asked Pace**, from the run history, in the area of its channel.

Each is put in its area (from [Where you contribute](you.md)); what fits none is under Elsewhere.

## Write it up

**Write it up** has Claude Code sum the recap up in a few sentences: two or three for a day, up to five for a month, in
the language most of your task titles are in, area by area, the commits summed up into what the work was about. It runs
only when you click, as `claude -p` with no tools, no MCP servers and none of your settings, on your Claude Code login,
and is given only the recap's own lines. What it wrote is kept in `PACENOTE_DATA_DIR/recaps.json`, shown above the
recap, and comes back with the period; **Write again** replaces it.

## Copy

**Copy** puts the recap on the clipboard as Markdown (with what was written up first), in Slack's formatting, or the
written sentences alone. Nothing is sent.

## For your AI tools

`my_recap` (period day, week or month, and a day in it) gives an AI tool the same record: each area's done tasks, its
commits' subjects, days of work, new asks and what is still open, today's doing and next, a month's changes, and what
was written up. The `recap` prompt (in Claude Code, `/mcp__pacenote__recap week`) has the session write your standup,
weekly update or monthly recap from it, for you to copy. Both answer with the task tools and only read.
