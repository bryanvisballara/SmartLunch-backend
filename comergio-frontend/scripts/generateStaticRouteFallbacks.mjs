import fs from 'node:fs/promises';
import path from 'node:path';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const DIST_DEPLOY_DIR = path.resolve(process.cwd(), 'dist-deploy');

// Fallback directories for hosting providers where SPA rewrites are ignored.
const ROUTE_FALLBACKS = [
  'admin',
  'pos',
  'daily-closure',
  'topups',
  'wallet',
  'orders',
  'orders/cancel',
  'inventory/in',
  'inventory/out',
  'inventory/transfer',
  'meriendas/operator',
  'parent',
  'parent/menu',
  'parent/recargas',
  'parent/recargas/metodos',
  'parent/recargas/metodos/daviplata',
  'parent/recargas/metodos/nequi',
  'parent/recargas/metodos/epayco',
  'parent/bold-resultado',
  'parent/recargas/metodos/pse',
  'parent/recargas/metodos/bancolombia',
  'parent/recargas/metodos/breb',
  'parent/recargas/agregar-tarjeta',
  'parent/recargas/automatica',
  'parent/historial-ordenes',
  'parent/limitar-consumo',
  'parent/meriendas',
  'parent/gio-ia',
  'login',
  'register',
  'register/next-step',
  'privacy',
  'contact',
];

async function generateFallbacksForDir(targetDir) {
  const indexFile = path.join(targetDir, 'index.html');
  const indexHtml = await fs.readFile(indexFile, 'utf8');

  for (const route of ROUTE_FALLBACKS) {
    const routeDir = path.join(targetDir, route);
    await fs.mkdir(routeDir, { recursive: true });
    await fs.writeFile(path.join(routeDir, 'index.html'), indexHtml, 'utf8');
  }
}

async function main() {
  await fs.rm(DIST_DEPLOY_DIR, { recursive: true, force: true });
  await fs.cp(DIST_DIR, DIST_DEPLOY_DIR, { recursive: true });

  await generateFallbacksForDir(DIST_DIR);
  await generateFallbacksForDir(DIST_DEPLOY_DIR);

  console.log(`[route-fallbacks] generated ${ROUTE_FALLBACKS.length} fallback routes in dist/ and dist-deploy/`);
}

main().catch((error) => {
  console.error('[route-fallbacks] failed:', error.message || error);
  process.exit(1);
});
