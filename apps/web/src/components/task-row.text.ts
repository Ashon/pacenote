import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'
import type { WorkTool } from '@src/tasks/types'

const en = {
  /** Tasks from a session on this Mac, as their source */
  thisMac: 'This Mac',
  /** The desktop app each tool's sessions can open in (Open sessions in) */
  app: { claude: 'Claude app', codex: 'Codex app', opencode: 'opencode' },
  dismissReason: {
    'not-mine': 'Not for me',
    'done-already': 'Already done',
    'not-worth-it': 'Not worth it',
  },
  /** A settled task: by its status, why it was dismissed, or why it closed */
  settled: {
    done: 'Done',
    dismissed: 'Dismissed',
    'not-mine': 'Dismissed: not for me',
    'done-already': 'Dismissed: already done',
    'not-worth-it': 'Dismissed: not worth it',
    replied: 'Closed: you replied in the thread',
    checked: 'Closed: marked with a check',
  } as Record<string, string>,
  closedIn: (tool: string) => `Closed: done in ${tool}`,
  settledIn: (source: string) => `Closed: settled in ${source}`,

  // A change in words; the due dates are the AI's ("Thursday")
  dueMoved: (from: string, to: string) => `Due ${from} → ${to}`,
  due: (to: string) => `Due ${to}`,
  noLongerDue: (from: string | undefined) => `No longer due ${from}`,
  wasTitle: (from: string | undefined) => `Was “${from}”`,
  nowSure: 'Now a task, no longer a Maybe',
  nowMaybe: 'Now a Maybe',
  repo: (repo: string) => `Repository ${repo}`,
  noRepo: 'No repository',
  actionWord: {
    code: 'a code task',
    reply: 'a reply',
    other: 'neither code nor a reply',
  } as Record<string, string>,
  nowAction: (what: string | undefined) => `Now ${what}`,
  summaryUpdated: 'Summary updated',

  // Who it is from
  leftAfter: (title: string) => `Left after “${title}”`,
  keptFromSession: 'Kept from a session',
  addedByYou: 'You added it',
  // Stages: in progress, waiting on someone else
  inProgress: 'In progress',
  /** Since when it waits, by calendar days */
  waitingFor: (days: number) =>
    days === 0
      ? 'Waiting since today'
      : days === 1
        ? 'Waiting since yesterday'
        : `Waiting ${days} days`,
  markInProgress: 'Mark in progress',
  notInProgress: 'Not in progress',
  waitingOnSomeone: 'Waiting on someone else',
  backToOpen: 'Back to open',
  promised: 'You said you would',
  askedBy: (person: string, group?: string) =>
    `${person} asked ${group ?? 'you'}`,
  askedOf: (group: string) => `Asked of ${group}`,

  // The row
  continueIn: (tool: string) => `Continue in ${tool}`,
  continueElsewhere: 'Continue in another folder',
  draftReply: 'Draft a reply',
  inArea: (area: string) => `In ${area}, an area of your work`,
  workingIn: (tool?: string) => `Working in ${tool ?? 'an AI tool'}`,
  lastActiveIn: (tool: string) => `Last active in its ${tool} session`,
  looksDone: 'Looks done',
  updated: (when: string) => `Updated ${when}`,
  groupAsk: (group: string) => `Whether ${group} means you`,
  groupMeansYou: (group: string) => `Does ${group} mean you?`,
  itsMe: 'It’s me',
  notMe: 'Not me',
  whyDismiss: 'Why dismiss it',
  justDismiss: 'Just dismiss',
  keepIt: 'Keep it',
  done: 'Done',
  dismiss: 'Dismiss',
  moreForTask: 'More for this task',
  keepAsTask: 'Keep as a task',
  reopen: 'Reopen',
  openIn: (source: string) => `Open in ${source}`,

  // The opened row
  changed: 'Changed',
  lookingEarlier: 'Looking for what came before.',
  result: 'Result',
  lastTime: 'Last time',
  yourWork: 'Your work',
  inThread: 'In this thread',
  sameRepo: 'Same repo',
  fromPerson: (name: string) => `From ${name}`,
  nothingEarlier: (repo?: string, person?: string) =>
    `Nothing earlier in this thread${repo ? `, in ${repo}` : ''}${
      person ? ` or from ${person}` : ''
    }.`,
  showLess: 'Show less',
  moreEarlier: (n: number) => `${n} more earlier`,
  draftingReply: 'Reading the thread, read only, to draft your reply.',
  yourReply: 'Your reply',
  replyCopied: (when: string) => `Your reply, copied ${when}`,
  /** by: the CLI that drafted it */
  replyDrafted: (when: string, by?: string) =>
    `Your reply, drafted from the thread ${by ? `by ${by} ` : ''}${when}`,
  copyAndOpen: 'Copy and open thread',
  draftAgain: 'Draft again',
  neverSends: 'Pacenote never sends it for you.',
  stillWaiting: (person: string) => `${person} is still waiting in the thread`,
  replyWaiting: 'A reply is waiting to be sent',
  sessionDrafted: (reply: string) =>
    `The session drafted a reply for you: “${reply}”`,
  editFirst: 'Edit it first',

  // An earlier line; its: an earlier task's session rather than this one's
  resumeIn: (its: boolean, tool: string) =>
    `Continue ${its ? 'its' : 'this'} session in ${tool}`,
  resumeInApp: (its: boolean, app: string) =>
    `Continue ${its ? 'its' : 'this'} session in the ${app}`,
  resumeInTerminal: (its: boolean) =>
    `Continue ${its ? 'its' : 'this'} session in your terminal`,
  startHereTip: (mac: string, tool: string) =>
    `It is on ${mac}. Start a ${tool} session for the task on this Mac.`,
  startHere: 'Start here',
  waitingToSend: 'Waiting for you to send it',
  waitingToStart: (tool: string) => `Waiting for ${tool} to start it`,
  aMention: 'A mention',
  openRun: 'Open the run',
  readItsSession: 'Read its session',
  readSession: 'Read the session',
  toolSession: (tool: string) => `${tool} session`,
  onMac: (mac: string) => `On ${mac}`,
  inApp: (app: string) => `in the ${app}`,
  lastActive: (when: string) => `last active ${when}`,
  started: (when: string) => `started ${when}`,

  // How a session you started yourself was known as the task's work
  foundLink: "Found: what you typed has this task's Slack message",
  foundBranch: (branch?: string) =>
    `Found: it worked on ${branch ?? 'the branch'}, where this task's work is`,
  foundYou: 'You said it is this task’s work',
  foundTools: "Found: it used Pacenote's task tools for this task",

  // Looks done
  closeIt: 'Close it',
  notYet: 'Not yet',
  looksFinished: (tool: string) => `Its ${tool} session looks finished.`,
  fromSession: (tool: string) => `From its ${tool} session`,
  /** A pull request and its state as GitHub says it (MERGED) */
  pr: (n: number, state: string) => `#${n} ${state.toLowerCase()}`,
  left: 'Left',
  keepLeft: 'Keep as a task',

  // A session that looks related
  looksRelated: 'Looks related',
  linkSession: 'Link this session to the task',
  link: 'Link',
  notThisSession: "Not this task's session",
  notIt: 'Not it',
  mentions: (shares: string[]) => `mentions ${shares.join(', ')}`,

  // Where Continue opens
  opensApp: (tool: WorkTool, folder?: string) =>
    `Opens ${tool === 'claude' ? "the Claude app's Code tab" : 'the Codex app'}${
      folder ? ` in ${folder}` : ''
    } with the task written in. Send it there to start.`,
  opensIn: (folder: string) => `Opens in ${folder}`,

  // The folder dialog
  whereIsRepo: (repo: string) => `Where is ${repo} on this Mac?`,
  whereToOpen: 'Where should the session open?',
  /** remembers: the folder is kept for the task's repository */
  opensHere: (tool: string, remembers: boolean) =>
    `${tool} opens in this folder with the task.${
      remembers
        ? ' Pacenote remembers it for this repository; change it in Settings > Todo.'
        : ''
    }`,
  folder: 'Folder',
  lookingForRepo: (repo: string) => `Looking for ${repo} on this Mac.`,
  lookingForFolders: 'Looking for the folders you worked in.',
  noCheckout: (repo: string) =>
    `No checkout of ${repo} found under your usual folders.`,
  remote: (remote: string) => `Its remote is ${remote}`,
  noRemote: 'No remote',
  uncommitted: (n: number) => `${n} changes not committed`,
  clean: 'clean',
  notRepo: (repo: string) => `not ${repo}`,
  used: (when: string) => `used ${when}`,
  chooseFolder: 'Choose another folder',
  runsAsYou: (tool: string) =>
    `${tool} runs as you, with your own permissions, and asks you before it changes anything. Pacenote opens the session and hands it the task; it runs no commands itself.`,
  cancel: 'Cancel',
  openHere: (tool: string) => `Open ${tool} here`,

  // A session's log
  theSession: 'The session',
  sessionLog: 'Session log',
  closeLog: 'Close the log',
  findingSession: 'Finding the session.',
  noSession: 'There is no such session.',
  continueInApp: (app: string) => `Continue in the ${app}`,
  readingLog: "Reading the session's log.",
  you: 'You',
  /** Your avatar in the log */
  youInitial: 'Y',
  readFrom: (tool: string) =>
    `Read from ${tool}'s own session log on this Mac when you opened it. Pacenote keeps only the session's id, folder and times.`,
}

