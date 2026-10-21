import type { Locale } from '@src/i18n/locale'

const en = {
  notCheckout: (path: string, repo: string, remote?: string) =>
    `${path} is not a checkout of ${repo}${remote ? ` (its remote is ${remote})` : ''}.`,
  title: 'Repository folders',
  help: "Where each repository's code tasks open. Chosen the first time a task needs one; Pacenote checks that the folder's git remote matches.",
  none: 'None yet.',
  change: 'Change',
  forget: 'Forget',
}

const ko: typeof en = {
  notCheckout: (path, repo, remote) =>
    `${repo}의 체크아웃이 아니에요: ${path}${remote ? ` (리모트: ${remote})` : ''}`,
  title: '저장소 폴더',
  help: '저장소마다 코드 작업이 열리는 폴더예요. 할 일에 처음 필요할 때 고르고, Pacenote가 폴더의 git 리모트가 맞는지 확인해요.',
  none: '아직 없어요.',
  change: '변경',
  forget: '지우기',
}

export const text: Record<Locale, typeof en> = { en, ko }
