---
title: Sessions
summary: Your Claude Code and Codex sessions on this Mac in one place, each a page where you go on with it.
kind: screen
order: 2
shot: session
---

Sessions lists the Claude Code and Codex sessions on this Mac in one place: where each runs, whether it works or waits
for you, and the task it is for. Open one and its conversation is a page in Pacenote, where you go on with it.

![A Claude Code session's page, with the sessions on this Mac beside it](shot:session)

## Turn it on

Sessions is below Todo in the sidebar. It is off until you choose **Show my sessions** on its card, or turn on
**Sessions on this Mac** in Settings > Todo. The card says first what it reads: which sessions are open and what you
typed in them, and a session's whole log only when you open it.

Nothing leaves this Mac but for your own phone or iPad paired with it and your other Macs linked to it.

## The list

- **Open**: the sessions open now, by project. A session that is a task's, or that Pacenote ran, stays here once it
  rests, until you close it or its task closes, the next day too. The sidebar counts the ones waiting for you.
- **Ended today**: the ones you closed, those whose task closed, and the other sessions that wrote today and are not
  open anymore.
- **A row** says where it runs (Pacenote, a terminal, the Claude app, claude.ai or the Codex app), whether it is
  **Working**, **Your turn** or quiet, its branch, its task and what you typed last. **Open** shows its page; a session
  running somewhere else also has a button that brings it forward there.

## A session's page

- **The conversation, as it goes**: what you typed, its answers in Markdown, and its steps by what they did, more than
  three in a row folded into a line. While it works, the end of the page says what it does now: thinking, a step, or
  its answer as it writes it.
- **Type to go on.** Pacenote runs the `claude` installed on this Mac with your own sign-in, in the session's own
  conversation, so `claude --resume` picks it up anywhere after. Under the box you pick how it asks before it acts:
  **Ask before edits**, **Edit without asking**, **Plan first** or **Auto**. **Stop** stops the turn it is on.
- **What it asks** shows on the page, with the folder: **Allow**, **Allow in this session** or **Deny**. Typing
  instead says no and tells it what to do.
- **Images**: paste, drop or pick up to 10 with a message. Pacenote keeps none of them.
- **What it made**: a page, design or doc it put on claude.ai, or a file a Codex answer linked, is a card where it was
  made, with **Open**. **Made here** under the title lists them.
- **Open somewhere else**: a session open in a terminal or the Claude app is shown as it goes, and you type there.
  **Continue in a copy here** starts a copy of it in Pacenote, linked to the same task.

## Start one

- **New session**, at the top of Sessions, starts a Claude Code or Codex session in a folder you choose, with a first
  message of yours.
- **Continue here** on a task in Todo starts one with the task and what came before it written in. When the task has a
  session you have not closed, the page says so, with **Open that session**.

## Close it, or wrap up its task

- **Close** ends its run here and moves it to Ended today. Write to it again and it goes on.
- **Wrap up**, for a session that is an open task's work, has your AI read how it ended and write what was done and
  what is left. You change it, keep what is left as tasks, and the task closes with it.

A session left alone rests: Pacenote lets its run go after 30 minutes with nothing to do, and the session stays open.
Typing to it goes on from where it stopped.

## Its task

Opened in place, a row that is not a task's work has **Link to a task** and **Make it a task**. One that looks like an open
task's work says so, for you to link it or say it is not. **Unlink** takes a linked one off its task.

## Codex

A Codex session Pacenote started goes on on its page the same way, with your own ChatGPT sign-in and Codex's own modes:
**Read only**, **Ask outside the folder** or **Full access**. It needs Codex 0.163 or later, signed in. A session the
Codex app or a terminal runs goes on there.

## On your phone, iPad and other Macs

- **A phone or iPad** paired with this Mac has the same Sessions screen and pages, and talks to the sessions this Mac
  runs: you type, answer what it asks and start a new one, while the work happens on the Mac.
- **Your other Macs** list this Mac's sessions under its name and follow a session's page as it goes. You type to it
  on the Mac it is on.

## More

How each part works, what it reads and what it keeps are in
[Sessions on this Mac](../../tasks.md#sessions-on-this-mac).
