import { josa } from '../i18n/korean.js'
import type { Locale } from '../i18n/locale.js'
import { listWords } from '../i18n/words.js'

/** The images by their name in vm-images.ts */
const IMAGES_EN: Record<string, string> = {
  reasoner: 'the reasoner image',
  renderer: 'the diagram renderer image',
  broker: 'the ops broker image',
}

const IMAGES_KO: Record<string, string> = {
  reasoner: '답변 CLI 이미지',
  renderer: '다이어그램 렌더러 이미지',
  broker: '운영 브로커 이미지',
}

const en = {
  unsupported:
    'The built-in sandbox needs a Mac with Apple silicon and macOS 15 or later.',
  /** hint: jobHint's clause, which ends the sentence */
  noAllowlist: (file: string, hint: string) =>
    `The allowed domains list is missing (${file}): ${hint}.`,
  vmDidNotStart: (reason: string) => `A VM did not start: ${reason}`,
  opsTools: (problem: string) => `Ops tools: ${problem}`,
  helperVersion: (helper: number | undefined, pacenote: number) =>
    `pacenote-vm speaks version ${helper}, Pacenote ${pacenote}.`,
  helperFailed: 'pacenote-vm failed.',
  /** An image by its name, or other words as they are */
  image: (name: string) => IMAGES_EN[name] ?? name,
  kernel: 'the Linux kernel',
  initfs: 'the init filesystem',
  lacks: (parts: string[], hint: string) =>
    `The built-in sandbox lacks ${parts.join(', ')}: ${hint}.`,
  outdated: (images: string[], hint: string) => {
    const list = listWords(images, 'en')
    const one = images.length === 1
    return `${list[0]!.toUpperCase()}${list.slice(1)} ${one ? 'was' : 'were'} built for another version of Pacenote: ${hint} to update ${one ? 'it' : 'them'}.`
  },
}

const ko: typeof en = {
  unsupported:
    '내장 샌드박스에는 Apple silicon과 macOS 15 이상을 쓰는 Mac이 필요해요.',
  noAllowlist: (file, hint) => `허용 도메인 목록이 없어요 (${file}). ${hint}.`,
  vmDidNotStart: (reason) => `VM이 시작되지 않았어요: ${reason}`,
  opsTools: (problem) => `운영 도구: ${problem}`,
  helperVersion: (helper, pacenote) =>
    `pacenote-vm의 버전(${helper})이 Pacenote(${pacenote})와 맞지 않아요.`,
  helperFailed: 'pacenote-vm이 실패했어요.',
  image: (name) => IMAGES_KO[name] ?? name,
  kernel: 'Linux 커널',
  initfs: 'init 파일 시스템',
  lacks: (parts, hint) =>
    `내장 샌드박스에 ${josa(listWords(parts, 'ko'), '이/가')} 없어요. ${hint}.`,
  outdated: (images, hint) =>
    `${josa(listWords(images, 'ko'), '은/는')} 다른 버전의 Pacenote에서 만든 이미지예요. 업데이트하려면 ${hint}.`,
}

export const text: Record<Locale, typeof en> = { en, ko }
