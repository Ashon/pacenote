import type { Locale } from '../i18n/locale.js'

const en = {
  /** Each part of the setup, and what is being done while it works */
  parts: {
    kernel: {
      label: 'Linux kernel, downloaded and checked',
      doing: 'Downloading the Linux kernel',
    },
    init: {
      label: 'Start-up files for the VMs',
      doing: 'Preparing the start-up files',
    },
    reasoner: {
      label: 'The image answers run in',
      doing: 'Building the image answers run in',
    },
    renderer: {
      label: 'The image that draws diagrams',
      doing: 'Building the image that draws diagrams',
    },
    broker: {
      label: 'The image the connections run in',
      doing: 'Building the image the connections run in',
    },
  },
}

const ko: typeof en = {
  parts: {
    kernel: {
      label: 'Linux 커널 다운로드와 확인',
      doing: 'Linux 커널 다운로드 중',
    },
    init: {
      label: 'VM 시작 파일',
      doing: '시작 파일 준비 중',
    },
    reasoner: {
      label: '답변이 실행되는 이미지',
      doing: '답변이 실행될 이미지 만드는 중',
    },
    renderer: {
      label: '다이어그램을 그리는 이미지',
      doing: '다이어그램을 그릴 이미지 만드는 중',
    },
    broker: {
      label: '연결이 실행되는 이미지',
      doing: '연결이 실행될 이미지 만드는 중',
    },
  },
}

export const text: Record<Locale, typeof en> = { en, ko }
