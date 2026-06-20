import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));

function parseEnvFile(relativePath) {
  const absolutePath = resolve(rootDir, '..', relativePath);
  if (!existsSync(absolutePath)) {
    return {};
  }

  return readFileSync(absolutePath, 'utf8')
    .split('\n')
    .reduce((accumulator, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return accumulator;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex <= 0) {
        return accumulator;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
      accumulator[key] = value;
      return accumulator;
    }, {});
}

function applyEnvFileValues(values, overrideExisting = false) {
  Object.entries(values).forEach(([key, value]) => {
    if (!overrideExisting && process.env[key]) {
      return;
    }

    if (value) {
      process.env[key] = value;
    }
  });
}

applyEnvFileValues(parseEnvFile('.env.production'));
applyEnvFileValues(parseEnvFile('.env.mobile'), true);

if (!process.env.CAPACITOR_SERVER_URL && process.env.VITE_APP_URL) {
  process.env.CAPACITOR_SERVER_URL = process.env.VITE_APP_URL;
}

const useEmbeddedShell = ['1', 'true', 'yes', 'on'].includes(String(process.env.CAPACITOR_USE_EMBEDDED || '').trim().toLowerCase());
const remoteServerUrl = String(process.env.CAPACITOR_SERVER_URL || '').trim().replace(/\/+$/, '');

if (useEmbeddedShell) {
  console.log('[mobile] Capacitor shell mode: embedded dist');
} else if (remoteServerUrl) {
  console.log(`[mobile] Capacitor shell mode: remote ${remoteServerUrl}`);
} else {
  console.warn('[mobile] CAPACITOR_SERVER_URL missing; Capacitor will use embedded dist.');
}

const result = spawnSync('npx', ['cap', 'sync'], {
  cwd: resolve(rootDir, '..'),
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
