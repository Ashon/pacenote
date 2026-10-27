---
title: From install to Pace's first answer
summary: Install Pacenote with Homebrew, go through setup's five steps, and get Pace's first answer in Slack.
kind: start
order: 1
shot: setup-start
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

## Setup, step by step

Open Pacenote. On a first run it opens on setup, with its steps on the left. Each step checks what it needs where it is.

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
