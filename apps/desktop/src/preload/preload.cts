import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAppInfo, DesktopLocalGitRepository, DesktopLocalGitState, DesktopOpenedFile, DesktopSaveRequest, DesktopSaveResult, DesktopUpdateState } from '../shared/contracts.js'

const desktopChannels = {
  appInfo: 'desktop:app-info',
  openExternal: 'desktop:open-external',
  openMarkdown: 'desktop:open-markdown',
  openedMarkdown: 'desktop:opened-markdown',
  saveFile: 'desktop:save-file',
  localGitGet: 'desktop:local-git-get',
  localGitOpen: 'desktop:local-git-open',
  localGitSelect: 'desktop:local-git-select',
  localGitForget: 'desktop:local-git-forget',
  localGitRead: 'desktop:local-git-read',
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
} as const

const api = {
  getAppInfo: () => ipcRenderer.invoke(desktopChannels.appInfo) as Promise<DesktopAppInfo>,
  openExternal: (url: string) => ipcRenderer.invoke(desktopChannels.openExternal, url) as Promise<boolean>,
  openMarkdown: () => ipcRenderer.invoke(desktopChannels.openMarkdown) as Promise<DesktopOpenedFile | null>,
  saveFile: (request: DesktopSaveRequest) => ipcRenderer.invoke(desktopChannels.saveFile, request) as Promise<DesktopSaveResult>,
  onOpenedMarkdown: (listener: (file: DesktopOpenedFile) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, file: DesktopOpenedFile) => listener(file)
    ipcRenderer.on(desktopChannels.openedMarkdown, handler)
    return () => ipcRenderer.removeListener(desktopChannels.openedMarkdown, handler)
  },
  localGit: {
    get: () => ipcRenderer.invoke(desktopChannels.localGitGet) as Promise<DesktopLocalGitState>,
    open: () => ipcRenderer.invoke(desktopChannels.localGitOpen) as Promise<DesktopLocalGitState | null>,
    select: (id: string) => ipcRenderer.invoke(desktopChannels.localGitSelect, id) as Promise<DesktopLocalGitState>,
    forget: (id: string) => ipcRenderer.invoke(desktopChannels.localGitForget, id) as Promise<DesktopLocalGitState>,
    read: (id: string, relativePath: string) => ipcRenderer.invoke(desktopChannels.localGitRead, id, relativePath) as Promise<{ path: string; content: string }>,
    write: (id: string, relativePath: string, content: string) => ipcRenderer.invoke(desktopChannels.localGitWrite, id, relativePath, content) as Promise<{ path: string; repository: DesktopLocalGitRepository }>,
    commit: (id: string, message: string) => ipcRenderer.invoke(desktopChannels.localGitCommit, id, message) as Promise<DesktopLocalGitRepository>,
    push: (id: string) => ipcRenderer.invoke(desktopChannels.localGitPush, id) as Promise<DesktopLocalGitRepository>,
  },
  secureCache: {
    get: (key: string) => ipcRenderer.invoke(desktopChannels.secureCacheGet, key) as Promise<string | null>,
    set: (key: string, value: string) => ipcRenderer.invoke(desktopChannels.secureCacheSet, key, value) as Promise<void>,
    remove: (key: string) => ipcRenderer.invoke(desktopChannels.secureCacheRemove, key) as Promise<void>,
  },
  updates: {
    getState: () => ipcRenderer.invoke(desktopChannels.updateGetState) as Promise<DesktopUpdateState>,
    check: () => ipcRenderer.invoke(desktopChannels.updateCheck) as Promise<DesktopUpdateState>,
    install: () => ipcRenderer.invoke(desktopChannels.updateInstall) as Promise<boolean>,
    onStateChanged: (listener: (state: DesktopUpdateState) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: DesktopUpdateState) => listener(state)
      ipcRenderer.on(desktopChannels.updateStateChanged, handler)
      return () => ipcRenderer.removeListener(desktopChannels.updateStateChanged, handler)
    },
  },
}

contextBridge.exposeInMainWorld('markmapDesktop', api)
