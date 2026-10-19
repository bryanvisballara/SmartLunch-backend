function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractGradeNumberLabel(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return '';
  }

  const numericMatch = normalizedValue.match(/(?:^|[^0-9])(\d{1,2})(?:[^0-9]|$)/);
  if (numericMatch) {
    return numericMatch[1];
  }

  const ordinalGrades = new Map([
    ['primero', '1'],
    ['segundo', '2'],
    ['tercero', '3'],
    ['cuarto', '4'],
    ['quinto', '5'],
    ['sexto', '6'],
    ['septimo', '7'],
    ['octavo', '8'],
    ['noveno', '9'],
    ['decimo', '10'],
    ['undecimo', '11'],
  ]);

  return ordinalGrades.get(normalizeKey(normalizedValue)) || '';
}

function extractSectionCodeFromCourseKey(value, gradeNumber = '') {
  const raw = normalizeText(value);
  if (!raw) {
    return '';
  }

  const parts = raw.split(':').map((part) => part.trim()).filter(Boolean);
  const tail = (parts.length > 1 ? parts[parts.length - 1] : raw).replace(/[\s_-]+/g, '');
  const tailUpper = tail.toUpperCase();
  const grade = String(gradeNumber || '');

  if (/^[A-Z]$/.test(tailUpper) && grade) {
    return `${grade}${tailUpper.toLowerCase()}`;
  }

  if (/^\d+[A-Z]$/.test(tailUpper)) {
    if (grade) {
      const nested = tailUpper.match(new RegExp(`^${grade}(\\d+[A-Z])$`));
      if (nested) {
        return nested[1].toLowerCase();
      }
    }
    return tailUpper.toLowerCase();
  }

  if (/^\d+$/.test(tailUpper) && grade && tailUpper !== grade) {
    return `${grade}${tailUpper}`.toLowerCase();
  }

  return tail ? tail.toLowerCase() : '';
}

export function formatGradeSectionDisplayLabel(course, options = {}) {
  const ignoreClassroomGroup = options.ignoreClassroomGroup === true;
  const classroomGroupLabel = normalizeText(course?.classroomGroupLabel);

  const gradeNumber = extractGradeNumberLabel(course?.gradeLevel)
    || extractGradeNumberLabel(course?.studentGradeKey)
    || extractGradeNumberLabel(classroomGroupLabel);

  const sectionCode = extractSectionCodeFromCourseKey(course?.sourceCourseKey, gradeNumber)
    || extractSectionCodeFromCourseKey(course?.section, gradeNumber)
    || extractSectionCodeFromCourseKey(course?.title, gradeNumber);

  if (gradeNumber && sectionCode) {
    return `${gradeNumber}-${sectionCode}`.toLowerCase();
  }

  if (!ignoreClassroomGroup && classroomGroupLabel) {
    return classroomGroupLabel;
  }

  if (sectionCode) {
    return sectionCode;
  }

  return gradeNumber || normalizeText(course?.studentGradeKey || course?.gradeLevel || '');
}
