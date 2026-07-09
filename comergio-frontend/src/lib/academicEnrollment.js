import { jsPDF } from 'jspdf';

export const ACADEMIC_MONTH_OPTIONS = [
  { value: 0, label: 'Enero' },
  { value: 1, label: 'Febrero' },
  { value: 2, label: 'Marzo' },
  { value: 3, label: 'Abril' },
  { value: 4, label: 'Mayo' },
  { value: 5, label: 'Junio' },
  { value: 6, label: 'Julio' },
  { value: 7, label: 'Agosto' },
  { value: 8, label: 'Septiembre' },
  { value: 9, label: 'Octubre' },
  { value: 10, label: 'Noviembre' },
  { value: 11, label: 'Diciembre' },
];

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function parseAcademicDateValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const isoDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoDateMatch) {
    return new Date(Date.UTC(Number(isoDateMatch[1]), Number(isoDateMatch[2]) - 1, Number(isoDateMatch[3])));
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function formatDate(value) {
  const parsed = parseAcademicDateValue(value);
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return 'Sin definir';
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function startOfAcademicMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addAcademicMonths(date, monthCount = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + Number(monthCount || 0), 1));
}

function getAcademicMonthDiff(startDate, endDate) {
  return ((endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12) + (endDate.getUTCMonth() - startDate.getUTCMonth());
}

function normalizeAcademicLateEnrollmentSurchargeType(value) {
  return ['percent', 'fixed'].includes(normalizeText(value)) ? normalizeText(value) : 'none';
}

function getAcademicGradeAliases(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return [];
  const aliases = new Set([normalized]);
  const normalizedLetters = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
  if (normalizedLetters.includes('prejardin')) aliases.add('prejardin');
  else if (normalizedLetters.includes('jardin')) aliases.add('jardin');
  if (normalizedLetters.includes('transicion')) aliases.add('transicion');

  normalized.split(':').map((part) => normalizeText(part).toLowerCase()).filter(Boolean).forEach((part) => aliases.add(part));

  const sectionMatch = normalized.match(/^(\d{1,2})\s*[-_/ ]?\s*[a-z]$/i);
  if (sectionMatch) {
    aliases.add(sectionMatch[1]);
  }

  const numericMatch = normalized.match(/(?:^|[^\d])(\d{1,2})(?:\s*[-_/ ]?\s*[a-z])?(?:$|[^\d])/i);
  if (numericMatch) {
    aliases.add(numericMatch[1]);
  }

  return [...aliases].filter(Boolean);
}

function resolveAcademicSchoolYearLevelSetting(configuration = {}, grade = '', options = {}) {
  const { academicGrades = [] } = options;
  const aliases = new Set(getAcademicGradeAliases(grade));
  const schoolYearLevels = Array.isArray(configuration?.schoolYearLevels) ? configuration.schoolYearLevels : [];

  const byGradeKeys = schoolYearLevels.find((levelSetting) => {
    const gradeKeys = Array.isArray(levelSetting?.gradeKeys) ? levelSetting.gradeKeys : [];
    return gradeKeys.some((gradeKey) => getAcademicGradeAliases(gradeKey).some((alias) => aliases.has(alias)));
  });
  if (byGradeKeys) {
    return byGradeKeys;
  }

  const matchedGrade = (Array.isArray(academicGrades) ? academicGrades : []).find((gradeItem) => {
    const gradeAliases = getAcademicGradeAliases(gradeItem?.key || gradeItem?.grade);
    return gradeAliases.some((alias) => aliases.has(alias));
  });
  const levelKey = normalizeText(matchedGrade?.levelKey).toLowerCase();
  if (!levelKey) {
    return null;
  }

  return schoolYearLevels.find((levelSetting) => normalizeText(levelSetting?.levelKey).toLowerCase() === levelKey) || null;
}

function formatAcademicMonthLabel(date) {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function normalizeAcademicSchoolYearConfiguration(configuration = {}, grade = '', options = {}) {
  const levelSetting = resolveAcademicSchoolYearLevelSetting(configuration, grade, options);
  const sourceConfiguration = levelSetting || configuration || {};
  const currentYear = new Date().getFullYear();
  const fallbackStartDate = new Date(currentYear, 0, 1);
  const fallbackEndDate = new Date(currentYear, 11, 31);
  const parsedStartDate = parseAcademicDateValue(sourceConfiguration?.schoolYearStartDate || sourceConfiguration?.startDate || configuration?.schoolYearStartDate || configuration?.startDate) || fallbackStartDate;
  const parsedEndDate = parseAcademicDateValue(sourceConfiguration?.schoolYearEndDate || sourceConfiguration?.endDate || configuration?.schoolYearEndDate || configuration?.endDate) || fallbackEndDate;
  const startDate = parsedStartDate.getTime() <= parsedEndDate.getTime() ? parsedStartDate : parsedEndDate;
  const endDate = parsedStartDate.getTime() <= parsedEndDate.getTime() ? parsedEndDate : parsedStartDate;

  return {
    startDate,
    endDate,
    totalMonths: Math.max(1, getAcademicMonthDiff(startOfAcademicMonth(startDate), startOfAcademicMonth(endDate)) + 1),
    lateEnrollmentSurchargeType: normalizeAcademicLateEnrollmentSurchargeType(sourceConfiguration?.lateEnrollmentSurchargeType),
    lateEnrollmentSurchargeValue: Math.max(0, Number(sourceConfiguration?.lateEnrollmentSurchargeValue || 0)),
    enrollmentBenefitRules: normalizeAcademicEnrollmentBenefitRules(configuration?.enrollmentBenefitRules || []),
  };
}

function normalizeBenefitFixedAmountsByGrade(rawAmounts = {}) {
  const entries = rawAmounts instanceof Map ? Array.from(rawAmounts.entries()) : Object.entries(rawAmounts || {});
  return entries.reduce((accumulator, [grade, amount]) => {
    const normalizedGrade = normalizeText(grade).toLowerCase();
    if (!normalizedGrade) {
      return accumulator;
    }

    accumulator[normalizedGrade] = Math.max(0, Math.round(Number(amount || 0)));
    return accumulator;
  }, {});
}

function getFeeGradeAliases(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return [];
  const aliases = new Set([normalized]);
  const [, suffix] = normalized.split(':');
  if (suffix) aliases.add(normalizeText(suffix).toLowerCase());
  return [...aliases].filter(Boolean);
}

function getFixedBenefitAmountForGrade(rule = {}, grade = '') {
  const amountsByGrade = normalizeBenefitFixedAmountsByGrade(rule.fixedAmountsByGrade || {});
  const aliases = getFeeGradeAliases(grade);
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(amountsByGrade, alias)) {
      return Math.max(0, Number(amountsByGrade[alias] || 0));
    }
  }

  return 0;
}

