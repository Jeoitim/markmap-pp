import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dialog, type BrowserWindow } from 'electron';
import type {
  DesktopLocalGitFile,
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

function runGit(root: string, args: string[], nonInteractive = false) {
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
        resolve(stdout.trim());
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

async function listMarkdownFiles(root: string) {
  const files: DesktopLocalGitFile[] = [];
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
        files.push({
          path: relative.replaceAll('\\', '/'),
          size: stat.size,
          updatedAt: stat.mtimeMs,
        });
      }
    }
  };
  await visit(root, '');
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function listChangedMarkdownPaths(root: string) {
  const [unstaged, staged, untracked] = await Promise.all([
    runGit(root, ['diff', '--name-only', '--relative', '--', '*.md', '*.markdown']),
    runGit(root, ['diff', '--cached', '--name-only', '--relative', '--', '*.md', '*.markdown']),
    runGit(root, ['ls-files', '--others', '--exclude-standard', '--', '*.md', '*.markdown']),
  ]);
  return Array.from(new Set(
    [unstaged, staged, untracked].flatMap((value) => value.split(/\r?\n/)).filter(Boolean),
  ));
}

async function inspectRepository(
  root: string,
): Promise<DesktopLocalGitRepository> {
  const realRoot = await fs.realpath(root);
  const gitRoot = await fs.realpath(await runGit(realRoot, ['rev-parse', '--show-toplevel']));
  const branch = (await runGit(gitRoot, ['branch', '--show-current'])) || 'HEAD';
  const head = await runGit(gitRoot, ['rev-parse', '--short', 'HEAD']).catch(
    () => '',
  );
  const status = await runGit(gitRoot, [
    'status',
    '--short',
    '--untracked-files=all',
  ]);
  const changedMarkdownPaths = await listChangedMarkdownPaths(gitRoot);
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
    branch,
    head,
    changedCount: status ? status.split(/\r?\n/).filter(Boolean).length : 0,
    markdownChangedCount: changedMarkdownPaths.length,
    remoteName,
    remoteLabel: remoteUrl ? safeRemoteLabel(remoteUrl) : null,
    upstream: upstream || null,
    aheadCount: Number.parseInt(aheadText, 10) || 0,
    behindCount: Number.parseInt(behindText, 10) || 0,
    files: await listMarkdownFiles(gitRoot),
    lastOpenedAt: Date.now(),
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
    title: '打开本地 Git 仓库',
    buttonLabel: '打开 Git 仓库',
  });
  if (result.canceled || !result.filePaths[0]) return null;
  let repository: DesktopLocalGitRepository;
  try {
    repository = await inspectRepository(result.filePaths[0]);
  } catch (error) {
    if (error instanceof Error && /ENOENT|not found/i.test(error.message))
      throw new Error('未检测到 Git 命令，无法进行 Git 版本管理操作');
    throw new Error('所选文件夹不是 Git 仓库，无法进行 Git 版本管理操作');
  }
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
  const paths = relativePaths.slice(0, 20).map(safeRelativeMarkdownPath);
  return runGit(repository.root, [
    'log',
    '--max-count=12',
    '--date=short',
    '--pretty=format:%h | %an | %ad | %s',
    ...(paths.length ? ['--', ...paths] : []),
  ]).catch(() => '');
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

export async function refreshLocalGitRepository(id: string) {
  const { repository } = await resolveStoredRepository(id);
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
