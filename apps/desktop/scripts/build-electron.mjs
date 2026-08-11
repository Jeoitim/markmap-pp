import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(
  readFileSync(resolve(desktopDir, 'package.json'), 'utf8'),
);
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function tryGitTag() {
  const result = spawnSync(
    'git',
    ['describe', '--tags', '--exact-match', 'HEAD'],
    {
      cwd: desktopDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );

  return result.status === 0 ? result.stdout.trim() : '';
}

function normalizeVersion(value) {
  const version = value.trim().replace(/^v(?=\d)/i, '');
  if (!versionPattern.test(version)) {
    throw new Error(`Invalid desktop version: ${value}`);
  }
  return version;
}

const requestedVersion =
  process.env.MARKMAP_DESKTOP_VERSION ||
  process.env.RELEASE_VERSION ||
  tryGitTag() ||
  packageJson.version;
const version = normalizeVersion(requestedVersion);
const builderArgs = process.argv.slice(2);
const configuredPnpm = process.env.npm_execpath;
const bundledPnpm = resolve(
  dirname(process.execPath),
  'node_modules/pnpm/bin/pnpm.cjs',
);
const packageManager =
  configuredPnpm && existsSync(configuredPnpm) ? configuredPnpm : bundledPnpm;
const packageManagerCommand = existsSync(packageManager)
  ? process.execPath
  : process.platform === 'win32'
    ? 'pnpm.cmd'
    : 'pnpm';
const packageManagerArgs = existsSync(packageManager) ? [packageManager] : [];

console.log(`Building desktop packages at version ${version}`);

const result = spawnSync(
  packageManagerCommand,
  [
    ...packageManagerArgs,
    'exec',
    'electron-builder',
    ...builderArgs,
    `--config.extraMetadata.version=${version}`,
  ],
  {
    cwd: desktopDir,
    env: process.env,
    shell: !existsSync(packageManager),
    stdio: 'inherit',
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
