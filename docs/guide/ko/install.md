---
title: 설치하고 처음 실행하기
summary: Homebrew로 Pacenote를 설치하고, 세 단계로 나에게 온 일을 모으고, 원할 때 Pace를 설정해요.
kind: start
order: 1
shot: first-run
---

## 필요한 것

- macOS 12 이상의 Apple silicon Mac. 내장 샌드박스는 macOS 15가 필요해요.
- 그 Mac에 로그인한 Claude Code(Claude Pro, Max, Team, Enterprise 요금제)나 Codex 0.138 이상(ChatGPT Plus, Pro,
  Business 요금제).
- 앱을 만들 수 있는 Slack 워크스페이스, 또는 팀의 Pacenote 허브.

## 설치

Homebrew는 신뢰한 탭의 cask만 불러와요. 그래서 탭을 추가하고, 신뢰하고, 설치해요.

```sh
brew tap ashon/tap
brew trust ashon/tap
brew install --cask pacenote
```

## 처음 실행

Pacenote를 열어요. 새로 설치하면 세 단계로 시작하고, Slack 앱은 만들지 않아요.

![처음 실행의 두 번째 단계: 이 Mac, 그리고 AI 도구의 커넥터로 읽는 Slack](shot:first-run)

1. **내 AI.** Claude Code나 Codex를 골라요. 이 Mac에 있고 로그인했는지 확인해요.
2. **일이 있는 곳.** 이 Mac의 세션과 커밋, 그리고 AI 도구의 Slack 커넥터로 읽기만 하는 Slack이에요. 아직이라면
   claude.ai의 설정 > 커넥터(또는 ChatGPT의 설정 > 앱)에서 Slack을 연결하세요.
3. **첫 모으기.** **지금 모으기**가 지난 7일의 Slack을 읽고 내 프로젝트를 찾아요. 그다음 할 일이 열려요. 아직
   Slack 커넥터가 없으면 이 Mac만 보고, 연결한 뒤에는 할 일 화면의 지금 모으기가 Slack도 읽어요.

다른 Mac에 Pacenote가 이미 있나요? 2단계에서 **다른 Mac에서 가져오기**를 고르고, 그 Mac의 설정 > 내 Mac에서
**Mac 추가**를 누른 뒤, 두 Mac에 같은 6자리 숫자가 보이면 그곳에서 허용하세요. 이 Mac은 할 일 모으기 설정을 가져와
할 일로 열리고, 할 일은 두 Mac에서 같아요. 이미 설정한 Mac은 자기 설정 > 내 Mac의 **페어링**으로 이어요.

Slack에서 멘션하면 답하는 Pace는 설정하기 전까지 꺼져 있어요. 처음 실행에서 **대신 Pace 설정**을 누르거나,
설정 > 일반에서 **Pace 설정**을 누르세요.

## Pace 초기 설정, 한 단계씩

Pace 초기 설정은 단계 목록이 왼쪽에 있어요. 단계마다 필요한 것을 그 자리에서 확인해요.

![초기 설정의 첫 단계: 이미 쓰고 있는 AI 서비스](shot:setup-start)

1. **AI 서비스.** Claude Code나 Codex를 골라요. 이 Mac에 있고 로그인했는지 확인해요.
2. **실행 환경.** 요청마다 작은 Linux VM을 쓰고 내 파일은 못 보는 내장 샌드박스, 또는 내 로그인으로 이 Mac에서 바로
   실행. 이 Mac이 샌드박스를 돌릴 수 있으면 초기 설정이 바로 준비를 시작해요. 몇 분 걸려요.
3. **Slack.** 팀 허브에 참여하거나, Pacenote 매니페스트로 만든 내 Slack 앱을 써요. 다른 Mac에 Pacenote가 설정돼
   있으면 그 Mac에 연결할 수도 있어요. 허브 참여는 [팀 허브에 합류하기](guide:join-hub)에 있어요.
4. **확인.** 고른 것을 확인하고 Pace를 시작해요.
5. **첫 답변.** Pace가 있는 공개 채널에서 `@Pace`를 멘션해요. Pace가 거기서 답하면 초기 설정이 끝나요.

**나중에 마치기**로 어느 단계에서든 나갈 수 있어요. 개요의 카드에서 다시 이어 가요.

## 다음

- 받은 요청은 [할 일](guide:todo)에 모아요.
- Pace가 Slack에 닿는 방식은 [설정 > 메신저](guide:messengers)에서 바꿔요.
