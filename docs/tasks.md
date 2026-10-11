# Your tasks from Slack

Pacenote keeps a short list of what people ask of you in Slack, and what you said you would do, on the Todo screen, so
you do not keep it in your head or scroll back for it. **Collect now** has Claude Code read Slack with the Slack connector
of your claude.ai account, read only, and add the tasks through Pacenote's MCP server; Pacenote holds no Slack token for
this. It is off by default. The plan and the reasons behind it are in [the proposal](proposals/personal-tasks.md).

## Turning it on

1. Sign in to Claude Code on this Mac, and connect Slack in claude.ai's Settings > Connectors.
2. In Pacenote, Settings > Todo: turn on "Gather my tasks from Slack". DMs stay out unless you turn on "Count DMs and group
   DMs"; "Leave out channels" skips the ones you list.
3. On the Todo screen, click **Collect now**. It takes a minute or two; the screen shows how far it got, and what it added.
   On other screens, the status bar shows it is still collecting.

The settings apply at once, without restarting Pace.

### What Collect now runs

Claude Code, headless (`claude -p /mcp__pacenote__collect_tasks`), kept to the collection:

- Only Pacenote's task tools and the Slack connector's read tools (search, read a channel or thread, reactions, channel
  and user lookups) are allowed; sending, drafting, scheduling, reacting and canvases are denied outright.
- Your own Claude Code settings, permissions, plugins, CLAUDE.md and MCP servers are not loaded (`--setting-sources
  project`, in Pacenote's data folder), and the only built-in tool is ToolSearch. Pacenote passes its own MCP server, so it
  does not need to be added to Claude Code.
- One collection runs at a time, for at most 10 minutes; Stop ends it.
- When it ends, the screen says what it added, the new tokens it spent and how many Slack lookups it made. The app keeps
  each collection it runs in `PACENOTE_DATA_DIR/tasks-collections.json` for 90 days: under the list, **Recent
  collections** shows the last 7 days, and the Overview counts their tokens per day. A collection run from inside your
  own AI tool spends that tool's tokens, so Pacenote does not see them.

### Collecting from inside your AI tool

Add Pacenote to Claude Code or Codex in Settings > Todo (one click per tool, [details](history-mcp.md#adding-it-to-a-tool))
to ask them about your tasks (`my_tasks`), or to collect from inside them: in Claude Code, `/mcp__pacenote__collect_tasks`;
in Codex, ask it to collect your tasks with Pacenote's `collect_context` tool, if it has a Slack connector.

## How a collection goes

- Claude Code (or your tool) calls `collect_context`: the rules, the channels to leave out, whether DMs count, since when to read (the last
  collection, or the last 7 days the first time), and the open tasks to check.
- With its Slack tools, read only, it looks for messages that mention you, threads you took part in whose last word is not
  yours, what someone said in a DM after your last message (when DMs count), and your own messages saying you will do
  something.
- It closes open tasks you answered in the thread, or whose message got a check mark (`close_task`), and adds what it found
  (`add_tasks`), each with the permalink of its message. A message is never a task twice, and messages from channels left
  out, or DMs while they do not count, are skipped whatever the tool sends.
- The messages go to the tool's model, as anything the tool reads does. Pacenote keeps the tasks in
  `PACENOTE_DATA_DIR/tasks.json` and your decisions in `tasks-decisions.json`.

## The list

- **Precision first.** A task is something someone asked you by name (or in a DM), or something you said you would do. An
  `@here`, "someone should look at this", or anything the tool is not sure about is a **Maybe**: it stays under its own tab,
  out of the list and `my_tasks`, until you keep it.
- **Done** and **Dismiss** are one click. Dismiss can say why: not for me, already done, not worth it. After three "not for
  me" from the same channel, the screen offers to leave that channel out.
- Closed tasks show under Done with why, and Reopen brings one back.
- Open tasks fade after 7 days and drop after 14; done, dismissed and closed ones are kept 14 days.
- Under Done, the screen shows how many of the tasks you settled you dismissed. Above about 30%, tasks are picked too
  loosely.

## The MCP tools

| Tool | What it does |
| --- | --- |
| `collect_context` | The rules, what to leave out, since when, and the open tasks |
| `add_tasks` | Adds tasks, each from one Slack message (its permalink), and marks the collection finished |
| `close_task` | Closes an open task: you replied, it got a check mark, or it was settled some other way |
| `my_tasks` | Your open tasks, with who asked, where, a due hint, why, and a link; Maybes are left out |
| `collect_tasks` (prompt) | The steps of a collection, as a slash command in Claude Code |

They answer only while "Gather my tasks from Slack" is on, read on every call, and are separate from sharing the run
history.

## Not yet

Collecting on a schedule (from Pacenote, running the tool with Slack read tools only), a daily summary in your DM with Pace,
and adding a task by mentioning Pace are the next phases of [the proposal](proposals/personal-tasks.md).
