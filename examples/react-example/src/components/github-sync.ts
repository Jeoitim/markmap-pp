export interface GitHubConfig {
  owner: string
  repo: string
  branch: string
  token: string
}

export interface RemoteMarkdownFile {
  path: string
  sha: string
  size: number
}

export type FileStatus = 'clean' | 'modified' | 'renamed' | 'added' | 'deleted'

export interface CachedMarkdownFile {
  id: string
  repoKey: string
  path: string
  originalPath: string
  content: string
  baseContent: string
  baseSha: string
  baseCommit: string
  status: FileStatus
  updatedAt: number
}

export interface PushResult {
  commitSha: string
  message: string
}

export interface GitHubFileCommit {
  sha: string
  message: string
  author: string
  date: string
}

export interface GitHubBranch {
  name: string
  sha: string
  protected: boolean
}

export interface GitHubRepositoryCommit {
  sha: string
  message: string
  author: string
  date: string
  parents: string[]
}

const CONFIG_KEY = 'markmap-plus-plus:github-config'
const DB_NAME = 'markmap-plus-plus-cache'
const STORE_NAME = 'markdown-files'

export function repoKeyOf(config: GitHubConfig) {
  return `${config.owner}/${config.repo}@${config.branch}`
}

export function loadGitHubConfig(): GitHubConfig | null {
  try {
    const value = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null') as GitHubConfig | null
    return value?.owner && value.repo && value.branch && value.token ? value : null
  } catch {
    return null
  }
}

export function saveGitHubConfig(config: GitHubConfig | null) {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    else localStorage.removeItem(CONFIG_KEY)
  } catch { /* storage may be disabled */ }
}

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开本地缓存'))
  })
}

async function cacheTransaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void) {
  const db = await openCacheDb()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    run(transaction.objectStore(STORE_NAME), resolve, reject)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => reject(transaction.error || new Error('本地缓存操作失败'))
  })
}

export async function listCachedFiles(repoKey: string) {
  return cacheTransaction<CachedMarkdownFile[]>('readonly', (store, resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve((request.result as CachedMarkdownFile[]).filter((file) => file.repoKey === repoKey).sort((a, b) => a.path.localeCompare(b.path)))
    request.onerror = () => reject(request.error)
  })
}

