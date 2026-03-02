import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from 'crypto';

export interface GlobalConfig {
  provider?: string;
  model?: string;
}

function configDir(): string {
  return join(homedir(), '.enthropic');
}

function configPath(): string {
  return join(configDir(), 'config.json');
}

function globalKeyPath(): string {
  return join(configDir(), 'global.key');
}

function globalKeysPath(): string {
  return join(configDir(), 'global.keys');
}

function ensureDir(): void {
  mkdirSync(configDir(), { recursive: true });
}

export function loadConfig(): GlobalConfig {
  const p = configPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as GlobalConfig;
  } catch {
    return {};
  }
}

export function saveConfig(cfg: GlobalConfig): void {
  ensureDir();
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
}

function getOrCreateGlobalKey(): Uint8Array {
  ensureDir();
  const kp = globalKeyPath();
  if (existsSync(kp)) {
    const bytes = readFileSync(kp);
    if (bytes.length !== 32) throw new Error(`Global key file corrupted: expected 32 bytes, got ${bytes.length}`);
    return new Uint8Array(bytes);
  }
  const key = randomBytes(32);
  writeFileSync(kp, key);
  try { chmodSync(kp, 0o600); } catch { /* non-unix */ }
  return new Uint8Array(key);
}

function encryptData(key: Uint8Array, data: Uint8Array): Uint8Array {
  const nonce = new Uint8Array(randomBytes(12));
  const cipher = chacha20poly1305(key, nonce);
  const ciphertext = cipher.encrypt(data);
  const result = new Uint8Array(12 + ciphertext.length);
  result.set(nonce, 0);
  result.set(ciphertext, 12);
  return result;
}

function decryptData(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length < 12) throw new Error('Ciphertext too short');
  const nonce = data.slice(0, 12);
  const ciphertext = data.slice(12);
  const cipher = chacha20poly1305(key, nonce);
  return cipher.decrypt(ciphertext);
}

function loadApiKeys(): Record<string, string> {
  const p = globalKeysPath();
  if (!existsSync(p)) return {};
  const key = getOrCreateGlobalKey();
  const cipherdata = new Uint8Array(readFileSync(p));
  const plaintext = decryptData(key, cipherdata);
  return JSON.parse(Buffer.from(plaintext).toString('utf-8')) as Record<string, string>;
}

function saveApiKeys(keys: Record<string, string>): void {
  ensureDir();
  const key = getOrCreateGlobalKey();
  const json = Buffer.from(JSON.stringify(keys), 'utf-8');
  const encrypted = encryptData(key, new Uint8Array(json));
  const p = globalKeysPath();
  writeFileSync(p, encrypted);
  try { chmodSync(p, 0o600); } catch { /* non-unix */ }
}

export function setApiKey(provider: string, apiKey: string): void {
  const keys = (() => { try { return loadApiKeys(); } catch { return {}; } })();
  keys[provider] = apiKey;
  saveApiKeys(keys);
}

export function getApiKey(provider: string): string | undefined {
  try {
    return loadApiKeys()[provider];
  } catch {
    return undefined;
  }
}

export function hasAnyKey(): boolean {
  try {
    return Object.keys(loadApiKeys()).length > 0;
  } catch {
    return false;
  }
}
