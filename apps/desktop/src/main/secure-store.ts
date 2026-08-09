import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';

const secureStoreFileName = 'secure-cache-v1.bin';
const maxSecureValueBytes = 1024 * 1024;
const maxSecureStoreBytes = 4 * 1024 * 1024;
const secureKeyPattern = /^[a-z0-9:_-]{1,64}$/;
let writeQueue = Promise.resolve();

function secureStoreFile() {
  return path.join(app.getPath('userData'), secureStoreFileName);
}

function assertSecureStorage() {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('系统安全存储当前不可用，已拒绝写入敏感缓存');
  if (
    process.platform === 'linux' &&
    safeStorage.getSelectedStorageBackend() === 'basic_text'
  )
    throw new Error('系统密钥服务不可用，已拒绝使用明文缓存');
}

function assertKey(key: string) {
  if (!secureKeyPattern.test(key)) throw new Error('安全缓存键无效');
}

async function readSecureStore(): Promise<Record<string, string>> {
  assertSecureStorage();
  try {
    const encrypted = await fs.readFile(secureStoreFile());
    if (encrypted.byteLength > maxSecureStoreBytes)
      throw new Error('安全缓存文件异常');
    const parsed = JSON.parse(
      safeStorage.decryptString(encrypted),
    ) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          secureKeyPattern.test(key) && typeof value === 'string',
      ),
    );
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return {};
    throw error;
  }
}

async function writeSecureStore(values: Record<string, string>) {
  assertSecureStorage();
  const serialized = JSON.stringify(values);
  if (Buffer.byteLength(serialized, 'utf8') > maxSecureStoreBytes)
    throw new Error('安全缓存容量已满');
  const encrypted = safeStorage.encryptString(serialized);
  const target = secureStoreFile();
  const temporary = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(temporary, encrypted, { mode: 0o600 });
  await fs.rename(temporary, target);
}

function enqueueWrite<T>(task: () => Promise<T>) {
  const pending = writeQueue.then(task, task);
  writeQueue = pending.then(
    () => undefined,
    () => undefined,
  );
  return pending;
}

export async function getSecureValue(key: string) {
  assertKey(key);
  return (await readSecureStore())[key] ?? null;
}

export async function setSecureValue(key: string, value: string) {
  assertKey(key);
  if (Buffer.byteLength(value, 'utf8') > maxSecureValueBytes)
    throw new Error('安全缓存值不能超过 1 MB');
  await enqueueWrite(async () => {
    const values = await readSecureStore();
    values[key] = value;
    await writeSecureStore(values);
  });
}

export async function removeSecureValue(key: string) {
  assertKey(key);
  await enqueueWrite(async () => {
    const values = await readSecureStore();
    delete values[key];
    await writeSecureStore(values);
  });
}
