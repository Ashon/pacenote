# Your Macs

With Pacenote on more than one Mac, Pace answers on the Mac you're using, and Todo is the same on each. Settings >
Macs shows them.

Turn on **Follow the Mac you're using** in Settings > Macs on each Mac. There is nothing to pair: Pacenote on your
other Mac, set up with the same Slack app, finds this one on your network by itself. macOS asks once, when you turn it
on, whether Pacenote may look on your local network. It needs your own Slack app. With the [team hub](team-hub.md), Pace
answers on the one Mac you connected, as before.

## Which Mac answers

One Mac at a time holds Pace's Slack connection: the one you used last.

- **You leave a Mac for the other.** You lock it, put it to sleep, close its lid, or leave it for 5 minutes, and use the
  other one: Pace moves there. The status bar says "Pace moved here from MacBook Pro".
- **You use both.** Pace stays where it is, and doesn't flip back and forth. **Answer here** in Settings > Macs moves it
  at once.
- **One can't reach the other.** It is asleep, off the network or quit: the Mac that is awake answers, used or not. A
  Mac that wakes asks the others before it connects again.
- **Both are asleep.** Pace rests, as it does on a Mac of its own.

A handover opens the new Mac's connection before the old one closes, and Slack sends each mention to one connection
only, so no mention is missed and none is answered twice. An answer already under way finishes on the Mac that started
it: it posts through Slack's Web API, not the connection. Closing that Mac's lid still cuts it off, as it would on a Mac
of its own.

A Mac that went to sleep without a word may have held its connection for a moment. Slack sends a mention it got no
receipt for again, so in the worst case that one comes to the other Mac a few minutes late.

The Mac that doesn't answer keeps Pace running with its connection closed: its status bar says "Pace: Standing by" and
which Mac answers.

## Todo on both

These are the same on each Mac, whichever Mac changed them:

| What | How two changes meet |
| --- | --- |
| Your tasks | One per Slack message; the version changed last, with all its updates |
| Done, Dismiss and Keep | The latest decision stands, one taken back included |
| Your work log | Each session and draft; a session is marked with the Mac it runs on |
| What Write it up wrote | Each period's latest |
| Your areas | The parts either Mac found, what you took out, the names you gave |
| Collections | Each Mac's own: Todo says "collected 10:20 on MacBook Pro" |

Changes go across when they happen, whenever both Macs are awake and can reach each other. Made while apart, they meet
the next time, with nothing to ask you.

These stay with their Mac:

- **Sessions.** A Claude Code or Codex session runs in its own Mac's folders. On the other Mac, its line says "On MacBook
  Pro" and offers **Start here**: a new session for the task on this Mac, with what came before. Repository folders are
  remembered per Mac.
- **Looks done** reads a quiet session's last turns, so the Mac with the session judges it.
- **Pace's run history**, your logs and settings.

While one Mac collects, the other's Collect now waits and says "Collecting on MacBook Pro".

## Set up a new Mac from this one

A new Mac can take what it needs from the one already set up, instead of a Slack app of its own and "@Pace it's me":

1. On the Mac already set up, click **Add a Mac** in Settings > Macs. It turns following on and shows the Mac on your
   network for 10 minutes, only while it waits.
2. In the new Mac's setup, choose your AI and where Pace runs as usual. At the Slack step, choose **Connect to your
   other Mac**: it finds the waiting Mac on your network, or takes its address (Tailscale).
3. Both Macs show the same 6-digit number. If they match, click **Allow** on the Mac already set up.

What comes over, once:

- **From the Mac already set up:** your Slack app's tokens, who Pace answers, how Todo collects (names, groups, channels
  left out, DMs), and following turned on.
- **Kept as this Mac chose it:** the AI that answers and the one for Todo's work, where Pace runs, CLI paths, folders
  and tools (Settings > Tools).

An AI sign-in never comes over: each Mac signs in to Claude Code or Codex itself. Starting Pace on the new Mac moves it
there, the Mac in use, and Todo arrives through the usual sync. Not this one, or 10 minutes without a new Mac, sends
nothing. With the team hub, pair the new Mac with the hub instead.

The new Mac has no token yet, so this once the Macs agree on a key with X25519. The 6 digits come from that key:
someone in between on the network would agree on a different key with each Mac, and the numbers would differ.
Everything after is encrypted, and from then on the Macs know each other by the shared token as below.

## How the Macs find and trust each other

- **Finding.** Each Mac advertises Pacenote on your local network with Bonjour (`_pacenote._tcp`, through macOS's own
  `dns-sd`). macOS asks once whether Pacenote may look on the local network. For a Mac on another network, such as over
  Tailscale, **Add by address** takes its name or address.
- **Knowing.** Both Macs hold the same Slack app-level token. A key derived from it (HKDF) is what they know each other
  by: each proves it holds the key, over fresh nonces, before anything else is said, and every message after that is
  sealed with AES-256-GCM under keys of that connection and numbered, so none can be read, altered or played again. The
  token itself never crosses the network. A Mac with another Slack app, such as your company's Pace, has another key,
  and the two never see each other.
- **Listening.** Pacenote takes connections on port 49213 only from your own networks: this Mac, home and office
  ranges, and private networks such as Tailscale's. Nothing listens for the internet, and there is no Pacenote server:
  your data goes from one of your Macs to the other.

Regenerate the app-level token and both Macs need the new one before they know each other again.

## Settings > Macs

- **Follow the Mac you're using**: off until you turn it on, so a Mac of its own never looks on the network. Off, this
  Mac leaves the others and Pace answers here.
- **Your Macs**: this one and the others, with what each is doing: answering, standing by, moving, or out of reach since
  when.
- **Stop following to this Mac** (⋯): leaves one Mac out.
- **Add a Mac**: sets up a new Mac from this one.
- **Add by address**: a Mac on another network.

What a Mac knows of the others is kept in `PACENOTE_DATA_DIR/macs.json`.
