import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import './AcademicSecretaryDashboard.css';
import {
  calculateAcademicProratedEnrollmentFee,
  downloadAcademicEnrollmentContractPdf,
  isAcademicParentDraftComplete,
  isAcademicStudentDraftComplete,
  normalizeAcademicSchoolYearConfiguration,
} from '../lib/academicEnrollment';
import { findMatchingFeeSetting, getFeeGradeAliases, buildAcademicStructureGradeMetadataIndex, resolveStructureGradeKeyForStudent, gradesMatchForFilter } from '../lib/feeGradeMatching';
import MillenniumEnrollmentSignatureBlock from '../components/MillenniumEnrollmentSignatureBlock';
import MillenniumPagareDebtorsTable from '../components/MillenniumPagareDebtorsTable';
import {
  buildMillenniumEnrollmentContractContext,
  canPreviewMillenniumEnrollmentContracts,
  downloadMillenniumEnrollmentContractPdf,
  downloadMillenniumPagareContractPdf,
  getPagareDebtorColumns,
  isMillenniumSchool,
  millenniumSchoolCrest,
  parseEnrollmentContractSections,
  parsePagareDocumentSections,
  renderMillenniumEnrollmentContract,
  renderMillenniumPagareContract,
  splitContractParagraphs,
} from '../lib/millenniumEnrollmentContracts';
import useAuthStore from '../store/auth.store';
import BrandConfirmModal from '../components/BrandConfirmModal';
import { getSchoolDisplayName } from '../lib/schools';
import { resolveApiAssetUrl } from '../lib/api';
import {
  approveAcademicSecretaryCommunicationRequest,
  archiveAcademicCalendarAssignment,
  addAcademicSecretarySchoolRouteStop,
  createAcademicCalendarAssignment,
  createAcademicSecretaryBillingFollowUp,
  createAcademicSecretaryCharge,
  createAcademicSecretaryCommunicationAuthor,
  createAcademicSecretaryCommunication,
  deleteAcademicSecretaryCommunicationAuthor,
  createAcademicSecretaryEnrollment,
  deleteAcademicSecretaryCommunication,
  deleteAcademicSecretaryCommunicationComment,
  getAcademicSecretaryBootstrap,
  getAcademicSecretaryFeeSettings,
  getAcademicSecretarySchoolRoutes,
  importAcademicSecretaryDatabase,
  requestAcademicSecretaryGradePromotion,
  rejectAcademicSecretaryCommunicationRequest,
  registerAcademicSecretaryChargePayment,
  removeAcademicSecretarySchoolRouteStop,
  sendAcademicSecretaryReminder,
  updateAcademicSecretaryDatabaseRow,
  updateAcademicSecretaryCommunicationAuthor,
  updateAcademicSecretaryCommunication,
  updateAcademicSecretarySchoolRouteStop,
  uploadAcademicSecretaryCommunicationImage,
  uploadAcademicSecretaryCommunicationMedia,
} from '../services/academicSecretary.service';
import { getAdmissionMarketingHistory, getAdmissions, sendAdmissionMarketingCampaign, uploadAdmissionMarketingImage } from '../services/admissions.service';
import AcademicAssignmentsPanel from '../components/AcademicAssignmentsPanel';

const SECTION_OPTIONS = [
  { key: 'overview', label: 'Dashboard KPI' },
  { key: 'communications', label: 'Comunicados' },
  { key: 'costs', label: 'Costos' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'enrollments', label: 'Matrículas' },
  { key: 'assignments', label: 'Asignaciones' },
  { key: 'routes', label: 'Rutas' },
  { key: 'database', label: 'Base de datos' },
  { key: 'approvals', label: 'Autorización de comunicados' },
];

const BILLING_SECTION_OPTIONS = [
  { key: 'overview', label: 'Resumen de cartera' },
];

const BILLING_PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'bank_transfer', label: 'Transferencia' },
  { value: 'card', label: 'Datáfono' },
  { value: 'pse', label: 'PSE' },
  { value: 'epayco', label: 'ePayco' },
  { value: 'bold', label: 'Bold' },
  { value: 'other', label: 'Otro' },
];

function labelBillingPaymentMethod(value) {
  return BILLING_PAYMENT_METHOD_OPTIONS.find((option) => option.value === value)?.label || '';
}

function labelBillingPlanConcept(row = {}) {
  if (row.paymentConceptLabel) return row.paymentConceptLabel;
  if (row.category === 'annual_tuition') return 'Matrícula';
  if (row.category === 'monthly_tuition') return 'Pensión';
  if (row.category === 'enrollment_bonus') return 'Bono de ingreso';
  return row.concept || 'Cargo académico';
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function hasFeeSettingAmounts(setting) {
  return Number(setting?.enrollmentBonus || 0) > 0
    || Number(setting?.enrollmentFee || 0) > 0
    || Number(setting?.monthlyTuition || 0) > 0;
}

function getAcademicBaseGradeFromCourseValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const lastSegment = normalized.split(':').pop().trim();
  const directMatch = lastSegment.match(/^([0-9]{1,2})\s*[a-z]$/i);
  if (directMatch) return directMatch[1];
  const embeddedMatch = normalized.match(/(?:^|[\s:])([0-9]{1,2})\s*[a-z](?:$|[\s:])/i);
  return embeddedMatch ? embeddedMatch[1] : '';
}

function resolveEnrollmentGradeValueForSelector(item = {}, gradeOptions = []) {
  const options = Array.isArray(gradeOptions) ? gradeOptions : [];
  const candidates = [
    item?.grade,
    item?.course,
    getAcademicBaseGradeFromCourseValue(item?.grade),
    getAcademicBaseGradeFromCourseValue(item?.course),
  ].map((value) => String(value || '').trim()).filter(Boolean);

  for (const candidate of candidates) {
    const matchedOption = options.find((option) => String(option?.value || '').trim().toLowerCase() === candidate.toLowerCase());
    if (matchedOption) return matchedOption.value;
  }

  return candidates[2] || candidates[3] || candidates[0] || '';
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatDateInputValue(value) {
  const date = parseAcademicSimulationDate(value);
  if (!date) return '';

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTime(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatGenderLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'female') return 'Femenino';
  if (normalized === 'male') return 'Masculino';
  if (normalized === 'other') return 'Otro';
  return value || 'No definido';
}

function formatAcademicCourseTarget(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  const withoutSubject = rawValue.includes(' - ')
    ? rawValue.split(' - ').pop().trim()
    : rawValue;
  const normalized = withoutSubject.replace(/\s+/g, ' ').trim();
  const gradeMatch = normalized.match(/(?:^|:|\s)(\d{1,2})\s*([a-z])?$/i);
  if (gradeMatch) {
    if (!gradeMatch[2]) {
      return null;
    }

    const label = `${gradeMatch[1]}${String(gradeMatch[2] || '').toUpperCase()}`;
    return { value: label, label };
  }

  if (/^\d{1,2}$/.test(normalized)) {
    return null;
  }

  return { value: normalized, label: normalized };
}

function calculateDiscountedAmount(baseAmount, discountPercent) {
  const amount = Number(baseAmount || 0);
  const percent = Number(discountPercent || 0);
  const safePercent = Math.min(Math.max(percent, 0), 100);
  return Math.max(amount - ((amount * safePercent) / 100), 0);
}

function getFixedBenefitAmountForGrade(rule = {}, grade = '') {
  const fixedAmountsByGrade = rule?.fixedAmountsByGrade || {};
  const aliases = getFeeGradeAliases(grade);
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(fixedAmountsByGrade, alias)) {
      return Math.max(0, Number(fixedAmountsByGrade[alias] || 0));
    }
  }

  return 0;
}

function doesBenefitRuleApplyToGrade(rule = {}, grade = '') {
  const aliases = new Set(getFeeGradeAliases(grade));
  const targetGradeKeys = Array.isArray(rule?.targetGradeKeys) ? rule.targetGradeKeys.flatMap(getFeeGradeAliases) : [];
  if (targetGradeKeys.length > 0) {
    return targetGradeKeys.some((gradeKey) => aliases.has(gradeKey));
  }

  const fixedAmountsByGrade = rule?.fixedAmountsByGrade || {};
  const hasFixedAmountsByGrade = Object.keys(fixedAmountsByGrade).length > 0;
  if (rule?.discountType === 'fixed' || hasFixedAmountsByGrade) {
    return getFixedBenefitAmountForGrade(rule, grade) > 0;
  }

  return true;
}

function calculateBenefitTuitionAmount(baseAmount, rule = {}, grade = '') {
  const amount = Number(baseAmount || 0);
  if (rule?.discountType === 'fixed') {
    return Math.max(amount - getFixedBenefitAmountForGrade(rule, grade), 0);
  }

  return calculateDiscountedAmount(amount, rule?.discountPercent || 0);
}

function describeAcademicBenefitRule(rule = {}, grade = '') {
  if (rule?.discountType === 'fixed') {
    const fixedAmount = getFixedBenefitAmountForGrade(rule, grade);
    return fixedAmount > 0 ? `Descuento fijo: ${formatCurrency(fixedAmount)}` : 'Sin descuento fijo configurado';
  }

  const discountPercent = Math.min(100, Math.max(0, Number(rule?.discountPercent || 0)));
  return discountPercent > 0 ? `Descuento: ${discountPercent}%` : 'Sin descuento porcentual configurado';
}

function resolveEnrollmentBonusCashDiscountAmount(setting = {}) {
  const bonusAmount = Math.max(0, Number(setting?.enrollmentBonus || 0));
  if (!bonusAmount) return 0;

  const cashAmountCandidates = [
    setting?.enrollmentBonusCashAmount,
    setting?.enrollmentBonusCashPrice,
    setting?.cashEnrollmentBonusAmount,
    setting?.cashEnrollmentBonusPrice,
  ];
  const cashAmount = cashAmountCandidates.map((value) => Number(value)).find((value) => Number.isFinite(value) && value >= 0);
  if (cashAmount !== undefined) {
    return Math.max(0, bonusAmount - Math.min(bonusAmount, cashAmount));
  }

  const fixedDiscountCandidates = [
    setting?.enrollmentBonusCashDiscountAmount,
    setting?.cashEnrollmentBonusDiscountAmount,
    setting?.enrollmentBonusCashDiscountValue,
  ];
  const fixedDiscount = fixedDiscountCandidates.map((value) => Number(value)).find((value) => Number.isFinite(value) && value > 0);
  if (fixedDiscount !== undefined) {
    return Math.min(bonusAmount, fixedDiscount);
  }

  const percentDiscountCandidates = [
    setting?.enrollmentBonusCashDiscountPercent,
    setting?.cashEnrollmentBonusDiscountPercent,
  ];
  const percentDiscount = percentDiscountCandidates.map((value) => Number(value)).find((value) => Number.isFinite(value) && value > 0);
  if (percentDiscount !== undefined) {
    return Math.min(bonusAmount, Math.round((bonusAmount * Math.min(100, percentDiscount)) / 100));
  }

  return 0;
}

function calculateMonthlyTuitionScenarioAmount(baseAmount, paymentOption = {}, additionalDiscountPercent = 0) {
  const amount = Math.max(0, Number(baseAmount || 0));
  const fixedDiscountAmount = Math.min(amount, Math.max(0, Number(paymentOption?.generalFixedDiscountAmount || 0)));
  const combinedDiscountPercent = Math.min(100, Math.max(0, Number(paymentOption?.generalDiscountPercent || 0)) + Math.max(0, Number(additionalDiscountPercent || 0)));
  return calculateDiscountedAmount(amount - fixedDiscountAmount, combinedDiscountPercent);
}

function calculateInstallmentAmount(baseAmount, installmentCount) {
  const amount = Number(baseAmount || 0);
  const count = Math.max(1, Number(installmentCount || 1));
  return Math.round(amount / count);
}

function parseAcademicSimulationDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const isoDateMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoDateMatch) {
    return new Date(Number(isoDateMatch[1]), Number(isoDateMatch[2]) - 1, Number(isoDateMatch[3]));
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function startOfAcademicSimulationMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addAcademicSimulationMonths(date, monthCount = 0) {
  return new Date(date.getFullYear(), date.getMonth() + Number(monthCount || 0), 1);
}

function getAcademicSimulationMonthDiff(startDate, endDate) {
  return ((endDate.getFullYear() - startDate.getFullYear()) * 12) + (endDate.getMonth() - startDate.getMonth());
}

function formatAcademicSimulationMonth(date) {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(date);
}

function splitAcademicSimulationAmount(baseAmount, installmentCount) {
  const safeAmount = Math.max(0, Math.round(Number(baseAmount || 0)));
  const safeInstallments = Math.max(1, Math.round(Number(installmentCount || 1)));
  const baseInstallmentAmount = Math.floor(safeAmount / safeInstallments);
  let remainder = safeAmount - (baseInstallmentAmount * safeInstallments);

  return Array.from({ length: safeInstallments }, () => {
    const nextAmount = baseInstallmentAmount + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
    return nextAmount;
  });
}

function buildAcademicMonthlyPaymentSchedule({
  feeSettings,
  grade,
  academicGrades = [],
  schoolYearStartDate,
  schoolYearEndDate,
  academicYear,
  entryDate,
  monthlyTuitionAmount,
  enrollmentBonusAmount,
  enrollmentBonusInstallments,
  annualTuitionAmount,
  annualTuitionInstallments,
  annualTuitionAdditionalDiscountPercent,
  generalDiscountPercent,
  generalFixedDiscountAmount,
  additionalDiscountPercent,
}) {
  const currentYear = new Date().getFullYear();
  const normalizedAcademicYear = Number.parseInt(String(academicYear || currentYear), 10) || currentYear;
  const parsedEntryDate = parseAcademicSimulationDate(entryDate);
  const fallbackYear = parsedEntryDate?.getFullYear?.() || normalizedAcademicYear;
  const schoolYearConfiguration = normalizeAcademicSchoolYearConfiguration(
    feeSettings || {
      schoolYearStartDate,
      schoolYearEndDate,
    },
    grade,
    { academicGrades },
  );
  const parsedSchoolYearStartDate = schoolYearConfiguration.startDate || new Date(fallbackYear, 0, 1);
  const parsedSchoolYearEndDate = schoolYearConfiguration.endDate || new Date(fallbackYear, 11, 31);

  const schoolYearStartMonth = startOfAcademicSimulationMonth(parsedSchoolYearStartDate);
  const schoolYearEndMonth = startOfAcademicSimulationMonth(parsedSchoolYearEndDate);
  const entryMonth = parsedEntryDate ? startOfAcademicSimulationMonth(parsedEntryDate) : schoolYearStartMonth;

  if (entryMonth.getTime() > schoolYearEndMonth.getTime()) {
    return [];
  }

  const scheduleStartMonth = entryMonth.getTime() > schoolYearStartMonth.getTime() ? entryMonth : schoolYearStartMonth;
  const bonusInstallmentAmounts = splitAcademicSimulationAmount(enrollmentBonusAmount, enrollmentBonusInstallments);
  const discountedAnnualTuitionAmount = calculateDiscountedAmount(annualTuitionAmount, annualTuitionAdditionalDiscountPercent);
  const installmentAmounts = splitAcademicSimulationAmount(discountedAnnualTuitionAmount, annualTuitionInstallments);
  const financingMonthCount = Math.max(bonusInstallmentAmounts.length, installmentAmounts.length);
  const financingEndMonth = addAcademicSimulationMonths(scheduleStartMonth, Math.max(0, financingMonthCount - 1));
  const scheduleEndMonth = financingEndMonth.getTime() > schoolYearEndMonth.getTime() ? financingEndMonth : schoolYearEndMonth;
  const fixedDiscountAmount = Math.min(Number(monthlyTuitionAmount || 0), Math.max(0, Number(generalFixedDiscountAmount || 0)));
  const combinedDiscountPercent = Math.min(100, Math.max(0, Number(generalDiscountPercent || 0)) + Math.max(0, Number(additionalDiscountPercent || 0)));
  const appliedMonthlyTuitionAmount = calculateDiscountedAmount(Math.max(0, Number(monthlyTuitionAmount || 0) - fixedDiscountAmount), combinedDiscountPercent);
  const totalRows = Math.max(1, getAcademicSimulationMonthDiff(scheduleStartMonth, scheduleEndMonth) + 1);

  return Array.from({ length: totalRows }, (_, index) => {
    const monthDate = addAcademicSimulationMonths(scheduleStartMonth, index);
    const enrollmentBonusInstallmentAmount = bonusInstallmentAmounts[index] || 0;
    const enrollmentInstallmentAmount = installmentAmounts[index] || 0;
    return {
      key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
      monthLabel: formatAcademicSimulationMonth(monthDate),
      monthlyTuitionAmount: appliedMonthlyTuitionAmount,
      enrollmentBonusInstallmentAmount,
      enrollmentInstallmentAmount,
      totalAmount: appliedMonthlyTuitionAmount + enrollmentBonusInstallmentAmount + enrollmentInstallmentAmount,
    };
  });
}

function createEmptyStudentDraft() {
  return {
    firstName: '',
    lastName: '',
    gender: '',
    documentType: 'TI',
    documentNumber: '',
    birthDate: '',
    bloodType: '',
    birthPlace: '',
    address: '',
    grade: '',
    course: '',
    entryDate: '',
    enrollmentBonusInstallments: 1,
    annualTuitionInstallments: 1,
    initialEnrollmentAndFirstTuitionPaid: false,
    annualTuitionAdditionalDiscountPercent: '',
    annualTuitionAdditionalDiscountLabel: '',
    monthlyTuitionAdditionalDiscountPercent: '',
    monthlyTuitionAdditionalDiscountLabel: '',
    paymentSimulationRuleKey: 'full',
    schoolCode: '',
    medicalProfile: {
      allergies: '',
      chronicConditions: '',
      currentMedications: '',
      dietaryRestrictions: '',
      healthInsurance: '',
      emergencyMedicalContactName: '',
      emergencyMedicalContactPhone: '',
      physicianName: '',
      physicianPhone: '',
      medicationAuthorization: {
        status: '',
        authorizedBy: '',
        authorizedMedications: '',
        instructions: '',
        notes: '',
      },
    },
  };
}

const ACADEMIC_FINANCING_INSTALLMENT_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);

const ACADEMIC_DATABASE_HEADERS = [
  'Grado',
  'Apellidos',
  'Nombres',
  'Genero',
  'Tipo doc. alumno',
  'Numero doc. alumno',
  'Fecha nacimiento',
  'Edad',
  'Tipo sangre',
  'Lugar nacimiento',
  'Direccion',
  'Nombre madre',
  'Tipo doc. madre',
  'Numero doc. madre',
  'Telefono madre',
  'Correo madre',
  'Nombre padre',
  'Tipo doc. padre',
  'Numero doc. padre',
  'Telefono padre',
  'Correo padre',
];

const ACADEMIC_DATABASE_TEMPLATE_ROWS = [
  [
    '5A',
    'Gomez',
    'Valentina',
    'female',
    'TI',
    '10203040',
    '2015-08-14',
    '10',
    'O+',
    'Barranquilla',
    'Cra 10 #20-30',
    'Laura Perez',
    'CC',
    '52345678',
    '3001234567',
    'laura@example.com',
    'Carlos Gomez',
    'CC',
    '80123456',
    '3009876543',
    'carlos@example.com',
  ],
];

