import colibriLogo from '../assets/colibrisinfondo.png';
import millenniumSchoolCrest from '../assets/millennium-school-crest.png';
import berckleyCampusImage from '../assets/berckley-campus-primer-contacto.png';
import { areSchoolIdsCompatible, BERCKLEY_SCHOOL_ID } from './schools';

const MILLENNIUM_SCHOOL_ID = 'Millennium School';

export function getSchoolBulletinLogoSrc(schoolId = '') {
  if (areSchoolIdsCompatible(schoolId, MILLENNIUM_SCHOOL_ID)) {
    return millenniumSchoolCrest;
  }
  if (areSchoolIdsCompatible(schoolId, BERCKLEY_SCHOOL_ID)) {
    return berckleyCampusImage;
  }
  return colibriLogo;
}

export async function resolveSchoolBulletinLogoDataUrl(schoolId = '') {
  const src = getSchoolBulletinLogoSrc(schoolId);
  if (!src || typeof window === 'undefined') return '';
  try {
    const response = await fetch(src);
    if (!response.ok) return '';
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}
