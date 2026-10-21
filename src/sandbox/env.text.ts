import type { Locale } from '../i18n/locale.js'

const en = {
  /** What a broker setting's value must be, by the rule it breaks */
  rules: {
    absolutePath: 'Must be an absolute path. (~ is not expanded)',
    githubOrgs: 'Must be comma-separated GitHub org names',
    email: 'Must be an email address',
    jiraUrl: 'Must be an https URL (e.g. https://your-site.atlassian.net)',
    jiraProjects: 'Must be comma-separated Jira project keys',
    inventoryPath: 'Must be a relative path inside the inventory directory',
    inventoryInside: 'Cannot point outside the inventory directory',
    cidr: 'Must be an IPv4 CIDR (e.g. 192.168.10.0/24)',
    linuxUser: 'Must be a valid Linux user name',
    k8sContexts: 'Must be comma-separated kubeconfig context names',
    serviceAccount: 'Must be a valid ServiceAccount name',
    namespace: 'Must be a valid namespace name',
  },
}

const ko: typeof en = {
  rules: {
    absolutePath: '절대 경로여야 해요. (~는 펼쳐지지 않아요)',
    githubOrgs: '쉼표로 구분한 GitHub 조직 이름이어야 해요',
    email: '이메일 주소여야 해요',
    jiraUrl: 'https URL이어야 해요 (예: https://your-site.atlassian.net)',
    jiraProjects: '쉼표로 구분한 Jira 프로젝트 키여야 해요',
    inventoryPath: '인벤토리 디렉터리 안의 상대 경로여야 해요',
    inventoryInside: '인벤토리 디렉터리 밖을 가리킬 수 없어요',
    cidr: 'IPv4 CIDR여야 해요 (예: 192.168.10.0/24)',
    linuxUser: '올바른 Linux 사용자 이름이어야 해요',
    k8sContexts: '쉼표로 구분한 kubeconfig 컨텍스트 이름이어야 해요',
    serviceAccount: '올바른 ServiceAccount 이름이어야 해요',
    namespace: '올바른 네임스페이스 이름이어야 해요',
  },
}

export const text: Record<Locale, typeof en> = { en, ko }
