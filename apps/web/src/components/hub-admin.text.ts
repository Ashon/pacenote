import { josa } from '@src/i18n/korean'
import type { Locale } from '@src/i18n/locale'

const en = {
  title: 'Manage the hub',
  help: (team: string) =>
    `You're an admin of ${team}'s hub: who can use it, and each member's Mac. No message or answer shows here.`,
  admin: 'Admin',
  whoCanUse: 'Who can use it',
  everyone: 'Everyone',
  listed: 'Members you add',
  everyoneHelp: (team: string) =>
    `Anyone in ${team} can pair their Mac and ask Pace.`,
  listedHelp:
    'Only the members below. Anyone else who mentions Pace asks to join, and waits here for an admin.',
  requests: 'Asking to join',
  asked: (when: string) => `Asked ${when}`,
  add: 'Add',
  decline: 'Decline',
  members: (count: number) => `Members (${count})`,
  you: 'You',
  macNow: (mac: string) => `${mac} · connected`,
  macSeen: (mac: string, when: string) => `${mac} · last seen ${when}`,
  macPaired: (mac: string, when: string) => `${mac} · paired ${when}`,
  noMac: 'No Mac paired',
  addedBy: (name: string) => `added by ${name}`,
  moreFor: (name: string) => `More for ${name}`,
  makeAdmin: 'Make admin',
  unmakeAdmin: 'Remove as admin',
  fixedAdmin: 'An admin in hub.env (HUB_ADMINS)',
  disconnectMac: 'Disconnect their Mac',
  remove: 'Remove from the hub',
  removeSure: (name: string) =>
    `Remove ${name} from the hub? Their Mac is disconnected.`,
  removeConfirm: 'Remove',
  cancel: 'Cancel',
  addMember: 'Add a member',
  addMemberHelp:
    "Find someone in the workspace by name. They can pair once they're added.",
  search: 'Name',
  member: 'Member',
  nobodyFound: 'No one by that name.',
  nobodyYet: 'No one has paired yet. Share the link above with your teammates.',
  /** The hub's error codes, worded */
  errors: {
    not_yourself: 'That is your own. Change it in your own Settings.',
    set_in_hub_env:
      "hub.env sets that (HUB_ADMINS). Change it on the hub's server.",
    invalid_request: 'The hub did not take that.',
  } as Record<string, string>,
  failed: (error: string) => `The hub did not take that: ${error}`,
}

const ko: typeof en = {
  title: '허브 관리',
  help: (team) =>
    `${team} 허브의 관리자예요. 누가 쓸 수 있는지와 팀원마다의 Mac을 여기서 관리해요. 메시지와 답변은 여기에 보이지 않아요.`,
  admin: '관리자',
  whoCanUse: '쓸 수 있는 사람',
  everyone: '모두',
  listed: '추가한 팀원만',
  everyoneHelp: (team) =>
    `${team}의 누구나 자기 Mac을 페어링하고 Pace에게 물을 수 있어요.`,
  listedHelp:
    '아래 팀원만 쓸 수 있어요. 다른 사람이 Pace를 멘션하면 참여를 요청하고, 관리자가 추가할 때까지 여기서 기다려요.',
  requests: '참여 요청',
  asked: (when) => `${when} 요청`,
  add: '추가',
  decline: '거절',
  members: (count) => `팀원 (${count})`,
  you: '나',
  macNow: (mac) => `${mac} · 연결됨`,
  macSeen: (mac, when) => `${mac} · 마지막 연결 ${when}`,
  macPaired: (mac, when) => `${mac} · ${when} 페어링`,
  noMac: '페어링한 Mac 없음',
  addedBy: (name) => `${name} 님이 추가`,
  moreFor: (name) => `${name} 더 보기`,
  makeAdmin: '관리자로 지정',
  unmakeAdmin: '관리자 해제',
  fixedAdmin: 'hub.env(HUB_ADMINS)에서 정한 관리자',
  disconnectMac: 'Mac 연결 해제',
  remove: '허브에서 제거',
  removeSure: (name) =>
    `${josa(name, '을/를')} 허브에서 제거할까요? Mac 연결도 해제돼요.`,
  removeConfirm: '제거',
  cancel: '취소',
  addMember: '팀원 추가',
  addMemberHelp:
    '워크스페이스에서 이름으로 찾아요. 추가되면 그 사람이 페어링할 수 있어요.',
  search: '이름',
  member: '팀원',
  nobodyFound: '그 이름의 사람이 없어요.',
  nobodyYet: '아직 페어링한 사람이 없어요. 위의 링크를 팀원에게 공유하세요.',
  errors: {
    not_yourself: '내 계정이에요. 내 설정에서 바꾸세요.',
    set_in_hub_env:
      'hub.env(HUB_ADMINS)에서 정한 거예요. 허브 서버에서 바꾸세요.',
    invalid_request: '허브가 받아들이지 않았어요.',
  },
  failed: (error) => `허브가 받아들이지 않았어요: ${error}`,
}

export const text: Record<Locale, typeof en> = { en, ko }
