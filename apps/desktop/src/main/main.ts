import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from 'electron';
import {
  desktopChannels,
  type DesktopPdfRequest,
  type DesktopOpenedFile,
  type DesktopSaveRequest,
} from '../shared/contracts.js';
import {
  checkForUpdates,
  configureUpdates,
  getUpdateState,
  installUpdate,
} from './updates.js';
import {
  commitLocalGitMarkdown,
  discardLocalGitChanges,
  discardLocalGitFile,
  forgetLocalGitRepository,
  getLocalGitState,
  inspectLocalGitRepository,
  openLocalGitRepository,
  pushLocalGitRepository,
  readLocalGitGraph,
  readLocalGitFileHistory,
  refreshLocalGitRepository,
  readLocalGitHistory,
  readLocalGitMarkdown,
  readLocalGitMarkdownVersion,
  selectLocalGitRepository,
  moveLocalWorkspaceTarget,
  removeLocalWorkspaceTarget,
  switchLocalGitBranch,
  syncLocalGitRepository,
  writeLocalGitMarkdown,
  watchLocalGitRepository,
} from './local-git.js';
import {
  getSecureValue,
  removeSecureValue,
  setSecureValue,
} from './secure-store.js';

const appScheme = 'markmap';
const appHost = 'app';
const appId = 'io.github.jeoitim.markmap-plus-plus';
const maxOpenFileBytes = 20 * 1024 * 1024;
const maxSaveFileBytes = 200 * 1024 * 1024;
const maxPdfHtmlBytes = 80 * 1024 * 1024;
const allowedExternalProtocols = new Set(['https:', 'mailto:']);
let mainWindow: BrowserWindow | null = null;
const openedMarkdownFiles = new Map<string, string>();
const approvedWindowCloses = new WeakSet<BrowserWindow>();
let stopLocalGitWatcher: (() => void) | null = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: appScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    },
  },
]);

function handleSquirrelStartup() {
  if (process.platform !== 'win32') return false;
  const event = process.argv[1];
  if (!event?.startsWith('--squirrel-')) return false;
  const updateExe = path.resolve(
    path.dirname(process.execPath),
    '..',
    'Update.exe',
  );
  const executableName = path.basename(process.execPath);
  const run = (args: string[]) => {
    try {
      spawn(updateExe, args, { detached: true, stdio: 'ignore' }).unref();
    } catch {
      // Squirrel will still finish installation even if shortcut maintenance fails.
    }
  };
  if (event === '--squirrel-install' || event === '--squirrel-updated')
    run(['--createShortcut', executableName]);
  if (event === '--squirrel-uninstall')
    run(['--removeShortcut', executableName]);
  app.quit();
  return true;
}

function nativeApplicationMenu() {
  if (process.platform !== 'darwin') return null;
  return Menu.buildFromTemplate([
    {
      label: 'Markmap++',
      submenu: [
        { label: '关于 Markmap++', role: 'about' },
        { type: 'separator' },
        { label: '隐藏 Markmap++', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '显示全部', role: 'unhide' },
        { type: 'separator' },
        { label: '退出 Markmap++', role: 'quit' },
      ],
    },
    {
      label: '文件',
      submenu: [
        { label: '关闭窗口', role: 'close' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '缩放', role: 'zoom' },
        { type: 'separator' },
        { label: '前置全部窗口', role: 'front' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于 Markmap++', role: 'about' },
      ],
    },
  ]);
}

const squirrelStartup = handleSquirrelStartup();
nativeTheme.themeSource = 'system';

function rendererRoot() {
  return path.join(app.getAppPath(), 'dist', 'renderer');
}

async function registerAppProtocol() {
  protocol.handle(appScheme, async (request) => {
    const url = new URL(request.url);
    if (url.host !== appHost) return new Response('Not found', { status: 404 });
    const root = path.resolve(rendererRoot());
    const requestPath = decodeURIComponent(
      url.pathname === '/' ? '/index.html' : url.pathname,
    );
    const relative = path.normalize(requestPath).replace(/^[/\\]+/, '');
    const target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(`${root}${path.sep}`))
      return new Response('Not found', { status: 404 });
    try {
      return await net.fetch(pathToFileURL(target).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function isTrustedUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === `${appScheme}:` && url.host === appHost) return true;
    return (
      !app.isPackaged &&
      url.protocol === 'http:' &&
      (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
      url.port === '5173'
    );
  } catch {
    return false;
  }
}

function assertTrusted(event: IpcMainInvokeEvent) {
  if (!isTrustedUrl(event.senderFrame?.url || event.sender.getURL()))
    throw new Error('拒绝来自非应用页面的请求');
}

function safeExternalUrl(value: string) {
  const url = new URL(value);
  if (!allowedExternalProtocols.has(url.protocol))
    throw new Error('不允许打开该链接协议');
  return url.toString();
}

function contentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    'connect-src https: http:',
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
  ].join('; ');
}

async function openMarkdownDialog(
  window: BrowserWindow,
): Promise<DesktopOpenedFile | null> {
  const result = await dialog.showOpenDialog(window, {
    title: '打开 Markdown / Mermaid 文件',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown / Mermaid', extensions: ['md', 'markdown', 'mmd'] },
      { name: '文本文件', extensions: ['txt'] },
    ],
  });
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) return null;
  const stat = await fs.stat(filePath);
  if (stat.size > maxOpenFileBytes)
    throw new Error('文件超过 20 MB，无法直接打开');
  const id = randomUUID();
  openedMarkdownFiles.set(id, filePath);
  return {
    id,
    name: path.basename(filePath),
    path: filePath,
    content: await fs.readFile(filePath, 'utf8'),
  };
}

