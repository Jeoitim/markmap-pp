import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app, autoUpdater, type BrowserWindow } from 'electron';
import {
  desktopChannels,
  type DesktopUpdateState,
} from '../shared/contracts.js';

let state: DesktopUpdateState = {
  status: 'disabled',
  currentVersion: app.getVersion(),
  message: '尚未配置更新源',
};
let configured = false;

function publish(window: BrowserWindow | null) {
  if (window && !window.isDestroyed())
    window.webContents.send(desktopChannels.updateStateChanged, state);
}

function setState(window: BrowserWindow | null, next: DesktopUpdateState) {
  state = next;
  publish(window);
}

async function readFeedUrl() {
  if (!app.isPackaged) return '';
  try {
    const value = JSON.parse(
      await fs.readFile(
        path.join(process.resourcesPath, 'update.json'),
        'utf8',
      ),
    ) as { feedUrl?: string };
    return value.feedUrl?.trim() || '';
  } catch {
    return '';
  }
}

export async function configureUpdates(getWindow: () => BrowserWindow | null) {
  const feedUrl = await readFeedUrl();
  if (!feedUrl) return;
  autoUpdater.setFeedURL({ url: feedUrl });
  configured = true;
  state = { status: 'idle', currentVersion: app.getVersion() };
  autoUpdater.on('checking-for-update', () =>
    setState(getWindow(), {
      status: 'checking',
      currentVersion: app.getVersion(),
    }),
  );
  autoUpdater.on('update-available', () =>
    setState(getWindow(), {
      status: 'available',
      currentVersion: app.getVersion(),
      message: '发现新版本，正在下载',
    }),
  );
  autoUpdater.on('update-not-available', () =>
    setState(getWindow(), {
      status: 'not-available',
      currentVersion: app.getVersion(),
      message: '当前已是最新版本',
    }),
  );
  autoUpdater.on('update-downloaded', (_event, _notes, version) =>
    setState(getWindow(), {
      status: 'downloaded',
      currentVersion: app.getVersion(),
      availableVersion: version,
      message: '更新已下载，可重启安装',
    }),
  );
  autoUpdater.on('error', (error) =>
    setState(getWindow(), {
      status: 'error',
      currentVersion: app.getVersion(),
      message: error.message,
    }),
  );
}

export function getUpdateState() {
  return state;
}

export async function checkForUpdates() {
  if (!configured) return state;
  await autoUpdater.checkForUpdates();
  return state;
}

export function installUpdate() {
  if (state.status !== 'downloaded') return false;
  autoUpdater.quitAndInstall();
  return true;
}
