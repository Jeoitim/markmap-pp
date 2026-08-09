import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { watch as watchFileSystem } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dialog, type BrowserWindow } from 'electron';
import type {
  DesktopLocalGitBranch,
  DesktopLocalGitCommit,
  DesktopLocalGitFile,
  DesktopLocalGitGraph,
  DesktopLocalGitRepository,
  DesktopLocalGitState,
} from '../shared/contracts.js';
import { getSecureValue, setSecureValue } from './secure-store.js';

const repositoryStoreKey = 'local-git-repositories';
const markdownExtension = /\.(md|markdown)$/i;
const maxRepositoryFiles = 10_000;
const maxMarkdownBytes = 20 * 1024 * 1024;

interface StoredRepository {
  id: string;
  root: string;
  lastOpenedAt: number;
}

interface StoredRepositoryState {
  activeId: string | null;
  repositories: StoredRepository[];
}

function runGit(root: string, args: string[], nonInteractive = false, preserveOutput = false) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      'git',
      ['-C', root, ...args],
      {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        env: nonInteractive
          ? {
              ...process.env,
              GIT_TERMINAL_PROMPT: '0',
              GCM_INTERACTIVE: 'Never',
            }
          : process.env,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        // Git porcelain output intentionally starts with a space for unstaged
        // changes. Trimming the whole string corrupts the first status entry.
        resolve(preserveOutput ? stdout : stdout.replace(/(?:\r?\n)+$/, ''));
      },
    );
  });
}

