import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopAppInfo, DesktopOpenedFile, DesktopSaveRequest, DesktopSaveResult, DesktopUpdateState, DesktopWorkspaceInfo } from '../shared/contracts.js'

const desktopChannels = {
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
  workspace: {
    get: () => ipcRenderer.invoke(desktopChannels.workspaceGet) as Promise<DesktopWorkspaceInfo>,
    select: () => ipcRenderer.invoke(desktopChannels.workspaceSelect) as Promise<DesktopWorkspaceInfo | null>,
    read: (relativePath: string) => ipcRenderer.invoke(desktopChannels.workspaceRead, relativePath) as Promise<{ path: string; content: string }>,
    write: (relativePath: string, content: string) => ipcRenderer.invoke(desktopChannels.workspaceWrite, relativePath, content) as Promise<{ path: string }>,
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
