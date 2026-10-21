import type { Locale } from '../i18n/locale.js'

/**
 * What the hub tells a member in Slack, alone, in its notes language
 * (HUB_NOTES_LANGUAGE). It speaks as the bot they mentioned.
 */
const en = {
  notPaired:
    "This Slack workspace answers through each member's own Pacenote desktop app, and yours is not connected yet. In Pacenote, open Settings > Messengers > Slack, choose the team hub and connect, then send me the code it shows.",
  offline:
    'Your Pacenote desktop is not connected to the hub right now. Open Pacenote on your computer and mention me again.',
  notAllowed:
    "You are not on the list of members who can use Pacenote here. Ask the hub's admin.",
  paired: (label: string) =>
    `Code accepted for "${label}". Confirm the pairing in your Pacenote app to finish.`,
  unknownCode:
    'That code is not valid or has expired. Start again in Pacenote (Settings > Messengers > Slack) for a new one.',
  takenCode:
    'Someone else already sent that code. Start again in Pacenote for a new one.',
}

const ko: typeof en = {
  notPaired:
    '이 Slack 워크스페이스에서는 팀원마다 자기 Pacenote 데스크톱 앱으로 답하는데, 아직 연결된 앱이 없어요. Pacenote에서 설정 > 메신저 > Slack을 열고 팀 허브를 골라 연결한 다음, 거기 나오는 코드를 저에게 보내 주세요.',
  offline:
    '지금 Pacenote 데스크톱이 허브에 연결되어 있지 않아요. 컴퓨터에서 Pacenote를 열고 다시 멘션해 주세요.',
  notAllowed:
    '여기서 Pacenote를 쓸 수 있는 팀원 목록에 없어요. 허브 관리자에게 문의해 주세요.',
  paired: (label) =>
    `"${label}"의 코드를 받았어요. Pacenote 앱에서 페어링을 확인하면 끝나요.`,
  unknownCode:
    '유효하지 않거나 만료된 코드예요. Pacenote(설정 > 메신저 > Slack)에서 다시 시작해 새 코드를 받아 주세요.',
  takenCode:
    '다른 사람이 이미 이 코드를 보냈어요. Pacenote에서 다시 시작해 새 코드를 받아 주세요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
