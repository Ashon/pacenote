---
title: Install and first run
summary: Install Pacenote with Homebrew, write your tasks on Todo, let your AI help when you want it, and set up Pace if you like.
kind: start
order: 1
shot: first-run
---

## What you need

- An Apple silicon Mac on macOS 12 or later. The built-in sandbox needs macOS 15.
- Claude Code on a Claude Pro, Max, Team or Enterprise plan, or Codex 0.138 or later on ChatGPT Plus, Pro or Business,
  signed in on that Mac.
- A Slack workspace where you can create an app, or your team's Pacenote hub.

## Install

Homebrew loads casks only from taps you trust, so the tap comes first, then the trust, then the install.

```sh
brew tap ashon/tap
brew trust ashon/tap
brew install --cask pacenote
```

## First run

Open Pacenote. A new install opens on Todo, with no account and no AI needed to start, and no Slack app to make. A card
on top shows the ways in:

![A new install: Todo, with the start card on top](shot:first-run)

- **New task** writes one of your own, with when it is due if you like. Your tasks stay on this Mac, and Cmd-N adds one
  whenever Todo is open.
- **Set up AI** lets your AI find what is asked of you and write your recaps (below).
- **Connect**, under From your other Mac, brings your Todo from Pacenote on another of your Macs (below).
- **Add a device** opens Settings > Devices, to pair your iPhone or iPad.

Once a task is in, the card folds to one line that offers Set up AI. **Close** puts it away.

### Let your AI help

**Set up AI** opens three steps in a sheet over Todo:

![Setting up your AI, its second step: this Mac, then Slack through your AI tool's connector](shot:ai-sheet)

1. **Your AI.** Choose Claude Code or Codex. Pacenote checks that it is on this Mac and signed in.
2. **Where your work is.** The sessions and commits on this Mac, and Slack, read only through your AI tool's own Slack
   connector. Connect Slack in claude.ai's Settings > Connectors (or ChatGPT's Settings > Apps) if it is not yet.
3. **A first look.** **Collect now** reads your last 7 days in Slack and finds your projects. Then Todo says what it
   added. With no Slack connector yet, it looks at this Mac alone, and Collect now on Todo reads Slack once you connect
   it.

Without an AI, Todo still keeps the tasks you write, and Recap counts them. Find tasks with AI on Todo and Set up AI on
Recap open the same sheet.

### From your other Mac

Pacenote on another of your Macs already? Click **Connect** on the card, click **Add a device** in Settings > Devices on
that Mac, and Allow there once both show the same 6 digits. This Mac takes how Todo collects from it, and Todo stays the
same on both. A Mac set up already pairs from its own Settings > Devices, with **Pair**.

Pace, which answers when you mention it in Slack, is optional and stays off until you set it up: **Set up Pace** on the
card, or in Settings > General.

## Pace's setup, step by step

Pace's setup has its steps on the left. Each step checks what it needs where it is.

![Setup's first step: which AI service you already use](shot:setup-start)

1. **AI service.** Choose Claude Code or Codex. Setup checks that it is on this Mac and signed in.
2. **Where it runs.** The built-in sandbox, a small Linux VM per request that cannot see your files, or directly on
   this Mac with your own login. Where this Mac runs the sandbox, setup starts preparing it at once; it takes a few
   minutes.
3. **Slack.** Join your team's hub, or use your own Slack app made from Pacenote's manifest. With Pacenote set up on
   another of your Macs, you can connect to that one instead. Joining a hub is in
   [Join your team's hub](guide:join-hub).
4. **Review.** Check what you chose, then start Pace.
5. **First answer.** Mention `@Pace` in a public channel it is in. Setup is done when Pace answers you there.

**Finish later** leaves setup at any step; a card on Overview picks it up again.

## Next

- Gather what people ask of you on [Todo](guide:todo).
- Change how Pace reaches Slack in [Settings > Messengers](guide:messengers).
