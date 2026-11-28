# Your tasks from Slack

Pacenote keeps a short list of what people ask of you in Slack, and what you said you would do, on the Todo screen, so
you do not keep it in your head or scroll back for it. **Collect now** has Claude Code read Slack with the Slack connector
of your claude.ai account (or Codex with ChatGPT's Slack app), read only, and add the tasks through Pacenote's MCP
server; Pacenote holds no Slack token for this. It is off by default. The plan and the reasons behind it are in [the proposal](proposals/personal-tasks.md), and
the pieces are drawn in [Architecture](architecture.md#your-tasks-and-ai-tools).

## Which AI does the work

Collect now, filling in new tasks, reply drafts, Looks done and Recap's Write it up run headless on this Mac, with your
own login, on the AI chosen in Settings > Todo > Pacenote's own work: Claude Code, Codex or opencode.

- **Claude Code** runs as `claude -p` with only project settings (none, in the data folder), Pacenote's task tools and
  the read tools of your claude.ai Slack connector; the connector's tools that write are denied.
- **Codex** runs as `codex exec` without your config.toml and rules, with only ChatGPT's Slack app turned on and its
  tools that change or delete turned off. Its other tools that write need an approval it never gets
  (`approval_policy="never"`), so they are refused. Its shell reads only the platform's basics.
- **opencode** runs `opencode run --standalone` with the model you set up in it (Settings > Todo > opencode model, or
  its own default), such as a local model or one you host yourself, through an OpenAI-compatible API. Its private server loads
  Pacenote's config beside yours (`opencode-pacenote.json` in the data folder): an agent with no tools, denied
  everything it could do on this Mac, and the run's session is deleted after. It reads no Slack yet, so it does Looks
  done and Write it up, and Collect now and drafts go to Claude Code or Codex.
- **Switch when it can't** (on by default): at a usage limit, unavailable (overloaded, or its server out of reach),
  signed out, not on this Mac or without a Slack connector, Claude Code or Codex does the work in the same run, and the run, the Todo line, the draft and the recap say
  so. One at its usage limit rests until the limit resets (the time its error gives, or an hour), so work goes to the
  other one first; overloaded rests ten minutes. Looks done waits while both rest. When the other one is not on this
  Mac, it was never one to switch to: the work says why the first could not.
- Settings shows each one: whether it is on this Mac and signed in, and until when it rests (`own-ai.json` in the data
  folder keeps what each last did).

Both must read the same Slack workspace: a task is keyed by its message, so collecting with either never adds it twice.

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
- It is Claude Code on this Mac whichever CLI answers your mentions, so its sign-in is the one that counts. When that
  sign-in ran out or was revoked, the screen says so and offers **Sign in to Claude Code**: it opens `claude auth login`
  in your terminal (the one in Settings > Todo), which goes on in the browser. Then collect again.
- When it ends, the screen says what it added, the new tokens it spent and how many Slack lookups it made. Each collection
  the app runs is a run in the run history, beside the answers, and is kept as long as they are: Todo's **Collections**
  tab shows the last 7 days, ten at a time, and opens a collection's run in Runs, and the Overview counts their tokens per
  day. A collection's run keeps its tool calls (which tool, when, how long), what Pacenote's own tools were given and
  answered, and the tokens; not what Slack returned or the model's own words, which quote your messages. The run history
  MCP leaves collections out. (v0.4.4 and v0.4.5 kept a log in `PACENOTE_DATA_DIR/tasks-collections.json`, which is still
  read and no longer written.) A collection run from inside your own AI tool spends that tool's tokens, so Pacenote does
  not see them.

### Collecting from inside your AI tool

Add Pacenote to Claude Code, Codex or opencode in Settings > Todo (one click per tool, [details](history-mcp.md#adding-it-to-a-tool))
to ask them about your tasks (`my_tasks`), or to collect from inside them: in Claude Code, `/mcp__pacenote__collect_tasks`;
in Codex, ask it to collect your tasks with Pacenote's `collect_context` tool, if it has a Slack connector.

## How a collection goes

- Claude Code (or your tool) calls `collect_context`: the rules, the channels to leave out, whether DMs count, since when
  to read (the last collection, or the last 7 days the first time), the open tasks to check, and who you are.
- With its Slack tools, read only, it looks for messages that mention you (your @mention, and the names and groups that
  [mean you](#who-you-are-in-slack)), threads you took part in whose last word is not yours, what someone said in a DM
  after your last message (when DMs count), and your own messages saying you will do something.
- It closes open tasks you answered in the thread, or whose message got a check mark (`close_task`), and adds what it found
  (`add_tasks`), each with the permalink of its message. A message is never a task twice, and messages from channels left
  out, or DMs while they do not count, are skipped whatever the tool sends.
- The messages go to the tool's model, as anything the tool reads does. Pacenote keeps the tasks in
  `PACENOTE_DATA_DIR/tasks.json`, your decisions in `tasks-decisions.json`, and the stages you set (in progress, waiting)
  in `tasks-stages.json`, and your groups in `tasks-bundles.json`. With Pacenote on another of your Macs, they are the
  same there too ([Your Macs](macs.md)).

## Who you are in Slack

A collection is told who you are, so it can tell what is asked of you from what only looks like it:

- **Your names.** The first collection looks up your own Slack profile with its Slack connector, and does again every 30
  days; Settings > Todo says who it read Slack as ("In Slack you are ashon (Ashon Lee) in Acme"), and when that is not the
  account Pace answers. Add the other names people call you, such as a nickname or your name in another language, under
  "Other names people call you": a request that calls you by one is yours, @mention or not.
- **Your groups.** "Groups that mean you" lists the Slack user groups whose mention asks you, such as an on-call group.
  An ask of one of them is a task. An ask of a group neither list has is a Maybe, and its row asks once: "Does
  @infra-oncall mean you?" **It's me** adds the group to Settings and keeps its Maybes as tasks; **Not me** leaves later
  asks of that group out, unless they name you. Adding the group to Settings later takes that back.
- The collection searches for your names and groups as well as your @mention. Pacenote keeps your id, names and
  workspace in `tasks.json`, and no Slack token.

## The list

- **Precision first.** A task is something someone asked you by name (or in a DM, or through a group that means you), or
  something you said you would do. An `@here`, a group not known to mean you, "someone should look at this", or anything
  the tool is not sure about is a **Maybe**: it stays under its own tab, out of the list and `my_tasks`, until you keep it.
- **Done** and **Dismiss** are one click. Dismiss can say why: not for me, already done, not worth it. After three "not for
  me" from the same channel, the screen offers to leave that channel out.
- Closed tasks show under Done with why, and Reopen brings one back. Done lists the ten settled last, the latest first,
  and ten more on each **Show more**; a task opened from a link is listed however far down it is.
- **In progress** and **Waiting** sit on top of open. A task is in progress when you mark it (More > Mark in progress)
  or when a session worked on it in the last day, and comes first in Open. A task waiting on someone else (More >
  Waiting on someone else) moves to the Waiting tab until a collection changes it after that (someone answered in its
  thread) or you put it back. To AI tools, Pace, Recap and areas it is still open, so a collection keeps reading its
  thread. The stages are kept apart, in `tasks-stages.json`, so a Pacenote before 0.6.12, here or on another Mac, shows
  such a task as open and loses nothing.
- **Today**, above the tabs, names the ask waiting on you (a due one first), the task in progress to pick up and the one
  waiting longest on someone else, counted from the list with no model.
- **New task** (⌘N) adds a task of your own on This Mac, in the project its words point to (or the one you pick, among
  those with a repository); its row says "You added it".
- **Fill in new tasks** (Settings > Todo, on by default, only with an AI set up): a task you add here, on your iPhone,
  iPad or Android phone (paired), or one a device hands over when it pairs, is kept as you wrote it at once, and your
  AI fills in what it lacks a moment later: its project, what kind it is (code, reply, other), two or three sentences
  of what to know, the open task it carries on from, who asked (only a name its title says) and when it is due (only
  words its title says). The row says "Claude Code is filling it in", then "Filled in just now" for a day; the opened
  row has a Filled in line with Undo. One that looks like an open task asks "Same task" (the new one is dismissed and
  the other opens) or "Keep both".
  - Pacenote gathers what the AI is given (`src/tasks/fill.ts`): your projects (You's areas), your open tasks, how
    tasks ended in the last 30 days and, for the repositories the task's words point to, their state on this Mac read
    with git (the branch, recent commits, commits on no remote, changes not committed). The CLI runs with no tools
    (`apps/desktop/src/filler.ts`), and its answer is checked against that: a repository you have, an open task's id,
    a name or a date in the title. Tasks added one after another go together after 5 seconds, one run at a time; when
    the AI cannot (at its limit, signed out), the task stays as you wrote it.
  - What you set stays: the title, a project you picked (one guessed from the words may change) and a due date you
    wrote. The fill is one update ("Filled in when you added it"), and Undo another ("Took back what was filled in"),
    which leaves the fields it filled empty so your other Macs take it back too. Neither moves a waiting task or counts
    as an update of its thread. An older Pacenote shows them as updates and ignores `looksLike`.
- Open tasks fade after 7 days and drop after 14; done, dismissed and closed ones are kept 14 days.
- Above Done's list, the screen shows how many of the tasks you settled you dismissed. Above about 30%, tasks are picked
  too loosely.
- The Overview shows what you handled over the last 14 days: how many each day, how they ended (in Claude Code or Codex,
  closed in Slack, or marked done), and how long they usually took from their message. Done, closed, and dismissed as
  already done count; dismissed as not for you or not worth it does not.

## Groups of tasks

Tasks that are one piece of work, such as a change, its test and its docs, or a review and the reply someone waits for
on it, go in one group. A group is a row in Todo with its tasks indented under it: its name, how many tasks, who waits
and how far along, **Continue here** and **Done all**. Each task stays a task of its own, with its own row, buttons and
count, and none is hidden.

- **Your AI asks; you decide.** With **Group similar tasks** on (Settings > Todo, on by default, only with an AI set up),
  after a fill or a collection your AI looks at each project with three or more open tasks in no group, one new since
  it last looked there, at most once in 10 minutes. When some look like one piece of work, the Open tab asks above the
  list: **Group them** or **Not one piece**. Not one piece is kept, so those tasks are not offered again. It never
  groups tasks by itself.
- **By hand**, More > **Group with…** on a task groups it with other open tasks of its project, or puts it into a group
  there. More > **Move out of the group** takes it out. A task is in one group at most; a group left with fewer than two
  tasks is gone, and one whose tasks are all done shows as done.
- **Filled in.** Your AI fills each group in from its tasks: a title, two or three sentences on what the work is and how
  its tasks fit together, who waits for what (only for an open task someone asked), the earliest due (a task's own due),
  what to do first and why, and the order to do them in (`follows` is a hint). Pacenote gathers the tasks
  (`src/tasks/bundle-ai.ts`), the CLI runs with no tools (`apps/desktop/src/bundler.ts`), and its answer is checked
  against the tasks it was given: their ids, their names, their dues. When the tasks change, it fills the group in
  again. Opened, the group says when and by which AI, with **Undo** (back to the fill before, and no fill again until
  you ask) and **Fill again**.
- **Continue here** on a group starts one session for all its open tasks: the session is the first one's work, and its
  first message has the group's summary and the other tasks after it, in order, each to read with `task_context` before
  starting it and to close with `close_task` once done.
- **Folding:** a group's arrow folds the group, its summary and its tasks together, and Todo keeps it folded. A group
  is open while one of its tasks is open.
- **Done all** closes the group's open tasks together, with one note of what you did, which your AI writes first for you
  to change, kept with the group. Replies stay per task: draft one on each task for whoever waits.
- To an AI tool, `task_context` on a task in a group also gives the group: its title, its summary and its other tasks
  with their state.
- Groups are kept in `tasks-bundles.json` (`src/tasks/bundles.ts`), apart from `tasks.json`, and merge between your
  Macs, the latest change of each group winning; where your AI last looked stays on its Mac. A Pacenote before 0.6.41
  ignores the file and lists the tasks as before. Your phone or iPad gets the groups from the Mac and lists them the same
  way (`src/tasks/bundle-view.ts`, plain data with no file), and changes them only by asking the Mac.

## Continuing a task

**Continue here** opens a new session in Pacenote, on its page under Sessions, with the task's repository on this Mac
as its folder and the task and what came before it written in as its first message. Pick Claude Code or Codex (the
last one picked stays), change the message, the folder or how it asks before it acts, then **Start**: Pacenote runs the
installed `claude` there with your own sign-in (`claude -p --session-id <id> --name <the task's title>`), or Codex's
`codex app-server` with your own ChatGPT sign-in, the session is the task's work from the start, and its page opens in
place, to go on as for any session Pacenote runs (see [Sessions on this Mac](#sessions-on-this-mac)). It needs
"Sessions on this Mac" on, which the page turns on with one button. While the task has a session you have not closed,
resting or at work, its row opens that one instead, and **Continue here** for a new one is in the menu beside it.

The menu beside it, **Continue in another app**, opens the task in a tool's own session instead: Claude Code, Codex or
opencode, the tool set in **Open code tasks in** (Settings > Todo) first, each saying where it opens. With **Open
sessions in: Terminal**, the default, it opens a session in a terminal, in the task's repository on this Mac, with the
task and what came before it as the first prompt. Pacenote names the session, so the task's work log has it from the
start, and opening it again later (the terminal icon, `claude --resume`, the Claude app) keeps it there.

With **Open sessions in: Desktop app** (Settings > Todo), the menu opens the Claude app's Code tab or the Codex app
instead, in the folder, with the task written in for you to send there. Neither app sends it by itself, and the Claude
app asks you to confirm the folder first. The work log shows the session as waiting until you send it, then finds it by
the marker in its first prompt. A Codex session continues in the Codex app; a Claude Code session continues in your
terminal (`claude --resume`), as the Claude app has no link to continue one. Without the app on this Mac, the menu opens
your terminal instead and says so. A link carries a prompt of up to 12,000 characters; a longer one leaves what came
before to `task_context`.

**Continue in opencode**, in the menu, opens `opencode --prompt` in your terminal, whatever Open sessions
in says, as opencode has no app to write the task into. opencode keeps its sessions in its own service rather than in
files, so while the Todo screen is open Pacenote asks its CLI every 10 seconds or so: `opencode session list` in the
task's folder finds the session whose first message has the task's marker, and says when it last wrote; `opencode
session export` reads it for the session's log and for "looks done". It continues with `opencode --session <id>`.
Continue's menu offers the tools that are on this Mac, opencode among them once its CLI is on the PATH.

With "Sessions on this Mac" on (Settings > Todo), the work log also has the sessions you started on your
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

A task's details have a **Made here** line when its sessions made something: the pages, designs and docs they put on
claude.ai and the files a Codex answer linked, each as its sessions last left it (see What it made, in
[Sessions on this Mac](#sessions-on-this-mac)). When one only you can open is on it, the line says to share it on
claude.ai before sending its link to whoever asked. A reply drafted for the task links what was made for it where the
reply needs it.

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
with **Done** (closed as done in its session, with that as its wrap-up) and **Not yet**, and each thing left with
**Keep as a task**. A session is read again only after it was active again, at most two at a time, while Todo is open.
It uses your Claude Code login, and is off until you turn it on.

## Sessions on this Mac

With "Sessions on this Mac" on, the desktop app's **Sessions** screen, below Todo in the sidebar, lists the Claude Code
and Codex sessions on this Mac in one place, and the sidebar counts the ones waiting for you. It is off until you turn it
on, from the switch or from the screen's card, which says what it reads first.

- **Open:** the Claude Code sessions Claude Code says are open (`claude agents --json`), the Codex sessions Pacenote
  runs, and the Codex sessions that wrote to their logs today until you close them (Codex keeps no list of open ones;
  `codex exec` runs, Pacenote's among them, and subagents are left out). Each is in your area (Areas) whose repository it
  works in, else under its repository, else "Not in a project". If Claude Code cannot list its sessions, its sessions
  that wrote today stand in for them.
- **Where it runs:** told from the process a session runs under: the Claude app, claude.ai (`claude remote-control`),
  or the terminal or editor app it was started in. A Codex session says whether the Codex app ran it.
- **State:** working (on a turn), your turn (stopped within the last 30 minutes), or quiet for how long. Codex sessions
  are told from when they last wrote.
- **Resting is not ended:** a session that is a task's, or that Pacenote ran, stays open once nothing runs it (Pacenote
  lets its run go after 30 minutes, or its terminal or app closed), your turn or quiet as it was. Its page goes on with
  it: typing there resumes it here. A task's stays past today, until you close it or the task closes. **Ended today**
  has the sessions you closed, those whose task closed (once they stop writing), and the other Claude Code sessions that
  wrote today and are not open anymore.
- **A row:** its title (yours, else the tool's, else what you typed first), where it runs, its state, branch and the
  task it is linked to, and what you typed last. Opened in place, it has what you typed lately, its folder and when it
  started, and the command that continues it in a terminal.
- **Showing it** goes where it runs: `claude --desktop --resume <id>` for the Claude app, claude.ai's Code page, the
  Codex app's link for a Codex app session, or the terminal app it runs in, brought to the front.
- **Its page:** **Open** shows a session's conversation in Pacenote, as it goes: what you typed, its answers in
  Markdown, and its steps by what they did (a command, a file read or changed, a search), a failed one marked; more than
  three in a row fold into a line to open. What Claude Code adds to your turns shows as it is meant: a slash command
  and what it printed, a command run with `!` and its output, a background task's notice, a turn you stopped; its
  reminders to the model and its own lines are left out. A long session compacted shows its summary folded.
- **What it does now:** while a session Pacenote runs is on a turn, the end of the conversation says what it does and
  for how long: thinking, the step it runs, or its answer as it writes it. One open somewhere else says it works there.
- **Typing to it:** a Claude Code session that is not open anywhere else is continued on its page. Pacenote runs the
  installed `claude` with your own sign-in, resuming the session's own conversation (`claude -p --resume`), in the
  folder it ran in. Claude Code keeps the conversation in its own log, as always, so `claude --resume` picks it up
  anywhere after; Pacenote keeps nothing of it. Under the box you pick how it asks before it acts (ask before edits,
  edit without asking, plan first, or auto), and **Stop** stops the turn it is on.
- **Codex in Pacenote:** a Codex session Pacenote started goes on on its page the same way. Pacenote runs one
  `codex app-server` (0.163 or later, signed in) for it with your own ChatGPT sign-in, and Codex keeps the conversation
  in its own log, so `codex resume` picks it up anywhere after. Its modes are Codex's: read only, ask outside the folder
  (the default) or full access, a change applying from its next turn. What it asks (a command, a file change, network or
  write access) comes with Codex's reason. Its steps read as Claude Code's do: a command as Shell, a patch as Edit. A
  session the Codex app or a terminal runs goes on there.
- **What it asks:** when it asks to run a command, edit a file, fetch a page or go ahead with a plan, the page shows
  what it would do, in which folder: **Allow**, **Allow … in this session** (kept for that run alone, not written to
  your settings) or **Deny**. Typing instead says no and tells it what to do. A notification says so when Pacenote is
  out of sight, and the session's row says it waits for you.
- **Open somewhere else:** a session open in a terminal, the Claude app or claude.ai is shown as it goes, and you type
  there: two places typing into one session would tangle it. **Continue in a copy here** starts a copy of it in
  Pacenote (`--fork-session`), linked to the same task. A Codex session is shown, and you type in Codex.
- **A new one:** **New session**, at the top of the screen, starts a Claude Code or Codex session in Pacenote in a
  folder you choose, with a first message of yours. Codex is offered once it is on this Mac, signed in and new enough.
  One for a task starts from the task's **Continue here** (see [Continuing a task](#continuing-a-task)); when the task
  has a session you have not closed, the page says so, with a button that opens that one.
- **Images with a message:** to a session Pacenote runs, Claude Code's or Codex's, paste an image into the message box,
  drop one on it or pick some with its image button (PNG, JPEG, GIF or WebP, up to 10 a message). Each goes at most 1568
  pixels on its longest side and 1 MB, made smaller on the way when it is larger (Claude looks at no more). They go to
  the tool as images pasted into it do and stay in its own log; Pacenote keeps none of them. Your turn shows them, and
  one opens larger. A phone, iPad or other Mac shows how many there were.
- **How long it runs:** a session Pacenote runs keeps running with the window closed, until you close it or it has had
  nothing to do for 30 minutes. Quitting Pacenote while one is on a turn asks first.
- **Close:** beside a session's title, for one Pacenote runs, one resting or a Codex one. Its run here ends and it
  moves to Ended today; it opens again once it writes to its log, as when you type to it again. Its tool keeps the
  conversation. One open in the Claude app or a terminal closes there. Pacenote keeps what you closed in
  `sessions-closed.json` for three days.
- **Wrap up:** beside a session's title, for one that is an open task's work. Your AI reads the session's last turns
  (and its branch's pull request) and writes what was done and what is left, as for a task that looks done; you change
  it, check the things left to keep as tasks after it, and the task closes with it, the session too unless you keep it
  open.
- **What it made:** a page, a design or a doc a Claude Code session put on claude.ai (the Artifact tool's publish, the
  Claude Docs connector's create) is a card in the conversation where it was put up last, with what it is, its version,
  how many times it was updated there and whether only you can open it; a Codex session's card is each file in its
  folder that its answer linked (an HTML page, an image, a PDF or Markdown). **Made here** under the title lists them.
  A link opens in your browser, signed in as you, and a file in its app on this Mac or in Finder. Pacenote reads them
  from the session's log alone: it keeps only the link, never fetches claude.ai, and a phone, iPad or other Mac shows
  a file by its name.
- **Its task:** opened in place, a session not linked to a task can be **linked to one** (your open tasks, its
  repository's first) or **made a task** of its own, in its repository's project; one that looks like an open task's
  work says so, to link or say it is not. **Unlink** takes a linked one off its task: it is not found for that task
  again, on this Mac or your other ones.
- **On Todo:** a task with a session open says how it stands on its row ("Your turn · Claude app"), and its button
  opens that session where it runs instead of continuing in a new one (Continue moves under the row's menu). Today has
  a **Sessions** line: how many wait for your turn or work, how many more are quiet, and in which projects.

- **From your phone or iPad:** the Pacenote app on a phone or iPad paired with this Mac has the same Sessions screen
  and pages, and talks to the sessions this Mac runs: you type, answer what it asks, stop a turn, change how it asks,
  and start a new one, from a task's **Continue here** or **New session**, while Claude Code does the work on the Mac,
  with your own sign-in there. A new one starts only in a folder of your work on this Mac: the task's, or one your
  sessions ran in, as the device cannot browse the Mac's folders. Opening a session in its terminal or app, and its
  resume command, are the Mac's alone. While it writes, the device asks for its page every second rather than being
  told. A Mac before 0.6.33 answers a device's sessions not-allowed, and the device says to update it.

- **On your other Macs:** your other Macs linked to this one ([Your Macs](macs.md)) list its sessions on their Sessions
  screen, under this Mac's name, after their own, and open a session's page to follow it as it goes, read from this Mac
  each time you look. You type to it, answer what it asks and link it to a task on the Mac it is on; the other Mac only
  reads (`sessions.view` and `sessions.talk`). A Mac shows its sessions while Sessions on this Mac is on there; one with
  it off says so, and one before 0.6.38 says to update it.
- **Beside a session's page:** a session's page and New session list your sessions on their left, as Settings lists
  its sections: this Mac's open ones by project, your other Macs' under each one's name, then the ones ended today. The
  open one is marked; a narrow window and a phone leave the list out.

What it reads stays on this Mac but for your own devices and your other Macs: a phone or iPad paired with it, or another
of your Macs linked to it, gets the sessions and their pages over its sealed channel ([Your Macs](macs.md)) when you open
them, and keeps none of it. Pacenote's own sessions and its data folder are left out.

## The MCP tools

| Tool | What it does |
| --- | --- |
| `collect_context` | The rules, what to leave out, since when, and the open tasks |
| `add_tasks` | Adds tasks, each from one Slack message (its permalink), and marks the collection finished |
| `close_task` | Closes an open task: you replied, it got a check mark, or it was settled some other way |
| `add_followup` | Keeps a task of your own from the session: work left after a task, or something to do later |
| `my_tasks` | Your open tasks, with who asked, where, a due hint, why, and a link; Maybes are left out |
| `my_work` | Where you contribute: your areas, how you contribute to each, what is open and what you did lately ([Where you contribute](you.md)) |
| `my_recap` | What you did in a day, a week or a month, by area ([Recap](recap.md)) |
| `recap` (prompt) | Writes your standup, weekly update or monthly recap in the session |
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

## Asking Pace in Slack

In the built-in sandbox, Pace has Pacenote's tools of its own, so a mention can use your Todo: "keep the reviews here as
tasks", "what is on my list?", "the retry review is done", "what did I do this week?".

| Tool | What it does |
| --- | --- |
| `add_tasks` | Keeps what you asked for as tasks, each linking to your request in the thread; the same title still open there is kept once |
| `my_tasks` | Your open tasks from public channels, and your own from this Mac |
| `close_task` | Closes a task you say is done, with what was done in a line |
| `my_work` | Where you contribute ([Where you contribute](you.md)) |
| `my_recap` | What you did in a day, a week or a month ([Recap](recap.md)) |
| `earlier_answers` | Pace's earlier answers in the same channel, when the run history is kept |

- **Only for you.** They act for the person Pace answers, as Pacenote's door into the run says, never as the reasoner
  says; anyone else gets nothing from them.
- **Said in a channel.** Everyone there reads the answer, so the tools speak only of public channels and your own work
  on this Mac: tasks, areas and recaps leave out DMs and private channels (and a channel Slack cannot tell about), a
  task of your own that carries on from one of those, and the recap you wrote. Earlier answers come only from that
  channel, where they were already posted.
- **In your Todo.** Tasks Pace keeps are sure, from **Pace**, in the channel you asked in, and Todo says so as it
  happens. A request to keep tasks goes to your Todo unless you name Jira or another tracker.
- They answer only while "Gather my tasks from Slack" is on, as the tools for AI tools do. The VM never sees Pacenote's
  files: the tools run in Pace on this Mac, reached at `127.0.0.1:8080/pace/mcp` in the VM
  ([Built-in sandbox](sandbox.md#built-in-sandbox)). When answers run on this Mac, Pace has none of them yet.

## Not yet

Collecting on a schedule (from Pacenote, running the tool with Slack read tools only) and a daily summary in your DM
with Pace are the next phases of [the proposal](proposals/personal-tasks.md).
