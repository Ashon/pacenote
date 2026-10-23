#!/bin/sh
# Pacenote team hub installer (docs/team-hub.md). Pacenote writes the command
# that runs it, in Settings > Messengers > Slack > Team hub:
#
#   curl -fsSL https://raw.githubusercontent.com/Ashon/pacenote/v<version>/deploy/hub/install.sh \
#     | sh -s -- --url http://10.0.0.5:8790 --version <version> [--allow U1,U2] [--lang ko] [--pair U1:<sha256>]
#
# It writes compose.yaml and hub.env in a folder of its own (~/pacenote-hub, or
# --dir), asks for the Slack app's two tokens here so they never leave this
# server, checks them with Slack, starts the hub with Docker and waits until it
# answers. It ends with a pacenote:// link that opens Pacenote on this hub.
# Run it again to update: the tokens stay, the image follows --version.
#
# --pair is the Pacenote that wrote the command: its Slack member ID and the
# SHA-256 of the token it made for this hub. The hub pairs it once, so that
# Pacenote switches to the hub as soon as it answers, with no code to send.
set -eu

url=''
allow=''
lang='en'
version='latest'
pair=''
dir="${HOME:-.}/pacenote-hub"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

# English, or Korean with --lang ko
t() {
  if [ "$lang" = ko ]; then printf '%s' "$2"; else printf '%s' "$1"; fi
}

while [ $# -gt 0 ]; do
  [ $# -ge 2 ] || fail "Missing a value after $1"
  case "$1" in
    --url) url=$2 ;;
    --allow) allow=$2 ;;
    --lang) lang=$2 ;;
    --version) version=$2 ;;
    --pair) pair=$2 ;;
    --dir) dir=$2 ;;
    *) fail "Unknown option: $1" ;;
  esac
  shift 2
done

matches() {
  printf '%s' "$1" | grep -Eq "$2"
}

case "$lang" in en | ko) ;; *) lang=en ;; esac
url=$(printf '%s' "$url" | sed 's:/*$::')
matches "$url" '^https?://[^/?#]+$' ||
  fail "$(t 'Give the address members will use with --url, such as http://10.0.0.5:8790 or https://hub.example.com.' \
    '멤버가 접속할 주소를 --url로 주세요. 예: http://10.0.0.5:8790, https://hub.example.com')"
allow=$(printf '%s' "$allow" | tr -d ' ')
[ -z "$allow" ] || matches "$allow" '^[UW][A-Z0-9]+(,[UW][A-Z0-9]+)*$' ||
  fail "$(t '--allow takes Slack member IDs, such as U012AB3CD,U045EF6GH.' \
    '--allow에는 U012AB3CD,U045EF6GH처럼 Slack 멤버 ID를 주세요.')"
[ "$version" = latest ] || matches "$version" '^[0-9]+\.[0-9]+\.[0-9]+$' ||
  fail "--version takes a release, such as 0.6.6"
[ -z "$pair" ] || matches "$pair" '^[UW][A-Z0-9]+:[0-9a-f]{64}$' ||
  fail "--pair takes U...:<64 hex>, as Pacenote writes it"

say() {
  printf '%s\n' "$1"
}

# Docker, and compose with it
command -v docker >/dev/null 2>&1 ||
  fail "$(t 'Docker is not installed here. Install Docker Engine (https://docs.docker.com/engine/install/), then run this again.' \
    '이 서버에 Docker가 없어요. Docker Engine을 설치한 뒤(https://docs.docker.com/engine/install/) 다시 실행하세요.')"
if docker compose version >/dev/null 2>&1; then
  compose='docker compose'
elif command -v docker-compose >/dev/null 2>&1; then
  compose='docker-compose'
else
  fail "$(t 'Docker Compose is missing. Install the docker compose plugin, then run this again.' \
    'Docker Compose가 없어요. docker compose 플러그인을 설치한 뒤 다시 실행하세요.')"
fi
docker info >/dev/null 2>&1 ||
  fail "$(t "Docker is not running, or this user can't use it. Start Docker, or run this again with sudo (curl ... | sudo sh -s -- ...)." \
    'Docker가 실행 중이 아니거나 이 사용자가 쓸 수 없어요. Docker를 시작하거나 sudo로 다시 실행하세요(curl ... | sudo sh -s -- ...).')"

# Where members reach it. http is published on this server's network at the
# address's port; https stays on 127.0.0.1 for what serves https in front.
scheme=${url%%://*}
hostport=${url#*://}
case "$hostport" in
  *\]:*) port=${hostport##*:} ;;
  \[*) port='' ;;
  *:*) port=${hostport##*:} ;;
  *) port='' ;;
esac
if [ "$scheme" = http ]; then
  port=${port:-80}
  publish="$port:8790"
  local_port=$port
else
  publish='127.0.0.1:8790:8790'
  local_port=8790
fi

mkdir -p "$dir"
cd "$dir"

# What an earlier run kept
kept() {
  [ -f hub.env ] && sed -n "s/^$1=//p" hub.env | tail -n 1 || true
}

# A token, read from this terminal without showing it
ask() {
  ( : </dev/tty ) 2>/dev/null ||
    fail "$(t "No terminal to ask for $1 on: set it in the environment ($2=...) and run this again." \
      "${1}를 물어볼 터미널이 없어요. 환경 변수($2=...)로 주고 다시 실행하세요.")"
  printf '%s: ' "$1" >/dev/tty
  # Typing shows again however this ends
  trap '{ stty echo </dev/tty; } 2>/dev/null || true' EXIT INT TERM
  stty -echo </dev/tty
  IFS= read -r answer </dev/tty || answer=''
  stty echo </dev/tty
  printf '\n' >/dev/tty
  printf '%s' "$answer"
}

