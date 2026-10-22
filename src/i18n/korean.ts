/**
 * Korean particles that change with the word before them: 을/를 after a word
 * that ends in a consonant or a vowel. Messages that put a value before a
 * particle use these, so 'Slack을' and 'Codex를' both read right.
 */
type Particle =
  | '은/는'
  | '이/가'
  | '을/를'
  | '과/와'
  | '으로/로'
  | '이나/나'
  | '이라/라'
  | '이에요/예요'

/** Hangul syllables: 가 to 힣, 28 final consonants (or none) apiece */
const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
/** ㄹ, which takes 로 rather than 으로 */
const RIEUL = 8

/** Digits as Korean reads them: 영, 일, 이, 삼 ... */
const DIGIT_FINALS: Record<string, number> = {
  '0': 21, // 영: ㅇ
  '1': RIEUL, // 일
  '2': 0, // 이
  '3': 16, // 삼: ㅁ
  '4': 0, // 사
  '5': 0, // 오
  '6': 1, // 육: ㄱ
  '7': RIEUL, // 칠
  '8': RIEUL, // 팔
  '9': 0, // 구
}

/** Letters read on their own (an acronym such as VM or URL): 엘, 엠, 엔, 알 */
const LETTER_FINALS: Record<string, number> = {
  L: RIEUL,
  M: 16,
  N: 4,
  R: RIEUL,
}

/**
 * The final consonant of a word as Korean reads it: 0 for none, RIEUL for ㄹ,
 * another number for the rest. English words are read the way Korean writes
 * them: Slack (슬랙) ends in ㄱ, Codex (코덱스) in a vowel.
 */
function finalOf(word: string): number {
  const trimmed = word.replace(/[\s'")\]}.,!?`*_]+$/u, '')
  const last = trimmed.at(-1)
  if (!last) return 0
  const code = last.charCodeAt(0)
  if (code >= HANGUL_START && code <= HANGUL_END)
    return (code - HANGUL_START) % 28
  if (last in DIGIT_FINALS) return DIGIT_FINALS[last]!
  const letters = /[A-Za-z]+$/.exec(trimmed)?.[0] ?? ''
  if (!letters) return 0
  // An acronym is read letter by letter, at the end of a word too: VM (브이엠),
  // ChatGPT (챗지피티).
  const capitals = /[A-Z]+$/.exec(letters)?.[0] ?? ''
  if (capitals.length >= 2 || (letters.length === 1 && capitals))
    return LETTER_FINALS[letters.at(-1)!] ?? 0
  const lower = letters.toLowerCase()
  if (lower.endsWith('l')) return RIEUL
  if (/(ng|ck|[kmnpt]|[^e]c)$/.test(lower)) return 1
  return 0
}

/**
 * The word with the particle that fits it: josa('Slack', '을/를') is
 * 'Slack을', josa('Codex', '을/를') is 'Codex를'.
 */
export function josa(word: string, particle: Particle): string {
  const [consonant, vowel] = particle.split('/') as [string, string]
  const final = finalOf(word)
  if (particle === '으로/로')
    return word + (final === 0 || final === RIEUL ? vowel : consonant)
  return word + (final === 0 ? vowel : consonant)
}