export async function putCachedFile(file: CachedMarkdownFile) {
  return cacheTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(file)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function removeCachedFile(id: string) {
  return cacheTransaction<void>('readwrite', (store, resolve, reject) => {
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function headers(config: GitHubConfig, accept = 'application/vnd.github+json') {
  return {
    Accept: accept,
    Authorization: `Bearer ${config.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

async function githubRequest<T>(config: GitHubConfig, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, { ...init, headers: { ...headers(config), ...init?.headers } })
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try { message = String((await response.json() as { message?: string }).message || message) } catch { /* response may not be JSON */ }
    if (response.status === 401) message = 'GitHub 凭据无效或已过期'
    if (response.status === 403) message = 'GitHub 拒绝访问，请确认令牌具有 Contents 读写权限'
    if (response.status === 404) message = '找不到仓库、分支或文件，请检查绑定信息与令牌权限'
    if (response.status === 409) message = '远程仓库已发生变化，请刷新后再推送'
    throw new Error(message)
  }
  return response.json() as Promise<T>
}

function repoPath(config: GitHubConfig) {
  return `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`
}

function refPath(branch: string) {
  return branch.split('/').map(encodeURIComponent).join('/')
}

export async function verifyRepository(config: GitHubConfig) {
  const repository = await githubRequest<{ default_branch: string; full_name: string }>(config, repoPath(config))
  const branch = config.branch.trim() || repository.default_branch
  await getHead({ ...config, branch })
  return { branch, fullName: repository.full_name }
}

export async function getHead(config: GitHubConfig) {
  const result = await githubRequest<{ object: { sha: string } }>(config, `${repoPath(config)}/git/ref/heads/${refPath(config.branch)}`)
  return result.object.sha
}

export async function listRemoteMarkdown(config: GitHubConfig, ref = config.branch) {
  const head = /^[0-9a-f]{40}$/i.test(ref) ? ref : await getHead({ ...config, branch: ref })
  const result = await githubRequest<{ tree: Array<{ path: string; type: string; sha: string; size?: number }>; truncated: boolean }>(config, `${repoPath(config)}/git/trees/${head}?recursive=1`)
  if (result.truncated) throw new Error('仓库文件列表过大，GitHub 返回了不完整结果')
  const files = result.tree
    .filter((item) => item.type === 'blob' && /\.md$/i.test(item.path))
    .map((item) => ({ path: item.path, sha: item.sha, size: item.size || 0 }))
    .sort((a, b) => a.path.localeCompare(b.path))
  return { head, files }
}

export async function listRepositoryBranches(config: GitHubConfig) {
  const result = await githubRequest<Array<{ name: string; commit: { sha: string }; protected: boolean }>>(config, `${repoPath(config)}/branches?per_page=100`)
  return result
    .map((branch) => ({ name: branch.name, sha: branch.commit.sha, protected: branch.protected }))
    .sort((a, b) => a.name.localeCompare(b.name)) satisfies GitHubBranch[]
}

export async function listRepositoryCommits(config: GitHubConfig, branch = config.branch) {
  const result = await githubRequest<Array<{
    sha: string
    commit: {
      message: string
      author?: { name?: string; date?: string } | null
      committer?: { name?: string; date?: string } | null
    }
    author?: { login?: string } | null
    parents?: Array<{ sha: string }>
  }>>(config, `${repoPath(config)}/commits?sha=${encodeURIComponent(branch)}&per_page=80`)
  return result.map((item) => ({
    sha: item.sha,
    message: item.commit.message,
    author: item.author?.login || item.commit.author?.name || item.commit.committer?.name || '未知作者',
    date: item.commit.author?.date || item.commit.committer?.date || '',
    parents: item.parents?.map((parent) => parent.sha) || [],
  })) satisfies GitHubRepositoryCommit[]
}

export async function listFileCommits(config: GitHubConfig, path: string) {
  const result = await githubRequest<Array<{
    sha: string
    commit: {
      message: string
      author?: { name?: string; date?: string } | null
      committer?: { name?: string; date?: string } | null
    }
    author?: { login?: string } | null
  }>>(config, `${repoPath(config)}/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(config.branch)}&per_page=50`)
  return result.map((item) => ({
    sha: item.sha,
    message: item.commit.message,
    author: item.author?.login || item.commit.author?.name || item.commit.committer?.name || '未知作者',
    date: item.commit.author?.date || item.commit.committer?.date || '',
  })) satisfies GitHubFileCommit[]
}

function decodeBase64(value: string) {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export async function downloadMarkdown(config: GitHubConfig, remote: RemoteMarkdownFile, head: string): Promise<CachedMarkdownFile> {
  const result = await githubRequest<{ content: string; encoding: string; sha: string }>(config, `${repoPath(config)}/contents/${remote.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(config.branch)}`)
  if (result.encoding !== 'base64') throw new Error('该 Markdown 文件暂不支持直接缓存')
  const content = decodeBase64(result.content)
  const repoKey = repoKeyOf(config)
  return {
    id: `${repoKey}:${remote.path}`,
    repoKey,
    path: remote.path,
    originalPath: remote.path,
    content,
    baseContent: content,
    baseSha: result.sha,
    baseCommit: head,
    status: 'clean',
    updatedAt: Date.now(),
  }
}

export async function downloadMarkdownAtCommit(config: GitHubConfig, path: string, commitSha: string) {
  const result = await githubRequest<{ content: string; encoding: string }>(config, `${repoPath(config)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(commitSha)}`)
  if (result.encoding !== 'base64') throw new Error('该历史版本暂不支持直接打开')
  return decodeBase64(result.content)
}

export function generateCommitMessage(files: CachedMarkdownFile[]) {
  if (files.length === 1) {
    const file = files[0]
    if (file.status === 'renamed') return `update: rename ${file.originalPath} to ${file.path}`
    if (file.status === 'added') return `update: add ${file.path}`
    if (file.status === 'deleted') return `update: delete ${file.path}`
    return `update: edit ${file.path}`
  }
  return `update: change ${files.map((file) => file.path).join(', ')}`
}

export async function pushCachedChanges(config: GitHubConfig, files: CachedMarkdownFile[]): Promise<PushResult> {
  const changed = files.filter((file) => file.status !== 'clean')
  if (!changed.length) throw new Error('没有需要推送的修改')
  const head = await getHead(config)
  const baseCommits = new Set(changed.map((file) => file.baseCommit))
  if (baseCommits.size !== 1 || !baseCommits.has(head)) throw new Error('远程分支在缓存后已有新提交。为避免覆盖其他设备的修改，请刷新仓库并重新下载相关文件。')

  const baseCommit = await githubRequest<{ tree: { sha: string } }>(config, `${repoPath(config)}/git/commits/${head}`)
  const entries: Array<{ path: string; mode: '100644'; type: 'blob'; content?: string; sha?: null }> = []
  for (const file of changed) {
    if (file.status === 'deleted') {
      entries.push({ path: file.originalPath, mode: '100644', type: 'blob', sha: null })
      continue
    }
    if (file.status === 'renamed' && file.originalPath !== file.path) entries.push({ path: file.originalPath, mode: '100644', type: 'blob', sha: null })
    entries.push({ path: file.path, mode: '100644', type: 'blob', content: file.content })
  }
  const tree = await githubRequest<{ sha: string }>(config, `${repoPath(config)}/git/trees`, {
    method: 'POST', body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: entries }),
  })
  const message = generateCommitMessage(changed)
  const commit = await githubRequest<{ sha: string }>(config, `${repoPath(config)}/git/commits`, {
    method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [head] }),
  })
  await githubRequest(config, `${repoPath(config)}/git/refs/heads/${refPath(config.branch)}`, {
    method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }),
  })
  return { commitSha: commit.sha, message }
}
