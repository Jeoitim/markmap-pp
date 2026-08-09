export interface DesktopOpenedFile {
  id: string
  name: string
  path: string
  content: string
}

export interface DesktopLocalGitFile {
  path: string
  size: number
  updatedAt: number
  gitStatus: 'M' | 'A' | 'D' | 'R' | 'U' | '?' | null
}

export interface DesktopLocalGitBranch {
  name: string
  sha: string
  current: boolean
  remote: boolean
  upstream: string | null
}

export interface DesktopLocalGitCommit {
  sha: string
  parents: string[]
  author: string
  date: string
  message: string
  refs: string[]
}

export interface DesktopLocalGitGraph {
  branches: DesktopLocalGitBranch[]
  commits: DesktopLocalGitCommit[]
}

export interface DesktopLocalGitRepository {
  id: string
  name: string
  root: string
  isGitRepository: boolean
  branch: string
  head: string
  changedCount: number
  markdownChangedCount: number
  remoteName: string | null
  remoteLabel: string | null
  upstream: string | null
  aheadCount: number
  behindCount: number
  files: DesktopLocalGitFile[]
  lastOpenedAt: number
}

export interface DesktopLocalGitState {
  activeId: string | null
  repositories: DesktopLocalGitRepository[]
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
  saveOpenedMarkdown(id: string, content: string): Promise<DesktopOpenedFile>
  saveFile(request: { suggestedName: string; mimeType: string; bytes: Uint8Array }): Promise<{ canceled: boolean; path?: string }>
  onOpenedMarkdown(listener: (file: DesktopOpenedFile) => void): () => void
  localGit: {
    get(): Promise<DesktopLocalGitState>
    open(): Promise<DesktopLocalGitState | null>
    select(id: string): Promise<DesktopLocalGitState>
    forget(id: string): Promise<DesktopLocalGitState>
    read(id: string, relativePath: string): Promise<{ path: string; content: string }>
    history(id: string, relativePaths: string[]): Promise<string>
    fileHistory(id: string, relativePath: string): Promise<DesktopLocalGitCommit[]>
    readVersion(id: string, relativePath: string, commitSha: string): Promise<{ path: string; commitSha: string; content: string }>
    write(id: string, relativePath: string, content: string): Promise<{ path: string; repository: DesktopLocalGitRepository }>
    inspect(id: string): Promise<DesktopLocalGitRepository>
    watch(id: string | null): Promise<boolean>
    onChanged(listener: (id: string) => void): () => void
    refresh(id: string): Promise<DesktopLocalGitRepository>
    sync(id: string): Promise<DesktopLocalGitRepository>
    move(id: string, sourcePath: string, destinationPath: string, kind: 'file' | 'folder'): Promise<DesktopLocalGitRepository>
    remove(id: string, relativePath: string, kind: 'file' | 'folder'): Promise<DesktopLocalGitRepository>
    discard(id: string): Promise<DesktopLocalGitRepository>
    graph(id: string): Promise<DesktopLocalGitGraph>
    switchBranch(id: string, branch: string): Promise<DesktopLocalGitRepository>
    commit(id: string, message: string): Promise<DesktopLocalGitRepository>
    push(id: string): Promise<DesktopLocalGitRepository>
  }
  secureCache: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    remove(key: string): Promise<void>
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
