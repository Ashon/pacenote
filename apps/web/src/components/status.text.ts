import type { RunStatus } from '@history/types'
import type { Locale } from '@src/i18n/locale'

const en = {
  status: {
    running: 'Running',
    succeeded: 'Succeeded',
    failed: 'Failed',
    interrupted: 'Interrupted',
  } satisfies Record<RunStatus, string>,
}

const ko: typeof en = {
  status: {
    running: '실행 중',
    succeeded: '성공',
    failed: '실패',
    interrupted: '중단됨',
  },
}

export const text: Record<Locale, typeof en> = { en, ko }
