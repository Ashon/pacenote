import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'

/** A build from git, as `git describe` puts it: v0.3.9-3-g2034e74-dirty */
interface GitBuild {
  /** The release it is on or after: v0.3.9 */
  base: string
  /** Commits after it, if any */
  ahead?: string
  hash?: string
  /** It has uncommitted changes */
  dirty: boolean
  /** It runs from the repository (pnpm desktop) */
  dev: boolean
}

const en = {
  setupTip: 'Open Settings to set up Pace',
  statusTip: "Pace's status and logs",
  /** Before Pace's state: Pace: Connected */
  pace: 'Pace:',
  whereTip: "Where Pace answers: the Mac you're using (Settings > Macs)",
  movedHere: (from: string) => `Pace moved here from ${from}`,
  movingHere: 'Moving here…',
  /** Pace moving to another of your Macs, by its name if known */
  movingTo: (name?: string) => `Moving to ${name ?? 'your other Mac'}…`,
  answeringHere: 'Answering here',
  otherAnswers: (name?: string) => `${name ?? 'Your other Mac'} answers`,
  reasonerTip: 'Reasoner backend',
  toolsTip: 'Tools attached to the reasoner (MCP), diagram rendering',
  checkIssues: (n: number) =>
    `${n} ${n === 1 ? 'check issue' : 'check issues'}`,
  collectingTip: 'Collecting your tasks',
  collectingReads: (n: number) =>
    `Collecting your tasks: ${n} ${n === 1 ? 'lookup' : 'lookups'} so far`,
  collecting: 'Collecting tasks',
  activeTip: 'Requests in progress now',
  active: (n: number) => `${n} active`,
  handledTip: (n: number) => `${n} handled since Pace started`,
  /** When: 3m ago */
  lastRequest: (when: string) => `Last request ${when}`,
  openDataDir: 'Open run history in Finder',
  updateTip: (version: string) => `Pacenote ${version} is out: how to update`,
  update: 'Update',
  /** A release run from the repository */
  versionDev: (version: string) =>
    `Pacenote ${version}, running from the repository`,
  versionNotes: (version: string) =>
    `Pacenote ${version}: open its release notes`,
  gitBuild: ({ base, ahead, hash, dirty, dev }: GitBuild) =>
    `Pacenote built from git: ${[
      ahead ? `${ahead} commits after ${base} (${hash})` : `at ${base}`,
      ...(dirty ? ['with uncommitted changes'] : []),
    ].join(', ')}${dev ? ', running from the repository' : ''}`,
}

const ko: typeof en = {
  setupTip: '설정을 열어 Pace를 설정하세요',
  statusTip: 'Pace 상태와 로그',
  pace: 'Pace:',
  whereTip: 'Pace가 답변하는 곳: 지금 쓰는 Mac (설정 > 내 Mac)',
  movedHere: (from) => `Pace가 ${from}에서 이 Mac으로 왔어요`,
  movingHere: '이 Mac으로 옮기는 중…',
  movingTo: (name) => `${josa(name ?? '다른 Mac', '으로/로')} 옮기는 중…`,
  answeringHere: '여기서 답변 중',
  otherAnswers: (name) => `${name ?? '다른 Mac'}에서 답변 중`,
  reasonerTip: '답변 CLI',
  toolsTip: '답변 CLI에 연결한 도구(MCP), 다이어그램 렌더링',
  checkIssues: (n) => `점검 문제 ${n}개`,
  collectingTip: '할 일을 모으는 중',
  collectingReads: (n) => `할 일을 모으는 중: 지금까지 ${n}번 조회`,
  collecting: '할 일 모으는 중',
  activeTip: '지금 처리 중인 요청',
  active: (n) => `${n}건 처리 중`,
  handledTip: (n) => `Pace 시작 후 ${n}건 처리`,
  lastRequest: (when) => `마지막 요청 ${when}`,
  openDataDir: 'Finder에서 실행 기록 열기',
  updateTip: (version) => `새 버전 Pacenote ${version}: 업데이트 방법 보기`,
  update: '업데이트',
  versionDev: (version) => `Pacenote ${version}, 저장소에서 실행 중`,
  versionNotes: (version) => `Pacenote ${version}: 릴리스 노트 열기`,
  gitBuild: ({ base, ahead, hash, dirty, dev }) =>
    `git에서 빌드한 Pacenote: ${[
      ahead ? `${base} 이후 커밋 ${ahead}개 (${hash})` : `${base} 기준`,
      ...(dirty ? ['커밋하지 않은 변경 포함'] : []),
    ].join(', ')}${dev ? ', 저장소에서 실행 중' : ''}`,
}

export const text: Record<Locale, typeof en> = { en, ko }
