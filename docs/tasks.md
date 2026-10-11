# Your tasks from Slack

Pacenote can gather what people ask of you in Slack, and what you said you would do, into a short list on the Tasks
screen, so you do not keep it in your head or scroll back for it. It is off by default. The plan and the reasons behind it
are in [the proposal](proposals/personal-tasks.md).

## Turning it on

1. On [api.slack.com/apps](https://api.slack.com/apps), open your Pacenote app > OAuth & Permissions > User Token Scopes, and
   add `channels:history`, `groups:history`, `channels:read`, `groups:read` and `users:read`. To include DMs, also add
   `im:history`, `im:read`, `mpim:history` and `mpim:read`.
2. Reinstall the app to your workspace, and copy the **User OAuth Token** (`xoxp-...`).
3. In Pacenote, Settings > Tasks: turn on "Gather my tasks from Slack" and save the token. DMs stay out unless you turn on
   "Also read DMs and group DMs".
4. On the Tasks screen, choose **Collect now**.

The main manifest has no user scopes, so a setup that does not use tasks never asks for them. Tasks work with your own Slack
app; through a [team hub](team-hub.md) they are not available yet. The settings apply at the next collection, without
restarting Pace.

## What Pace reads, and where it goes

- The conversations you are in: public and private channels, and DMs and group DMs when that is on. Channels in "Leave out
  channels" are skipped.
- The first collection reads the last 7 days; later ones read what is new since. Pace keeps on this Mac only the messages
  that mention you, threads you took part in whose last word is not yours, what someone said in a DM after your last
  message, and your own messages that say you will do something.
- Those messages go to your reasoner (claude or codex), with no tools, in one request, to pick out the tasks. The user
  token stays in the bot process on this Mac; it never reaches the reasoner or the sandbox.
- Tasks are kept in `PACENOTE_DATA_DIR/tasks.json`, and your decisions in `tasks-decisions.json`.

## The list

- **Precision first.** A task is something someone asked you by name (or in a DM), or something you said you would do. An
  `@here`, "someone should look at this", or anything Pace is not sure about is a **Maybe**: it stays under its own tab, out
  of the list and `my_tasks`, until you keep it.
- **Done** and **Dismiss** are one click. Dismiss can say why: not for me, already done, not worth it. After three "not for
  me" from the same channel, the screen offers to leave that channel out.
- A task **closes by itself** at the next collection when you replied in its thread after it (or answered in the DM), or
  when its message got a check mark. Done shows them, and Reopen brings one back.
- Open tasks fade after 7 days and drop after 14; done, dismissed and closed ones are kept 14 days.
- Under Done, the screen shows how many of the tasks you settled you dismissed. Above about 30%, Pace is picking too
  loosely.

## In Claude Code and Codex

With Settings > History & logs > Share with AI tools on, the `my_tasks` tool of [Pacenote's MCP server](history-mcp.md)
lists your open tasks with who asked, where, a due hint, why it is a task, and a Slack link. Maybes are left out.

## Not yet

Collecting on a schedule, a daily summary in your DM with Pace, the team hub, and adding a task by mentioning Pace are the
next phases of [the proposal](proposals/personal-tasks.md).
