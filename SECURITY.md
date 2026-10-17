# Security

## Reporting a vulnerability

Report it privately through
[GitHub's vulnerability reporting](https://github.com/Ashon/pacenote/security/advisories/new) for this repository. The
report stays between you and the maintainer until an advisory is published, so please keep the details out of public
issues, pull requests and discussions.

A useful report says what is affected (the app, Pace, the built-in sandbox, ops-broker, the team hub or pacenote.dev),
the version (`brew info --cask pacenote`, or the version in the app's status bar), how to reproduce it, and what an
attacker gains: for example a way past "What Pace never does", a secret reaching the model or Slack, or the sandbox
reaching a domain you did not allow.

## What to expect

Pacenote is maintained by one person and offered as is, so reports are read and answered as time allows. Fixes ship as
patch releases, with notes in [docs/releases](docs/releases), and the advisory is published once a fix is out.

## Supported versions

Only the latest release. `brew upgrade --cask pacenote` updates the app, and the app tells you when a new version is out.

## Scope

In scope: the code in this repository and what is built from it, which is the desktop app, Pace, the built-in sandbox
and its images, ops-broker, the team hub and its image on ghcr.io, and pacenote.dev.

Out of scope: vulnerabilities in the software Pacenote runs or talks to, such as Claude Code, Codex, Slack or Apple's
Containerization framework. Report those to their makers. If Pacenote uses one of them in a way that makes a flaw worse,
that part is in scope.

## How Pacenote is meant to be safe

[What Pace never does](https://pacenote.dev/privacy/) lists the limits and where each is enforced.
[Reasoner sandbox](docs/sandbox.md), [Ops tools](docs/ops-tools.md) and [How it works](docs/how-it-works.md) describe
the design behind them.