/** A pull request's state, as GitHub's Korean pages word it */
const PR_STATES: Record<string, string> = {
  open: '열림',
  draft: '초안',
  merged: '병합됨',
  closed: '닫힘',
}

const ko: typeof en = {
  thisMac: '이 Mac',
  app: { claude: 'Claude 앱', codex: 'Codex 앱', opencode: 'opencode' },
  dismissReason: {
    'not-mine': '내 일 아님',
    'done-already': '이미 끝남',
    'not-worth-it': '할 필요 없음',
  },
  settled: {
    done: '완료',
    dismissed: '제외됨',
    'not-mine': '제외됨: 내 일 아님',
    'done-already': '제외됨: 이미 끝남',
    'not-worth-it': '제외됨: 할 필요 없음',
    replied: '닫힘: 스레드에 답장함',
    checked: '닫힘: 체크 표시됨',
  },
  closedIn: (tool) => `닫힘: ${tool}에서 완료`,
  settledIn: (source) => `닫힘: ${source}에서 해결됨`,

  dueMoved: (from, to) => `마감 ${from} → ${to}`,
  due: (to) => `마감 ${to}`,
  noLongerDue: (from) => `마감 없어짐 (원래 ${from})`,
  wasTitle: (from) => `이전 제목 “${from}”`,
  nowSure: '후보에서 할 일로 바뀜',
  nowMaybe: '후보로 바뀜',
  repo: (repo) => `저장소 ${repo}`,
  noRepo: '저장소 없음',
  actionWord: {
    code: '코드 작업',
    reply: '답장',
    other: '코드도 답장도 아닌 일',
  },
  nowAction: (what) => `이제 ${what}`,
  summaryUpdated: '요약 바뀜',

  leftAfter: (title) => `“${title}” 이후 남은 일`,
  keptFromSession: '세션에서 남긴 일',
  addedByYou: '직접 추가함',
  inProgress: '진행 중',
  waitingFor: (days) =>
    days === 0
      ? '오늘부터 기다림'
      : days === 1
        ? '어제부터 기다림'
        : `${days}일째 기다림`,
  markInProgress: '진행 중으로',
  notInProgress: '진행 중 아님',
  waitingOnSomeone: '남을 기다리는 중',
  backToOpen: '열림으로',
  promised: '하겠다고 한 일',
  askedBy: (person, group) =>
    group ? `${person}님이 ${group}에 요청` : `${person}님의 요청`,
  askedOf: (group) => `${group}에 온 요청`,

  continueIn: (tool) => `${tool}에서 계속`,
  continueElsewhere: '다른 폴더에서 계속',
  draftReply: '답장 초안 쓰기',
  inArea: (area) => `내 업무 영역: ${area}`,
  workingIn: (tool) => `${tool ?? 'AI 도구'}에서 작업 중`,
  lastActiveIn: (tool) => `${tool} 세션에서 마지막으로 활동`,
  looksDone: '끝난 것 같음',
  updated: (when) => `${when} 변경됨`,
  groupAsk: (group) => `${group}에 내가 포함되는지`,
  groupMeansYou: (group) => `${group}에 내가 포함되나요?`,
  itsMe: '나 맞음',
  notMe: '나 아님',
  whyDismiss: '제외하는 이유',
  justDismiss: '그냥 제외',
  keepIt: '제외 취소',
  done: '완료',
  dismiss: '제외',
  moreForTask: '이 할 일 더 보기',
  keepAsTask: '할 일로 유지',
  reopen: '다시 열기',
  openIn: (source) => `${source}에서 열기`,

  changed: '변경',
  lookingEarlier: '이전 맥락을 찾고 있어요.',
  result: '결과',
  lastTime: '지난번',
  yourWork: '내 작업',
  inThread: '이 스레드',
  sameRepo: '같은 저장소',
  fromPerson: (name) => `${name}님 요청`,
  nothingEarlier: (repo, person) =>
    `${['이 스레드', repo && `${repo} 저장소`, person && `${person}님의 요청`]
      .filter(Boolean)
      .join(', ')}에서 찾은 이전 기록이 없어요.`,
  showLess: '접기',
  moreEarlier: (n) => `이전 기록 ${n}개 더 보기`,
  draftingReply: '답장 초안을 쓰려고 스레드를 읽고 있어요(읽기 전용).',
  yourReply: '내 답장',
  replyCopied: (when) => `내 답장 · ${when} 복사함`,
  replyDrafted: (when, by) =>
    `내 답장 · ${by ? `${josa(by, '이/가')} ` : ''}${when} 스레드를 보고 쓴 초안`,
  copyAndOpen: '복사하고 스레드 열기',
  draftAgain: '초안 다시 쓰기',
  neverSends: 'Pacenote는 대신 보내지 않아요.',
  stillWaiting: (person) => `${person}님이 스레드에서 아직 기다리고 있어요`,
  replyWaiting: '보낼 답장이 기다리고 있어요',
  sessionDrafted: (reply) => `세션이 답장 초안을 써 뒀어요: “${reply}”`,
  editFirst: '먼저 고치기',

  resumeIn: (its, tool) =>
    `${its ? '그 할 일의' : '이'} 세션을 ${tool}에서 계속`,
  resumeInApp: (its, app) =>
    `${its ? '그 할 일의' : '이'} 세션을 ${app}에서 계속`,
  resumeInTerminal: (its) =>
    `${its ? '그 할 일의' : '이'} 세션을 터미널에서 계속`,
  startHereTip: (mac, tool) =>
    `${mac}에 있는 세션이에요. 이 Mac에서 이 할 일의 ${tool} 세션을 새로 시작해요.`,
  startHere: '여기서 시작',
  waitingToSend: '내가 보내기를 기다리는 중',
  waitingToStart: (tool) => `${tool}의 시작을 기다리는 중`,
  aMention: '멘션',
  openRun: '실행 열기',
  readItsSession: '그 세션 읽기',
  readSession: '세션 읽기',
  toolSession: (tool) => `${tool} 세션`,
  onMac: (mac) => `${mac}에서`,
  inApp: (app) => `${app}에서`,
  lastActive: (when) => `${when} 마지막 활동`,
  started: (when) => `${when} 시작`,

  foundLink: '찾은 근거: 입력한 내용에 이 할 일의 Slack 메시지가 있어요',
  foundBranch: (branch) =>
    `찾은 근거: 이 할 일의 작업이 있는 ${branch ? `${branch} 브랜치` : '브랜치'}에서 작업했어요`,
  foundYou: '이 할 일의 작업이라고 직접 정했어요',
  foundTools: '찾은 근거: 이 할 일에 Pacenote의 할 일 도구를 썼어요',

  closeIt: '닫기',
  notYet: '아직 아님',
  looksFinished: (tool) => `${tool} 세션이 끝난 것 같아요.`,
  fromSession: (tool) => `${tool} 세션에서`,
  pr: (n, state) =>
    `#${n} ${PR_STATES[state.toLowerCase()] ?? state.toLowerCase()}`,
  left: '남은 일',
  keepLeft: '할 일로 남기기',

  looksRelated: '관련 있어 보임',
  linkSession: '이 세션을 할 일에 연결',
  link: '연결',
  notThisSession: '이 할 일의 세션 아님',
  notIt: '아님',
  mentions: (shares) => `${shares.join(', ')} 언급`,

  // 'Claude 앱의 Code 탭' and 'Codex 앱' both take 이
  opensApp: (tool, folder) =>
    `${folder ? `${folder}에서 ` : ''}할 일을 적어 둔 ${
      tool === 'claude' ? 'Claude 앱의 Code 탭' : 'Codex 앱'
    }이 열려요. 거기서 보내면 시작해요.`,
  opensIn: (folder) => `${folder}에서 열려요`,

  whereIsRepo: (repo) => `이 Mac에서 ${josa(repo, '은/는')} 어디에 있나요?`,
  whereToOpen: '세션을 어디서 열까요?',
  opensHere: (tool, remembers) =>
    `${josa(tool, '이/가')} 이 폴더에서 할 일을 받아 열려요.${
      remembers
        ? ' Pacenote가 이 저장소의 폴더로 기억해요. 설정 > 할 일에서 바꿀 수 있어요.'
        : ''
    }`,
  folder: '폴더',
  lookingForRepo: (repo) => `이 Mac에서 ${josa(repo, '을/를')} 찾고 있어요.`,
  lookingForFolders: '작업했던 폴더를 찾고 있어요.',
  noCheckout: (repo) => `자주 쓰는 폴더에서 ${repo} 체크아웃을 찾지 못했어요.`,
  remote: (remote) => `원격 ${remote}`,
  noRemote: '원격 없음',
  uncommitted: (n) => `커밋하지 않은 변경 ${n}개`,
  clean: '변경 없음',
  notRepo: (repo) => `${repo} 아님`,
  used: (when) => `${when} 사용`,
  chooseFolder: '다른 폴더 선택',
  runsAsYou: (tool) =>
    `${josa(tool, '은/는')} 내 권한으로 나로서 실행되고, 무언가를 바꾸기 전에 물어봐요. Pacenote는 세션을 열고 할 일을 넘길 뿐, 직접 명령을 실행하지 않아요.`,
  cancel: '취소',
  openHere: (tool) => `여기서 ${tool} 열기`,

  theSession: '세션',
  sessionLog: '세션 로그',
  closeLog: '로그 닫기',
  findingSession: '세션을 찾고 있어요.',
  noSession: '해당 세션이 없어요.',
  continueInApp: (app) => `${app}에서 계속`,
  readingLog: '세션 로그를 읽고 있어요.',
  you: '나',
  youInitial: '나',
  readFrom: (tool) =>
    `로그를 열 때 이 Mac에 있는 ${tool}의 세션 로그에서 읽어 왔어요. Pacenote는 세션의 ID, 폴더, 시각만 보관해요.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
