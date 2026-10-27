import colibriLogo from '../assets/colibrisinfondo.png';
import millenniumSchoolCrest from '../assets/millennium-school-crest.png';
import millenniumPreschoolDiscoveryLogo from '../assets/millennium-preschool-discovery-logo.jpg';
import berckleyCampusImage from '../assets/berckley-campus-primer-contacto.png';
import { areSchoolIdsCompatible, BERCKLEY_SCHOOL_ID } from './schools';

const MILLENNIUM_SCHOOL_ID = 'Millennium School';

export function getSchoolBulletinLogoOptions(schoolId = '', { preschool = false } = {}) {
  if (areSchoolIdsCompatible(schoolId, MILLENNIUM_SCHOOL_ID) && preschool) {
    return {
      src: millenniumPreschoolDiscoveryLogo,
      layout: 'wide',
      imageFormat: 'JPEG',
      hideSchoolName: true,
    };
  }
  if (areSchoolIdsCompatible(schoolId, MILLENNIUM_SCHOOL_ID)) {
    return { src: millenniumSchoolCrest, layout: 'square', imageFormat: 'PNG', hideSchoolName: false };
  }
  if (areSchoolIdsCompatible(schoolId, BERCKLEY_SCHOOL_ID)) {
    return { src: berckleyCampusImage, layout: 'square', imageFormat: 'PNG', hideSchoolName: false };
  }
  return { src: colibriLogo, layout: 'square', imageFormat: 'PNG', hideSchoolName: false };
}

export function getSchoolBulletinLogoSrc(schoolId = '', options = {}) {
  return getSchoolBulletinLogoOptions(schoolId, options).src;
}

export async function resolveSchoolBulletinLogoDataUrl(schoolId = '', options = {}) {
  const src = getSchoolBulletinLogoSrc(schoolId, options);
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
