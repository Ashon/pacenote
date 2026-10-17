# Pacenote desktop app cask: the signed and notarized .app zip from GitHub Releases, for Apple
# silicon only since 0.5.7 (no DMG). The tap's Casks/pacenote.rb is rendered from this template by update-tap.sh on every
# release (version and sha256 filled in), so edit it here, never in the tap.
# The app bundles the bot, the sandbox jobs and Electron's Node, so it needs no formula.
cask "pacenote" do
  version "0.0.0"
  sha256 "REPLACE_SHA256_ARM64"

  url "https://github.com/Ashon/pacenote/releases/download/v#{version}/Pacenote-v#{version}-macos-arm64.app.zip"
  name "Pacenote"
  desc "Slack bot that answers mentions with local claude or codex CLIs"
  homepage "https://github.com/Ashon/pacenote"

  # Apple silicon only; Electron 38 and later need macOS 12.
  depends_on arch: :arm64
  depends_on macos: :monterey

  app "Pacenote.app"

  # Tray-resident app: brew never quits a running instance on uninstall or upgrade, which would
  # leave the old process (and the bot it supervises) running from a deleted bundle. quit is
  # upgrade-aware: brew reopens the app after the swap if it quit within 10 seconds; an app that
  # took longer (the bot finishing its requests) opens the new version itself once the bot stops.
  uninstall quit: "io.github.ashon.pacenote"

  # Config, run history and the sandbox allowlist live in ~/.pacenote (PACENOTE_HOME) and are kept.
  zap trash: [
    "~/Library/Application Support/Pacenote",
    "~/Library/Caches/io.github.ashon.pacenote",
    "~/Library/HTTPStorages/io.github.ashon.pacenote",
    "~/Library/Preferences/io.github.ashon.pacenote.plist",
    "~/Library/Saved Application State/io.github.ashon.pacenote.savedState",
  ]

  caveats <<~EOS
    Pacenote answers your Slack mentions with your local claude or codex CLI login.
    Before the first mention:
      - log in to claude or codex (codex 0.138 or later)
      - open Pacenote: a first run opens on setup, from the AI service on this Mac to Pace's
        first answer, with the built-in sandbox prepared in the background (macOS 15 or later),
        your team's hub or your own Slack app, and "@Pace it's me" to say which account is yours
    Pace answers only you; teammates each run their own Pace through your team's hub.
    Setup can be left and picked up from Overview, or done in Settings instead.
    Config and run history are in ~/.pacenote and are kept when the app is removed.
  EOS
end
