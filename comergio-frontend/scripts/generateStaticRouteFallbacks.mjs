import fs from 'node:fs/promises';
import path from 'node:path';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const INDEX_FILE = path.join(DIST_DIR, 'index.html');

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
  'parent/bold-resultado',
  'parent/recargas/metodos/pse',
  'parent/recargas/metodos/bancolombia',
  'parent/recargas/metodos/breb',
  'parent/recargas/agregar-tarjeta',
  'parent/recargas/automatica',
  'parent/historial-ordenes',
  'parent/limitar-consumo',
  'parent/meriendas',
  'login',
  'register',
  'register/next-step',
  'privacy',
  'contact',
];

async function main() {
  const indexHtml = await fs.readFile(INDEX_FILE, 'utf8');

  for (const route of ROUTE_FALLBACKS) {
    const routeDir = path.join(DIST_DIR, route);
    await fs.mkdir(routeDir, { recursive: true });
    await fs.writeFile(path.join(routeDir, 'index.html'), indexHtml, 'utf8');
  }

  console.log(`[route-fallbacks] generated ${ROUTE_FALLBACKS.length} fallback routes in dist/`);
}

main().catch((error) => {
  console.error('[route-fallbacks] failed:', error.message || error);
  process.exit(1);
});
