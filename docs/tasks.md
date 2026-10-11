# Your tasks from Slack

Pacenote keeps a short list of what people ask of you in Slack, and what you said you would do, on the Tasks screen, so
you do not keep it in your head or scroll back for it. Claude Code or Codex collects the tasks with its own Slack connector
and adds them through Pacenote's MCP server; Pacenote holds no Slack token for this. It is off by default. The plan and the
reasons behind it are in [the proposal](proposals/personal-tasks.md).

## Turning it on

1. In Pacenote, Settings > Tasks: turn on "Let AI tools add my tasks". DMs stay out unless you turn on "Count DMs and group
   DMs"; "Leave out channels" skips the ones you list.
2. Add Pacenote to Claude Code or Codex as an MCP server: Settings > Tasks lists both, whether each has Pacenote and reaches
   it, with an Add button that runs the tool's own CLI ([details](history-mcp.md#adding-it-to-a-tool)). The Tasks screen
   offers the same while neither has it.
3. Make sure the tool has a Slack connector: in Claude Code, the Slack connector of your claude.ai account.
4. Collect: in Claude Code, run `/mcp__pacenote__collect_tasks`. In Codex, ask it to collect your tasks with Pacenote's
   collect_context tool. The Tasks screen has a button that copies the command.

The settings apply at once, without restarting Pace.

## How a collection goes

- The tool calls `collect_context`: the rules, the channels to leave out, whether DMs count, since when to read (the last
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

They answer only while "Let AI tools add my tasks" is on, read on every call, and are separate from sharing the run
history.

## Not yet

Collecting on a schedule (from Pacenote, running the tool with Slack read tools only), a daily summary in your DM with Pace,
and adding a task by mentioning Pace are the next phases of [the proposal](proposals/personal-tasks.md).
