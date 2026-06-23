import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const DIST_DEPLOY_DIR = path.resolve(process.cwd(), 'dist-deploy');
const LEGACY_BROKEN_ENTRY_ALIASES = [
  'index-DtEcVJMf.js',
  'index-BgUrQoOJ.js',
];

// Fallback directories for hosting providers where SPA rewrites are ignored.
const ROUTE_FALLBACKS = [
  'super-admin',
  'admin',
  'rectoria',
  'direccion',
  'coordinacion',
  'academic-secretary',
  'academic-secretary/admissions',
  'academic-secretary/admissions/stage/interesados',
  'academic-secretary/admissions/stage/informacion-enviada',
  'academic-secretary/admissions/stage/agendamiento',
  'academic-secretary/admissions/stage/inscripcion',
  'academic-secretary/admissions/stage/prueba-admision',
  'academic-secretary/admissions/stage/resultados',
  'academic-secretary/admissions/stage/matriculados',
  'pos',
  'daily-closure',
  'topups',
  'wallet',
  'orders',
  'orders/cancel',
  'inventory/in',
  'inventory/out',
  'inventory/transfer',
  'enfermeria',
  'psicologia',
  'recursos-humanos',
  'cartera',
  'portal-institucional',
  'schoolcreation',
  'bold-resultado',
  'meriendas/operator',
  'campus',
  'campus/parent',
  'campus/student',
  'campus/teacher',
  'campus/study',
  'parent',
  'parent/finance',
  'parent/academic',
  'parent/cafeteria',
  'parent/transport',
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
  'parent/enfermeria',
  'parent/wellbeing',
  'parent/coexistence',
  // Embedded cafeteria portal routes (ParentCampusHome + ParentPortal basePath /parent/cafeteria)
  'parent/cafeteria/menu',
  'parent/cafeteria/orders',
  'parent/cafeteria/wallet',
  'parent/cafeteria/topups',
  'parent/cafeteria/recargas',
  'parent/cafeteria/recargas/metodos',
  'parent/cafeteria/recargas/metodos/daviplata',
  'parent/cafeteria/recargas/metodos/nequi',
  'parent/cafeteria/recargas/metodos/epayco',
  'parent/cafeteria/bold-resultado',
  'parent/cafeteria/recargas/metodos/pse',
  'parent/cafeteria/recargas/metodos/bancolombia',
  'parent/cafeteria/recargas/metodos/breb',
  'parent/cafeteria/recargas/agregar-tarjeta',
  'parent/cafeteria/recargas/automatica',
  'parent/cafeteria/historial-ordenes',
  'parent/cafeteria/limitar-consumo',
  'parent/cafeteria/meriendas',
  'parent/cafeteria/gio-ia',
  'epayco-resultado',
  'login',
  'cuenta-eliminada',
  'register',
  'register/next-step',
  'privacy',
  'account-deletion',
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

async function getModernEntryFile(targetDir) {
  const indexHtml = await fs.readFile(path.join(targetDir, 'index.html'), 'utf8');
  const match = indexHtml.match(/src="\/assets\/(index-[^"]+\.js)"/);
  return match?.[1] || '';
}

async function writeLegacyBrokenEntryAliases(targetDir) {
  const modernEntryFile = await getModernEntryFile(targetDir);
  if (!modernEntryFile) {
    return;
  }

  const assetsDir = path.join(targetDir, 'assets');
  const shim = `export * from './${modernEntryFile}';\nimport './${modernEntryFile}';\n`;

  await Promise.all(
    LEGACY_BROKEN_ENTRY_ALIASES
      .filter((aliasFile) => aliasFile !== modernEntryFile)
      .map((aliasFile) => fs.writeFile(path.join(assetsDir, aliasFile), shim, 'utf8'))
  );
}

async function main() {
  await fs.rm(DIST_DEPLOY_DIR, { recursive: true, force: true });
  await fs.cp(DIST_DIR, DIST_DEPLOY_DIR, { recursive: true });

  await generateFallbacksForDir(DIST_DIR);
  await generateFallbacksForDir(DIST_DEPLOY_DIR);
  await writeLegacyBrokenEntryAliases(DIST_DIR);
  await writeLegacyBrokenEntryAliases(DIST_DEPLOY_DIR);

  const zipPath = path.join(process.cwd(), 'dist-deploy.zip');
  await fs.rm(zipPath, { force: true });
  execSync('zip -rq dist-deploy.zip dist-deploy', { cwd: process.cwd(), stdio: 'inherit' });

  console.log(`[route-fallbacks] generated ${ROUTE_FALLBACKS.length} fallback routes in dist/ and dist-deploy/`);
  console.log(`[route-fallbacks] aliased ${LEGACY_BROKEN_ENTRY_ALIASES.length} stale entry bundles to the current build`);
  console.log('[route-fallbacks] packaged dist-deploy.zip');
}

main().catch((error) => {
  console.error('[route-fallbacks] failed:', error.message || error);
  process.exit(1);
});
