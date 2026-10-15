# Your tasks from Slack

Pacenote keeps a short list of what people ask of you in Slack, and what you said you would do, on the Todo screen, so
you do not keep it in your head or scroll back for it. **Collect now** has Claude Code read Slack with the Slack connector
of your claude.ai account, read only, and add the tasks through Pacenote's MCP server; Pacenote holds no Slack token for
this. It is off by default. The plan and the reasons behind it are in [the proposal](proposals/personal-tasks.md), and
the pieces are drawn in [Architecture](architecture.md#your-tasks-and-ai-tools).

## Turning it on

1. Sign in to Claude Code on this Mac, and connect Slack in claude.ai's Settings > Connectors.
2. In Pacenote, Settings > Todo: turn on "Gather my tasks from Slack". DMs stay out unless you turn on "Count DMs and group
   DMs"; "Leave out channels" skips the ones you list.
3. On the Todo screen, click **Collect now**. It takes a minute or two; the screen shows how far it got, and what it added.
   On other screens, the status bar shows it is still collecting. Tasks it adds while you look at the list wait behind a
   "2 new tasks" notice, so the rows you are reading stay put; click it to show them.

The settings apply at once, without restarting Pace.

### What Collect now runs

Claude Code, headless (`claude -p /mcp__pacenote__collect_tasks`), kept to the collection:

- Only Pacenote's task tools and the Slack connector's read tools (search, read a channel or thread, reactions, channel
  and user lookups) are allowed; sending, drafting, scheduling, reacting and canvases are denied outright.
- Your own Claude Code settings, permissions, plugins, CLAUDE.md and MCP servers are not loaded (`--setting-sources
  project`, in Pacenote's data folder), and the only built-in tool is ToolSearch. Pacenote passes its own MCP server, so it
  does not need to be added to Claude Code.
- One collection runs at a time, for at most 10 minutes; Stop ends it.
- When it ends, the screen says what it added, the new tokens it spent and how many Slack lookups it made. Each collection
  the app runs is a run in the run history, beside the answers, and is kept as long as they are: under the list,
  **Recent collections** shows the last 7 days and opens a collection's run in Runs, and the Overview counts their tokens
  per day. A collection's run keeps its tool calls (which tool, when, how long), what Pacenote's own tools were given and
  answered, and the tokens; not what Slack returned or the model's own words, which quote your messages. The run history
  MCP leaves collections out. (v0.4.4 and v0.4.5 kept a log in `PACENOTE_DATA_DIR/tasks-collections.json`, which is still
  read and no longer written.) A collection run from inside your own AI tool spends that tool's tokens, so Pacenote does
  not see them.

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
- The Overview shows what you handled over the last 14 days: how many each day, how they ended (in Claude Code or Codex,
  closed in Slack, or marked done), and how long they usually took from their message. Done, closed, and dismissed as
  already done count; dismissed as not for you or not worth it does not.

## Continuing a task

**Continue in Claude Code** (or Codex) opens a session in a terminal, in the task's repository on this Mac, with the
task and what came before it as the first prompt. Pacenote names the session, so the task's work log has it from the
start, and opening it again later (the terminal icon, `claude --resume`, the Claude app) keeps it there.

With "Show sessions you start yourself" on (Settings > Todo), the work log also has the sessions you started on your
own, from Claude Code's and Codex's logs on this Mac (the last 14 days; Claude Code's in the Claude app and IDE
extensions too), checked every 30 seconds or so while the Todo screen is open:

- **Linked:** a session that used Pacenote's task tools for the task, one whose prompt has the task's Slack link, or one
  that worked on the task's branch in its repository: a branch other than the default one that a session already in its
  log worked on. So a session continued after `/clear`, in a new terminal or in a worktree stays with the task. A branch
  two tasks share links neither.
- **Suggested:** a session in the task's repository, active since the task was posted, whose prompts share words with
  it (a PR number, an issue key, a file or code name, words of its title) shows as "Looks related", for you to **Link**
  or say **Not it**, which is not asked again. A task without a repository needs a stronger match, such as its pull
  request's link.
- Only the session's id, folder and branch are kept; what was said stays in the tool's log, read when you open it.
  Pacenote's own sessions (a collection, a reply draft) and temporary folders are left out, and nothing from the logs
  leaves this Mac.

An open task's row says when its latest session was last active ("Claude Code 5m ago").

A session you start yourself knows the tasks of its folder without being told. Claude Code and Codex run Pacenote's MCP
server in the folder they work in, so it reads that checkout's repository as it starts and puts its open tasks (up to
five, each with its id, who asked, the due hint and a line of its summary) in the instructions the tool keeps for the
session, with when to use them: call `task_context` before working on one, and `close_task` with what was done once it
is. Asked to review a pull request one of them names, the session starts from the task. In other folders the
instructions only say how many tasks are open. Two prompts make it one command:

- `/mcp__pacenote__task` (Claude Code; the `task` prompt elsewhere) brings a task into the session, by its id, its
  Slack link or a few words, and proposes a first step.
- `/mcp__pacenote__done` wraps the session up into its task: it closes it with what was done, a wrap-up and a reply for
  you to send, or, when the work is not done, leaves it open and says what is left.

### Tasks a session keeps

Work left after a task, or something you ask your AI tool to keep for later ("remember to bump the SDK after the
release"), becomes a task of your own with `add_followup`: its source is **This Mac**, it is in the repository of the
task it follows or the session's folder, and its row says which task it was left after ("Left after “Review the payment
retry PR”"). The same title left after the same task, still open, is kept once. It has no thread, so a collection never
checks it in Slack and there is no reply to draft; the session that does it, or you, closes it.

### When a task looks done

With Settings > Todo > "Say when a task looks done" on, Pacenote does not wait for a session to close its task. When the
latest session of an open task has been quiet for 10 minutes, Claude Code, headless and with no tools or MCP servers,
reads the session's last turns and, through `gh`, read only, the state of its branch's pull request, and says whether
the work is done, how it ended and what is left. A task that looks done says so on its row; open, it shows how it ended
with **Close it** (closed as done in its session, with that as its wrap-up) and **Not yet**, and each thing left with
**Keep as a task**. A session is read again only after it was active again, at most two at a time, while Todo is open.
It uses your Claude Code login, and is off until you turn it on.

## The MCP tools

| Tool | What it does |
| --- | --- |
| `collect_context` | The rules, what to leave out, since when, and the open tasks |
| `add_tasks` | Adds tasks, each from one Slack message (its permalink), and marks the collection finished |
| `close_task` | Closes an open task: you replied, it got a check mark, or it was settled some other way |
| `add_followup` | Keeps a task of your own from the session: work left after a task, or something to do later |
| `my_tasks` | Your open tasks, with who asked, where, a due hint, why, and a link; Maybes are left out |
| `collect_tasks` (prompt) | The steps of a collection, as a slash command in Claude Code |
| `task` (prompt) | Brings one of your tasks into the session you are in |
| `done` (prompt) | Closes the task the session worked on, with what was done |

They answer only while "Gather my tasks from Slack" is on, read on every call, and are separate from sharing the run
history.

Todo shows what an AI tool does with them as it does it. Each call that does something adds a line to
`PACENOTE_DATA_DIR/tasks-activity.jsonl` (the tool, what it did, the task's id and the names of the fields it changed,
never what Slack said), and the app watches the data folder, so the screens change the moment a task file does:

- The line under Todo's title says what the tool is doing ("Claude Code is collecting your tasks: 3 found so far") or
  just did ("Claude Code closed …"), for two minutes after its last call.
- A task a session is looking at or changing says "Working in Claude Code" on its row, until the session closes it or
  goes quiet for two minutes.
- What it changes in view (a due date, a title, the repository, the summary) lights up a moment and fades.
- Collect now and drafted replies show their own progress, so their calls stay out of the line.

## Not yet

Collecting on a schedule (from Pacenote, running the tool with Slack read tools only), a daily summary in your DM with Pace,
and adding a task by mentioning Pace are the next phases of [the proposal](proposals/personal-tasks.md).
