import { openJsPdfDocument } from './openPdfDocument';
import {
  buildSamplePreschoolGeneralBulletin,
  createPreschoolBulletinStudentPdfDocument,
} from './preschoolBulletinPdfDocument';
import { resolveSchoolBulletinLogoDataUrl } from './schoolBulletinBranding';
import { getSchoolDisplayName } from './schools';

export { buildSamplePreschoolGeneralBulletin, createPreschoolBulletinStudentPdfDocument };

function normalizeText(value) {
  return String(value || '').trim();
}

export async function openPreschoolBulletinStudentPdf(options = {}) {
  const schoolId = options.schoolId || options.user?.schoolId || '';
  const schoolName = options.schoolName || getSchoolDisplayName({ schoolId, schoolName: options.schoolName }, 'Colegio');
  const schoolLogoDataUrl = options.schoolLogoDataUrl || await resolveSchoolBulletinLogoDataUrl(schoolId);

  const doc = createPreschoolBulletinStudentPdfDocument({
    documentTitle: 'Boletín general',
    ...options,
    schoolName,
    schoolLogoDataUrl,
  });
  const slug = normalizeText(options.student?.name).replace(/\s+/g, '-').toLowerCase() || 'estudiante';
  const fileName = `boletin-general-${slug}.pdf`;
  await openJsPdfDocument(doc, fileName);
}
