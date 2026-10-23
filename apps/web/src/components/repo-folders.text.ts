import type { Locale } from '@src/i18n/locale'

const en = {
  notCheckout: (path: string, repo: string, remote?: string) =>
    `${path} is not a checkout of ${repo}${remote ? ` (its remote is ${remote})` : ''}.`,
  title: 'Repository folders',
  help: "The repositories you work in: those of your tasks, and of the folders you worked in lately with Claude Code or Codex. A code task opens in its repository's folder; Pacenote checks that the folder's git remote matches.",
  none: 'None yet. They show up once a task or a session of yours is in a repository.',
  tasks: (n: number) => `${n} open ${n === 1 ? 'task' : 'tasks'}`,
  remembered: 'Opens here',
  found: 'Found where you worked lately, not chosen yet',
  notChosen: 'No folder yet: chosen the first time a task needs one',
  use: 'Use this',
  choose: 'Choose',
  change: 'Change',
  forget: 'Forget',
}

const ko: typeof en = {
  notCheckout: (path, repo, remote) =>
    `${repo}의 체크아웃이 아니에요: ${path}${remote ? ` (리모트: ${remote})` : ''}`,
  title: '저장소 폴더',
  help: '내가 작업하는 저장소예요. 할 일에 나온 저장소와 최근 Claude Code나 Codex로 작업한 폴더의 저장소가 모여요. 코드 작업은 저장소의 폴더에서 열리고, Pacenote가 폴더의 git 리모트가 맞는지 확인해요.',
  none: '아직 없어요. 할 일이나 내 세션이 저장소에서 생기면 나타나요.',
  tasks: (n) => `열린 할 일 ${n}개`,
  remembered: '여기서 열려요',
  found: '최근 작업한 곳에서 찾음, 아직 정하지 않음',
  notChosen: '아직 폴더 없음: 할 일에 처음 필요할 때 골라요',
  use: '이 폴더 쓰기',
  choose: '고르기',
  change: '변경',
  forget: '지우기',
}

export const text: Record<Locale, typeof en> = { en, ko }
