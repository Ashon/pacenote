---
title: Settings > Messengers
summary: How Pace reaches Slack, through your team's hub or your own Slack app, and who can ask it.
kind: screen
order: 2
shot: messengers-hub
---

Messengers holds the chat apps Pace answers in, and who can ask there. Changes apply when Pace restarts.

![Settings > Messengers, paired with a team hub](shot:messengers-hub)

## Choose the connection

- **Team hub**: your team's hub server holds the Slack app. This desktop answers your own mentions through it, and keeps
  no Slack token.
- **Your own Slack app**: Socket Mode with the app token and bot token of a Slack app you created, for using Pacenote on
  your own. **Create the Slack app** makes it from Pacenote's manifest.

## Pair with the hub

1. Enter the hub's address under Hub URL. A teammate's share link fills it in.
2. Choose **Connect**, then mention `@Pace connect <code>` with the code Pacenote shows, in a channel Pace is in.
3. Confirm that the Slack account shown is yours.

**Check connection** shows whether Pace reaches Slack, and as whom. **Disconnect** unpairs this desktop.

## Share with teammates

Once paired, **Copy share link** copies a link to pacenote.dev that opens Pacenote on this hub, or shows how to install
it first. The link holds no secret: each teammate pairs their own Mac with their own Slack account, and nothing changes
on their Mac until they connect. The steps for them are in [Join your team's hub](guide:join-hub).

## Manage the hub

The hub's admins see **Manage the hub** under the pairing; other members see nothing more. The member who installed the
hub is its first admin, or on a hub from before 0.6.18, the member who paired first.

![Manage the hub: who can use it, someone asking to join, and each member's Mac](shot:hub-admin)

- **Who can use it**: **Everyone** in the workspace, or **Members you add**. Switching to members you add keeps everyone
  paired at the time on the list, so nobody using the hub is cut off.
- **Asking to join**: on a hub for members you add, anyone else who mentions Pace is told that the admins were asked,
  and waits here. **Add** lets them in and tells them so in Slack; if they sent a pairing code that is still good, their
  Mac goes on to confirm it. **Decline** tells them nothing.
- **Add a member** finds someone in the workspace by name.
- Each member's Mac shows whether it is connected now, or when it was last seen. A member's menu has **Make admin**,
  **Disconnect their Mac** and, on a hub for members you add, **Remove from the hub**.

No message or answer shows here: the hub tells Pacenote only who is on it and their Macs. A hub from before 0.6.18 shows
this once it runs 0.6.18 or later; [Team hub](../../team-hub.md) says how to update it.

## No hub yet?

Open **No hub yet? Install one on a Linux server**, give the address members will use and who can use it, and copy the
command. It runs on a Linux server with Docker and asks for the Slack app's tokens there, so they never leave the
server. Once the hub answers, your Pace switches to it. More in [Team hub](../../team-hub.md).

## Who can ask

Only you, by your Slack member ID. Pace runs with your login on this Mac, so anyone else who mentions it gets a note only
they can see.
