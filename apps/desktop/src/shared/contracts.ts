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
  gitStatus: 'M' | 'A' | 'D' | 'R' | 'U' | '?' | null;
}

export interface DesktopLocalGitBranch {
  name: string;
  sha: string;
  current: boolean;
  remote: boolean;
  upstream: string | null;
}

export interface DesktopLocalGitCommit {
  sha: string;
  parents: string[];
  author: string;
  date: string;
  message: string;
  refs: string[];
}

export interface DesktopLocalGitGraph {
  branches: DesktopLocalGitBranch[];
  commits: DesktopLocalGitCommit[];
}

export interface DesktopLocalGitRepository {
  id: string;
  name: string;
  root: string;
  isGitRepository: boolean;
  branch: string;
  head: string;
  changedCount: number;
  markdownChangedCount: number;
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
  windowCloseRequested: 'desktop:window-close-requested',
  windowClose: 'desktop:window-close',
  localGitGet: 'desktop:local-git-get',
  localGitOpen: 'desktop:local-git-open',
  localGitSelect: 'desktop:local-git-select',
  localGitForget: 'desktop:local-git-forget',
  localGitRead: 'desktop:local-git-read',
  localGitHistory: 'desktop:local-git-history',
  localGitFileHistory: 'desktop:local-git-file-history',
  localGitReadVersion: 'desktop:local-git-read-version',
  localGitWrite: 'desktop:local-git-write',
  localGitInspect: 'desktop:local-git-inspect',
  localGitWatch: 'desktop:local-git-watch',
  localGitChanged: 'desktop:local-git-changed',
  localGitRefresh: 'desktop:local-git-refresh',
  localGitSync: 'desktop:local-git-sync',
  localGitMove: 'desktop:local-git-move',
  localGitRemove: 'desktop:local-git-remove',
  localGitDiscard: 'desktop:local-git-discard',
  localGitDiscardFile: 'desktop:local-git-discard-file',
  localGitGraph: 'desktop:local-git-graph',
  localGitSwitchBranch: 'desktop:local-git-switch-branch',
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