function registerIpc() {
  ipcMain.handle(desktopChannels.windowClose, (event) => {
    assertTrusted(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;
    approvedWindowCloses.add(window);
    window.close();
    return true;
  });
  ipcMain.handle(desktopChannels.windowRequestClose, (event) => {
    assertTrusted(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;
    window.close();
    return true;
  });
  ipcMain.handle(desktopChannels.windowMinimize, (event) => {
    assertTrusted(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;
    window.minimize();
    return true;
  });
  ipcMain.handle(desktopChannels.windowToggleMaximize, (event) => {
    assertTrusted(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
    window.webContents.send(desktopChannels.windowMaximizedChanged, window.isMaximized());
    return true;
  });
  ipcMain.handle(desktopChannels.windowGetMaximized, (event) => {
    assertTrusted(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    return Boolean(window && !window.isDestroyed() && window.isMaximized());
  });
  ipcMain.handle(desktopChannels.appInfo, (event) => {
    assertTrusted(event);
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged,
    };
  });
  ipcMain.handle(desktopChannels.setNativeTheme, (event, theme: unknown) => {
    assertTrusted(event);
    if (theme !== 'dark' && theme !== 'light' && theme !== 'system') {
      throw new Error('Invalid native theme');
    }
    nativeTheme.themeSource = theme;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (process.platform === 'win32') window?.setBackgroundMaterial('mica');
    return { shouldUseDarkColors: nativeTheme.shouldUseDarkColors };
  });
  ipcMain.handle(
    desktopChannels.openExternal,
    async (event, value: unknown) => {
      assertTrusted(event);
      if (typeof value !== 'string') throw new Error('链接无效');
      await shell.openExternal(safeExternalUrl(value));
      return true;
    },
  );
  ipcMain.handle(desktopChannels.openMarkdown, async (event) => {
    assertTrusted(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return null;
    return openMarkdownDialog(window);
  });
  ipcMain.handle(
    desktopChannels.saveOpenedMarkdown,
    async (event, id: unknown, content: unknown) => {
      assertTrusted(event);
      if (typeof id !== 'string' || typeof content !== 'string')
        throw new Error('保存参数无效');
      const filePath = openedMarkdownFiles.get(id);
      if (!filePath) throw new Error('文件授权已失效，请重新打开该文件');
      if (Buffer.byteLength(content, 'utf8') > maxOpenFileBytes)
        throw new Error('Markdown 文件不能超过 20 MB');
      const stat = await fs.lstat(filePath);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('目标文件已变化，请重新打开后再保存');
      await fs.writeFile(filePath, content, 'utf8');
      return { id, name: path.basename(filePath), path: filePath, content };
    },
  );
  ipcMain.handle(
    desktopChannels.saveFile,
    async (event, request: DesktopSaveRequest) => {
      assertTrusted(event);
      const window = BrowserWindow.fromWebContents(event.sender);
      if (
        !window ||
        typeof request?.suggestedName !== 'string' ||
        !(request.bytes instanceof Uint8Array)
      )
        throw new Error('保存请求无效');
      if (request.bytes.byteLength > maxSaveFileBytes)
        throw new Error('导出文件超过 200 MB');
      const suggestedName =
        path.basename(request.suggestedName).replace(/[<>:"/\\|?*]/g, '_') ||
        'markmap.md';
      const result = await dialog.showSaveDialog(window, {
        title: '保存文件',
        defaultPath: suggestedName,
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      await fs.writeFile(result.filePath, request.bytes);
      return { canceled: false, path: result.filePath };
    },
  );
  ipcMain.handle(
    desktopChannels.savePdf,
    async (event, request: DesktopPdfRequest) => {
      assertTrusted(event);
      const window = BrowserWindow.fromWebContents(event.sender);
      if (
        !window ||
        typeof request?.suggestedName !== 'string' ||
        typeof request?.html !== 'string' ||
        !Number.isFinite(request.width) ||
        !Number.isFinite(request.height) ||
        request.width <= 0 ||
        request.height <= 0
      )
        throw new Error('PDF 导出请求无效');
      if (Buffer.byteLength(request.html, 'utf8') > maxPdfHtmlBytes)
        throw new Error('PDF 内容超过 80 MB');

      const width = Math.min(request.width, 100_000);
      const height = Math.min(request.height, 100_000);
      const printWindow = new BrowserWindow({
        show: false,
        width: Math.min(Math.max(Math.ceil(width), 320), 4096),
        height: Math.min(Math.max(Math.ceil(height), 240), 4096),
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      try {
        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(request.html)}`);
        await printWindow.webContents.executeJavaScript(`(async () => {
          await Promise.race([
            (async () => {
              if (document.fonts?.ready) await document.fonts.ready;
              await Promise.all(Array.from(document.images).map((image) => image.complete
                ? Promise.resolve()
                : new Promise((resolve) => {
                    image.addEventListener('load', resolve, { once: true });
                    image.addEventListener('error', resolve, { once: true });
                  })));
            })(),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]);
        })()`);
        const pdfBytes = await printWindow.webContents.printToPDF({
          printBackground: true,
          displayHeaderFooter: false,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          pageSize: { width: width / 96, height: height / 96 },
          preferCSSPageSize: true,
        });
        const suggestedName =
          path.basename(request.suggestedName).replace(/[<>:"/\\|?*]/g, '_') ||
          'markmap.pdf';
        const result = await dialog.showSaveDialog(window, {
          title: '保存 PDF',
          defaultPath: suggestedName,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });
        if (result.canceled || !result.filePath) return { canceled: true };
        await fs.writeFile(result.filePath, pdfBytes);
        return { canceled: false, path: result.filePath };
      } finally {
        if (!printWindow.isDestroyed()) printWindow.destroy();
      }
    },
  );
  ipcMain.handle(desktopChannels.localGitGet, async (event) => {
    assertTrusted(event);
    return getLocalGitState();
  });
  ipcMain.handle(desktopChannels.localGitOpen, async (event) => {
    assertTrusted(event);
    const window = BrowserWindow.fromWebContents(event.sender);
    return window ? openLocalGitRepository(window) : null;
  });
  ipcMain.handle(
    desktopChannels.localGitSelect,
    async (event, id: unknown) => {
      assertTrusted(event);
      if (typeof id !== 'string') throw new Error('仓库标识无效');
      return selectLocalGitRepository(id);
    },
  );
  ipcMain.handle(
    desktopChannels.localGitForget,
    async (event, id: unknown) => {
      assertTrusted(event);
      if (typeof id !== 'string') throw new Error('仓库标识无效');
      return forgetLocalGitRepository(id);
    },
  );
  ipcMain.handle(
    desktopChannels.localGitRead,
    async (event, id: unknown, relativePath: unknown) => {
      assertTrusted(event);
      if (typeof id !== 'string' || typeof relativePath !== 'string')
        throw new Error('文件路径无效');
      return readLocalGitMarkdown(id, relativePath);
    },
  );
  ipcMain.handle(
    desktopChannels.localGitWrite,
    async (
      event,
      id: unknown,
      relativePath: unknown,
      content: unknown,
    ) => {
      assertTrusted(event);
      if (
        typeof id !== 'string' ||
        typeof relativePath !== 'string' ||
        typeof content !== 'string'
      )
        throw new Error('写入参数无效');
      return writeLocalGitMarkdown(id, relativePath, content);
    },
  );
  ipcMain.handle(
    desktopChannels.localGitHistory,
    async (event, id: unknown, relativePaths: unknown) => {
      assertTrusted(event);
      if (
        typeof id !== 'string' ||
        !Array.isArray(relativePaths) ||
        !relativePaths.every((item) => typeof item === 'string')
      )
        throw new Error('Git 历史参数无效');
      return readLocalGitHistory(id, relativePaths);
    },
  );
  ipcMain.handle(desktopChannels.localGitFileHistory, async (event, id: unknown, relativePath: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string' || typeof relativePath !== 'string') throw new Error('文件历史参数无效');
    return readLocalGitFileHistory(id, relativePath);
  });
  ipcMain.handle(desktopChannels.localGitReadVersion, async (event, id: unknown, relativePath: unknown, commitSha: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string' || typeof relativePath !== 'string' || typeof commitSha !== 'string') throw new Error('历史版本参数无效');
    return readLocalGitMarkdownVersion(id, relativePath, commitSha);
  });
  ipcMain.handle(desktopChannels.localGitInspect, async (event, id: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string') throw new Error('仓库标识无效');
    return inspectLocalGitRepository(id);
  });
  ipcMain.handle(desktopChannels.localGitWatch, async (event, id: unknown) => {
    assertTrusted(event);
    if (id !== null && typeof id !== 'string') throw new Error('仓库标识无效');
    stopLocalGitWatcher?.();
    stopLocalGitWatcher = null;
    if (!id) return true;
    const sender = event.sender;
    stopLocalGitWatcher = await watchLocalGitRepository(id, (repositoryId) => {
      if (!sender.isDestroyed()) sender.send(desktopChannels.localGitChanged, repositoryId);
    });
    return true;
  });
  ipcMain.handle(
    desktopChannels.localGitCommit,
    async (event, id: unknown, message: unknown) => {
      assertTrusted(event);
      if (typeof id !== 'string' || typeof message !== 'string')
        throw new Error('提交参数无效');
      return commitLocalGitMarkdown(id, message);
    },
  );
  ipcMain.handle(desktopChannels.localGitRefresh, async (event, id: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string') throw new Error('仓库标识无效');
    return refreshLocalGitRepository(id);
  });
  ipcMain.handle(desktopChannels.localGitSync, async (event, id: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string') throw new Error('仓库标识无效');
    return syncLocalGitRepository(id);
  });
  ipcMain.handle(desktopChannels.localGitMove, async (event, id: unknown, sourcePath: unknown, destinationPath: unknown, kind: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string' || typeof sourcePath !== 'string' || typeof destinationPath !== 'string' || (kind !== 'file' && kind !== 'folder'))
      throw new Error('移动参数无效');
    return moveLocalWorkspaceTarget(id, sourcePath, destinationPath, kind);
  });
  ipcMain.handle(desktopChannels.localGitRemove, async (event, id: unknown, relativePath: unknown, kind: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string' || typeof relativePath !== 'string' || (kind !== 'file' && kind !== 'folder'))
      throw new Error('删除参数无效');
    return removeLocalWorkspaceTarget(id, relativePath, kind);
  });
  ipcMain.handle(desktopChannels.localGitDiscard, async (event, id: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string') throw new Error('仓库标识无效');
    return discardLocalGitChanges(id);
  });
  ipcMain.handle(desktopChannels.localGitDiscardFile, async (event, id: unknown, relativePath: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string' || typeof relativePath !== 'string') throw new Error('文件路径无效');
    return discardLocalGitFile(id, relativePath);
  });
  ipcMain.handle(desktopChannels.localGitGraph, async (event, id: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string') throw new Error('仓库标识无效');
    return readLocalGitGraph(id);
  });
  ipcMain.handle(desktopChannels.localGitSwitchBranch, async (event, id: unknown, branch: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string' || typeof branch !== 'string') throw new Error('分支参数无效');
    return switchLocalGitBranch(id, branch);
  });
  ipcMain.handle(desktopChannels.localGitPush, async (event, id: unknown) => {
    assertTrusted(event);
    if (typeof id !== 'string') throw new Error('仓库标识无效');
    return pushLocalGitRepository(id);
  });
  ipcMain.handle(
    desktopChannels.secureCacheGet,
    async (event, key: unknown) => {
      assertTrusted(event);
      if (typeof key !== 'string') throw new Error('安全缓存键无效');
      return getSecureValue(key);
    },
  );
  ipcMain.handle(
    desktopChannels.secureCacheSet,
    async (event, key: unknown, value: unknown) => {
      assertTrusted(event);
      if (typeof key !== 'string' || typeof value !== 'string')
        throw new Error('安全缓存参数无效');
      await setSecureValue(key, value);
    },
  );
  ipcMain.handle(
    desktopChannels.secureCacheRemove,
    async (event, key: unknown) => {
      assertTrusted(event);
      if (typeof key !== 'string') throw new Error('安全缓存键无效');
      await removeSecureValue(key);
    },
  );
  ipcMain.handle(desktopChannels.updateGetState, (event) => {
    assertTrusted(event);
    return getUpdateState();
  });
  ipcMain.handle(desktopChannels.updateCheck, async (event) => {
    assertTrusted(event);
    return checkForUpdates();
  });
  ipcMain.handle(desktopChannels.updateInstall, (event) => {
    assertTrusted(event);
    return installUpdate();
  });
}

function configureSession() {
  const allowedPermissions = new Set([
    'clipboard-read',
    'clipboard-sanitized-write',
    'fullscreen',
  ]);
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      isTrustedUrl(requestingOrigin) && allowedPermissions.has(permission),
  );
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) =>
      callback(
        isTrustedUrl(webContents.getURL()) &&
          allowedPermissions.has(permission),
      ),
  );
  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [contentSecurityPolicy()],
        },
      });
    });
  }
}

function nativeWindowOptions(): Pick<
  BrowserWindowConstructorOptions,
  | 'backgroundColor'
  | 'backgroundMaterial'
  | 'titleBarOverlay'
  | 'titleBarStyle'
  | 'trafficLightPosition'
  | 'vibrancy'
  | 'visualEffectState'
> {
  if (process.platform === 'win32') {
    return {
      backgroundColor: '#00000000',
      backgroundMaterial: 'mica',
      titleBarStyle: 'hidden',
    };
  }
  if (process.platform === 'darwin') {
    return {
      backgroundColor: '#00000000',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 12, y: 25 },
      vibrancy: 'titlebar',
      visualEffectState: 'followWindow',
    };
  }
  return { backgroundColor: '#15181d' };
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: true,
    autoHideMenuBar: true,
    title: 'markmap++',
    ...nativeWindowOptions(),
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  if (process.platform === 'win32') {
    window.setBackgroundMaterial('mica');
  }
  const sendNativeTheme = () => {
    if (!window.isDestroyed()) {
      window.webContents.send(desktopChannels.nativeThemeChanged, {
        shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
        themeSource: nativeTheme.themeSource,
      });
    }
  };
  const nativeThemeListener = () => {
    if (process.platform === 'win32') window.setBackgroundMaterial('mica');
    sendNativeTheme();
  };
  nativeTheme.on('updated', nativeThemeListener);
  window.on('closed', () => nativeTheme.removeListener('updated', nativeThemeListener));
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      void shell.openExternal(safeExternalUrl(url));
    } catch {
      /* Block unknown protocols. */
    }
    return { action: 'deny' };
  });
  window.webContents.on('context-menu', (_event, params) => {
    const template: MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      template.push(
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { type: 'separator' },
        { label: '全选', role: 'selectAll' },
      );
    } else if (params.selectionText.trim()) {
      template.push(
        { label: '复制', role: 'copy' },
        { type: 'separator' },
        { label: '全选', role: 'selectAll' },
      );
    } else if (params.linkURL) {
      template.push({
        label: '复制链接',
        click: () => clipboard.writeText(params.linkURL),
      });
    }
    if (template.length) Menu.buildFromTemplate(template).popup({ window });
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    try {
      void shell.openExternal(safeExternalUrl(url));
    } catch {
      /* Block unknown protocols. */
    }
  });
  window.on('close', (event) => {
    if (approvedWindowCloses.has(window)) return;
    event.preventDefault();
    if (!window.webContents.isDestroyed())
      window.webContents.send(desktopChannels.windowCloseRequested);
  });
  window.on('closed', () => {
    stopLocalGitWatcher?.();
    stopLocalGitWatcher = null;
    if (mainWindow === window) mainWindow = null;
  });
  window.on('maximize', () => window.webContents.send(desktopChannels.windowMaximizedChanged, true));
  window.on('unmaximize', () => window.webContents.send(desktopChannels.windowMaximizedChanged, false));
  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl && !app.isPackaged) await window.loadURL(developmentUrl);
  else await window.loadURL(`${appScheme}://${appHost}/index.html`);
  return window;
}

if (!squirrelStartup) {
  const singleInstance = app.requestSingleInstanceLock();
  if (!singleInstance) app.quit();
  else {
    app.on('second-instance', () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    });
    app
      .whenReady()
      .then(async () => {
        app.setAppUserModelId(appId);
        await registerAppProtocol();
        configureSession();
        registerIpc();
        Menu.setApplicationMenu(nativeApplicationMenu());
        mainWindow = await createWindow();
        await configureUpdates(() => mainWindow);
        app.on('activate', async () => {
          if (BrowserWindow.getAllWindows().length === 0)
            mainWindow = await createWindow();
        });
      })
      .catch((error) => {
        dialog.showErrorBox(
          'markmap++ 启动失败',
          error instanceof Error ? error.message : String(error),
        );
        app.quit();
      });
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
