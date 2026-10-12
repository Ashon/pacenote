# Pacenote desktop app cask: the signed and notarized .app zips from GitHub Releases, one per arch
# (no DMG). The tap's Casks/pacenote.rb is rendered from this template by update-tap.sh on every
# release (version and sha256 filled in), so edit it here, never in the tap.
# The app bundles the bot, the sandbox jobs and Electron's Node, so it needs no formula.
cask "pacenote" do
  arch arm: "arm64", intel: "x64"

  version "0.0.0"
  sha256 arm:   "REPLACE_SHA256_ARM64",
         intel: "REPLACE_SHA256_X64"

  url "https://github.com/Ashon/pacenote/releases/download/v#{version}/Pacenote-v#{version}-macos-#{arch}.app.zip"
  name "Pacenote"
  desc "Slack bot that answers mentions with local claude or codex CLIs"
  homepage "https://github.com/Ashon/pacenote"

  # Electron 38 and later need macOS 12.
  depends_on macos: :monterey

  app "Pacenote.app"

  # Tray-resident app: brew never quits a running instance on uninstall or upgrade, which would
  # leave the old process (and the bot it supervises) running from a deleted bundle. quit is
  # upgrade-aware: brew reopens the app after the swap. Quitting lets the bot finish its requests.
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
      - open Pacenote and connect Slack in Settings > Messengers > Slack: pair with your team's hub,
        or create your own Slack app from there and save its tokens
      - with your own app, add your Slack member ID under Who can ask
    Answers run on this Mac by default, reading only the reference directory you set. For a Docker
    sandbox, run Docker, choose it in Settings > Sandbox and build its images there.
    Config and run history are in ~/.pacenote and are kept when the app is removed.
  EOS
end