app_token=${SLACK_APP_TOKEN:-$(kept SLACK_APP_TOKEN)}
bot_token=${SLACK_BOT_TOKEN:-$(kept SLACK_BOT_TOKEN)}
if [ -z "$app_token" ] || [ -z "$bot_token" ]; then
  say "$(t "The Slack app's tokens stay on this server, in $dir/hub.env." \
    "Slack 앱 토큰은 이 서버의 $dir/hub.env에만 남아요.")"
fi
[ -n "$app_token" ] ||
  app_token=$(ask "$(t 'App token (xapp-..., Basic Information > App-Level Tokens)' '앱 토큰 (xapp-..., Basic Information > App-Level Tokens)')" SLACK_APP_TOKEN)
[ -n "$bot_token" ] ||
  bot_token=$(ask "$(t 'Bot token (xoxb-..., OAuth & Permissions)' '봇 토큰 (xoxb-..., OAuth & Permissions)')" SLACK_BOT_TOKEN)
case "$app_token" in xapp-*) ;; *) fail "$(t 'The app token starts with xapp-.' '앱 토큰은 xapp-로 시작해요.')" ;; esac
case "$bot_token" in xoxb-*) ;; *) fail "$(t 'The bot token starts with xoxb-.' '봇 토큰은 xoxb-로 시작해요.')" ;; esac

# Slack's say on the tokens, before anything starts
api=${SLACK_API_URL:-$(kept SLACK_API_URL)}
base=$(printf '%s' "${api:-https://slack.com/api/}" | sed 's:/*$::')
field() {
  printf '%s' "$1" | sed -n "s/.*\"$2\":\"\\([^\"]*\\)\".*/\\1/p"
}
# Why Slack said no: its error, or what curl said when there was no answer
refused() {
  reason=$(field "$1" error)
  printf '%s' "${reason:-$1}"
}
bot_check=$(curl -sS -X POST -H "Authorization: Bearer $bot_token" "$base/auth.test" 2>&1 || true)
case "$bot_check" in
  *'"ok":true'*) ;;
  *) fail "$(t 'Slack turned the bot token down' 'Slack이 봇 토큰을 받지 않았어요'): $(refused "$bot_check")" ;;
esac
app_check=$(curl -sS -X POST -H "Authorization: Bearer $app_token" "$base/apps.connections.open" 2>&1 || true)
case "$app_check" in
  *'"ok":true'*) ;;
  *) fail "$(t 'Slack turned the app token down' 'Slack이 앱 토큰을 받지 않았어요'): $(refused "$app_check")" ;;
esac
say "Slack: $(field "$bot_check" team), @$(field "$bot_check" user)"

pair=${pair:-$(kept HUB_PAIR)}
umask 077
cat >hub.env.tmp <<EOF
# Written by the Pacenote hub installer; run it again to change these.
# What each one means: docs/team-hub.md
SLACK_APP_TOKEN=$app_token
SLACK_BOT_TOKEN=$bot_token
HUB_PUBLIC_URL=$url
HUB_ALLOWED_USERS=$allow
HUB_NOTES_LANGUAGE=$lang
HUB_PAIR=$pair
SLACK_API_URL=$api
LOG_LEVEL=info
EOF
mv hub.env.tmp hub.env
umask 022
cat >compose.yaml <<EOF
# Written by the Pacenote hub installer; run it again to update.
name: pacenote-hub
services:
  hub:
    image: ghcr.io/ashon/pacenote-hub:$version
    restart: unless-stopped
    env_file: hub.env
    ports:
      - "$publish"
    volumes:
      - hub-data:/data
volumes:
  hub-data:
EOF

say "$(t "Starting the hub ($version) in $dir" "${dir}에서 허브($version)를 시작하는 중")"
$compose pull --quiet hub
$compose up -d

tries=0
until curl -fsS "http://127.0.0.1:$local_port/health" >/dev/null 2>&1; do
  tries=$((tries + 1))
  [ "$tries" -lt 60 ] ||
    fail "$(t "The hub did not answer within a minute. Its log: cd $dir && $compose logs hub" \
      "허브가 1분 안에 답하지 않았어요. 로그: cd $dir && $compose logs hub")"
  sleep 1
done

# The link back to Pacenote, with the address in it
encoded=$(printf '%s' "$url" | sed 's/%/%25/g; s/:/%3A/g; s/\//%2F/g; s/\[/%5B/g; s/\]/%5D/g')
link="pacenote://hub/connect?url=$encoded"

say ''
say "$(t "The hub is running: $url" "허브가 실행 중이에요: $url")"
if [ "$scheme" = https ]; then
  say "$(t "Serve it over HTTPS at that address, for example with Caddy: ${hostport} { reverse_proxy 127.0.0.1:8790 }" \
    "그 주소에서 HTTPS로 내보내세요. 예: Caddy에서 ${hostport} { reverse_proxy 127.0.0.1:8790 }")"
fi
if [ -n "$pair" ]; then
  say "$(t 'Pacenote on your Mac switches Pace to this hub on its own.' 'Mac의 Pacenote가 Pace를 이 허브로 알아서 전환해요.')"
fi
label=$(t 'Open in Pacenote' 'Pacenote에서 열기')
if [ -t 1 ]; then
  # A link most Mac terminals open on a click (OSC 8)
  printf '\033]8;;%s\033\\%s\033]8;;\033\\\n' "$link" "$label"
else
  say "$label:"
fi
say "$link"
