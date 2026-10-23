import { josa } from '../i18n/korean.js'
import type { Locale } from '../i18n/locale.js'

const en = {
  jobs: {
    kubeconfig: {
      label: 'Rebuild kubeconfig',
      help: "Builds the broker's kubeconfig from the read-only SA token. Used when Pace restarts.",
    },
    vm: {
      label: 'Set up built-in sandbox',
      help: 'Fetches the Linux kernel the first time, then builds the images in a VM: the reasoner, the diagram renderer and, with connections on, the broker. After an update, it builds the images that changed.',
    },
  },
  /**
   * Where to fix a sandbox problem, as a clause a sentence ends with: the
   * job's button, and its pnpm script for a run from the repository
   */
  jobHint: (label: string, script: string) =>
    `run "${label}" in Settings > Sandbox (pnpm ${script})`,
}

const ko: typeof en = {
  jobs: {
    kubeconfig: {
      label: 'kubeconfig 다시 만들기',
      help: '읽기 전용 SA 토큰으로 브로커의 kubeconfig를 만들어요. Pace를 다시 시작하면 적용돼요.',
    },
    vm: {
      label: '내장 샌드박스 준비',
      help: '처음에는 Linux 커널을 받아 온 다음, VM에서 답변 CLI, 다이어그램 렌더러, 그리고 연결을 쓰면 브로커의 이미지를 만들어요. 업데이트한 뒤에는 바뀐 이미지만 다시 만들어요.',
    },
  },
  jobHint: (label, script) =>
    `설정 > 샌드박스에서 ${josa(`"${label}"`, '을/를')} 실행하세요 (pnpm ${script})`,
}

export const text: Record<Locale, typeof en> = { en, ko }
