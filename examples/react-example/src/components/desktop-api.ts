export interface DesktopOpenedFile {
  name: string
  path: string
  content: string
}

export interface DesktopWorkspaceEntry {
  path: string
  size: number
  updatedAt: number
}

export interface DesktopWorkspaceInfo {
  root: string | null
  files: DesktopWorkspaceEntry[]
}

export interface MarkmapDesktopApi {
  getAppInfo(): Promise<{
    appVersion: string
    electronVersion: string
    platform: string
    arch: string
    packaged: boolean
  }>
  openExternal(url: string): Promise<boolean>
  openMarkdown(): Promise<DesktopOpenedFile | null>
  saveFile(request: { suggestedName: string; mimeType: string; bytes: Uint8Array }): Promise<{ canceled: boolean; path?: string }>
  onOpenedMarkdown(listener: (file: DesktopOpenedFile) => void): () => void
  workspace: {
    get(): Promise<DesktopWorkspaceInfo>
    select(): Promise<DesktopWorkspaceInfo | null>
    read(relativePath: string): Promise<{ path: string; content: string }>
    write(relativePath: string, content: string): Promise<{ path: string }>
  }
  updates: {
    getState(): Promise<{
      status: string
      currentVersion: string
      availableVersion?: string
      message?: string
    }>
    check(): Promise<{
      status: string
      currentVersion: string
      availableVersion?: string
      message?: string
    }>
    install(): Promise<boolean>
    onStateChanged(listener: (state: { status: string; currentVersion: string; availableVersion?: string; message?: string }) => void): () => void
  }
}

declare global {
  interface Window {
    markmapDesktop?: MarkmapDesktopApi
  }
}

export function desktopApi() {
  return window.markmapDesktop
}

export async function saveBlob(blob: Blob, suggestedName: string) {
  const desktop = desktopApi()
  if (desktop) {
    return desktop.saveFile({
      suggestedName,
      mimeType: blob.type || 'application/octet-stream',
      bytes: new Uint8Array(await blob.arrayBuffer()),
    })
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = suggestedName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return { canceled: false }
}
