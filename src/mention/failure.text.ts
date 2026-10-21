import { josa } from '../i18n/korean.js'
import type { Locale } from '../i18n/locale.js'

const en = {
  seconds: (n: number) => `${n} ${n === 1 ? 'second' : 'seconds'}`,
  minutes: (n: number) => `${n} minutes`,
  /**
   * What the asker reads in Slack, in Pace's notes language. name: the
   * service ("Claude", "Codex"); own: the asker runs this Pace on their Mac.
   */
  reply: {
    auth: (name: string) =>
      `I couldn't produce an answer: my sign-in to ${name} was rejected. Whoever runs Pace needs to sign in again; Pacenote shows them how.`,
    authOwn: (name: string) =>
      `I couldn't produce an answer: my sign-in to ${name} on your Mac was rejected. Sign in again; Pacenote shows how.`,
    limit: (name: string) =>
      `I couldn't produce an answer: I've reached my ${name} usage limit for now. Please try again later.`,
    unavailable: (name: string) =>
      `I couldn't produce an answer: ${name} is unavailable right now. Please try again in a few minutes.`,
    setup:
      "I couldn't produce an answer: something in my setup isn't working. Whoever runs Pace can see what in Pacenote.",
    setupOwn:
      "I couldn't produce an answer: something in my setup on your Mac isn't working. Pacenote shows what.",
    /** limit: how long a run may take ("15 minutes"), when known */
    timeout: (limit: string | undefined) =>
      `I couldn't produce an answer: the request took ${limit ? `longer than ${limit}` : 'too long'}. A narrower question may help.`,
    other:
      "I couldn't produce an answer: something went wrong on my side. Whoever runs Pace can see what in Pacenote.",
    otherOwn:
      "I couldn't produce an answer: something went wrong on my side. Pacenote on your Mac shows what.",
  },
  /**
   * What the operator reads in the app, in its language. backend: the CLI
   * ("claude", "codex"); service: what it signs in to ("Claude", "Codex").
   */
  advice: {
    authHost: (backend: string, codex: boolean) =>
      `${backend}'s sign-in on this Mac was rejected. Sign in again in a terminal (${codex ? 'codex login' : 'claude, then /login'}).`,
    authSandbox: (backend: string, service: string) =>
      `${backend}'s sign-in in the sandbox was rejected or is missing. Sign in to ${service} in Settings > Sandbox > Reasoner login, then restart Pace.`,
    limit: (backend: string) =>
      `${backend} reached its usage limit. Pace answers again once the limit resets.`,
    unavailable: (backend: string) =>
      `${backend}'s service was unavailable. This usually passes in a few minutes.`,
    setup:
      'Something Pace runs on failed: the built-in sandbox or the CLI. The Pace screen and Settings > Sandbox show what.',
    timeout:
      'The run took longer than the reasoner timeout (Settings > Answers).',
  },
}

const ko: typeof en = {
  seconds: (n) => `${n}초`,
  minutes: (n) => `${n}분`,
  reply: {
    auth: (name) =>
      `답변을 만들지 못했어요. 제 ${name} 로그인이 거부됐어요. Pace를 실행하는 분이 다시 로그인해야 해요. 방법은 Pacenote에 나와 있어요.`,
    authOwn: (name) =>
      `답변을 만들지 못했어요. 사용하시는 Mac에서 제 ${name} 로그인이 거부됐어요. 다시 로그인해 주세요. 방법은 Pacenote에 나와 있어요.`,
    limit: (name) =>
      `답변을 만들지 못했어요. 지금은 ${name} 사용 한도에 도달했어요. 나중에 다시 시도해 주세요.`,
    unavailable: (name) =>
      `답변을 만들지 못했어요. 지금은 ${josa(name, '을/를')} 쓸 수 없어요. 몇 분 뒤에 다시 시도해 주세요.`,
    setup:
      '답변을 만들지 못했어요. 제 설정 중 무언가가 작동하지 않아요. Pace를 실행하는 분이 Pacenote에서 무엇인지 볼 수 있어요.',
    setupOwn:
      '답변을 만들지 못했어요. 사용하시는 Mac에서 제 설정 중 무언가가 작동하지 않아요. 무엇인지는 Pacenote에 나와 있어요.',
    timeout: (limit) =>
      limit
        ? `답변을 만들지 못했어요. 요청이 ${limit} 넘게 걸렸어요. 질문을 좁히면 도움이 될 수 있어요.`
        : '답변을 만들지 못했어요. 요청이 너무 오래 걸렸어요. 질문을 좁히면 도움이 될 수 있어요.',
    other:
      '답변을 만들지 못했어요. 제 쪽에서 문제가 생겼어요. Pace를 실행하는 분이 Pacenote에서 무엇인지 볼 수 있어요.',
    otherOwn:
      '답변을 만들지 못했어요. 제 쪽에서 문제가 생겼어요. 사용하시는 Mac의 Pacenote에 무엇인지 나와 있어요.',
  },
  advice: {
    authHost: (backend, codex) =>
      `이 Mac의 ${backend} 로그인이 거부됐어요. 터미널에서 다시 로그인하세요(${codex ? 'codex login' : 'claude 실행 후 /login'}).`,
    authSandbox: (backend, service) =>
      `샌드박스의 ${backend} 로그인이 거부됐거나 없어요. 설정 > 샌드박스 > 답변 CLI 로그인에서 ${service}에 로그인한 다음 Pace를 다시 시작하세요.`,
    limit: (backend) =>
      `${backend} 사용 한도에 도달했어요. 한도가 초기화되면 Pace가 다시 답변해요.`,
    unavailable: (backend) =>
      `${backend} 서비스를 쓸 수 없었어요. 보통 몇 분이면 나아져요.`,
    setup:
      'Pace가 실행되는 기반(내장 샌드박스나 CLI)에서 문제가 생겼어요. Pace 화면과 설정 > 샌드박스에서 무엇인지 볼 수 있어요.',
    timeout: '실행이 답변 CLI 제한 시간(설정 > 답변)보다 오래 걸렸어요.',
  },
}

export const text: Record<Locale, typeof en> = { en, ko }
