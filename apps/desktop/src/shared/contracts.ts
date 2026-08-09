export interface DesktopAppInfo {
  appVersion: string;
  electronVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  packaged: boolean;
}

export interface DesktopOpenedFile {
  id: string;
  name: string;
  path: string;
  content: string;
}

export interface DesktopSaveRequest {
  suggestedName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface DesktopSaveResult {
  canceled: boolean;
  path?: string;
}

export interface DesktopLocalGitFile {
  path: string;
  size: number;
  updatedAt: number;
}

export interface DesktopLocalGitRepository {
  id: string;
  name: string;
  root: string;
  branch: string;
  head: string;
  changedCount: number;
  remoteName: string | null;
  remoteLabel: string | null;
  upstream: string | null;
  aheadCount: number;
  behindCount: number;
  files: DesktopLocalGitFile[];
  lastOpenedAt: number;
}

export interface DesktopLocalGitState {
  activeId: string | null;
  repositories: DesktopLocalGitRepository[];
}

export type DesktopUpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloaded'
  | 'error';

export interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  message?: string;
}

export const desktopChannels = {
  appInfo: 'desktop:app-info',
  openExternal: 'desktop:open-external',
  openMarkdown: 'desktop:open-markdown',
  openedMarkdown: 'desktop:opened-markdown',
  saveOpenedMarkdown: 'desktop:save-opened-markdown',
  saveFile: 'desktop:save-file',
  localGitGet: 'desktop:local-git-get',
  localGitOpen: 'desktop:local-git-open',
  localGitSelect: 'desktop:local-git-select',
  localGitForget: 'desktop:local-git-forget',
  localGitRead: 'desktop:local-git-read',
  localGitHistory: 'desktop:local-git-history',
  localGitWrite: 'desktop:local-git-write',
  localGitCommit: 'desktop:local-git-commit',
  localGitPush: 'desktop:local-git-push',
  secureCacheGet: 'desktop:secure-cache-get',
  secureCacheSet: 'desktop:secure-cache-set',
  secureCacheRemove: 'desktop:secure-cache-remove',
  updateGetState: 'desktop:update-get-state',
  updateCheck: 'desktop:update-check',
  updateInstall: 'desktop:update-install',
  updateStateChanged: 'desktop:update-state-changed',
} as const;
