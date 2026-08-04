import { cpSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const appDist = fileURLToPath(
  new URL('../examples/react-example/dist/', import.meta.url),
);
const docsDist = fileURLToPath(
  new URL('../docs/.vitepress/dist/', import.meta.url),
);
const siteDist = fileURLToPath(new URL('../dist/', import.meta.url));
const docsTarget = fileURLToPath(new URL('../dist/doc/', import.meta.url));
const pnpmCli = process.env.npm_execpath;

function run(args, environment) {
  const command = pnpmCli ? process.execPath : 'pnpm';
  const commandArgs = pnpmCli ? [pnpmCli, ...args] : args;
  const result = spawnSync(command, commandArgs, {
    cwd: repositoryRoot,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['--filter', 'markmap-plus-plus-app', 'build'], {
  VITE_BASE_PATH: process.env.VITE_BASE_PATH || '/',
});
run(['docs:build'], {
  VITEPRESS_BASE_PATH: process.env.VITEPRESS_BASE_PATH || '/doc/',
});

if (!existsSync(appDist) || !existsSync(docsDist)) {
  throw new Error('Application or documentation build output is missing.');
}

rmSync(siteDist, { recursive: true, force: true });
cpSync(appDist, siteDist, { recursive: true });
cpSync(docsDist, docsTarget, { recursive: true });

console.log(`Combined application and documentation in ${siteDist}`);
