import { jsPDF } from 'jspdf';
import millenniumSchoolCrest from '../assets/millennium-school-crest.png';
import { isEducationalLevelKey } from './feeGradeMatching';
import { openJsPdfDocument } from './openPdfDocument';
import contratoPreescolarTemplate from './contracts/millennium/contrato-matricula-preescolar-template.txt?raw';
import contratoPrimariaSecundariaTemplate from './contracts/millennium/contrato-matricula-primaria-secundaria-template.txt?raw';
import pagareTemplate from './contracts/millennium/pagare-carta-template.txt?raw';

export { millenniumSchoolCrest };

const MILLENNIUM_SCHOOL_IDS = new Set(['millennium school', 'millennium']);

const OFFICIAL_ENROLLMENT_CONTRACT_SCHOOL_IDS = new Set([
  'comergio-demo',
  'comergio_demo',
  'comergio_demo_kns8p',
  'comergio demo',
]);

function applyPercentDiscount(amount, discountPercent) {
  const safeAmount = Math.max(0, Number(amount || 0));
  const safePercent = Math.min(100, Math.max(0, Number(discountPercent || 0)));
  return Math.max(0, Math.round(safeAmount - (safeAmount * safePercent / 100)));
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const COUNT_WORDS = {
  1: 'UNA', 2: 'DOS', 3: 'TRES', 4: 'CUATRO', 5: 'CINCO',
  6: 'SEIS', 7: 'SIETE', 8: 'OCHO', 9: 'NUEVE', 10: 'DIEZ',
  11: 'ONCE', 12: 'DOCE',
};

function normalizeText(value) {
  return String(value || '').trim();
}

function toUpperName(value) {
  return normalizeText(value).toLocaleUpperCase('es-CO');
}

function formatCurrencyNumber(value) {
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(Number(value || 0))));
}

