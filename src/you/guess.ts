import type { AreaView } from './types.js'

/**
 * The area a task you are adding belongs to, guessed from its words, for
 * Todo's New task. A task you add joins an area by its repository (taskArea),
 * so only areas with one are offered. An area is guessed when the words name
 * it (its name, a repository's or a channel's) or share two words with its
 * tasks; with nothing to go on, none is. Plain, so the screen can run it.
 */

/** An area a task can be added to: its id, name and repository */
export interface AreaChoice {
  id: string
  name: string
  repo: string
}

export interface AreaGuess extends AreaChoice {
  /** The word it was guessed from */
  word: string
}

const STOP = new Set(
  (
    'the and for with from into onto after before about this that these those ' +
    'what when then than our your their its are was were will can not but ' +
    'add fix make write check look update new get set use'
  ).split(' ')
)

/** A text's words that can tell areas apart */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(
      (word) =>
        // Hangul words are short; Latin ones need three letters.
        (/\p{Script=Hangul}/u.test(word)
          ? word.length >= 2
          : word.length >= 3) && !STOP.has(word)
    )
}

/** The areas a task can be added to: active ones first, then the rest */
export function areaChoices(areas: readonly AreaView[]): AreaChoice[] {
  return [...areas]
    .sort(
      (a, b) =>
        Number(b.state === 'active') - Number(a.state === 'active') ||
        (Date.parse(b.lastActiveAt ?? '') || 0) -
          (Date.parse(a.lastActiveAt ?? '') || 0)
    )
    .flatMap((area) => {
      const repo = area.parts.find((part) => part.kind === 'repo')
      // The repository as written (its id is in lower case)
      return repo ? [{ id: area.id, name: area.name, repo: repo.label }] : []
    })
}

export function guessArea(
  title: string,
  areas: readonly AreaView[]
): AreaGuess | undefined {
  const words = new Set(wordsOf(title))
  if (words.size === 0) return undefined
  let best: { guess: AreaGuess; score: number } | undefined
  for (const choice of areaChoices(areas)) {
    const area = areas.find((each) => each.id === choice.id)!
    const named = new Set(
      wordsOf([area.name, ...area.parts.map((part) => part.label)].join(' '))
    )
    const worked = new Set(
      wordsOf([...area.now, ...area.lately].map((task) => task.title).join(' '))
    )
    const byName = [...words].filter((word) => named.has(word))
    const byWork = [...words].filter(
      (word) => worked.has(word) && !named.has(word)
    )
    const score = byName.length * 2 + byWork.length
    if (score < 2) continue
    // A tie keeps the area worked in latest, as the choices are sorted
    if (!best || score > best.score)
      best = {
        guess: { ...choice, word: byName[0] ?? byWork[0]! },
        score,
      }
  }
  return best?.guess
}
