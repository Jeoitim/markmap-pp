import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function tryGit(args) {
  const result = spawnSync('git', args, {
    cwd: desktopDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  return result.status === 0 ? result.stdout.trim() : '';
}

function tryGitTag() {
  return tryGit(['describe', '--tags', '--exact-match', 'HEAD']);
}

function tryLatestGitTag() {
  return tryGit(['describe', '--tags', '--abbrev=0']);
}

function tryGitCommit() {
  return tryGit(['rev-parse', '--short=12', 'HEAD']) || 'local';
}

function normalizeVersion(value) {
  const version = value.trim().replace(/^v(?=\d)/i, '');
  if (!versionPattern.test(version)) {
    throw new Error(`Invalid desktop version: ${value}`);
  }
  return version;
}

function bumpPatch(value) {
  const match = normalizeVersion(value).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Cannot bump desktop version: ${value}`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function resolveDevelopmentVersion() {
  const latestTag = tryLatestGitTag();
  const baseVersion = latestTag ? bumpPatch(latestTag) : '0.0.0';
  return `${baseVersion}-dev.${tryGitCommit()}`;
}

const requestedVersion =
  process.env.MARKMAP_DESKTOP_VERSION ||
  process.env.RELEASE_VERSION ||
  tryGitTag() ||
  resolveDevelopmentVersion();
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