function doesEnrollmentBenefitRuleApplyToGrade(rule = {}, grade = '') {
  const aliases = new Set(getFeeGradeAliases(grade));
  const targetGradeKeys = Array.isArray(rule?.targetGradeKeys) ? rule.targetGradeKeys.flatMap(getFeeGradeAliases) : [];
  if (targetGradeKeys.length > 0) {
    return targetGradeKeys.some((gradeKey) => aliases.has(gradeKey));
  }

  const amountsByGrade = normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade || {});
  const hasFixedAmountsByGrade = Object.keys(amountsByGrade).length > 0;
  if (normalizeText(rule?.discountType) === 'fixed' || hasFixedAmountsByGrade) {
    return getFixedBenefitAmountForGrade(rule, grade) > 0;
  }

  return true;
}

function normalizeAcademicEnrollmentBenefitRules(rules = []) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule, index) => {
      const startDate = parseAcademicDateValue(rule?.startDate);
      const endDate = parseAcademicDateValue(rule?.endDate);
      if (!startDate || !endDate) {
        return null;
      }

      const discountType = normalizeText(rule?.discountType) === 'fixed' ? 'fixed' : 'percent';
      return {
        label: normalizeText(rule?.label) || `Beneficio matricula ${index + 1}`,
        startDate: startDate.getTime() <= endDate.getTime() ? startDate : endDate,
        endDate: startDate.getTime() <= endDate.getTime() ? endDate : startDate,
        discountType,
        discountPercent: discountType === 'percent' ? Math.min(100, Math.max(0, Number(rule?.discountPercent || 0))) : 0,
        fixedAmountsByGrade: normalizeBenefitFixedAmountsByGrade(rule?.fixedAmountsByGrade || {}),
        targetGradeKeys: Array.isArray(rule?.targetGradeKeys) ? rule.targetGradeKeys.map(normalizeText).filter(Boolean) : [],
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
}

function getApplicableEnrollmentBenefitRule(enrollmentBenefitRules = [], entryDateValue = null, grade = '') {
  const entryDate = parseAcademicDateValue(entryDateValue);
  if (!entryDate) {
    return null;
  }

  return (Array.isArray(enrollmentBenefitRules) ? enrollmentBenefitRules : []).find((rule) => {
    if (!doesEnrollmentBenefitRuleApplyToGrade(rule, grade)) {
      return false;
    }

    const startDate = parseAcademicDateValue(rule?.startDate);
    const endDate = parseAcademicDateValue(rule?.endDate);
    if (!startDate || !endDate) {
      return false;
    }

    return entryDate.getTime() >= startDate.getTime() && entryDate.getTime() <= endDate.getTime();
  }) || null;
}

function resolveAcademicEnrollmentBenefitDiscountAmount(amount, benefitRule = null, grade = '') {
  const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (!benefitRule || safeAmount <= 0) {
    return 0;
  }

  if (normalizeText(benefitRule.discountType) === 'fixed') {
    return Math.min(safeAmount, Math.max(0, Math.round(getFixedBenefitAmountForGrade(benefitRule, grade))));
  }

  return Math.min(safeAmount, Math.round((safeAmount * Math.min(100, Math.max(0, Number(benefitRule.discountPercent || 0)))) / 100));
}

function resolveAcademicLateEnrollmentSurchargeAmount(baseAmount, elapsedMonths, configuration = {}) {
  if (baseAmount <= 0 || elapsedMonths <= 0) {
    return 0;
  }

  if (configuration.lateEnrollmentSurchargeType === 'percent') {
    return Math.round((baseAmount * configuration.lateEnrollmentSurchargeValue) / 100);
  }

  if (configuration.lateEnrollmentSurchargeType === 'fixed') {
    return Math.round(configuration.lateEnrollmentSurchargeValue);
  }

  return 0;
}

export function calculateAcademicProratedEnrollmentFee(annualAmount, entryDateValue, configuration = {}, grade = '', options = {}) {
  const safeAnnualAmount = Math.max(0, Number(annualAmount || 0));
  const schoolYearConfiguration = normalizeAcademicSchoolYearConfiguration(configuration, grade, options);
  const parsedDate = parseAcademicDateValue(entryDateValue);
  if (!parsedDate) {
    return {
      amount: safeAnnualAmount,
      baseAmount: safeAnnualAmount,
      remainingMonths: schoolYearConfiguration.totalMonths,
      elapsedMonths: 0,
      totalMonths: schoolYearConfiguration.totalMonths,
      monthIndex: schoolYearConfiguration.startDate.getMonth(),
      monthLabel: 'Año completo',
      lateEnrollmentSurchargeAmount: 0,
      isLateEnrollment: false,
      enrollmentBenefitDiscountAmount: 0,
      enrollmentBenefitLabel: '',
    };
  }

  const entryMonth = startOfAcademicMonth(parsedDate);
  const schoolYearStartMonth = startOfAcademicMonth(schoolYearConfiguration.startDate);
  const schoolYearEndMonth = startOfAcademicMonth(schoolYearConfiguration.endDate);
  const rawElapsedMonths = entryMonth.getTime() > schoolYearStartMonth.getTime()
    ? getAcademicMonthDiff(schoolYearStartMonth, entryMonth)
    : 0;

  if (entryMonth.getTime() > schoolYearEndMonth.getTime()) {
    return {
      amount: 0,
      baseAmount: 0,
      remainingMonths: 0,
      elapsedMonths: schoolYearConfiguration.totalMonths,
      totalMonths: schoolYearConfiguration.totalMonths,
      monthIndex: parsedDate.getMonth(),
      monthLabel: formatAcademicMonthLabel(parsedDate),
      lateEnrollmentSurchargeAmount: 0,
      isLateEnrollment: false,
      enrollmentBenefitDiscountAmount: 0,
      enrollmentBenefitLabel: '',
    };
  }

  const elapsedMonths = Math.max(0, Math.min(schoolYearConfiguration.totalMonths - 1, rawElapsedMonths));
  const remainingMonths = Math.max(1, Math.min(schoolYearConfiguration.totalMonths, schoolYearConfiguration.totalMonths - elapsedMonths));
  const baseAmount = Math.round((safeAnnualAmount * remainingMonths) / schoolYearConfiguration.totalMonths);
  const lateEnrollmentSurchargeAmount = resolveAcademicLateEnrollmentSurchargeAmount(baseAmount, elapsedMonths, schoolYearConfiguration);
  const amountBeforeDiscount = baseAmount + lateEnrollmentSurchargeAmount;
  const enrollmentBenefitRule = getApplicableEnrollmentBenefitRule(schoolYearConfiguration.enrollmentBenefitRules, parsedDate, grade);
  const enrollmentBenefitDiscountAmount = resolveAcademicEnrollmentBenefitDiscountAmount(amountBeforeDiscount, enrollmentBenefitRule, grade);
  const monthIndex = parsedDate.getUTCMonth();
  return {
    amount: Math.max(0, amountBeforeDiscount - enrollmentBenefitDiscountAmount),
    baseAmount,
    remainingMonths,
    elapsedMonths,
    totalMonths: schoolYearConfiguration.totalMonths,
    monthIndex,
    monthLabel: formatAcademicMonthLabel(parsedDate),
    lateEnrollmentSurchargeAmount,
    isLateEnrollment: lateEnrollmentSurchargeAmount > 0,
    enrollmentBenefitDiscountAmount,
    enrollmentBenefitLabel: normalizeText(enrollmentBenefitRule?.label),
  };
}

export function buildAcademicEnrollmentProrationTable(annualAmount, configuration = {}, grade = '', options = {}) {
  const schoolYearConfiguration = normalizeAcademicSchoolYearConfiguration(configuration, grade, options);
  const startMonth = startOfAcademicMonth(schoolYearConfiguration.startDate);

  return Array.from({ length: schoolYearConfiguration.totalMonths }, (_, index) => {
    const monthDate = addAcademicMonths(startMonth, index);
    return {
      key: `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, '0')}`,
      value: monthDate.getUTCMonth(),
      label: formatAcademicMonthLabel(monthDate),
      ...calculateAcademicProratedEnrollmentFee(annualAmount, monthDate, schoolYearConfiguration, grade),
    };
  });
}

export function isAcademicParentDraftComplete(parentDraft = {}) {
  return [
    parentDraft.name,
    parentDraft.documentType,
    parentDraft.documentNumber,
    parentDraft.phone,
    parentDraft.email,
    parentDraft.address,
  ].every((value) => normalizeText(value));
}

export function isAcademicStudentDraftComplete(studentDraft = {}) {
  return [
    studentDraft.firstName,
    studentDraft.lastName,
    studentDraft.gender,
    studentDraft.documentType,
    studentDraft.documentNumber,
    studentDraft.birthDate,
    studentDraft.bloodType,
    studentDraft.birthPlace,
    studentDraft.address,
    studentDraft.grade,
    studentDraft.entryDate,
  ].every((value) => normalizeText(value));
}

export function downloadAcademicEnrollmentContractPdf({
  schoolName,
  father,
  mother,
  student,
  gradeLabel,
  pricing,
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - 72;
  let cursorY = 54;

  const writeBlock = (text, { size = 11, weight = 'normal', gapAfter = 12 } = {}) => {
    doc.setFont('helvetica', weight);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text || ''), maxWidth);
    doc.text(lines, 36, cursorY);
    cursorY += (lines.length * (size + 4)) + gapAfter;
  };

  writeBlock(`Contrato de matricula provisional - ${normalizeText(schoolName) || 'Colegio'}`, { size: 18, weight: 'bold', gapAfter: 8 });
  writeBlock('Plantilla inicial de contrato generada desde Secretaria Academica. El texto juridico definitivo sera reemplazado cuando compartas el contrato final.', { size: 10, gapAfter: 18 });

  writeBlock('Datos del alumno', { size: 13, weight: 'bold', gapAfter: 6 });
  writeBlock(`Nombre completo: ${normalizeText(`${student.firstName} ${student.lastName}`)}`);
  writeBlock(`Grado: ${normalizeText(gradeLabel)}`);
  writeBlock(`Documento: ${normalizeText(student.documentType)} ${normalizeText(student.documentNumber)}`);
  writeBlock(`Fecha de nacimiento: ${formatDate(student.birthDate)}`);
  writeBlock(`Fecha de ingreso: ${formatDate(student.entryDate)}`);
  writeBlock(`Direccion: ${normalizeText(student.address)}`);

  writeBlock('Acudiente(s) registrado(s)', { size: 13, weight: 'bold', gapAfter: 6 });
  if (isAcademicParentDraftComplete(father)) {
    writeBlock(`Padre: ${normalizeText(father.name)} · ${normalizeText(father.documentType)} ${normalizeText(father.documentNumber)} · ${normalizeText(father.phone)} · ${normalizeText(father.email)}`);
  }
  if (isAcademicParentDraftComplete(mother)) {
    writeBlock(`Madre: ${normalizeText(mother.name)} · ${normalizeText(mother.documentType)} ${normalizeText(mother.documentNumber)} · ${normalizeText(mother.phone)} · ${normalizeText(mother.email)}`);
  }

  writeBlock('Condiciones economicas registradas en el formulario', { size: 13, weight: 'bold', gapAfter: 6 });
  writeBlock(`Bono unico: ${formatCurrency(pricing.enrollmentBonusAmount)}`);
  writeBlock(`Bono financiado a: ${pricing.enrollmentBonusInstallments} mes(es)`);
  writeBlock(`Matricula segun fecha de ingreso: ${formatCurrency(pricing.proratedAnnualTuitionAmount)}`);
  if (Number(pricing.lateEnrollmentSurchargeAmount || 0) > 0) {
    writeBlock(`Recargo por matricula tardia: ${formatCurrency(pricing.lateEnrollmentSurchargeAmount)}`);
  }
  if (Number(pricing.enrollmentBenefitDiscountAmount || 0) > 0) {
    writeBlock(`Beneficio en matricula: ${formatCurrency(pricing.enrollmentBenefitDiscountAmount)}${pricing.enrollmentBenefitLabel ? ` · ${pricing.enrollmentBenefitLabel}` : ''}`);
  }
  writeBlock(`Matricula financiada a: ${pricing.annualTuitionInstallments} mes(es)`);
  writeBlock(`Descuento adicional en matricula: ${Number(pricing.annualTuitionAdditionalDiscountPercent || 0)}%${pricing.annualTuitionAdditionalDiscountLabel ? ` · ${pricing.annualTuitionAdditionalDiscountLabel}` : ''}`);
  writeBlock(`Pension mensual base: ${formatCurrency(pricing.monthlyTuitionAmount)}`);
  writeBlock(`Descuento adicional en pension: ${pricing.monthlyTuitionAdditionalDiscountPercent}%${pricing.monthlyTuitionAdditionalDiscountLabel ? ` · ${pricing.monthlyTuitionAdditionalDiscountLabel}` : ''}`);

  writeBlock('Clausulas preliminares', { size: 13, weight: 'bold', gapAfter: 6 });
  writeBlock('1. El acudiente declara que la informacion registrada en el formulario de matricula es veraz y autoriza su uso para fines academicos, administrativos y de facturacion.');
  writeBlock('2. El colegio y la familia aceptan que los costos aqui reflejados corresponden a la simulacion vigente al momento de la generacion del documento y podran consolidarse en el contrato final.');
  writeBlock('3. Este PDF es una estructura provisional de contrato generada automaticamente. El clausulado definitivo sera sustituido por el documento oficial proporcionado por la institucion.');

  writeBlock(`Generado el ${formatDate(new Date())}.`, { size: 10, gapAfter: 18 });
  writeBlock('Firma acudiente: ________________________________', { gapAfter: 18 });
  writeBlock('Firma institucion: ______________________________', { gapAfter: 18 });

  const studentNameSlug = normalizeText(`${student.firstName}-${student.lastName}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'alumno';
  doc.save(`contrato-matricula-${studentNameSlug}.pdf`);
}