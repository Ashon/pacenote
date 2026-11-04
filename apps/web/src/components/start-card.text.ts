import type { Locale } from '@src/i18n/locale'

const en = {
  title: 'Your tasks, on this Mac',
  lead: 'No account, and no AI needed to start.',
  addTitle: 'Add what you need to do',
  addBody: (key: string) =>
    `Your tasks stay on this Mac. ${key} adds one whenever Todo is open.`,
  newTask: 'New task',
  aiTitle: 'Let your AI help',
  aiBody:
    'Claude Code, Codex or opencode finds what is asked of you in Slack and your sessions, and writes your recaps.',
  setUpAi: 'Set up AI',
  continueAi: 'Continue AI setup',
  macTitle: 'From your other Mac',
  macBody:
    'Pacenote on another of your Macs sends your Todo here, and the two keep it the same.',
  connect: 'Connect',
  deviceTitle: 'Your iPhone or iPad',
  deviceBody: 'Your Todo in your hand, kept by this Mac.',
  addDevice: 'Add a device',
  pace: 'Pace, which answers when you mention it in Slack, is optional: here or in Settings > General.',
  setUpPace: 'Set up Pace',
  close: 'Close',
  folded: 'Let your AI find what is asked of you, and write your recaps.',
}

const ko: typeof en = {
  title: '내 할 일, 이 Mac에',
  lead: '계정도 AI도 없이 시작해요.',
  addTitle: '할 일 적기',
  addBody: (key) =>
    `할 일은 이 Mac에 있어요. 할 일 화면에서 ${key}로 언제든 더해요.`,
  newTask: '새 할 일',
  aiTitle: 'AI에게 도움받기',
  aiBody:
    'Claude Code, Codex, opencode가 Slack과 내 세션에서 나에게 온 일을 찾고, 회고를 써요.',
  setUpAi: 'AI 설정',
  continueAi: 'AI 설정 이어서',
  macTitle: '다른 Mac에서',
  macBody:
    '다른 Mac의 Pacenote가 할 일을 이 Mac으로 보내고, 두 Mac이 할 일을 같게 맞춰요.',
  connect: '연결',
  deviceTitle: 'iPhone이나 iPad',
  deviceBody: '이 Mac이 맡은 할 일을 손 안에서 봐요.',
  addDevice: '기기 추가',
  pace: 'Slack에서 멘션하면 답하는 Pace는 선택이에요. 여기나 설정 > 일반에서 설정해요.',
  setUpPace: 'Pace 설정',
  close: '닫기',
  folded: 'AI가 나에게 온 일을 찾고 회고를 쓰게 해 보세요.',
}

export const text: Record<Locale, typeof en> = { en, ko }
