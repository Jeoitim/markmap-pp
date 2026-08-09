export interface DesktopAppInfo {
  appVersion: string;
  electronVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  packaged: boolean;
}

export interface DesktopOpenedFile {
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

export interface DesktopWorkspaceEntry {
  path: string;
  size: number;
  updatedAt: number;
}

export interface DesktopWorkspaceInfo {
  root: string | null;
  files: DesktopWorkspaceEntry[];
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
  saveFile: 'desktop:save-file',
  workspaceGet: 'desktop:workspace-get',
  workspaceSelect: 'desktop:workspace-select',
  workspaceRead: 'desktop:workspace-read',
  workspaceWrite: 'desktop:workspace-write',
  updateGetState: 'desktop:update-get-state',
  updateCheck: 'desktop:update-check',
  updateInstall: 'desktop:update-install',
  updateStateChanged: 'desktop:update-state-changed',
} as const;
