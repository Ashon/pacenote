---
title: Your sessions, in Pacenote
summary: Pacenote 0.7 gathers the Claude Code and Codex sessions on your Mac in one place, each a page where you go on with it, linked to the task it is for.
version: 0.7.0
shot: session
---

Pacenote keeps what is asked of you and hands each task to Claude Code or Codex. Until 0.6.28, the work itself happened
somewhere else, in a terminal or an app, and Pacenote heard back how it ended. Over the releases since, the sessions
came into Pacenote. 0.7.0 marks that: your sessions are a screen of their own, and you can go on with each one there.

## Every session in one place

**Sessions**, below Todo, lists the Claude Code and Codex sessions on this Mac by project: where each runs, whether it
works or waits for your turn, its branch and the task it is for. The sidebar counts the ones waiting for you. It stays
off until you turn it on, and says first what it reads.

## Go on with it here

Open a session and its conversation is a page in Pacenote, as it goes: what you typed, its answers in Markdown, its
steps, and what it does this moment.

- **Type and it goes on.** Pacenote runs the `claude` on your Mac with your own sign-in, in the session's own
  conversation, so `claude --resume` picks it up anywhere after. Pacenote keeps nothing of it.
- **What it asks** to do shows on the page, to allow or deny, and you choose how it asks: before edits, without asking,
  plan first, or auto.
- **Images** go with a message, and **what it made** on claude.ai, a page, a design or a doc, is a card to open.
- **A session open in a terminal** or the Claude app shows as it goes; continue there, or in a copy here.

## From the task, and back to it

- **Continue here** on a task starts a session in Pacenote with the task, its thread and how related work ended last
  time.
- **A session you start yourself** is linked to the task it worked on. Link one yourself, or make a task of it.
- **A session you leave rests.** It stays open, and its task opens it again the next day, until you close it.
- **Wrap up** closes the task with what was done, as your AI reads it, and keeps what is left as tasks.

## Codex too

A Codex session Pacenote starts goes on on its page the same way, with your own ChatGPT sign-in and Codex's own modes.

## On your other Mac

Your other Macs list this Mac's sessions under its name and follow a session's page as it goes. You type to it on the
Mac it runs on.

## Also since 0.6.13

- Your AI fills in a task you add, and tasks that are one piece of work become one group.
- **Areas** shows where you contribute, and Recap is written up area by area.
- Pick Pacenote's color; it marks what you choose, on gray surfaces.
- Hold ⌘ to see the key for each control.
- For Pace: your own MCP servers, and Kubernetes in three steps.

The steps are in the guide, [Sessions](guide:sessions), and what each release brought is in
[the 0.7.0 notes](news:v0.7.0).

```sh
brew update && brew upgrade --cask pacenote
```