function downloadExcelWorkbook(sheetName, headers, rows, fileBaseName) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileBaseName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function formatDateForExcel(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function DownloadExcelIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M14 2v5h5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 11v6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="m9.5 14.5 2.5 2.5 2.5-2.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 8V3h10v5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M7 14h10v7H7z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M17 12h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
    </svg>
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildCostProjectionPrintHtml({ schoolName, gradeLabel, generatedAtLabel, summaryCards, optionRows, enrollmentValueRows, tuitionValueRows, paymentRows, includeBonusColumn, bonusNote }) {
  const safeSchoolName = escapeHtml(schoolName || 'Colegio');
  const safeGradeLabel = escapeHtml(gradeLabel || 'Grado');
  const safeGeneratedAtLabel = escapeHtml(generatedAtLabel || '');
  const summaryMarkup = summaryCards.map((card) => `
    <article class="summary-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
    </article>
  `).join('');
  const optionMarkup = optionRows.map((row) => `
    <div class="option-row">
      <span>${escapeHtml(row.label)}</span>
      <strong>${escapeHtml(row.value)}</strong>
    </div>
  `).join('');
  const renderValueRows = (rows) => rows.map((row) => `
    <tr class="${row.isSelected ? 'is-selected' : ''}">
      <td><strong>${escapeHtml(row.label)}</strong>${row.detail ? `<span>${escapeHtml(row.detail)}</span>` : ''}</td>
      <td>${escapeHtml(row.condition)}</td>
      <td>${escapeHtml(row.amount)}</td>
    </tr>
  `).join('');
  const enrollmentValuesMarkup = renderValueRows(enrollmentValueRows || []);
  const tuitionValuesMarkup = renderValueRows(tuitionValueRows || []);
  const tableMarkup = paymentRows.map((row) => `
    <tr>
      <td>${escapeHtml(row.monthLabel)}</td>
      <td>${escapeHtml(row.monthlyTuitionAmount)}</td>
      <td>${escapeHtml(row.enrollmentInstallmentAmount)}</td>
      ${includeBonusColumn ? `<td>${escapeHtml(row.enrollmentBonusInstallmentAmount)}</td>` : ''}
      <td>${escapeHtml(row.totalMonthAmount)}</td>
    </tr>
  `).join('');
  const bonusColumnHeader = includeBonusColumn ? '<th>Cuota bono</th>' : '';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title></title>
    <style>
      @page { size: letter; margin: 0; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f4f7fb;
        color: #0f172a;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .sheet {
        width: min(940px, 100%);
        margin: 0 auto;
        padding: 30px;
        background: #fff;
      }
      .sheet-spacer { padding: 16mm; }
      .print-page + .print-page { margin-top: 28px; }
      .hero {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 20px;
        align-items: start;
        padding: 28px;
        border-radius: 24px;
        background: linear-gradient(135deg, #0f1b35 0%, #1f3a5f 58%, #2e637c 100%);
        color: #fff;
      }
      .eyebrow {
        margin: 0 0 8px;
        color: rgba(255,255,255,.72);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: .13em;
        text-transform: uppercase;
      }
      h1 { margin: 0; font-size: 31px; line-height: 1.08; letter-spacing: 0; }
      .hero p { margin: 10px 0 0; max-width: 560px; color: rgba(255,255,255,.84); line-height: 1.45; }
      .grade-pill {
        display: inline-flex;
        align-items: center;
        min-width: 150px;
        justify-content: center;
        padding: 12px 16px;
        border: 1px solid rgba(255,255,255,.25);
        border-radius: 999px;
        background: rgba(255,255,255,.12);
        color: #fff;
        font-weight: 800;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin: 18px 2px 22px;
        color: #64748b;
        font-size: 13px;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 22px;
      }
      .summary-card {
        padding: 16px;
        border: 1px solid #e4ebf5;
        border-radius: 18px;
        background: linear-gradient(180deg, #f8fbff 0%, #fff 100%);
      }
      .summary-card span { display: block; color: #64748b; font-size: 12px; font-weight: 700; }
      .summary-card strong { display: block; margin-top: 8px; color: #0f172a; font-size: 18px; }
      .section-title {
        margin: 0 0 12px;
        color: #0f172a;
        font-size: 18px;
      }
      .options {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 18px;
        margin-bottom: 22px;
        padding: 16px;
        border: 1px solid #e4ebf5;
        border-radius: 18px;
        background: #fbfdff;
      }
      .option-row { display: flex; justify-content: space-between; gap: 12px; border-bottom: 1px solid #edf2f7; padding-bottom: 8px; }
      .option-row span { color: #64748b; }
      .option-row strong { color: #10213f; text-align: right; }
      .value-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 22px;
      }
      .value-card {
        border: 1px solid #e4ebf5;
        border-radius: 18px;
        overflow: hidden;
        background: #fff;
      }
      .value-card h3 {
        margin: 0;
        padding: 14px 16px;
        background: #f1f6fb;
        color: #10213f;
        font-size: 15px;
      }
      .value-card table { border-radius: 0; }
      .value-card td:first-child span { display: block; margin-top: 3px; color: #64748b; font-size: 12px; }
      .value-card tbody tr.is-selected td { background: #eaf7ff; }
      .projection-table th,
      .projection-table td { padding: 10px 12px; }
      table { width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 18px; }
      thead th {
        background: #10213f;
        color: #fff;
        font-size: 12px;
        letter-spacing: .05em;
        text-transform: uppercase;
      }
      th, td { padding: 13px 14px; text-align: left; border-bottom: 1px solid #e7edf6; }
      tbody tr:nth-child(even) td { background: #f8fafc; }
      tbody td:last-child { font-weight: 800; color: #0f172a; }
      .note {
        margin-top: 18px;
        padding: 14px 16px;
        border-left: 4px solid #1ea7e7;
        border-radius: 14px;
        background: #eef8ff;
        color: #35506a;
        font-size: 13px;
        line-height: 1.5;
      }
      .disclaimer {
        margin-top: 14px;
        padding: 12px 16px;
        border: 1px solid #f0d9a8;
        border-radius: 14px;
        background: #fff8eb;
        color: #7a5b1a;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.45;
        text-align: center;
      }
      .footer {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        margin-top: 28px;
        padding-top: 16px;
        border-top: 1px solid #e7edf6;
        color: #64748b;
        font-size: 12px;
      }
      @media print {
        body { background: #fff; }
        .sheet { width: 100%; padding: 0; }
        .sheet-spacer { padding: 12mm; }
        .print-page { page-break-inside: auto; break-inside: auto; }
        .print-page + .print-page { margin-top: 0; page-break-before: always; break-before: page; }
        .print-page--values .section-title,
        .print-page--projection .section-title { margin-bottom: 10px; }
        .print-page--values .value-grid { gap: 12px; margin-bottom: 0; }
        .print-page--values .value-card h3 { padding: 10px 12px; font-size: 13px; }
        .print-page--values th,
        .print-page--values td { padding: 8px 9px; font-size: 10.5px; }
        .print-page--values thead th { font-size: 9.5px; }
        .print-page--values .value-card td:first-child span { font-size: 9.5px; }
        .print-page--projection .projection-table th,
        .print-page--projection .projection-table td { padding: 7px 9px; font-size: 10.5px; }
        .print-page--projection .projection-table thead th { font-size: 9.5px; }
        .print-page--projection .note { margin-top: 10px; padding: 10px 12px; font-size: 11px; line-height: 1.35; }
        .print-page--projection .footer { margin-top: 12px; padding-top: 10px; }
        .hero, .summary-card, .options, .value-card h3, .note { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      }
      @media (max-width: 720px) {
        .hero { grid-template-columns: 1fr; }
        .summary-grid, .options, .value-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <section class="sheet-spacer print-page print-page--summary">
        <section class="hero">
          <div>
            <p class="eyebrow">Proyección informativa de costos</p>
            <h1>${safeSchoolName}</h1>
            <p>Resumen y guía de inversión educativa para aspirantes.</p>
          </div>
          <div class="grade-pill">${safeGradeLabel}</div>
        </section>
        <div class="meta"><span>Fecha de emisión: ${safeGeneratedAtLabel}</span><span>Documento para acudientes</span></div>
        <section class="summary-grid">${summaryMarkup}</section>
        <h2 class="section-title">Opciones seleccionadas</h2>
        <section class="options">${optionMarkup}</section>
        <div class="disclaimer">Costos son sujetos a año escolar vigente</div>
      </section>
      <section class="sheet-spacer print-page print-page--values">
        <h2 class="section-title">Valores normales y beneficios disponibles</h2>
        <section class="value-grid">
          <article class="value-card">
            <h3>Matrícula</h3>
            <table><thead><tr><th>Escenario</th><th>Vigencia</th><th>Valor</th></tr></thead><tbody>${enrollmentValuesMarkup}</tbody></table>
          </article>
          <article class="value-card">
            <h3>Pensión mensual</h3>
            <table><thead><tr><th>Escenario</th><th>Condición</th><th>Valor</th></tr></thead><tbody>${tuitionValuesMarkup}</tbody></table>
          </article>
        </section>
      </section>
      <section class="sheet-spacer print-page print-page--projection">
        <h2 class="section-title">Proyección mensual</h2>
        <table class="projection-table">
          <thead><tr><th>Mes</th><th>Pensión aplicada</th><th>Cuota matrícula</th>${bonusColumnHeader}<th>Total del mes</th></tr></thead>
          <tbody>${tableMarkup}</tbody>
        </table>
        <div class="note">${escapeHtml(bonusNote || 'Esta proyección corresponde a los escenarios seleccionados por admisiones. No reemplaza el contrato de matrícula ni los recibos oficiales.')}</div>
        <footer class="footer"><span>${safeSchoolName}</span><span>Generado desde Comergio</span></footer>
      </section>
    </main>
    <script>document.title = ''; window.addEventListener('load', () => { window.focus(); setTimeout(() => window.print(), 250); });</script>
  </body>
</html>`;
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 20h9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 4h11l3 3v13H5z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M9 4v6h6V4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M9 17h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m6 6 12 12" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function NotificationIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function WhatsappIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.4L4 20l.9-3.8A8.5 8.5 0 1 1 20.5 11.7Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M9 8.8c.2 3 2.2 5.1 5.2 5.8l1.2-1.2c.3-.3.8-.4 1.2-.2l1 .5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function normalizePhoneForWhatsapp(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

function calculateOverdueDays(value) {
  if (!value) return 0;
  const dueDate = new Date(value);
  if (Number.isNaN(dueDate.getTime())) return 0;
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  return Math.max(0, Math.floor((startOfToday.getTime() - startOfDueDate.getTime()) / 86400000));
}

function buildWhatsappMessage({ parentName, schoolName, amount, overdueDays }) {
  return `Estimado/a ${parentName || 'acudiente'},\n\nReciba un cordial saludo de parte del colegio ${schoolName || 'Comergio'}.\n\nLe informamos que actualmente presenta un saldo pendiente por valor de ${formatCurrency(amount)} correspondiente a obligaciones escolares, con ${Number(overdueDays || 0)} dias vencidos.\n\nAgradecemos realizar el pago a la mayor brevedad posible para evitar inconvenientes en los servicios academicos.\n\nSi ya realizo el pago, por favor omitir este mensaje o enviarnos el soporte para actualizar su estado.\n\nQuedamos atentos a cualquier inquietud.`;
}

function buildBillingMessageDraft({ parentName, schoolName, amount, overdueDays }) {
  return `Estimado/a ${parentName || 'acudiente'},\n\nReciba un cordial saludo de parte del colegio ${schoolName || 'Comergio'}.\n\nLe informamos que actualmente presenta un saldo pendiente por valor de ${formatCurrency(amount)} con ${Number(overdueDays || 0)} dias de mora.\n\nAgradecemos realizar el pago a la mayor brevedad posible.\n\nQuedamos atentos a cualquier inquietud.`;
}

function followUpActionLabel(value) {
  if (value === 'push_email') return 'Push + correo';
  if (value === 'whatsapp') return 'WhatsApp';
  if (value === 'manual_note') return 'Nota manual';
  return value || 'Seguimiento';
}

function getAcademicSecretaryRequestMessage(requestError, fallbackMessage = 'No se pudo completar la acción.') {
  const backendMessage = requestError?.response?.data?.message || requestError?.message || '';
  if (String(backendMessage).toLowerCase() === 'forbidden') {
    return 'No tienes permisos para realizar esta acción con tu usuario actual.';
  }

  return backendMessage || fallbackMessage;
}

function normalizeBillingSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function createBillingPaymentDraft() {
  return {
    chargeId: '',
    amount: '',
    method: 'bank_transfer',
    paidAt: formatDateInputValue(new Date()),
    notes: '',
  };
}

function createEmptyParentDraft() {
  return { name: '', documentType: 'CC', documentNumber: '', phone: '', email: '', password: '', address: '' };
}

function createEmptyBenefitDraft(index = 0) {
  return { label: `Beneficio ${index + 1}`, startDay: 1, endDay: 10, discountType: 'percent', discountPercent: 0, fixedAmountsByGrade: {} };
}

function createEmptyGradeFeeSetting(grade = '', index = 0) {
  return {
    grade,
    enrollmentFee: '',
    monthlyTuition: '',
    enrollmentBonus: '',
    dueDay: 10,
    benefitRules: [createEmptyBenefitDraft(index)],
  };
}

const emptyCommunicationForm = {
  title: '',
  body: '',
  authorId: '',
  videoUrl: '',
  audienceType: 'general',
  gradeTargets: [],
  courseTargets: [],
  parentTargets: [],
  studentTargets: [],
  media: [],
};

const emptyCommunicationAuthorDraft = {
  name: '',
  photoUrl: '',
  thumbUrl: '',
  uploading: false,
  error: '',
};

const emptyMarketingFilters = {
  search: '',
  stage: '',
  grade: '',
  status: '',
};

const emptyMarketingForm = {
  subject: '',
  title: '',
  body: '',
  imageUrl: '',
  imagePreviewUrl: '',
  imageAlt: '',
};

function normalizeMarketingSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMarketingApplicantId(applicant = {}) {
  return String(applicant.id || applicant._id || '');
}

function getMarketingGuardianEmail(applicant = {}) {
  return String(applicant.guardian?.email || applicant.guardianEmail || '').trim().toLowerCase();
}

function getMarketingGuardianName(applicant = {}) {
  return String(applicant.guardian?.name || applicant.guardianName || '').trim();
}

function getMarketingStageLabel(stageTemplates = [], stageKey = '') {
  return stageTemplates.find((stage) => stage.key === stageKey)?.label || stageKey || 'Sin etapa';
}

function getMarketingStatusLabel(value = '') {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'withdrawn') return 'Desistido';
  if (status === 'enrolled') return 'Matriculado';
  if (status === 'interested') return 'Interesado';
  if (status === 'in_process') return 'En proceso';
  if (status === 'active') return 'Activo';
  return value || 'Sin estado';
}

function createCommunicationMediaId(kind = 'media') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${kind}-${crypto.randomUUID()}`;
  }
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stripCommunicationMediaForSubmit(mediaItems = []) {
  return mediaItems
    .filter((item) => item && !item.uploading && !item.uploadError)
    .map(({ localId, previewSrc, uploading, uploadError, fileName, ...item }) => item);
}

function revokeCommunicationPreviewUrl(item) {
  if (item?.previewSrc && String(item.previewSrc).startsWith('blob:')) {
    URL.revokeObjectURL(item.previewSrc);
  }
}

function moveArrayItem(items, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items;
  }
  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, movedItem);
  return nextItems;
}

function createApprovalDraft(request) {
  return {
    requestId: request?._id || '',
    title: request?.title || '',
    body: request?.body || '',
    emailSubject: request?.emailSubject || '',
    audienceType: request?.audienceType || 'general',
    gradeTargets: Array.isArray(request?.gradeTargets) ? request.gradeTargets : [],
    courseTargets: Array.isArray(request?.courseTargets) ? request.courseTargets : [],
    parentTargets: Array.isArray(request?.parentTargets) ? request.parentTargets : [],
    studentTargets: Array.isArray(request?.studentTargets) ? request.studentTargets : [],
    media: Array.isArray(request?.media) ? request.media : [],
    reviewNotes: request?.reviewNotes || '',
  };
}

function buildSectionLabel(sectionKey, pendingApprovals, sections = SECTION_OPTIONS) {
  const section = sections.find((item) => item.key === sectionKey);
  if (!section) return '';
  if (sectionKey === 'approvals' && pendingApprovals > 0) {
    return `${section.label} (${pendingApprovals})`;
  }
  return section.label;
}

function AcademicSecretaryMediaPreview({ items = [] }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="academic-secretary__media-empty">El docente no adjuntó contenido visual.</p>;
  }

  return (
    <div className="academic-secretary__media-strip academic-secretary__media-strip--readonly">
      {items.map((item, index) => (
        <article className="academic-secretary__media-card" key={`${item.kind || 'image'}-${item.src || 'media'}-${index}`}>
          <div className="academic-secretary__media-thumb">
            {item.kind === 'video'
              ? <div className="academic-secretary__media-video">Video</div>
              : <img alt={item.alt || `Adjunto ${index + 1}`} src={item.thumbUrl || item.src} />}
          </div>
          <div className="academic-secretary__media-copy">
            <strong>{item.kind === 'video' ? 'Video del docente' : `Adjunto ${index + 1}`}</strong>
            <span>{item.src || 'Sin URL'}</span>
          </div>
          <a className="academic-secretary__media-link" href={item.src || '#'} rel="noreferrer" target="_blank">Abrir</a>
        </article>
      ))}
    </div>
  );
}

function createMediaPreviewItem(item, index) {
  return {
    id: item.id || `media-${index + 1}`,
    kind: item.kind || 'image',
    src: item.src || '',
    thumbUrl: item.thumbUrl || item.src || '',
    alt: item.alt || '',
  };
}

function createAcademicDatabaseEditDraft(item) {
  return {
    grade: item?.grade || '',
    course: item?.course || '',
    lastName: item?.lastName || '',
    firstName: item?.firstName || '',
    gender: item?.gender || '',
    documentType: item?.documentType || '',
    documentNumber: item?.documentNumber || '',
    birthDate: formatDateForExcel(item?.birthDate),
    bloodType: item?.bloodType || '',
    birthPlace: item?.birthPlace || '',
    address: item?.address || '',
    motherId: item?.motherId || '',
    motherName: item?.motherName || '',
    motherDocumentType: item?.motherDocumentType || '',
    motherDocumentNumber: item?.motherDocumentNumber || '',
    motherPhone: item?.motherPhone || '',
    motherEmail: item?.motherEmail || '',
    fatherId: item?.fatherId || '',
    fatherName: item?.fatherName || '',
    fatherDocumentType: item?.fatherDocumentType || '',
    fatherDocumentNumber: item?.fatherDocumentNumber || '',
    fatherPhone: item?.fatherPhone || '',
    fatherEmail: item?.fatherEmail || '',
  };
}

function createParentDraftFromAcademicRow(item = {}, key = 'mother') {
  return {
    ...createEmptyParentDraft(),
    _id: item?.[`${key}Id`] || '',
    name: item?.[`${key}Name`] || '',
    documentType: item?.[`${key}DocumentType`] || 'CC',
    documentNumber: item?.[`${key}DocumentNumber`] || '',
    phone: item?.[`${key}Phone`] || '',
    email: item?.[`${key}Email`] || '',
    address: item?.address || '',
  };
}

function createEnrollmentFormFromAcademicRow(item = {}, gradeOptions = []) {
  const medicalProfile = item?.medicalProfile || {};
  const medicationAuthorization = medicalProfile.medicationAuthorization || {};
  const resolvedGrade = resolveEnrollmentGradeValueForSelector(item, gradeOptions);

  return {
    father: createParentDraftFromAcademicRow(item, 'father'),
    mother: createParentDraftFromAcademicRow(item, 'mother'),
    primaryGuardian: item?.fatherName && !item?.motherName ? 'father' : 'mother',
    students: [{
      ...createEmptyStudentDraft(),
      _id: item?._id || '',
      firstName: item?.firstName || '',
      lastName: item?.lastName || '',
      gender: item?.gender || '',
      documentType: item?.documentType || 'TI',
      documentNumber: item?.documentNumber || '',
      birthDate: formatDateForExcel(item?.birthDate),
      bloodType: item?.bloodType || '',
      birthPlace: item?.birthPlace || '',
      address: item?.address || '',
      grade: resolvedGrade,
      course: item?.course || '',
      entryDate: formatDateForExcel(item?.entryDate),
      schoolCode: item?.schoolCode || '',
      enrollmentBonusInstallments: item?.enrollmentBonusInstallments || 1,
      annualTuitionInstallments: item?.annualTuitionInstallments || 1,
      initialEnrollmentAndFirstTuitionPaid: Boolean(item?.initialEnrollmentAndFirstTuitionPaid),
      annualTuitionAdditionalDiscountPercent: item?.annualTuitionAdditionalDiscountPercent ?? '',
      annualTuitionAdditionalDiscountLabel: item?.annualTuitionAdditionalDiscountLabel || '',
      monthlyTuitionAdditionalDiscountPercent: item?.monthlyTuitionAdditionalDiscountPercent ?? '',
      monthlyTuitionAdditionalDiscountLabel: item?.monthlyTuitionAdditionalDiscountLabel || '',
      medicalProfile: {
        allergies: medicalProfile.allergies || '',
        chronicConditions: medicalProfile.chronicConditions || '',
        currentMedications: medicalProfile.currentMedications || '',
        dietaryRestrictions: medicalProfile.dietaryRestrictions || '',
        healthInsurance: medicalProfile.healthInsurance || '',
        emergencyMedicalContactName: medicalProfile.emergencyMedicalContactName || '',
        emergencyMedicalContactPhone: medicalProfile.emergencyMedicalContactPhone || '',
        physicianName: medicalProfile.physicianName || '',
        physicianPhone: medicalProfile.physicianPhone || '',
        medicationAuthorization: {
          status: medicationAuthorization.status || '',
          authorizedBy: medicationAuthorization.authorizedBy || '',
          authorizedMedications: medicationAuthorization.authorizedMedications || '',
          instructions: medicationAuthorization.instructions || '',
          notes: medicationAuthorization.notes || '',
        },
      },
    }],
  };
}

function createAcademicDatabasePayloadFromEnrollmentForm(enrollmentForm = {}) {
  const student = enrollmentForm.students?.[0] || createEmptyStudentDraft();
  return {
    ...createAcademicDatabaseEditDraft({
      ...student,
      motherId: enrollmentForm.mother?._id || '',
      fatherId: enrollmentForm.father?._id || '',
      motherName: enrollmentForm.mother?.name || '',
      motherDocumentType: enrollmentForm.mother?.documentType || '',
      motherDocumentNumber: enrollmentForm.mother?.documentNumber || '',
      motherPhone: enrollmentForm.mother?.phone || '',
      motherEmail: enrollmentForm.mother?.email || '',
      fatherName: enrollmentForm.father?.name || '',
      fatherDocumentType: enrollmentForm.father?.documentType || '',
      fatherDocumentNumber: enrollmentForm.father?.documentNumber || '',
      fatherPhone: enrollmentForm.father?.phone || '',
      fatherEmail: enrollmentForm.father?.email || '',
    }),
    entryDate: student.entryDate || '',
    schoolCode: student.schoolCode || '',
    enrollmentBonusInstallments: student.enrollmentBonusInstallments || 1,
    annualTuitionInstallments: student.annualTuitionInstallments || 1,
    initialEnrollmentAndFirstTuitionPaid: Boolean(student.initialEnrollmentAndFirstTuitionPaid),
    annualTuitionAdditionalDiscountPercent: student.annualTuitionAdditionalDiscountPercent || '',
    annualTuitionAdditionalDiscountLabel: student.annualTuitionAdditionalDiscountLabel || '',
    monthlyTuitionAdditionalDiscountPercent: student.monthlyTuitionAdditionalDiscountPercent || '',
    monthlyTuitionAdditionalDiscountLabel: student.monthlyTuitionAdditionalDiscountLabel || '',
    medicalProfile: student.medicalProfile || createEmptyStudentDraft().medicalProfile,
  };
}

function AcademicEnrolledStudentsPanel({
  rows = [],
  totalCount = 0,
  filters = {},
  levelOptions = [],
  gradeOptions = [],
  rowMetaById = {},
  busy = false,
  formatGradeLabel,
  onFilterChange,
  onEdit,
}) {
  const visibleRows = Array.isArray(rows) ? rows : [];
  const updateFilter = (key, value) => onFilterChange?.((previous) => ({ ...previous, [key]: value }));

  return (
    <section className="academic-secretary__subform academic-secretary__subform--soft academic-secretary__enrolled-students-panel">
      <div className="academic-secretary__panel-head academic-secretary__panel-head--compact">
        <div>
          <h3>Alumnos matriculados</h3>
          <p>Consulta, filtra y edita los alumnos ya registrados desde matrículas.</p>
        </div>
        <div className="academic-secretary__badge-group">
          <span className="academic-secretary__badge">Mostrando {visibleRows.length} de {totalCount} estudiantes</span>
        </div>
      </div>

      <div className="academic-secretary__database-filters academic-secretary__database-filters--enrollments">
        <label>
          Nivel
          <select value={filters.level || ''} onChange={(event) => updateFilter('level', event.target.value)}>
            <option value="">Todos los niveles</option>
            {levelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Grado
          <select value={filters.grade || ''} onChange={(event) => updateFilter('grade', event.target.value)}>
            <option value="">Todos los grados</option>
            {gradeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Alumno
          <input value={filters.student || ''} onChange={(event) => updateFilter('student', event.target.value)} placeholder="Nombre o apellido" />
        </label>
        <label>
          Padre
          <input value={filters.father || ''} onChange={(event) => updateFilter('father', event.target.value)} placeholder="Nombre del padre" />
        </label>
        <label>
          Madre
          <input value={filters.mother || ''} onChange={(event) => updateFilter('mother', event.target.value)} placeholder="Nombre de la madre" />
        </label>
      </div>

      <div className="academic-secretary__table-wrap academic-secretary__table-wrap--compact academic-secretary__table-wrap--enrolled-students">
        <table className="academic-secretary__table academic-secretary__table--enrolled-students">
          <thead>
            <tr>
              <th>Alumno</th>
              <th>Grado</th>
              <th>Documento</th>
              <th>Acudientes</th>
              <th>Contacto</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {totalCount === 0 ? <tr><td colSpan="6">Aún no hay alumnos matriculados.</td></tr> : null}
            {totalCount > 0 && visibleRows.length === 0 ? <tr><td colSpan="6">No hay alumnos que coincidan con los filtros actuales.</td></tr> : null}
            {visibleRows.map((item) => {
              const rowId = String(item?._id || '');
              const rowMeta = rowMetaById[rowId] || { gradeLabel: formatGradeLabel?.(item.grade) || item.grade || 'Sin grado' };
              return (
                <tr key={rowId || item.documentNumber || `${item.firstName}-${item.lastName}`}>
                  <td>
                    <strong>{`${item.lastName || ''} ${item.firstName || ''}`.trim() || item.name || 'Sin nombre'}</strong>
                  </td>
                  <td>
                    <div><strong>{rowMeta.gradeLabel}</strong></div>
                  </td>
                  <td>
                    <span>{[item.documentType, item.documentNumber].filter(Boolean).join(' ') || '-'}</span>
                  </td>
                  <td>
                    <div><span>Madre: {item.motherName || '-'}</span><span>Padre: {item.fatherName || '-'}</span></div>
                  </td>
                  <td>
                    <div><span>{item.motherPhone || item.fatherPhone || '-'}</span><span>{item.motherEmail || item.fatherEmail || '-'}</span></div>
                  </td>
                  <td className="academic-secretary__table-actions-cell">
                    <button className="btn" disabled={busy || !rowId} type="button" onClick={() => onEdit(item)}>Editar arriba</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function calculateAgeFromDate(value) {
  if (!value) return '';
  const birthDate = new Date(value);
  if (Number.isNaN(birthDate.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : '';
}

function buildAcademicSecretaryBootstrapState(payload = {}, feeSettingsOverride = undefined) {
  return {
    parents: payload.parents || [],
    students: payload.students || [],
    communications: payload.communications || [],
    communicationAuthors: payload.communicationAuthors || [],
    grades: payload.grades || [],
    courses: payload.courses || [],
    courseOptions: payload.courseOptions || [],
    billing: payload.billing || null,
    communicationRequests: payload.communicationRequests || [],
    communicationRequestCounts: payload.communicationRequestCounts || { pending: 0, approved: 0, rejected: 0 },
    calendarAssignments: payload.calendarAssignments || [],
    feeSettings: feeSettingsOverride !== undefined ? feeSettingsOverride : (payload.feeSettings || null),
    academicDatabase: payload.academicDatabase || [],
    academicStructure: payload.academicStructure || { grades: [] },
  };
}

function hasCompleteAcademicFeeSettings(feeSettings = null) {
  return Array.isArray(feeSettings?.benefitRules) && Array.isArray(feeSettings?.enrollmentBenefitRules);
}

function AcademicSecretaryDashboard({ portalMode = '', initialSection = 'overview', embedded = false }) {
  const user = useAuthStore((state) => state.user);
  const isBillingPortal = portalMode === 'billing' || user?.role === 'billing';
  const portalSections = isBillingPortal ? BILLING_SECTION_OPTIONS : SECTION_OPTIONS;
  const normalizedInitialSection = portalSections.some((section) => section.key === initialSection) ? initialSection : 'overview';
  const academicDatabaseImportInputRef = useRef(null);
  const [bootstrap, setBootstrap] = useState({
    parents: [], students: [], communications: [], communicationAuthors: [], grades: [], courses: [], courseOptions: [], billing: null, communicationRequests: [], communicationRequestCounts: { pending: 0, approved: 0, rejected: 0 }, calendarAssignments: [], feeSettings: null, academicDatabase: [], academicStructure: { grades: [] },
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeSection, setActiveSection] = useState(normalizedInitialSection);
  const [editingAcademicRowId, setEditingAcademicRowId] = useState('');
  const [academicDatabaseDrafts, setAcademicDatabaseDrafts] = useState({});
  const [academicDatabaseFilters, setAcademicDatabaseFilters] = useState({
    level: '',
    grade: '',
    course: '',
    student: '',
    father: '',
    mother: '',
  });
  const [communicationForm, setCommunicationForm] = useState(emptyCommunicationForm);
  const [communicationAuthorDraft, setCommunicationAuthorDraft] = useState(emptyCommunicationAuthorDraft);
  const [editingCommunicationAuthorId, setEditingCommunicationAuthorId] = useState('');
  const [editingCommunicationId, setEditingCommunicationId] = useState('');
  const [draggingCommunicationMediaId, setDraggingCommunicationMediaId] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [approvalDraft, setApprovalDraft] = useState(createApprovalDraft(null));
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [marketingData, setMarketingData] = useState({ applicants: [], stageTemplates: [], gradeOptions: [] });
  const [marketingLoaded, setMarketingLoaded] = useState(false);
  const [marketingLoading, setMarketingLoading] = useState(false);
  const [marketingHistory, setMarketingHistory] = useState([]);
  const [marketingHistoryLoaded, setMarketingHistoryLoaded] = useState(false);
  const [marketingHistoryLoading, setMarketingHistoryLoading] = useState(false);
  const [marketingFilters, setMarketingFilters] = useState(emptyMarketingFilters);
  const [selectedMarketingApplicantIds, setSelectedMarketingApplicantIds] = useState([]);
  const [marketingForm, setMarketingForm] = useState(emptyMarketingForm);
  const [uploadingMarketingImage, setUploadingMarketingImage] = useState(false);
  const [selectedCostGrade, setSelectedCostGrade] = useState('');
  const [costSimulationDraft, setCostSimulationDraft] = useState({
    entryDate: '',
    costQuoteValidity: '',
    enrollmentSimulationRuleKey: 'manual',
    enrollmentBonusInstallments: 1,
    annualTuitionInstallments: 1,
    annualTuitionAdditionalDiscountPercent: '',
    annualTuitionAdditionalDiscountLabel: '',
    monthlyTuitionAdditionalDiscountPercent: '',
    monthlyTuitionAdditionalDiscountLabel: '',
    paymentSimulationRuleKey: 'full',
  });
  const [enrollmentForm, setEnrollmentForm] = useState({
    father: createEmptyParentDraft(),
    mother: createEmptyParentDraft(),
    primaryGuardian: 'mother',
    students: [createEmptyStudentDraft()],
  });
  const [enrollmentEditingStudentId, setEnrollmentEditingStudentId] = useState('');
  const [routeAssignmentData, setRouteAssignmentData] = useState({ drivers: [], routes: [], availableStudents: [] });
  const [routeAssignmentsLoading, setRouteAssignmentsLoading] = useState(false);
  const [routeAssignmentsLoaded, setRouteAssignmentsLoaded] = useState(false);
  const [routeAssignmentForm, setRouteAssignmentForm] = useState({
    driverUserId: '',
    studentId: '',
    pickupAddress: '',
    notes: '',
  });
  const [billingSearch, setBillingSearch] = useState('');
  const [selectedBillingStudentId, setSelectedBillingStudentId] = useState('');
  const [billingPaymentDraft, setBillingPaymentDraft] = useState(createBillingPaymentDraft);
  const [billingPaymentModal, setBillingPaymentModal] = useState({ open: false, row: null });
  const [billingPaymentDetailModal, setBillingPaymentDetailModal] = useState({ open: false, row: null });
  const [followUpModal, setFollowUpModal] = useState({ open: false, type: '', item: null, title: '', body: '' });
  const [deleteCommunicationModal, setDeleteCommunicationModal] = useState({ open: false, item: null });
  const [communicationEngagementModal, setCommunicationEngagementModal] = useState({ open: false, type: 'comments', item: null });
  const [deleteAuthorModal, setDeleteAuthorModal] = useState({ open: false, author: null });
  const [deleteCommentModal, setDeleteCommentModal] = useState({ open: false, communication: null, comment: null });
  const actionInFlightRef = useRef(false);
  const communicationPreviewUrlsRef = useRef(new Set());

  useEffect(() => {
    if (!error && !success) return undefined;
    const timer = window.setTimeout(() => {
      setError('');
      setSuccess('');
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [error, success]);

  const resolveFeeSettingsForBootstrap = async (payload = {}) => {
    try {
      const feeSettingsResponse = await getAcademicSecretaryFeeSettings();
      if (feeSettingsResponse?.data) {
        return feeSettingsResponse.data;
      }
    } catch {
      // Fall back to bootstrap payload when the dedicated endpoint is unavailable.
    }

    return payload.feeSettings || null;
  };

  const loadBootstrap = async () => {
    const response = await getAcademicSecretaryBootstrap();
    const payload = response.data || {};
    const feeSettings = await resolveFeeSettingsForBootstrap(payload);
    setBootstrap(buildAcademicSecretaryBootstrapState(payload, feeSettings));
  };

  const loadSchoolRouteAssignments = async () => {
    setRouteAssignmentsLoading(true);
    try {
      const response = await getAcademicSecretarySchoolRoutes();
      const payload = response.data || {};
      const nextData = {
        drivers: payload.drivers || [],
        routes: payload.routes || [],
        availableStudents: payload.availableStudents || [],
      };

      setRouteAssignmentData(nextData);
      setRouteAssignmentForm((previous) => ({
        ...previous,
        driverUserId: previous.driverUserId || nextData.drivers[0]?.id || '',
      }));
      return nextData;
    } catch (requestError) {
      setError(getAcademicSecretaryRequestMessage(requestError, 'No se pudo cargar la configuración de rutas.'));
      return null;
    } finally {
      setRouteAssignmentsLoaded(true);
      setRouteAssignmentsLoading(false);
    }
  };

  const handleCreateCalendarAssignment = async (draft) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await createAcademicCalendarAssignment(draft);
      const item = response.data?.item;
      if (item) {
        setBootstrap((previous) => ({
          ...previous,
          calendarAssignments: [item, ...(previous.calendarAssignments || [])],
        }));
      }
      setSuccess('Asignación publicada en el calendario escolar.');
    } catch (requestError) {
      setError(getAcademicSecretaryRequestMessage(requestError, 'No se pudo publicar la asignación.'));
      throw requestError;
    } finally {
      setBusy(false);
    }
  };

  const handleArchiveCalendarAssignment = async (item) => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await archiveAcademicCalendarAssignment(item.id);
      setBootstrap((previous) => ({
        ...previous,
        calendarAssignments: (previous.calendarAssignments || []).filter((assignment) => assignment.id !== item.id),
      }));
      setSuccess('Asignación archivada.');
    } catch (requestError) {
      setError(getAcademicSecretaryRequestMessage(requestError, 'No se pudo archivar la asignación.'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    getAcademicSecretaryBootstrap()
      .then(async (response) => {
        if (cancelled) return;
        const payload = response.data || {};
        const feeSettings = await resolveFeeSettingsForBootstrap(payload);
        if (cancelled) return;
        setBootstrap(buildAcademicSecretaryBootstrapState(payload, feeSettings));
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(getAcademicSecretaryRequestMessage(requestError, isBillingPortal ? 'No se pudo cargar el portal de cartera.' : 'No se pudo cargar el portal de secretaría académica.'));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isBillingPortal]);

  useEffect(() => {
    if (!portalSections.some((section) => section.key === activeSection)) {
      setActiveSection(normalizedInitialSection);
    }
  }, [activeSection, normalizedInitialSection, portalSections]);

  useEffect(() => {
    setActiveSection(normalizedInitialSection);
  }, [normalizedInitialSection]);

  useEffect(() => {
    if (activeSection === 'routes' && !routeAssignmentsLoaded && !routeAssignmentsLoading) {
      loadSchoolRouteAssignments();
    }
  }, [activeSection, routeAssignmentsLoaded, routeAssignmentsLoading]);

  const schoolName = getSchoolDisplayName(user || localStorage.getItem('selectedSchoolId'), 'Colegio no definido');
  const billing = useMemo(
    () => bootstrap.billing || { kpis: { pendingAmount: 0, totalPendingCharges: 0, paidThisMonth: 0, overdueBuckets: {} }, charges: [], studentAccounts: [], overdueParents: [], recentPayments: [], followUps: [] },
    [bootstrap.billing]
  );

  const billingStudentAccounts = useMemo(() => Array.isArray(billing.studentAccounts) ? billing.studentAccounts : [], [billing.studentAccounts]);
  const filteredBillingStudentRows = useMemo(() => {
    const term = normalizeBillingSearch(billingSearch);
    const rows = term
      ? billingStudentAccounts.filter((account) => normalizeBillingSearch([
        account.studentName,
        account.documentNumber,
        account.grade,
        account.course,
        account.parentName,
        account.parentPhone,
        account.parentEmail,
      ].filter(Boolean).join(' ')).includes(term))
      : billingStudentAccounts;

    return rows.slice(0, 50);
  }, [billingSearch, billingStudentAccounts]);

  const selectedBillingAccount = useMemo(() => {
    if (!filteredBillingStudentRows.length) return null;
    return filteredBillingStudentRows.find((account) => String(account.studentId) === String(selectedBillingStudentId)) || filteredBillingStudentRows[0];
  }, [filteredBillingStudentRows, selectedBillingStudentId]);

  const selectedBillingPendingCharges = useMemo(() => (
    (selectedBillingAccount?.charges || []).filter((charge) => ['pending', 'overdue'].includes(String(charge.status)) && Number(charge.amount || 0) > 0)
  ), [selectedBillingAccount]);
  const billingPaymentModalCanSubmit = Boolean(billingPaymentDraft.chargeId || billingPaymentModal.row);

  useEffect(() => {
    if (!isBillingPortal || !filteredBillingStudentRows.length) return;
    const hasSelectedRow = filteredBillingStudentRows.some((account) => String(account.studentId) === String(selectedBillingStudentId));
    if (!hasSelectedRow) {
      setSelectedBillingStudentId(String(filteredBillingStudentRows[0].studentId || ''));
    }
  }, [filteredBillingStudentRows, isBillingPortal, selectedBillingStudentId]);

  useEffect(() => {
    if (!isBillingPortal) return;
    const firstPendingCharge = selectedBillingPendingCharges[0] || null;
    setBillingPaymentDraft((previous) => {
      const chargeStillAvailable = selectedBillingPendingCharges.some((charge) => String(charge._id) === String(previous.chargeId));
      const nextCharge = chargeStillAvailable ? selectedBillingPendingCharges.find((charge) => String(charge._id) === String(previous.chargeId)) : firstPendingCharge;
      return {
        ...previous,
        chargeId: nextCharge?._id || '',
        amount: nextCharge ? String(Math.round(Number(nextCharge.amount || 0))) : '',
      };
    });
  }, [isBillingPortal, selectedBillingAccount?.studentId, selectedBillingPendingCharges]);

  useEffect(() => () => {
    communicationPreviewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    communicationPreviewUrlsRef.current.clear();
  }, []);

  const chargeRowsByParentId = useMemo(() => {
    const rowsMap = new Map();

    (billing.charges || []).forEach((charge) => {
      const normalizedStatus = String(charge?.status || '').trim();
      if (!['pending', 'overdue', 'paid'].includes(normalizedStatus)) return;

      const parentId = String(charge?.parentId?._id || charge?.parentId || '').trim();
      if (!parentId) return;

      if (!rowsMap.has(parentId)) rowsMap.set(parentId, []);
      rowsMap.get(parentId).push(charge);
    });

    return rowsMap;
  }, [billing.charges]);

  const overdueFamilyRows = useMemo(() => {
    return Array.from(chargeRowsByParentId.entries())
      .map(([parentId, relatedCharges]) => {
        const pendingCharges = relatedCharges.filter((charge) => ['pending', 'overdue'].includes(String(charge?.status || '')));
        const paidCharges = relatedCharges.filter((charge) => String(charge?.status || '') === 'paid');
        const overdueDays = pendingCharges.reduce((maxDays, charge) => Math.max(maxDays, calculateOverdueDays(charge?.dueDate)), 0);
        const overdueMonths = pendingCharges.reduce((maxMonths, charge) => Math.max(maxMonths, Number(charge?.overdueMonths || 0)), 0);
        const hasOverdue = pendingCharges.some((charge) => String(charge?.status || '') === 'overdue' || Number(charge?.overdueMonths || 0) > 0 || calculateOverdueDays(charge?.dueDate) > 0);
        const firstCharge = relatedCharges[0] || {};
        const students = Array.from(new Set(relatedCharges.map((charge) => charge?.studentName).filter(Boolean)));
        const amount = pendingCharges.reduce((sum, charge) => sum + Number(charge?.amount || 0), 0);

        return {
          parentId: parentId || String(firstCharge?.parentName || 'sin-acudiente'),
          parentName: firstCharge?.parentName || 'Acudiente',
          parentPhone: firstCharge?.parentPhone || '',
          students,
          amount,
          overdueDays,
          overdueMonths,
          statusLabel: pendingCharges.length ? (hasOverdue ? 'En mora' : 'Pendiente de pago') : (paidCharges.length ? 'Ya pagado' : 'Sin pago activo'),
        };
      })
      .sort((left, right) => {
        if (Number(right.amount > 0) !== Number(left.amount > 0)) return Number(right.amount > 0) - Number(left.amount > 0);
        if (right.overdueDays !== left.overdueDays) return right.overdueDays - left.overdueDays;
        if (right.overdueMonths !== left.overdueMonths) return right.overdueMonths - left.overdueMonths;
        return right.amount - left.amount;
      });
  }, [chargeRowsByParentId]);

  const gradeCatalog = useMemo(() => {
    const structureGrades = Array.isArray(bootstrap.academicStructure?.grades) ? bootstrap.academicStructure.grades : [];
    if (structureGrades.length > 0) {
      return structureGrades.map((grade) => ({
        value: String(grade?.key || grade?.label || '').trim(),
        label: String(grade?.label || grade?.key || '').trim(),
      })).filter((grade) => grade.value && grade.label);
    }

    return (bootstrap.grades || []).map((grade) => {
      const value = String(grade || '').trim();
      return { value, label: value };
    }).filter((grade) => grade.value);
  }, [bootstrap.academicStructure, bootstrap.grades]);
  const academicStructureGrades = useMemo(
    () => (Array.isArray(bootstrap.academicStructure?.grades) ? bootstrap.academicStructure.grades : []),
    [bootstrap.academicStructure?.grades],
  );
  const schoolYearCalendarOptions = useMemo(() => ({ academicGrades: academicStructureGrades }), [academicStructureGrades]);
  const gradeLabelByValue = useMemo(
    () => gradeCatalog.reduce((accumulator, grade) => {
      accumulator[grade.value] = grade.label;
      return accumulator;
    }, {}),
    [gradeCatalog]
  );
  const formatGradeLabel = (gradeValue) => gradeLabelByValue[String(gradeValue || '').trim()] || String(gradeValue || '').trim() || 'Sin grado';
  const parentOptions = useMemo(() => (bootstrap.parents || []).map((parent) => ({ value: parent._id, label: `${parent.name}${parent.email ? ` · ${parent.email}` : ''}` })), [bootstrap.parents]);
  const studentOptions = useMemo(() => (bootstrap.students || []).map((student) => ({ value: student._id, label: `${student.name} · ${formatGradeLabel(student.grade)}${student.course ? ` · ${student.course}` : ''}` })), [bootstrap.students, gradeLabelByValue]);
  const routeDrivers = routeAssignmentData.drivers || [];
  const selectedRouteDriver = routeDrivers.find((driver) => driver.id === routeAssignmentForm.driverUserId) || routeDrivers[0] || null;
  const selectedRoute = (routeAssignmentData.routes || []).find((route) => route.driverUserId === selectedRouteDriver?.id) || null;
  const selectedRouteStops = selectedRoute?.stops || [];
  const assignedRouteStudentIds = useMemo(() => new Set((routeAssignmentData.routes || []).flatMap((route) => (route.stops || []).map((stop) => stop.studentId)).filter(Boolean)), [routeAssignmentData.routes]);
  const assignableRouteStudents = useMemo(() => (routeAssignmentData.availableStudents || [])
    .filter((student) => !assignedRouteStudentIds.has(student.id) || student.id === routeAssignmentForm.studentId)
    .sort((left, right) => `${left.grade || ''}${left.course || ''}${left.name || ''}`.localeCompare(`${right.grade || ''}${right.course || ''}${right.name || ''}`, 'es', { numeric: true })), [routeAssignmentData.availableStudents, assignedRouteStudentIds, routeAssignmentForm.studentId]);
  const courseOptions = useMemo(() => {
    const optionMap = new Map();
    (bootstrap.courseOptions || []).forEach((course) => {
      const formatted = formatAcademicCourseTarget(course?.label || course?.value || course?.key);
      if (formatted?.value) {
        optionMap.set(formatted.value, formatted);
      }
    });
    (bootstrap.courses || []).forEach((course) => {
      const formatted = formatAcademicCourseTarget(course);
      if (formatted?.value && !optionMap.has(formatted.value)) {
        optionMap.set(formatted.value, formatted);
      }
    });
    return Array.from(optionMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'es', { numeric: true }));
  }, [bootstrap.courseOptions, bootstrap.courses]);
  const courseLabelByValue = useMemo(
    () => courseOptions.reduce((accumulator, course) => {
      accumulator[String(course.value || '').trim()] = course.label || course.value;
      return accumulator;
    }, {}),
    [courseOptions]
  );
  const formatRequestedCourseTargets = (courseTargets = [], fallbackCourseTitle = '') => {
    const labels = Array.from(new Set([
      fallbackCourseTitle,
      ...(Array.isArray(courseTargets) ? courseTargets : []),
    ].map((item) => String(item || '').trim()).filter(Boolean)))
      .map((item) => courseLabelByValue[item] || formatAcademicCourseTarget(item)?.label || item);

    return labels.length > 0 ? labels.join(', ') : 'Sin curso indicado';
  };
  const pendingRequests = useMemo(() => (bootstrap.communicationRequests || []).filter((request) => request.status === 'pending'), [bootstrap.communicationRequests]);
  const selectedRequest = useMemo(() => pendingRequests.find((request) => request._id === selectedRequestId) || pendingRequests[0] || null, [pendingRequests, selectedRequestId]);
  const availableCostGrades = useMemo(() => {
    const gradeSettings = Array.isArray(bootstrap.feeSettings?.gradeSettings) ? bootstrap.feeSettings.gradeSettings : [];
    const sourceGrades = gradeCatalog.length
      ? gradeCatalog
      : gradeSettings.map((item) => ({ value: String(item?.grade || '').trim(), label: String(item?.grade || '').trim() })).filter((grade) => grade.value);
    return sourceGrades.map((grade, index) => {
      const matchedSetting = findMatchingFeeSetting(gradeSettings, grade);
      return matchedSetting
        ? { ...matchedSetting, grade: grade.value }
        : { grade: grade.value, enrollmentBonus: 0, enrollmentFee: 0, monthlyTuition: 0, dueDay: 10, benefitRules: [], _index: index };
    }).filter((item) => item.grade);
  }, [bootstrap.feeSettings, gradeCatalog]);
  const availableCostGradeKeys = useMemo(() => availableCostGrades.map((item) => item.grade), [availableCostGrades]);
  const selectedCostSetting = useMemo(() => {
    return availableCostGrades.find((item) => item.grade === selectedCostGrade) || availableCostGrades[0] || null;
  }, [availableCostGrades, selectedCostGrade]);
  const generalBenefitRules = useMemo(() => {
    if (Array.isArray(bootstrap.feeSettings?.benefitRules) && bootstrap.feeSettings.benefitRules.length) {
      return bootstrap.feeSettings.benefitRules;
    }

    const gradeSettings = Array.isArray(bootstrap.feeSettings?.gradeSettings) ? bootstrap.feeSettings.gradeSettings : [];
    const legacySetting = gradeSettings.find((item) => Array.isArray(item?.benefitRules) && item.benefitRules.length) || null;
    return Array.isArray(legacySetting?.benefitRules) ? legacySetting.benefitRules : [];
  }, [bootstrap.feeSettings]);
  const feeSettingByGrade = useMemo(() => {
    return new Map(availableCostGrades.map((item) => [String(item?.grade || '').trim(), item]));
  }, [availableCostGrades]);
  const costSimulationBenefitRules = useMemo(() => {
    return generalBenefitRules.filter((rule) => doesBenefitRuleApplyToGrade(rule, selectedCostSetting?.grade));
  }, [generalBenefitRules, selectedCostSetting?.grade]);
  const costSimulationPaymentOptions = useMemo(() => {
    const baseMonthlyTuition = Number(selectedCostSetting?.monthlyTuition || 0);
    return [{ value: 'full', label: 'Precio full', generalDiscountPercent: 0, generalFixedDiscountAmount: 0, monthlyTuitionAmount: baseMonthlyTuition }].concat(
      costSimulationBenefitRules.map((rule, ruleIndex) => ({
        value: `benefit-${ruleIndex}`,
        label: rule.label || `Beneficio ${ruleIndex + 1}`,
        generalDiscountPercent: rule?.discountType === 'fixed' ? 0 : Math.min(100, Math.max(0, Number(rule?.discountPercent || 0))),
        generalFixedDiscountAmount: rule?.discountType === 'fixed' ? getFixedBenefitAmountForGrade(rule, selectedCostSetting?.grade) : 0,
        monthlyTuitionAmount: calculateBenefitTuitionAmount(baseMonthlyTuition, rule, selectedCostSetting?.grade),
        startDay: Number(rule?.startDay || 1),
        endDay: Number(rule?.endDay || 10),
      }))
    );
  }, [costSimulationBenefitRules, selectedCostSetting?.grade, selectedCostSetting?.monthlyTuition]);
  const selectedCostSimulationPaymentOption = useMemo(() => {
    return costSimulationPaymentOptions.find((option) => option.value === costSimulationDraft.paymentSimulationRuleKey) || costSimulationPaymentOptions[0];
  }, [costSimulationDraft.paymentSimulationRuleKey, costSimulationPaymentOptions]);
  const costSimulationEnrollmentOptions = useMemo(() => [{ value: 'manual', label: 'Fecha manual' }].concat(
    (Array.isArray(bootstrap.feeSettings?.enrollmentBenefitRules) ? bootstrap.feeSettings.enrollmentBenefitRules : [])
      .filter((rule) => doesBenefitRuleApplyToGrade(rule, selectedCostSetting?.grade))
      .map((rule, ruleIndex) => {
        const entryDate = formatDateInputValue(rule?.startDate);
        if (!entryDate) {
          return null;
        }

        const pricing = calculateAcademicProratedEnrollmentFee(selectedCostSetting?.enrollmentFee || 0, entryDate, bootstrap.feeSettings || {}, selectedCostSetting?.grade || '', schoolYearCalendarOptions);
        return {
          value: `enrollment-benefit-${ruleIndex}`,
          label: rule?.label || `Beneficio matricula ${ruleIndex + 1}`,
          entryDate,
          startDate: rule?.startDate,
          endDate: rule?.endDate,
          amount: Number(pricing.amount || 0),
          discountAmount: Number(pricing.enrollmentBenefitDiscountAmount || 0),
          pricing,
        };
      })
      .filter(Boolean)
  ), [bootstrap.feeSettings, selectedCostSetting?.enrollmentFee, selectedCostSetting?.grade]);
  const selectedCostSimulationEnrollmentOption = useMemo(() => {
    return costSimulationEnrollmentOptions.find((option) => option.value === costSimulationDraft.enrollmentSimulationRuleKey) || costSimulationEnrollmentOptions[0];
  }, [costSimulationDraft.enrollmentSimulationRuleKey, costSimulationEnrollmentOptions]);
  const costSimulationProratedEnrollmentFee = useMemo(() => calculateAcademicProratedEnrollmentFee(selectedCostSetting?.enrollmentFee || 0, costSimulationDraft.entryDate, bootstrap.feeSettings || {}, selectedCostSetting?.grade || '', schoolYearCalendarOptions), [bootstrap.feeSettings, costSimulationDraft.entryDate, selectedCostSetting?.enrollmentFee, selectedCostSetting?.grade, schoolYearCalendarOptions]);
  const costSimulationAnnualTuitionAdditionalDiscountPercent = Math.min(100, Math.max(0, Number(costSimulationDraft.annualTuitionAdditionalDiscountPercent || 0)));
  const costSimulationAdditionalDiscountPercent = Math.min(100, Math.max(0, Number(costSimulationDraft.monthlyTuitionAdditionalDiscountPercent || 0)));
  const costSimulationEstimatedMonthlyTuition = calculateMonthlyTuitionScenarioAmount(selectedCostSetting?.monthlyTuition || 0, selectedCostSimulationPaymentOption, costSimulationAdditionalDiscountPercent);
  const costSimulationPaymentSchedule = useMemo(() => {
    if (!selectedCostSetting) {
      return [];
    }

    return buildAcademicMonthlyPaymentSchedule({
      feeSettings: bootstrap.feeSettings || {},
      grade: selectedCostSetting?.grade || '',
      academicGrades: academicStructureGrades,
      schoolYearStartDate: bootstrap.feeSettings?.schoolYearStartDate,
      schoolYearEndDate: bootstrap.feeSettings?.schoolYearEndDate,
      academicYear: bootstrap.feeSettings?.academicYear,
      entryDate: costSimulationDraft.entryDate,
      monthlyTuitionAmount: Number(selectedCostSetting?.monthlyTuition || 0),
      enrollmentBonusAmount: Number(selectedCostSetting?.enrollmentBonus || 0),
      enrollmentBonusInstallments: Math.max(1, Number(costSimulationDraft.enrollmentBonusInstallments || 1)),
      annualTuitionAmount: Number(costSimulationProratedEnrollmentFee.amount || 0),
      annualTuitionInstallments: Math.max(1, Number(costSimulationDraft.annualTuitionInstallments || 1)),
      annualTuitionAdditionalDiscountPercent: costSimulationAnnualTuitionAdditionalDiscountPercent,
      generalDiscountPercent: Number(selectedCostSimulationPaymentOption?.generalDiscountPercent || 0),
      generalFixedDiscountAmount: Number(selectedCostSimulationPaymentOption?.generalFixedDiscountAmount || 0),
      additionalDiscountPercent: costSimulationAdditionalDiscountPercent,
    });
  }, [academicStructureGrades, bootstrap.feeSettings, costSimulationAdditionalDiscountPercent, costSimulationAnnualTuitionAdditionalDiscountPercent, costSimulationDraft.annualTuitionInstallments, costSimulationDraft.enrollmentBonusInstallments, costSimulationDraft.entryDate, costSimulationProratedEnrollmentFee.amount, selectedCostSetting, selectedCostSimulationPaymentOption]);
  const costSimulationExternalBonusAmount = Math.max(0, Number(selectedCostSetting?.enrollmentBonus || 0));
  const costSimulationBonusInstallments = Math.max(1, Number(costSimulationDraft.enrollmentBonusInstallments || 1));
  const costSimulationIncludesBonusInMonthlyProjection = costSimulationBonusInstallments > 1;
  const costSimulationBonusCashDiscountAmount = resolveEnrollmentBonusCashDiscountAmount(selectedCostSetting);
  const costSimulationCashBonusAmount = Math.max(0, costSimulationExternalBonusAmount - costSimulationBonusCashDiscountAmount);
  const costSimulationEstimatedEnrollmentFee = calculateDiscountedAmount(costSimulationProratedEnrollmentFee.amount || 0, costSimulationAnnualTuitionAdditionalDiscountPercent);
  const getCostSimulationProjectionRowTotal = (row) => Number(row.monthlyTuitionAmount || 0)
    + Number(row.enrollmentInstallmentAmount || 0)
    + (costSimulationIncludesBonusInMonthlyProjection ? Number(row.enrollmentBonusInstallmentAmount || 0) : 0);

  const onPrintCostSimulation = () => {
    if (!selectedCostSetting || costSimulationPaymentSchedule.length === 0) {
      setError('Selecciona un grado con costos configurados antes de imprimir la proyección.');
      return;
    }

    const enrollmentValueRows = [
      {
        label: 'Matrícula normal anual',
        condition: 'Valor base definido por rectoría',
        amount: formatCurrency(selectedCostSetting?.enrollmentFee || 0),
        detail: 'Antes de prorrateos, recargos o beneficios',
        isSelected: costSimulationDraft.enrollmentSimulationRuleKey === 'manual',
      },
    ].concat(costSimulationEnrollmentOptions.slice(1).map((option) => ({
      label: option.label,
      condition: `${formatDate(option.startDate)} al ${formatDate(option.endDate)}`,
      amount: formatCurrency(option.amount),
      detail: option.discountAmount > 0 ? `Beneficio: -${formatCurrency(option.discountAmount)}` : 'Valor pleno',
      isSelected: costSimulationDraft.enrollmentSimulationRuleKey === option.value,
    })));
    const tuitionValueRows = costSimulationPaymentOptions.map((option) => ({
      label: option.value === 'full' ? 'Pensión normal' : option.label,
      condition: option.value === 'full' ? 'Valor base definido por rectoría' : `Días ${option.startDay} al ${option.endDay}`,
      amount: formatCurrency(option.monthlyTuitionAmount),
      detail: option.value === 'full' ? 'Sin beneficio de pensión' : describeAcademicBenefitRule(costSimulationBenefitRules[Number(String(option.value).replace('benefit-', ''))] || {}, selectedCostSetting?.grade),
      isSelected: (costSimulationDraft.paymentSimulationRuleKey || 'full') === option.value,
    }));
    const printableRows = costSimulationPaymentSchedule.map((row) => ({
      monthLabel: row.monthLabel,
      monthlyTuitionAmount: formatCurrency(row.monthlyTuitionAmount),
      enrollmentInstallmentAmount: formatCurrency(row.enrollmentInstallmentAmount),
      enrollmentBonusInstallmentAmount: formatCurrency(row.enrollmentBonusInstallmentAmount),
      totalMonthAmount: formatCurrency(getCostSimulationProjectionRowTotal(row)),
    }));
    const bonusNote = costSimulationIncludesBonusInMonthlyProjection
      ? 'Esta proyección corresponde a los escenarios seleccionados por admisiones. Como el bono de ingreso está financiado, sus cuotas sí se incluyen en la proyección mensual. Esta impresión no reemplaza el contrato de matrícula ni los recibos oficiales.'
      : 'Esta proyección corresponde a los escenarios seleccionados por admisiones. Como el bono de ingreso se paga de contado, no se incluye dentro de la tabla mensual; el descuento por pago de contado se refleja en el resumen cuando está configurado. Esta impresión no reemplaza el contrato de matrícula ni los recibos oficiales.';
    const printWindow = window.open('', '_blank', 'width=960,height=1120');
    if (!printWindow) {
      setError('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta de nuevo.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildCostProjectionPrintHtml({
      schoolName,
      gradeLabel: formatGradeLabel(selectedCostSetting.grade),
      generatedAtLabel: formatDateTime(new Date()),
      summaryCards: [
        { label: costSimulationIncludesBonusInMonthlyProjection ? 'Bono financiado' : 'Bono de contado', value: formatCurrency(costSimulationIncludesBonusInMonthlyProjection ? costSimulationExternalBonusAmount : costSimulationCashBonusAmount) },
        { label: 'Matrícula del escenario', value: formatCurrency(costSimulationEstimatedEnrollmentFee) },
        { label: 'Pensión del escenario', value: formatCurrency(costSimulationEstimatedMonthlyTuition) },
      ],
      optionRows: [
        { label: 'Fecha de ingreso', value: costSimulationDraft.entryDate ? formatDate(costSimulationDraft.entryDate) : 'No definida' },
        { label: 'Vigencia de cotización para costos', value: costSimulationDraft.costQuoteValidity?.trim() || 'No definida' },
        { label: 'Escenario matrícula', value: selectedCostSimulationEnrollmentOption?.label || 'Fecha manual' },
        { label: 'Financiación matrícula', value: `${Math.max(1, Number(costSimulationDraft.annualTuitionInstallments || 1))} ${Number(costSimulationDraft.annualTuitionInstallments || 1) === 1 ? 'mes' : 'meses'}` },
        { label: 'Forma de pago del bono', value: costSimulationIncludesBonusInMonthlyProjection ? `${costSimulationBonusInstallments} meses` : 'De contado' },
        { label: 'Escenario pensión', value: selectedCostSimulationPaymentOption?.label || 'Precio full' },
        { label: 'Descuento adicional matrícula', value: `${costSimulationAnnualTuitionAdditionalDiscountPercent}%` },
        { label: 'Descuento adicional pensión', value: `${costSimulationAdditionalDiscountPercent}%` },
        { label: 'Beneficio sobre matrícula', value: costSimulationProratedEnrollmentFee.enrollmentBenefitDiscountAmount > 0 ? `-${formatCurrency(costSimulationProratedEnrollmentFee.enrollmentBenefitDiscountAmount)}` : formatCurrency(0) },
      ],
      enrollmentValueRows,
      tuitionValueRows,
      paymentRows: printableRows,
      includeBonusColumn: costSimulationIncludesBonusInMonthlyProjection,
      bonusNote,
    }));
    printWindow.document.close();
  };

  const academicDatabaseLevelLabels = useMemo(
    () => (Array.isArray(bootstrap.academicStructure?.levels) ? bootstrap.academicStructure.levels : []).reduce((accumulator, level) => {
      const levelKey = String(level?.key || '').trim();
      const levelLabel = String(level?.label || level?.key || '').trim();
      if (levelKey) {
        accumulator[levelKey] = levelLabel || levelKey;
      }
      return accumulator;
    }, {}),
    [bootstrap.academicStructure]
  );
  const academicDatabaseGradeMetadata = useMemo(
    () => buildAcademicStructureGradeMetadataIndex(
      Array.isArray(bootstrap.academicStructure?.grades) ? bootstrap.academicStructure.grades : [],
      academicDatabaseLevelLabels,
    ),
    [bootstrap.academicStructure, academicDatabaseLevelLabels]
  );
  const academicDatabaseRowMetaById = useMemo(
    () => (bootstrap.academicDatabase || []).reduce((accumulator, item) => {
      const rowId = String(item?._id || '').trim();
      const resolvedGradeKey = resolveStructureGradeKeyForStudent(item?.grade, academicStructureGrades);
      const metadata = academicDatabaseGradeMetadata[String(item?.grade || '').trim()]
        || academicDatabaseGradeMetadata[resolvedGradeKey]
        || null;
      accumulator[rowId] = {
        levelKey: metadata?.levelKey || '',
        levelLabel: metadata?.levelLabel || 'Sin nivel',
        gradeLabel: metadata?.gradeLabel || formatGradeLabel(resolvedGradeKey || item?.grade),
        courseLabel: String(item?.course || '').trim() || 'Sin curso',
        resolvedGradeKey: resolvedGradeKey || String(item?.grade || '').trim(),
      };
      return accumulator;
    }, {}),
    [academicDatabaseGradeMetadata, bootstrap.academicDatabase, academicStructureGrades, gradeLabelByValue]
  );
  const academicDatabaseLevelOptions = useMemo(() => {
    const options = (Array.isArray(bootstrap.academicStructure?.levels) ? bootstrap.academicStructure.levels : []).map((level) => ({
      value: String(level?.key || '').trim(),
      label: String(level?.label || level?.key || '').trim(),
    })).filter((option) => option.value && option.label);
    const seenLabels = new Set(options.map((option) => option.label));

    (bootstrap.academicDatabase || []).forEach((item) => {
      const levelLabel = academicDatabaseRowMetaById[String(item?._id || '')]?.levelLabel || '';
      if (levelLabel && levelLabel !== 'Sin nivel' && !seenLabels.has(levelLabel)) {
        seenLabels.add(levelLabel);
        options.push({ value: levelLabel, label: levelLabel });
      }
    });

    return options;
  }, [bootstrap.academicStructure, bootstrap.academicDatabase, academicDatabaseRowMetaById]);
  const academicDatabaseGradeOptions = useMemo(() => {
    const optionMap = new Map(gradeCatalog.map((grade) => [String(grade.value), { value: String(grade.value), label: grade.label }]));

    (bootstrap.academicDatabase || []).forEach((item) => {
      const gradeValue = String(item?.grade || '').trim();
      if (!gradeValue || optionMap.has(gradeValue)) {
        return;
      }

      optionMap.set(gradeValue, {
        value: gradeValue,
        label: academicDatabaseRowMetaById[String(item?._id || '')]?.gradeLabel || formatGradeLabel(gradeValue),
      });
    });

    return Array.from(optionMap.values());
  }, [bootstrap.academicDatabase, gradeCatalog, academicDatabaseRowMetaById, gradeLabelByValue]);
  const academicDatabaseCourseOptions = useMemo(() => {
    const optionMap = new Map(courseOptions.map((course) => [course.value, course]));

    (bootstrap.academicDatabase || []).forEach((item) => {
      const courseValue = String(item?.course || '').trim();
      if (courseValue && !optionMap.has(courseValue)) {
        optionMap.set(courseValue, { value: courseValue, label: courseValue });
      }
    });

    return Array.from(optionMap.values()).filter((option) => option.value);
  }, [bootstrap.academicDatabase, courseOptions]);

  const academicDatabaseRows = useMemo(() => (bootstrap.academicDatabase || []).map((item) => ([
    formatGradeLabel(item.grade),
    item.lastName || '',
    item.firstName || '',
    formatGenderLabel(item.gender),
    item.documentType || '',
    item.documentNumber || '',
    formatDateForExcel(item.birthDate),
    item.age ?? '',
    item.bloodType || '',
    item.birthPlace || '',
    item.address || '',
    item.motherName || '',
    item.motherDocumentType || '',
    item.motherDocumentNumber || '',
    item.motherPhone || '',
    item.motherEmail || '',
    item.fatherName || '',
    item.fatherDocumentType || '',
    item.fatherDocumentNumber || '',
    item.fatherPhone || '',
    item.fatherEmail || '',
  ])), [bootstrap.academicDatabase, gradeLabelByValue]);
  const filteredAcademicDatabase = useMemo(() => {
    const levelFilter = String(academicDatabaseFilters.level || '').trim();
    const gradeFilter = String(academicDatabaseFilters.grade || '').trim();
    const courseFilter = String(academicDatabaseFilters.course || '').trim();
    const studentQuery = String(academicDatabaseFilters.student || '').trim().toLowerCase();
    const fatherQuery = String(academicDatabaseFilters.father || '').trim().toLowerCase();
    const motherQuery = String(academicDatabaseFilters.mother || '').trim().toLowerCase();

    return (bootstrap.academicDatabase || []).filter((item) => {
      const rowMeta = academicDatabaseRowMetaById[String(item?._id || '')] || { levelKey: '', levelLabel: 'Sin nivel' };
      const courseValue = String(item?.course || '').trim();
      const studentValue = `${String(item?.firstName || '')} ${String(item?.lastName || '')}`.trim().toLowerCase();
      const fatherValue = String(item?.fatherName || '').toLowerCase();
      const motherValue = String(item?.motherName || '').toLowerCase();

      if (levelFilter && rowMeta.levelKey !== levelFilter && rowMeta.levelLabel !== levelFilter) {
        return false;
      }

      if (gradeFilter) {
        const resolvedStudentGrade = rowMeta.resolvedGradeKey || resolveStructureGradeKeyForStudent(item?.grade, academicStructureGrades);
        if (!gradesMatchForFilter(resolvedStudentGrade, gradeFilter) && !gradesMatchForFilter(item?.grade, gradeFilter)) {
          return false;
        }
      }

      if (courseFilter && courseValue !== courseFilter) {
        return false;
      }

      if (studentQuery && !studentValue.includes(studentQuery)) {
        return false;
      }

      if (fatherQuery && !fatherValue.includes(fatherQuery)) {
        return false;
      }

      if (motherQuery && !motherValue.includes(motherQuery)) {
        return false;
      }

      return true;
    });
  }, [bootstrap.academicDatabase, academicDatabaseFilters, academicDatabaseRowMetaById, academicStructureGrades]);
  const academicDatabaseLevelCounts = useMemo(() => {
    const countsByLevel = (bootstrap.academicDatabase || []).reduce((accumulator, item) => {
      const levelLabel = academicDatabaseRowMetaById[String(item?._id || '')]?.levelLabel || 'Sin nivel';
      accumulator[levelLabel] = Number(accumulator[levelLabel] || 0) + 1;
      return accumulator;
    }, {});

    const entries = academicDatabaseLevelOptions.map((option) => ({
      key: option.value,
      label: option.label,
      count: Number(countsByLevel[option.label] || 0),
    }));

    if (Number(countsByLevel['Sin nivel'] || 0) > 0) {
      entries.push({ key: 'sin-nivel', label: 'Sin nivel', count: Number(countsByLevel['Sin nivel'] || 0) });
    }

    return entries;
  }, [bootstrap.academicDatabase, academicDatabaseLevelOptions, academicDatabaseRowMetaById]);
  const pendingApprovalCount = Number(bootstrap.communicationRequestCounts?.pending || 0);
  const communicationAuthors = useMemo(() => (bootstrap.communicationAuthors || []).filter((author) => author && author._id), [bootstrap.communicationAuthors]);
  const defaultCommunicationAuthor = communicationAuthors.find((author) => author.isDefault) || null;
  const selectedCommunicationAuthorId = String(communicationForm.authorId || defaultCommunicationAuthor?._id || '');
  const selectedCommunicationAuthor = communicationAuthors.find((author) => String(author._id) === selectedCommunicationAuthorId) || defaultCommunicationAuthor || null;
  const canDeleteSelectedCommunicationAuthor = Boolean(selectedCommunicationAuthor?._id) && (
    !selectedCommunicationAuthor.isDefault
    || communicationAuthors.some((author) => String(author._id) !== String(selectedCommunicationAuthor._id))
  );
  const marketingApplicants = useMemo(() => (marketingData.applicants || []).map((applicant) => ({
    ...applicant,
    id: getMarketingApplicantId(applicant),
    guardianEmail: getMarketingGuardianEmail(applicant),
    guardianName: getMarketingGuardianName(applicant),
  })), [marketingData.applicants]);
  const marketingStageOptions = marketingData.stageTemplates || [];
  const marketingGradeOptions = useMemo(() => {
    const optionMap = new Map((marketingData.gradeOptions || []).map((option) => [String(option.value || option.label || ''), {
      value: String(option.value || option.label || ''),
      label: String(option.label || option.value || ''),
    }]));
    marketingApplicants.forEach((applicant) => {
      const grade = String(applicant.grade || '').trim();
      if (grade && !optionMap.has(grade)) {
        optionMap.set(grade, { value: grade, label: formatGradeLabel(grade) });
      }
    });
    return Array.from(optionMap.values()).filter((option) => option.value);
  }, [marketingData.gradeOptions, marketingApplicants, gradeLabelByValue]);
  const filteredMarketingApplicants = useMemo(() => {
    const searchQuery = normalizeMarketingSearch(marketingFilters.search);
    return marketingApplicants.filter((applicant) => {
      const stageKey = String(applicant.currentStageKey || '').trim();
      const grade = String(applicant.grade || '').trim();
      const status = String(applicant.status || '').trim();
      const haystack = normalizeMarketingSearch([
        applicant.studentName,
        applicant.guardianName,
        applicant.guardianEmail,
        applicant.grade,
        getMarketingStageLabel(marketingStageOptions, applicant.currentStageKey),
      ].filter(Boolean).join(' '));

      if (marketingFilters.stage && stageKey !== marketingFilters.stage) return false;
      if (marketingFilters.grade && grade !== marketingFilters.grade) return false;
      if (marketingFilters.status && status !== marketingFilters.status) return false;
      if (searchQuery && !haystack.includes(searchQuery)) return false;
      return true;
    });
  }, [marketingApplicants, marketingFilters, marketingStageOptions]);
  const eligibleMarketingApplicantIds = useMemo(() => filteredMarketingApplicants
    .filter((applicant) => applicant.id && applicant.guardianEmail)
    .map((applicant) => applicant.id), [filteredMarketingApplicants]);
  const selectedMarketingApplicantIdSet = useMemo(() => new Set(selectedMarketingApplicantIds), [selectedMarketingApplicantIds]);
  const selectedMarketingApplicants = useMemo(() => marketingApplicants.filter((applicant) => selectedMarketingApplicantIdSet.has(applicant.id) && applicant.guardianEmail), [marketingApplicants, selectedMarketingApplicantIdSet]);
  const allFilteredMarketingApplicantsSelected = Boolean(eligibleMarketingApplicantIds.length) && eligibleMarketingApplicantIds.every((applicantId) => selectedMarketingApplicantIdSet.has(applicantId));

  async function loadMarketingRecipients(force = false) {
    if (marketingLoading || (marketingLoaded && !force)) return;
    setMarketingLoading(true);
    setError('');
    try {
      const response = await getAdmissions({ view: 'dashboard' });
      const payload = response.data || {};
      setMarketingData({
        applicants: payload.applicants || [],
        stageTemplates: payload.stageTemplates || [],
        gradeOptions: payload.gradeOptions || [],
      });
      setMarketingLoaded(true);
    } catch (requestError) {
      setError(getAcademicSecretaryRequestMessage(requestError, 'No se pudo cargar la lista de aspirantes.'));
    } finally {
      setMarketingLoading(false);
    }
  }

  async function loadMarketingHistory(force = false) {
    if (marketingHistoryLoading || (marketingHistoryLoaded && !force)) return;
    setMarketingHistoryLoading(true);
    setError('');
    try {
      const response = await getAdmissionMarketingHistory();
      setMarketingHistory(response.data?.campaigns || []);
      setMarketingHistoryLoaded(true);
    } catch (requestError) {
      setError(getAcademicSecretaryRequestMessage(requestError, 'No se pudo cargar el historial de marketing.'));
    } finally {
      setMarketingHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedRequest) {
      setSelectedRequestId('');
      setApprovalDraft(createApprovalDraft(null));
      return;
    }

    setSelectedRequestId(selectedRequest._id);
    setApprovalDraft(createApprovalDraft(selectedRequest));
  }, [selectedRequest]);

  useEffect(() => {
    if (activeSection === 'marketing') {
      loadMarketingRecipients();
      loadMarketingHistory();
    }
  }, [activeSection]);

  useEffect(() => {
    if (!availableCostGradeKeys.length) {
      if (selectedCostGrade) {
        setSelectedCostGrade('');
      }
      return;
    }

    if (!selectedCostGrade || !availableCostGradeKeys.includes(selectedCostGrade)) {
      setSelectedCostGrade(availableCostGradeKeys[0]);
    }
  }, [availableCostGradeKeys, selectedCostGrade]);

  const onMultiSelectChange = (event, fieldName, setter) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    setter((previous) => ({ ...previous, [fieldName]: values }));
  };

  const runAction = async (request, doneMessage, nextSection = '') => {
    if (actionInFlightRef.current) {
      return null;
    }

    actionInFlightRef.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await request();
      if (doneMessage) setSuccess(doneMessage);
      if (nextSection) setActiveSection(nextSection);
      return result;
    } catch (requestError) {
      setError(getAcademicSecretaryRequestMessage(requestError));
      return null;
    } finally {
      actionInFlightRef.current = false;
      setBusy(false);
    }
  };

  const toggleMarketingApplicantSelection = (applicantId) => {
    const safeApplicantId = String(applicantId || '').trim();
    if (!safeApplicantId) return;
    setSelectedMarketingApplicantIds((previous) => (
      previous.includes(safeApplicantId)
        ? previous.filter((item) => item !== safeApplicantId)
        : [...previous, safeApplicantId]
    ));
  };

  const toggleAllFilteredMarketingApplicants = () => {
    setSelectedMarketingApplicantIds((previous) => {
      const previousSet = new Set(previous);
      if (allFilteredMarketingApplicantsSelected) {
        eligibleMarketingApplicantIds.forEach((applicantId) => previousSet.delete(applicantId));
      } else {
        eligibleMarketingApplicantIds.forEach((applicantId) => previousSet.add(applicantId));
      }
      return Array.from(previousSet);
    });
  };

  const onMarketingImageSelected = async (event) => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setUploadingMarketingImage(true);
    setError('');
    try {
      const response = await uploadAdmissionMarketingImage(file);
      const image = response.data?.image || {};
      setMarketingForm((previous) => ({
        ...previous,
        imageUrl: image.publicUrl || image.url || '',
        imagePreviewUrl: previewUrl,
        imageAlt: previous.imageAlt || previous.title || previous.subject || image.originalName || 'Imagen de admisiones',
      }));
      setSuccess('Imagen cargada para el boletín.');
    } catch (requestError) {
      URL.revokeObjectURL(previewUrl);
      setError(getAcademicSecretaryRequestMessage(requestError, 'No se pudo subir la imagen de marketing.'));
    } finally {
      setUploadingMarketingImage(false);
    }
  };

  const clearMarketingImage = () => {
    if (marketingForm.imagePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(marketingForm.imagePreviewUrl);
    }
    setMarketingForm((previous) => ({ ...previous, imageUrl: '', imagePreviewUrl: '', imageAlt: '' }));
  };

  const resetMarketingForm = () => {
    if (marketingForm.imagePreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(marketingForm.imagePreviewUrl);
    }
    setMarketingForm(emptyMarketingForm);
  };

  const onSubmitMarketingCampaign = async (event) => {
    event.preventDefault();
    const subject = marketingForm.subject.trim();
    const title = (marketingForm.title || marketingForm.subject).trim();
    const body = marketingForm.body.trim();
    const imageUrl = marketingForm.imageUrl ? resolveApiAssetUrl(marketingForm.imageUrl) : '';
    if (!selectedMarketingApplicants.length) {
      setError('Selecciona al menos un aspirante con correo de acudiente.');
      return;
    }
    if (!subject) {
      setError('Escribe el asunto del correo.');
      return;
    }
    if (!body && !imageUrl) {
      setError('Escribe un mensaje o sube una imagen para el boletín.');
      return;
    }

    const response = await runAction(
      () => sendAdmissionMarketingCampaign({
        applicantIds: selectedMarketingApplicants.map((applicant) => applicant.id),
        subject,
        title,
        body,
        imageUrl,
        imageAlt: marketingForm.imageAlt || title,
      }),
      ''
    );
    const delivery = response?.data?.delivery || null;
    if (delivery) {
      setSuccess(`Boletín enviado a ${delivery.sent} acudiente(s)${delivery.failed ? `; ${delivery.failed} fallaron` : ''}.`);
      if (response?.data?.campaign) {
        setMarketingHistory((previous) => [response.data.campaign, ...previous.filter((item) => item.id !== response.data.campaign.id)]);
        setMarketingHistoryLoaded(true);
      }
      resetMarketingForm();
      setMarketingFilters(emptyMarketingFilters);
      setSelectedMarketingApplicantIds([]);
    }
  };

  const updateEnrollmentStudent = (studentIndex, updates) => {
    setEnrollmentForm((previous) => ({
      ...previous,
      students: previous.students.map((item, itemIndex) => (itemIndex === studentIndex ? { ...item, ...updates } : item)),
    }));
  };

  const updateEnrollmentStudentMedicalProfile = (studentIndex, updates) => {
    setEnrollmentForm((previous) => ({
      ...previous,
      students: previous.students.map((item, itemIndex) => (itemIndex === studentIndex ? {
        ...item,
        medicalProfile: {
          ...(item.medicalProfile || {}),
          ...updates,
        },
      } : item)),
    }));
  };

  const updateEnrollmentStudentMedicationAuthorization = (studentIndex, updates) => {
    setEnrollmentForm((previous) => ({
      ...previous,
      students: previous.students.map((item, itemIndex) => (itemIndex === studentIndex ? {
        ...item,
        medicalProfile: {
          ...(item.medicalProfile || {}),
          medicationAuthorization: {
            ...(item.medicalProfile?.medicationAuthorization || {}),
            ...updates,
          },
        },
      } : item)),
    }));
  };

  const releaseCommunicationPreview = (item) => {
    if (item?.previewSrc && communicationPreviewUrlsRef.current.has(item.previewSrc)) {
      revokeCommunicationPreviewUrl(item);
      communicationPreviewUrlsRef.current.delete(item.previewSrc);
    }
  };

  const resetCommunicationForm = () => {
    (communicationForm.media || []).forEach(releaseCommunicationPreview);
    setCommunicationForm(emptyCommunicationForm);
    setEditingCommunicationId('');
    setDraggingCommunicationMediaId('');
  };

  const resetCommunicationAuthorDraft = () => {
    setCommunicationAuthorDraft(emptyCommunicationAuthorDraft);
    setEditingCommunicationAuthorId('');
  };

  const onSubmitCommunication = async (event) => {
    event.preventDefault();
    await runAction(async () => {
      const communicationPayload = {
        ...communicationForm,
        authorId: selectedCommunicationAuthor?._id || '',
        authorName: selectedCommunicationAuthor?.name || 'Secretaría académica',
        authorPhotoUrl: selectedCommunicationAuthor?.photoUrl || '',
        authorThumbUrl: selectedCommunicationAuthor?.thumbUrl || selectedCommunicationAuthor?.photoUrl || '',
        emailSubject: communicationForm.title,
        media: stripCommunicationMediaForSubmit(communicationForm.media),
        channels: { push: true, email: true },
      };

      if (editingCommunicationId) {
        await updateAcademicSecretaryCommunication(editingCommunicationId, communicationPayload);
      } else {
        await createAcademicSecretaryCommunication(communicationPayload);
      }
      resetCommunicationForm();
      await loadBootstrap();
    }, editingCommunicationId ? 'Comunicado actualizado correctamente.' : 'Comunicado enviado correctamente.', 'communications');
  };

  const onEditCommunication = (communication) => {
    resetCommunicationForm();
    setEditingCommunicationId(communication._id);
    setCommunicationForm({
      title: communication.title || '',
      body: communication.body || '',
      authorId: communication.authorId ? String(communication.authorId) : '',
      videoUrl: (communication.media || []).find((item) => item.kind === 'video')?.src || '',
      audienceType: communication.audienceType || 'general',
      gradeTargets: communication.gradeTargets || [],
      courseTargets: communication.courseTargets || [],
      parentTargets: (communication.parentTargets || []).map(String),
      studentTargets: (communication.studentTargets || []).map(String),
      media: (communication.media || []).map((item, index) => ({
        ...item,
        localId: createCommunicationMediaId(`${item.kind || 'media'}-${index + 1}`),
      })),
    });
    setActiveSection('communications');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onDeleteCommunication = async (communication) => {
    setDeleteCommunicationModal({ open: true, item: communication });
  };

  const onCommunicationAuthorPhotoSelected = async (event) => {
    const [file] = Array.from(event.target.files || []).filter((item) => String(item.type || '').startsWith('image/'));
    if (!file) {
      return;
    }

    setCommunicationAuthorDraft((previous) => ({ ...previous, uploading: true, error: '' }));
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const response = await uploadAcademicSecretaryCommunicationImage(file, {
        preferredName: `${communicationAuthorDraft.name || 'autor-comunicado'}-perfil`,
      });
      const payload = response?.data || {};
      const photoUrl = payload.imageUrl || payload.url || '';
      const thumbUrl = payload.thumbUrl || photoUrl;
      if (!photoUrl) {
        throw new Error('No se recibió URL pública para la foto del autor.');
      }

      setCommunicationAuthorDraft((previous) => ({ ...previous, photoUrl, thumbUrl, uploading: false, error: '' }));
      setSuccess('Foto del autor cargada correctamente.');
    } catch (requestError) {
      const message = getAcademicSecretaryRequestMessage(requestError, 'No se pudo subir la foto del autor.');
      setCommunicationAuthorDraft((previous) => ({ ...previous, uploading: false, error: message }));
      setError(message);
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const onEditCommunicationAuthor = (author) => {
    if (!author?._id) return;
    setEditingCommunicationAuthorId(String(author._id));
    setCommunicationAuthorDraft({
      name: author.name || '',
      photoUrl: author.photoUrl || '',
      thumbUrl: author.thumbUrl || author.photoUrl || '',
      uploading: false,
      error: '',
    });
  };

  const onCreateCommunicationAuthor = async () => {
    await runAction(async () => {
      const authorPayload = {
        name: communicationAuthorDraft.name,
        photoUrl: communicationAuthorDraft.photoUrl,
        thumbUrl: communicationAuthorDraft.thumbUrl,
      };
      const response = editingCommunicationAuthorId
        ? await updateAcademicSecretaryCommunicationAuthor(editingCommunicationAuthorId, authorPayload)
        : await createAcademicSecretaryCommunicationAuthor(authorPayload);
      const author = response?.data?.author;
      if (author?._id) {
        setCommunicationForm((previous) => ({ ...previous, authorId: String(author._id) }));
      }
      resetCommunicationAuthorDraft();
      await loadBootstrap();
    }, editingCommunicationAuthorId ? 'Autor actualizado y aplicado a sus comunicados.' : 'Autor agregado y seleccionado para el comunicado.', 'communications');
  };

  const openDeleteCommunicationAuthorModal = (author) => {
    if (!author?._id) return;
    setDeleteAuthorModal({ open: true, author });
  };

  const closeDeleteCommunicationAuthorModal = () => {
    if (busy) return;
    setDeleteAuthorModal({ open: false, author: null });
  };

  const onDeleteCommunicationAuthor = async () => {
    const author = deleteAuthorModal.author;
    if (!author?._id) return;

    await runAction(async () => {
      await deleteAcademicSecretaryCommunicationAuthor(author._id);
      if (String(communicationForm.authorId || '') === String(author._id)) {
        setCommunicationForm((previous) => ({ ...previous, authorId: defaultCommunicationAuthor?._id || '' }));
      }
      if (String(editingCommunicationAuthorId || '') === String(author._id)) {
        resetCommunicationAuthorDraft();
      }
      setDeleteAuthorModal({ open: false, author: null });
      await loadBootstrap();
    }, 'Autor eliminado correctamente.', 'communications');
  };

  const closeDeleteCommunicationModal = () => {
    setDeleteCommunicationModal({ open: false, item: null });
  };

  const onConfirmDeleteCommunication = async () => {
    const communication = deleteCommunicationModal.item;
    if (!communication?._id) return;

    await runAction(async () => {
      await deleteAcademicSecretaryCommunication(communication._id);
      if (editingCommunicationId === communication._id) {
        resetCommunicationForm();
      }
      closeDeleteCommunicationModal();
      await loadBootstrap();
    }, 'Comunicado eliminado correctamente.', 'communications');
  };

  const closeCommunicationEngagementModal = () => {
    setCommunicationEngagementModal({ open: false, type: 'comments', item: null });
  };

  const refreshCommunicationInState = (communication) => {
    if (!communication?._id) return;
    setBootstrap((previous) => ({
      ...previous,
      communications: (previous.communications || []).map((item) => (String(item._id) === String(communication._id) ? communication : item)),
    }));
    setCommunicationEngagementModal((previous) => (previous.item && String(previous.item._id) === String(communication._id)
      ? { ...previous, item: communication }
      : previous));
  };

  const openDeleteCommunicationCommentModal = (communication, comment) => {
    if (!communication?._id || !comment?.id) return;
    setDeleteCommentModal({ open: true, communication, comment });
  };

  const closeDeleteCommunicationCommentModal = () => {
    if (busy) return;
    setDeleteCommentModal({ open: false, communication: null, comment: null });
  };

  const onDeleteCommunicationComment = async () => {
    const { communication, comment } = deleteCommentModal;
    if (!communication?._id || !comment?.id) return;

    await runAction(async () => {
      const response = await deleteAcademicSecretaryCommunicationComment(communication._id, comment.id);
      refreshCommunicationInState(response?.data?.communication);
      setDeleteCommentModal({ open: false, communication: null, comment: null });
    }, 'Comentario eliminado correctamente.', 'communications');
  };

  const onSubmitEnrollment = async (event) => {
    event.preventDefault();
    await runAction(async () => {
      if (enrollmentEditingStudentId) {
        await updateAcademicSecretaryDatabaseRow(enrollmentEditingStudentId, createAcademicDatabasePayloadFromEnrollmentForm(enrollmentForm));
      } else {
        await createAcademicSecretaryEnrollment(enrollmentForm);
      }
      setEnrollmentForm({
        father: createEmptyParentDraft(),
        mother: createEmptyParentDraft(),
        primaryGuardian: 'mother',
        students: [createEmptyStudentDraft()],
      });
      setEnrollmentEditingStudentId('');
      await loadBootstrap();
    }, enrollmentEditingStudentId ? 'Matrícula actualizada.' : 'Matrícula creada con cargos iniciales.', 'enrollments');
  };

  const onEditEnrollmentFromList = (item) => {
    const rowId = String(item?._id || '');
    if (!rowId) return;

    setEnrollmentEditingStudentId(rowId);
    setEditingAcademicRowId('');
    setEnrollmentForm(createEnrollmentFormFromAcademicRow(item, gradeCatalog));
    window.requestAnimationFrame(() => {
      document.getElementById('academic-enrollment-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const onCancelEnrollmentEdit = () => {
    setEnrollmentEditingStudentId('');
    setEnrollmentForm({
      father: createEmptyParentDraft(),
      mother: createEmptyParentDraft(),
      primaryGuardian: 'mother',
      students: [createEmptyStudentDraft()],
    });
  };

  const openPushEmailModal = (item) => {
    setFollowUpModal({
      open: true,
      type: 'push_email',
      item,
      title: 'Recordatorio de cartera academica',
      body: buildBillingMessageDraft({
        parentName: item.parentName,
        schoolName,
        amount: item.amount,
        overdueDays: item.overdueDays,
      }),
    });
  };

  const openManualNoteModal = (item) => {
    setFollowUpModal({ open: true, type: 'manual_note', item, title: 'Nota manual', body: '' });
  };

  const closeFollowUpModal = () => {
    setFollowUpModal({ open: false, type: '', item: null, title: '', body: '' });
  };

  const onSubmitFollowUp = async (event) => {
    event.preventDefault();
    const target = followUpModal.item;
    if (!target) return;

    await runAction(async () => {
      await createAcademicSecretaryBillingFollowUp({
        actionType: followUpModal.type,
        parentId: target.parentId,
        parentName: target.parentName,
        parentPhone: target.parentPhone,
        studentNames: target.students,
        outstandingAmount: target.amount,
        overdueDays: target.overdueDays,
        overdueMonths: target.overdueMonths,
        title: followUpModal.title,
        body: followUpModal.body,
        schoolName,
      });
      closeFollowUpModal();
      await loadBootstrap();
    }, followUpModal.type === 'manual_note' ? 'Nota manual registrada en seguimiento.' : 'Push y correo enviados; seguimiento registrado.', 'overview');
  };

  const onOpenWhatsapp = async (item) => {
    const normalizedPhone = normalizePhoneForWhatsapp(item.parentPhone);
    if (!normalizedPhone) {
      setError('Este acudiente no tiene un telefono valido para WhatsApp.');
      return;
    }

    const message = buildWhatsappMessage({
      parentName: item.parentName,
      schoolName,
      amount: item.amount,
      overdueDays: item.overdueDays,
    });
    const whatsappUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');

    await runAction(async () => {
      await createAcademicSecretaryBillingFollowUp({
        actionType: 'whatsapp',
        parentId: item.parentId,
        parentName: item.parentName,
        parentPhone: item.parentPhone,
        studentNames: item.students,
        outstandingAmount: item.amount,
        overdueDays: item.overdueDays,
        overdueMonths: item.overdueMonths,
        title: 'Mensaje abierto en WhatsApp',
        body: message,
        whatsappUrl,
        schoolName,
      });
      await loadBootstrap();
    }, 'WhatsApp abierto y seguimiento registrado.', 'overview');
  };

  const onSendReminder = async (bucket) => {
    await runAction(async () => {
      await sendAcademicSecretaryReminder({ bucket, schoolName });
      await loadBootstrap();
    }, 'Recordatorio enviado al grupo seleccionado.', 'overview');
  };

  const onSubmitBillingPayment = async (event) => {
    event.preventDefault();
    const modalRow = billingPaymentModal.row || null;
    if (!billingPaymentDraft.chargeId && !modalRow) {
      setError('Selecciona un cargo pendiente para registrar el pago.');
      return;
    }

    await runAction(async () => {
      let chargeId = billingPaymentDraft.chargeId;
      if (!chargeId && modalRow && selectedBillingAccount) {
        const modalRowCategory = modalRow.category === 'annual_tuition' ? 'annual_tuition' : 'monthly_tuition';
        const chargeResponse = await createAcademicSecretaryCharge({
          concept: modalRow.concept || (modalRowCategory === 'annual_tuition' ? `Matrícula anual ${selectedBillingAccount.paymentPlan?.academicYear || ''}`.trim() : `Pensión ${modalRow.monthLabel || ''}`.trim()),
          description: modalRow.benefitDescription || modalRow.benefitWindowLabel || '',
          amount: Number(modalRow.chargeAmount || modalRow.amount || 0),
          originalAmount: Number(modalRow.baseAmount || modalRow.chargeAmount || modalRow.amount || 0),
          dueDate: modalRow.dueDate,
          audienceType: 'individual',
          category: modalRowCategory,
          monthKey: modalRowCategory === 'monthly_tuition' ? modalRow.monthKey || modalRow.key || '' : '',
          studentTargets: [selectedBillingAccount.studentId],
          suppressNotice: true,
          schoolName,
        });
        chargeId = chargeResponse?.data?.charges?.[0]?._id || chargeResponse?.data?.charges?.[0]?.id || '';
      }

      if (!chargeId) {
        throw new Error('No se pudo preparar este cargo para registrar el pago.');
      }

      await registerAcademicSecretaryChargePayment(chargeId, {
        amount: Number(billingPaymentDraft.amount || 0),
        method: billingPaymentDraft.method,
        paidAt: billingPaymentDraft.paidAt,
        notes: billingPaymentDraft.notes,
        settleAsPaid: Boolean(modalRow),
      });
      setBillingPaymentDraft(createBillingPaymentDraft());
      setBillingPaymentModal({ open: false, row: null });
      await loadBootstrap();
    }, 'Pago registrado y estado de cuenta actualizado.', 'overview');
  };

  const openBillingPaymentModal = (row = null) => {
    const preferredChargeId = row?.existingChargeId || '';
    const preferredCharge = selectedBillingPendingCharges.find((charge) => String(charge._id) === String(preferredChargeId));
    const rowAmount = Number(row?.outstandingAmount || row?.amount || row?.chargeAmount || 0);
    setBillingPaymentDraft((previous) => ({
      ...previous,
      chargeId: preferredCharge?._id || '',
      amount: String(Math.round(rowAmount > 0 ? rowAmount : Number(preferredCharge?.amount || 0))),
    }));
    setBillingPaymentModal({ open: true, row });
  };

  const closeBillingPaymentModal = () => {
    setBillingPaymentModal({ open: false, row: null });
  };

  const openBillingPaymentDetailModal = (row = null) => {
    if (!row) return;
    setBillingPaymentDetailModal({ open: true, row });
  };

  const closeBillingPaymentDetailModal = () => {
    setBillingPaymentDetailModal({ open: false, row: null });
  };

  const onCommunicationImagesSelected = async (event) => {
    const selectedFiles = Array.from(event.target.files || []).filter((file) => {
      const fileType = String(file.type || '').toLowerCase();
      return fileType.startsWith('image/') || fileType.startsWith('video/');
    });

    if (!selectedFiles.length) {
      return;
    }

    const availableSlots = Math.max(0, 8 - (communicationForm.media || []).length);
    const filesToUpload = selectedFiles.slice(0, availableSlots);

    if (!filesToUpload.length) {
      setError('El carrusel permite hasta 8 elementos visuales. Quita uno antes de agregar más archivos.');
      event.target.value = '';
      return;
    }

    const previewItems = filesToUpload.map((file, index) => {
      const previewSrc = URL.createObjectURL(file);
      const isVideo = String(file.type || '').toLowerCase().startsWith('video/');
      communicationPreviewUrlsRef.current.add(previewSrc);
      return {
        kind: isVideo ? 'video' : 'image',
        src: previewSrc,
        thumbUrl: isVideo ? '' : previewSrc,
        previewSrc,
        localId: createCommunicationMediaId(isVideo ? 'video' : 'image'),
        alt: communicationForm.title || file.name || `${isVideo ? 'Video' : 'Imagen'} ${index + 1}`,
        fileName: file.name,
        uploading: true,
      };
    });

    setCommunicationForm((previous) => ({
      ...previous,
      media: [...(previous.media || []), ...previewItems].slice(0, 8),
    }));

    setBusy(true);
    setUploadingMedia(true);
    setError('');
    setSuccess('');

    try {
      for (const [index, file] of filesToUpload.entries()) {
        const previewItem = previewItems[index];
        const isVideo = String(file.type || '').toLowerCase().startsWith('video/');
        const response = isVideo
          ? await uploadAcademicSecretaryCommunicationMedia(file, {
            preferredName: `${communicationForm.title || 'comunicado'}-${index + 1}`,
          })
          : await uploadAcademicSecretaryCommunicationImage(file, {
            preferredName: `${communicationForm.title || 'comunicado'}-${index + 1}`,
          });
        const payload = response?.data || {};
        const mediaKind = payload.kind === 'video' ? 'video' : 'image';
        const mediaUrl = payload.url || payload.imageUrl || payload.videoUrl || '';
        const thumbUrl = payload.thumbUrl || (mediaKind === 'image' ? mediaUrl : '');
        const storage = String(payload.storage || '').trim().toLowerCase();
        if (!mediaUrl) {
          throw new Error('No se recibió URL pública para uno de los archivos.');
        }
        if (import.meta.env.PROD && storage !== 'cloudinary' && !/res\.cloudinary\.com\//i.test(mediaUrl)) {
          throw new Error('No se pudo procesar la imagen. Quita el archivo e inténtalo de nuevo.');
        }

        releaseCommunicationPreview(previewItem);
        setCommunicationForm((previous) => ({
          ...previous,
          media: (previous.media || []).map((item) => (
            item.localId === previewItem.localId
              ? {
                ...item,
                kind: mediaKind,
                src: mediaUrl,
                thumbUrl,
                previewSrc: '',
                alt: communicationForm.title || file.name || 'Comunicado académico',
                uploading: false,
              }
              : item
          )),
        }));
      }

      setSuccess('Contenido visual agregado al carrusel del comunicado.');
    } catch (requestError) {
      setCommunicationForm((previous) => ({
        ...previous,
        media: (previous.media || []).map((item) => (
          previewItems.some((previewItem) => previewItem.localId === item.localId && item.uploading)
            ? { ...item, uploading: false, uploadError: true }
            : item
        )),
      }));
      setError(getAcademicSecretaryRequestMessage(requestError, 'No se pudo subir el contenido visual del comunicado.'));
    } finally {
      setBusy(false);
      setUploadingMedia(false);
      event.target.value = '';
    }
  };

  const onRemoveCommunicationMedia = (mediaIndex) => {
    setCommunicationForm((previous) => ({
      ...previous,
      media: (previous.media || []).filter((item, index) => {
        if (index === mediaIndex) {
          releaseCommunicationPreview(item);
          return false;
        }
        return true;
      }),
    }));
  };

  const onCommunicationMediaDragStart = (event, item, index) => {
    const mediaId = item.localId || `${item.kind}-${item.src}-${index}`;
    setDraggingCommunicationMediaId(mediaId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', mediaId);
  };

  const onCommunicationMediaDrop = (event, targetIndex) => {
    event.preventDefault();
    const sourceMediaId = event.dataTransfer.getData('text/plain') || draggingCommunicationMediaId;
    if (!sourceMediaId) return;

    setCommunicationForm((previous) => {
      const currentMedia = previous.media || [];
      const sourceIndex = currentMedia.findIndex((item, index) => (item.localId || `${item.kind}-${item.src}-${index}`) === sourceMediaId);
      return {
        ...previous,
        media: moveArrayItem(currentMedia, sourceIndex, targetIndex),
      };
    });
    setDraggingCommunicationMediaId('');
  };

  const onDownloadAcademicDatabase = () => {
    downloadExcelWorkbook('Base de datos', ACADEMIC_DATABASE_HEADERS, academicDatabaseRows, 'base-datos-academica');
  };

  const onDownloadAcademicDatabaseTemplate = () => {
    downloadExcelWorkbook('Plantilla migracion', ACADEMIC_DATABASE_HEADERS, ACADEMIC_DATABASE_TEMPLATE_ROWS, 'plantilla-migracion-base-datos');
  };

  const onOpenAcademicDatabaseImportPicker = () => {
    if (busy) return;
    academicDatabaseImportInputRef.current?.click();
  };

  const onAcademicDatabaseImportSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    const response = await runAction(async () => {
      const importResponse = await importAcademicSecretaryDatabase(file);
      await loadBootstrap();
      return importResponse;
    }, '', 'database');

    if (!response) {
      return;
    }

    const summary = response.data?.summary || {};
    const createdStudents = Number(summary.createdStudents || 0);
    const updatedStudents = Number(summary.updatedStudents || 0);
    const createdParents = Number(summary.createdParents || 0);
    const updatedParents = Number(summary.updatedParents || 0);
    const skippedRows = Number(summary.skippedRows || 0);

    setSuccess(
      `Migracion completada. Alumnos creados: ${createdStudents}. Alumnos actualizados: ${updatedStudents}. Padres creados: ${createdParents}. Padres actualizados: ${updatedParents}. Filas omitidas: ${skippedRows}.`
    );
  };

  const onApproveRequest = async () => {
    if (!approvalDraft.requestId) return;
    await runAction(async () => {
      await approveAcademicSecretaryCommunicationRequest(approvalDraft.requestId, { ...approvalDraft, emailSubject: approvalDraft.title });
      await loadBootstrap();
    }, 'Solicitud docente aprobada y publicada en el feed de acudientes.', 'approvals');
  };

  const onRejectRequest = async () => {
    if (!approvalDraft.requestId) return;
    await runAction(async () => {
      await rejectAcademicSecretaryCommunicationRequest(approvalDraft.requestId, { reviewNotes: approvalDraft.reviewNotes });
      await loadBootstrap();
    }, 'Solicitud docente rechazada.', 'approvals');
  };

  const onEditAcademicDatabaseRow = (item) => {
    const rowId = String(item?._id || '');
    if (!rowId) return;

    setEditingAcademicRowId(rowId);
    setAcademicDatabaseDrafts((previous) => ({
      ...previous,
      [rowId]: createAcademicDatabaseEditDraft(item),
    }));
  };

  const onCancelAcademicDatabaseRowEdit = () => {
    setEditingAcademicRowId('');
  };

  const onChangeAcademicDatabaseDraft = (rowId, fieldName, value) => {
    setAcademicDatabaseDrafts((previous) => ({
      ...previous,
      [rowId]: {
        ...(previous[rowId] || {}),
        [fieldName]: value,
      },
    }));
  };

  const onSaveAcademicDatabaseRow = async (item) => {
    const rowId = String(item?._id || '');
    const draft = academicDatabaseDrafts[rowId];
    if (!rowId || !draft) return;

    await runAction(async () => {
      await updateAcademicSecretaryDatabaseRow(rowId, draft);
      await loadBootstrap();
      setEditingAcademicRowId('');
    }, 'Fila académica actualizada.', 'database');
  };

  const onRequestGradePromotion = async () => {
    await runAction(async () => {
      await requestAcademicSecretaryGradePromotion();
    }, 'Solicitud enviada a rectoría para subir un grado a todos los alumnos.', 'database');
  };

  const onSubmitRouteAssignment = async (event) => {
    event.preventDefault();
    const driverUserId = routeAssignmentForm.driverUserId || selectedRouteDriver?.id || '';
    if (!driverUserId || !routeAssignmentForm.studentId) {
      setError('Selecciona un conductor y un alumno para asignar la ruta.');
      return;
    }

    const result = await runAction(async () => addAcademicSecretarySchoolRouteStop(driverUserId, {
      studentId: routeAssignmentForm.studentId,
      pickupAddress: routeAssignmentForm.pickupAddress,
      notes: routeAssignmentForm.notes,
    }), 'Alumno asignado a la ruta escolar.', 'routes');

    if (result) {
      await loadSchoolRouteAssignments();
      setRouteAssignmentForm((previous) => ({ ...previous, studentId: '', pickupAddress: '', notes: '' }));
    }
  };

  const onChangeRouteStopDraft = (stopId, updates) => {
    setRouteAssignmentData((previous) => ({
      ...previous,
      routes: (previous.routes || []).map((route) => {
        if (route.driverUserId !== selectedRouteDriver?.id) return route;
        return {
          ...route,
          stops: (route.stops || []).map((stop) => (stop.id === stopId ? { ...stop, ...updates } : stop)),
        };
      }),
    }));
  };

  const onUpdateRouteStop = async (stop) => {
    const driverUserId = selectedRouteDriver?.id || '';
    if (!driverUserId || !stop?.id) return;

    const result = await runAction(async () => updateAcademicSecretarySchoolRouteStop(driverUserId, stop.id, {
      pickupAddress: stop.pickupAddress,
      notes: stop.notes,
    }), 'Parada de ruta actualizada.', 'routes');
    if (result) {
      await loadSchoolRouteAssignments();
    }
  };

  const onRemoveRouteStop = async (stopId) => {
    const driverUserId = selectedRouteDriver?.id || '';
    if (!driverUserId || !stopId) return;

    const result = await runAction(async () => removeAcademicSecretarySchoolRouteStop(driverUserId, stopId), 'Alumno removido de la ruta escolar.', 'routes');
    if (result) {
      await loadSchoolRouteAssignments();
    }
  };

  if (loading) {
    const loadingMessage = embedded ? 'Cargando información...' : (isBillingPortal ? 'Cargando portal de cartera...' : 'Cargando portal de secretaría académica...');
    return <section className={`academic-secretary${embedded ? ' academic-secretary--embedded' : ''}`}><p>{loadingMessage}</p></section>;
  }

  return (
    <section className={`academic-secretary${embedded ? ' academic-secretary--embedded' : ''}`}>
      {!embedded ? <header className="academic-secretary__hero">
        <div>
          <span className="academic-secretary__eyebrow">Comergio - {schoolName}</span>
          <h1>{isBillingPortal ? 'Portal Cartera' : 'Portal Secretaría Académica'}</h1>
          <p>{isBillingPortal ? 'Consulta obligaciones pendientes y registra el seguimiento financiero de las familias.' : 'Gestiona KPI, feed de acudientes, matrículas y aprobación de comunicados docentes desde un mismo tablero.'}</p>
        </div>
        <button className="academic-secretary__refresh" onClick={() => window.location.reload()} type="button">Actualizar portal</button>
      </header> : null}

      {!embedded ? <nav className="academic-secretary__tabs" aria-label={isBillingPortal ? 'Secciones de cartera' : 'Secciones de secretaría académica'}>
        {portalSections.map((item) => (
          <button className={`academic-secretary__tab${activeSection === item.key ? ' is-active' : ''}`} key={item.key} onClick={() => setActiveSection(item.key)} type="button">{buildSectionLabel(item.key, pendingApprovalCount, portalSections)}</button>
        ))}
      </nav> : null}

      {error || success ? (
        <div className="academic-secretary__notice-layer" aria-live="assertive">
          <div className={`academic-secretary__message academic-secretary__message--modal ${error ? 'is-error' : 'is-success'}`} role="dialog" aria-modal="false" aria-label={error ? 'Aviso de error' : 'Aviso de éxito'}>
            <div>
              <strong>{error ? 'No se pudo completar' : 'Acción completada'}</strong>
              <span>{error || success}</span>
            </div>
            <button aria-label={error ? 'Cerrar aviso de error' : 'Cerrar aviso de éxito'} className="academic-secretary__message-close" onClick={() => { setError(''); setSuccess(''); }} type="button"><CloseIcon /></button>
          </div>
        </div>
      ) : null}

      {activeSection === 'overview' ? (
        isBillingPortal ? (
          <>
            <section className="academic-secretary__kpis">
              <article className="academic-secretary__kpi"><span>Saldo pendiente</span><strong>{formatCurrency(billing.kpis?.pendingAmount || 0)}</strong></article>
              <article className="academic-secretary__kpi"><span>Cargos pendientes</span><strong>{billing.kpis?.totalPendingCharges || 0}</strong></article>
              <article className="academic-secretary__kpi"><span>Pagado este mes</span><strong>{formatCurrency(billing.kpis?.paidThisMonth || 0)}</strong></article>
              <article className="academic-secretary__kpi"><span>Alumnos/familias en cartera</span><strong>{overdueFamilyRows.length}</strong></article>
            </section>

            <section className="academic-secretary__panel academic-secretary__billing-panel">
              <div className="academic-secretary__panel-head">
                <div>
                  <h2>Estado de cuenta por alumno</h2>
                  <p>Filtra por alumno o acudiente, revisa cargos y registra pagos presenciales.</p>
                </div>
                <div className="academic-secretary__billing-bucket-actions">
                  {Object.entries(billing.kpis?.overdueBuckets || {}).filter(([, count]) => Number(count || 0) > 0).map(([bucket, count]) => (
                    <button disabled={busy} key={bucket} onClick={() => onSendReminder(bucket)} type="button">
                      Recordar {bucket === '6_plus' ? '6+ meses' : `${bucket} meses`} ({count})
                    </button>
                  ))}
                </div>
              </div>
              <div className="academic-secretary__billing-search-row">
                <label>
                  Buscar alumno o acudiente
                  <input
                    onChange={(event) => setBillingSearch(event.target.value)}
                    placeholder="Nombre, documento, acudiente, teléfono..."
                    type="search"
                    value={billingSearch}
                  />
                </label>
                <span>{filteredBillingStudentRows.length} de {billingStudentAccounts.length} alumnos</span>
              </div>
              <div className="academic-secretary__billing-ledger-layout">
                <div className="academic-secretary__table-wrap academic-secretary__billing-student-table">
                  <table className="academic-secretary__table academic-secretary__table--billing">
                    <thead>
                      <tr>
                        <th>Alumno</th>
                        <th>Acudiente</th>
                        <th>Estado</th>
                        <th>Saldo</th>
                        <th>Pagado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBillingStudentRows.length === 0 ? (
                        <tr><td colSpan="5">No hay alumnos que coincidan con el filtro.</td></tr>
                      ) : filteredBillingStudentRows.map((account) => (
                        <tr
                          className={String(selectedBillingAccount?.studentId || '') === String(account.studentId) ? 'is-selected' : ''}
                          key={account.studentId}
                          onClick={() => setSelectedBillingStudentId(String(account.studentId || ''))}
                        >
                          <td><strong>{account.studentName}</strong><div>{formatGradeLabel(account.grade)}{account.course ? ` · ${account.course}` : ''}</div></td>
                          <td><strong>{account.parentName || 'Sin acudiente'}</strong><div>{account.parentPhone || account.parentEmail || '-'}</div></td>
                          <td><span className={`academic-secretary__billing-status is-${account.status}`}>{account.statusLabel}</span></td>
                          <td>{Number(account.pendingAmount || 0) > 0 ? formatCurrency(account.pendingAmount) : '$0'}</td>
                          <td>{formatCurrency(account.paidAmount || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <aside className="academic-secretary__billing-ledger-detail">
                  {!selectedBillingAccount ? (
                    <p>Selecciona un alumno para ver su estado de cuenta.</p>
                  ) : (
                    <>
                      <div className="academic-secretary__billing-detail-head">
                        <div>
                          <h3>{selectedBillingAccount.studentName}</h3>
                          <p>{formatGradeLabel(selectedBillingAccount.grade)}{selectedBillingAccount.course ? ` · ${selectedBillingAccount.course}` : ''}</p>
                        </div>
                        <div className="academic-secretary__billing-detail-summary">
                          <strong>{Number(selectedBillingAccount.pendingAmount || 0) > 0 ? formatCurrency(selectedBillingAccount.pendingAmount) : 'Al día'}</strong>
                          <div className="academic-secretary__billing-detail-actions">
                            <button disabled={busy || Number(selectedBillingAccount.pendingAmount || 0) <= 0} onClick={() => openPushEmailModal({ parentId: selectedBillingAccount.parentId, parentName: selectedBillingAccount.parentName, parentPhone: selectedBillingAccount.parentPhone, students: [selectedBillingAccount.studentName], amount: selectedBillingAccount.pendingAmount, overdueDays: Math.max(...(selectedBillingPendingCharges.map((charge) => calculateOverdueDays(charge.dueDate))), 0), overdueMonths: selectedBillingAccount.overdueMonths })} type="button">Enviar recordatorio</button>
                            <button disabled={busy || Number(selectedBillingAccount.pendingAmount || 0) <= 0 || !normalizePhoneForWhatsapp(selectedBillingAccount.parentPhone)} onClick={() => onOpenWhatsapp({ parentId: selectedBillingAccount.parentId, parentName: selectedBillingAccount.parentName, parentPhone: selectedBillingAccount.parentPhone, students: [selectedBillingAccount.studentName], amount: selectedBillingAccount.pendingAmount, overdueDays: Math.max(...(selectedBillingPendingCharges.map((charge) => calculateOverdueDays(charge.dueDate))), 0), overdueMonths: selectedBillingAccount.overdueMonths })} type="button">WhatsApp</button>
                            <button disabled={busy || Number(selectedBillingAccount.pendingAmount || 0) <= 0} onClick={() => openManualNoteModal({ parentId: selectedBillingAccount.parentId, parentName: selectedBillingAccount.parentName, parentPhone: selectedBillingAccount.parentPhone, students: [selectedBillingAccount.studentName], amount: selectedBillingAccount.pendingAmount, overdueDays: Math.max(...(selectedBillingPendingCharges.map((charge) => calculateOverdueDays(charge.dueDate))), 0), overdueMonths: selectedBillingAccount.overdueMonths })} type="button">Nota</button>
                          </div>
                        </div>
                      </div>
                      <dl className="academic-secretary__billing-contact">
                        <div><dt>Acudiente</dt><dd>{selectedBillingAccount.parentName || '-'}</dd></div>
                        <div><dt>Teléfono</dt><dd>{selectedBillingAccount.parentPhone || '-'}</dd></div>
                        <div><dt>Correo</dt><dd>{selectedBillingAccount.parentEmail || '-'}</dd></div>
                      </dl>

                      <div className="academic-secretary__billing-payment-plan">
                        <div className="academic-secretary__billing-payment-plan-head">
                          <h4>Plan de pagos</h4>
                          <span>{selectedBillingAccount.paymentPlan?.academicYear || 'Año escolar activo'}</span>
                        </div>
                        {(selectedBillingAccount.paymentPlan?.rows || []).length === 0 ? (
                          <p>No hay plan de pagos configurado para este alumno.</p>
                        ) : (
                          <div className="academic-secretary__table-wrap academic-secretary__billing-payment-plan-table">
                            <table className="academic-secretary__table academic-secretary__table--billing-plan">
                              <thead>
                                <tr>
                                  <th>Periodo</th>
                                  <th>Vence</th>
                                  <th>Estado</th>
                                  <th>Concepto</th>
                                  <th>Beneficio aplicado</th>
                                  <th>Valor</th>
                                  <th>Acciones</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(selectedBillingAccount.paymentPlan?.rows || []).map((row) => (
                                  <tr className={row.status === 'paid' ? 'is-paid' : ''} key={row.key || row.monthKey}>
                                    <td><strong>{row.monthLabel || row.concept}</strong><div>{row.concept}</div></td>
                                    <td>{formatDate(row.dueDate)}</td>
                                    <td><span className={`academic-secretary__billing-status is-${row.status}`}>{row.statusLabel}</span>{row.status === 'paid' && row.paymentMethodLabel ? <div>{row.paymentMethodLabel}</div> : null}</td>
                                    <td><strong>{labelBillingPlanConcept(row)}</strong></td>
                                    <td><strong>{row.benefitLabel || 'Precio full'}</strong><div>{row.benefitDescription || row.benefitWindowLabel || 'Sin beneficio activo.'}</div></td>
                                    <td><strong>{formatCurrency(row.status === 'paid' ? row.paidAmount || row.chargeAmount || 0 : row.amount || row.chargeAmount || 0)}</strong>{Number(row.paidAmount || 0) > 0 ? <div>Pagado: {formatCurrency(row.paidAmount)}</div> : null}</td>
                                    <td>{row.status === 'paid' ? <button className="academic-secretary__billing-plan-paid-label" onClick={() => openBillingPaymentDetailModal(row)} type="button">PAGADO</button> : <button className="academic-secretary__billing-plan-action" disabled={busy || Number(row.amount || row.chargeAmount || 0) <= 0} onClick={() => openBillingPaymentModal(row)} type="button">Registrar pago</button>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div className="academic-secretary__billing-ledger-list">
                        <h4>Cargos</h4>
                        {(selectedBillingAccount.charges || []).length === 0 ? <p>No hay cargos registrados.</p> : (selectedBillingAccount.charges || []).map((charge) => (
                          <div className="academic-secretary__billing-ledger-item" key={charge._id}>
                            <div><strong>{charge.concept}</strong><span>{formatDate(charge.dueDate)} · {charge.status === 'paid' ? 'Pagado' : 'Pendiente'}</span></div>
                            <strong>{formatCurrency(charge.amount || 0)}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="academic-secretary__billing-ledger-list">
                        <h4>Historial de pagos</h4>
                        {(selectedBillingAccount.payments || []).length === 0 ? <p>No hay pagos registrados.</p> : (selectedBillingAccount.payments || []).map((payment) => (
                          <div className="academic-secretary__billing-ledger-item" key={payment._id}>
                            <div><strong>{payment.concept}</strong><span>{formatDateTime(payment.paidAt)} · {payment.methodLabel}</span>{payment.notes ? <small>{payment.notes}</small> : null}</div>
                            <strong>{formatCurrency(payment.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </aside>
              </div>
            </section>

            <section className="academic-secretary__grid">
              <article className="academic-secretary__panel">
                <div className="academic-secretary__panel-head"><div><h2>Seguimiento de cartera</h2><p>Registro de push, correo, WhatsApp y notas manuales realizadas desde el portal.</p></div></div>
                <div className="academic-secretary__table-wrap">
                  <table className="academic-secretary__table academic-secretary__table--billing">
                    <thead><tr><th>Fecha</th><th>Acudiente</th><th>Gestion</th><th>Detalle</th><th>Responsable</th></tr></thead>
                    <tbody>
                      {(billing.followUps || []).length === 0 ? (
                        <tr><td colSpan="5">Todavia no hay gestiones registradas.</td></tr>
                      ) : (billing.followUps || []).map((entry) => (
                        <tr key={entry._id}>
                          <td>{formatDateTime(entry.createdAt)}</td>
                          <td><strong>{entry.parentName}</strong><div>{entry.parentPhone || '-'}</div></td>
                          <td><span className={`academic-secretary__followup-badge academic-secretary__followup-badge--${entry.actionType}`}>{followUpActionLabel(entry.actionType)}</span></td>
                          <td><strong>{entry.title || 'Seguimiento de cartera'}</strong><div>{entry.body || 'Sin detalle adicional.'}</div></td>
                          <td>{entry.createdByName || entry.createdByRole || 'Equipo institucional'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          </>
        ) : (
        <>
          <section className="academic-secretary__kpis">
            <article className="academic-secretary__kpi"><span>Comunicados enviados</span><strong>{bootstrap.communications.length}</strong></article>
            <article className="academic-secretary__kpi"><span>Solicitudes pendientes</span><strong>{bootstrap.communicationRequestCounts?.pending || 0}</strong></article>
            <article className="academic-secretary__kpi"><span>Acudientes activos</span><strong>{bootstrap.parents.length}</strong></article>
            <article className="academic-secretary__kpi"><span>Alumnos enlazados</span><strong>{bootstrap.students.length}</strong></article>
            <article className="academic-secretary__kpi"><span>Grados disponibles</span><strong>{bootstrap.grades.length}</strong></article>
            <article className="academic-secretary__kpi"><span>Cursos disponibles</span><strong>{courseOptions.length}</strong></article>
          </section>

          <section className="academic-secretary__grid">
            <article className="academic-secretary__panel">
              <div className="academic-secretary__panel-head"><div><h2>Radar operativo</h2><p>Vista rápida de lo que requiere gestión inmediata.</p></div></div>
              <div className="academic-secretary__summary-grid">
                <div className="academic-secretary__mini-card is-neutral"><span>Solicitudes docentes</span><strong>{bootstrap.communicationRequestCounts?.pending || 0}</strong></div>
                <div className="academic-secretary__mini-card is-good"><span>Acudientes activos</span><strong>{bootstrap.parents.length}</strong></div>
                <div className="academic-secretary__mini-card is-accent"><span>Alumnos enlazados</span><strong>{bootstrap.students.length}</strong></div>
                <div className="academic-secretary__mini-card is-alert"><span>Cursos activos</span><strong>{courseOptions.length}</strong></div>
              </div>
            </article>
            <article className="academic-secretary__panel">
              <div className="academic-secretary__panel-head"><div><h2>Atajos del portal</h2><p>Cambia de sección según la operación del día.</p></div></div>
              <div className="academic-secretary__shortcut-list">
                <button className="academic-secretary__shortcut" onClick={() => setActiveSection('communications')} type="button"><strong>Comunicados</strong><span>Publicar para familias y revisar historial.</span></button>
                <button className="academic-secretary__shortcut" onClick={() => setActiveSection('costs')} type="button"><strong>Costos</strong><span>Consulta la configuración vigente definida por rectoría para cada grado.</span></button>
                <button className="academic-secretary__shortcut" onClick={() => setActiveSection('enrollments')} type="button"><strong>Matrículas</strong><span>Crear acudientes, alumnos y cargos iniciales.</span></button>
                <button className="academic-secretary__shortcut" onClick={() => setActiveSection('routes')} type="button"><strong>Rutas</strong><span>Asignar alumnos a los conductores de ruta escolar.</span></button>
                <button className="academic-secretary__shortcut" onClick={() => setActiveSection('database')} type="button"><strong>Base de datos</strong><span>Consulta la ficha académica completa de los alumnos.</span></button>
                <button className="academic-secretary__shortcut" onClick={() => setActiveSection('approvals')} type="button"><strong>Autorización docente</strong><span>Editar y aprobar solicitudes al feed de acudientes.</span></button>
              </div>
            </article>
          </section>

          <section className="academic-secretary__grid">
            <article className="academic-secretary__panel">
              <h2>Últimos comunicados</h2>
              <div className="academic-secretary__timeline">
                {bootstrap.communications.slice(0, 4).map((item) => <div className="academic-secretary__timeline-item" key={item._id}><strong>{item.title}</strong><span>{item.audienceType} · {formatDateTime(item.sentAt || item.createdAt)}</span></div>)}
              </div>
            </article>
            <article className="academic-secretary__panel">
              <h2>Solicitudes por autorizar</h2>
              <div className="academic-secretary__timeline">
                {pendingRequests.length === 0 ? <p>No hay solicitudes pendientes.</p> : pendingRequests.slice(0, 4).map((item) => <button className="academic-secretary__request-preview" key={item._id} onClick={() => { setSelectedRequestId(item._id); setActiveSection('approvals'); }} type="button"><strong>{item.teacherName}</strong><span>{item.title}</span></button>)}
              </div>
            </article>
          </section>
        </>
        )
      ) : null}

      {activeSection === 'communications' ? (
        <section className="academic-secretary__grid academic-secretary__grid--content">
          <article className="academic-secretary__panel">
            <div className="academic-secretary__panel-head">
              <div>
                <h2>{editingCommunicationId ? 'Editar comunicado' : 'Nuevo comunicado'}</h2>
                {editingCommunicationId ? <p>Actualiza la publicación del historial. Los nuevos comunicados siguen enviando push y correo a los acudientes.</p> : null}
              </div>
              {editingCommunicationId ? <button className="btn" onClick={resetCommunicationForm} type="button">Cancelar edición</button> : null}
            </div>
            <form className="academic-secretary__form" onSubmit={onSubmitCommunication}>
              <label>Título<input required value={communicationForm.title} onChange={(event) => setCommunicationForm((previous) => ({ ...previous, title: event.target.value }))} /></label>
              <label>Mensaje<textarea required value={communicationForm.body} onChange={(event) => setCommunicationForm((previous) => ({ ...previous, body: event.target.value }))} /></label>
              <div className="academic-secretary__subform">
                <h4>Autor del comunicado</h4>
                <p>Agrega autores institucionales y selecciona quién firma esta publicación en la app de padres.</p>
                <div className="academic-secretary__form-grid">
                  <label>Autor<select value={selectedCommunicationAuthorId} onChange={(event) => setCommunicationForm((previous) => ({ ...previous, authorId: event.target.value }))}>{communicationAuthors.map((author) => <option key={author._id} value={author._id}>{author.name}</option>)}</select></label>
                  <div className="academic-secretary__author-preview">
                    <span className="academic-secretary__author-avatar">{selectedCommunicationAuthor?.thumbUrl || selectedCommunicationAuthor?.photoUrl ? <img alt={selectedCommunicationAuthor.name} src={resolveApiAssetUrl(selectedCommunicationAuthor.thumbUrl || selectedCommunicationAuthor.photoUrl)} /> : 'SA'}</span>
                    <div><strong>{selectedCommunicationAuthor?.name || 'Secretaría académica'}</strong><small>Así aparecerá en el feed del padre.</small></div>
                    {selectedCommunicationAuthor ? <button className="btn" onClick={() => onEditCommunicationAuthor(selectedCommunicationAuthor)} type="button">Editar autor</button> : null}
                    {canDeleteSelectedCommunicationAuthor ? <button className="btn" onClick={() => openDeleteCommunicationAuthorModal(selectedCommunicationAuthor)} type="button">Eliminar autor</button> : null}
                  </div>
                </div>
                <div className="academic-secretary__author-creator">
                  <div className="academic-secretary__author-preview">
                    <span className="academic-secretary__author-avatar">{communicationAuthorDraft.thumbUrl || communicationAuthorDraft.photoUrl ? <img alt={communicationAuthorDraft.name || 'Nuevo autor'} src={resolveApiAssetUrl(communicationAuthorDraft.thumbUrl || communicationAuthorDraft.photoUrl)} /> : '+'}</span>
                    <div><strong>{editingCommunicationAuthorId ? 'Editar autor' : 'Nuevo autor'}</strong><small>{editingCommunicationAuthorId ? 'Cambia nombre o foto de perfil.' : 'Nombre y foto de perfil.'}</small></div>
                  </div>
                  <label>Nombre<input value={communicationAuthorDraft.name} onChange={(event) => setCommunicationAuthorDraft((previous) => ({ ...previous, name: event.target.value }))} placeholder="Ej. Deportes" /></label>
                  <label>Foto de perfil<input accept="image/*" disabled={communicationAuthorDraft.uploading} onChange={onCommunicationAuthorPhotoSelected} type="file" /></label>
                  <button className="btn" disabled={busy || communicationAuthorDraft.uploading || !communicationAuthorDraft.name.trim() || (!editingCommunicationAuthorId && !communicationAuthorDraft.photoUrl)} onClick={onCreateCommunicationAuthor} type="button">{editingCommunicationAuthorId ? 'Guardar autor' : 'Agregar autor'}</button>
                  {editingCommunicationAuthorId ? <button className="btn" onClick={resetCommunicationAuthorDraft} type="button">Cancelar</button> : null}
                </div>
                {communicationAuthorDraft.error ? <p className="academic-secretary__form-error">{communicationAuthorDraft.error}</p> : null}
              </div>
              <div className="academic-secretary__subform">
                <h4>Contenido visual</h4>
                <div className="academic-secretary__form-grid">
                  <label>
                    Archivos del carrusel
                    <input accept="image/*,video/*" disabled={uploadingMedia} multiple onChange={onCommunicationImagesSelected} type="file" />
                  </label>
                  <label>
                    URL de video público
                    <input placeholder="https://..." value={communicationForm.videoUrl || ''} onChange={(event) => setCommunicationForm((previous) => {
                      const videoUrl = event.target.value;
                      const currentMedia = (previous.media || []).filter((item) => item.kind !== 'video');
                      return {
                        ...previous,
                        videoUrl,
                        media: videoUrl.trim()
                          ? [...currentMedia, { kind: 'video', src: videoUrl.trim(), thumbUrl: '', alt: previous.title || 'Video del comunicado', localId: currentMedia.find((item) => item.kind === 'video')?.localId || createCommunicationMediaId('video') }]
                          : currentMedia,
                      };
                    })} />
                  </label>
                </div>
                <div className="academic-secretary__media-strip">
                  {(communicationForm.media || []).length === 0 ? <p className="academic-secretary__media-empty">Este comunicado aún no tiene contenido visual.</p> : (communicationForm.media || []).map((item, index) => {
                    const mediaId = item.localId || `${item.kind}-${item.src}-${index}`;
                    const previewSrc = resolveApiAssetUrl(item.thumbUrl || item.src);
                    return (
                      <article
                        className={`academic-secretary__media-card${draggingCommunicationMediaId === mediaId ? ' is-dragging' : ''}${item.uploadError ? ' has-error' : ''}`}
                        draggable={(communicationForm.media || []).length > 1}
                        key={mediaId}
                        onDragEnd={() => setDraggingCommunicationMediaId('')}
                        onDragOver={(event) => event.preventDefault()}
                        onDragStart={(event) => onCommunicationMediaDragStart(event, item, index)}
                        onDrop={(event) => onCommunicationMediaDrop(event, index)}
                      >
                        <span className="academic-secretary__media-order">{index + 1}</span>
                        <div className="academic-secretary__media-thumb">
                          {item.kind === 'video' ? <div className="academic-secretary__media-video">Video</div> : <img alt={item.alt || `Imagen ${index + 1}`} src={previewSrc} />}
                        </div>
                        <div className="academic-secretary__media-copy">
                          <strong>{item.kind === 'video' ? 'Video destacado' : `Imagen ${index + 1}`}</strong>
                          <span>{item.kind === 'video' ? item.src : item.fileName || 'Carrusel para acudientes'}</span>
                          {item.uploading ? <small>Subiendo imagen...</small> : null}
                          {item.uploadError ? <small>No se pudo subir. Quita esta imagen e intenta de nuevo.</small> : null}
                        </div>
                        <span className="academic-secretary__media-drag-handle" aria-hidden="true">Arrastrar</span>
                        <button className="academic-secretary__media-remove" onClick={() => onRemoveCommunicationMedia(index)} type="button">Quitar</button>
                      </article>
                    );
                  })}
                </div>
              </div>
              <div className="academic-secretary__form-grid">
                <label>Audiencia<select value={communicationForm.audienceType} onChange={(event) => setCommunicationForm((previous) => ({ ...previous, audienceType: event.target.value, gradeTargets: [], courseTargets: [], parentTargets: [], studentTargets: [] }))}><option value="general">General</option><option value="grade">Por grado</option><option value="course">Por curso</option><option value="individual">Individual</option></select></label>
                {communicationForm.audienceType === 'grade' ? <label>Grados<select className="academic-secretary__multi-select" multiple value={communicationForm.gradeTargets} onChange={(event) => onMultiSelectChange(event, 'gradeTargets', setCommunicationForm)}>{gradeCatalog.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}</select></label> : null}
                {communicationForm.audienceType === 'course' ? <label>Cursos<select className="academic-secretary__multi-select" multiple value={communicationForm.courseTargets} onChange={(event) => onMultiSelectChange(event, 'courseTargets', setCommunicationForm)}>{courseOptions.map((course) => <option key={course.value} value={course.value}>{course.label}</option>)}</select></label> : null}
                {communicationForm.audienceType === 'individual' ? <><label>Acudientes<select className="academic-secretary__multi-select" multiple value={communicationForm.parentTargets} onChange={(event) => onMultiSelectChange(event, 'parentTargets', setCommunicationForm)}>{parentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Alumnos<select className="academic-secretary__multi-select" multiple value={communicationForm.studentTargets} onChange={(event) => onMultiSelectChange(event, 'studentTargets', setCommunicationForm)}>{studentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></> : null}
              </div>
              <div className="academic-secretary__actions"><button className="btn btn-primary" disabled={busy} type="submit">{editingCommunicationId ? 'Guardar cambios' : 'Publicar comunicado'}</button></div>
            </form>
          </article>
          <article className="academic-secretary__panel">
            <h2>Historial de comunicados</h2>
            <div className="academic-secretary__table-wrap"><table className="academic-secretary__table"><thead><tr><th>Título</th><th>Autor</th><th>Visual</th><th>Audiencia</th><th>Interacción</th><th>Entrega</th><th>Acciones</th></tr></thead><tbody>{bootstrap.communications.length === 0 ? <tr><td colSpan="7">Aún no hay comunicados enviados.</td></tr> : bootstrap.communications.map((item) => <tr key={item._id}><td><strong>{item.title}</strong><div>{item.body}</div></td><td><div className="academic-secretary__author-mini"><span className="academic-secretary__author-avatar is-small">{item.authorThumbUrl || item.authorPhotoUrl ? <img alt={item.authorName || 'Autor'} src={resolveApiAssetUrl(item.authorThumbUrl || item.authorPhotoUrl)} /> : String(item.authorName || 'SA').slice(0, 2).toUpperCase()}</span><span>{item.authorName || 'Secretaría académica'}</span></div></td><td>{Array.isArray(item.media) && item.media.length ? <span>{item.media.filter((mediaItem) => mediaItem.kind === 'image').length} img · {item.media.some((mediaItem) => mediaItem.kind === 'video') ? 'video' : 'sin video'}</span> : <span>Solo texto</span>}</td><td>{item.audienceType}</td><td><div className="academic-secretary__engagement-actions"><button onClick={() => setCommunicationEngagementModal({ open: true, type: 'likes', item })} type="button">{item.likesCount || item.likes?.length || 0} likes</button><button onClick={() => setCommunicationEngagementModal({ open: true, type: 'comments', item })} type="button">{item.commentsCount || item.comments?.length || 0} comentarios</button></div></td><td>{formatDateTime(item.sentAt || item.createdAt)}</td><td><div className="academic-secretary__row-actions"><button aria-label={`Editar comunicado ${item.title}`} className="academic-secretary__row-icon-button is-primary" disabled={busy} onClick={() => onEditCommunication(item)} title="Editar publicación" type="button"><PencilIcon /></button><button aria-label={`Eliminar comunicado ${item.title}`} className="academic-secretary__row-icon-button is-danger" disabled={busy} onClick={() => onDeleteCommunication(item)} title="Eliminar publicación" type="button"><CloseIcon /></button></div></td></tr>)}</tbody></table></div>
          </article>
        </section>
      ) : null}

      {activeSection === 'marketing' && !isBillingPortal ? (
        <section className="academic-secretary__grid academic-secretary__grid--content academic-secretary__marketing">
          <article className="academic-secretary__panel">
            <div className="academic-secretary__panel-head">
              <div>
                <h2>Marketing</h2>
                <p>Boletines y correos para familias en proceso de admisión.</p>
              </div>
            </div>
            <form className="academic-secretary__form" onSubmit={onSubmitMarketingCampaign}>
              <div className="academic-secretary__form-grid">
                <label>Asunto del correo<input required value={marketingForm.subject} onChange={(event) => setMarketingForm((previous) => ({ ...previous, subject: event.target.value }))} placeholder="Ej. Jornada de puertas abiertas" /></label>
                <label>Título interno<input value={marketingForm.title} onChange={(event) => setMarketingForm((previous) => ({ ...previous, title: event.target.value }))} placeholder="Ej. Invitación familias nuevas" /></label>
              </div>
              <label>Mensaje<textarea value={marketingForm.body} onChange={(event) => setMarketingForm((previous) => ({ ...previous, body: event.target.value }))} placeholder="Escribe el contenido que recibirá el acudiente." /></label>
              <div className="academic-secretary__subform academic-secretary__marketing-image-box">
                <h4>Imagen del boletín</h4>
                <div className="academic-secretary__form-grid">
                  <label>Subir imagen<input accept="image/*" disabled={uploadingMarketingImage} onChange={onMarketingImageSelected} type="file" /></label>
                  <label>Texto alternativo<input value={marketingForm.imageAlt} onChange={(event) => setMarketingForm((previous) => ({ ...previous, imageAlt: event.target.value }))} placeholder="Descripción breve de la imagen" /></label>
                </div>
                {marketingForm.imageUrl ? (
                  <div className="academic-secretary__marketing-image-preview">
                    <img alt={marketingForm.imageAlt || marketingForm.subject || 'Imagen del boletín'} src={marketingForm.imagePreviewUrl || resolveApiAssetUrl(marketingForm.imageUrl)} />
                    <button className="btn" onClick={clearMarketingImage} type="button">Quitar imagen</button>
                  </div>
                ) : <p>Sin imagen cargada.</p>}
              </div>
              <div className="academic-secretary__actions">
                <button className="btn btn-primary" disabled={busy || uploadingMarketingImage || !selectedMarketingApplicants.length} type="submit">Enviar a {selectedMarketingApplicants.length} acudiente(s)</button>
                <button className="btn" disabled={busy} onClick={resetMarketingForm} type="button">Limpiar texto</button>
              </div>
            </form>
          </article>

          <article className="academic-secretary__panel">
            <div className="academic-secretary__panel-head">
              <div>
                <h2>Destinatarios</h2>
                <p>{selectedMarketingApplicants.length} seleccionados de {filteredMarketingApplicants.length} aspirantes filtrados.</p>
              </div>
              <button className="btn" disabled={marketingLoading} onClick={() => loadMarketingRecipients(true)} type="button">Actualizar lista</button>
            </div>
            <div className="academic-secretary__form-grid academic-secretary__marketing-filters">
              <label>Buscar<input value={marketingFilters.search} onChange={(event) => setMarketingFilters((previous) => ({ ...previous, search: event.target.value }))} placeholder="Aspirante, acudiente o correo" /></label>
              <label>Etapa<select value={marketingFilters.stage} onChange={(event) => setMarketingFilters((previous) => ({ ...previous, stage: event.target.value }))}><option value="">Todas</option>{marketingStageOptions.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></label>
              <label>Grado<select value={marketingFilters.grade} onChange={(event) => setMarketingFilters((previous) => ({ ...previous, grade: event.target.value }))}><option value="">Todos</option>{marketingGradeOptions.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}</select></label>
              <label>Estado<select value={marketingFilters.status} onChange={(event) => setMarketingFilters((previous) => ({ ...previous, status: event.target.value }))}><option value="">Todos</option><option value="interested">Interesado</option><option value="in_process">En proceso</option><option value="enrolled">Matriculado</option><option value="withdrawn">Desistido</option></select></label>
            </div>
            <div className="academic-secretary__actions">
              <button className="btn" disabled={!eligibleMarketingApplicantIds.length} onClick={toggleAllFilteredMarketingApplicants} type="button">{allFilteredMarketingApplicantsSelected ? 'Quitar filtrados' : 'Seleccionar filtrados'}</button>
              <button className="btn" disabled={!selectedMarketingApplicantIds.length} onClick={() => setSelectedMarketingApplicantIds([])} type="button">Limpiar selección</button>
            </div>
            <div className="academic-secretary__table-wrap academic-secretary__marketing-table-wrap">
              <table className="academic-secretary__table">
                <thead><tr><th>Enviar</th><th>Aspirante</th><th>Acudiente</th><th>Correo</th><th>Grado</th><th>Etapa</th><th>Estado</th></tr></thead>
                <tbody>
                  {marketingLoading ? <tr><td colSpan="7">Cargando aspirantes...</td></tr> : null}
                  {!marketingLoading && !filteredMarketingApplicants.length ? <tr><td colSpan="7">No hay aspirantes que coincidan con los filtros.</td></tr> : null}
                  {!marketingLoading && filteredMarketingApplicants.map((applicant) => {
                    const applicantId = applicant.id;
                    const canSend = Boolean(applicant.guardianEmail);
                    return (
                      <tr className={!canSend ? 'is-muted' : ''} key={applicantId}>
                        <td><input aria-label={`Seleccionar ${applicant.studentName || 'aspirante'}`} checked={selectedMarketingApplicantIdSet.has(applicantId)} disabled={!canSend} onChange={() => toggleMarketingApplicantSelection(applicantId)} type="checkbox" /></td>
                        <td><strong>{applicant.studentName || 'Aspirante sin nombre'}</strong></td>
                        <td>{applicant.guardianName || 'Sin acudiente'}</td>
                        <td>{applicant.guardianEmail || 'Sin correo'}</td>
                        <td>{formatGradeLabel(applicant.grade)}</td>
                        <td>{getMarketingStageLabel(marketingStageOptions, applicant.currentStageKey)}</td>
                        <td>{getMarketingStatusLabel(applicant.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <article className="academic-secretary__panel academic-secretary__marketing-history">
            <div className="academic-secretary__panel-head">
              <div>
                <h2>Historial de correos enviados</h2>
                <p>Registro de los boletines enviados por admisiones.</p>
              </div>
              <button className="btn" disabled={marketingHistoryLoading} onClick={() => loadMarketingHistory(true)} type="button">Actualizar historial</button>
            </div>
            <div className="academic-secretary__table-wrap">
              <table className="academic-secretary__table">
                <thead><tr><th>Fecha</th><th>Asunto</th><th>Imagen</th><th>Entrega</th><th>Destinatarios</th></tr></thead>
                <tbody>
                  {marketingHistoryLoading ? <tr><td colSpan="5">Cargando historial...</td></tr> : null}
                  {!marketingHistoryLoading && !marketingHistory.length ? <tr><td colSpan="5">Aún no hay correos de marketing enviados.</td></tr> : null}
                  {!marketingHistoryLoading && marketingHistory.map((campaign) => {
                    const delivery = campaign.delivery || {};
                    const recipients = Array.isArray(campaign.recipients) ? campaign.recipients : [];
                    const previewRecipients = recipients.slice(0, 3).map((recipient) => recipient.guardianName || recipient.guardianEmail || recipient.studentName).filter(Boolean).join(', ');
                    return (
                      <tr key={campaign.id || `${campaign.subject}-${campaign.sentAt}`}>
                        <td>{formatDateTime(campaign.sentAt || campaign.createdAt)}</td>
                        <td><strong>{campaign.subject}</strong>{campaign.title && campaign.title !== campaign.subject ? <div>{campaign.title}</div> : null}</td>
                        <td>{campaign.imageUrl ? <a href={resolveApiAssetUrl(campaign.imageUrl)} rel="noreferrer" target="_blank">Ver imagen</a> : 'Sin imagen'}</td>
                        <td>{Number(delivery.sent || 0)} enviados{delivery.failed ? ` · ${delivery.failed} fallidos` : ''}</td>
                        <td>{previewRecipients || 'Sin destinatarios'}{recipients.length > 3 ? ` +${recipients.length - 3}` : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeSection === 'costs' && !isBillingPortal ? (
        <section className="academic-secretary__panel">
          <div className="academic-secretary__panel-head"><div><h2>Costos por grado</h2><p>Consulta la configuración vigente que rectoría defina en backend para bono único, matrícula anual, pensión mensual y beneficios.</p></div></div>
          {!availableCostGrades.length ? <p>Aún no hay costos configurados para este colegio.</p> : (
            <div className="academic-secretary__form academic-secretary__costs-readonly">
              <div className="academic-secretary__form-grid">
                <label>Selecciona el grado<select value={selectedCostGrade} onChange={(event) => setSelectedCostGrade(event.target.value)}>{availableCostGrades.map((grade) => <option key={grade.grade} value={grade.grade}>{formatGradeLabel(grade.grade)}</option>)}</select></label>
                <label>Año académico<input disabled readOnly value={bootstrap.feeSettings?.academicYear || ''} /></label>
              </div>
              <div className="academic-secretary__summary-grid">
                <div className="academic-secretary__mini-card"><span>Bono único</span><strong>{formatCurrency(selectedCostSetting?.enrollmentBonus || 0)}</strong></div>
                <div className="academic-secretary__mini-card"><span>Matrícula anual</span><strong>{formatCurrency(selectedCostSetting?.enrollmentFee || 0)}</strong></div>
                <div className="academic-secretary__mini-card"><span>Pensión mensual</span><strong>{formatCurrency(selectedCostSetting?.monthlyTuition || 0)}</strong></div>
              </div>
              {selectedCostSetting ? (
                <div className="academic-secretary__subform academic-secretary__subform--soft academic-secretary__cost-simulation">
                  <div className="academic-secretary__panel-head academic-secretary__cost-simulation-head">
                    <div><h3>Simulación de costos</h3><p>Proyección mensual para {formatGradeLabel(selectedCostSetting.grade)} según financiación y descuentos seleccionados.</p></div>
                    <button aria-label="Imprimir proyección de costos" className="academic-secretary__row-icon-button is-primary" onClick={onPrintCostSimulation} title="Imprimir proyección" type="button">
                      <PrintIcon />
                    </button>
                  </div>
                  <div className="academic-secretary__form-grid">
                    <label>Fecha de ingreso<input type="date" value={costSimulationDraft.entryDate} onChange={(event) => setCostSimulationDraft((previous) => ({ ...previous, entryDate: event.target.value, enrollmentSimulationRuleKey: 'manual' }))} /></label>
                    <label>Vigencia de cotización para costos<input value={costSimulationDraft.costQuoteValidity} onChange={(event) => setCostSimulationDraft((previous) => ({ ...previous, costQuoteValidity: event.target.value }))} placeholder="Ej: 2025-2026" /></label>
                    <label>Financiar bono en<select value={costSimulationDraft.enrollmentBonusInstallments} onChange={(event) => setCostSimulationDraft((previous) => ({ ...previous, enrollmentBonusInstallments: event.target.value }))}>{ACADEMIC_FINANCING_INSTALLMENT_OPTIONS.map((option) => <option key={`cost-bonus-${option}`} value={option}>{option} {option === 1 ? 'mes' : 'meses'}</option>)}</select></label>
                    <label>Financiar matrícula en<select value={costSimulationDraft.annualTuitionInstallments} onChange={(event) => setCostSimulationDraft((previous) => ({ ...previous, annualTuitionInstallments: event.target.value }))}>{ACADEMIC_FINANCING_INSTALLMENT_OPTIONS.map((option) => <option key={`cost-tuition-${option}`} value={option}>{option} {option === 1 ? 'mes' : 'meses'}</option>)}</select></label>
                    <label>Descuento adicional matrícula (%)<input type="number" min="0" max="100" value={costSimulationDraft.annualTuitionAdditionalDiscountPercent} onChange={(event) => setCostSimulationDraft((previous) => ({ ...previous, annualTuitionAdditionalDiscountPercent: event.target.value }))} placeholder="0" /></label>
                    <label>Motivo del descuento matrícula<input value={costSimulationDraft.annualTuitionAdditionalDiscountLabel} onChange={(event) => setCostSimulationDraft((previous) => ({ ...previous, annualTuitionAdditionalDiscountLabel: event.target.value }))} placeholder="Ej: Convenio familiar" /></label>
                    <label>Descuento adicional pensión (%)<input type="number" min="0" max="100" value={costSimulationDraft.monthlyTuitionAdditionalDiscountPercent} onChange={(event) => setCostSimulationDraft((previous) => ({ ...previous, monthlyTuitionAdditionalDiscountPercent: event.target.value }))} placeholder="0" /></label>
                    <label>Motivo del descuento<input value={costSimulationDraft.monthlyTuitionAdditionalDiscountLabel} onChange={(event) => setCostSimulationDraft((previous) => ({ ...previous, monthlyTuitionAdditionalDiscountLabel: event.target.value }))} placeholder="Ej: Hermano adicional" /></label>
                  </div>
                  <div className="academic-secretary__scenario-section">
                    <h4>Valores de matrícula</h4>
                    {costSimulationEnrollmentOptions.length > 1 ? (
                      <div className="academic-secretary__scenario-grid">
                        {costSimulationEnrollmentOptions.slice(1).map((option) => (
                          <button className={`academic-secretary__mini-card academic-secretary__scenario-card${costSimulationDraft.enrollmentSimulationRuleKey === option.value ? ' is-selected' : ''}`} key={option.value} onClick={() => setCostSimulationDraft((previous) => ({ ...previous, enrollmentSimulationRuleKey: option.value, entryDate: option.entryDate || previous.entryDate }))} type="button">
                            <span>{option.label}</span>
                            <strong>{formatCurrency(option.amount)}</strong>
                            <small>{formatDate(option.startDate)} al {formatDate(option.endDate)}</small>
                            <small>{option.discountAmount > 0 ? `Beneficio: -${formatCurrency(option.discountAmount)}` : 'Valor pleno'}</small>
                          </button>
                        ))}
                      </div>
                    ) : <p className="academic-secretary__media-empty">No hay escenarios de matrícula configurados.</p>}
                  </div>
                  <div className="academic-secretary__scenario-section">
                    <h4>Valores de pensión</h4>
                    <div className="academic-secretary__scenario-grid">
                      {costSimulationPaymentOptions.map((option) => (
                        <button className={`academic-secretary__mini-card academic-secretary__scenario-card${(costSimulationDraft.paymentSimulationRuleKey || 'full') === option.value ? ' is-selected' : ''}`} key={option.value} onClick={() => setCostSimulationDraft((previous) => ({ ...previous, paymentSimulationRuleKey: option.value }))} type="button">
                          <span>{option.label}</span>
                          <strong>{formatCurrency(option.monthlyTuitionAmount)}</strong>
                          <small>{option.value === 'full' ? 'Sin beneficio de pensión' : `Días ${option.startDay} al ${option.endDay}`}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="academic-secretary__summary-grid academic-secretary__summary-grid--compact">
                    <div className="academic-secretary__mini-card"><span>{costSimulationIncludesBonusInMonthlyProjection ? 'Bono financiado' : 'Bono de contado'}</span><strong>{formatCurrency(costSimulationIncludesBonusInMonthlyProjection ? costSimulationExternalBonusAmount : costSimulationCashBonusAmount)}</strong></div>
                    <div className="academic-secretary__mini-card"><span>Matrícula proyectada</span><strong>{formatCurrency(costSimulationEstimatedEnrollmentFee)}</strong></div>
                    <div className="academic-secretary__mini-card"><span>Beneficio sobre matrícula</span><strong>{costSimulationProratedEnrollmentFee.enrollmentBenefitDiscountAmount > 0 ? `-${formatCurrency(costSimulationProratedEnrollmentFee.enrollmentBenefitDiscountAmount)}` : formatCurrency(0)}</strong></div>
                    <div className="academic-secretary__mini-card"><span>Pensión del escenario</span><strong>{formatCurrency(costSimulationEstimatedMonthlyTuition)}</strong></div>
                  </div>
                  {costSimulationPaymentSchedule.length ? (
                    <div className="academic-secretary__table-wrap academic-secretary__table-wrap--compact">
                      <table className="academic-secretary__table academic-secretary__table--simulation">
                        <thead><tr><th>Mes</th><th>Pensión aplicada</th><th>Cuota matrícula</th>{costSimulationIncludesBonusInMonthlyProjection ? <th>Cuota bono</th> : null}<th>Total del mes</th></tr></thead>
                        <tbody>{costSimulationPaymentSchedule.map((row) => <tr key={row.key}><td>{row.monthLabel}</td><td>{formatCurrency(row.monthlyTuitionAmount)}</td><td>{formatCurrency(row.enrollmentInstallmentAmount)}</td>{costSimulationIncludesBonusInMonthlyProjection ? <td>{formatCurrency(row.enrollmentBonusInstallmentAmount)}</td> : null}<td><strong>{formatCurrency(getCostSimulationProjectionRowTotal(row))}</strong></td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : <p className="academic-secretary__media-empty">Selecciona un grado con costos configurados para ver la proyección mensual.</p>}
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {activeSection === 'enrollments' && !isBillingPortal ? (
        <section className="academic-secretary__panel" id="academic-enrollment-form">
          <div className="academic-secretary__panel-head">
            <div>
              <h2>{enrollmentEditingStudentId ? 'Editar matrícula' : 'Nueva matrícula'}</h2>
              {enrollmentEditingStudentId ? <p>Estás editando el alumno seleccionado desde el listado inferior.</p> : null}
            </div>
            {enrollmentEditingStudentId ? <button className="btn" disabled={busy} onClick={onCancelEnrollmentEdit} type="button">Cancelar edición</button> : null}
          </div>
          <form className="academic-secretary__form" onSubmit={onSubmitEnrollment}>
            <div className="academic-secretary__primary-contact-row">
              <span>Acudiente principal para seguimiento</span>
              <div className="academic-secretary__primary-contact-pills">
                <label className={`academic-secretary__primary-contact-pill${enrollmentForm.primaryGuardian === 'father' ? ' is-selected' : ''}`}>
                  <input
                    checked={enrollmentForm.primaryGuardian === 'father'}
                    onChange={() => setEnrollmentForm((previous) => ({ ...previous, primaryGuardian: 'father' }))}
                    type="checkbox"
                  />
                  <span>Padre</span>
                </label>
                <label className={`academic-secretary__primary-contact-pill${enrollmentForm.primaryGuardian === 'mother' ? ' is-selected' : ''}`}>
                  <input
                    checked={enrollmentForm.primaryGuardian === 'mother'}
                    onChange={() => setEnrollmentForm((previous) => ({ ...previous, primaryGuardian: 'mother' }))}
                    type="checkbox"
                  />
                  <span>Madre</span>
                </label>
              </div>
            </div>
            <div className="academic-secretary__form-grid">
              <div className="academic-secretary__subform"><h4>Padre</h4><label>Nombre del padre<input value={enrollmentForm.father.name} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, father: { ...previous.father, name: event.target.value } }))} /></label><label>Tipo de documento<select value={enrollmentForm.father.documentType} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, father: { ...previous.father, documentType: event.target.value } }))}><option value="CC">CC</option><option value="CE">CE</option><option value="PP">PP</option><option value="TI">TI</option></select></label><label>Número de documento<input value={enrollmentForm.father.documentNumber} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, father: { ...previous.father, documentNumber: event.target.value } }))} /></label><label>Teléfono padre<input value={enrollmentForm.father.phone} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, father: { ...previous.father, phone: event.target.value } }))} /></label><label>Correo padre (usuario)<input type="email" value={enrollmentForm.father.email} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, father: { ...previous.father, email: event.target.value } }))} /></label><label>Contraseña<input type="password" value={enrollmentForm.father.password} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, father: { ...previous.father, password: event.target.value } }))} /></label><label>Dirección<input value={enrollmentForm.father.address} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, father: { ...previous.father, address: event.target.value } }))} /></label></div>
              <div className="academic-secretary__subform"><h4>Madre</h4><label>Nombre de la madre<input value={enrollmentForm.mother.name} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, mother: { ...previous.mother, name: event.target.value } }))} /></label><label>Tipo de documento<select value={enrollmentForm.mother.documentType} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, mother: { ...previous.mother, documentType: event.target.value } }))}><option value="CC">CC</option><option value="CE">CE</option><option value="PP">PP</option><option value="TI">TI</option></select></label><label>Número de documento<input value={enrollmentForm.mother.documentNumber} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, mother: { ...previous.mother, documentNumber: event.target.value } }))} /></label><label>Teléfono madre<input value={enrollmentForm.mother.phone} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, mother: { ...previous.mother, phone: event.target.value } }))} /></label><label>Correo madre (usuario)<input type="email" value={enrollmentForm.mother.email} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, mother: { ...previous.mother, email: event.target.value } }))} /></label><label>Contraseña<input type="password" value={enrollmentForm.mother.password} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, mother: { ...previous.mother, password: event.target.value } }))} /></label><label>Dirección<input value={enrollmentForm.mother.address} onChange={(event) => setEnrollmentForm((previous) => ({ ...previous, mother: { ...previous.mother, address: event.target.value } }))} /></label></div>
            </div>
            <div className="academic-secretary__student-list">
              {enrollmentForm.students.map((student, index) => {
                const selectedFeeSettingForStudent = feeSettingByGrade.get(String(student.grade || '').trim()) || null;
                const enrollmentBonusInstallments = Math.max(1, Number(student.enrollmentBonusInstallments || 1));
                const annualTuitionInstallments = Math.max(1, Number(student.annualTuitionInstallments || 1));
                const additionalEnrollmentDiscountPercent = Math.min(100, Math.max(0, Number(student.annualTuitionAdditionalDiscountPercent || 0)));
                const additionalPensionDiscountPercent = Math.min(100, Math.max(0, Number(student.monthlyTuitionAdditionalDiscountPercent || 0)));
                const proratedEnrollmentFee = calculateAcademicProratedEnrollmentFee(selectedFeeSettingForStudent?.enrollmentFee || 0, student.entryDate, bootstrap.feeSettings || {}, selectedFeeSettingForStudent?.grade || student.grade || '', schoolYearCalendarOptions);
                const estimatedMonthlyTuition = calculateDiscountedAmount(selectedFeeSettingForStudent?.monthlyTuition || 0, additionalPensionDiscountPercent);
                const paymentSimulationOptions = [{ value: 'full', label: 'Precio full', generalDiscountPercent: 0, generalFixedDiscountAmount: 0 }].concat(
                  generalBenefitRules.map((rule, ruleIndex) => ({
                    value: `benefit-${ruleIndex}`,
                    label: rule.label || `Beneficio ${ruleIndex + 1}`,
                    generalDiscountPercent: rule?.discountType === 'fixed' ? 0 : Math.min(100, Math.max(0, Number(rule?.discountPercent || 0))),
                    generalFixedDiscountAmount: rule?.discountType === 'fixed' ? getFixedBenefitAmountForGrade(rule, selectedFeeSettingForStudent?.grade) : 0,
                    startDay: Number(rule?.startDay || 1),
                    endDay: Number(rule?.endDay || 10),
                  }))
                );
                const selectedPaymentSimulationOption = paymentSimulationOptions.find((option) => option.value === student.paymentSimulationRuleKey) || paymentSimulationOptions[0];
                const monthlyPaymentSchedule = buildAcademicMonthlyPaymentSchedule({
                  feeSettings: bootstrap.feeSettings || {},
                  grade: selectedFeeSettingForStudent?.grade || student.grade || '',
                  academicGrades: academicStructureGrades,
                  schoolYearStartDate: bootstrap.feeSettings?.schoolYearStartDate,
                  schoolYearEndDate: bootstrap.feeSettings?.schoolYearEndDate,
                  academicYear: bootstrap.feeSettings?.academicYear,
                  entryDate: student.entryDate,
                  monthlyTuitionAmount: Number(selectedFeeSettingForStudent?.monthlyTuition || 0),
                  enrollmentBonusAmount: Number(selectedFeeSettingForStudent?.enrollmentBonus || 0),
                  enrollmentBonusInstallments,
                  annualTuitionAmount: Number(proratedEnrollmentFee.amount || 0),
                  annualTuitionInstallments,
                  annualTuitionAdditionalDiscountPercent: additionalEnrollmentDiscountPercent,
                  generalDiscountPercent: Number(selectedPaymentSimulationOption?.generalDiscountPercent || 0),
                  generalFixedDiscountAmount: Number(selectedPaymentSimulationOption?.generalFixedDiscountAmount || 0),
                  additionalDiscountPercent: additionalPensionDiscountPercent,
                });
                const hasCompleteParentData = isAcademicParentDraftComplete(enrollmentForm.father) || isAcademicParentDraftComplete(enrollmentForm.mother);
                const isStudentReadyForContract = isAcademicStudentDraftComplete(student) && Boolean(selectedFeeSettingForStudent);
                const canGenerateContract = hasCompleteParentData && isStudentReadyForContract;
                const millenniumContractPricing = {
                  enrollmentBonusAmount: Number(selectedFeeSettingForStudent?.enrollmentBonus || 0),
                  enrollmentBonusInstallments,
                  proratedAnnualTuitionAmount: proratedEnrollmentFee.amount,
                  proratedAnnualTuitionBaseAmount: proratedEnrollmentFee.baseAmount,
                  lateEnrollmentSurchargeAmount: proratedEnrollmentFee.lateEnrollmentSurchargeAmount,
                  enrollmentBenefitDiscountAmount: proratedEnrollmentFee.enrollmentBenefitDiscountAmount,
                  enrollmentBenefitLabel: proratedEnrollmentFee.enrollmentBenefitLabel,
                  annualTuitionInstallments,
                  annualTuitionAdditionalDiscountPercent: additionalEnrollmentDiscountPercent,
                  annualTuitionAdditionalDiscountLabel: student.annualTuitionAdditionalDiscountLabel,
                  monthlyTuitionAmount: estimatedMonthlyTuition,
                  monthlyTuitionAdditionalDiscountPercent: additionalPensionDiscountPercent,
                  monthlyTuitionAdditionalDiscountLabel: student.monthlyTuitionAdditionalDiscountLabel,
                };
                const millenniumContractParams = {
                  father: enrollmentForm.father,
                  mother: enrollmentForm.mother,
                  primaryGuardian: enrollmentForm.primaryGuardian,
                  student,
                  gradeLabel: formatGradeLabel(student.grade),
                  pricing: millenniumContractPricing,
                };
                const showMillenniumContracts = isMillenniumSchool(schoolName)
                  && canPreviewMillenniumEnrollmentContracts(millenniumContractParams);
                const millenniumContractContext = showMillenniumContracts
                  ? buildMillenniumEnrollmentContractContext(millenniumContractParams)
                  : null;
                const medicalProfile = student.medicalProfile || createEmptyStudentDraft().medicalProfile;
                const medicationAuthorization = medicalProfile.medicationAuthorization || {};

                return (
                  <div className="academic-secretary__subform" key={`student-${index}`}>
                    <h4>Alumno {index + 1}</h4>
                    <div className="academic-secretary__form-grid">
                      <label>Apellidos<input value={student.lastName} onChange={(event) => updateEnrollmentStudent(index, { lastName: event.target.value })} /></label>
                      <label>Nombres<input value={student.firstName} onChange={(event) => updateEnrollmentStudent(index, { firstName: event.target.value })} /></label>
                      <label>Género<select value={student.gender} onChange={(event) => updateEnrollmentStudent(index, { gender: event.target.value })}><option value="">Selecciona</option><option value="female">Femenino</option><option value="male">Masculino</option><option value="other">Otro</option></select></label>
                      <label>Tipo de documento<select value={student.documentType} onChange={(event) => updateEnrollmentStudent(index, { documentType: event.target.value })}><option value="TI">TI</option><option value="CC">CC</option><option value="CE">CE</option><option value="PP">PP</option></select></label>
                      <label>Número de documento<input value={student.documentNumber} onChange={(event) => updateEnrollmentStudent(index, { documentNumber: event.target.value })} /></label>
                      <label>Fecha de nacimiento<input type="date" value={student.birthDate} onChange={(event) => updateEnrollmentStudent(index, { birthDate: event.target.value })} /></label>
                      <label>Edad calculada<input disabled readOnly value={calculateAgeFromDate(student.birthDate)} /></label>
                      <label>Tipo de sangre<input value={student.bloodType} onChange={(event) => updateEnrollmentStudent(index, { bloodType: event.target.value })} /></label>
                      <label>Lugar de nacimiento<input value={student.birthPlace} onChange={(event) => updateEnrollmentStudent(index, { birthPlace: event.target.value })} /></label>
                      <label>Dirección<input value={student.address} onChange={(event) => updateEnrollmentStudent(index, { address: event.target.value })} /></label>
                      <label>Grado<select value={student.grade} onChange={(event) => updateEnrollmentStudent(index, { grade: event.target.value })}><option value="">Selecciona un grado</option>{gradeCatalog.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}</select></label>
                      <label>Fecha de ingreso<input type="date" value={student.entryDate} onChange={(event) => updateEnrollmentStudent(index, { entryDate: event.target.value })} /></label>
                      <div className="academic-secretary__field-with-action">
                        {showMillenniumContracts ? (
                          <div className="academic-secretary__contract-actions">
                            <button
                              className="btn btn-primary"
                              type="button"
                              onClick={() => downloadMillenniumEnrollmentContractPdf(millenniumContractParams)}
                            >
                              Descargar contrato
                            </button>
                            <button
                              className="btn"
                              type="button"
                              onClick={() => downloadMillenniumPagareContractPdf(millenniumContractParams)}
                            >
                              Descargar pagaré
                            </button>
                          </div>
                        ) : null}
                        {!showMillenniumContracts && canGenerateContract ? (
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => downloadAcademicEnrollmentContractPdf({
                              schoolName,
                              father: enrollmentForm.father,
                              mother: enrollmentForm.mother,
                              student,
                              gradeLabel: formatGradeLabel(student.grade),
                              pricing: millenniumContractPricing,
                            })}
                          >
                            Generar contrato
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {showMillenniumContracts ? (
                      <div className="academic-secretary__contracts-preview">
                        <div className="academic-secretary__contracts-preview-head">
                          <h4>Contratos Millennium School</h4>
                          <p>
                            Vista previa con los datos del alumno y el acudiente principal (
                            {enrollmentForm.primaryGuardian === 'father' ? 'padre' : 'madre'}
                            ) como responsable financiero.
                          </p>
                        </div>
                        <div className="academic-secretary__contracts-preview-grid">
                          <article className="academic-secretary__contract-card">
                            <div className="academic-secretary__contract-document">
                              <header className="academic-secretary__contract-header academic-secretary__contract-header--left">
                                <img alt="Millennium School" src={millenniumSchoolCrest} />
                                <h5>Contrato de matrícula 2026-2027</h5>
                              </header>
                              <div className="academic-secretary__contract-preview">
                                {parseEnrollmentContractSections(renderMillenniumEnrollmentContract(millenniumContractContext)).flatMap((section, sectionIndex) => {
                                  if (section.type === 'signature-block') {
                                    return [
                                      <MillenniumEnrollmentSignatureBlock
                                        context={millenniumContractContext}
                                        key={`contract-signature-${sectionIndex}`}
                                      />,
                                    ];
                                  }

                                  return splitContractParagraphs(section.content).map((paragraph, paragraphIndex) => (
                                    <p key={`contract-${sectionIndex}-${paragraphIndex}`}>{paragraph}</p>
                                  ));
                                })}
                              </div>
                            </div>
                          </article>
                          <article className="academic-secretary__contract-card">
                            <div className="academic-secretary__contract-document">
                              <div className="academic-secretary__contract-preview">
                                {parsePagareDocumentSections(renderMillenniumPagareContract(millenniumContractContext)).flatMap((section, sectionIndex) => {
                                  if (section.type === 'debtors-table') {
                                    const debtorColumns = getPagareDebtorColumns({
                                      father: enrollmentForm.father,
                                      mother: enrollmentForm.mother,
                                    });
                                    return [
                                      <MillenniumPagareDebtorsTable
                                        debtorOne={debtorColumns.debtorOne}
                                        debtorTwo={debtorColumns.debtorTwo}
                                        key={`pagare-table-${sectionIndex}`}
                                      />,
                                    ];
                                  }

                                  return splitContractParagraphs(section.content).map((paragraph, paragraphIndex) => (
                                    <p key={`pagare-${sectionIndex}-${paragraphIndex}`}>{paragraph}</p>
                                  ));
                                })}
                              </div>
                            </div>
                          </article>
                        </div>
                      </div>
                    ) : null}

                    <div className="academic-secretary__subform academic-secretary__subform--soft academic-secretary__medical-profile-form">
                      <h4>Ficha médica y autorización de medicamentos</h4>
                      <div className="academic-secretary__form-grid academic-secretary__form-grid--medical">
                        <label>Alergias o sensibilidad conocida<textarea required rows="3" value={medicalProfile.allergies || ''} onChange={(event) => updateEnrollmentStudentMedicalProfile(index, { allergies: event.target.value })} placeholder="Escribe Ninguna si no aplica" /></label>
                        <label>Condiciones médicas<textarea required rows="3" value={medicalProfile.chronicConditions || ''} onChange={(event) => updateEnrollmentStudentMedicalProfile(index, { chronicConditions: event.target.value })} placeholder="Asma, diabetes, convulsiones, cirugías, etc. Escribe Ninguna si no aplica" /></label>
                        <label>Medicamentos actuales<textarea required rows="3" value={medicalProfile.currentMedications || ''} onChange={(event) => updateEnrollmentStudentMedicalProfile(index, { currentMedications: event.target.value })} placeholder="Medicamentos que toma actualmente. Escribe Ninguno si no aplica" /></label>
                        <label>Restricciones alimentarias<textarea rows="3" value={medicalProfile.dietaryRestrictions || ''} onChange={(event) => updateEnrollmentStudentMedicalProfile(index, { dietaryRestrictions: event.target.value })} placeholder="Opcional" /></label>
                        <label>EPS / seguro médico<input value={medicalProfile.healthInsurance || ''} onChange={(event) => updateEnrollmentStudentMedicalProfile(index, { healthInsurance: event.target.value })} placeholder="Entidad o póliza" /></label>
                        <label>Contacto médico de emergencia<input required value={medicalProfile.emergencyMedicalContactName || ''} onChange={(event) => updateEnrollmentStudentMedicalProfile(index, { emergencyMedicalContactName: event.target.value })} placeholder="Nombre y parentesco" /></label>
                        <label>Teléfono contacto médico<input required value={medicalProfile.emergencyMedicalContactPhone || ''} onChange={(event) => updateEnrollmentStudentMedicalProfile(index, { emergencyMedicalContactPhone: event.target.value })} placeholder="Número de contacto" /></label>
                        <label>Médico tratante<input value={medicalProfile.physicianName || ''} onChange={(event) => updateEnrollmentStudentMedicalProfile(index, { physicianName: event.target.value })} placeholder="Opcional" /></label>
                        <label>Teléfono médico tratante<input value={medicalProfile.physicianPhone || ''} onChange={(event) => updateEnrollmentStudentMedicalProfile(index, { physicianPhone: event.target.value })} placeholder="Opcional" /></label>
                        <label>Autorización de medicamentos<select required value={medicationAuthorization.status || ''} onChange={(event) => updateEnrollmentStudentMedicationAuthorization(index, { status: event.target.value })}><option value="">Selecciona</option><option value="authorized">Autorizo suministro de medicamentos</option><option value="not_authorized">No autorizo suministro de medicamentos</option></select></label>
                        <label>Responsable que autoriza<input required value={medicationAuthorization.authorizedBy || ''} onChange={(event) => updateEnrollmentStudentMedicationAuthorization(index, { authorizedBy: event.target.value })} placeholder="Nombre del acudiente" /></label>
                        {medicationAuthorization.status === 'authorized' ? (
                          <>
                            <label>Medicamentos autorizados<textarea required rows="3" value={medicationAuthorization.authorizedMedications || ''} onChange={(event) => updateEnrollmentStudentMedicationAuthorization(index, { authorizedMedications: event.target.value })} placeholder="Medicamentos que la enfermería puede suministrar" /></label>
                            <label>Instrucciones de suministro<textarea required rows="3" value={medicationAuthorization.instructions || ''} onChange={(event) => updateEnrollmentStudentMedicationAuthorization(index, { instructions: event.target.value })} placeholder="Dosis, frecuencia, condiciones y restricciones" /></label>
                          </>
                        ) : null}
                        <label>Observaciones de autorización<textarea rows="3" value={medicationAuthorization.notes || ''} onChange={(event) => updateEnrollmentStudentMedicationAuthorization(index, { notes: event.target.value })} placeholder="Notas internas para enfermería" /></label>
                      </div>
                    </div>

                    <div className="academic-secretary__enrollment-student-layout">
                      <div className="academic-secretary__subform academic-secretary__subform--soft">
                        <h4>Plan financiero por alumno</h4>
                        <div className="academic-secretary__form-grid">
                          <label>Financiar bono en<select value={student.enrollmentBonusInstallments} onChange={(event) => updateEnrollmentStudent(index, { enrollmentBonusInstallments: event.target.value })}>{ACADEMIC_FINANCING_INSTALLMENT_OPTIONS.map((option) => <option key={`bonus-${option}`} value={option}>{option} {option === 1 ? 'mes' : 'meses'}</option>)}</select></label>
                          <label>Financiar matrícula en<select value={student.annualTuitionInstallments} onChange={(event) => updateEnrollmentStudent(index, { annualTuitionInstallments: event.target.value })}>{ACADEMIC_FINANCING_INSTALLMENT_OPTIONS.map((option) => <option key={`tuition-${option}`} value={option}>{option} {option === 1 ? 'mes' : 'meses'}</option>)}</select></label>
                          <label>Descuento adicional en matrícula (%)<input type="number" min="0" max="100" value={student.annualTuitionAdditionalDiscountPercent} onChange={(event) => updateEnrollmentStudent(index, { annualTuitionAdditionalDiscountPercent: event.target.value })} placeholder="0" /></label>
                          <label>Motivo del descuento en matrícula<input value={student.annualTuitionAdditionalDiscountLabel} onChange={(event) => updateEnrollmentStudent(index, { annualTuitionAdditionalDiscountLabel: event.target.value })} placeholder="Ej: Convenio familiar" /></label>
                          <label>Descuento adicional en pensión (%)<input type="number" min="0" max="100" value={student.monthlyTuitionAdditionalDiscountPercent} onChange={(event) => updateEnrollmentStudent(index, { monthlyTuitionAdditionalDiscountPercent: event.target.value })} placeholder="0" /></label>
                          <label>Motivo del descuento en pensión<input value={student.monthlyTuitionAdditionalDiscountLabel} onChange={(event) => updateEnrollmentStudent(index, { monthlyTuitionAdditionalDiscountLabel: event.target.value })} placeholder="Ej: Hermano adicional" /></label>
                        </div>
                      </div>

                      <div className="academic-secretary__enrollment-cost-card">
                        <div className="academic-secretary__enrollment-cost-head">
                          <h4>Costos del grado</h4>
                          <p>{student.grade ? `Configuración actual para ${formatGradeLabel(student.grade)}.` : 'Selecciona un grado para ver los costos aplicables.'}</p>
                        </div>

                        {selectedFeeSettingForStudent ? (
                          <>
                            <div className="academic-secretary__summary-grid academic-secretary__summary-grid--compact">
                              <div className="academic-secretary__mini-card"><span>Bono único</span><strong>{formatCurrency(selectedFeeSettingForStudent.enrollmentBonus || 0)}</strong></div>
                              <div className="academic-secretary__mini-card"><span>Matrícula anual base</span><strong>{formatCurrency(selectedFeeSettingForStudent.enrollmentFee || 0)}</strong></div>
                              <div className="academic-secretary__mini-card"><span>Matrícula según fecha de ingreso</span><strong>{formatCurrency(proratedEnrollmentFee.amount)}</strong></div>
                              <div className="academic-secretary__mini-card"><span>Recargo por matrícula tardía</span><strong>{formatCurrency(proratedEnrollmentFee.lateEnrollmentSurchargeAmount || 0)}</strong></div>
                              <div className="academic-secretary__mini-card"><span>Beneficio sobre matrícula</span><strong>{proratedEnrollmentFee.enrollmentBenefitDiscountAmount > 0 ? `-${formatCurrency(proratedEnrollmentFee.enrollmentBenefitDiscountAmount)}` : formatCurrency(0)}</strong></div>
                              <div className="academic-secretary__mini-card"><span>Pensión mensual</span><strong>{formatCurrency(selectedFeeSettingForStudent.monthlyTuition || 0)}</strong></div>
                              <div className="academic-secretary__mini-card"><span>Pensión con descuento adicional</span><strong>{formatCurrency(estimatedMonthlyTuition)}</strong></div>
                            </div>
                          </>
                        ) : (
                          <p className="academic-secretary__media-empty">Selecciona el grado del alumno para visualizar sus costos y plan financiero.</p>
                        )}
                      </div>
                    </div>

                    {selectedFeeSettingForStudent ? (
                      <div className="academic-secretary__simulation-panel academic-secretary__subform academic-secretary__subform--soft">
                        <h4>Simulación mensual de pagos</h4>
                        <div className="academic-secretary__simulation-controls">
                          <label>
                            Escenario de pensión
                            <select value={student.paymentSimulationRuleKey || 'full'} onChange={(event) => updateEnrollmentStudent(index, { paymentSimulationRuleKey: event.target.value })}>
                              {paymentSimulationOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}{option.value === 'full' ? '' : ` · ${option.startDay}-${option.endDay}`}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {monthlyPaymentSchedule.length ? (
                          <div className="academic-secretary__table-wrap academic-secretary__table-wrap--compact">
                            <table className="academic-secretary__table academic-secretary__table--simulation">
                              <thead>
                                <tr>
                                  <th>Mes</th>
                                  <th>Pensión aplicada</th>
                                  <th>Cuota matrícula</th>
                                  <th>Total del mes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {monthlyPaymentSchedule.map((row) => (
                                  <tr key={row.key}>
                                    <td>{row.monthLabel}</td>
                                    <td>{formatCurrency(row.monthlyTuitionAmount)}</td>
                                    <td>{formatCurrency(row.enrollmentInstallmentAmount)}</td>
                                    <td><strong>{formatCurrency(Number(row.monthlyTuitionAmount || 0) + Number(row.enrollmentInstallmentAmount || 0))}</strong></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="academic-secretary__media-empty">Selecciona un grado con costos configurados para ver la proyección mensual de pagos.</p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {!enrollmentEditingStudentId ? <div className="academic-secretary__inline-actions"><button className="btn" type="button" onClick={() => setEnrollmentForm((previous) => ({ ...previous, students: [...previous.students, createEmptyStudentDraft()] }))}>Agregar otro alumno</button></div> : null}
            <p>{enrollmentEditingStudentId ? 'Guarda los cambios del alumno y sus acudientes usando este formulario de matrícula.' : 'Los costos base del alumno salen del grado seleccionado. La fecha de ingreso prorratea automáticamente la matrícula según el calendario escolar definido en rectoría y puede sumar el recargo por matrícula tardía. La financiación del bono, la financiación de la matrícula y el descuento adicional en pensión quedan guardados por alumno en backend al crear la matrícula.'}</p>
            <div className="academic-secretary__actions"><button className="btn btn-primary" disabled={busy} type="submit">{enrollmentEditingStudentId ? 'Guardar cambios' : 'Crear matrícula'}</button></div>
          </form>
          <AcademicEnrolledStudentsPanel
            rows={filteredAcademicDatabase}
            totalCount={bootstrap.academicDatabase.length}
            filters={academicDatabaseFilters}
            levelOptions={academicDatabaseLevelOptions}
            gradeOptions={academicDatabaseGradeOptions}
            rowMetaById={academicDatabaseRowMetaById}
            busy={busy}
            formatGradeLabel={formatGradeLabel}
            onFilterChange={setAcademicDatabaseFilters}
            onEdit={onEditEnrollmentFromList}
          />
        </section>
      ) : null}

      {activeSection === 'assignments' && !isBillingPortal ? (
        <AcademicAssignmentsPanel
          assignments={bootstrap.calendarAssignments}
          busy={busy}
          gradeOptions={academicDatabaseGradeOptions}
          onArchive={handleArchiveCalendarAssignment}
          onCreate={handleCreateCalendarAssignment}
        />
      ) : null}

      {activeSection === 'routes' ? (
        <section className="academic-secretary__grid academic-secretary__grid--content">
          <article className="academic-secretary__panel">
            <div className="academic-secretary__panel-head">
              <div>
                <h2>Asignación de ruta escolar</h2>
                <p>Selecciona un usuario de ruta y agrega los alumnos que ese conductor recogerá.</p>
              </div>
              <button className="academic-secretary__refresh" disabled={routeAssignmentsLoading} onClick={loadSchoolRouteAssignments} type="button">Actualizar rutas</button>
            </div>

            {routeDrivers.length === 0 ? (
              <p>No hay usuarios con rol de ruta escolar para este colegio.</p>
            ) : (
              <form className="academic-secretary__form" onSubmit={onSubmitRouteAssignment}>
                <div className="academic-secretary__form-grid">
                  <label>
                    Conductor
                    <select value={selectedRouteDriver?.id || ''} onChange={(event) => setRouteAssignmentForm((previous) => ({ ...previous, driverUserId: event.target.value }))}>
                      {routeDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}{driver.username ? ` · ${driver.username}` : ''}</option>)}
                    </select>
                  </label>
                  <label>
                    Alumno
                    <select value={routeAssignmentForm.studentId} onChange={(event) => {
                      const student = assignableRouteStudents.find((item) => item.id === event.target.value);
                      setRouteAssignmentForm((previous) => ({
                        ...previous,
                        studentId: event.target.value,
                        pickupAddress: previous.pickupAddress || student?.address || '',
                      }));
                    }}>
                      <option value="">Selecciona alumno</option>
                      {assignableRouteStudents.map((student) => <option key={student.id} value={student.id}>{student.name} · {formatGradeLabel(student.grade)}{student.course ? ` · ${student.course}` : ''}</option>)}
                    </select>
                  </label>
                  <label>Dirección de recogida<input value={routeAssignmentForm.pickupAddress} onChange={(event) => setRouteAssignmentForm((previous) => ({ ...previous, pickupAddress: event.target.value }))} placeholder="Dirección registrada o punto de recogida" /></label>
                  <label>Nota para ruta<input value={routeAssignmentForm.notes} onChange={(event) => setRouteAssignmentForm((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Torre, portería, referencia" /></label>
                </div>
                <div className="academic-secretary__actions"><button className="btn btn-primary" disabled={busy || routeAssignmentsLoading || !selectedRouteDriver?.id || !routeAssignmentForm.studentId} type="submit">Agregar alumno a ruta</button></div>
              </form>
            )}
          </article>

          <article className="academic-secretary__panel">
            <div className="academic-secretary__panel-head"><div><h2>Ruta del conductor</h2><p>{selectedRouteDriver ? `${selectedRouteDriver.name} tiene ${selectedRouteStops.length} alumno(s) asignados.` : 'Selecciona un conductor para ver sus alumnos asignados.'}</p></div></div>
            <div className="academic-secretary__summary-grid academic-secretary__summary-grid--compact">
              <div className="academic-secretary__mini-card"><span>Conductores</span><strong>{routeDrivers.length}</strong></div>
              <div className="academic-secretary__mini-card is-accent"><span>Asignados</span><strong>{selectedRouteStops.length}</strong></div>
              <div className="academic-secretary__mini-card is-neutral"><span>Disponibles</span><strong>{assignableRouteStudents.length}</strong></div>
            </div>
            <div className="academic-secretary__table-wrap">
              <table className="academic-secretary__table">
                <thead><tr><th>Orden</th><th>Alumno</th><th>Dirección</th><th>Nota</th><th>Acciones</th></tr></thead>
                <tbody>
                  {selectedRouteStops.length === 0 ? <tr><td colSpan="5">Este conductor aún no tiene alumnos asignados.</td></tr> : selectedRouteStops.map((stop) => (
                    <tr key={stop.id}>
                      <td>{stop.order}</td>
                      <td><strong>{stop.studentName}</strong><div>{formatGradeLabel(stop.studentGrade)}{stop.studentCourse ? ` · ${stop.studentCourse}` : ''}</div></td>
                      <td><input value={stop.pickupAddress || ''} onChange={(event) => onChangeRouteStopDraft(stop.id, { pickupAddress: event.target.value })} /></td>
                      <td><input value={stop.notes || ''} onChange={(event) => onChangeRouteStopDraft(stop.id, { notes: event.target.value })} /></td>
                      <td>
                        <div className="academic-secretary__row-actions">
                          <button className="academic-secretary__promote-button" disabled={busy} onClick={() => onUpdateRouteStop(stop)} type="button">Guardar</button>
                          <button className="academic-secretary__row-icon-button" disabled={busy} onClick={() => onRemoveRouteStop(stop.id)} type="button">Quitar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activeSection === 'database' ? (
        <section className="academic-secretary__panel">
          <div className="academic-secretary__panel-head"><div><h2>Base de datos académica</h2><p>Ficha consolidada de alumnos y acudientes registrada desde matrículas.</p></div><div className="academic-secretary__badge-group"><span className="academic-secretary__badge">Mostrando {filteredAcademicDatabase.length} de {bootstrap.academicDatabase.length} estudiantes</span></div></div>
          <div className="academic-secretary__database-filters">
            <label>
              Filtrar por nivel educativo
              <select value={academicDatabaseFilters.level} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, level: event.target.value }))}>
                <option value="">Todos los niveles</option>
                {academicDatabaseLevelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Filtrar por grado
              <select value={academicDatabaseFilters.grade} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, grade: event.target.value }))}>
                <option value="">Todos los grados</option>
                {academicDatabaseGradeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Filtrar por curso
              <select value={academicDatabaseFilters.course} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, course: event.target.value }))}>
                <option value="">Todos los cursos</option>
                {academicDatabaseCourseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>
              Filtrar por alumno
              <input value={academicDatabaseFilters.student} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, student: event.target.value }))} placeholder="Nombre o apellido" />
            </label>
            <label>
              Filtrar por padre
              <input value={academicDatabaseFilters.father} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, father: event.target.value }))} placeholder="Nombre del padre" />
            </label>
            <label>
              Filtrar por madre
              <input value={academicDatabaseFilters.mother} onChange={(event) => setAcademicDatabaseFilters((previous) => ({ ...previous, mother: event.target.value }))} placeholder="Nombre de la madre" />
            </label>
          </div>
          <div className="academic-secretary__summary-grid academic-secretary__summary-grid--database">
            <article className="academic-secretary__mini-card is-neutral"><span>Total estudiantes</span><strong>{bootstrap.academicDatabase.length}</strong></article>
            {academicDatabaseLevelCounts.map((item) => <article className="academic-secretary__mini-card is-accent" key={item.key}><span>{item.label}</span><strong>{item.count}</strong></article>)}
          </div>
          <div className="academic-secretary__table-toolbar">
            <button className="academic-secretary__excel-button academic-secretary__excel-button--secondary" onClick={onDownloadAcademicDatabaseTemplate} type="button">
              <DownloadExcelIcon />
              <span>Plantilla migracion base de datos</span>
            </button>
            <button className="academic-secretary__excel-button academic-secretary__excel-button--secondary" disabled={busy} onClick={onOpenAcademicDatabaseImportPicker} type="button">
              <DownloadExcelIcon />
              <span>Migrar base de datos</span>
            </button>
            <button className="academic-secretary__excel-button" onClick={onDownloadAcademicDatabase} type="button">
              <DownloadExcelIcon />
              <span>Descargar Excel</span>
            </button>
          </div>
          <input
            ref={academicDatabaseImportInputRef}
            accept=".xlsx,.xls,.csv"
            onChange={onAcademicDatabaseImportSelected}
            style={{ display: 'none' }}
            type="file"
          />
          <div className="academic-secretary__table-wrap academic-secretary__table-wrap--database"><div className="academic-secretary__table-inner academic-secretary__table-inner--database"><table className="academic-secretary__table academic-secretary__table--database"><thead><tr><th>Nivel educativo</th><th><div className="academic-secretary__database-grade-head"><button className="academic-secretary__promote-button" disabled={busy} onClick={onRequestGradePromotion} type="button">Subir un grado</button><span>Grado</span></div></th><th>Curso</th><th>Apellidos</th><th>Nombres</th><th>Género</th><th>Tipo doc.</th><th>Número doc.</th><th>Fecha nacimiento</th><th>Edad</th><th>Tipo sangre</th><th>Lugar nacimiento</th><th>Dirección</th><th>Nombre madre</th><th>Tipo doc.</th><th>Número doc.</th><th>Teléfono madre</th><th>Correo madre</th><th>Nombre padre</th><th>Tipo doc.</th><th>Número doc.</th><th>Teléfono padre</th><th>Correo padre</th><th>Acciones</th></tr></thead><tbody>{bootstrap.academicDatabase.length === 0 ? <tr><td colSpan="24">Aún no hay alumnos registrados en la base académica.</td></tr> : filteredAcademicDatabase.length === 0 ? <tr><td colSpan="24">No hay registros que coincidan con los filtros actuales.</td></tr> : filteredAcademicDatabase.map((item) => { const rowId = String(item._id); const isEditing = editingAcademicRowId === rowId; const draft = academicDatabaseDrafts[rowId] || createAcademicDatabaseEditDraft(item); const rowMeta = academicDatabaseRowMetaById[rowId] || { levelLabel: 'Sin nivel', gradeLabel: formatGradeLabel(item.grade), courseLabel: String(item?.course || '').trim() || 'Sin curso' }; return <tr key={item._id}><td>{rowMeta.levelLabel}</td><td>{isEditing ? <input value={draft.grade} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'grade', event.target.value)} /> : rowMeta.gradeLabel}</td><td>{isEditing ? <input value={draft.course} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'course', event.target.value)} /> : rowMeta.courseLabel}</td><td>{isEditing ? <input value={draft.lastName} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'lastName', event.target.value)} /> : item.lastName}</td><td>{isEditing ? <input value={draft.firstName} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'firstName', event.target.value)} /> : item.firstName}</td><td>{isEditing ? <select value={draft.gender} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'gender', event.target.value)}><option value="">Selecciona</option><option value="female">Femenino</option><option value="male">Masculino</option><option value="other">Otro</option></select> : formatGenderLabel(item.gender)}</td><td>{isEditing ? <select value={draft.documentType} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'documentType', event.target.value)}><option value="">Selecciona</option><option value="TI">TI</option><option value="CC">CC</option><option value="CE">CE</option><option value="PP">PP</option><option value="NIT">NIT</option></select> : item.documentType}</td><td>{isEditing ? <input value={draft.documentNumber} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'documentNumber', event.target.value)} /> : item.documentNumber}</td><td>{isEditing ? <input type="date" value={draft.birthDate} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'birthDate', event.target.value)} /> : item.birthDate ? formatDate(item.birthDate) : 'Sin fecha'}</td><td>{item.age ?? ''}</td><td>{isEditing ? <input value={draft.bloodType} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'bloodType', event.target.value)} /> : item.bloodType}</td><td>{isEditing ? <input value={draft.birthPlace} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'birthPlace', event.target.value)} /> : item.birthPlace}</td><td>{isEditing ? <input value={draft.address} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'address', event.target.value)} /> : item.address}</td><td>{isEditing ? <input value={draft.motherName} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'motherName', event.target.value)} /> : item.motherName}</td><td>{isEditing ? <select value={draft.motherDocumentType} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'motherDocumentType', event.target.value)}><option value="">Selecciona</option><option value="CC">CC</option><option value="TI">TI</option><option value="CE">CE</option><option value="PP">PP</option><option value="NIT">NIT</option></select> : item.motherDocumentType}</td><td>{isEditing ? <input value={draft.motherDocumentNumber} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'motherDocumentNumber', event.target.value)} /> : item.motherDocumentNumber}</td><td>{isEditing ? <input value={draft.motherPhone} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'motherPhone', event.target.value)} /> : item.motherPhone}</td><td>{isEditing ? <input value={draft.motherEmail} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'motherEmail', event.target.value)} /> : item.motherEmail}</td><td>{isEditing ? <input value={draft.fatherName} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'fatherName', event.target.value)} /> : item.fatherName}</td><td>{isEditing ? <select value={draft.fatherDocumentType} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'fatherDocumentType', event.target.value)}><option value="">Selecciona</option><option value="CC">CC</option><option value="TI">TI</option><option value="CE">CE</option><option value="PP">PP</option><option value="NIT">NIT</option></select> : item.fatherDocumentType}</td><td>{isEditing ? <input value={draft.fatherDocumentNumber} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'fatherDocumentNumber', event.target.value)} /> : item.fatherDocumentNumber}</td><td>{isEditing ? <input value={draft.fatherPhone} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'fatherPhone', event.target.value)} /> : item.fatherPhone}</td><td>{isEditing ? <input value={draft.fatherEmail} onChange={(event) => onChangeAcademicDatabaseDraft(rowId, 'fatherEmail', event.target.value)} /> : item.fatherEmail}</td><td><div className="academic-secretary__row-actions"><button aria-label="Editar fila" className="academic-secretary__row-icon-button" onClick={() => onEditAcademicDatabaseRow(item)} type="button"><PencilIcon /></button><button aria-label="Guardar fila" className="academic-secretary__row-icon-button is-primary" disabled={!isEditing || busy} onClick={() => onSaveAcademicDatabaseRow(item)} type="button"><SaveIcon /></button></div></td></tr>; })}</tbody></table></div></div>
        </section>
      ) : null}

      {activeSection === 'approvals' ? (
        <section className="academic-secretary__grid academic-secretary__grid--content">
          <article className="academic-secretary__panel">
            <div className="academic-secretary__panel-head"><div><h2>Solicitudes docentes</h2><p>Publicaciones al feed de padres que requieren visto bueno.</p></div><div className="academic-secretary__badge-group"><span className="academic-secretary__badge">Pendientes {bootstrap.communicationRequestCounts?.pending || 0}</span><span className="academic-secretary__badge is-muted">Aprobadas {bootstrap.communicationRequestCounts?.approved || 0}</span></div></div>
            <div className="academic-secretary__request-list">{pendingRequests.length === 0 ? <p>No hay solicitudes docentes pendientes.</p> : pendingRequests.map((item) => <button className={`academic-secretary__request-card${selectedRequest?._id === item._id ? ' is-active' : ''}`} key={item._id} onClick={() => setSelectedRequestId(item._id)} type="button"><strong>{item.title}</strong><span>{item.teacherName}</span><span className="academic-secretary__request-grade">Curso: {formatRequestedCourseTargets(item.courseTargets, item.courseTitle)}</span>{item.gradeTargets?.length ? <span className="academic-secretary__request-grade">Grado docente: {formatGradeLabel(item.gradeTargets[0])}</span> : null}<small>{item.audienceType} · {formatDateTime(item.submittedAt)}</small></button>)}</div>
          </article>
          <article className="academic-secretary__panel">
            {!selectedRequest ? <p>No hay una solicitud seleccionada.</p> : <div className="academic-secretary__approval-editor"><div className="academic-secretary__approval-meta"><h2>Editar antes de publicar</h2><p>Solicitud de <strong>{selectedRequest.teacherName}</strong>{selectedRequest.courseTitle ? ` · ${selectedRequest.courseTitle}` : ''}</p><div className="academic-secretary__meta-pills"><span>{approvalDraft.audienceType}</span><span>Curso solicitado: {formatRequestedCourseTargets(selectedRequest.courseTargets, selectedRequest.courseTitle)}</span>{selectedRequest.gradeTargets?.length ? <span>Grado docente: {formatGradeLabel(selectedRequest.gradeTargets[0])}</span> : null}{approvalDraft.courseTargets?.length ? <span>Curso publicación: {approvalDraft.courseTargets.join(', ')}</span> : null}</div></div><div className="academic-secretary__approval-columns"><div className="academic-secretary__subform"><h4>Original docente</h4><label>Título<input disabled value={selectedRequest.originalTitle || selectedRequest.title || ''} readOnly /></label><label>Mensaje<textarea disabled readOnly value={selectedRequest.originalBody || selectedRequest.body || ''} /></label><label>Curso solicitado por el docente<input disabled readOnly value={formatRequestedCourseTargets(selectedRequest.courseTargets, selectedRequest.courseTitle)} /></label><div className="academic-secretary__subform academic-secretary__subform--embedded"><h4>Adjuntos del docente</h4><AcademicSecretaryMediaPreview items={selectedRequest.media || []} /></div></div><form className="academic-secretary__subform" onSubmit={(event) => event.preventDefault()}><h4>Versión secretaría</h4><label>Título<input value={approvalDraft.title} onChange={(event) => setApprovalDraft((previous) => ({ ...previous, title: event.target.value }))} /></label><label>Mensaje<textarea value={approvalDraft.body} onChange={(event) => setApprovalDraft((previous) => ({ ...previous, body: event.target.value }))} /></label><div className="academic-secretary__form-grid"><label>Filtro de audiencia<select value={approvalDraft.audienceType} onChange={(event) => setApprovalDraft((previous) => ({ ...previous, audienceType: event.target.value, gradeTargets: event.target.value === 'grade' ? previous.gradeTargets : [], courseTargets: event.target.value === 'course' ? previous.courseTargets : [], parentTargets: event.target.value === 'individual' ? previous.parentTargets : [], studentTargets: event.target.value === 'individual' ? previous.studentTargets : [] }))}><option value="general">General</option><option value="grade">Por grado</option><option value="course">Por curso</option><option value="individual">Individual</option></select></label>{approvalDraft.audienceType === 'grade' ? <label>Grado a publicar<select value={approvalDraft.gradeTargets?.[0] || ''} onChange={(event) => setApprovalDraft((previous) => ({ ...previous, gradeTargets: event.target.value ? [event.target.value] : [] }))}><option value="">Selecciona grado</option>{gradeCatalog.map((grade) => <option key={grade.value} value={grade.value}>{grade.label}</option>)}</select></label> : null}{approvalDraft.audienceType === 'course' ? <label>Curso a publicar<select value={approvalDraft.courseTargets?.[0] || ''} onChange={(event) => setApprovalDraft((previous) => ({ ...previous, courseTargets: event.target.value ? [event.target.value] : [] }))}><option value="">Selecciona curso</option>{courseOptions.map((course) => <option key={course.value} value={course.value}>{course.label}</option>)}</select></label> : null}</div>{approvalDraft.audienceType === 'individual' ? <div className="academic-secretary__form-grid"><label>Acudientes<select className="academic-secretary__multi-select" multiple value={approvalDraft.parentTargets || []} onChange={(event) => onMultiSelectChange(event, 'parentTargets', setApprovalDraft)}>{parentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Alumnos<select className="academic-secretary__multi-select" multiple value={approvalDraft.studentTargets || []} onChange={(event) => onMultiSelectChange(event, 'studentTargets', setApprovalDraft)}>{studentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div> : null}<div className="academic-secretary__subform academic-secretary__subform--embedded"><h4>Adjuntos a publicar</h4><AcademicSecretaryMediaPreview items={approvalDraft.media || []} /></div><label>Notas de revisión<textarea value={approvalDraft.reviewNotes} onChange={(event) => setApprovalDraft((previous) => ({ ...previous, reviewNotes: event.target.value }))} /></label><div className="academic-secretary__actions"><button className="btn btn-primary" disabled={busy} onClick={onApproveRequest} type="button">Aprobar y publicar</button><button className="btn btn-outline" disabled={busy} onClick={onRejectRequest} type="button">Rechazar</button></div></form></div></div>}
          </article>
        </section>
      ) : null}

      {deleteCommunicationModal.open ? (
        <div className="academic-secretary__modal-overlay" role="dialog" aria-modal="true" aria-label="Eliminar comunicado">
          <div className="academic-secretary__modal-card academic-secretary__modal-card--danger">
            <div className="academic-secretary__panel-head">
              <div>
                <span className="academic-secretary__eyebrow academic-secretary__modal-eyebrow">Historial de comunicados</span>
                <h2>Eliminar publicación</h2>
                <p>Esta acción retira el comunicado del historial y del feed académico de padres.</p>
              </div>
              <button className="academic-secretary__message-close" disabled={busy} onClick={closeDeleteCommunicationModal} type="button"><CloseIcon /></button>
            </div>
            <div className="academic-secretary__delete-summary">
              <span>Comunicado seleccionado</span>
              <strong>{deleteCommunicationModal.item?.title || 'Comunicado sin título'}</strong>
              <p>{deleteCommunicationModal.item?.body || 'Sin mensaje registrado.'}</p>
            </div>
            <div className="academic-secretary__actions academic-secretary__actions--end">
              <button className="btn btn-outline" disabled={busy} onClick={closeDeleteCommunicationModal} type="button">Cancelar</button>
              <button className="btn academic-secretary__danger-button" disabled={busy} onClick={onConfirmDeleteCommunication} type="button">{busy ? 'Eliminando...' : 'Eliminar comunicado'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {communicationEngagementModal.open ? (
        <div className="academic-secretary__modal-overlay" role="dialog" aria-modal="true" aria-label="Interacciones del comunicado">
          <div className="academic-secretary__modal-card">
            <div className="academic-secretary__panel-head">
              <div>
                <span className="academic-secretary__eyebrow academic-secretary__modal-eyebrow">Comunicados</span>
                <h2>{communicationEngagementModal.type === 'likes' ? 'Likes' : 'Comentarios'}</h2>
                <p>{communicationEngagementModal.item?.title || 'Comunicado seleccionado'}</p>
              </div>
              <button className="academic-secretary__message-close" disabled={busy} onClick={closeCommunicationEngagementModal} type="button"><CloseIcon /></button>
            </div>
            {communicationEngagementModal.type === 'likes' ? (
              <div className="academic-secretary__engagement-list">
                {(communicationEngagementModal.item?.likes || []).length ? communicationEngagementModal.item.likes.map((like) => (
                  <article key={`${like.userId}-${like.createdAt || ''}`}><strong>{like.name || 'Acudiente'}</strong><span>{formatDateTime(like.createdAt)}</span></article>
                )) : <p>No hay likes en esta publicación.</p>}
              </div>
            ) : (
              <div className="academic-secretary__engagement-list">
                {(communicationEngagementModal.item?.comments || []).length ? communicationEngagementModal.item.comments.map((comment) => (
                  <article key={comment.id}>
                    <div><strong>{comment.name || 'Acudiente'}</strong><span>{formatDateTime(comment.createdAt)} · {comment.likesCount || 0} likes</span></div>
                    <p>{comment.body}</p>
                    <button className="academic-secretary__text-danger-button" disabled={busy} onClick={() => openDeleteCommunicationCommentModal(communicationEngagementModal.item, comment)} type="button">Borrar comentario</button>
                  </article>
                )) : <p>No hay comentarios en esta publicación.</p>}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {deleteCommentModal.open ? (
        <BrandConfirmModal
          confirmLabel="Borrar"
          eyebrow="Comergio Campus"
          loading={busy}
          message="Esta acción eliminará el comentario del comunicado para los usuarios que pueden verlo."
          onCancel={closeDeleteCommunicationCommentModal}
          onConfirm={onDeleteCommunicationComment}
          title="¿Borrar este comentario?"
        />
      ) : null}

      {deleteAuthorModal.open ? (
        <BrandConfirmModal
          confirmLabel="Eliminar"
          eyebrow="Autores de comunicados"
          loading={busy}
          message={`Los comunicados ya enviados conservarán la firma de ${deleteAuthorModal.author?.name || 'este autor'}.`}
          onCancel={closeDeleteCommunicationAuthorModal}
          onConfirm={onDeleteCommunicationAuthor}
          title={`¿Eliminar el autor ${deleteAuthorModal.author?.name || 'seleccionado'}?`}
        />
      ) : null}

      {billingPaymentModal.open ? (
        <div className="academic-secretary__modal-overlay" role="dialog" aria-modal="true" aria-label="Registrar pago de pension">
          <div className="academic-secretary__modal-card academic-secretary__modal-card--payment">
            <div className="academic-secretary__panel-head">
              <div>
                <span className="academic-secretary__eyebrow academic-secretary__modal-eyebrow">Cartera</span>
                <h2>Registrar pago</h2>
                <p>{billingPaymentModal.row?.monthLabel || selectedBillingAccount?.studentName || 'Alumno seleccionado'}</p>
              </div>
              <button className="academic-secretary__message-close" disabled={busy} onClick={closeBillingPaymentModal} type="button"><CloseIcon /></button>
            </div>
            <form className="academic-secretary__billing-payment-form" onSubmit={onSubmitBillingPayment}>
              <label>
                Cargo pendiente
                <select
                  disabled={busy || (!selectedBillingPendingCharges.length && !billingPaymentModal.row)}
                  onChange={(event) => {
                    const nextCharge = selectedBillingPendingCharges.find((charge) => String(charge._id) === event.target.value);
                    setBillingPaymentDraft((previous) => ({ ...previous, chargeId: event.target.value, amount: nextCharge ? String(Math.round(Number(nextCharge.amount || 0))) : '' }));
                  }}
                  value={billingPaymentDraft.chargeId}
                >
                  {billingPaymentModal.row && !billingPaymentDraft.chargeId ? <option value="">Se creará cargo: {billingPaymentModal.row.concept || billingPaymentModal.row.monthLabel}</option> : null}
                  {selectedBillingPendingCharges.length === 0 && !billingPaymentModal.row ? <option value="">Sin cargos pendientes</option> : null}
                  {selectedBillingPendingCharges.map((charge) => (
                    <option key={charge._id} value={charge._id}>{charge.concept} · {formatCurrency(charge.amount)}</option>
                  ))}
                </select>
              </label>
              <div className="academic-secretary__form-row">
                <label>
                  Valor recibido
                  <input disabled={!billingPaymentModalCanSubmit || busy} min="1" onChange={(event) => setBillingPaymentDraft((previous) => ({ ...previous, amount: event.target.value }))} type="number" value={billingPaymentDraft.amount} />
                </label>
                <label>
                  Medio de pago
                  <select disabled={!billingPaymentModalCanSubmit || busy} onChange={(event) => setBillingPaymentDraft((previous) => ({ ...previous, method: event.target.value }))} value={billingPaymentDraft.method}>
                    {BILLING_PAYMENT_METHOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <label>
                Fecha de pago
                <input disabled={!billingPaymentModalCanSubmit || busy} onChange={(event) => setBillingPaymentDraft((previous) => ({ ...previous, paidAt: event.target.value }))} type="date" value={billingPaymentDraft.paidAt} />
              </label>
              <label>
                Nota o referencia
                <textarea disabled={!billingPaymentModalCanSubmit || busy} onChange={(event) => setBillingPaymentDraft((previous) => ({ ...previous, notes: event.target.value }))} placeholder="Referencia de transferencia, voucher de datáfono o nota interna" value={billingPaymentDraft.notes} />
              </label>
              <div className="academic-secretary__actions"><button className="btn btn-outline" disabled={busy} onClick={closeBillingPaymentModal} type="button">Cancelar</button><button className="btn btn-primary" disabled={!billingPaymentModalCanSubmit || busy} type="submit">{busy ? 'Guardando...' : 'Registrar pago'}</button></div>
            </form>
          </div>
        </div>
      ) : null}

      {billingPaymentDetailModal.open ? (() => {
        const row = billingPaymentDetailModal.row || {};
        const paymentDetails = Array.isArray(row.paymentDetails) && row.paymentDetails.length
          ? row.paymentDetails
          : [{ amount: row.paidAmount, methodLabel: row.paymentMethodLabel, paidAt: row.paidAt, notes: row.paymentNotes }];

        return (
          <div className="academic-secretary__modal-overlay" role="dialog" aria-modal="true" aria-label="Detalle de pago registrado">
            <div className="academic-secretary__modal-card academic-secretary__modal-card--payment">
              <div className="academic-secretary__panel-head">
                <div>
                  <span className="academic-secretary__eyebrow academic-secretary__modal-eyebrow">Pago registrado</span>
                  <h2>{row.concept || row.monthLabel || 'Pago académico'}</h2>
                  <p>{row.monthLabel || selectedBillingAccount?.studentName || 'Alumno seleccionado'}</p>
                </div>
                <button className="academic-secretary__message-close" onClick={closeBillingPaymentDetailModal} type="button"><CloseIcon /></button>
              </div>
              <div className="academic-secretary__payment-detail-summary">
                <div><span>Valor pagado</span><strong>{formatCurrency(row.paidAmount || row.chargeAmount || 0)}</strong></div>
                <div><span>Fecha</span><strong>{row.paidAt ? formatDate(row.paidAt) : '-'}</strong></div>
                <div><span>Medio</span><strong>{row.paymentMethodLabel || '-'}</strong></div>
              </div>
              <div className="academic-secretary__billing-ledger-list">
                {paymentDetails.map((payment, index) => (
                  <div className="academic-secretary__billing-ledger-item" key={payment._id || `payment-detail-${index}`}>
                    <div><strong>{formatDate(payment.paidAt)}</strong><span>{payment.methodLabel || labelBillingPaymentMethod(payment.method) || 'Medio no registrado'}</span>{payment.notes ? <small>{payment.notes}</small> : null}</div>
                    <strong>{formatCurrency(payment.amount || 0)}</strong>
                  </div>
                ))}
              </div>
              <div className="academic-secretary__actions"><button className="btn btn-primary" onClick={closeBillingPaymentDetailModal} type="button">Cerrar</button></div>
            </div>
          </div>
        );
      })() : null}

      {followUpModal.open ? (
        <div className="academic-secretary__modal-overlay" role="dialog" aria-modal="true" aria-label={followUpModal.type === 'manual_note' ? 'Registrar nota manual' : 'Enviar push y correo'}>
          <div className="academic-secretary__modal-card">
            <div className="academic-secretary__panel-head">
              <div>
                <span className="academic-secretary__eyebrow academic-secretary__modal-eyebrow">Seguimiento de cartera</span>
                <h2>{followUpModal.type === 'manual_note' ? 'Registrar nota manual' : 'Enviar push y correo'}</h2>
                <p>{followUpModal.item?.parentName || 'Acudiente'}</p>
              </div>
              <button className="academic-secretary__message-close" disabled={busy} onClick={closeFollowUpModal} type="button"><CloseIcon /></button>
            </div>
            <form className="academic-secretary__form" onSubmit={onSubmitFollowUp}>
              <label>Titulo<input required value={followUpModal.title} onChange={(event) => setFollowUpModal((previous) => ({ ...previous, title: event.target.value }))} /></label>
              <label>{followUpModal.type === 'manual_note' ? 'Detalle del seguimiento' : 'Texto del mensaje'}<textarea required value={followUpModal.body} onChange={(event) => setFollowUpModal((previous) => ({ ...previous, body: event.target.value }))} /></label>
              <div className="academic-secretary__actions"><button className="btn btn-outline" disabled={busy} onClick={closeFollowUpModal} type="button">Cancelar</button><button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Guardando...' : 'Enviar'}</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default AcademicSecretaryDashboard;