# Proposal: your own tasks, gathered from Slack

Status: phase 0 shipped in v0.4.0 with a Slack user token, and moved to the AI tool's Slack connector in v0.4.1
(2026-10-11). Collect now on the Tasks screen (Claude Code headless with Slack read tools only) followed; collecting on a
schedule is still phase 1.
Storyboard: the "Pacenote personal tasks storyboard" canvas.

## Why

Pace reads the pace notes so the driver keeps their eyes on the road. Today that means answering when someone mentions
Pace. The same idea turned toward the person who runs Pacenote: read the channels for what they owe other people
(a question waiting for them, a request, a "can you take a look", something they said they would do), so they do not
have to keep it in their head or scroll back to find it.

## What it does

1. **Collect.** Claude Code or Codex reads Slack with its own Slack connector: since the last collection (the last 7 days
   the first time), the messages that mention you, threads you took part in, your DMs if they count, and what you said you
   would do. It decides which are tasks, by the rules Pacenote gives it.
2. **Keep.** It adds them through Pacenote's MCP server (`add_tasks`), keyed by the message's permalink, so a message is
   never a task twice, and closes the ones you answered (`close_task`).
3. **Show.** The Tasks screen in the app, and `my_tasks` for the tools; later, a short summary Pace sends you in a DM.

## Why the connector, not a token of Pacenote's (v0.4.1)

v0.4.0 read Slack with a user token of Pacenote's own: user scopes added to the Slack app, a reinstall, the token copied
into Settings, and Pacenote's own code for reading history, filtering and asking the reasoner. The tools people already use
have a Slack connector with their own authorization, so the reading moved there: Pacenote keeps the list and the rules,
holds no Slack token for this, and has much less code. The trade-off: a collection runs when the tool runs (a slash
command, or later a schedule), and it needs a workspace that allows the tool's Slack connector. Saving a user token
automatically (Slack's PKCE flow with a localhost redirect) was set aside: turning on PKCE cannot be undone for the app.

## Decided

| Question | Answer |
| --- | --- |
| Where to look | Public and private channels you are in, by default. DMs and group DMs only when you turn them on. Channels can be left out. |
| Where tasks show | The Tasks screen and the `my_tasks` MCP tool; the daily DM summary in phase 1 |
| How to read Slack | The AI tool's own Slack connector, read only (v0.4.1). v0.4.0 read conversation history with a user token of Pacenote's. |
| When to collect | Collect now on the Tasks screen, or the collect command in the tool (`/mcp__pacenote__collect_tasks` in Claude Code) |
| Precision | When unsure, it is a Maybe, not a task (below) |

## Precision first

A list that fills with wrong guesses adds load instead of removing it, and dismissing is itself a small chore. So the
first lever is picking fewer, better tasks; Dismiss is the safety net.

- **A task**: someone asked you by name (a mention, or a DM when that is on), or you said you would do something.
- **A Maybe**: an `@here` or `@channel`, "someone should look at this", or anything the reasoner is not sure about.
  Maybes stay out of the list and `my_tasks` until you keep one.
- **Nothing**: an FYI, a thanks, something already answered or done in the thread.
- A task **closes by itself** when you reply in its thread after it, or when its message gets a ✅ (white_check_mark).

## Dismissing cheaply, and learning from it

- Done and Dismiss are one click. Dismiss can carry a reason: not for me, already done, not worth it.
- After three "not for me" dismissals from the same channel in two weeks, the screen offers once to leave that channel out.
- **Dismiss rate**: the share of collected tasks you dismissed. Above about 30%, the rules are too loose. The Tasks screen
  shows it under Done; later it joins the answers' usefulness in Overview.

## Design

**MCP.** On Pacenote's MCP server, behind Settings > Tasks > Gather my tasks from Slack (separate from sharing the run
history): `collect_context` (the rules, the channels left out, whether DMs count, since when, the open tasks), `add_tasks`,
`close_task`, `my_tasks`, and the `collect_tasks` prompt, which Claude Code offers as a slash command. `add_tasks` holds the
settings whatever the tool sends: it skips messages from channels left out and DMs while they do not count.

**Sources.** A source is a connector of the AI tool, which holds the access and does the reading; Pacenote holds no
token for it. `src/tasks/sources.ts` keeps, for each source, only what keeps a collection safe and its results in order:
the connector's read tools a collection may use (with their names in the run history), its tools that write (denied
outright), how to read its message links, and how a task from it is keyed. A connector that is not listed is not used.
Slack is the first source; its tasks keep the ids they had before (`<conversation>:<ts>`).

**Files.** The MCP server writes `tasks.json`; the app writes your decisions (done, dismissed with a reason, kept) to
`tasks-decisions.json`. A task: `{ id, source { app?, conversation, label, message, thread, permalink }, title, askedBy,
kind: asked | promised, due?, confidence: sure | maybe, reason, postedAt, foundAt, addedBy?, closed? { at, why: replied
| checked | resolved } }`. A source without `app` is Slack's, as every task was before there were sources.

**Keeping.** Open tasks fade after 7 days and drop after 14; done and dismissed ones are kept 14 days.

## Risks

- **Trust boundary.** The tool's Slack connector sees what you can see, and also has tools that write (send, react). The
  collect prompt tells it to read only, and a collection from Pacenote allows only read tools (Collect now does; a
  scheduled one must too).
- **Where the text goes.** The messages go to the tool's model, as anything the tool reads does.
- **Noise.** Precision first, Maybe, closing by itself, the dismiss rate.
- **Workspace policy.** Some workspaces do not allow the tool's Slack connector; tasks then cannot be collected.
- **Writes from AI tools.** `add_tasks` and `close_task` are the MCP server's first writes; they touch only the task list,
  and stay closed until you turn tasks on.

## Phases

| Phase | Scope |
| --- | --- |
| 0 | The MCP tools and the collect prompt, precision first with Maybe, closing, Done and Dismiss with reasons, the leave-out offer, the dismiss rate, the Tasks screen |
| 1 | Collecting from Pacenote: Collect now (Claude Code headless with Slack read tools only) first, then on a schedule; the daily DM summary, the dismiss rate in Overview |
| 2 | Sending tasks to Linear, Jira or Reminders |

## Still open (phase 1)

- How often to collect on a schedule (30 minutes was suggested).
- When the daily summary goes out, and whether it skips days with nothing open.
- Whether you can add a task by mentioning Pace ("@Pace remind me to ..."), so tasks are not only guessed.
