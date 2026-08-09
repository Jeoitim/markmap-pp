import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app, dialog, type BrowserWindow } from 'electron';
import type {
  DesktopWorkspaceEntry,
  DesktopWorkspaceInfo,
} from '../shared/contracts.js';

const stateFileName = 'desktop-state.json';
const markdownExtension = /\.(md|markdown)$/i;
const maxWorkspaceFiles = 10_000;
const maxWorkspaceFileBytes = 20 * 1024 * 1024;

interface DesktopState {
  workspaceRoot?: string;
}

function stateFile() {
  return path.join(app.getPath('userData'), stateFileName);
}

async function readState(): Promise<DesktopState> {
  try {
    return JSON.parse(await fs.readFile(stateFile(), 'utf8')) as DesktopState;
  } catch {
    return {};
  }
}

async function writeState(state: DesktopState) {
  await fs.mkdir(path.dirname(stateFile()), { recursive: true });
  await fs.writeFile(stateFile(), JSON.stringify(state, null, 2), 'utf8');
}

async function workspaceRoot() {
  const stored = (await readState()).workspaceRoot;
  if (!stored) return null;
  try {
    const stat = await fs.stat(stored);
    return stat.isDirectory() ? await fs.realpath(stored) : null;
  } catch {
    return null;
  }
}

function safeRelativePath(value: string) {
  const normalized = value.replaceAll('\\', '/').replace(/^\/+/, '');
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').some((part) => part === '..')
  ) {
    throw new Error('文件路径无效');
  }
  if (!markdownExtension.test(normalized))
    throw new Error('仅允许访问 Markdown 文件');
  return normalized;
}

async function resolveWorkspaceFile(
  relativePath: string,
  allowMissing = false,
) {
  const root = await workspaceRoot();
  if (!root) throw new Error('请先选择本地工作区文件夹');
  const relative = safeRelativePath(relativePath);
  const target = path.resolve(root, ...relative.split('/'));
  const prefix = `${root}${path.sep}`;
  if (!target.startsWith(prefix)) throw new Error('文件路径超出工作区范围');
  if (!allowMissing) {
    const realTarget = await fs.realpath(target);
    if (!realTarget.startsWith(prefix))
      throw new Error('文件路径超出工作区范围');
  } else {
    const parent = await fs.realpath(path.dirname(target));
    if (parent !== root && !parent.startsWith(prefix))
      throw new Error('文件路径超出工作区范围');
  }
  return { root, relative, target };
}

async function listMarkdownFiles(root: string) {
  const files: DesktopWorkspaceEntry[] = [];
  const visit = async (directory: string, relativeDirectory: string) => {
    if (files.length >= maxWorkspaceFiles) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= maxWorkspaceFiles || entry.isSymbolicLink()) continue;
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

export async function getWorkspaceInfo(): Promise<DesktopWorkspaceInfo> {
  const root = await workspaceRoot();
  return { root, files: root ? await listMarkdownFiles(root) : [] };
}

export async function selectWorkspace(
  window: BrowserWindow,
): Promise<DesktopWorkspaceInfo | null> {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openDirectory', 'createDirectory'],
    title: '选择 Markdown 工作区',
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const root = await fs.realpath(result.filePaths[0]);
  await writeState({ ...(await readState()), workspaceRoot: root });
  return { root, files: await listMarkdownFiles(root) };
}

export async function readWorkspaceMarkdown(relativePath: string) {
  const { relative, target } = await resolveWorkspaceFile(relativePath);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error('目标不是文件');
  if (stat.size > maxWorkspaceFileBytes)
    throw new Error('Markdown 文件不能超过 20 MB');
  return { path: relative, content: await fs.readFile(target, 'utf8') };
}

export async function writeWorkspaceMarkdown(
  relativePath: string,
  content: string,
) {
  if (Buffer.byteLength(content, 'utf8') > maxWorkspaceFileBytes)
    throw new Error('Markdown 文件不能超过 20 MB');
  const { relative, target } = await resolveWorkspaceFile(relativePath, true);
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink()) throw new Error('不允许写入符号链接');
    if (!stat.isFile()) throw new Error('目标不是文件');
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error;
  }
  await fs.writeFile(target, content, 'utf8');
  return { path: relative };
}