function extractCityFromAddress(address) {
  const normalized = normalizeText(address);
  if (!normalized) {
    return '________________';
  }

  const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function formatParentDocument(parent = {}) {
  const documentType = normalizeText(parent.documentType) || 'CC';
  const documentNumber = normalizeText(parent.documentNumber) || '____________';
  return `${documentType}. ${documentNumber}`;
}

function hasParentIdentity(parent = {}) {
  return Boolean(normalizeText(parent.name));
}

function getPrimaryParent({ father = {}, mother = {}, primaryGuardian = 'mother' } = {}) {
  return primaryGuardian === 'father' ? father : mother;
}

function getSecondaryParent({ father = {}, mother = {}, primaryGuardian = 'mother' } = {}) {
  return primaryGuardian === 'father' ? mother : father;
}

function buildDebtorSlot(parent = {}, fallbackLabel = '________________') {
  if (!hasParentIdentity(parent)) {
    return {
      name: fallbackLabel,
      doc: '____________',
      address: '____________',
      phoneRes: '____________',
      phoneOffice: '',
      mobile: '____________',
      email: '____________',
    };
  }

  const phone = normalizeText(parent.phone) || '____________';

  return {
    name: toUpperName(parent.name),
    doc: formatParentDocument(parent),
    address: normalizeText(parent.address) || '____________',
    phoneRes: phone,
    phoneOffice: '',
    mobile: phone,
    email: normalizeText(parent.email) || '____________',
  };
}

function numberToWordsSpanish(amount) {
  const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
  if (!safeAmount) {
    return 'CERO';
  }

  const units = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const tens = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  const convertBelowThousand = (value) => {
    if (value === 0) return '';
    if (value === 100) return 'CIEN';

    const hundred = Math.floor(value / 100);
    const remainder = value % 100;
    const ten = Math.floor(remainder / 10);
    const unit = remainder % 10;
    const parts = [];

    if (hundred) {
      parts.push(hundreds[hundred]);
    }

    if (remainder >= 10 && remainder < 20) {
      parts.push(teens[remainder - 10]);
    } else {
      if (ten === 2 && unit > 0) {
        parts.push(`VEINTI${units[unit].toLowerCase()}`.toUpperCase());
      } else {
        if (ten) parts.push(tens[ten]);
        if (unit) parts.push(ten > 0 ? `Y ${units[unit]}` : units[unit]);
      }
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };

  const billions = Math.floor(safeAmount / 1000000000);
  const millions = Math.floor((safeAmount % 1000000000) / 1000000);
  const thousands = Math.floor((safeAmount % 1000000) / 1000);
  const remainder = safeAmount % 1000;
  const parts = [];

  if (billions) {
    parts.push(`${billions === 1 ? 'UN MILLON' : `${convertBelowThousand(billions)} MILLONES`}`);
  }
  if (millions) {
    parts.push(millions === 1 ? 'UN MILLON' : `${convertBelowThousand(millions)} MILLONES`);
  }
  if (thousands) {
    parts.push(thousands === 1 ? 'MIL' : `${convertBelowThousand(thousands)} MIL`);
  }
  if (remainder) {
    parts.push(convertBelowThousand(remainder));
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function fillTemplate(template, values = {}) {
  return Object.entries(values).reduce((result, [key, value]) => {
    const token = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    return result.replace(token, String(value ?? ''));
  }, template);
}

function getContractDateParts(date = new Date()) {
  return {
    CONTRACT_DAY: String(date.getDate()),
    CONTRACT_MONTH: MONTH_NAMES[date.getMonth()] || '__________',
    CONTRACT_YEAR: String(date.getFullYear()),
  };
}

function normalizeGradeLookupValue(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isPreschoolEnrollmentGrade({ grade = '', gradeLabel = '' } = {}) {
  const candidates = [grade, gradeLabel].map(normalizeText).filter(Boolean);
  if (!candidates.length) {
    return false;
  }

  return candidates.some((candidate) => {
    if (isEducationalLevelKey(candidate)) {
      return true;
    }

    const normalized = normalizeGradeLookupValue(candidate);
    if (!normalized) {
      return false;
    }

    return /^(maternal|kinder|prep|prejardin|jardin|transicion|toddlers|infants|nursery|k-grade|kgrade)/.test(normalized)
      || normalized.includes('preescolar');
  });
}

function resolveEnrollmentContractParams(contractParams = {}, context = {}) {
  return {
    grade: contractParams?.student?.grade || context?.STUDENT_GRADE || '',
    gradeLabel: contractParams?.gradeLabel || context?.GRADE_LABEL || '',
  };
}

export function usesPreschoolEnrollmentContractTemplate(contractParams = {}, context = {}) {
  return isPreschoolEnrollmentGrade(resolveEnrollmentContractParams(contractParams, context));
}

function getEnrollmentContractTemplate(contractParams = {}, context = {}) {
  return usesPreschoolEnrollmentContractTemplate(contractParams, context)
    ? contratoPreescolarTemplate
    : contratoPrimariaSecundariaTemplate;
}

export function getEnrollmentContractDocumentTitle(contractParams = {}, context = {}) {
  return usesPreschoolEnrollmentContractTemplate(contractParams, context)
    ? 'CONTRATO DE MATRÍCULA Y PRESTACIÓN DE SERVICIOS EDUCATIVOS AÑO ACADEMICO 2026-2027'
    : 'CONTRATO DE MATRÍCULA 2026-27';
}

export function isMillenniumSchool(schoolName = '', schoolId = '') {
  const normalized = normalizeText(schoolName).toLowerCase();
  const normalizedId = normalizeText(schoolId).toLowerCase();
  return MILLENNIUM_SCHOOL_IDS.has(normalized)
    || MILLENNIUM_SCHOOL_IDS.has(normalizedId)
    || normalized.includes('millennium')
    || normalizedId.includes('millennium');
}

export function shouldHideParentEnrollmentPaymentAmount({ schoolId = '', schoolName = '' } = {}) {
  return isMillenniumSchool(schoolName, schoolId);
}

export function usesOfficialEnrollmentContractTemplate({ schoolId = '', schoolName = '' } = {}) {
  if (isMillenniumSchool(schoolName)) {
    return true;
  }

  const normalizedId = normalizeText(schoolId).toLowerCase();
  const normalizedName = normalizeText(schoolName).toLowerCase();

  if (OFFICIAL_ENROLLMENT_CONTRACT_SCHOOL_IDS.has(normalizedId)
    || OFFICIAL_ENROLLMENT_CONTRACT_SCHOOL_IDS.has(normalizedName)) {
    return true;
  }

  return normalizedId.includes('comergio_demo')
    || normalizedId.includes('comergio-demo')
    || normalizedName.includes('comergio demo');
}

export function normalizeOfficialEnrollmentContractParams(snapshot = {}) {
  const pricing = snapshot.pricing || {};
  const proratedAnnualTuitionAmount = Math.max(
    0,
    Math.round(Number(pricing.proratedAnnualTuitionAmount || snapshot.paidAmount || 0)),
  );
  const annualTuitionAdditionalDiscountPercent = Number(pricing.annualTuitionAdditionalDiscountPercent || 0);
  const discountedAnnualTuitionAmount = applyPercentDiscount(
    proratedAnnualTuitionAmount,
    annualTuitionAdditionalDiscountPercent,
  );

  return {
    schoolId: snapshot.schoolId || '',
    schoolName: snapshot.schoolName || '',
    father: snapshot.father || {},
    mother: snapshot.mother || {},
    primaryGuardian: snapshot.primaryGuardian || 'mother',
    student: snapshot.student || {},
    gradeLabel: normalizeText(snapshot.gradeLabel || snapshot.student?.grade),
    pricing: {
      ...pricing,
      proratedAnnualTuitionAmount: discountedAnnualTuitionAmount || proratedAnnualTuitionAmount,
      proratedAnnualTuitionBaseAmount: Math.max(
        0,
        Math.round(Number(pricing.proratedAnnualTuitionBaseAmount || proratedAnnualTuitionAmount || 0)),
      ),
      monthlyTuitionAmount: applyPercentDiscount(
        pricing.monthlyTuitionAmount,
        pricing.monthlyTuitionAdditionalDiscountPercent,
      ),
    },
  };
}

export function canUseOfficialEnrollmentContract(params = {}) {
  return usesOfficialEnrollmentContractTemplate({
    schoolId: params.schoolId,
    schoolName: params.schoolName,
  }) && canPreviewMillenniumEnrollmentContracts(params);
}

export function canPreviewMillenniumEnrollmentContracts({
  father = {},
  mother = {},
  primaryGuardian = 'mother',
  student = {},
} = {}) {
  const primaryParent = getPrimaryParent({ father, mother, primaryGuardian });
  return Boolean(
    normalizeText(student.firstName)
    && normalizeText(student.lastName)
    && normalizeText(student.grade)
    && hasParentIdentity(primaryParent)
  );
}

export function buildMillenniumEnrollmentContractContext({
  father = {},
  mother = {},
  primaryGuardian = 'mother',
  student = {},
  gradeLabel = '',
  pricing = {},
} = {}) {
  const primaryParent = getPrimaryParent({ father, mother, primaryGuardian });
  const debtorOne = buildDebtorSlot(father);
  const debtorTwo = buildDebtorSlot(mother);
  const studentNameUpper = toUpperName(`${normalizeText(student.firstName)} ${normalizeText(student.lastName)}`);
  const financialResponsibleNameUpper = toUpperName(primaryParent.name);
  const monthlyTuitionAmount = Math.max(0, Math.round(Number(pricing.monthlyTuitionAmount || 0)));
  const enrollmentFeeAmount = Math.max(0, Math.round(Number(pricing.proratedAnnualTuitionAmount || 0)));
  const installmentCount = Math.max(1, Number(pricing.annualTuitionInstallments || 10));
  const annualTuitionAmount = monthlyTuitionAmount * installmentCount;
  const annualTotalAmount = annualTuitionAmount;
  const annualServiceTotalAmount = enrollmentFeeAmount + annualTuitionAmount;
  const pagareTotalAmount = enrollmentFeeAmount;
  const installmentAmount = Math.max(0, Math.round(pagareTotalAmount / installmentCount));
  const latePaymentAmount = Math.max(0, Math.round(monthlyTuitionAmount * 1.133));
  const dateParts = getContractDateParts();

  return {
    ...dateParts,
    STUDENT_GRADE: normalizeText(student.grade),
    STUDENT_NAME_UPPER: studentNameUpper || '________________',
    GRADE_LABEL: normalizeText(gradeLabel) || normalizeText(student.grade) || '____',
    FINANCIAL_RESPONSIBLE_NAME_UPPER: financialResponsibleNameUpper || '________________',
    FINANCIAL_RESPONSIBLE_DOC_TYPE: normalizeText(primaryParent.documentType) || 'CC',
    FINANCIAL_RESPONSIBLE_DOC_NUMBER: normalizeText(primaryParent.documentNumber) || '____________',
    FINANCIAL_RESPONSIBLE_DOC_CITY: extractCityFromAddress(primaryParent.address),
    FINANCIAL_RESPONSIBLE_ADDRESS: normalizeText(primaryParent.address) || '____________',
    FINANCIAL_RESPONSIBLE_PHONE: normalizeText(primaryParent.phone) || '____________',
    FINANCIAL_RESPONSIBLE_EMAIL: normalizeText(primaryParent.email) || '____________',
    ANNUAL_TOTAL_AMOUNT: formatCurrencyNumber(annualTotalAmount),
    ANNUAL_TUITION_AMOUNT: formatCurrencyNumber(annualTuitionAmount),
    ANNUAL_TUITION_AMOUNT_WORDS: numberToWordsSpanish(annualTuitionAmount),
    ANNUAL_SERVICE_TOTAL_AMOUNT: formatCurrencyNumber(annualServiceTotalAmount),
    ANNUAL_SERVICE_TOTAL_AMOUNT_WORDS: numberToWordsSpanish(annualServiceTotalAmount),
    MONTHLY_TUITION_AMOUNT: formatCurrencyNumber(monthlyTuitionAmount),
    ENROLLMENT_FEE_AMOUNT: formatCurrencyNumber(enrollmentFeeAmount),
    ENROLLMENT_FEE_AMOUNT_WORDS: numberToWordsSpanish(enrollmentFeeAmount),
    LATE_PAYMENT_AMOUNT: formatCurrencyNumber(latePaymentAmount),
    LATE_PAYMENT_AMOUNT_WORDS: numberToWordsSpanish(latePaymentAmount),
    LATE_PAYMENT_AMOUNT_1: formatCurrencyNumber(latePaymentAmount),
    LATE_PAYMENT_AMOUNT_2: formatCurrencyNumber(Math.round(monthlyTuitionAmount * 1.333)),
    INSTALLMENT_COUNT: String(installmentCount),
    INSTALLMENT_COUNT_WORDS: COUNT_WORDS[installmentCount] || String(installmentCount),
    INSTALLMENT_AMOUNT: formatCurrencyNumber(installmentAmount),
    INSTALLMENT_AMOUNT_WORDS: numberToWordsSpanish(installmentAmount),
    TOTAL_AMOUNT: formatCurrencyNumber(pagareTotalAmount),
    TOTAL_AMOUNT_WORDS: numberToWordsSpanish(pagareTotalAmount),
    DEBTOR_ONE_NAME: debtorOne.name,
    DEBTOR_ONE_DOC: debtorOne.doc,
    DEBTOR_ONE_ADDRESS: debtorOne.address,
    DEBTOR_ONE_PHONE: debtorOne.mobile,
    DEBTOR_ONE_EMAIL: debtorOne.email,
    DEBTOR_TWO_NAME: debtorTwo.name,
    DEBTOR_TWO_DOC: debtorTwo.doc,
    DEBTOR_TWO_ADDRESS: debtorTwo.address,
    DEBTOR_TWO_PHONE: debtorTwo.mobile,
    DEBTOR_TWO_EMAIL: debtorTwo.email,
  };
}

export function getPagareDebtorColumns(context = {}) {
  return {
    debtorOne: buildDebtorSlot(context.father || {}),
    debtorTwo: buildDebtorSlot(context.mother || {}),
  };
}

const PAGARE_DEBTORS_TABLE_MARKER = '[[DEBTORS_TABLE]]';
const ENROLLMENT_CONTRACTORS_TABLE_MARKER = '[[CONTRACTORS_TABLE]]';
const ENROLLMENT_INSTITUTION_SIGNATURE_MARKER = '[[INSTITUTION_SIGNATURE_BLOCK]]';
const ENROLLMENT_SIGNATURE_MARKER = '[[SIGNATURE_BLOCK]]';

const ENROLLMENT_CONTRACT_MARKERS = [
  { marker: ENROLLMENT_CONTRACTORS_TABLE_MARKER, type: 'contractors-table' },
  { marker: ENROLLMENT_INSTITUTION_SIGNATURE_MARKER, type: 'institution-signature-block' },
  { marker: ENROLLMENT_SIGNATURE_MARKER, type: 'signature-block' },
];

const MILLENNIUM_LEGAL_REPRESENTATIVE = {
  name: 'LUISA FERNANDA BENNEDETTI LARA',
  doc: 'CC. 1.045.734.045 de Barranquilla',
  role: 'Representante Legal',
  school: 'MILLENNIUM SCHOOL',
};

export function parsePagareDocumentSections(content) {
  const sections = [];
  let remaining = String(content || '');

  while (remaining.includes(PAGARE_DEBTORS_TABLE_MARKER)) {
    const markerIndex = remaining.indexOf(PAGARE_DEBTORS_TABLE_MARKER);
    const before = remaining.slice(0, markerIndex).trim();

    if (before) {
      sections.push({ type: 'text', content: before });
    }

    sections.push({ type: 'debtors-table' });
    remaining = remaining.slice(markerIndex + PAGARE_DEBTORS_TABLE_MARKER.length);
  }

  if (remaining.trim()) {
    sections.push({ type: 'text', content: remaining.trim() });
  }

  return sections;
}

export function parseEnrollmentContractSections(content) {
  const sections = [];
  let remaining = String(content || '');

  while (remaining.length > 0) {
    let nextMarker = null;
    let nextMarkerIndex = -1;

    ENROLLMENT_CONTRACT_MARKERS.forEach((entry) => {
      const markerIndex = remaining.indexOf(entry.marker);
      if (markerIndex === -1) {
        return;
      }

      if (nextMarkerIndex === -1 || markerIndex < nextMarkerIndex) {
        nextMarkerIndex = markerIndex;
        nextMarker = entry;
      }
    });

    if (!nextMarker || nextMarkerIndex === -1) {
      const trailingContent = remaining.trim();
      if (trailingContent) {
        sections.push({ type: 'text', content: trailingContent });
      }
      break;
    }

    const before = remaining.slice(0, nextMarkerIndex).trim();
    if (before) {
      sections.push({ type: 'text', content: before });
    }

    sections.push({ type: nextMarker.type });
    remaining = remaining.slice(nextMarkerIndex + nextMarker.marker.length);
  }

  if (!sections.length) {
    return [{ type: 'text', content: String(content || '').trim() }];
  }

  return sections;
}

export function renderMillenniumEnrollmentContract(context, contractParams = {}) {
  const template = getEnrollmentContractTemplate(contractParams, context);
  return fillTemplate(template, context);
}

export function renderMillenniumPagareContract(context) {
  return fillTemplate(pagareTemplate, context);
}

function normalizeParagraphText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function splitContractParagraphs(content) {
  const normalized = String(content || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) {
    return [];
  }

  if (normalized.includes('\n\n')) {
    return normalized
      .split('\n\n')
      .map(normalizeParagraphText)
      .filter(Boolean);
  }

  return normalized
    .split(/(?=(?:PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SÉPTIMA|SEPTIMA|OCTAVA|NOVENA|DÉCIMA|DECIMA|CLÁUSULA|CLAUSULA|INSTRUCCIONES DE|MÉRITO EJECUTIVO|CONTRATO DE|ESTUDIANTE:|Leído el presente|CARTA DE INSTRUCCIONES|PAGARÉ N|PAGARE No:|Este PAGARE|Yo \/ Nosotros|PAGARÉ N°))/u)
    .map(normalizeParagraphText)
    .filter(Boolean);
}

function drawPdfHeader(doc, { margin, headerImage, title }) {
  let cursorY = margin;
  const crestWidth = 48;
  const crestHeight = 48;

  if (headerImage) {
    doc.addImage(headerImage, 'PNG', margin, cursorY, crestWidth, crestHeight);
  }

  if (title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const titleX = headerImage ? margin + crestWidth + 12 : margin;
    const titleY = headerImage ? cursorY + 30 : cursorY;
    doc.text(title, titleX, titleY);
    cursorY = Math.max(cursorY + crestHeight + 12, titleY + 16);
  } else if (headerImage) {
    cursorY += crestHeight + 12;
  }

  return cursorY;
}

function ensurePdfSpace(doc, { cursorY, requiredHeight, margin, pageHeight }) {
  if (cursorY + requiredHeight <= pageHeight - margin) {
    return cursorY;
  }

  doc.addPage();
  return margin;
}

function writeParagraphsToPdf(doc, {
  paragraphs,
  margin,
  maxWidth,
  pageHeight,
  cursorY,
  lineHeight = 11,
  paragraphGap = 8,
  justify = true,
}) {
  let y = cursorY;

  paragraphs.forEach((paragraph) => {
    const lines = doc.splitTextToSize(paragraph, maxWidth);

    y = ensurePdfSpace(doc, {
      cursorY: y,
      requiredHeight: lineHeight,
      margin,
      pageHeight,
    });

    let wroteAsJustifiedBlock = false;

    if (justify && lines.length > 1) {
      const dimensions = doc.getTextDimensions(paragraph, { maxWidth, align: 'justify' });
      if (y + dimensions.h + paragraphGap <= pageHeight - margin) {
        doc.text(paragraph, margin, y, { maxWidth, align: 'justify' });
        y += dimensions.h + paragraphGap;
        wroteAsJustifiedBlock = true;
      }
    }

    if (!wroteAsJustifiedBlock) {
      lines.forEach((line) => {
        y = ensurePdfSpace(doc, {
          cursorY: y,
          requiredHeight: lineHeight,
          margin,
          pageHeight,
        });
        doc.text(line, margin, y);
        y += lineHeight;
      });
      y += paragraphGap;
    }
  });

  return y;
}

function drawInstitutionSignatureBlockPdf(doc, {
  margin,
  pageWidth,
  pageHeight,
  cursorY,
}) {
  const blockHeight = 96;
  let y = ensurePdfSpace(doc, {
    cursorY,
    requiredHeight: blockHeight,
    margin,
    pageHeight,
  });

  const columnWidth = (pageWidth - (margin * 2));
  const signatureLineY = y + 72;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(MILLENNIUM_LEGAL_REPRESENTATIVE.name, margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(MILLENNIUM_LEGAL_REPRESENTATIVE.doc.replace('CC. ', ''), margin, y + 16);
  doc.text(MILLENNIUM_LEGAL_REPRESENTATIVE.role, margin, y + 30);
  doc.text(MILLENNIUM_LEGAL_REPRESENTATIVE.school, margin, y + 44);

  doc.setLineWidth(0.8);
  doc.line(margin, signatureLineY, margin + columnWidth - 8, signatureLineY);
  doc.setFontSize(7);
  doc.text('Firma institución', margin, signatureLineY + 12);

  return signatureLineY + 28;
}

function drawEnrollmentSignatureBlockPdf(doc, {
  margin,
  pageWidth,
  pageHeight,
  cursorY,
  context = {},
  parentSignatureDataUrl = '',
}) {
  const blockHeight = 130;
  let y = ensurePdfSpace(doc, {
    cursorY,
    requiredHeight: blockHeight,
    margin,
    pageHeight,
  });

  const columnGap = 24;
  const columnWidth = (pageWidth - (margin * 2) - columnGap) / 2;
  const leftX = margin;
  const rightX = margin + columnWidth + columnGap;
  const signatureLineY = y + 72;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(String(context.FINANCIAL_RESPONSIBLE_NAME_UPPER || '________________'), leftX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `${context.FINANCIAL_RESPONSIBLE_DOC_TYPE || 'CC'}. ${context.FINANCIAL_RESPONSIBLE_DOC_NUMBER || '____________'} de ${context.FINANCIAL_RESPONSIBLE_DOC_CITY || '____________'}`,
    leftX,
    y + 16,
    { maxWidth: columnWidth - 8 }
  );

  doc.setLineWidth(0.8);
  doc.line(leftX, signatureLineY, leftX + columnWidth - 8, signatureLineY);
  if (parentSignatureDataUrl) {
    try {
      doc.addImage(parentSignatureDataUrl, 'PNG', leftX + 8, signatureLineY - 52, columnWidth - 24, 44);
    } catch (error) {
      // Ignore invalid signature image payloads and keep the signature line visible.
    }
  }
  doc.setFontSize(7);
  doc.text('Firma responsable económico', leftX, signatureLineY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(MILLENNIUM_LEGAL_REPRESENTATIVE.name, rightX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(MILLENNIUM_LEGAL_REPRESENTATIVE.doc, rightX, y + 16);
  doc.text(MILLENNIUM_LEGAL_REPRESENTATIVE.role, rightX, y + 30);
  doc.text(MILLENNIUM_LEGAL_REPRESENTATIVE.school, rightX, y + 44);

  doc.line(rightX, signatureLineY, rightX + columnWidth - 8, signatureLineY);
  doc.setFontSize(7);
  doc.text('Firma institución', rightX, signatureLineY + 12);

  return signatureLineY + 28;
}

function buildEnrollmentContractPdfDoc({
  content,
  context,
  contractParams = {},
  headerImage,
  parentSignatureDataUrl = '',
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - (margin * 2);
  const sections = parseEnrollmentContractSections(content);
  const debtorColumns = getPagareDebtorColumns({
    father: contractParams?.father || {},
    mother: contractParams?.mother || {},
  });
  let cursorY = drawPdfHeader(doc, {
    margin,
    headerImage,
    title: getEnrollmentContractDocumentTitle(contractParams, context),
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  sections.forEach((section) => {
    if (section.type === 'contractors-table') {
      cursorY = drawPagareDebtorsTablePdf(doc, {
        margin,
        pageWidth,
        pageHeight,
        cursorY: cursorY + 8,
        debtorOne: debtorColumns.debtorOne,
        debtorTwo: debtorColumns.debtorTwo,
        primarySignatureDataUrl: parentSignatureDataUrl,
      });
      return;
    }

    if (section.type === 'institution-signature-block') {
      cursorY = drawInstitutionSignatureBlockPdf(doc, {
        margin,
        pageWidth,
        pageHeight,
        cursorY: cursorY + 8,
      });
      return;
    }

    if (section.type === 'signature-block') {
      cursorY = drawEnrollmentSignatureBlockPdf(doc, {
        margin,
        pageWidth,
        pageHeight,
        cursorY: cursorY + 8,
        context,
        parentSignatureDataUrl,
      });
      return;
    }

    cursorY = writeParagraphsToPdf(doc, {
      paragraphs: splitContractParagraphs(section.content),
      margin,
      maxWidth,
      pageHeight,
      cursorY,
      justify: true,
    });
  });

  return doc;
}

async function downloadEnrollmentContractPdf({
  content,
  fileName,
  headerImage,
  context,
  contractParams = {},
  parentSignatureDataUrl = '',
}) {
  const doc = buildEnrollmentContractPdfDoc({
    content,
    context,
    contractParams,
    headerImage,
    parentSignatureDataUrl,
  });
  await openJsPdfDocument(doc, fileName);
}

function buildPagarePdfDoc({
  content,
  debtorColumns,
  primarySignatureDataUrl = '',
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - (margin * 2);
  const sections = parsePagareDocumentSections(content);
  let cursorY = drawPdfHeader(doc, {
    margin,
    headerImage: null,
    title: 'Pagaré y Carta de Instrucciones',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  sections.forEach((section) => {
    if (section.type === 'debtors-table') {
      cursorY = drawPagareDebtorsTablePdf(doc, {
        margin,
        pageWidth,
        pageHeight,
        cursorY,
        debtorOne: debtorColumns.debtorOne,
        debtorTwo: debtorColumns.debtorTwo,
        primarySignatureDataUrl,
      });
      return;
    }

    cursorY = writeParagraphsToPdf(doc, {
      paragraphs: splitContractParagraphs(section.content),
      margin,
      maxWidth,
      pageHeight,
      cursorY,
      justify: true,
    });
  });

  return doc;
}

async function downloadPagarePdf({ content, fileName, debtorColumns, primarySignatureDataUrl = '' }) {
  const doc = buildPagarePdfDoc({
    content,
    debtorColumns,
    primarySignatureDataUrl,
  });
  await openJsPdfDocument(doc, fileName);
}

function pdfDocToBase64(doc) {
  return String(doc.output('datauristring') || '').split(',')[1] || '';
}

export function generateSignedEnrollmentContractPdfBase64(params, signatureDataUrl = '') {
  const contractParams = normalizeOfficialEnrollmentContractParams(params);
  const context = buildMillenniumEnrollmentContractContext(contractParams);
  const content = renderMillenniumEnrollmentContract(context, contractParams);
  const doc = buildEnrollmentContractPdfDoc({
    content,
    context,
    contractParams,
    headerImage: millenniumSchoolCrest,
    parentSignatureDataUrl: signatureDataUrl,
  });
  return {
    base64: pdfDocToBase64(doc),
    context,
    fileName: `contrato-matricula-${normalizeText(contractParams?.student?.lastName || 'alumno').toLowerCase()}.pdf`,
  };
}

export function generateSignedPagarePdfBase64(params, signatureDataUrl = '') {
  const contractParams = normalizeOfficialEnrollmentContractParams(params);
  const context = buildMillenniumEnrollmentContractContext(contractParams);
  const content = renderMillenniumPagareContract(context);
  const debtorColumns = getPagareDebtorColumns({
    father: contractParams?.father || {},
    mother: contractParams?.mother || {},
  });
  const doc = buildPagarePdfDoc({
    content,
    debtorColumns,
    primarySignatureDataUrl: signatureDataUrl,
  });
  return {
    base64: pdfDocToBase64(doc),
    context,
    fileName: `pagare-carta-${normalizeText(contractParams?.student?.lastName || 'alumno').toLowerCase()}.pdf`,
  };
}

const PAGARE_DEBTOR_FIELDS = [
  { key: 'name', label: 'Nombre' },
  { key: 'doc', label: 'C.C' },
  { key: 'address', label: 'Dirección' },
  { key: 'phoneRes', label: 'Tel. Res.' },
  { key: 'phoneOffice', label: 'Tel. Of.' },
  { key: 'mobile', label: 'Celular' },
  { key: 'email', label: 'Correo electrónico' },
];

function drawPagareDebtorColumnPdf(doc, {
  x,
  y,
  width,
  debtor = {},
  signatureDataUrl = '',
}) {
  const labelWidth = 78;
  const huellaWidth = 42;
  const valueWidth = width - labelWidth - huellaWidth;
  const rowHeight = 18;
  const signatureHeight = 54;
  const huellaHeight = rowHeight * 4;
  let cursorY = y;

  PAGARE_DEBTOR_FIELDS.forEach((field, index) => {
    const rowTop = cursorY;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.setFillColor(248, 244, 237);
    doc.rect(x, rowTop, labelWidth, rowHeight, 'FD');
    doc.rect(x + labelWidth, rowTop, valueWidth, rowHeight, 'FD');

    if (index === 0) {
      doc.setFillColor(255, 255, 255);
      doc.rect(x + labelWidth + valueWidth, rowTop, huellaWidth, huellaHeight, 'FD');
    }

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(field.label, x + 4, rowTop + 12);
    doc.text(String(debtor[field.key] || ''), x + labelWidth + 4, rowTop + 12, {
      maxWidth: valueWidth - 8,
    });

    cursorY += rowHeight;
  });

  doc.setFillColor(248, 244, 237);
  doc.rect(x, cursorY, labelWidth, signatureHeight, 'FD');
  doc.setFillColor(255, 255, 255);
  doc.rect(x + labelWidth, cursorY, width - labelWidth, signatureHeight, 'FD');
  doc.setTextColor(0, 0, 0);
  doc.text('Firma', x + 4, cursorY + 14);
  if (signatureDataUrl) {
    try {
      doc.addImage(signatureDataUrl, 'PNG', x + labelWidth + 6, cursorY + 8, width - labelWidth - 12, signatureHeight - 16);
    } catch (error) {
      // Ignore invalid signature image payloads.
    }
  }

  return y + (rowHeight * PAGARE_DEBTOR_FIELDS.length) + signatureHeight;
}

function drawPagareDebtorsTablePdf(doc, {
  margin,
  pageWidth,
  pageHeight,
  cursorY,
  debtorOne,
  debtorTwo,
  primarySignatureDataUrl = '',
}) {
  const tableWidth = pageWidth - (margin * 2);
  const columnGap = 10;
  const columnWidth = (tableWidth - columnGap) / 2;
  const tableHeight = (18 * PAGARE_DEBTOR_FIELDS.length) + 54;

  if (cursorY + tableHeight + 24 > pageHeight - margin) {
    doc.addPage();
    cursorY = margin;
  }

  const leftBottom = drawPagareDebtorColumnPdf(doc, {
    x: margin,
    y: cursorY,
    width: columnWidth,
    debtor: debtorOne,
    signatureDataUrl: primarySignatureDataUrl,
  });
  const rightBottom = drawPagareDebtorColumnPdf(doc, {
    x: margin + columnWidth + columnGap,
    y: cursorY,
    width: columnWidth,
    debtor: debtorTwo,
  });

  return Math.max(leftBottom, rightBottom) + 16;
}

function downloadTextAsPdf({
  title,
  content,
  fileName,
  headerImage = null,
  justify = true,
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - (margin * 2);
  let cursorY = drawPdfHeader(doc, { margin, headerImage, title });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  cursorY = writeParagraphsToPdf(doc, {
    paragraphs: splitContractParagraphs(content),
    margin,
    maxWidth,
    pageHeight,
    cursorY,
    justify,
  });

  doc.save(fileName);
}

export async function downloadMillenniumEnrollmentContractPdf(params) {
  const contractParams = normalizeOfficialEnrollmentContractParams(params);
  const context = buildMillenniumEnrollmentContractContext(contractParams);
  const content = renderMillenniumEnrollmentContract(context, contractParams);
  const studentSlug = normalizeText(`${contractParams?.student?.firstName}-${contractParams?.student?.lastName}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'alumno';

  return downloadEnrollmentContractPdf({
    content,
    context,
    contractParams,
    fileName: `contrato-matricula-${studentSlug}.pdf`,
    headerImage: millenniumSchoolCrest,
  });
}

export async function downloadMillenniumPagareContractPdf(params) {
  const contractParams = normalizeOfficialEnrollmentContractParams(params);
  const context = buildMillenniumEnrollmentContractContext(contractParams);
  const content = renderMillenniumPagareContract(context);
  const debtorColumns = getPagareDebtorColumns({
    father: contractParams?.father || {},
    mother: contractParams?.mother || {},
  });
  const studentSlug = normalizeText(`${contractParams?.student?.firstName}-${contractParams?.student?.lastName}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'alumno';

  return downloadPagarePdf({
    content,
    fileName: `pagare-carta-${studentSlug}.pdf`,
    debtorColumns,
  });
}
