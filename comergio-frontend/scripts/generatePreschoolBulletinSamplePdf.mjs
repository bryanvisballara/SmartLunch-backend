import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfModuleUrl = pathToFileURL(join(__dirname, '../src/lib/preschoolBulletinPdfDocument.js')).href;
const {
  buildSamplePreschoolGeneralBulletin,
  createPreschoolBulletinStudentPdfDocument,
} = await import(pdfModuleUrl);

const logoPath = join(__dirname, '../src/assets/millennium-school-crest.png');
const schoolLogoDataUrl = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`;

const sample = buildSamplePreschoolGeneralBulletin();
const doc = createPreschoolBulletinStudentPdfDocument({ ...sample, schoolLogoDataUrl });
const outputPath = join(__dirname, '../../tmp/boletin-general-ejemplo-millennium.pdf');
writeFileSync(outputPath, Buffer.from(doc.output('arraybuffer')));
console.log(outputPath);
