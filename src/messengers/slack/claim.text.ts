import type { Locale } from '../../i18n/locale.js'

/** Told in Slack, to the person who mentioned Pace alone */
const en = {
  confirm: 'Got it. Confirm in Pacenote that this is you, and setup goes on.',
}

const ko: typeof en = {
  confirm:
    '알겠어요. Pacenote에서 본인이 맞는지 확인하면 초기 설정이 이어져요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
