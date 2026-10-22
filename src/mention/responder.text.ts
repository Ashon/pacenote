import { josa } from '../i18n/korean.js'
import type { Locale } from '../i18n/locale.js'

/**
 * What Pace says itself around an answer in Slack, in its notes language
 * (NOTES_LANGUAGE): the line under the answer, the notes for the asker alone
 * and the titles of the images it posts. where: the reasoner and where it
 * runs, as code (`claude@vm`).
 */
const en = {
  /** tool: "Claude Code", "Codex" */
  aiNote: (tool: string) => `_AI answer by Pace, with ${tool}_`,
  notOwner: 'I only answer the person I work for.',
  notHere: "I don't answer here.",
  busy: 'I have too many requests right now. Please mention me again in a moment.',
  /** Where the messenger cannot react: how the request was taken on */
  taking: {
    now: (where: string) => `Working on it... (${where})`,
    queued: (where: string) =>
      `Got it. I'll start on this after the requests ahead of it. (${where})`,
    resumed: (where: string) =>
      `I restarted, so I'm picking this up again... (${where})`,
  },
  cutShort:
    'I restarted while posting my answer, so it may be cut short. Please mention me again if it is.',
  cutOff:
    "I couldn't finish this: I restarted and the request was cut off. Please mention me again.",
  generatedImage: (n: number) => `Generated image ${n}`,
  figure: (n: number) => `Figure ${n}`,
  /** Above a diagram's source, posted when its image could not be */
  sourceOf: (title: string) => `${title} source:`,
  uploadFailedSources:
    "I couldn't upload the images, so their sources are in the thread.",
  uploadFailed: "I couldn't upload the generated images.",
  /**
   * Why the reasoner cannot answer, as the app's status shows it, in the app's
   * language
   */
  lastAt: (problem: string, time: string) => `${problem} (last at ${time})`,
}

const ko: typeof en = {
  aiNote: (tool) => `_Pace가 ${josa(tool, '으로/로')} 작성한 AI 답변_`,
  notOwner: '저는 저를 쓰는 분에게만 답해요.',
  notHere: '저는 여기서 답하지 않아요.',
  busy: '지금은 요청이 너무 많아요. 잠시 후에 다시 멘션해 주세요.',
  taking: {
    now: (where) => `작업하고 있어요... (${where})`,
    queued: (where) => `알겠어요. 앞선 요청들이 끝나면 시작할게요. (${where})`,
    resumed: (where) =>
      `다시 시작해서 이 요청을 이어서 처리하고 있어요... (${where})`,
  },
  cutShort:
    '답변을 올리는 중에 다시 시작해서 답변이 잘렸을 수 있어요. 잘렸다면 다시 멘션해 주세요.',
  cutOff:
    '이 요청을 끝내지 못했어요. 다시 시작하면서 요청이 끊겼어요. 다시 멘션해 주세요.',
  generatedImage: (n) => `생성된 이미지 ${n}`,
  figure: (n) => `그림 ${n}`,
  sourceOf: (title) => `${title} 소스:`,
  uploadFailedSources: '이미지를 올리지 못해서 소스를 스레드에 올렸어요.',
  uploadFailed: '생성된 이미지를 올리지 못했어요.',
  lastAt: (problem, time) => `${problem} (마지막: ${time})`,
}

export const text: Record<Locale, typeof en> = { en, ko }
