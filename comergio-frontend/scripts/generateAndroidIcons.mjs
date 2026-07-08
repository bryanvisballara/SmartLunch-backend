#!/usr/bin/env node
/**
 * Regenerates Android launcher icons from the colibrí master assets.
 * - ic_launcher_foreground: transparent PNG (adaptive icon, API 26+)
 * - ic_launcher / ic_launcher_round: square icon with white background (legacy)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const resDir = path.join(root, 'android/app/src/main/res');

const FOREGROUND_SOURCE = path.join(root, 'src/assets/colibrisinfondo.png');
const LAUNCHER_SOURCE = path.join(root, 'store-assets/play-store/icon-512.png');

const LAUNCHER_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const FOREGROUND_SIZES = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

function resize(source, dest, size) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execSync(`sips -z ${size} ${size} "${source}" --out "${dest}"`, { stdio: 'inherit' });
}

for (const [folder, size] of Object.entries(LAUNCHER_SIZES)) {
  const dir = path.join(resDir, folder);
  resize(LAUNCHER_SOURCE, path.join(dir, 'ic_launcher.png'), size);
  resize(LAUNCHER_SOURCE, path.join(dir, 'ic_launcher_round.png'), size);
}

for (const [folder, size] of Object.entries(FOREGROUND_SIZES)) {
  const dir = path.join(resDir, folder);
  resize(FOREGROUND_SOURCE, path.join(dir, 'ic_launcher_foreground.png'), size);
}

console.log('Android launcher icons updated from colibrí assets.');
