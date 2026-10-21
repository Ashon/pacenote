import type { Locale } from '../i18n/locale.js'

/** What stands in an answer for its diagrams, in Pace's notes language */
const en = {
  figure: (n: number) => `_(Figure ${n}: image below)_`,
  unrendered: "_(Couldn't render this diagram, so the source is shown)_",
}

const ko: typeof en = {
  figure: (n) => `_(그림 ${n}: 아래 이미지)_`,
  unrendered: '_(이 다이어그램은 그리지 못해서 소스를 그대로 보여 드려요)_',
}

export const text: Record<Locale, typeof en> = { en, ko }
