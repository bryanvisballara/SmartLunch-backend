import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const TOUR_ROUTE = 'tourvirtualberckley';
const DEFAULT_TOUR_ROOT = path.resolve(process.cwd(), '../../Web Berckley');

function resolveTourRoot() {
  const fromEnv = String(process.env.WEB_BERCKLEY_ROOT || '').trim();
  return fromEnv ? path.resolve(fromEnv) : DEFAULT_TOUR_ROOT;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyTourBuild(targetDirs) {
  const tourRoot = resolveTourRoot();
  const tourDist = path.join(tourRoot, 'dist');

  if (!(await pathExists(tourRoot))) {
    throw new Error(`No se encontró Web Berckley en ${tourRoot}. Define WEB_BERCKLEY_ROOT si está en otra ruta.`);
  }

  console.log(`[berckley-tour] building ${tourRoot}`);
  execSync('npm run build', {
    cwd: tourRoot,
    stdio: 'inherit',
  });

  if (!(await pathExists(tourDist))) {
    throw new Error(`No existe ${tourDist} después del build.`);
  }

  for (const targetDir of targetDirs) {
    const tourTarget = path.join(targetDir, TOUR_ROUTE);
    await fs.rm(tourTarget, { recursive: true, force: true });
    await fs.cp(tourDist, tourTarget, { recursive: true });
    console.log(`[berckley-tour] copied to ${tourTarget}`);
  }
}

export async function copyBerckleyTourDeploy(targetDirs) {
  const skip = String(process.env.SKIP_BERCKLEY_TOUR || '').trim() === '1';
  if (skip) {
    console.log('[berckley-tour] skipped (SKIP_BERCKLEY_TOUR=1)');
    return;
  }

  await copyTourBuild(targetDirs);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const distDir = path.resolve(process.cwd(), 'dist');
  copyBerckleyTourDeploy([distDir]).catch((error) => {
    console.error('[berckley-tour] failed:', error.message || error);
    process.exit(1);
  });
}
