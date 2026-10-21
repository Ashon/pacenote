import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'
import type { ReactNode } from 'react'

const en = {
  title: 'This is your work, as Pacenote sees it',
  fixingHint: 'Change what is off. Everything else stays as it is.',
  fromHint: 'From your last 30 days of tasks and sessions.',
  nameOf: (area: string) => `Name of ${area}`,
  notYours: 'Not yours anymore. Its tasks stay where they are.',
  takeOut: (part: string, area: string) => `Take ${part} out of ${area}`,
  undo: 'Undo',
  notMine: 'Not mine',
  workingNow: 'Working on it now',
  open: (n: number) => `${n} open`,
  quiet: 'Quiet lately',
  /** accounts: "ashon in Slack and Ashon on GitHub" */
  foundAs: (accounts: string) => `Found you as ${accounts}.`,
  done: 'Done',
  /** screen: the link to the You screen, around its name */
  fixLater: (screen: (label: string) => ReactNode) => (
    <>
      Rename, merge or take apart areas any time on the {screen('You')} screen.
    </>
  ),
  looksRight: 'Looks right',
  fixSomething: 'Fix something',
}

const ko: typeof en = {
  title: 'Pacenote가 보는 내 일이에요',
  fixingHint: '틀린 것만 고치세요. 나머지는 그대로 둬요.',
  fromHint: '최근 30일 동안의 할 일과 세션을 바탕으로 했어요.',
  nameOf: (area) => `${area} 이름`,
  notYours: '이제 내 영역이 아니에요. 할 일은 그대로 남아요.',
  takeOut: (part, area) => `${area}에서 ${part} 빼기`,
  undo: '되돌리기',
  notMine: '내 것 아님',
  workingNow: '지금 작업 중',
  open: (n) => `열린 할 일 ${n}개`,
  quiet: '최근 조용함',
  foundAs: (accounts) => `${josa(accounts, '으로/로')} 찾았어요.`,
  done: '완료',
  fixLater: (screen) => (
    <>
      영역 이름 바꾸기, 합치기, 나누기는 언제든 {screen('나')} 화면에서 할 수
      있어요.
    </>
  ),
  looksRight: '이대로 두기',
  fixSomething: '고치기',
}

export const text: Record<Locale, typeof en> = { en, ko }