function safeRemoteLabel(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`.replace(/\.git$/, '');
  } catch {
    return value
      .replace(/^[^@\s]+@/, '')
      .replace(':', '/')
      .replace(/\.git$/, '');
  }
}

function repositoryId(root: string) {
  const normalized = process.platform === 'win32' ? root.toLowerCase() : root;
  return createHash('sha256').update(normalized).digest('hex').slice(0, 24);
}

async function readRepositoryState(): Promise<StoredRepositoryState> {
  const stored = await getSecureValue(repositoryStoreKey);
  if (!stored) return { activeId: null, repositories: [] };
  try {
    const value = JSON.parse(stored) as StoredRepositoryState;
    return {
      activeId: typeof value.activeId === 'string' ? value.activeId : null,
      repositories: Array.isArray(value.repositories)
        ? value.repositories
            .filter(
              (item) =>
                typeof item?.id === 'string' &&
                typeof item.root === 'string' &&
                typeof item.lastOpenedAt === 'number',
            )
            .slice(0, 20)
        : [],
    };
  } catch {
    return { activeId: null, repositories: [] };
  }
}

async function writeRepositoryState(state: StoredRepositoryState) {
  await setSecureValue(repositoryStoreKey, JSON.stringify(state));
}

function safeRelativeMarkdownPath(value: string) {
  const normalized = value.replaceAll('\\', '/').replace(/^\/+/, '');
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').some((part) => part === '..') ||
    !markdownExtension.test(normalized)
  )
    throw new Error('仅允许访问仓库内的 Markdown 文件');
  return normalized;
}

function safeRelativeWorkspacePath(value: string, kind: 'file' | 'folder') {
  const normalized = value.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..' || part === '.git') ||
    (kind === 'file' && !markdownExtension.test(normalized))
  ) throw new Error(kind === 'file' ? '仅允许操作工作区内的 Markdown 文件' : '文件夹路径无效');
  return normalized;
}

function gitStatusCode(value: string): DesktopLocalGitFile['gitStatus'] {
  if (value === '??') return '?';
  if (/U|AA|DD/.test(value)) return 'U';
  if (/R|C/.test(value)) return 'R';
  if (value.includes('A')) return 'A';
  if (value.includes('D')) return 'D';
  return 'M';
}

async function listMarkdownGitStatus(root: string) {
  const output = await runGit(root, [
    '-c',
    'core.quotepath=false',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  const statuses = new Map<string, DesktopLocalGitFile['gitStatus']>();
  const records = output.split('\0').filter(Boolean);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const code = record.slice(0, 2);
    const relative = record.slice(3).replaceAll('\\', '/');
    if (markdownExtension.test(relative)) statuses.set(relative, gitStatusCode(code));
    // In -z mode a rename/copy is followed by its original path as a second
    // NUL-delimited field. The first field is the current path shown in the tree.
    if (/R|C/.test(code)) index += 1;
  }
  return statuses;
}

async function listChangedMarkdownPaths(root: string) {
  return Array.from((await listMarkdownGitStatus(root)).keys());
}

async function listMarkdownFiles(root: string, gitStatuses = new Map<string, DesktopLocalGitFile['gitStatus']>()) {
  const files: DesktopLocalGitFile[] = [];
  const seen = new Set<string>();
  const visit = async (directory: string, relativeDirectory: string) => {
    if (files.length >= maxRepositoryFiles) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (
        files.length >= maxRepositoryFiles ||
        entry.isSymbolicLink() ||
        entry.name === '.git'
      )
        continue;
      const relative = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, relative);
      else if (entry.isFile() && markdownExtension.test(entry.name)) {
        const stat = await fs.stat(absolute);
        const normalized = relative.replaceAll('\\', '/');
        seen.add(normalized);
        files.push({
          path: normalized,
          size: stat.size,
          updatedAt: stat.mtimeMs,
          gitStatus: gitStatuses.get(normalized) || null,
        });
      }
    }
  };
  await visit(root, '');
  for (const [relative, gitStatus] of gitStatuses) {
    if (!seen.has(relative)) files.push({ path: relative, size: 0, updatedAt: 0, gitStatus });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function inspectRepository(
  root: string,
): Promise<DesktopLocalGitRepository> {
  const realRoot = await fs.realpath(root);
  const gitRoot = await runGit(realRoot, ['rev-parse', '--show-toplevel'])
    .then((value) => fs.realpath(value))
    .catch(() => null);
  if (!gitRoot) {
    return {
      id: repositoryId(realRoot),
      name: path.basename(realRoot),
      root: realRoot,
      isGitRepository: false,
      branch: '',
      head: '',
      changedCount: 0,
      markdownChangedCount: 0,
      remoteName: null,
      remoteLabel: null,
      upstream: null,
      aheadCount: 0,
      behindCount: 0,
      files: await listMarkdownFiles(realRoot),
      lastOpenedAt: Date.now(),
    };
  }
  const branch = (await runGit(gitRoot, ['branch', '--show-current'])) || 'HEAD';
  const head = await runGit(gitRoot, ['rev-parse', '--short', 'HEAD']).catch(
    () => '',
  );
  const status = await runGit(gitRoot, [
    'status',
    '--short',
    '--untracked-files=all',
  ]);
  const markdownGitStatuses = await listMarkdownGitStatus(gitRoot);
  const remoteNames = (await runGit(gitRoot, ['remote']))
    .split(/\r?\n/)
    .filter(Boolean);
  const remoteName = remoteNames.includes('origin')
    ? 'origin'
    : remoteNames[0] ?? null;
  const remoteUrl = remoteName
    ? await runGit(gitRoot, ['remote', 'get-url', remoteName]).catch(() => '')
    : '';
  const upstream = await runGit(gitRoot, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]).catch(() => '');
  const remoteBranch = remoteName && branch !== 'HEAD'
    ? `${remoteName}/${branch}`
    : '';
  const comparisonRef = upstream || (remoteBranch
    ? await runGit(gitRoot, ['rev-parse', '--verify', remoteBranch]).then(() => remoteBranch).catch(() => '')
    : '');
  const divergence = comparisonRef
    ? await runGit(gitRoot, [
        'rev-list',
        '--left-right',
        '--count',
        `HEAD...${comparisonRef}`,
      ]).catch(() => '')
    : '';
  const [aheadText = '0', behindText = '0'] = divergence.split(/\s+/);
  return {
    id: repositoryId(gitRoot),
    name: path.basename(gitRoot),
    root: gitRoot,
    isGitRepository: true,
    branch,
    head,
    changedCount: status ? status.split(/\r?\n/).filter(Boolean).length : 0,
    markdownChangedCount: markdownGitStatuses.size,
    remoteName,
    remoteLabel: remoteUrl ? safeRemoteLabel(remoteUrl) : null,
    upstream: upstream || null,
    aheadCount: Number.parseInt(aheadText, 10) || 0,
    behindCount: Number.parseInt(behindText, 10) || 0,
    files: await listMarkdownFiles(gitRoot, markdownGitStatuses),
    lastOpenedAt: Date.now(),
  };
}

export async function inspectLocalGitRepository(id: string) {
  return resolveStoredRepository(id).then((value) => value.repository);
}

export async function watchLocalGitRepository(
  id: string,
  onChange: (repositoryId: string) => void,
) {
  const { repository } = await resolveStoredRepository(id);
  let timer: NodeJS.Timeout | null = null;
  const watcher = watchFileSystem(repository.root, { recursive: true }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => onChange(id), 180);
  });
  return () => {
    if (timer) clearTimeout(timer);
    watcher.close();
  };
}

async function resolveStoredRepository(id: string) {
  const state = await readRepositoryState();
  const stored = state.repositories.find((item) => item.id === id);
  if (!stored) throw new Error('本地 Git 仓库记录不存在');
  return { state, stored, repository: await inspectRepository(stored.root) };
}

async function resolveRepositoryFile(
  repositoryIdValue: string,
  relativePath: string,
  allowMissing = false,
) {
  const { repository } = await resolveStoredRepository(repositoryIdValue);
  const relative = safeRelativeMarkdownPath(relativePath);
  const target = path.resolve(repository.root, ...relative.split('/'));
  const prefix = `${repository.root}${path.sep}`;
  if (!target.startsWith(prefix)) throw new Error('文件路径超出 Git 仓库范围');
  if (allowMissing) {
    const parent = await fs.realpath(path.dirname(target));
    if (parent !== repository.root && !parent.startsWith(prefix))
      throw new Error('文件路径超出 Git 仓库范围');
  } else {
    const realTarget = await fs.realpath(target);
    if (!realTarget.startsWith(prefix))
      throw new Error('文件路径超出 Git 仓库范围');
  }
  return { repository, relative, target };
}

async function resolveWorkspaceTarget(
  id: string,
  relativePath: string,
  kind: 'file' | 'folder',
  allowMissing = false,
) {
  const { repository } = await resolveStoredRepository(id);
  const relative = safeRelativeWorkspacePath(relativePath, kind);
  const target = path.resolve(repository.root, ...relative.split('/'));
  const prefix = `${repository.root}${path.sep}`;
  if (!target.startsWith(prefix)) throw new Error('目标路径超出本地工作区范围');
  if (allowMissing) {
    const parent = await fs.realpath(path.dirname(target));
    if (parent !== repository.root && !parent.startsWith(prefix))
      throw new Error('目标路径超出本地工作区范围');
  } else {
    const realTarget = await fs.realpath(target);
    if (!realTarget.startsWith(prefix)) throw new Error('目标路径超出本地工作区范围');
  }
  return { repository, relative, target };
}

async function assertManagedDirectory(directory: string) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error('包含符号链接的文件夹不能在应用内移动或删除');
    if (entry.name === '.git') throw new Error('不能移动或删除 Git 元数据目录');
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) await assertManagedDirectory(child);
    else if (!entry.isFile() || !markdownExtension.test(entry.name))
      throw new Error('文件夹包含未显示的非 Markdown 文件，请使用系统文件管理器操作');
  }
}

export async function getLocalGitState(): Promise<DesktopLocalGitState> {
  const state = await readRepositoryState();
  const repositories = (
    await Promise.all(
      state.repositories.map(async (stored) => {
        try {
          return {
            ...(await inspectRepository(stored.root)),
            lastOpenedAt: stored.lastOpenedAt,
          };
        } catch {
          return null;
        }
      }),
    )
  ).filter((item): item is DesktopLocalGitRepository => Boolean(item));
  const activeId = repositories.some((item) => item.id === state.activeId)
    ? state.activeId
    : repositories[0]?.id ?? null;
  return { activeId, repositories };
}

export async function openLocalGitRepository(window: BrowserWindow) {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openDirectory'],
    title: '打开本地文件夹',
    buttonLabel: '打开文件夹',
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const repository = await inspectRepository(result.filePaths[0]);
  const state = await readRepositoryState();
  const stored = {
    id: repository.id,
    root: repository.root,
    lastOpenedAt: Date.now(),
  };
  await writeRepositoryState({
    activeId: repository.id,
    repositories: [
      stored,
      ...state.repositories.filter((item) => item.id !== repository.id),
    ].slice(0, 20),
  });
  return getLocalGitState();
}

export async function selectLocalGitRepository(id: string) {
  const state = await readRepositoryState();
  if (!state.repositories.some((item) => item.id === id))
    throw new Error('本地 Git 仓库记录不存在');
  await writeRepositoryState({ ...state, activeId: id });
  return getLocalGitState();
}

export async function forgetLocalGitRepository(id: string) {
  const state = await readRepositoryState();
  const repositories = state.repositories.filter((item) => item.id !== id);
  await writeRepositoryState({
    activeId: state.activeId === id ? repositories[0]?.id ?? null : state.activeId,
    repositories,
  });
  return getLocalGitState();
}

export async function readLocalGitMarkdown(id: string, relativePath: string) {
  const { relative, target } = await resolveRepositoryFile(id, relativePath);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error('目标不是文件');
  if (stat.size > maxMarkdownBytes)
    throw new Error('Markdown 文件不能超过 20 MB');
  return { path: relative, content: await fs.readFile(target, 'utf8') };
}

export async function readLocalGitHistory(id: string, relativePaths: string[]) {
  const { repository } = await resolveStoredRepository(id);
  if (!repository.isGitRepository)
    throw new Error('当前文件夹不是 Git 仓库，无法查看历史提交记录');
  const paths = relativePaths.slice(0, 20).map(safeRelativeMarkdownPath);
  return runGit(repository.root, [
    'log',
    '--max-count=12',
    '--date=short',
    '--pretty=format:%h | %an | %ad | %s',
    ...(paths.length ? ['--', ...paths] : []),
  ]).catch(() => '');
}

export async function readLocalGitFileHistory(id: string, relativePath: string) {
  const { repository } = await resolveStoredRepository(id);
  if (!repository.isGitRepository)
    throw new Error('当前文件夹不是 Git 仓库，无法查看文件历史');
  const relative = safeRelativeMarkdownPath(relativePath);
  const output = await runGit(repository.root, [
    'log',
    '--max-count=50',
    '--date=iso-strict',
    '--pretty=format:%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s',
    '--',
    relative,
  ]).catch(() => '');
  return output.split(/\r?\n/).filter(Boolean).map((line): DesktopLocalGitCommit => {
    const [sha = '', parents = '', author = '', date = '', decorations = '', message = ''] = line.split('\x1f');
    return {
      sha,
      parents: parents.split(' ').filter(Boolean),
      author,
      date,
      message,
      refs: decorations.split(',').map((value) => value.trim().replace(/^HEAD -> /, '')).filter(Boolean),
    };
  });
}

export async function readLocalGitMarkdownVersion(
  id: string,
  relativePath: string,
  commitSha: string,
) {
  const { repository } = await resolveStoredRepository(id);
  if (!repository.isGitRepository)
    throw new Error('当前文件夹不是 Git 仓库，无法读取历史版本');
  const relative = safeRelativeMarkdownPath(relativePath);
  if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) throw new Error('提交标识无效');
  const content = await runGit(repository.root, ['show', `${commitSha}:${relative}`], false, true)
    .catch(() => { throw new Error('该提交中找不到此文件，文件可能在更早版本使用了其他名称'); });
  return { path: relative, commitSha, content };
}

export async function writeLocalGitMarkdown(
  id: string,
  relativePath: string,
  content: string,
) {
  if (Buffer.byteLength(content, 'utf8') > maxMarkdownBytes)
    throw new Error('Markdown 文件不能超过 20 MB');
  const { relative, target } = await resolveRepositoryFile(
    id,
    relativePath,
    true,
  );
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) throw new Error('不允许写入符号链接');
    if (!stat.isFile()) throw new Error('目标不是文件');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  await fs.writeFile(target, content, 'utf8');
  return { path: relative, repository: await resolveStoredRepository(id).then((value) => value.repository) };
}

export async function moveLocalWorkspaceTarget(
  id: string,
  sourcePath: string,
  destinationPath: string,
  kind: 'file' | 'folder',
) {
  const source = await resolveWorkspaceTarget(id, sourcePath, kind);
  const destination = await resolveWorkspaceTarget(id, destinationPath, kind, true);
  if (source.repository.id !== destination.repository.id)
    throw new Error('不能跨本地工作区移动文件');
  if (kind === 'folder') {
    if (destination.relative.startsWith(`${source.relative}/`))
      throw new Error('不能把文件夹移动到自身内部');
    await assertManagedDirectory(source.target);
  }
  await fs.access(destination.target).then(
    () => { throw new Error('目标位置已存在同名文件或文件夹'); },
    () => undefined,
  );
  await fs.rename(source.target, destination.target);
  return inspectRepository(source.repository.root);
}

export async function removeLocalWorkspaceTarget(
  id: string,
  relativePath: string,
  kind: 'file' | 'folder',
) {
  const resolved = await resolveWorkspaceTarget(id, relativePath, kind);
  const stat = await fs.lstat(resolved.target);
  if (stat.isSymbolicLink()) throw new Error('不允许删除符号链接');
  if (kind === 'file' && !stat.isFile()) throw new Error('目标不是 Markdown 文件');
  if (kind === 'folder') {
    if (!stat.isDirectory()) throw new Error('目标不是文件夹');
    await assertManagedDirectory(resolved.target);
  }
  await fs.rm(resolved.target, { recursive: kind === 'folder', force: false });
  return inspectRepository(resolved.repository.root);
}

export async function discardLocalGitChanges(id: string) {
  const { repository } = await resolveStoredRepository(id);
  if (!repository.isGitRepository) throw new Error('当前文件夹不是 Git 仓库，无法放弃版本修改');
  if (!repository.head) throw new Error('仓库还没有提交记录，不能恢复到上一版本');
  const untracked = await runGit(repository.root, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    '*.md',
    '*.markdown',
  ]);
  await runGit(repository.root, [
    'restore',
    '--source=HEAD',
    '--staged',
    '--worktree',
    '--',
    '*.md',
    '*.markdown',
  ]);
  for (const relativePath of untracked.split(/\r?\n/).filter(Boolean)) {
    const resolved = await resolveRepositoryFile(id, relativePath);
    const stat = await fs.lstat(resolved.target);
    if (stat.isFile() && !stat.isSymbolicLink()) await fs.rm(resolved.target);
  }
  return inspectRepository(repository.root);
}

export async function discardLocalGitFile(id: string, relativePath: string) {
  const resolved = await resolveRepositoryFile(id, relativePath, true);
  const { repository, relative, target } = resolved;
  if (!repository.isGitRepository)
    throw new Error('当前文件夹不是 Git 仓库，无法放弃版本修改');
  const existsInHead = repository.head
    ? await runGit(repository.root, ['cat-file', '-e', `HEAD:${relative}`]).then(() => true).catch(() => false)
    : false;
  if (existsInHead) {
    await runGit(repository.root, [
      'restore',
      '--source=HEAD',
      '--staged',
      '--worktree',
      '--',
      relative,
    ]);
  } else {
    await runGit(repository.root, ['rm', '--cached', '--ignore-unmatch', '--', relative]).catch(() => '');
    await fs.lstat(target).then(async (stat) => {
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('仅允许移除未跟踪的 Markdown 文件');
      await fs.rm(target);
    }).catch((error) => {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    });
  }
  return inspectRepository(repository.root);
}

export async function readLocalGitGraph(id: string): Promise<DesktopLocalGitGraph> {
  let { repository } = await resolveStoredRepository(id);
  if (!repository.isGitRepository) throw new Error('当前文件夹不是 Git 仓库，无法查看提交图');
  if (repository.remoteName) repository = await refreshLocalGitRepository(id).catch(() => repository);
  const [branchOutput, commitOutput] = await Promise.all([
    runGit(repository.root, [
      'for-each-ref',
      '--format=%(refname:short)%09%(objectname:short)%09%(upstream:short)%09%(HEAD)',
      'refs/heads',
      'refs/remotes',
    ]),
    runGit(repository.root, [
      'log',
      '--all',
      '--max-count=100',
      '--date=iso-strict',
      '--pretty=format:%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s',
    ]).catch(() => ''),
  ]);
  const branches: DesktopLocalGitBranch[] = branchOutput.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name = '', sha = '', upstream = '', marker = ''] = line.split('\t');
    return {
      name,
      sha,
      current: marker.trim() === '*',
      remote: name.startsWith(`${repository.remoteName || 'origin'}/`),
      upstream: upstream || null,
    };
  }).filter((branch) => branch.name && !branch.name.endsWith('/HEAD'));
  const commits: DesktopLocalGitCommit[] = commitOutput.split(/\r?\n/).filter(Boolean).map((line) => {
    const [sha = '', parents = '', author = '', date = '', decorations = '', message = ''] = line.split('\x1f');
    return {
      sha,
      parents: parents.split(' ').filter(Boolean),
      author,
      date,
      message,
      refs: decorations.split(',').map((value) => value.trim().replace(/^HEAD -> /, '')).filter(Boolean),
    };
  });
  return { branches, commits };
}

export async function switchLocalGitBranch(id: string, requestedBranch: string) {
  const { repository } = await resolveStoredRepository(id);
  if (!repository.isGitRepository) throw new Error('当前文件夹不是 Git 仓库，无法切换分支');
  if (repository.changedCount) throw new Error('切换分支前请先提交或放弃当前工作区修改');
  const graph = await readLocalGitGraph(id);
  const selected = graph.branches.find((branch) => branch.name === requestedBranch);
  if (!selected) throw new Error('所选分支不存在或已失效');
  if (selected.remote) {
    const localName = selected.name.slice(selected.name.indexOf('/') + 1);
    const local = graph.branches.find((branch) => !branch.remote && branch.name === localName);
    if (local) await runGit(repository.root, ['switch', local.name]);
    else await runGit(repository.root, ['switch', '--track', '-c', localName, selected.name]);
  } else await runGit(repository.root, ['switch', selected.name]);
  return inspectRepository(repository.root);
}

export async function refreshLocalGitRepository(id: string) {
  const { repository } = await resolveStoredRepository(id);
  if (!repository.isGitRepository) return repository;
  if (!repository.remoteName) return repository;
  try {
    await runGit(repository.root, ['fetch', '--prune', repository.remoteName], true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/authentication|permission denied|could not read username|terminal prompts disabled/i.test(message))
      throw new Error('Git 凭据不可用，请先在系统 Git 凭据管理器或 SSH Agent 中完成登录');
    throw new Error(`检查远端更新失败：${message}`);
  }
  return inspectRepository(repository.root);
}

export async function syncLocalGitRepository(id: string) {
  const repository = await refreshLocalGitRepository(id);
  if (!repository.isGitRepository)
    throw new Error('当前文件夹不是 Git 仓库，无法同步版本记录');
  if (!repository.remoteName)
    throw new Error('当前本地仓库没有配置远程地址，无法同步');
  if (repository.branch === 'HEAD')
    throw new Error('当前处于 detached HEAD，无法同步远程分支');
  if (!repository.behindCount) return repository;
  try {
    await runGit(repository.root, [
      'pull',
      '--rebase',
      '--autostash',
      repository.remoteName,
      repository.branch,
    ], true);
  } catch (error) {
    await runGit(repository.root, ['rebase', '--abort']).catch(() => '');
    const message = error instanceof Error ? error.message : String(error);
    if (/conflict|could not apply|patch failed/i.test(message))
      throw new Error('同步产生冲突，已停止自动同步；请使用专业 Git 工具检查并解决冲突');
    throw new Error(`同步远端更新失败：${message}`);
  }
  return inspectRepository(repository.root);
}

export async function commitLocalGitMarkdown(id: string, message: string) {
  const trimmed = message.trim();
  if (trimmed.length > 160) throw new Error('提交说明不能超过 160 字');
  const repository = await refreshLocalGitRepository(id);
  if (!repository.isGitRepository)
    throw new Error('当前文件夹不是 Git 仓库，无法创建提交');
  if (repository.behindCount)
    throw new Error(`远端领先 ${repository.behindCount} 个提交，请先同步远端更新再提交`);
  const paths = await listChangedMarkdownPaths(repository.root);
  if (!paths.length) throw new Error('仓库中没有可提交的 Markdown 变更');
  if (paths.length > 300)
    throw new Error('Markdown 变更超过 300 个，请先使用专业 Git 工具分批提交');
  const commitMessage = (trimmed || (paths.length === 1
    ? `docs: update ${paths[0]}`
    : `docs: update ${paths.length} markdown files`)).slice(0, 160);
  await runGit(repository.root, ['add', '-A', '--', ...paths]);
  await runGit(repository.root, ['commit', '-m', commitMessage, '--', ...paths]);
  return inspectRepository(repository.root);
}

export async function pushLocalGitRepository(id: string) {
  const { repository } = await resolveStoredRepository(id);
  if (!repository.isGitRepository)
    throw new Error('当前文件夹不是 Git 仓库，无法推送');
  if (!repository.remoteName)
    throw new Error('当前本地仓库没有配置远程地址，无法推送');
  if (repository.branch === 'HEAD')
    throw new Error('当前处于 detached HEAD，无法直接推送');
  try {
    await runGit(
      repository.root,
      repository.upstream
        ? ['push', repository.remoteName, repository.branch]
        : ['push', '--set-upstream', repository.remoteName, repository.branch],
      true,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/non-fast-forward|rejected|fetch first/i.test(message))
      throw new Error('远程分支包含本地没有的提交，请先拉取并解决冲突后再推送');
    if (/authentication|permission denied|could not read username|terminal prompts disabled/i.test(message))
      throw new Error('Git 凭据不可用，请先在系统 Git 凭据管理器或 SSH Agent 中完成登录');
    throw new Error(`推送失败：${message}`);
  }
  return inspectRepository(repository.root);
}
