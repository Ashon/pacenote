import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'
import { listWords } from '@src/i18n/words'
import type { AreaRole } from '@src/you/types'

/** Who Pacenote found you as, on each */
interface Accounts {
  slack?: string
  github?: string
  git?: string
}

const ROLE_VERB: Record<AreaRole, string> = {
  build: 'build',
  review: 'review',
  answer: 'answer',
  'on-call': 'are on call',
}

const en = {
  /** A role as its chip says it */
  roles: {
    build: 'Builds',
    review: 'Reviews',
    answer: 'Answers',
    'on-call': 'On call',
  } as Record<AreaRole, string>,
  /** "You build and review" */
  roleSentence: (roles: AreaRole[]) =>
    roles.length === 0
      ? 'You work here'
      : `You ${listWords(
          roles.map((role) => ROLE_VERB[role]),
          'en'
        )}`,
  /** "ashon in Slack and Ashon on GitHub" */
  accounts: ({ slack, github, git }: Accounts) =>
    listWords(
      [
        slack !== undefined && `${slack} in Slack`,
        github && `${github} on GitHub`,
        git && `${git} in git`,
      ].filter((part): part is string => Boolean(part)),
      'en'
    ),
}

const ko: typeof en = {
  roles: {
    build: '개발',
    review: '리뷰',
    answer: '답변',
    'on-call': '온콜',
  },
  roleSentence: (roles) =>
    roles.length === 0
      ? '여기서 일해요'
      : `${josa(
          listWords(
            roles.map((role) => ko.roles[role]),
            'ko'
          ),
          '을/를'
        )} 해요`,
  accounts: ({ slack, github, git }) =>
    listWords(
      [
        slack !== undefined && `Slack의 ${slack}`,
        github && `GitHub의 ${github}`,
        git && `git의 ${git}`,
      ].filter((part): part is string => Boolean(part)),
      'ko'
    ),
}

export const text: Record<Locale, typeof en> = { en, ko }
