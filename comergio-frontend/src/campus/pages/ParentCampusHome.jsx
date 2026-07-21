import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import ParentNotificationCenter from '../../components/parent/ParentNotificationCenter';
import { LOGIN_PATH } from '../../lib/authNavigation';
import { ComergioBrandTitle } from '../../components/ComergioBrandTitle';
import femImage from '../../assets/fem.png';
import informesImage from '../../assets/informes.png';
import spellingImage from '../../assets/spelling.png';
import ParentPullToRefreshIndicator from '../../components/ParentPullToRefreshIndicator';
import {
  ParentFeedEmptyState,
  ParentFeedLoadingSkeleton,
  ParentPortalEmptyStudentsState,
} from '../../components/ParentPortalExperienceStates';
import { ColibriBootSplash } from '../../components/ColibriBootSplash';
import ParentStudentMedicalProfilePanel from '../../components/ParentStudentMedicalProfilePanel';
import CommunityReportFab from '../../components/community/CommunityReportFab';
import { useParentPullToRefresh } from '../../hooks/useParentPullToRefresh';
import { useFloatingBottomNavSize } from '../../hooks/useFloatingBottomNavSize';
import { useStudentGamesAvailable } from '../../hooks/useStudentGamesAvailable';
import useAuthStore from '../../store/auth.store';
import ParentPortal from '../../pages/ParentPortal';
import {
  createCommunityPublication,
  createParentAcademicFeedComment,
  deleteParentAcademicFeedComment,
  getParentAcademicAttendance,
  getParentAcademicCalendar,
  getParentAcademicBilling,
  getParentAcademicFeed,
  getParentPortalOverview,
  payParentAcademicCharge,
  toggleParentAcademicFeedCommentLike,
  toggleParentAcademicFeedLike,
  uploadCommunityPublicationMedia,
} from '../../services/parent.service';
import StudentAssignmentsPanel from '../components/StudentAssignmentsPanel';
import TeacherCameraCapture from '../components/TeacherCameraCapture';
import { getParentNursingRecords } from '../../services/nursing.service';
import { getParentPsychologyRecords } from '../../services/psychology.service';
import { getSchoolDisplayName } from '../../lib/schools';
import { resolveApiAssetUrl } from '../../lib/api';
import { formatEducationalGradeLabel, isRawInternalGradeToken } from '../../lib/educationalGradeLabels';
import { readParentNotificationLaunchParams } from '../../lib/parentNotificationNavigation';
import {
  buildParentRoutedSectionPath,
  buildParentSectionNavigateTarget,
  resolveParentSectionFromSearch,
  shouldUseParentQuerySectionRouting,
} from '../../lib/parentSectionRouting';
import {
  MatriculaEnrollmentFlow,
} from '../../components/enrollment-matricula';
import {
  getEnrollmentMatriculaPendingSignatures,
  getEnrollmentMatriculaProcess,
  getEnrollmentMatriculaPaymentStatus,
  getEnrollmentMatriculaRequirement,
  getWompiMatriculaPaymentStatus,
} from '../../services/enrollmentMatricula.service';
import { isMillenniumSchool, shouldHideParentEnrollmentPaymentAmount } from '../../lib/millenniumEnrollmentContracts';
import { getStudentPortalOverview, getStudentAcademicCalendar, getStudentAcademicAttendance } from '../../services/studentPortal.service';
import { mapStudentPortalOverviewToParentOverview } from '../../lib/studentPortalOverview';
import ColibriFlappyGame from '../../components/games/ColibriFlappyGame';
import colibriGameCover from '../../assets/colibrisinfondo.png';

const parentAppSections = [
  { key: 'home', label: 'Inicio', icon: 'home' },
  { key: 'finance', label: 'Cartera', icon: 'money' },
  { key: 'academic', label: 'Academico', icon: 'book' },
  { key: 'cafeteria', label: 'Comida', icon: 'food' },
  { key: 'games', label: 'Juegos', icon: 'game' },
  { key: 'nursing', label: 'Enfermeria', icon: 'nursing' },
  { key: 'transport', label: 'Ruta', icon: 'transport' },
];

const defaultParentAppFeatures = {
  home: true,
  finance: true,
  academic: true,
  cafeteria: true,
  games: false,
  nursing: true,
  wellbeing: true,
  coexistence: true,
  transport: true,
};

const parentCareFeatureKeys = ['nursing', 'wellbeing', 'coexistence'];

const routedParentSectionSuffixes = {
  home: '',
  academic: '/academic',
  cafeteria: '/cafeteria',
  finance: '/finance',
  games: '/juegos',
  nursing: '/enfermeria',
  wellbeing: '/wellbeing',
  coexistence: '/coexistence',
  transport: '/transport',
};

const legacyCafeteriaRoutePrefixes = ['/orders', '/wallet', '/topups'];
const PARENT_FEED_ALL_CHILDREN_ID = '__all_parent_children__';

function normalizeRouteBase(routeBase) {
  const normalizedBase = String(routeBase || '').trim();
  if (!normalizedBase) {
    return '';
  }

  const baseWithLeadingSlash = normalizedBase.startsWith('/') ? normalizedBase : `/${normalizedBase}`;
  return baseWithLeadingSlash.replace(/\/+$/, '');
}

function buildRoutedSectionPath(routeBase, sectionKey) {
  const normalizedBase = normalizeRouteBase(routeBase);
  const suffix = routedParentSectionSuffixes[sectionKey] ?? '';

  if (!normalizedBase) {
    return '';
  }

  return suffix ? `${normalizedBase}${suffix}` : normalizedBase;
}

function normalizeParentAppFeatures(rawFeatures = {}) {
  return Object.keys(defaultParentAppFeatures).reduce((features, key) => {
    features[key] = rawFeatures[key] === undefined ? defaultParentAppFeatures[key] : Boolean(rawFeatures[key]);
    return features;
  }, {});
}

function isParentSectionEnabled(sectionKey, features = defaultParentAppFeatures) {
  if (parentCareFeatureKeys.includes(sectionKey)) {
    return parentCareFeatureKeys.some((key) => features[key] !== false);
  }

  return features[sectionKey] !== false;
}

function getFirstEnabledParentSection(features = defaultParentAppFeatures) {
  const firstSection = parentAppSections.find((section) => isParentSectionEnabled(section.key, features));
  return firstSection?.key || 'home';
}

function resolveRoutedSection(pathname, routeBase) {
  const normalizedBase = normalizeRouteBase(routeBase);
  if (!normalizedBase) {
    return 'home';
  }

  const normalizedPathname = String(pathname || '').trim();
  if (!normalizedPathname.startsWith(normalizedBase)) {
    return 'home';
  }

  if (normalizedPathname.startsWith(`${buildRoutedSectionPath(normalizedBase, 'cafeteria')}/`) || normalizedPathname === buildRoutedSectionPath(normalizedBase, 'cafeteria')) {
    return 'cafeteria';
  }

  if (normalizedPathname.startsWith(`${buildRoutedSectionPath(normalizedBase, 'finance')}/`) || normalizedPathname === buildRoutedSectionPath(normalizedBase, 'finance')) {
    return 'finance';
  }

  if (normalizedPathname.startsWith(`${buildRoutedSectionPath(normalizedBase, 'academic')}/`) || normalizedPathname === buildRoutedSectionPath(normalizedBase, 'academic')) {
    return 'academic';
  }

  const legacyCarePath = `${normalizedBase}/care`;
  if (normalizedPathname.startsWith(`${buildRoutedSectionPath(normalizedBase, 'nursing')}/`) || normalizedPathname === buildRoutedSectionPath(normalizedBase, 'nursing') || normalizedPathname.startsWith(`${legacyCarePath}/`) || normalizedPathname === legacyCarePath) {
    return 'nursing';
  }

  if (normalizedPathname.startsWith(`${buildRoutedSectionPath(normalizedBase, 'wellbeing')}/`) || normalizedPathname === buildRoutedSectionPath(normalizedBase, 'wellbeing')) {
    return 'wellbeing';
  }

  if (normalizedPathname.startsWith(`${buildRoutedSectionPath(normalizedBase, 'coexistence')}/`) || normalizedPathname === buildRoutedSectionPath(normalizedBase, 'coexistence')) {
    return 'coexistence';
  }

  if (normalizedPathname.startsWith(`${buildRoutedSectionPath(normalizedBase, 'transport')}/`) || normalizedPathname === buildRoutedSectionPath(normalizedBase, 'transport')) {
    return 'transport';
  }

  if (normalizedPathname.startsWith(`${buildRoutedSectionPath(normalizedBase, 'games')}/`) || normalizedPathname === buildRoutedSectionPath(normalizedBase, 'games')) {
    return 'games';
  }

  return 'home';
}

function remapLegacyParentPath(pathname, routeBase) {
  const normalizedBase = normalizeRouteBase(routeBase);
  const normalizedPathname = String(pathname || '').trim();
  const cafeteriaBasePath = buildRoutedSectionPath(normalizedBase, 'cafeteria');

  for (const legacyPrefix of legacyCafeteriaRoutePrefixes) {
    const absoluteLegacyPrefix = `${normalizedBase}${legacyPrefix}`;
    if (normalizedPathname === absoluteLegacyPrefix || normalizedPathname.startsWith(`${absoluteLegacyPrefix}/`)) {
      return normalizedPathname.replace(absoluteLegacyPrefix, `${cafeteriaBasePath}${legacyPrefix}`);
    }
  }

  return '';
}

const academicMenuItems = [
  {
    id: 'academic-performance',
    title: 'Desempeño',
    navShortTitle: 'Desempeño',
    description: 'Dashboard académico, promedio general, rendimiento por materia, evolución y ranking en el curso.',
    icon: 'performance',
  },
  {
    id: 'academic-assignments',
    title: 'Asignaciones',
    navShortTitle: 'Asignaciones',
    description: 'Tareas y actividades publicadas por tus docentes, con materiales y entregas.',
    icon: 'tasks',
  },
  {
    id: 'academic-attendance',
    title: 'Asistencia',
    navShortTitle: 'Asistencia',
    icon: 'attendance',
  },
  {
    id: 'academic-grades',
    title: 'Calificaciones',
    navShortTitle: 'Notas',
    icon: 'grades',
  },
  {
    id: 'academic-calendar',
    title: 'Calendario escolar',
    navShortTitle: 'Calendario',
    description: 'Exámenes próximos, entregas de trabajos, eventos del colegio y días sin clase.',
    icon: 'calendar',
  },
  {
    id: 'academic-schedule',
    title: 'Horario de clase',
    navShortTitle: 'Horario',
    icon: 'schedule',
  },
];

const parentCareMenuItems = [
  { id: 'nursing', title: 'Enfermería', icon: 'nursing' },
  { id: 'wellbeing', title: 'Bienestar', icon: 'wellbeing' },
  { id: 'coexistence', title: 'Convivencia', icon: 'coexistence' },
];

function formatGrade(value) {
  if (value === null || value === undefined || value === '') {
    return 'Sin nota';
  }
  return `${Math.round(Number(value) || 0)}/100`;
}

const parentGradePerformancePalette = [
  { min: 96, max: 100, color: '#166534' },
  { min: 90, max: 95, color: '#15803d' },
  { min: 80, max: 89, color: '#65a30d' },
  { min: 70, max: 79, color: '#eab308' },
  { min: 60, max: 69, color: '#f97316' },
  { min: 0, max: 59, color: '#ef4444' },
];

function normalizePerformanceHexColor(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#[0-9a-f]{6}$/i.test(withHash)) {
    return withHash.toLowerCase();
  }

  if (/^#[0-9a-f]{3}$/i.test(withHash)) {
    const hex = withHash.slice(1);
    return `#${hex.split('').map((channel) => channel + channel).join('')}`.toLowerCase();
  }

  return '';
}

function resolvePerformanceLevelForAverage(average, gradingScale = null) {
  if (average === null || average === undefined || average === '') {
    return null;
  }

  const numericAverage = Number(average);
  if (!Number.isFinite(numericAverage)) {
    return null;
  }

  return (Array.isArray(gradingScale?.performanceLevels) ? gradingScale.performanceLevels : [])
    .find((level) => numericAverage >= Number(level.minScore) && numericAverage <= Number(level.maxScore)) || null;
}

function resolveAcademicPerformanceLevel(selectedChild, average) {
  const fromOverview = selectedChild?.academicPerformanceLevel || null;
  const overviewColor = normalizePerformanceHexColor(fromOverview?.color);
  if (overviewColor) {
    return { ...fromOverview, color: overviewColor };
  }

  const fromScale = resolvePerformanceLevelForAverage(average, selectedChild?.academicGradingScale);
  if (fromScale) {
    return {
      key: fromScale.key,
      label: fromScale.label,
      color: normalizePerformanceHexColor(fromScale.color) || fromScale.color,
      minScore: fromScale.minScore,
      maxScore: fromScale.maxScore,
    };
  }

  if (fromOverview?.label || fromOverview?.key) {
    return fromOverview;
  }

  return null;
}

function getParentSubjectCardColor(subject = {}) {
  const explicitColor = normalizePerformanceHexColor(subject.color || subject.performanceLevel?.color);
  if (explicitColor) {
    return explicitColor;
  }

  if (subject.finalAverage === null || subject.finalAverage === undefined || subject.finalAverage === '') {
    return '';
  }

  const score = Number(subject.finalAverage);
  if (!Number.isFinite(score)) {
    return '';
  }

  return parentGradePerformancePalette.find((range) => score >= range.min && score <= range.max)?.color || '#174a68';
}

function sortParentGradebookSubjects(subjects = []) {
  return [...(Array.isArray(subjects) ? subjects : [])].sort((left, right) => {
    const leftHasGrade = left?.finalAverage !== null && left?.finalAverage !== undefined;
    const rightHasGrade = right?.finalAverage !== null && right?.finalAverage !== undefined;

    if (leftHasGrade !== rightHasGrade) {
      return leftHasGrade ? -1 : 1;
    }

    if (leftHasGrade && rightHasGrade && Number(right.finalAverage) !== Number(left.finalAverage)) {
      return Number(right.finalAverage) - Number(left.finalAverage);
    }

    return String(left?.name || '').localeCompare(String(right?.name || ''));
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatParentFinanceDate(value, options = {}) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    ...options,
  }).format(date);
}

function getParentFinanceChargeSortWeight(charge = {}) {
  const category = String(charge.category || '').toLowerCase();
  if (category === 'annual_tuition') return 0;
  if (category === 'enrollment_bonus') return 1;
  if (category === 'monthly_tuition') return 2;
  if (category === 'monthly_statement') return 3;
  return 4;
}

function sortParentFinanceCharges(charges = []) {
  return [...(charges || [])].sort((left, right) => {
    const weightDiff = getParentFinanceChargeSortWeight(left) - getParentFinanceChargeSortWeight(right);
    if (weightDiff !== 0) {
      return weightDiff;
    }

    return new Date(left.dueDate || 0) - new Date(right.dueDate || 0);
  });
}

function buildParentFinanceConceptFromCharge(charge = {}) {
  return {
    _id: charge._id,
    chargeId: charge._id,
    category: charge.category,
    concept: charge.concept,
    description: charge.benefitLabel || charge.description || '',
    amount: Number(charge.amount || charge.outstandingAmount || 0),
    originalAmount: Number(charge.chargeOriginalAmount || charge.originalAmount || charge.chargeAmount || charge.amount || 0),
    dueDate: charge.dueDate,
    status: charge.status,
    monthKey: charge.monthKey || '',
  };
}

function buildParentFinanceConceptsFromCharges(charges = []) {
  const pendingCharges = sortParentFinanceCharges(charges).filter(
    (charge) => ['pending', 'overdue'].includes(String(charge.status || '').toLowerCase()),
  );

  if (!pendingCharges.length) {
    return [];
  }

  const individualCharges = pendingCharges.filter((charge) => (
    ['annual_tuition', 'monthly_tuition', 'enrollment_bonus'].includes(String(charge.category || ''))
  ));
  if (individualCharges.length > 0) {
    return individualCharges.map(buildParentFinanceConceptFromCharge);
  }

  const statementCharge = pendingCharges.find((charge) => String(charge.category || '') === 'monthly_statement') || null;
  const breakdownItems = Array.isArray(statementCharge?.breakdownItems) ? statementCharge.breakdownItems : [];
  if (statementCharge && breakdownItems.length > 0) {
    return breakdownItems.map((item, index) => ({
      _id: `${statementCharge._id || 'statement'}-${item.key || item.label || index}`,
      chargeId: statementCharge._id,
      category: item.key || 'item',
      concept: item.label || 'Concepto',
      description: item.benefitLabel || '',
      amount: Number(item.amount || 0),
      originalAmount: Number(item.originalAmount || item.amount || 0),
      dueDate: statementCharge.dueDate || null,
      status: statementCharge.status || 'pending',
      monthKey: statementCharge.monthKey || '',
    }));
  }

  return pendingCharges.map(buildParentFinanceConceptFromCharge);
}

function resolveParentPayableCharge(charges = []) {
  const pendingCharges = sortParentFinanceCharges(charges).filter(
    (charge) => ['pending', 'overdue'].includes(String(charge.status || '').toLowerCase()),
  );
  const individualCharge = pendingCharges.find((charge) => (
    ['annual_tuition', 'monthly_tuition', 'enrollment_bonus'].includes(String(charge.category || ''))
  ));
  if (individualCharge) {
    return individualCharge;
  }

  return pendingCharges[0] || null;
}

function resolveParentFinanceHeroEyebrow(charge, concepts = []) {
  const conceptCategories = new Set((concepts || []).map((item) => String(item.category || '').toLowerCase()).filter(Boolean));
  if (conceptCategories.has('annual_tuition') && conceptCategories.has('monthly_tuition')) {
    return 'Matrícula y pensión pendientes';
  }
  if (conceptCategories.size > 1) {
    return 'Cobros pendientes';
  }

  if (!charge) {
    return 'Pagos académicos';
  }

  const category = String(charge.category || '').toLowerCase();
  if (category === 'annual_tuition') {
    return 'Matrícula pendiente';
  }
  if (category === 'monthly_tuition') {
    return 'Pensión pendiente';
  }
  if (category === 'enrollment_bonus') {
    return 'Bono pendiente';
  }
  if (category === 'monthly_statement') {
    return conceptCategories.has('annual_tuition') ? 'Matrícula y pensión pendientes' : 'Cobro pendiente';
  }

  return 'Cobro pendiente';
}

const FINANCE_PAYMENTS_PAGE_SIZE = 5;

function ParentFinancePaymentHistory({ onPageChange, page, pageSize, payments, totalPages }) {
  const safePage = Math.min(Math.max(page, 1), totalPages);

  return (
    <section className="campus-parent-mobile__finance-group campus-parent-mobile__finance-group--history">
      <h3>Historial de pagos</h3>
      <div className="campus-parent-mobile__card-stack campus-parent-mobile__card-stack--finance">
        {payments.length ? payments.map((payment) => (
          <article className="campus-parent-mobile__list-card campus-parent-mobile__finance-entry-card" key={payment.id || payment._id}>
            <div>
              <strong>{payment.concept || 'Pago académico'}</strong>
              <span>
                {formatParentFinanceDate(payment.paidAt, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || 'Registrado'}
              </span>
            </div>
            <div className="campus-parent-mobile__finance-entry-meta">
              <strong>{formatCurrency(payment.amount)}</strong>
              <span>{payment.channel || payment.method || 'Portal'}</span>
            </div>
          </article>
        )) : <p className="campus-parent-mobile__empty-note">Aún no hay pagos académicos registrados para este alumno.</p>}
      </div>
      {totalPages > 1 ? (
        <nav aria-label="Paginación del historial de pagos" className="campus-parent-mobile__finance-pagination">
          {Array.from({ length: totalPages }, (_, index) => {
            const pageNumber = index + 1;
            return (
              <button
                aria-current={pageNumber === safePage ? 'page' : undefined}
                className={pageNumber === safePage ? 'is-active' : ''}
                key={`finance-payment-page-${pageNumber}`}
                onClick={() => onPageChange(pageNumber)}
                type="button"
              >
                {pageNumber}
              </button>
            );
          })}
        </nav>
      ) : null}
    </section>
  );
}

function resolveParentPricingGuide(pricingGuides, selectedChild, financeCharges = []) {
  const guides = pricingGuides && typeof pricingGuides === 'object' ? pricingGuides : null;
  const childId = String(selectedChild?._id || selectedChild?.id || '');

  let guide = guides?.[childId] || null;
  if (!guide && guides && childId) {
    const matchedKey = Object.keys(guides).find((key) => String(key) === childId);
    guide = matchedKey ? guides[matchedKey] : null;
  }
  if (!guide && guides && Object.keys(guides).length === 1) {
    guide = guides[Object.keys(guides)[0]];
  }

  const enrollmentFullAmount = Number(guide?.enrollment?.fullAmount || 0);
  const monthlyFullAmount = Number(guide?.monthlyTuition?.fullAmount || 0);
  if (guide && (enrollmentFullAmount > 0 || monthlyFullAmount > 0)) {
    return guide;
  }

  const pendingCharges = Array.isArray(financeCharges) ? financeCharges : [];
  const enrollmentCharge = pendingCharges.find((charge) => String(charge?.category || '').toLowerCase() === 'annual_tuition');
  const monthlyCharge = pendingCharges.find((charge) => String(charge?.category || '').toLowerCase() === 'monthly_tuition');
  const fallbackEnrollmentAmount = Math.max(
    0,
    Number(enrollmentCharge?.originalAmount || enrollmentCharge?.fullAmount || enrollmentCharge?.amount || 0),
  );
  const fallbackMonthlyAmount = Math.max(
    0,
    Number(monthlyCharge?.originalAmount || monthlyCharge?.fullAmount || monthlyCharge?.amount || 0),
  );

  if (fallbackEnrollmentAmount <= 0 && fallbackMonthlyAmount <= 0) {
    return null;
  }

  return {
    ...(guide || {}),
    grade: guide?.grade || selectedChild?.grade || '',
    enrollment: {
      ...(guide?.enrollment || {}),
      fullAmount: enrollmentFullAmount || fallbackEnrollmentAmount,
      fullLabel: guide?.enrollment?.fullLabel || 'Matrícula ordinaria',
      benefits: Array.isArray(guide?.enrollment?.benefits) ? guide.enrollment.benefits : [],
    },
    monthlyTuition: {
      ...(guide?.monthlyTuition || {}),
      fullAmount: monthlyFullAmount || fallbackMonthlyAmount,
      fullLabel: guide?.monthlyTuition?.fullLabel || 'Pensión ordinaria (precio full)',
      benefits: Array.isArray(guide?.monthlyTuition?.benefits) ? guide.monthlyTuition.benefits : [],
    },
  };
}

function ParentFinancePricingGuide({ hideEnrollmentAmounts = false, isLoading = false, pricingGuide }) {
  if (isLoading) {
    return (
      <section className="campus-parent-mobile__finance-group campus-parent-mobile__finance-pricing-guide">
        <h3>Valores de matrícula y pensión</h3>
        <p className="campus-parent-mobile__empty-note">Consultando tarifas del colegio...</p>
      </section>
    );
  }

  if (!pricingGuide) {
    return (
      <section className="campus-parent-mobile__finance-group campus-parent-mobile__finance-pricing-guide">
        <h3>Valores de matrícula y pensión</h3>
        <p className="campus-parent-mobile__empty-note">No hay tarifas configuradas para mostrar en este grado.</p>
      </section>
    );
  }

  const enrollmentFullAmount = hideEnrollmentAmounts
    ? 0
    : Number(pricingGuide?.enrollment?.fullAmount || 0);
  const monthlyFullAmount = Number(pricingGuide?.monthlyTuition?.fullAmount || 0);
  if (enrollmentFullAmount <= 0 && monthlyFullAmount <= 0) {
    return (
      <section className="campus-parent-mobile__finance-group campus-parent-mobile__finance-pricing-guide">
        <h3>Valores de matrícula y pensión</h3>
        <p className="campus-parent-mobile__empty-note">
          {hideEnrollmentAmounts
            ? 'El valor de matrícula se mostrará al pagar en la pasarela. No hay tarifas de pensión configuradas para este grado.'
            : 'No hay tarifas configuradas para mostrar en este grado.'}
        </p>
      </section>
    );
  }

  const renderPricingRows = (section, sectionTitle) => {
    const fullAmount = Number(section?.fullAmount || 0);
    if (fullAmount <= 0) {
      return null;
    }

    const benefits = Array.isArray(section?.benefits) ? section.benefits.filter((item) => Number(item?.amount || 0) > 0) : [];

    return (
      <div className="campus-parent-mobile__finance-pricing-block">
        <h4>{sectionTitle}</h4>
        <article className="campus-parent-mobile__finance-pricing-row is-full">
          <div>
            <strong>{section.fullLabel || 'Valor ordinario'}</strong>
          </div>
          <strong>{formatCurrency(fullAmount)}</strong>
        </article>
        {benefits.map((benefit) => (
          <article className="campus-parent-mobile__finance-pricing-row" key={`${benefit.label}-${benefit.amount}`}>
            <div>
              <strong>{benefit.label || 'Beneficio'}</strong>
              {benefit.windowLabel ? <small>{benefit.windowLabel}</small> : null}
              {Number(benefit.discountPercent || 0) > 0 ? <small>{benefit.discountPercent}% de descuento</small> : null}
            </div>
            <strong>{formatCurrency(benefit.amount)}</strong>
          </article>
        ))}
      </div>
    );
  };

  return (
    <section className="campus-parent-mobile__finance-group campus-parent-mobile__finance-pricing-guide">
      <h3>Valores de matrícula y pensión</h3>
      {hideEnrollmentAmounts ? (
        <p className="campus-parent-mobile__empty-note">El valor de matrícula se mostrará al pagar en la pasarela.</p>
      ) : null}
      <div className="campus-parent-mobile__finance-pricing-card">
        {!hideEnrollmentAmounts ? renderPricingRows(pricingGuide.enrollment, 'Matrícula') : null}
        {renderPricingRows(pricingGuide.monthlyTuition, 'Pensión')}
      </div>
    </section>
  );
}

function formatParentNursingDate(value) {
  if (!value) {
    return 'Fecha no disponible';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getParentNursingDispositionLabel(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  const labels = {
    observation: 'Queda en observación',
    observed: 'Queda en observación',
    returned_to_class: 'Regresa a clase',
    return_to_class: 'Regresa a clase',
    sent_home: 'Enviado a casa',
    referred: 'Remitido',
    emergency: 'Emergencia',
    resolved: 'Atención resuelta',
  };

  return labels[normalizedValue] || 'Atención registrada';
}

function getParentPsychologyStatusLabel(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  const labels = {
    open: 'Seguimiento activo',
    follow_up: 'En seguimiento',
    escalated: 'Escalado',
    closed: 'Cerrado',
  };

  return labels[normalizedValue] || 'Seguimiento activo';
}

function getParentPsychologyPriorityLabel(value) {
  const normalizedValue = String(value || '').trim().toLowerCase();
  const labels = {
    low: 'Baja',
    medium: 'Media',
    high: 'Alta',
    urgent: 'Urgente',
  };

  return labels[normalizedValue] || 'Media';
}

function buildEmptyParentFinance() {
  return {
    summary: {
      pendingAmount: 0,
      pendingCount: 0,
    },
    charges: [],
    payments: [],
  };
}

function buildEmptyParentCafeteria(child = {}, overview = {}) {
  const childId = String(child._id || child.id || '');
  const wallet = child.wallet || {};
  const recentTopups = (overview.recentTopups || []).filter((topup) => String(topup.student?._id || '') === childId);
  const isSelectedOverviewChild = String(overview.selectedStudentId || '') === childId;

  return {
    walletBalance: Number(wallet.balance || 0),
    monthlySpend: isSelectedOverviewChild ? Number(overview.spending?.month || 0) : 0,
    dailyLimit: Number(child.dailyLimit || 0),
    lastOrder: '',
    spending: isSelectedOverviewChild ? {
      day: Number(overview.spending?.day || 0),
      week: Number(overview.spending?.week || 0),
      month: Number(overview.spending?.month || 0),
    } : { day: 0, week: 0, month: 0 },
    recentOrders: isSelectedOverviewChild ? (overview.recentOrders || []).map((order) => ({
      id: order._id,
      total: Number(order.total || 0),
      storeName: order.storeName || 'Tienda',
      itemsCount: Number(order.itemsCount || 0),
      createdAt: formatParentFinanceDate(order.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) || 'Registrado',
    })) : [],
    recentTopups: recentTopups.map((topup) => ({
      id: topup._id,
      amount: Number(topup.amount || 0),
      method: topup.method || 'Recarga',
      createdAt: formatParentFinanceDate(topup.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) || 'Registrado',
      notes: topup.notes || '',
    })),
    blockedCategories: (child.blockedCategories || []).map((category) => ({
      id: category._id,
      name: category.name || 'Categoría',
      detail: '',
      status: 'Bloqueada',
    })),
    meriendas: {
      status: child.merienda?.active ? 'Suscripción activa' : 'Sin suscripción activa',
      note: child.merienda?.parentRecommendations || 'No hay recomendaciones registradas.',
      schedule: [],
    },
    gioInsights: [],
    transactions: [],
  };
}

const PARENT_CLASS_SCHEDULE_WEEKDAYS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];
const PARENT_GUIDANCE_ROUTINE_PAGE_SIZE = 10;
const PARENT_CALENDAR_KEY_DATES_PAGE_SIZE = 10;

function formatParentClassTime(value = '') {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return String(value || '').trim();
  }

  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? 'p. m.' : 'a. m.';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}

function parseParentClassMinutes(value = '') {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (Number(match[1]) * 60) + Number(match[2]);
}

function formatParentClassMinutes(minutes = 0) {
  const safeMinutes = Number(minutes || 0);
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function getParentScheduleTone(subject = '', detail = '', type = '') {
  const text = `${subject} ${detail} ${type}`.toLowerCase();

  if (text.includes('guidance')) {
    return 'guidance';
  }

  if (text.includes('break') || text.includes('descanso')) {
    return 'break';
  }

  if (text.includes('control')) {
    return 'control';
  }

  if (text.includes('otro')) {
    return 'other';
  }

  return 'class';
}

function buildParentClassSchedule(rawSchedule = {}) {
  const courses = Array.isArray(rawSchedule?.courses) ? rawSchedule.courses : [];
  const scheduleRange = { min: Number.MAX_SAFE_INTEGER, max: 0 };
  const dayRangeByDay = PARENT_CLASS_SCHEDULE_WEEKDAYS.reduce((accumulator, day) => {
    accumulator[day] = { min: Number.MAX_SAFE_INTEGER, max: 0 };
    return accumulator;
  }, {});
  const entries = {};
  const events = [];

  (Array.isArray(rawSchedule?.slots) ? rawSchedule.slots : []).forEach((slot) => {
    const weekday = Number(slot.weekday || 0);
    const day = PARENT_CLASS_SCHEDULE_WEEKDAYS[weekday - 1];
    const startTime = String(slot.startTime || '').trim();
    const endTime = String(slot.endTime || '').trim();
    const startMinutes = parseParentClassMinutes(startTime);
    const endMinutes = parseParentClassMinutes(endTime);

    if (!day || !startTime || !endTime || startMinutes === Number.MAX_SAFE_INTEGER || endMinutes === Number.MAX_SAFE_INTEGER) {
      return;
    }

    scheduleRange.min = Math.min(scheduleRange.min, startMinutes);
    scheduleRange.max = Math.max(scheduleRange.max, endMinutes);
    dayRangeByDay[day].min = Math.min(dayRangeByDay[day].min, startMinutes);
    dayRangeByDay[day].max = Math.max(dayRangeByDay[day].max, endMinutes);
  });

  courses.forEach((course) => {
    const subject = String(course.subject || course.title || 'Clase').trim();
    const detailBase = String(course.title || course.section || '').trim();
    const sessions = Array.isArray(course.classSessions) ? course.classSessions : [];

    sessions.forEach((session) => {
      const weekday = Number(session.weekday || 0);
      const day = PARENT_CLASS_SCHEDULE_WEEKDAYS[weekday - 1];
      const startTime = String(session.startTime || '').trim();
      const endTime = String(session.endTime || '').trim();
      const startMinutes = parseParentClassMinutes(startTime);
      const endMinutes = parseParentClassMinutes(endTime);

      if (!day || !startTime || !endTime || startMinutes === Number.MAX_SAFE_INTEGER || endMinutes === Number.MAX_SAFE_INTEGER) {
        return;
      }

      const detail = String(session.label || detailBase || 'Horario publicado').trim();
      const tone = getParentScheduleTone(subject, detail, session.type || course.type || '');

      scheduleRange.min = Math.min(scheduleRange.min, startMinutes);
      scheduleRange.max = Math.max(scheduleRange.max, endMinutes);
      events.push({
        day,
        subject,
        detail,
        tone,
        startMinutes,
        endMinutes,
        timeLabel: `${formatParentClassTime(startTime)} - ${formatParentClassTime(endTime)}`,
      });
    });
  });

  const rangeStart = scheduleRange.min === Number.MAX_SAFE_INTEGER
    ? null
    : Math.floor(scheduleRange.min / 60) * 60;
  const rangeEnd = scheduleRange.max > 0 ? Math.ceil(scheduleRange.max / 60) * 60 : null;
  const slots = [];
  const hourMarks = [];

  if (rangeStart !== null && rangeEnd !== null && rangeEnd > rangeStart) {
    for (let cursor = rangeStart; cursor < rangeEnd; cursor += 60) {
      const hourLabel = `${formatParentClassTime(formatParentClassMinutes(cursor))} - ${formatParentClassTime(formatParentClassMinutes(cursor + 60))}`;
      slots.push(hourLabel);
    }

    for (let cursor = rangeStart; cursor <= rangeEnd; cursor += 60) {
      hourMarks.push({ minutes: cursor, label: formatParentClassTime(formatParentClassMinutes(cursor)) });
    }
  }

  const eventsByDay = PARENT_CLASS_SCHEDULE_WEEKDAYS.reduce((accumulator, day) => {
    accumulator[day] = [];
    return accumulator;
  }, {});
  const dayRanges = PARENT_CLASS_SCHEDULE_WEEKDAYS.reduce((accumulator, day) => {
    const range = dayRangeByDay[day];
    accumulator[day] = range.min === Number.MAX_SAFE_INTEGER || !range.max
      ? null
      : { start: range.min, end: range.max };
    return accumulator;
  }, {});

  events
    .sort((left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes)
    .forEach((event) => {
      const hourStart = Math.floor(event.startMinutes / 60) * 60;
      const hourLabel = `${formatParentClassTime(formatParentClassMinutes(hourStart))} - ${formatParentClassTime(formatParentClassMinutes(hourStart + 60))}`;
      entries[hourLabel] = entries[hourLabel] || {};
      entries[hourLabel][event.day] = entries[hourLabel][event.day] || [];
      entries[hourLabel][event.day].push({
        subject: event.subject,
        detail: event.detail,
        tone: event.tone,
        timeLabel: event.timeLabel,
      });
      eventsByDay[event.day] = eventsByDay[event.day] || [];
      eventsByDay[event.day].push({
        subject: event.subject,
        detail: event.detail,
        tone: event.tone,
        timeLabel: event.timeLabel,
        startMinutes: event.startMinutes,
        endMinutes: event.endMinutes,
      });
    });

  return {
    weekdays: PARENT_CLASS_SCHEDULE_WEEKDAYS,
    slots,
    entries,
    eventsByDay,
    hourMarks,
    rangeStart,
    rangeEnd,
    dayRanges,
  };
}

function buildParentSectionLabelFromCourseToken(grade, courseToken) {
  const normalizedGrade = String(grade || '').replace(/\s+/g, '');
  const normalizedToken = String(courseToken || '').replace(/\s+/g, '');

  if (!normalizedGrade || !normalizedToken) {
    return '';
  }

  if (/^\d+$/.test(normalizedToken)) {
    const index = Number(normalizedToken);
    if (index >= 1 && index <= 26) {
      return `${normalizedGrade}${String.fromCharCode(64 + index)}`;
    }
  }

  if (/^[a-z]$/i.test(normalizedToken)) {
    return `${normalizedGrade}${normalizedToken.toUpperCase()}`;
  }

  if (/^\d+[a-z]$/i.test(normalizedToken)) {
    return normalizedToken.toUpperCase();
  }

  return normalizedToken;
}

function humanizeGradeToken(value) {
  const token = String(value || '').trim();
  if (!token || token.includes(':')) {
    return '';
  }

  return token
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)\S/g, (match) => match.toUpperCase());
}

function buildParentStudentDisplayGrade(child = {}) {
  const grade = String(child.grade || '').trim();
  const course = String(child.course || '').trim();
  const fallback = grade || 'Sin grado';

  for (const candidate of [course, grade]) {
    const formatted = formatEducationalGradeLabel(candidate);
    if (formatted) {
      return formatted;
    }
  }

  if (!course) {
    return humanizeGradeToken(grade) || fallback;
  }

  const courseParts = course.split(':').map((part) => part.trim()).filter(Boolean);
  const gradeFromCourse = courseParts.length >= 2 ? courseParts[1] : '';
  const courseToken = courseParts.length >= 3 ? courseParts.slice(2).join(':') : course;
  const sectionLabel = buildParentSectionLabelFromCourseToken(grade || gradeFromCourse, courseToken);

  if (sectionLabel) {
    return sectionLabel;
  }

  if (course.includes(':')) {
    return humanizeGradeToken(grade) || fallback;
  }

  return humanizeGradeToken(course) || course;
}

function getParentStudentGradeLabel(child = {}) {
  const grade = String(child?.grade || '').trim();
  const course = String(child?.course || '').trim();
  const computed = buildParentStudentDisplayGrade({ ...child, grade, course });
  const fromApi = String(child?.displayGrade || '').trim();

  if (
    fromApi
    && !isRawInternalGradeToken(fromApi)
    && fromApi !== grade
    && fromApi !== course
  ) {
    return fromApi;
  }

  return computed || grade || 'Sin grado';
}

function buildParentChildFromOverview(child = {}, overview = {}) {
  const name = String(child.name || 'Alumno').trim();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'AL';
  const childId = String(child._id || child.id || '');
  const grade = String(child.grade || '').trim() || 'Sin grado';
  const course = String(child.course || '').trim();
  const selectedOverviewChildId = String(overview.selectedStudentId || overview.selectedStudent?._id || '');
  const classSchedule = selectedOverviewChildId === childId
    ? buildParentClassSchedule(overview.academicSchedule)
    : { weekdays: PARENT_CLASS_SCHEDULE_WEEKDAYS, slots: [], entries: {} };

  return {
    _id: childId,
    id: childId,
    name,
    grade,
    course,
    displayGrade: getParentStudentGradeLabel({ ...child, grade, course }),
    imageUrl: String(child.imageUrl || '').trim(),
    thumbUrl: String(child.thumbUrl || '').trim(),
    relationship: 'Alumno vinculado',
    avatar: initials,
    headline: '',
    attendanceRate: 'Sin datos',
    averageScore: 0,
    pendingTasks: 0,
    cafeteriaStatus: child.wallet?.balance > 0 ? 'Saldo disponible' : 'Sin saldo registrado',
    nursingStatus: 'Sin registros recientes',
    subjects: [],
    tasks: [],
    materials: [],
    schedule: [],
    classSchedule,
    finance: buildEmptyParentFinance(),
    cafeteria: buildEmptyParentCafeteria(child, overview),
    nursing: {
      status: 'Sin alertas criticas',
      note: 'No hay atenciones recientes registradas por Enfermería.',
      updates: [],
    },
    transport: {
      routeName: 'Sin ruta asignada',
      operator: '',
      stop: '',
      eta: '',
      note: 'No hay información de ruta registrada para este alumno.',
    },
    study: {
      readiness: 'Sin datos',
      nextFocus: '',
      recommendedMinutes: 0,
    },
    academicContent: selectedOverviewChildId === childId ? overview.academicContent || [] : [],
    academicGrades: selectedOverviewChildId === childId && Array.isArray(overview.academicGrades) ? overview.academicGrades : [],
    academicRanking: selectedOverviewChildId === childId ? overview.academicRanking || null : null,
    academicPerformanceLevel: selectedOverviewChildId === childId ? overview.academicPerformanceLevel || null : null,
    academicGradingScale: selectedOverviewChildId === childId ? overview.academicGradingScale || null : null,
    academicUpcomingAssignments: selectedOverviewChildId === childId && Array.isArray(overview.academicUpcomingAssignments)
      ? overview.academicUpcomingAssignments
      : [],
    isRealParentChild: true,
  };
}

function normalizeLookupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getAcademicFeedItemKey(item) {
  return String(item?._id || item?.id || item?.communicationId || '').trim();
}

function academicFeedItemMatchesChild(item, child) {
  const childId = String(child?._id || child?.id || '').trim();
  const childGradeKey = normalizeLookupKey(child?.grade);
  const childCourseKey = normalizeLookupKey(child?.course || child?.grade);
  const audienceType = normalizeLookupKey(item?.audienceType);
  const cohortKey = String(item?.cohortKey || '').trim();
  const childCohortKeys = new Set(
    (Array.isArray(child?.cohortHistory) ? child.cohortHistory : [])
      .map((entry) => String(entry?.key || '').trim())
      .filter(Boolean)
  );
  const studentTargets = Array.isArray(item?.studentTargets)
    ? item.studentTargets.map((target) => String(target?._id || target))
    : [];
  const recipientStudentIds = Array.isArray(item?.recipientStudentIds)
    ? item.recipientStudentIds.map((target) => String(target?._id || target))
    : [];
  const gradeTargets = Array.isArray(item?.gradeTargets) ? item.gradeTargets.map(normalizeLookupKey) : [];
  const courseTargets = Array.isArray(item?.courseTargets) ? item.courseTargets.map(normalizeLookupKey) : [];

  if (audienceType === 'general' || audienceType === '') {
    return true;
  }

  if (audienceType === 'course_students') {
    return Boolean(
      (childId && (recipientStudentIds.includes(childId) || studentTargets.includes(childId)))
      || (cohortKey && childCohortKeys.has(cohortKey))
    );
  }

  if (cohortKey && childCohortKeys.has(cohortKey)) {
    return true;
  }

  return (childId && (recipientStudentIds.includes(childId) || studentTargets.includes(childId)))
    || (childGradeKey && gradeTargets.includes(childGradeKey))
    || (childCourseKey && courseTargets.includes(childCourseKey))
    || (childGradeKey && courseTargets.includes(childGradeKey));
}

function getCommunityAudienceLabel(audienceType = '') {
  const normalized = normalizeLookupKey(audienceType);
  if (normalized === 'course_students') return 'Curso · solo alumnos';
  if (normalized === 'course') return 'Curso · familias';
  if (normalized === 'grade') return 'Grado';
  if (normalized === 'individual') return 'Individual';
  return 'Colegio';
}

function createEmptyParentAttendanceSummary() {
  return {
    total: 0,
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    lateCount: 0,
    excusedAbsences: 0,
    unexcusedAbsences: 0,
    attendanceRate: 'Sin datos',
  };
}

function buildParentAcademicAttendanceState(payload = {}) {
  const guidanceRoutine = payload?.guidanceRoutine || {};
  const classAttendance = payload?.classAttendance || {};

  return {
    summary: { ...createEmptyParentAttendanceSummary(), ...(payload?.summary || {}) },
    records: Array.isArray(payload?.records) ? payload.records : [],
    guidanceRoutine: {
      summary: { ...createEmptyParentAttendanceSummary(), ...(guidanceRoutine.summary || {}) },
      records: Array.isArray(guidanceRoutine.records) ? guidanceRoutine.records : [],
    },
    classAttendance: {
      summary: { ...createEmptyParentAttendanceSummary(), ...(classAttendance.summary || {}) },
      records: Array.isArray(classAttendance.records) ? classAttendance.records : [],
      subjects: Array.isArray(classAttendance.subjects) ? classAttendance.subjects : [],
    },
    isLoading: false,
    error: '',
  };
}

function getParentAttendanceRate(summary = {}) {
  const total = Number(summary?.total || 0);
  if (total <= 0) {
    return 0;
  }

  return Math.round((Number(summary?.present || 0) / total) * 100);
}

function getParentAttendanceCardColor(rate) {
  const numericRate = Number(rate || 0);
  if (numericRate >= 90) return '#166534';
  if (numericRate >= 75) return '#15803d';
  if (numericRate >= 60) return '#ca8a04';
  if (numericRate >= 40) return '#ea580c';
  return '#b42318';
}

function getAttendanceRateTone(rate) {
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate)) {
    return 'neutral';
  }
  if (numericRate >= 90) {
    return 'good';
  }
  if (numericRate >= 75) {
    return 'basic';
  }
  if (numericRate >= 60) {
    return 'warn';
  }
  return 'bad';
}

function getGradeTextLabel(value, performanceLevel = null) {
  if (performanceLevel?.label) {
    return String(performanceLevel.label).toUpperCase();
  }

  if (value === null || value === undefined || value === '') {
    return 'SIN NOTA';
  }
  const numericValue = Number(value) || 0;

  if (numericValue >= 96) return 'SUPERIOR';
  if (numericValue >= 90) return 'SOBRESALIENTE';
  if (numericValue >= 80) return 'ALTO';
  if (numericValue >= 70) return 'BÁSICO';
  return 'BAJO';
}

function getGradeDisplayLabel(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 'Sin nota';
  }
  if (numericValue >= 90) return 'Muy bueno';
  if (numericValue >= 80) return 'Bueno';
  if (numericValue >= 70) return 'Básico';
  return 'Bajo desempeño';
}

function getGradeScoreTone(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 'neutral';
  }
  if (numericValue >= 80) {
    return 'good';
  }
  if (numericValue >= 70) {
    return 'basic';
  }
  if (numericValue >= 60) {
    return 'warn';
  }
  return 'bad';
}

function ParentGradeScoreIcon({ tone = 'neutral' }) {
  if (tone === 'good') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M8.2 12.4 10.8 15l5-5.8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
      </svg>
    );
  }

  if (tone === 'basic') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M7.5 12h9"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.2"
        />
      </svg>
    );
  }

  if (tone === 'warn' || tone === 'bad') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M8.4 8.4 15.6 15.6M15.6 8.4 8.4 15.6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.2"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function resolveParentSubjectVisualMeta(subjectName = '') {
  const normalizedSubject = normalizeLookupKey(subjectName);

  if (/deporte|educacionfisica|edfisica|futbol|soccer/.test(normalizedSubject)) {
    return { accent: 'sport', iconVariant: 'sport' };
  }
  if (/ingles|english|frances|francais|espanol|lengua|fonoaudiolog/.test(normalizedSubject)) {
    return { accent: 'task', iconVariant: 'task' };
  }
  if (/arte|danza|musica/.test(normalizedSubject)) {
    return { accent: 'workshop', iconVariant: 'workshop' };
  }
  if (/matematic|fisica|quimica|biolog|ciencia/.test(normalizedSubject)) {
    return { accent: 'quiz', iconVariant: 'quiz' };
  }
  if (/estimul|psico|orient/.test(normalizedSubject)) {
    return { accent: 'activity', iconVariant: 'activity' };
  }

  const accents = ['task', 'activity', 'sport', 'workshop', 'quiz'];
  const hash = normalizedSubject.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const accent = accents[Math.abs(hash) % accents.length];
  return { accent, iconVariant: accent };
}

function darkenPerformanceHeroColor(hexColor, amount = 0.22) {
  const normalized = String(hexColor || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    return '';
  }

  const channel = (startIndex) => Number.parseInt(normalized.slice(startIndex, startIndex + 2), 16);
  const factor = 1 - amount;
  const toHex = (value) => Math.max(0, Math.min(255, Math.round(value * factor))).toString(16).padStart(2, '0');

  return `#${toHex(channel(0))}${toHex(channel(2))}${toHex(channel(4))}`;
}

function resolvePerformanceHeroColor(performanceLevel = null, average = null, gradingScale = null) {
  const explicitColor = normalizePerformanceHexColor(performanceLevel?.color);
  if (explicitColor) {
    return explicitColor;
  }

  const scaledLevel = resolvePerformanceLevelForAverage(average, gradingScale);
  const scaledColor = normalizePerformanceHexColor(scaledLevel?.color);
  if (scaledColor) {
    return scaledColor;
  }

  const fallbackColor = getParentSubjectCardColor({ finalAverage: average });
  return normalizePerformanceHexColor(fallbackColor);
}

const parentPerformanceHeroClassKeys = new Set([
  'deficiente',
  'insuficiente',
  'aceptable',
  'bueno',
  'sobresaliente',
  'excelente',
]);

function resolvePerformanceHeroClassName(performanceLevel = null, average = null) {
  if (normalizePerformanceHexColor(performanceLevel?.color)) {
    return '';
  }

  const levelKey = String(performanceLevel?.key || '').trim().toLowerCase();
  if (levelKey && parentPerformanceHeroClassKeys.has(levelKey)) {
    return `is-performance-${levelKey}`;
  }

  if (average === null || average === undefined || average === '') {
    return '';
  }

  const numericAverage = Number(average);
  if (!Number.isFinite(numericAverage)) {
    return '';
  }

  if (numericAverage >= 96) return 'is-performance-excelente';
  if (numericAverage >= 90) return 'is-performance-sobresaliente';
  if (numericAverage >= 80) return 'is-performance-bueno';
  if (numericAverage >= 70) return 'is-performance-aceptable';
  if (numericAverage >= 60) return 'is-performance-insuficiente';
  return 'is-performance-deficiente';
}

function buildPerformanceHeroStyle(performanceLevel = null, average = null, gradingScale = null) {
  const heroColor = resolvePerformanceHeroColor(performanceLevel, average, gradingScale);
  const heroStart = heroColor || '#102c42';
  const heroEnd = heroColor ? (darkenPerformanceHeroColor(heroColor) || heroColor) : '#1d4d6e';

  return {
    '--performance-accent': heroStart,
    '--performance-hero-start': heroStart,
    '--performance-hero-end': heroEnd,
    background: `linear-gradient(145deg, ${heroStart} 0%, ${heroEnd} 100%)`,
  };
}

function mapParentUpcomingAssignmentRow(item) {
  const typeMeta = resolveParentAssignmentTypeMeta(item);
  const dueAt = item.date || item.dueAt || item.scheduledAt || null;
  const dateLabel = item.dateLabel || formatAcademicCalendarDate(dueAt);
  const remainingLabel = formatAssignmentDaysRemaining(dueAt, item.dueLabel || item.meta);

  return {
    id: item.id,
    courseId: item.courseId || '',
    source: item.source || '',
    title: item.title,
    subtitle: item.subject || item.courseTitle || 'Actividad académica',
    meta: dateLabel,
    dueAt,
    remainingLabel,
    detail: item.detail || 'Actividad publicada por el docente.',
    type: item.type || 'Asignación',
    typeLabel: typeMeta.label,
    iconVariant: typeMeta.iconVariant,
    accent: typeMeta.accent,
    tone: /quiz|examen|evaluaci/.test(normalizeLookupKey(item.type || item.title)) ? 'high' : 'medium',
  };
}

function resolveParentAssignmentTypeMeta(item = {}) {
  const normalizedType = normalizeLookupKey(item.type || item.title);
  const normalizedSubject = normalizeLookupKey(item.subject || item.subtitle || item.courseTitle || '');

  if (/quiz|quices/.test(normalizedType)) {
    return { label: 'QUICES', iconVariant: 'quiz', accent: 'quiz' };
  }

  if (/deporte|educacionfisica|edfisica/.test(normalizedSubject)) {
    return {
      label: /actividades/.test(normalizedType) ? 'ACTIVIDADES' : 'ACTIVIDAD',
      iconVariant: 'sport',
      accent: 'sport',
    };
  }

  if (/actividad/.test(normalizedType)) {
    return {
      label: /actividades/.test(normalizedType) ? 'ACTIVIDADES' : 'ACTIVIDAD',
      iconVariant: 'activity',
      accent: 'activity',
    };
  }

  if (/taller/.test(normalizedType)) {
    return { label: 'TALLER', iconVariant: 'workshop', accent: 'workshop' };
  }

  if (/examen|evaluaci/.test(normalizedType)) {
    return { label: 'EXAMEN', iconVariant: 'quiz', accent: 'quiz' };
  }

  if (/tareas/.test(normalizedType)) {
    return { label: 'TAREAS', iconVariant: 'workshop', accent: 'workshop' };
  }

  return { label: 'TAREA', iconVariant: 'task', accent: 'task' };
}

function formatAssignmentDaysRemaining(dueAt, fallbackLabel = '') {
  if (dueAt) {
    const dueDate = new Date(dueAt);
    if (!Number.isNaN(dueDate.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDay = new Date(dueDate);
      dueDay.setHours(0, 0, 0, 0);
      const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

      if (diffDays < 0) {
        return 'Vencida';
      }
      if (diffDays === 0) {
        return 'Hoy';
      }
      if (diffDays === 1) {
        return '1 día restante';
      }
      return `${diffDays} días restantes`;
    }
  }

  const fallback = String(fallbackLabel || '').toLowerCase();
  if (fallback.includes('hoy')) {
    return 'Hoy';
  }
  if (fallback.includes('manana') || fallback.includes('mañana')) {
    return '1 día restante';
  }
  if (/\d+\s*d[ií]as?/.test(fallback)) {
    const match = fallback.match(/(\d+)\s*d[ií]as?/);
    if (match) {
      const days = Number(match[1]);
      return days === 1 ? '1 día restante' : `${days} días restantes`;
    }
  }

  return '';
}

function formatAcademicRankingLabel(ranking, gradebook = []) {
  const position = Number(ranking?.position || 0);
  const total = Number(ranking?.total || 0);

  if (position > 0 && total > 0) {
    return `Puesto #${position} de ${total} alumnos`;
  }

  if (ranking?.label && !/^sin ranking/i.test(ranking.label)) {
    return ranking.label;
  }

  const hasPublishedGrades = (Array.isArray(gradebook) ? gradebook : [])
    .some((subject) => subject.finalAverage !== null && subject.finalAverage !== undefined);

  return hasPublishedGrades ? 'Puesto #1 de 1 alumnos' : 'Sin ranking';
}

const gradeSubjectCatalog = [
  { slug: 'ingles', name: 'Inglés', teachers: { 'child-sofia': 'Laura Méndez', 'child-tomas': 'Andrew Collins' } },
  { slug: 'espanol', name: 'Español', teachers: { 'child-sofia': 'Sandra Ruiz', 'child-tomas': 'Paula Bernal' } },
  { slug: 'frances', name: 'Francés', teachers: { 'child-sofia': 'Claire Dufour', 'child-tomas': 'Claire Dufour' } },
  { slug: 'matematicas', name: 'Matemáticas', teachers: { 'child-sofia': 'Carolina Díaz', 'child-tomas': 'Mauricio Rojas' } },
  { slug: 'fisica', name: 'Física', teachers: { 'child-sofia': 'Julio Acosta', 'child-tomas': 'Julio Acosta' } },
  { slug: 'quimica', name: 'Química', teachers: { 'child-sofia': 'María Solano', 'child-tomas': 'María Solano' } },
  { slug: 'biologia', name: 'Biología', teachers: { 'child-sofia': 'Natalia Pérez', 'child-tomas': 'Natalia Pérez' } },
  { slug: 'etiqueta', name: 'Etiqueta', teachers: { 'child-sofia': 'Diana López', 'child-tomas': 'Diana López' } },
  { slug: 'deporte', name: 'Deporte', teachers: { 'child-sofia': 'Sebastián León', 'child-tomas': 'Sebastián León' } },
  { slug: 'filosofia', name: 'Filosofía', teachers: { 'child-sofia': 'Mónica Guerra', 'child-tomas': 'Mónica Guerra' } },
  { slug: 'tok', name: 'TOK', teachers: { 'child-sofia': 'Felipe Gómez', 'child-tomas': 'Felipe Gómez' } },
  { slug: 'sociales', name: 'Sociales', teachers: { 'child-sofia': 'Adriana Castro', 'child-tomas': 'Adriana Castro' } },
  { slug: 'religion', name: 'Religión', teachers: { 'child-sofia': 'Sara Vélez', 'child-tomas': 'Sara Vélez' } },
  { slug: 'computacion', name: 'Computación', teachers: { 'child-sofia': 'Camilo Duarte', 'child-tomas': 'Camilo Duarte' } },
  { slug: 'arte', name: 'Arte', teachers: { 'child-sofia': 'Valeria Cobo', 'child-tomas': 'Valeria Cobo' } },
  { slug: 'danza', name: 'Danza', teachers: { 'child-sofia': 'Juliana Ortiz', 'child-tomas': 'Juliana Ortiz' } },
];

const gradeComponentTemplates = [
  { slug: 'quices', label: 'Quices', weight: 15 },
  { slug: 'tareas', label: 'Tareas', weight: 20 },
  { slug: 'talleres', label: 'Talleres', weight: 20 },
  { slug: 'exposicion', label: 'Exposición', weight: 15 },
  { slug: 'examenes-finales', label: 'Exámenes finales', weight: 30 },
];

const gradeTopicLibrary = {
  quices: ['Quiz diagnóstico', 'Quiz acumulativo', 'Quiz de seguimiento'],
  tareas: ['Tarea en casa', 'Taller virtual', 'Guía de repaso'],
  talleres: ['Taller individual', 'Taller colaborativo', 'Laboratorio guiado'],
  exposicion: ['Exposición oral', 'Sustentación grupal', 'Presentación temática'],
  'examenes-finales': ['Evaluación final', 'Parcial acumulativo', 'Prueba de cierre'],
};

function buildGradebookForChild(child) {
  const childOffset = child.id === 'child-sofia' ? 3 : -4;

  return gradeSubjectCatalog.map((subject, subjectIndex) => {
    const periods = [1, 2, 3, 4].map((periodNumber) => {
      const components = gradeComponentTemplates.map((component, componentIndex) => {
        const evaluations = gradeTopicLibrary[component.slug].map((topic, evaluationIndex) => {
          const rawScore = 76 + childOffset + subjectIndex * 2 + periodNumber * 3 + componentIndex * 2 + evaluationIndex;
          const score = Math.max(58, Math.min(99, rawScore));

          return {
            id: `${child.id}-${subject.slug}-${periodNumber}-${component.slug}-${evaluationIndex + 1}`,
            date: `${4 + evaluationIndex + (periodNumber - 1) * 7} mar. 2026`,
            topic: `${topic} · ${subject.name}`,
            score,
          };
        });

        const average = Math.round(evaluations.reduce((sum, evaluation) => sum + evaluation.score, 0) / evaluations.length);

        return {
          id: `${child.id}-${subject.slug}-${periodNumber}-${component.slug}`,
          label: component.label,
          weight: component.weight,
          average,
          evaluations,
        };
      });

      const average = Math.round(components.reduce((sum, component) => sum + (component.average * component.weight) / 100, 0));

      return {
        id: `${child.id}-${subject.slug}-period-${periodNumber}`,
        label: `Periodo ${periodNumber}`,
        weight: 25,
        average,
        components,
      };
    });

    const finalAverage = Math.round(periods.reduce((sum, period) => sum + (period.average * period.weight) / 100, 0));

    return {
      id: `${child.id}-${subject.slug}`,
      name: subject.name,
      teacher: subject.teachers[child.id] || 'Docente asignado',
      finalAverage,
      periods,
    };
  });
}

function buildMonthKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildCalendarDateKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${buildMonthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatAcademicCalendarDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' }).format(date);
}

function formatAcademicCalendarMonth(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Calendario';
  }

  const label = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildAcademicCalendarGrid(monthDate, calendarItems) {
  const normalizedMonthDate = new Date(monthDate);
  const monthStart = Number.isNaN(normalizedMonthDate.getTime())
    ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    : new Date(normalizedMonthDate.getFullYear(), normalizedMonthDate.getMonth(), 1);
  const monthLabel = formatAcademicCalendarMonth(monthStart);
  const weekdayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const startsOn = monthStart.getDay();
  const totalDays = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const today = new Date();
  const itemsByDay = new Map();

  (Array.isArray(calendarItems) ? calendarItems : []).forEach((item) => {
    const itemDate = item.day
      ? new Date(monthStart.getFullYear(), monthStart.getMonth(), Number(item.day))
      : new Date(item.date || item.dueAt || item.scheduledClassDate || item.publishedAt);
    if (Number.isNaN(itemDate.getTime()) || buildMonthKey(itemDate) !== buildMonthKey(monthStart)) {
      return;
    }

    const day = itemDate.getDate();
    const itemsForDay = itemsByDay.get(day) || [];
    itemsForDay.push({
      ...item,
      date: item.date || itemDate.toISOString(),
      dateLabel: item.dateLabel || formatAcademicCalendarDate(itemDate),
    });
    itemsByDay.set(day, itemsForDay);
  });

  const cells = [];

  for (let dayIndex = 0; dayIndex < startsOn; dayIndex += 1) {
    cells.push({ id: `blank-${dayIndex}`, isBlank: true });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    cells.push({
      id: `day-${day}`,
      day,
      date: new Date(monthStart.getFullYear(), monthStart.getMonth(), day),
      dateKey: buildCalendarDateKey(new Date(monthStart.getFullYear(), monthStart.getMonth(), day)),
      dateLabel: formatAcademicCalendarDate(new Date(monthStart.getFullYear(), monthStart.getMonth(), day)),
      items: itemsByDay.get(day) || [],
      isToday: today.getFullYear() === monthStart.getFullYear() && today.getMonth() === monthStart.getMonth() && today.getDate() === day,
    });
  }

  return {
    monthLabel,
    weekdayLabels,
    cells,
  };
}

function buildWeeklyClassSchedule(child) {
  const weekdays = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];
  const slots = [
    '7:30 a. m.',
    '8:30 a. m.',
    '9:30 a. m.',
    '10:30 a. m.',
    '11:30 a. m.',
    '12:30 p. m.',
    '1:30 p. m.',
    '2:30 p. m.',
    '3:30 p. m.',
  ];

  const scheduleByChild = {
    'child-sofia': {
      '7:30 a. m.': {
        Lunes: { subject: 'Matematicas', detail: 'Salon 204' },
        Martes: { subject: 'Lenguaje', detail: 'Salon 204' },
        Miercoles: { subject: 'Ingles', detail: 'Sala bilingue' },
        Jueves: { subject: 'Ciencias', detail: 'Laboratorio junior' },
        Viernes: { subject: 'Matematicas', detail: 'Salon 204' },
      },
      '8:30 a. m.': {
        Lunes: { subject: 'Sociales', detail: 'Salon 204' },
        Martes: { subject: 'Matematicas', detail: 'Salon 204' },
        Miercoles: { subject: 'Lenguaje', detail: 'Salon 204' },
        Jueves: { subject: 'Ingles', detail: 'Sala bilingue' },
        Viernes: { subject: 'Artistica', detail: 'Aula creativa' },
      },
      '9:30 a. m.': {
        Lunes: { subject: 'Ingles', detail: 'Sala bilingue' },
        Martes: { subject: 'Ciencias', detail: 'Laboratorio junior' },
        Miercoles: { subject: 'Matematicas', detail: 'Salon 204' },
        Jueves: { subject: 'Sociales', detail: 'Salon 204' },
        Viernes: { subject: 'Lenguaje', detail: 'Biblioteca' },
      },
      '10:30 a. m.': {
        Lunes: { subject: 'Descanso', detail: 'Patio central' },
        Martes: { subject: 'Descanso', detail: 'Patio central' },
        Miercoles: { subject: 'Descanso', detail: 'Patio central' },
        Jueves: { subject: 'Descanso', detail: 'Patio central' },
        Viernes: { subject: 'Descanso', detail: 'Patio central' },
      },
      '11:30 a. m.': {
        Lunes: { subject: 'Tecnologia', detail: 'Sala maker' },
        Martes: { subject: 'Artistica', detail: 'Aula creativa' },
        Miercoles: { subject: 'Club lector', detail: 'Biblioteca' },
        Jueves: { subject: 'Matematicas', detail: 'Salon 204' },
        Viernes: { subject: 'Educacion fisica', detail: 'Cancha A' },
      },
      '12:30 p. m.': {
        Lunes: { subject: 'Almuerzo', detail: 'Comedor principal' },
        Martes: { subject: 'Almuerzo', detail: 'Comedor principal' },
        Miercoles: { subject: 'Almuerzo', detail: 'Comedor principal' },
        Jueves: { subject: 'Almuerzo', detail: 'Comedor principal' },
        Viernes: { subject: 'Almuerzo', detail: 'Comedor principal' },
      },
      '1:30 p. m.': {
        Lunes: { subject: 'Proyecto STEM', detail: 'Sala maker' },
        Martes: { subject: 'Musica', detail: 'Salon de musica' },
        Miercoles: { subject: 'Ingles', detail: 'Sala bilingue' },
        Jueves: { subject: 'Lenguaje', detail: 'Salon 204' },
        Viernes: { subject: 'Ciencias', detail: 'Laboratorio junior' },
      },
      '2:30 p. m.': {
        Lunes: { subject: 'Taller guiado', detail: 'Salon 204' },
        Martes: { subject: 'Refuerzo matematico', detail: 'Salon 204' },
        Miercoles: { subject: 'Artes', detail: 'Aula creativa' },
        Jueves: { subject: 'Deporte base', detail: 'Cancha A' },
        Viernes: { subject: 'Cierre de proyectos', detail: 'Salon 204' },
      },
      '3:30 p. m.': {
        Lunes: { subject: 'Salida', detail: 'Ruta / Recogida' },
        Martes: { subject: 'Salida', detail: 'Ruta / Recogida' },
        Miercoles: { subject: 'Salida', detail: 'Ruta / Recogida' },
        Jueves: { subject: 'Salida', detail: 'Ruta / Recogida' },
        Viernes: { subject: 'Salida', detail: 'Ruta / Recogida' },
      },
    },
    'child-tomas': {
      '7:30 a. m.': {
        Lunes: { subject: 'Fisica', detail: 'Lab. ciencias' },
        Martes: { subject: 'Quimica', detail: 'Lab. ciencias' },
        Miercoles: { subject: 'Sociales', detail: 'Salon 11-B' },
        Jueves: { subject: 'Matematicas', detail: 'Salon 11-B' },
        Viernes: { subject: 'Fisica', detail: 'Lab. ciencias' },
      },
      '8:30 a. m.': {
        Lunes: { subject: 'Matematicas', detail: 'Salon 11-B' },
        Martes: { subject: 'Ingles', detail: 'Sala bilingue' },
        Miercoles: { subject: 'Quimica', detail: 'Lab. ciencias' },
        Jueves: { subject: 'Lenguaje', detail: 'Salon 11-B' },
        Viernes: { subject: 'Sociales', detail: 'Salon 11-B' },
      },
      '9:30 a. m.': {
        Lunes: { subject: 'Descanso', detail: 'Patio central' },
        Martes: { subject: 'Descanso', detail: 'Patio central' },
        Miercoles: { subject: 'Descanso', detail: 'Patio central' },
        Jueves: { subject: 'Descanso', detail: 'Patio central' },
        Viernes: { subject: 'Descanso', detail: 'Patio central' },
      },
      '10:30 a. m.': {
        Lunes: { subject: 'Tecnologia', detail: 'Sala TIC' },
        Martes: { subject: 'Fisica', detail: 'Lab. ciencias' },
        Miercoles: { subject: 'Matematicas', detail: 'Salon 11-B' },
        Jueves: { subject: 'Educacion fisica', detail: 'Cancha mayor' },
        Viernes: { subject: 'Quimica', detail: 'Lab. ciencias' },
      },
      '11:30 a. m.': {
        Lunes: { subject: 'Lenguaje', detail: 'Salon 11-B' },
        Martes: { subject: 'Sociales', detail: 'Salon 11-B' },
        Miercoles: { subject: 'Ingles', detail: 'Sala bilingue' },
        Jueves: { subject: 'Filosofia', detail: 'Salon 11-B' },
        Viernes: { subject: 'Proyecto', detail: 'Sala TIC' },
      },
      '12:30 p. m.': {
        Lunes: { subject: 'Almuerzo', detail: 'Comedor principal' },
        Martes: { subject: 'Almuerzo', detail: 'Comedor principal' },
        Miercoles: { subject: 'Almuerzo', detail: 'Comedor principal' },
        Jueves: { subject: 'Almuerzo', detail: 'Comedor principal' },
        Viernes: { subject: 'Almuerzo', detail: 'Comedor principal' },
      },
      '1:30 p. m.': {
        Lunes: { subject: 'Laboratorio', detail: 'Fisica aplicada' },
        Martes: { subject: 'Emprendimiento', detail: 'Salon 11-B' },
        Miercoles: { subject: 'Quimica', detail: 'Lab. ciencias' },
        Jueves: { subject: 'Matematicas', detail: 'Salon 11-B' },
        Viernes: { subject: 'Artistica', detail: 'Aula creativa' },
      },
      '2:30 p. m.': {
        Lunes: { subject: 'Tutorias', detail: 'Acompañamiento' },
        Martes: { subject: 'Club debate', detail: 'Biblioteca' },
        Miercoles: { subject: 'Refuerzo ingles', detail: 'Sala bilingue' },
        Jueves: { subject: 'Proyecto final', detail: 'Sala TIC' },
        Viernes: { subject: 'Cierre semanal', detail: 'Salon 11-B' },
      },
      '3:30 p. m.': {
        Lunes: { subject: 'Salida', detail: 'Ruta / Recogida' },
        Martes: { subject: 'Salida', detail: 'Ruta / Recogida' },
        Miercoles: { subject: 'Salida', detail: 'Ruta / Recogida' },
        Jueves: { subject: 'Salida', detail: 'Ruta / Recogida' },
        Viernes: { subject: 'Salida', detail: 'Ruta / Recogida' },
      },
    },
  };

  return {
    weekdays,
    slots,
    entries: scheduleByChild[child.id] || {},
  };
}

function buildAcademicWorkspace(child) {
  const calendarByChild = {
    'child-sofia': [
      { id: 'sofia-cal-1', type: 'Examen', title: 'Examen de fracciones', date: '8 abr. · 7:00 a. m.', detail: 'Matematicas · Salon 204', accent: 'warn', day: 8 },
      { id: 'sofia-cal-2', type: 'Entrega', title: 'Lectura comentada capitulo 4', date: '9 abr. · 7:00 a. m.', detail: 'Lenguaje · Plataforma Campus', accent: 'neutral', day: 9 },
      { id: 'sofia-cal-3', type: 'Evento', title: 'Festival de lectura familiar', date: '11 abr. · 4:00 p. m.', detail: 'Biblioteca principal', accent: 'good', day: 11 },
      { id: 'sofia-cal-4', type: 'Sin clase', title: 'Jornada pedagogica', date: '18 abr. · Todo el dia', detail: 'No hay actividades para estudiantes', accent: 'sky', day: 18 },
    ],
    'child-tomas': [
      { id: 'tomas-cal-1', type: 'Examen', title: 'Quiz de cinematica', date: '7 abr. · 4:30 p. m.', detail: 'Fisica · Aula virtual', accent: 'warn', day: 7 },
      { id: 'tomas-cal-2', type: 'Entrega', title: 'Informe corto de laboratorio', date: '8 abr. · 8:00 a. m.', detail: 'Quimica · Plataforma Campus', accent: 'neutral', day: 8 },
      { id: 'tomas-cal-3', type: 'Evento', title: 'Feria de proyectos', date: '12 abr. · 9:00 a. m.', detail: 'Bloque de ciencias', accent: 'good', day: 12 },
      { id: 'tomas-cal-4', type: 'Sin clase', title: 'Dia institucional', date: '18 abr. · Todo el dia', detail: 'Suspension de clases', accent: 'sky', day: 18 },
    ],
  };

  const behaviorByChild = {
    'child-sofia': {
      summary: {
        score: 91,
        trend: 'Mejorando',
        positiveCount: 8,
        negativeCount: 1,
        recentRecognition: 'Estudiante destacada de la semana',
      },
      reports: [
        { id: 'sofia-beh-1', title: 'Participó activamente en clase', date: '2 abr. · 9:20 a. m.', teacher: 'Profe Natalia Ruiz', type: 'Positivo', category: 'Participación', description: 'Compartió respuestas con seguridad y ayudó a cerrar la actividad grupal.', tone: 'positive' },
        { id: 'sofia-beh-2', title: 'Excelente disposición con sus compañeros', date: '31 mar. · 11:10 a. m.', teacher: 'Profe Daniel Casas', type: 'Positivo', category: 'Respeto', description: 'Mostró escucha activa y buena actitud durante el trabajo colaborativo.', tone: 'positive' },
        { id: 'sofia-beh-3', title: 'Debe reforzar orden de materiales', date: '27 mar. · 1:35 p. m.', teacher: 'Coordinación primaria', type: 'Seguimiento', category: 'Responsabilidad', description: 'Olvidó guardar parte del material al finalizar la jornada.', tone: 'neutral' },
      ],
      categories: [
        { id: 'sofia-cat-1', label: 'Respeto', icon: '🤝', score: 94 },
        { id: 'sofia-cat-2', label: 'Responsabilidad', icon: '📚', score: 84 },
        { id: 'sofia-cat-3', label: 'Participación', icon: '🗣️', score: 95 },
        { id: 'sofia-cat-4', label: 'Puntualidad', icon: '⏰', score: 88 },
        { id: 'sofia-cat-5', label: 'Actitud', icon: '🧠', score: 93 },
      ],
      evolution: [
        { id: 'sofia-evo-1', label: 'Ultimos 7 dias', score: 90 },
        { id: 'sofia-evo-2', label: 'Ultimo mes', score: 87 },
        { id: 'sofia-evo-3', label: 'Periodo academico', score: 84 },
      ],
      recognitions: [
        { id: 'sofia-rec-1', title: 'Estudiante destacada de la semana', date: 'Abril' },
        { id: 'sofia-rec-2', title: 'Excelente comportamiento', date: 'Marzo' },
        { id: 'sofia-rec-3', title: 'Liderazgo en clase', date: 'Febrero' },
      ],
      alerts: [
        { id: 'sofia-alert-1', title: 'Mejoró significativamente en participación', detail: 'Ha sostenido reportes positivos durante las últimas dos semanas.', tone: 'good' },
      ],
      teacherComments: [
        { id: 'sofia-comment-1', teacher: 'Profe Natalia Ruiz', text: 'Sofía responde muy bien al refuerzo positivo y mantiene buena disposición en clase.' },
        { id: 'sofia-comment-2', teacher: 'Coordinación primaria', text: 'Conviene reforzar en casa la rutina de revisar útiles antes de salir del salón.' },
      ],
      aiInsights: [
        { id: 'sofia-ai-1', title: 'Se destaca más al inicio de la jornada', detail: 'Su comportamiento y participación son más altos en los bloques de la mañana.', tone: 'good' },
        { id: 'sofia-ai-2', title: 'Mejora cuando entrega tareas a tiempo', detail: 'Los días con tareas completas muestran mejor concentración y menor distracción.', tone: 'neutral' },
      ],
      recommendations: [
        { id: 'sofia-rec-action-1', text: 'Mantener refuerzo positivo por participación y trabajo en equipo.' },
        { id: 'sofia-rec-action-2', text: 'Crear una rutina breve para revisar materiales antes de salir del aula.' },
      ],
      history: [
        { id: 'sofia-hist-1', period: 'Periodo 1', detail: 'Sin casos disciplinarios abiertos. Seguimiento solo por orden de materiales.' },
        { id: 'sofia-hist-2', period: 'Periodo 2', detail: 'Tendencia positiva sostenida y reconocimiento por liderazgo.' },
      ],
    },
    'child-tomas': {
      summary: {
        score: 72,
        trend: 'Empeorando',
        positiveCount: 3,
        negativeCount: 5,
        recentRecognition: 'Reconocimiento por mejora en laboratorio',
      },
      reports: [
        { id: 'tomas-beh-1', title: 'Interrumpió varias veces la clase', date: '3 abr. · 7:40 a. m.', teacher: 'Profe Lina Cárdenas', type: 'Negativo', category: 'Actitud', description: 'Le costó mantener la atención durante la explicación inicial del laboratorio.', tone: 'negative' },
        { id: 'tomas-beh-2', title: 'Llegó tarde a primera hora', date: '3 abr. · 7:50 a. m.', teacher: 'Coordinación', type: 'Negativo', category: 'Puntualidad', description: 'Acumuló 12 minutos de retraso en el ingreso al bloque de ciencias.', tone: 'negative' },
        { id: 'tomas-beh-3', title: 'Buena disposición en debate de Sociales', date: '1 abr. · 9:35 a. m.', teacher: 'Profe Camilo Ochoa', type: 'Positivo', category: 'Participación', description: 'Escuchó a sus compañeros y argumentó con respeto durante la actividad.', tone: 'positive' },
      ],
      categories: [
        { id: 'tomas-cat-1', label: 'Respeto', icon: '🤝', score: 74 },
        { id: 'tomas-cat-2', label: 'Responsabilidad', icon: '📚', score: 68 },
        { id: 'tomas-cat-3', label: 'Participación', icon: '🗣️', score: 79 },
        { id: 'tomas-cat-4', label: 'Puntualidad', icon: '⏰', score: 60 },
        { id: 'tomas-cat-5', label: 'Actitud', icon: '🧠', score: 66 },
      ],
      evolution: [
        { id: 'tomas-evo-1', label: 'Ultimos 7 dias', score: 68 },
        { id: 'tomas-evo-2', label: 'Ultimo mes', score: 74 },
        { id: 'tomas-evo-3', label: 'Periodo academico', score: 78 },
      ],
      recognitions: [
        { id: 'tomas-rec-1', title: 'Reconocimiento por mejora en laboratorio', date: 'Marzo' },
        { id: 'tomas-rec-2', title: 'Participación destacada en Sociales', date: 'Febrero' },
      ],
      alerts: [
        { id: 'tomas-alert-1', title: '3 reportes negativos esta semana', detail: 'Se concentran en puntualidad y actitud al inicio de la jornada.', tone: 'danger' },
        { id: 'tomas-alert-2', title: 'Bajó en respeto en los últimos días', detail: 'Necesita mejorar escucha activa y control de interrupciones.', tone: 'warn' },
      ],
      teacherComments: [
        { id: 'tomas-comment-1', teacher: 'Profe Lina Cárdenas', text: 'Tomás tiene potencial, pero necesita llegar con mejor disposición a las clases de primera hora.' },
        { id: 'tomas-comment-2', teacher: 'Coordinación académica', text: 'Recomendamos acompañar en casa la rutina de sueño para mejorar puntualidad y enfoque.' },
      ],
      aiInsights: [
        { id: 'tomas-ai-1', title: 'Tiende a distraerse los lunes', detail: 'Los reportes negativos aumentan al inicio de semana, especialmente en primeras horas.', tone: 'warn' },
        { id: 'tomas-ai-2', title: 'Mejora cuando entrega tareas a tiempo', detail: 'Durante las semanas con entregas completas, se reducen las observaciones negativas.', tone: 'good' },
        { id: 'tomas-ai-3', title: 'Reforzar disciplina en horarios nocturnos', detail: 'Se detecta menor autorregulación después de jornadas con descanso insuficiente.', tone: 'danger' },
      ],
      recommendations: [
        { id: 'tomas-rec-action-1', text: 'Hablar en casa sobre respeto durante las explicaciones del docente.' },
        { id: 'tomas-rec-action-2', text: 'Establecer rutina nocturna para mejorar puntualidad y disposición.' },
        { id: 'tomas-rec-action-3', text: 'Usar refuerzo positivo cuando complete la semana sin llamados de atención.' },
      ],
      history: [
        { id: 'tomas-hist-1', period: 'Periodo 1', detail: 'Seguimiento por llegadas tarde y dos reportes por interrupciones en clase.' },
        { id: 'tomas-hist-2', period: 'Periodo 2', detail: 'Mejora parcial en participación, pero persisten alertas en puntualidad.' },
      ],
    },
  };

  const attendanceByChild = {
    'child-sofia': {
      lateCount: 1,
      excusedAbsences: 1,
      unexcusedAbsences: 0,
      records: [
        { id: 'sofia-att-1', date: '4 abr.', status: 'Presente', note: 'Ingreso puntual' },
        { id: 'sofia-att-2', date: '3 abr.', status: 'Presente', note: 'Sin novedades' },
        { id: 'sofia-att-3', date: '2 abr.', status: 'Tarde', note: 'Ingreso 8 minutos tarde' },
        { id: 'sofia-att-4', date: '28 mar.', status: 'Justificada', note: 'Cita medica' },
      ],
    },
    'child-tomas': {
      lateCount: 3,
      excusedAbsences: 1,
      unexcusedAbsences: 1,
      records: [
        { id: 'tomas-att-1', date: '4 abr.', status: 'Presente', note: 'Sin novedades' },
        { id: 'tomas-att-2', date: '3 abr.', status: 'Tarde', note: 'Ingreso 12 minutos tarde' },
        { id: 'tomas-att-3', date: '2 abr.', status: 'Ausente', note: 'Sin soporte cargado' },
        { id: 'tomas-att-4', date: '28 mar.', status: 'Justificada', note: 'Consulta odontologica' },
      ],
    },
  };

  const insightsByChild = {
    'child-sofia': [
      { id: 'sofia-gio-1', title: 'Ha mejorado 20% en lectura', detail: 'Sofia subio su desempeno en comprension de lectura durante las ultimas tres semanas.', tone: 'good' },
      { id: 'sofia-gio-2', title: 'Mantiene nivel alto en ingles', detail: 'Conviene sostener rutinas cortas de practica oral para conservar la tendencia.', tone: 'neutral' },
      { id: 'sofia-gio-3', title: 'Recomendacion de refuerzo', detail: 'Dedicar 25 minutos a fracciones y resolucion de problemas antes del examen.', tone: 'warn' },
    ],
    'child-tomas': [
      { id: 'tomas-gio-1', title: 'Riesgo academico en Fisica', detail: 'Tu hijo tiene riesgo de perder Fisica si no mejora el promedio del siguiente quiz.', tone: 'danger' },
      { id: 'tomas-gio-2', title: 'Mejora sostenida en Sociales', detail: 'Ha mejorado 12% en participacion y calidad de entregas durante el periodo.', tone: 'good' },
      { id: 'tomas-gio-3', title: 'Recomendamos reforzar estos temas', detail: 'Velocidad, aceleracion y lectura de enunciados con datos implicitos.', tone: 'warn' },
    ],
  };

  const rankingByChild = {
    'child-sofia': { position: 4, total: 32, trend: 'Subiendo', detail: 'Subio 2 puestos frente al corte anterior.' },
    'child-tomas': { position: 18, total: 29, trend: 'Bajando', detail: 'Perdio 3 puestos por entregas tardias en ciencias.' },
  };

  return {
    ranking: rankingByChild[child.id],
    calendar: calendarByChild[child.id] || [],
    behavior: behaviorByChild[child.id],
    attendance: attendanceByChild[child.id],
    insights: insightsByChild[child.id] || [],
    gradebook: buildGradebookForChild(child),
  };
}

function buildParentPreviewWorkspace(currentUser = null) {
  const teacherName = 'Docente asignado';
  const recentPosts = [];
  const highlightedTasks = recentPosts.filter((post) => ['Tarea', 'Quiz', 'Examen', 'Proyecto'].includes(post.type)).slice(0, 4);
  const highlightedMaterials = recentPosts.filter((post) => post.type === 'Material').slice(0, 3);
  const selectedSchoolId = String(currentUser?.schoolId || localStorage.getItem('selectedSchoolId') || 'Colegio Los Molinos').trim();
  const schoolDisplayName = getSchoolDisplayName(currentUser || selectedSchoolId, 'Colegio Los Molinos').toLocaleUpperCase('es-CO');
  const guardianName = String(currentUser?.name || currentUser?.username || 'Angela Medina').trim();

  return {
    guardian: {
      name: guardianName || 'Angela Medina',
      schoolName: schoolDisplayName || 'COLEGIO LOS MOLINOS',
      roleLabel: 'Acudiente principal',
      unreadCount: 7,
    },
    stories: [
      { id: 'story-1', label: 'Rectoria', accent: 'gold' },
      { id: 'story-2', label: 'Secretaria', accent: 'rose' },
      { id: 'story-3', label: 'Deportes', accent: 'navy' },
      { id: 'story-4', label: 'Cafeteria', accent: 'green' },
      { id: 'story-5', label: 'Ruta 3', accent: 'sky' },
    ],
    announcements: [
      {
        id: 'announcement-1',
        authorName: 'Deportes',
        authorRole: 'Canal institucional',
        category: 'Deportes',
        caption: 'Las estudiantes de sexto, séptimo y octavo grado se coronaron campeonas de la Copa Thanksgiving tras imponerse con autoridad a la selección del colegio British. El equipo aseguró el título con una sólida victoria 3-0, reflejo del trabajo táctico, la disciplina y el alto nivel competitivo mostrado durante el torneo.',
        publishedAt: 'Hoy · 3:50 p. m.',
        imageLabel: 'Soccer femenino campeón de la Copa Thanksgiving',
        media: [
          {
            id: 'announcement-1-media-1',
            src: femImage,
            alt: 'Soccer femenino campeón de la Copa Thanksgiving',
          },
        ],
        tone: 'breaking',
      },
      {
        id: 'announcement-2',
        authorName: 'Secretaría Académica',
        authorRole: 'Secretaría Académica',
        category: 'Secretaría',
        caption: 'Se les informa a todos los padres y acudientes que la entrega de informes del tercer periodo se llevará a cabo el sábado 18 de abril, desde las 7:00 a. m. hasta la 1:00 p. m.',
        publishedAt: 'Hoy · 8:10 a. m.',
        imageLabel: 'Entrega de informes',
        media: [
          {
            id: 'announcement-2-media-1',
            src: informesImage,
            alt: 'Entrega de informes del tercer periodo',
          },
        ],
        tone: 'neutral',
      },
      {
        id: 'announcement-3',
        authorName: 'English Class',
        authorRole: 'Departamento de Inglés',
        category: 'English',
        caption: 'Los estudiantes de primero y segundo grado participarán en la jornada de Spelling Bee, un espacio diseñado para fortalecer vocabulario, pronunciación y seguridad al expresarse en inglés. La actividad reunirá a ambos niveles en una experiencia formativa y dinámica, enfocada en el aprendizaje y la participación de cada alumno.',
        publishedAt: 'Ayer · 6:20 p. m.',
        imageLabel: 'Spelling Bee competition',
        media: [
          {
            id: 'announcement-3-media-1',
            src: spellingImage,
            alt: 'Spelling Bee competition para estudiantes de primero y segundo grado',
          },
        ],
        tone: 'neutral',
      },
    ],
    children: [
      {
        id: 'child-sofia',
        name: 'Sofia Medina',
        grade: '6A',
        relationship: 'Hija',
        avatar: 'SM',
        headline: 'Matematicas fuerte y agenda controlada.',
        attendanceRate: '98%',
        averageScore: 4.5,
        pendingTasks: 2,
        cafeteriaStatus: 'Saldo disponible',
        nursingStatus: 'Sin alertas criticas',
        subjects: [
          { id: 'subj-sofia-math', name: 'Matematicas', teacher: teacherName, average: 4.6, tone: 'good', status: 'Al dia' },
          { id: 'subj-sofia-language', name: 'Lenguaje', teacher: 'Profe Natalia Ruiz', average: 4.2, tone: 'good', status: 'Lectura guiada' },
          { id: 'subj-sofia-english', name: 'Ingles', teacher: 'Profe Daniel Casas', average: 4.7, tone: 'good', status: 'Excelente avance' },
        ],
        tasks: [
          {
            id: 'task-sofia-1',
            title: highlightedTasks[0]?.title || 'Taller base Matematicas 6A',
            course: 'Matematicas 6A',
            dueLabel: 'Hoy · 6:00 p. m.',
            urgency: 'high',
            meta: 'Entregar 8 ejercicios resueltos y una foto del cuaderno.',
          },
          {
            id: 'task-sofia-2',
            title: 'Lectura comentada capitulo 4',
            course: 'Lenguaje',
            dueLabel: 'Manana · 7:00 a. m.',
            urgency: 'medium',
            meta: 'Subir audio corto con idea principal del capitulo.',
          },
        ],
        materials: [
          {
            id: 'material-sofia-1',
            title: highlightedMaterials[0]?.title || 'Material de apoyo Matematicas 6A',
            course: 'Matematicas 6A',
            type: 'PDF + enlace',
          },
          {
            id: 'material-sofia-2',
            title: 'Tarjetas de vocabulario unidad 3',
            course: 'Ingles',
            type: 'Flashcards',
          },
        ],
        schedule: [
          { id: 'schedule-sofia-1', time: '7:00 a. m.', title: 'Matematicas', detail: 'Bloque de conceptos base · Salon 204' },
          { id: 'schedule-sofia-2', time: '10:30 a. m.', title: 'Ingles', detail: 'Actividad oral en parejas' },
          { id: 'schedule-sofia-3', time: '1:15 p. m.', title: 'Club de lectura', detail: 'Biblioteca principal' },
        ],
        finance: {
          balanceDue: 1835000,
          nextDueLabel: 'Pensión abril · vence el 10 de abril',
          status: 'Al día con un cargo complementario pendiente',
          recentPayments: [
            { id: 'finance-sofia-payment-1', concept: 'Matrícula 2026', paidAt: '22 de mar. · 9:14 a. m.', amount: 6500000, channel: 'PSE' },
            { id: 'finance-sofia-payment-2', concept: 'Pensión marzo', paidAt: '10 de mar. · 7:42 a. m.', amount: 1835000, channel: 'Epayco' },
            { id: 'finance-sofia-payment-3', concept: 'Libros Sexto Grado', paidAt: '18 de feb. · 4:20 p. m.', amount: 2726000, channel: 'Tarjeta' },
          ],
          items: [
            { id: 'finance-sofia-1', concept: 'Pensión abril', status: 'Pendiente', amount: 1835000, accent: 'warn' },
            { id: 'finance-sofia-2', concept: 'Convivencia', status: 'Pendiente', amount: 750000, accent: 'neutral' },
            { id: 'finance-sofia-3', concept: 'Amor y amistad', status: 'Programado', amount: 90000, accent: 'good' },
          ],
        },
        cafeteria: {
          walletBalance: 28500,
          monthlySpend: 132500,
          dailyLimit: 18000,
          lastOrder: 'Combo saludable · wrap de pollo + jugo natural',
          spending: {
            day: 12500,
            week: 36400,
            month: 132500,
          },
          recentOrders: [
            { id: 'cafeteria-sofia-order-1', total: 12500, storeName: 'TeachMe Primaria', itemsCount: 2, createdAt: '27 de mar., 05:39 p. m.' },
            { id: 'cafeteria-sofia-order-2', total: 4500, storeName: 'TeachMe Primaria', itemsCount: 1, createdAt: '27 de mar., 05:38 p. m.' },
            { id: 'cafeteria-sofia-order-3', total: 3000, storeName: 'TeachMe Primaria', itemsCount: 1, createdAt: '27 de mar., 05:37 p. m.' },
            { id: 'cafeteria-sofia-order-4', total: 7600, storeName: 'TeachMe Primaria', itemsCount: 2, createdAt: '27 de mar., 01:33 p. m.' },
            { id: 'cafeteria-sofia-order-5', total: 5800, storeName: 'TeachMe Primaria', itemsCount: 1, createdAt: '27 de mar., 01:32 p. m.' },
          ],
          recentTopups: [
            { id: 'cafeteria-sofia-topup-1', amount: 50000, method: 'PSE', createdAt: '26 de mar., 07:20 a. m.', notes: 'Recarga aprobada para consumo semanal.' },
            { id: 'cafeteria-sofia-topup-2', amount: 30000, method: 'Nequi', createdAt: '20 de mar., 06:42 p. m.', notes: 'Recarga manual realizada por acudiente.' },
          ],
          blockedCategories: [
            { id: 'cafeteria-sofia-cat-1', name: 'Gaseosas', detail: 'Productos azucarados y bebidas carbonatadas.', status: 'Bloqueada' },
            { id: 'cafeteria-sofia-cat-2', name: 'Paquetes', detail: 'Snacks de paquete y productos ultra procesados.', status: 'Activa' },
            { id: 'cafeteria-sofia-cat-3', name: 'Dulces', detail: 'Gomas, caramelos y chocolates.', status: 'Activa' },
          ],
          meriendas: {
            status: 'Suscripción activa',
            note: 'Recibe la merienda institucional y puede cancelar con 24 horas de antelación.',
            schedule: [
              { id: 'cafeteria-sofia-merienda-1', day: 'Lunes', menu: 'Wrap de pollo + jugo natural', status: 'Confirmada' },
              { id: 'cafeteria-sofia-merienda-2', day: 'Miércoles', menu: 'Fruta + yogur + galleta integral', status: 'Confirmada' },
              { id: 'cafeteria-sofia-merienda-3', day: 'Viernes', menu: 'Sándwich de pavo + bebida', status: 'Pendiente' },
            ],
          },
          gioInsights: [
            { id: 'cafeteria-sofia-gio-1', title: 'Consumo equilibrado esta semana', detail: 'Predominan compras de fruta, wraps y bebidas sin azúcar.', tone: 'good' },
            { id: 'cafeteria-sofia-gio-2', title: 'Mantiene gasto controlado', detail: 'El consumo se mantiene por debajo del tope diario configurado.', tone: 'neutral' },
          ],
          transactions: [
            { id: 'cafeteria-sofia-1', label: 'Wrap + jugo natural', meta: 'Hoy · 9:42 a. m.', amount: 12500 },
            { id: 'cafeteria-sofia-2', label: 'Fruta picada', meta: 'Ayer · 10:10 a. m.', amount: 4500 },
            { id: 'cafeteria-sofia-3', label: 'Botella de agua', meta: 'Ayer · 1:02 p. m.', amount: 3000 },
          ],
        },
        nursing: {
          status: 'Seguimiento ligero',
          note: 'Sin novedades graves. Se reporto leve dolor de cabeza y respondio bien con hidratacion y descanso.',
          updates: [
            { id: 'nursing-sofia-1', label: 'Control de sintomas', meta: 'Hoy · 11:20 a. m.' },
            { id: 'nursing-sofia-2', label: 'Llamada no requerida', meta: 'Sin contacto adicional' },
          ],
        },
        transport: {
          routeName: 'Ruta 3 · Norte',
          operator: 'Carlos Mendoza',
          stop: 'Parque del barrio',
          eta: '6:24 a. m.',
          note: 'Cuando el vehiculo salga de la parada anterior, la app enviara aviso al acudiente.',
        },
        study: {
          readiness: 'Alta',
          nextFocus: 'Repasar fracciones y lectura de problemas.',
          recommendedMinutes: 25,
        },
      },
      {
        id: 'child-tomas',
        name: 'Tomas Medina',
        grade: '10A',
        relationship: 'Hijo',
        avatar: 'TM',
        headline: 'Necesita seguimiento en fisica y organizar entregas.',
        attendanceRate: '95%',
        averageScore: 3.4,
        pendingTasks: 3,
        cafeteriaStatus: 'Consumo en rango',
        nursingStatus: 'Observacion reciente',
        subjects: [
          { id: 'subj-tomas-physics', name: 'Fisica', teacher: teacherName, average: 3.1, tone: 'warn', status: 'Requiere refuerzo' },
          { id: 'subj-tomas-history', name: 'Sociales', teacher: 'Profe Camilo Ochoa', average: 3.8, tone: 'neutral', status: 'Estable' },
          { id: 'subj-tomas-chemistry', name: 'Quimica', teacher: 'Profe Lina Cardenas', average: 3.3, tone: 'warn', status: 'Pendiente laboratorio' },
        ],
        tasks: [
          {
            id: 'task-tomas-1',
            title: highlightedTasks[1]?.title || 'Quiz de cinematica',
            course: 'Fisica 10A',
            dueLabel: 'Hoy · 4:30 p. m.',
            urgency: 'high',
            meta: 'Subir hoja de trabajo con problemas 2, 3 y 5.',
          },
          {
            id: 'task-tomas-2',
            title: 'Informe corto de laboratorio',
            course: 'Quimica',
            dueLabel: 'Manana · 8:00 a. m.',
            urgency: 'medium',
            meta: 'Conclusiones y fotografia del montaje experimental.',
          },
          {
            id: 'task-tomas-3',
            title: 'Comentario de lectura historica',
            course: 'Sociales',
            dueLabel: 'Viernes · 6:00 p. m.',
            urgency: 'low',
            meta: 'Maximo 350 palabras en plataforma.',
          },
        ],
        materials: [
          {
            id: 'material-tomas-1',
            title: highlightedMaterials[1]?.title || 'Material de apoyo Fisica 10A',
            course: 'Fisica 10A',
            type: 'Guia + video',
          },
          {
            id: 'material-tomas-2',
            title: 'Resumen de formulas de movimiento',
            course: 'Fisica 10A',
            type: 'Infografia',
          },
        ],
        schedule: [
          { id: 'schedule-tomas-1', time: '7:30 a. m.', title: 'Fisica', detail: 'Laboratorio · movimiento rectilineo' },
          { id: 'schedule-tomas-2', time: '9:30 a. m.', title: 'Sociales', detail: 'Debate corto por grupos' },
          { id: 'schedule-tomas-3', time: '12:45 p. m.', title: 'Quimica', detail: 'Entrega de informe final' },
        ],
        finance: {
          balanceDue: 692000,
          nextDueLabel: 'Pensión abril · vence el 10 de abril',
          status: 'Tiene pensión y uniforme pendientes',
          recentPayments: [
            { id: 'finance-tomas-payment-1', concept: 'Pensión marzo', paidAt: '11 de mar. · 10:12 a. m.', amount: 380000, channel: 'PSE' },
            { id: 'finance-tomas-payment-2', concept: 'Laboratorio de química', paidAt: '28 de feb. · 3:45 p. m.', amount: 42000, channel: 'Epayco' },
          ],
          items: [
            { id: 'finance-tomas-1', concept: 'Pensión abril', status: 'Pendiente', amount: 380000, accent: 'warn' },
            { id: 'finance-tomas-2', concept: 'Uniforme deportivo', status: 'Pendiente', amount: 162000, accent: 'neutral' },
            { id: 'finance-tomas-3', concept: 'Salida pedagógica', status: 'Pendiente', amount: 150000, accent: 'warn' },
          ],
        },
        cafeteria: {
          walletBalance: 16400,
          monthlySpend: 174000,
          dailyLimit: 22000,
          lastOrder: 'Sandwich integral + bebida hidratante',
          spending: {
            day: 14000,
            week: 52200,
            month: 174000,
          },
          recentOrders: [
            { id: 'cafeteria-tomas-order-1', total: 9800, storeName: 'TeachMe Bachillerato', itemsCount: 1, createdAt: '27 de mar., 05:39 p. m.' },
            { id: 'cafeteria-tomas-order-2', total: 4200, storeName: 'TeachMe Bachillerato', itemsCount: 1, createdAt: '27 de mar., 05:38 p. m.' },
            { id: 'cafeteria-tomas-order-3', total: 3800, storeName: 'TeachMe Bachillerato', itemsCount: 1, createdAt: '27 de mar., 05:37 p. m.' },
            { id: 'cafeteria-tomas-order-4', total: 6200, storeName: 'TeachMe Bachillerato', itemsCount: 2, createdAt: '27 de mar., 01:33 p. m.' },
            { id: 'cafeteria-tomas-order-5', total: 7100, storeName: 'TeachMe Bachillerato', itemsCount: 2, createdAt: '27 de mar., 01:32 p. m.' },
          ],
          recentTopups: [
            { id: 'cafeteria-tomas-topup-1', amount: 70000, method: 'Tarjeta', createdAt: '25 de mar., 08:15 a. m.', notes: 'Recarga para semana de exámenes.' },
            { id: 'cafeteria-tomas-topup-2', amount: 40000, method: 'PSE', createdAt: '18 de mar., 07:42 p. m.', notes: 'Recarga adicional por actividades deportivas.' },
          ],
          blockedCategories: [
            { id: 'cafeteria-tomas-cat-1', name: 'Bebidas energéticas', detail: 'Productos con alto contenido de cafeína.', status: 'Bloqueada' },
            { id: 'cafeteria-tomas-cat-2', name: 'Comida rápida', detail: 'Combos fritos y productos de alto sodio.', status: 'Activa' },
            { id: 'cafeteria-tomas-cat-3', name: 'Dulces', detail: 'Caramelos y snacks de azúcar alta.', status: 'Bloqueada' },
          ],
          meriendas: {
            status: 'En lista de espera',
            note: 'Puede activarse en cuanto haya cupo para bachillerato en la ruta de meriendas.',
            schedule: [
              { id: 'cafeteria-tomas-merienda-1', day: 'Martes', menu: 'Snack alto en proteína', status: 'Sujeto a cupo' },
              { id: 'cafeteria-tomas-merienda-2', day: 'Jueves', menu: 'Barra de cereal + bebida', status: 'Sujeto a cupo' },
            ],
          },
          gioInsights: [
            { id: 'cafeteria-tomas-gio-1', title: 'Pico de consumo en descanso largo', detail: 'Las compras se concentran entre 9:50 a. m. y 10:15 a. m.', tone: 'warn' },
            { id: 'cafeteria-tomas-gio-2', title: 'Dos categorías bloqueadas activas', detail: 'El sistema ya evita compras en dulces y bebidas energéticas.', tone: 'good' },
          ],
          transactions: [
            { id: 'cafeteria-tomas-1', label: 'Sandwich integral', meta: 'Hoy · 10:08 a. m.', amount: 9800 },
            { id: 'cafeteria-tomas-2', label: 'Bebida hidratante', meta: 'Hoy · 10:09 a. m.', amount: 4200 },
            { id: 'cafeteria-tomas-3', label: 'Galletas avena', meta: 'Ayer · 1:15 p. m.', amount: 3800 },
          ],
        },
        nursing: {
          status: 'Observacion en lectura',
          note: 'Ingreso por golpe leve en educacion fisica. Se aplico frio local y se notifico que puede continuar clase con vigilancia.',
          updates: [
            { id: 'nursing-tomas-1', label: 'Atencion por golpe leve', meta: 'Ayer · 2:05 p. m.' },
            { id: 'nursing-tomas-2', label: 'Sin salida anticipada', meta: 'Seguimiento interno' },
          ],
        },
        transport: {
          routeName: 'Ruta 7 · Sur',
          operator: 'Luis Caballero',
          stop: 'Porteria conjunto Acacias',
          eta: '6:41 a. m.',
          note: 'La ruta tiene ajuste temporal de recorrido por obras; se notificara la salida de cada parada.',
        },
        study: {
          readiness: 'Media',
          nextFocus: 'Practicar problemas de velocidad y aceleracion antes del quiz.',
          recommendedMinutes: 40,
        },
      },
    ],
  };
}

function ParentAppIcon({ icon }) {
  if (icon === 'home') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-4.8v-6.1H9.8V21H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }
  if (icon === 'money') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 3v18M16.5 7.2c0-1.7-1.8-3.2-4.5-3.2S7.5 5.3 7.5 7s1.2 2.6 4.4 3.3 4.6 1.5 4.6 3.4-1.8 3.3-4.5 3.3-4.8-1.4-4.8-3.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }
  if (icon === 'book') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M6.5 5.5h8.8a2.7 2.7 0 0 1 2.7 2.7v10.3H9.2A2.7 2.7 0 0 0 6.5 21z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M6.5 5.5A2.5 2.5 0 0 0 4 8v10.5A2.5 2.5 0 0 1 6.5 16H18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }
  if (icon === 'food') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M7 3v8M10 3v8M7 7h3M16 3c-1.7 0-3 1.7-3 3.8 0 1.5.7 2.9 1.8 3.5V21M8.5 11v10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }
  if (icon === 'game') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M8.5 14.2h2.8M9.9 12.8v2.8M15.8 13.3h.01M17.6 11.5h.01M7.8 8.4h8.4a3.6 3.6 0 0 1 3.6 3.6v3.2a3.6 3.6 0 0 1-3.6 3.6H7.8a3.6 3.6 0 0 1-3.6-3.6v-3.2a3.6 3.6 0 0 1 3.6-3.6Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }
  if (icon === 'nursing') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 21s-6.5-4.3-8.7-8.4A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 8.7 6.6C18.5 16.7 12 21 12 21Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M12 8.6v4.8M9.6 11h4.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (icon === 'wellbeing') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 20c-3.6-2-6-4.8-6-8.2C6 7.6 9.2 4 12 4s6 3.6 6 7.8c0 3.4-2.4 6.2-6 8.2Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M9.3 12.3c1.8.3 3.4-.5 4.4-2.1M12 20v-5.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (icon === 'transport') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M6.3 16.2h11.4M7.2 18.6v.7m9.6-.7v.7M5.7 7.8c.3-1.5 1.5-2.5 3-2.5h6.6c1.5 0 2.7 1 3 2.5l.8 4.6c.2 1.2-.7 2.3-1.9 2.3H6.8c-1.2 0-2.1-1.1-1.9-2.3l.8-4.6Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M8.2 10.2h7.6M8.3 13h.1m7.2 0h.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 16.2V8.8l8-4.8 8 4.8v7.4M7.5 17.5h9M9 20h6M6.7 8.8l5.3 3.2 5.3-3.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function ParentCareOptionIcon({ icon }) {
  if (icon === 'wellbeing') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 20c-3.6-2-6-4.8-6-8.2C6 7.6 9.2 4 12 4s6 3.6 6 7.8c0 3.4-2.4 6.2-6 8.2Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M9.3 12.3c1.8.3 3.4-.5 4.4-2.1M12 20v-5.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  if (icon === 'coexistence') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M7.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
        <path d="M3.5 20c.5-3.1 2.2-5.2 4-5.2s3.4 2.1 4 5.2M12.5 20c.5-3.1 2.2-5.2 4-5.2s3.5 2.1 4 5.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  return <ParentAppIcon icon="nursing" />;
}

function ParentTransportHeroIcon() {
  return (
    <span className="campus-parent-mobile__transport-hero-icon" aria-hidden="true">
      <ParentAppIcon icon="transport" />
    </span>
  );
}

function ParentTransportInfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" fill="currentColor" opacity="0.14" r="10" />
      <path d="M12 10.2v5.2M12 8.1h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
    </svg>
  );
}

function ParentTransportBellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 4.2c2.4 0 4.3 1.9 4.3 4.3v2.4l1.2 2.1a1 1 0 0 1-.9 1.4H7.4a1 1 0 0 1-.9-1.4l1.2-2.1V8.5c0-2.4 1.9-4.3 4.3-4.3Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      <path d="M10.1 18.2a1.9 1.9 0 0 0 3.8 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function ParentTransportSceneIllustration() {
  return (
    <svg aria-hidden="true" className="campus-parent-mobile__transport-illustration" viewBox="0 0 360 200">
      <defs>
        <linearGradient id="parent-transport-road" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#dbeafe" />
          <stop offset="100%" stopColor="#bfdbfe" />
        </linearGradient>
      </defs>
      <ellipse cx="180" cy="176" fill="#e0f2fe" rx="150" ry="18" />
      <path d="M0 154h360v18c0 8-70 14-180 14S0 180 0 172Z" fill="url(#parent-transport-road)" />
      <path d="M0 168h360" stroke="#93c5fd" strokeDasharray="10 12" strokeWidth="2" />
      <rect fill="#eff6ff" height="34" opacity="0.9" rx="6" width="42" x="34" y="112" />
      <path d="M40 146h30v-8H40Z" fill="#dbeafe" />
      <rect fill="#eff6ff" height="28" opacity="0.85" rx="5" width="36" x="286" y="118" />
      <path d="M292 146h24v-6h-24Z" fill="#dbeafe" />
      <circle cx="312" cy="104" fill="#dcfce7" r="16" />
      <path d="M312 92v8M308 100h8" stroke="#86efac" strokeLinecap="round" strokeWidth="2" />
      <ellipse cx="72" cy="58" fill="#f8fafc" rx="24" ry="10" />
      <ellipse cx="118" cy="48" fill="#f8fafc" rx="18" ry="8" />
      <ellipse cx="250" cy="54" fill="#f8fafc" rx="22" ry="9" />
      <g transform="translate(248 86)">
        <rect fill="#60a5fa" height="52" rx="8" width="14" x="0" y="0" />
        <rect fill="#3b82f6" height="10" rx="3" width="18" x="-2" y="10" />
        <circle cx="7" cy="56" fill="#2563eb" r="5" />
        <rect fill="#dbeafe" height="18" rx="2" width="12" x="20" y="8" />
        <path d="M26 8v18" stroke="#93c5fd" strokeWidth="1.5" />
      </g>
      <g transform="translate(58 98)">
        <rect fill="#38bdf8" height="34" rx="7" width="74" x="0" y="16" />
        <rect fill="#0ea5e9" height="18" rx="5" width="52" x="10" y="4" />
        <rect fill="#e0f2fe" height="12" rx="2" width="10" x="12" y="8" />
        <rect fill="#e0f2fe" height="12" rx="2" width="10" x="26" y="8" />
        <rect fill="#e0f2fe" height="12" rx="2" width="10" x="40" y="8" />
        <circle cx="20" cy="52" fill="#1d4ed8" r="7" />
        <circle cx="56" cy="52" fill="#1d4ed8" r="7" />
        <circle cx="20" cy="52" fill="#bfdbfe" r="3" />
        <circle cx="56" cy="52" fill="#bfdbfe" r="3" />
      </g>
    </svg>
  );
}

function ParentTransportSection({ hasAssignedRoute, transport }) {
  if (hasAssignedRoute) {
    return (
      <section className="campus-parent-mobile__transport-page">
        <header className="campus-parent-mobile__transport-hero">
          <ParentTransportHeroIcon />
          <span className="campus-parent-mobile__transport-kicker">Transporte escolar</span>
          <h2>{transport.routeName}</h2>
          <span aria-hidden="true" className="campus-parent-mobile__transport-accent" />
          <p>{transport.stop ? `${transport.stop} · llegada estimada ${transport.eta || 'por confirmar'}` : 'Ruta escolar asignada para este alumno.'}</p>
        </header>

        <section aria-label="Detalle de la ruta" className="campus-parent-mobile__transport-status-grid">
          <article>
            <span>Conductor</span>
            <strong>{transport.operator || 'Por confirmar'}</strong>
          </article>
          <article>
            <span>Parada</span>
            <strong>{transport.stop || 'Por confirmar'}</strong>
          </article>
          <article>
            <span>Llegada</span>
            <strong>{transport.eta || 'Por confirmar'}</strong>
          </article>
        </section>

        {transport.note ? (
          <article className="campus-parent-mobile__transport-info-card">
            <span className="campus-parent-mobile__transport-info-icon"><ParentTransportInfoIcon /></span>
            <p>{transport.note}</p>
          </article>
        ) : null}

        <ParentTransportSceneIllustration />

        <article className="campus-parent-mobile__transport-notify-card">
          <span className="campus-parent-mobile__transport-notify-icon"><ParentTransportBellIcon /></span>
          <div>
            <strong>Te avisaremos</strong>
            <p>Recibirás una notificación cuando haya novedades sobre la ruta escolar.</p>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="campus-parent-mobile__transport-page is-empty">
      <header className="campus-parent-mobile__transport-hero">
        <ParentTransportHeroIcon />
        <span className="campus-parent-mobile__transport-kicker">Transporte escolar</span>
        <h2>Sin ruta asignada</h2>
        <span aria-hidden="true" className="campus-parent-mobile__transport-accent" />
        <p>Aún no hay una ruta escolar registrada para este alumno.</p>
      </header>

      <article className="campus-parent-mobile__transport-info-card">
        <span className="campus-parent-mobile__transport-info-icon"><ParentTransportInfoIcon /></span>
        <p>Cuando el colegio asigne una ruta, aparecerán aquí el conductor, la parada y la hora estimada.</p>
      </article>

      <ParentTransportSceneIllustration />

      <article className="campus-parent-mobile__transport-notify-card">
        <span className="campus-parent-mobile__transport-notify-icon"><ParentTransportBellIcon /></span>
        <div>
          <strong>Te avisaremos</strong>
          <p>Recibirás una notificación cuando haya novedades sobre la ruta escolar.</p>
        </div>
      </article>
    </section>
  );
}

const cafeteriaMenuItems = [
  { id: 'cafeteria-overview', title: 'Inicio', icon: 'home' },
  { id: 'cafeteria-menu', title: 'Menú - bloquear productos', icon: 'food-menu' },
  { id: 'cafeteria-topups', title: 'Recargas', icon: 'wallet' },
  { id: 'cafeteria-history', title: 'Historial de órdenes', icon: 'ticket' },
  { id: 'cafeteria-limit', title: 'Limitar consumo', icon: 'limit' },
  { id: 'cafeteria-meriendas', title: 'Meriendas', icon: 'star' },
  { id: 'cafeteria-gio', title: 'GIO - IA', icon: 'sparkles' },
];

function CafeteriaMenuIcon({ icon }) {
  if (icon === 'wallet') {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M3 7a3 3 0 0 1 3-3h11a1 1 0 0 1 0 2H6a1 1 0 0 0 0 2h13a2 2 0 0 1 2 2v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Zm14 5a1.5 1.5 0 1 0 1.5 1.5A1.5 1.5 0 0 0 17 12Z" fill="currentColor"/>
      </svg>
    );
  }

  if (icon === 'home') {
    return (
      <svg viewBox="0 0 24 24">
        <path d="m12 3 9 7h-2v10h-5v-6h-4v6H5V10H3l9-7Z" fill="currentColor"/>
      </svg>
    );
  }

  if (icon === 'food-menu') {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 4h2v7a1 1 0 0 0 2 0V4h2v7a3 3 0 0 1-2 2.82V20H6v-6.18A3 3 0 0 1 4 11V4Zm10 0a4 4 0 0 1 4 4v12h-2v-5h-4v5h-2V8a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v5h4V8a2 2 0 0 0-2-2Z" fill="currentColor"/>
      </svg>
    );
  }

  if (icon === 'ticket') {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Zm7 3v2h2V9h-2Zm0 4v2h2v-2h-2Z" fill="currentColor"/>
      </svg>
    );
  }

  if (icon === 'star') {
    return (
      <svg viewBox="0 0 24 24">
        <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.1 6.5L12 17.3l-5.8 3.2 1.1-6.5-4.8-4.6 6.6-.9L12 2.5Z" fill="currentColor"/>
      </svg>
    );
  }

  if (icon === 'limit') {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M12 3a9 9 0 1 0 9 9a9 9 0 0 0-9-9Zm1 4v5.4l3.6 2.2-1 1.6L11 13.3V7h2Z" fill="currentColor"/>
      </svg>
    );
  }

  if (icon === 'sparkles') {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M12 3l1.8 4.8L18 9.6l-4.2 1.8L12 16l-1.8-4.6L6 9.6l4.2-1.8L12 3Zm7 10 1 2.7 3 1-3 1-1 2.8-1-2.8-3-1 3-1 1-2.7ZM5 14l1 2.2L8 17l-2 .8L5 20l-1-2.2L2 17l2-.8L5 14Z" fill="currentColor"/>
      </svg>
    );
  }

  return null;
}

function ParentCafeteriaContent({
  activeView,
  children,
  guardianName,
  onLogout,
  onNotificationNavigate = null,
  onSelectChild,
  onSelectView,
  onToggleChildOptions,
  onToggleMenu,
  onToggleUserMenu,
  preferStudentNotifications = false,
  selectedChild,
  showChildOptions,
  showMenu,
  showUserMenu,
  userMenuRef,
}) {
  const studentSwitcherRef = useRef(null);
  const spendingCards = [
    { id: 'day', label: 'Compras del día', amount: selectedChild.cafeteria.spending.day },
    { id: 'week', label: 'Compras de la semana', amount: selectedChild.cafeteria.spending.week },
    { id: 'month', label: 'Compras del mes', amount: selectedChild.cafeteria.spending.month },
  ];
  const parentFirstName = String(guardianName || 'Padre').split(' ')[0] || 'Padre';
  const parentInitial = String(guardianName || 'P').charAt(0).toUpperCase();

  const renderStudentAvatar = (child, sizeClass = '') => (
    <span className={`parent-student-avatar${sizeClass ? ` ${sizeClass}` : ''}`}>
      {child.thumbUrl || child.imageUrl ? (
        <img alt={child.name || 'Alumno'} decoding="async" loading="lazy" src={resolveIosCompatibleImageUrl(child.thumbUrl || child.imageUrl)} />
      ) : (child.avatar || String(child.name || 'A').slice(0, 2).toUpperCase())}
    </span>
  );

  return (
    <div className="parent-mobile-page parent-mobile-page--cafeteria">
      <header className="parent-topbar">
        <button aria-label="Abrir menu" className="parent-icon-btn" onClick={onToggleMenu} type="button">
          <span />
          <span />
          <span />
        </button>

        <div className="parent-title-wrap">
          <ComergioBrandTitle />
          <h1>{`Hola, ${parentFirstName}!`}</h1>
        </div>

        <div className="parent-topbar-actions">
          <ParentNotificationCenter
            navigationHandler={onNotificationNavigate}
            preferStudent={preferStudentNotifications}
          />
          <div className="parent-profile-wrap" ref={userMenuRef}>
            <button
              aria-expanded={showUserMenu}
              aria-haspopup="menu"
              aria-label="Abrir opciones de perfil"
              className="parent-avatar parent-avatar-btn"
              onClick={onToggleUserMenu}
              type="button"
            >
              {parentInitial}
            </button>

            {showUserMenu ? (
              <div className="parent-profile-menu" role="menu">
                <button className="logout" onClick={onLogout} type="button">
                  <span className="icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm7.6 4.6L16.2 9l2.6 2H9v2h9.8l-2.6 2 1.4 1.4L23 12l-5.4-4.4Z" fill="currentColor"/>
                    </svg>
                  </span>
                  <span>Cerrar sesión</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {showMenu ? (
        <div
          className="parent-drawer-backdrop"
          onClick={onToggleMenu}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onToggleMenu();
          }}
          role="button"
          tabIndex={0}
        />
      ) : null}

      {showUserMenu ? (
        <div
          className="parent-profile-backdrop"
          onClick={onToggleUserMenu}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onToggleUserMenu();
          }}
          role="button"
          tabIndex={0}
        />
      ) : null}

      <aside className={`parent-drawer ${showMenu ? 'open' : ''}`}>
        <h3>{`Hola, ${guardianName}`}</h3>
        <p className="parent-drawer-subtitle">¿Qué quieres hacer hoy?</p>
        <nav>
          {cafeteriaMenuItems.map((item) => (
            <button key={item.id} onClick={() => onSelectView(item.id)} type="button">
              <span className="icon" aria-hidden="true"><CafeteriaMenuIcon icon={item.icon} /></span>
              <span>{item.title}</span>
            </button>
          ))}
        </nav>

        <button className="parent-logout-btn" onClick={onLogout} type="button">
          <span className="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm7.6 4.6L16.2 9l2.6 2H9v2h9.8l-2.6 2 1.4 1.4L23 12l-5.4-4.4Z" fill="currentColor"/>
            </svg>
          </span>
          <span>Cerrar sesión</span>
        </button>
      </aside>

      <section className={`parent-student-switcher${showChildOptions ? ' is-open' : ''}`} ref={studentSwitcherRef}>
        <div className="parent-student-toggle-card">
          <button className="parent-student-toggle" onClick={onToggleChildOptions} type="button">
            <div className="parent-student-toggle-copy">
              <p className="meta">Alumno seleccionado</p>
              <h3>{selectedChild.name}</h3>
              <p>{getParentStudentGradeLabel(selectedChild)}</p>
            </div>
            <span className={`chevron ${showChildOptions ? 'open' : ''}`}>⌄</span>
          </button>

          <button aria-label={`Avatar de ${selectedChild.name}`} className="parent-student-photo-btn" type="button">
            {renderStudentAvatar(selectedChild)}
          </button>
        </div>

        <ParentStudentOptionsPortal anchorRef={studentSwitcherRef} isOpen={showChildOptions}>
            {children.map((child) => (
              <button key={child.id} onClick={() => onSelectChild(child.id)} type="button">
                {renderStudentAvatar(child, 'is-small')}
                <span className="parent-student-option-copy">
                  <strong>{child.name}</strong>
                  <span>{getParentStudentGradeLabel(child)}</span>
                </span>
              </button>
            ))}
        </ParentStudentOptionsPortal>
      </section>

      <main className="parent-mobile-content">
        {activeView === 'cafeteria-menu' ? (
          <section className="parent-menu-page" id="parent-menu-page">
            <h2>Categorías</h2>
            <p className="parent-menu-caption">Bloquea categorías completas o entra para bloquear productos puntuales.</p>
            <div className="parent-categories-grid">
              {selectedChild.cafeteria.blockedCategories.map((category) => (
                <article className="parent-category-card" key={category.id} role="button" tabIndex={0}>
                  <div className="parent-category-image-wrap">
                    <div className="parent-category-image-fallback">{String(category.name || 'C').charAt(0).toUpperCase()}</div>
                  </div>
                  <div className="parent-category-copy">
                    <strong>{category.name}</strong>
                    <p>{category.detail}</p>
                    <span>{category.status}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeView === 'cafeteria-history' ? (
          <section className="parent-history-page">
            <h2>Historial de órdenes</h2>
            <p className="parent-history-student">Alumno seleccionado: <strong>{selectedChild.name}</strong></p>
            <div className="parent-history-list parent-history-list-scroll">
              {selectedChild.cafeteria.recentOrders.map((order) => (
                <article className="is-clickable" key={order.id} role="button" tabIndex={0}>
                  <div>
                    <strong className="amount-negative">- {formatCurrency(order.total)}</strong>
                    <p>{order.storeName}</p>
                  </div>
                  <div>
                    <small>{order.itemsCount} items</small>
                    <p>{order.createdAt}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeView === 'cafeteria-topups' ? (
          <section className="parent-topups-page" id="parent-topups-section">
            <h2>Billetera</h2>
            <p className="parent-topups-subtitle">Gestiona y monitorea las recargas del alumno seleccionado.</p>
            <p className="parent-topups-student">Alumno: <strong>{selectedChild.name}</strong></p>
            <div className="parent-topups-balance-card">
              <p className="parent-topups-kicker">Saldo disponible</p>
              <h3>{formatCurrency(selectedChild.cafeteria.walletBalance)}</h3>
              <div className="parent-topups-pill">
                <span className="dot" aria-hidden="true" />
                <span>{`Recarga mínima sugerida ${formatCurrency(20000)}`}</span>
              </div>
            </div>
            <section className="parent-section">
              <h3>Ultimas recargas</h3>
              <div className="parent-list parent-list-scroll">
                {selectedChild.cafeteria.recentTopups.map((topup) => (
                  <article key={topup.id}>
                    <div>
                      <strong className="amount-positive">+ {formatCurrency(topup.amount)}</strong>
                      <p className="parent-amount-reason">{topup.notes}</p>
                      <p>{selectedChild.name}</p>
                    </div>
                    <div>
                      <small>{topup.method}</small>
                      <p>{topup.createdAt}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        {activeView === 'cafeteria-limit' ? (
          <section className="parent-limit-page" id="student-control">
            <h2>Limitar consumo diario</h2>
            <p className="parent-limit-student">Alumno seleccionado: <strong>{selectedChild.name}</strong></p>
            <div className="parent-limit-card">
              <label htmlFor="cafeteria-daily-limit-preview">
                Tope diario (COP)
                <input id="cafeteria-daily-limit-preview" readOnly type="number" value={selectedChild.cafeteria.dailyLimit} />
              </label>
              <p className="parent-limit-hint">Valor actual: <strong>{formatCurrency(selectedChild.cafeteria.dailyLimit)}</strong></p>
            </div>
          </section>
        ) : null}

        {activeView === 'cafeteria-meriendas' ? (
          <section className="parent-meriendas-page">
            <h2>Meriendas</h2>
            <p className="parent-meriendas-subtitle">Fomentemos en <strong>{selectedChild.name.split(' ')[0]}</strong> una alimentación saludable desde temprana edad.</p>
            <div className={`parent-meriendas-status ${selectedChild.cafeteria.meriendas.status === 'Suscripción activa' ? 'subscribed' : 'pending'}`}>
              <div className="parent-meriendas-status-row">
                <div>
                  <p>Estado de suscripción</p>
                  <strong>{selectedChild.cafeteria.meriendas.status}</strong>
                </div>
              </div>
              <p>{selectedChild.cafeteria.meriendas.note}</p>
            </div>
            <div className="parent-list parent-list-scroll">
              {selectedChild.cafeteria.meriendas.schedule.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.day}</strong>
                    <p>{item.menu}</p>
                  </div>
                  <div>
                    <small>{item.status}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeView === 'cafeteria-gio' ? (
          <section className="parent-gio-page">
            <h2>GIO - IA</h2>
            <p className="parent-gio-subtitle">Conversa con GIO sobre el consumo de <strong>{selectedChild.name}</strong>.</p>
            <div className="parent-gio-thread" role="log" aria-live="polite">
              <article className="parent-gio-bubble is-assistant">
                <p>{`Hola, soy GIO - IA. Estoy listo para ayudarte con el consumo de ${selectedChild.name.split(' ')[0]}.`}</p>
              </article>
              {selectedChild.cafeteria.gioInsights.map((item) => (
                <article className="parent-gio-bubble is-assistant" key={item.id}>
                  <p><strong>{item.title}:</strong> {item.detail}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeView === 'cafeteria-overview' ? (
          <>
            <section className="parent-balance-hero" id="parent-balance-section">
              <p className="meta">Saldo actual</p>
              <h2>{formatCurrency(selectedChild.cafeteria.walletBalance)}</h2>
              <p>Alumno: <strong>{selectedChild.name}</strong></p>
            </section>

            <section className="parent-spending-cards">
              {spendingCards.map((item) => (
                <article className="parent-mini-card" key={item.id}>
                  <p>{item.label}</p>
                  <h4>{formatCurrency(item.amount)}</h4>
                </article>
              ))}
            </section>

            <section className="parent-section" id="parent-orders-section">
              <h3>Últimas órdenes del alumno</h3>
              <div className="parent-list">
                {selectedChild.cafeteria.recentOrders.map((order) => (
                  <article className="is-clickable" key={order.id} role="button" tabIndex={0}>
                    <div>
                      <strong className="amount-negative">- {formatCurrency(order.total)}</strong>
                      <p>{order.storeName}</p>
                    </div>
                    <div>
                      <small>{order.itemsCount} items</small>
                      <p>{order.createdAt}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function AcademicMenuIcon({ icon }) {
  if (icon === 'performance') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 18V9M12 18V6M19 18v-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }
  if (icon === 'calendar') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }
  if (icon === 'tasks') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }
  if (icon === 'schedule') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }
  if (icon === 'behavior') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 21s-6.5-4.3-8.7-8.4A5.3 5.3 0 0 1 12 6a5.3 5.3 0 0 1 8.7 6.6C18.5 16.7 12 21 12 21Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }
  if (icon === 'grades') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 19h14M7 16V9M12 16V5M17 16v-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }
  if (icon === 'attendance') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 7h16M8 3v4M16 3v4M6 21h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Zm3-8 2 2 4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14M7.5 7.5h.01M16.5 16.5h.01M16.5 7.5h.01M7.5 16.5h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function getAnnouncementMediaItems(announcement) {
  if (!announcement || !Array.isArray(announcement.media)) {
    return [];
  }

  return announcement.media
    .map((item) => {
      const rawSrc = item?.src || item?.url || item?.imageUrl || item?.videoUrl || '';
      if (!item || !rawSrc) {
        return null;
      }

      const kind = item.kind === 'video' ? 'video' : 'image';
      return {
        ...item,
        id: item.id || `${kind}-${rawSrc}`,
        kind,
        src: kind === 'image' ? resolveIosCompatibleImageUrl(rawSrc) : resolveApiAssetUrl(rawSrc),
        thumbUrl: kind === 'image' ? resolveIosCompatibleImageUrl(item.thumbUrl || rawSrc) : resolveApiAssetUrl(item.thumbUrl || ''),
      };
    })
    .filter((item) => item && item.src);
}

function resolveIosCompatibleImageUrl(value) {
  const resolvedUrl = resolveApiAssetUrl(value);
  if (/res\.cloudinary\.com\//i.test(resolvedUrl)) {
    return resolvedUrl;
  }

  if (/\.webp(?:[?#]|$)/i.test(resolvedUrl)) {
    return resolvedUrl;
  }

  if (!/\/assets\//i.test(resolvedUrl) && !/\/uploads\//i.test(resolvedUrl)) {
    return resolvedUrl;
  }

  if (/[?&]format=jpe?g(?:&|$)/i.test(resolvedUrl)) {
    return resolvedUrl;
  }

  const separator = resolvedUrl.includes('?') ? '&' : '?';
  return `${resolvedUrl}${separator}format=jpg`;
}

function addImageRetryParam(value) {
  if (!value || /[?&]iosImageRetry=1(?:&|$)/i.test(value)) {
    return value;
  }

  const separator = value.includes('?') ? '&' : '?';
  return `${value}${separator}iosImageRetry=1`;
}

function ParentAnnouncementImage({ mediaItem, fallbackAlt }) {
  const primarySrc = mediaItem.src || mediaItem.thumbUrl;
  const secondarySrc = mediaItem.thumbUrl && mediaItem.thumbUrl !== mediaItem.src ? mediaItem.thumbUrl : '';
  const [imageSrc, setImageSrc] = useState(primarySrc);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setImageSrc(primarySrc);
    setFailed(false);
  }, [primarySrc, secondarySrc]);

  if (failed || !imageSrc) {
    return (
      <div className="campus-parent-mobile__post-image-fallback">
        <span>Imagen no disponible</span>
      </div>
    );
  }

  return (
    <img
      alt={mediaItem.alt || fallbackAlt}
      decoding="async"
      draggable={false}
      loading="lazy"
      onError={() => {
        if (secondarySrc && imageSrc !== secondarySrc) {
          setImageSrc(secondarySrc);
          return;
        }
        const retrySrc = addImageRetryParam(imageSrc);
        if (retrySrc && retrySrc !== imageSrc) {
          setImageSrc(retrySrc);
          return;
        }
        console.warn('[Comergio][ParentCampusHome] image unavailable', {
          src: imageSrc,
          mediaId: mediaItem.id,
        });
        setFailed(true);
      }}
      src={imageSrc}
    />
  );
}

function ParentAnnouncementMedia({ announcement, onLike }) {
  const mediaItems = useMemo(() => getAnnouncementMediaItems(announcement), [announcement]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showLikeBurst, setShowLikeBurst] = useState(false);
  const viewportRef = useRef(null);
  const lastTapRef = useRef(0);
  const touchStartRef = useRef(null);

  useEffect(() => {
    setActiveIndex(0);
    setScrollProgress(0);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
    }
  }, [announcement.id, mediaItems.length]);

  if (!mediaItems.length) {
    return null;
  }

  const onScroll = (event) => {
    const { scrollLeft, clientWidth } = event.currentTarget;
    if (!clientWidth) {
      return;
    }

    const nextProgress = scrollLeft / clientWidth;
    const nextIndex = Math.round(nextProgress);
    setScrollProgress(nextProgress);
    if (nextIndex !== activeIndex) {
      setActiveIndex(nextIndex);
    }
  };

  const scrollToMediaIndex = (nextIndex) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const boundedIndex = Math.max(0, Math.min(mediaItems.length - 1, nextIndex));
    viewport.scrollTo({ left: boundedIndex * viewport.clientWidth, behavior: 'smooth' });
    setActiveIndex(boundedIndex);
    setScrollProgress(boundedIndex);
  };

  const triggerAnimatedLike = () => {
    setShowLikeBurst(false);
    window.requestAnimationFrame(() => {
      setShowLikeBurst(true);
      window.setTimeout(() => setShowLikeBurst(false), 520);
    });
    onLike?.();
  };

  const onMediaTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onMediaTouchEnd = (event) => {
    const touch = event.changedTouches?.[0];
    const touchStart = touchStartRef.current;
    touchStartRef.current = null;

    if (touch && touchStart) {
      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;
      if (Math.abs(deltaX) > 34 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
        scrollToMediaIndex(activeIndex + (deltaX < 0 ? 1 : -1));
        lastTapRef.current = 0;
        return;
      }
    }

    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      triggerAnimatedLike();
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
  };

  return (
    <div className="campus-parent-mobile__post-media has-gallery" onDoubleClick={triggerAnimatedLike} onTouchEnd={onMediaTouchEnd} onTouchStart={onMediaTouchStart}>
      <div className="campus-parent-mobile__post-gallery" onScroll={onScroll} ref={viewportRef}>
        {mediaItems.map((mediaItem) => (
          <figure className="campus-parent-mobile__post-gallery-slide" key={mediaItem.id}>
            {mediaItem.kind === 'video'
              ? <video controls playsInline poster={mediaItem.thumbUrl || ''} src={mediaItem.src} />
              : <ParentAnnouncementImage fallbackAlt={announcement.imageLabel} mediaItem={mediaItem} />}
          </figure>
        ))}
      </div>
      {mediaItems.length > 1 ? (
        <>
          <div className="campus-parent-mobile__post-gallery-count">
            {activeIndex + 1}/{mediaItems.length}
          </div>
          <div aria-label={`Galeria de ${mediaItems.length} imagenes`} className="campus-parent-mobile__post-gallery-dots">
            {mediaItems.map((mediaItem, index) => {
              const distance = Math.min(1, Math.abs(scrollProgress - index));
              const dotScale = 1 + (1 - distance) * 0.58;
              return (
                <span className={index === activeIndex ? 'is-active' : ''} key={mediaItem.id} style={{ '--dot-scale': dotScale }} />
              );
            })}
          </div>
        </>
      ) : null}
      {showLikeBurst ? <div aria-hidden="true" className="campus-parent-mobile__like-burst"><FeedHeartIcon filled /></div> : null}
    </div>
  );
}

function FeedHeartIcon({ filled = false }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function FeedCommentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M21 11.7a8.2 8.2 0 0 1-8.5 8.1 9.6 9.6 0 0 1-3.8-.8L3 20.5l1.5-4.3A7.7 7.7 0 0 1 3.7 12a8.3 8.3 0 0 1 8.6-8.1A8.3 8.3 0 0 1 21 11.7Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function ParentFeedBottomSheet({ children, onClose, title }) {
  return (
    <div className="campus-parent-mobile__sheet-layer" onClick={onClose} role="presentation">
      <section aria-modal="true" className="campus-parent-mobile__sheet" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="campus-parent-mobile__sheet-handle" />
        <div className="campus-parent-mobile__sheet-head">
          <h3>{title}</h3>
          <button aria-label="Cerrar" onClick={onClose} type="button">×</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ParentAnnouncementText({ text }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const cleanText = String(text || '').trim();
  const lineCount = cleanText.split(/\r?\n/).length;
  const canExpand = cleanText.length > 280 || lineCount > 5;

  if (!cleanText) {
    return null;
  }

  return (
    <div className="campus-parent-mobile__post-message">
      <p className={canExpand && !isExpanded ? 'is-clamped' : ''}>{cleanText}</p>
      {canExpand ? (
        <button onClick={() => setIsExpanded((currentValue) => !currentValue)} type="button">
          {isExpanded ? 'Ver menos' : 'Ver más'}
        </button>
      ) : null}
    </div>
  );
}

function ParentStudentOptionsPortal({ anchorRef, children, isOpen }) {
  const [portalStyle, setPortalStyle] = useState(null);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || typeof document === 'undefined') {
      setPortalStyle(null);
      return undefined;
    }

    const updatePosition = () => {
      const anchorRect = anchorRef?.current?.getBoundingClientRect?.();
      if (!anchorRect) {
        setPortalStyle(null);
        return;
      }

      setPortalStyle({
        left: `${anchorRect.left + 16}px`,
        top: `${anchorRect.bottom + 4}px`,
        width: `${Math.max(0, anchorRect.width - 32)}px`,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, isOpen]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="parent-student-options parent-student-options--portal" style={portalStyle || undefined}>
      {children}
    </div>,
    document.body
  );
}

function ParentFinanceStudentSelector({ children, className = '', includeAllOption = false, isOpen, onSelectChild, onToggle, readOnly = false, selectedChild }) {
  const studentSwitcherRef = useRef(null);
  const renderStudentAvatar = (child, sizeClass = '') => (
    <span className={`parent-student-avatar${sizeClass ? ` ${sizeClass}` : ''}`}>
      {child.thumbUrl || child.imageUrl ? (
        <img alt={child.name || 'Alumno'} decoding="async" loading="lazy" src={resolveIosCompatibleImageUrl(child.thumbUrl || child.imageUrl)} />
      ) : (child.avatar || String(child.name || 'A').slice(0, 2).toUpperCase())}
    </span>
  );

  return (
    <section className={`parent-student-switcher${className ? ` ${className}` : ''}${isOpen ? ' is-open' : ''}${readOnly ? ' is-readonly' : ''}`} aria-label="Selector de alumno" ref={studentSwitcherRef}>
      <div className="parent-student-toggle-card">
        <button className="parent-student-toggle" onClick={readOnly ? undefined : onToggle} type="button" aria-expanded={readOnly ? false : isOpen} disabled={readOnly}>
          <div className="parent-student-toggle-copy">
            <p className="meta">Alumno seleccionado</p>
            <h3>{selectedChild.name}</h3>
            <p>{getParentStudentGradeLabel(selectedChild)}</p>
          </div>
          {readOnly ? null : <span className={`chevron ${isOpen ? 'open' : ''}`}>⌄</span>}
        </button>

        <button aria-label={`Avatar de ${selectedChild.name}`} className="parent-student-photo-btn" type="button">
          {selectedChild.thumbUrl || selectedChild.imageUrl || selectedChild.avatar ? renderStudentAvatar(selectedChild) : <span aria-hidden="true">+</span>}
        </button>
      </div>

      <ParentStudentOptionsPortal anchorRef={studentSwitcherRef} isOpen={isOpen}>
          {children.map((child) => (
            <button key={child.id} onClick={() => onSelectChild(child.id)} type="button">
              {renderStudentAvatar(child, 'is-small')}
              <span className="parent-student-option-copy">
                <strong>{child.name}</strong>
                <span>{getParentStudentGradeLabel(child)}</span>
              </span>
            </button>
          ))}
          {includeAllOption ? (
            <button key={PARENT_FEED_ALL_CHILDREN_ID} onClick={() => onSelectChild(PARENT_FEED_ALL_CHILDREN_ID)} type="button">
              {renderStudentAvatar({ name: 'Todos', avatar: 'TD' }, 'is-small')}
              <span className="parent-student-option-copy">
                <strong>Todos</strong>
                <span>Feed unificado</span>
              </span>
            </button>
          ) : null}
      </ParentStudentOptionsPortal>
    </section>
  );
}

const studentFeedFilterOptions = [
  { id: 'general', label: 'Feed colegio', description: 'Publicaciones para todo el colegio', avatar: 'CO' },
  { id: 'course', label: 'Feed curso · alumnos & docentes', description: 'Publicaciones de tu curso', avatar: 'CU' },
  { id: 'course_students', label: 'Feed curso privado (alumnos)', description: 'Solo entre alumnos del curso', avatar: 'AL' },
  { id: 'all', label: 'Feed combinado', description: 'Todo el contenido en un solo lugar', avatar: 'FC' },
];

function StudentFeedSelector({ isOpen, onSelect, onToggle, selectedFilterId }) {
  const feedSwitcherRef = useRef(null);
  const selectedOption = studentFeedFilterOptions.find((option) => option.id === selectedFilterId)
    || studentFeedFilterOptions[studentFeedFilterOptions.length - 1];

  return (
    <section aria-label="Selector de feed" className={`parent-student-switcher${isOpen ? ' is-open' : ''}`} ref={feedSwitcherRef}>
      <div className="parent-student-toggle-card">
        <button aria-expanded={isOpen} className="parent-student-toggle" onClick={onToggle} type="button">
          <div className="parent-student-toggle-copy">
            <p className="meta">Feed seleccionado</p>
            <h3>{selectedOption.label}</h3>
            <p>{selectedOption.description}</p>
          </div>
          <span className={`chevron ${isOpen ? 'open' : ''}`}>⌄</span>
        </button>

        <button aria-label="Cambiar tipo de feed" className="parent-student-photo-btn" onClick={onToggle} type="button">
          <span className="parent-student-avatar">{selectedOption.avatar}</span>
        </button>
      </div>

      <ParentStudentOptionsPortal anchorRef={feedSwitcherRef} isOpen={isOpen}>
        {studentFeedFilterOptions.map((option) => (
          <button key={option.id} onClick={() => onSelect(option.id)} type="button">
            <span className="parent-student-avatar is-small">{option.avatar}</span>
            <span className="parent-student-option-copy">
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </span>
          </button>
        ))}
      </ParentStudentOptionsPortal>
    </section>
  );
}

function ParentMobilePortalHeader({
  canOpenMenu = false,
  guardianName,
  isMenuOpen,
  onLogout,
  onNotificationNavigate = null,
  onToggleMenu,
  onToggleUserMenu,
  preferStudentNotifications = false,
  showUserMenu,
  userMenuRef,
}) {
  const parentFirstName = String(guardianName || 'Padre').split(' ')[0] || 'Padre';
  const parentInitial = String(guardianName || 'P').charAt(0).toUpperCase();

  return (
    <header className="parent-topbar">
      {canOpenMenu ? (
        <button aria-expanded={isMenuOpen} aria-label="Abrir menu" className="parent-icon-btn" onClick={onToggleMenu} type="button">
          <span />
          <span />
          <span />
        </button>
      ) : <span aria-hidden="true" className="parent-icon-btn parent-icon-btn--placeholder" />}

      <div className="parent-title-wrap">
        <ComergioBrandTitle />
        <h1>{`Hola, ${parentFirstName}!`}</h1>
      </div>

      <div className="parent-topbar-actions">
        <ParentNotificationCenter
          navigationHandler={onNotificationNavigate}
          preferStudent={preferStudentNotifications}
        />
        <div className="parent-profile-wrap" ref={userMenuRef}>
          <button
            aria-expanded={showUserMenu}
            aria-haspopup="menu"
            aria-label="Abrir opciones de perfil"
            className="parent-avatar parent-avatar-btn"
            onClick={onToggleUserMenu}
            type="button"
          >
            {parentInitial}
          </button>

          {showUserMenu ? (
            <div className="parent-profile-menu" role="menu">
              <button className="logout" onClick={onLogout} type="button">
                <span className="icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm7.6 4.6L16.2 9l2.6 2H9v2h9.8l-2.6 2l1.4 1.4L23 12l-5.4-4.4Z" fill="currentColor"/>
                  </svg>
                </span>
                <span>Cerrar sesión</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function ParentAcademicKpiIcon({ variant = 'grades' }) {
  if (variant === 'ranking') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M7 18V12" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <path d="M12 18V7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <path d="M17 18V10" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <path d="M5 18h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" opacity="0.45" />
      </svg>
    );
  }

  if (variant === 'warn') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M6 5v14"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <path
          d="M6 19h13"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <path
          d="M8 8.25 10.85 12.1 9.95 11.2 13.75 15.35 16.35 17.6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
        <path
          d="M14.5 16.1 17.35 18.7 14.7 18.7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  if (variant === 'assignments') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 4h8a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M9 9h6M9 13h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (variant === 'attendance') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 3h6v3H9V3Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M8 6H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M9 12h6M9 16h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 4h10a2 2 0 0 1 2 2v14H5V6a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M8 4v16M16 4v16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M10 9h4M10 13h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ParentAssignmentCalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 4v2M16 4v2M5 9h14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <rect
        height="14"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.8"
        width="16"
        x="4"
        y="6"
      />
    </svg>
  );
}

function ParentAssignmentTypeIcon({ variant = 'task' }) {
  if (variant === 'quiz') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M7.5 6.5h9a2.2 2.2 0 0 1 2.2 2.2v5.1a2.2 2.2 0 0 1-2.2 2.2H11l-3.2 2.4V16H7.5a2.2 2.2 0 0 1-2.2-2.2V8.7a2.2 2.2 0 0 1 2.2-2.2Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="M12 9.2v4.1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
        <circle cx="12" cy="15.1" fill="currentColor" r="0.85" />
      </svg>
    );
  }

  if (variant === 'activity') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 7.4V18.8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
        <path
          d="M6.6 6.9c0-1.05.85-1.9 1.9-1.9H12v13.8H8.5c-1.05 0-1.9-.85-1.9-1.9V6.9Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="M17.4 6.9c0-1.05-.85-1.9-1.9-1.9H12v13.8h3.5c1.05 0 1.9-.85 1.9-1.9V6.9Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path
          d="M9.2 9.2h1.6M9.2 11.6h1.6M14.2 9.2h1.6M14.2 11.6h1.6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.4"
          opacity="0.9"
        />
      </svg>
    );
  }

  if (variant === 'sport') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="7.2" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 4.8 9.2 8.7h5.6L12 4.8ZM7.1 9.8l2.1 4.9 2.8-2.1-2.1-4.9-2.8 2.1Zm9.8 0-2.8 2.1 2.1 4.9 2.8-2.1-2.1-4.9ZM12 19.2l2.8-3.9H9.2l2.8 3.9Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (variant === 'workshop') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8.2" cy="8.2" r="2.4" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="15.8" cy="15.8" r="2.4" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M10.1 10.1 13.9 13.9M13.9 10.1l-1.2 1.2M10.1 13.9l1.2-1.2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text
        dominantBaseline="middle"
        fill="currentColor"
        fontFamily="Poppins, Segoe UI, sans-serif"
        fontSize="10.5"
        fontWeight="800"
        textAnchor="middle"
        x="12"
        y="12.5"
      >
        Aa
      </text>
    </svg>
  );
}

function ParentAcademicChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.5 7.5 14 12l-4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function ParentAttendanceSummaryIcon({ variant = 'present' }) {
  if (variant === 'late') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="7.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8.2V12l2.6 1.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (variant === 'absent') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="7.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9.2 9.2 14.8 14.8M14.8 9.2 9.2 14.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (variant === 'group') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="9" cy="9.5" r="2.4" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.8 17.2c0-2.2 1.8-3.6 4.2-3.6s4.2 1.4 4.2 3.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <circle cx="16.2" cy="10.2" r="1.9" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14.2 17.2c0-1.7 1.2-2.8 3-2.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (variant === 'excused') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 4v2M16 4v2M5 9h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <rect height="14" rx="2.2" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="6" />
        <path d="M9.2 12.2 11.1 14.1 14.9 10.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (variant === 'records') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 5h8a2 2 0 0 1 2 2v12H6V7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M9 9h6M9 13h4M9 17h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 4v2M16 4v2M5 9h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <rect height="14" rx="2.2" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="6" />
      <path d="M8.5 13.2h7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ParentAttendanceKpiCard({ count = 0, iconVariant = 'present', label = '', suffix = 'días', tone = 'present' }) {
  return (
    <article className={`campus-parent-mobile__attendance-kpi-card is-${tone}`}>
      <span className="campus-parent-mobile__attendance-kpi-icon" aria-hidden="true">
        <ParentAttendanceSummaryIcon variant={iconVariant} />
      </span>
      <span className="campus-parent-mobile__attendance-kpi-label">{label}</span>
      <strong>{count}</strong>
      {suffix ? <small>{suffix}</small> : null}
    </article>
  );
}

function ParentAcademicContent({
  activeView,
  selectedChild,
  academicSchedule = null,
  refreshKey = 0,
  isPerformanceLoading = false,
  studentPortalMode = false,
  onSelectAcademicView = null,
  onOpenAssignment = null,
  focusedAssignmentId = '',
  onClearFocusedAssignment = null,
}) {
  const academicWorkspace = useMemo(() => (
    selectedChild?.isRealParentChild
      ? { ranking: selectedChild.academicRanking || null, calendar: [], behavior: { teacherComments: [] }, attendance: { records: [] }, insights: [], gradebook: selectedChild.academicGrades || [] }
      : buildAcademicWorkspace(selectedChild)
  ), [selectedChild]);
  const effectiveActiveView = selectedChild?.isRealParentChild && !['academic-performance', 'academic-grades', 'academic-schedule', 'academic-calendar', 'academic-attendance', 'academic-assignments', 'academic-ranking'].includes(activeView)
    ? 'academic-performance'
    : activeView;
  const weeklyClassSchedule = useMemo(() => {
    if (!selectedChild?.isRealParentChild) {
      return buildWeeklyClassSchedule(selectedChild);
    }

    const scheduleSource = academicSchedule || selectedChild.classSchedule || {};
    return buildParentClassSchedule(scheduleSource);
  }, [academicSchedule, selectedChild]);
  const [selectedGradeSubjectId, setSelectedGradeSubjectId] = useState('');
  const [selectedAttendanceSubjectKey, setSelectedAttendanceSubjectKey] = useState('');
  const [expandedGradeComponentId, setExpandedGradeComponentId] = useState('');
  const pendingGradeComponentIdRef = useRef('');
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);
  const [selectedScheduleBlock, setSelectedScheduleBlock] = useState(null);
  const [parentAcademicAttendance, setParentAcademicAttendance] = useState(buildParentAcademicAttendanceState);
  const [guidanceRoutineLog, setGuidanceRoutineLog] = useState({
    isOpen: false,
    page: 1,
    records: [],
    pagination: { page: 1, pageSize: PARENT_GUIDANCE_ROUTINE_PAGE_SIZE, totalRecords: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    isLoading: false,
    error: '',
  });
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarKeyDatesPage, setCalendarKeyDatesPage] = useState(1);
  const [parentAcademicCalendar, setParentAcademicCalendar] = useState({ items: [], isLoading: false, error: '' });

  useEffect(() => {
    setSelectedGradeSubjectId('');
    setExpandedGradeComponentId('');
    setSelectedCalendarDay(null);
    setSelectedScheduleBlock(null);
    setGuidanceRoutineLog({
      isOpen: false,
      page: 1,
      records: [],
      pagination: { page: 1, pageSize: PARENT_GUIDANCE_ROUTINE_PAGE_SIZE, totalRecords: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      isLoading: false,
      error: '',
    });
  }, [selectedChild, academicWorkspace.gradebook]);

  useEffect(() => {
    if (pendingGradeComponentIdRef.current) {
      setExpandedGradeComponentId(pendingGradeComponentIdRef.current);
      pendingGradeComponentIdRef.current = '';
      return;
    }
    setExpandedGradeComponentId('');
  }, [selectedGradeSubjectId]);

  const openGradeEvaluationDetail = (subjectId, componentId = '') => {
    if (!subjectId) {
      return;
    }
    pendingGradeComponentIdRef.current = componentId || '';
    setSelectedGradeSubjectId(subjectId);
    setExpandedGradeComponentId(componentId || '');
    if (typeof onSelectAcademicView === 'function') {
      onSelectAcademicView('academic-grades');
    }
    window.setTimeout(() => {
      document.querySelector('.campus-parent-mobile__subject-card.is-open')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 160);
  };

  useEffect(() => {
    setSelectedCalendarDay(null);
    setCalendarKeyDatesPage(1);
  }, [calendarMonthDate, selectedChild?.id]);

  useEffect(() => {
    setSelectedScheduleBlock(null);
  }, [activeView, selectedChild?.id]);

  useEffect(() => {
    if (!selectedChild?.isRealParentChild || !['academic-performance', 'academic-calendar'].includes(effectiveActiveView)) {
      return undefined;
    }

    let isMounted = true;
    setParentAcademicCalendar((current) => ({ ...current, isLoading: true, error: '' }));

    const calendarRequest = studentPortalMode
      ? getStudentAcademicCalendar({ month: buildMonthKey(calendarMonthDate) })
      : getParentAcademicCalendar({ studentId: selectedChild.id, month: buildMonthKey(calendarMonthDate) });

    calendarRequest
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setParentAcademicCalendar({
          items: Array.isArray(response.data?.items) ? response.data.items : [],
          isLoading: false,
          error: '',
        });
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setParentAcademicCalendar({
          items: [],
          isLoading: false,
          error: error?.response?.data?.message || 'No se pudo cargar el calendario escolar.',
        });
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveActiveView, calendarMonthDate, selectedChild?.id, selectedChild?.isRealParentChild, refreshKey, studentPortalMode]);

  useEffect(() => {
    if (!selectedChild?.isRealParentChild || !['academic-performance', 'academic-attendance'].includes(effectiveActiveView)) {
      return undefined;
    }

    let isMounted = true;
    setParentAcademicAttendance((current) => ({ ...current, isLoading: true, error: '' }));

    const attendanceRequest = studentPortalMode
      ? getStudentAcademicAttendance({ attendanceType: 'subject_class' })
      : getParentAcademicAttendance({ studentId: selectedChild.id });

    attendanceRequest
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setParentAcademicAttendance(buildParentAcademicAttendanceState(response.data || {}));
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setParentAcademicAttendance({
          ...buildParentAcademicAttendanceState(),
          isLoading: false,
          error: error?.response?.data?.message || 'No se pudo cargar la asistencia.',
        });
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveActiveView, selectedChild?.id, selectedChild?.isRealParentChild, refreshKey, studentPortalMode]);

  useEffect(() => {
    if (!guidanceRoutineLog.isOpen || !selectedChild?.isRealParentChild || !selectedChild?.id || studentPortalMode) {
      return undefined;
    }

    let isMounted = true;
    setGuidanceRoutineLog((current) => ({ ...current, isLoading: true, error: '' }));

    getParentAcademicAttendance({
      studentId: selectedChild.id,
      attendanceType: 'guidance_routine',
      page: guidanceRoutineLog.page,
      limit: PARENT_GUIDANCE_ROUTINE_PAGE_SIZE,
    })
      .then((response) => {
        if (!isMounted) {
          return;
        }

        setGuidanceRoutineLog((current) => ({
          ...current,
          records: Array.isArray(response.data?.records) ? response.data.records : [],
          pagination: {
            page: 1,
            pageSize: PARENT_GUIDANCE_ROUTINE_PAGE_SIZE,
            totalRecords: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
            ...(response.data?.pagination || {}),
          },
          isLoading: false,
          error: '',
        }));
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setGuidanceRoutineLog((current) => ({
          ...current,
          records: [],
          isLoading: false,
          error: error?.response?.data?.message || 'No se pudieron cargar los registros de llegada.',
        }));
      });

    return () => {
      isMounted = false;
    };
  }, [guidanceRoutineLog.isOpen, guidanceRoutineLog.page, selectedChild?.id, selectedChild?.isRealParentChild]);

  const academicCalendarItems = useMemo(() => {
    if (!selectedChild?.isRealParentChild) {
      return academicWorkspace.calendar;
    }

    const mergedById = new Map();
    [...(parentAcademicCalendar.items || []), ...(selectedChild.academicUpcomingAssignments || [])].forEach((item) => {
      const itemId = String(item?.id || '').trim();
      if (!itemId) {
        return;
      }

      mergedById.set(itemId, {
        ...item,
        dateLabel: item.dateLabel || formatAcademicCalendarDate(item.date || item.dueAt || item.scheduledClassDate),
      });
    });

    return Array.from(mergedById.values()).sort(
      (left, right) => new Date(left.date || left.dueAt || 0) - new Date(right.date || right.dueAt || 0),
    );
  }, [
    academicWorkspace.calendar,
    parentAcademicCalendar.items,
    selectedChild?.academicUpcomingAssignments,
    selectedChild?.isRealParentChild,
  ]);
  const calendarKeyDatesTotalPages = Math.max(
    1,
    Math.ceil(academicCalendarItems.length / PARENT_CALENDAR_KEY_DATES_PAGE_SIZE),
  );
  const paginatedCalendarKeyDates = useMemo(() => {
    const safePage = Math.min(calendarKeyDatesPage, calendarKeyDatesTotalPages);
    const startIndex = (safePage - 1) * PARENT_CALENDAR_KEY_DATES_PAGE_SIZE;
    return academicCalendarItems.slice(startIndex, startIndex + PARENT_CALENDAR_KEY_DATES_PAGE_SIZE);
  }, [academicCalendarItems, calendarKeyDatesPage, calendarKeyDatesTotalPages]);

  useEffect(() => {
    if (calendarKeyDatesPage > calendarKeyDatesTotalPages) {
      setCalendarKeyDatesPage(calendarKeyDatesTotalPages);
    }
  }, [calendarKeyDatesPage, calendarKeyDatesTotalPages]);

  const academicCalendarGrid = useMemo(
    () => buildAcademicCalendarGrid(calendarMonthDate, academicCalendarItems),
    [academicCalendarItems, calendarMonthDate],
  );
  const changeCalendarMonth = (direction) => {
    setCalendarMonthDate((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + direction, 1));
  };

  if (selectedChild?.isRealParentChild && effectiveActiveView === 'academic-grades' && academicWorkspace.gradebook.length === 0) {
    return (
      <section className="campus-parent-mobile__academic-page">
        <section className="campus-parent-mobile__grades-empty-card" aria-label="Calificaciones no publicadas">
          <div className="campus-parent-mobile__grades-empty-visual" aria-hidden="true">
            <span className="is-main">A+</span>
            <span className="is-line is-one" />
            <span className="is-line is-two" />
            <span className="is-dot is-green" />
            <span className="is-dot is-blue" />
          </div>
          <div className="campus-parent-mobile__grades-empty-copy">
            <span>Calificaciones</span>
            <h3>{selectedChild.name} aún no tiene calificaciones</h3>
            <p>Cuando el colegio publique notas, aquí verás promedios, materias, periodos y componentes evaluados.</p>
          </div>
        </section>
      </section>
    );
  }

  const sortedGradebookSubjects = sortParentGradebookSubjects(academicWorkspace.gradebook);
  const selectedGradeSubject = sortedGradebookSubjects.find((subject) => subject.id === selectedGradeSubjectId) || null;
  const gradedSubjects = sortedGradebookSubjects.filter((subject) => subject.finalAverage !== null && subject.finalAverage !== undefined);
  const overallGradeAverage = gradedSubjects.length
    ? Math.round(
      gradedSubjects.reduce((sum, subject) => sum + Number(subject.finalAverage || 0), 0) / gradedSubjects.length,
    )
    : null;
  const academicPerformanceAverage = overallGradeAverage ?? (selectedChild?.isRealParentChild ? null : Math.round(Number(selectedChild.averageScore || 0) * 20));
  const academicPerformanceLevel = resolveAcademicPerformanceLevel(selectedChild, academicPerformanceAverage);
  const resolvedPerformanceLevel = academicPerformanceAverage !== null && academicPerformanceAverage !== undefined
    ? academicPerformanceLevel
    : null;
  const performanceHeroStyle = buildPerformanceHeroStyle(
    isPerformanceLoading ? null : resolvedPerformanceLevel,
    isPerformanceLoading ? null : academicPerformanceAverage,
    selectedChild?.academicGradingScale,
  );
  const performanceHeroClassName = isPerformanceLoading
    ? ''
    : resolvePerformanceHeroClassName(resolvedPerformanceLevel, academicPerformanceAverage);
  const performanceProgress = academicPerformanceAverage !== null && academicPerformanceAverage !== undefined
    ? Math.max(0, Math.min(100, Math.round(Number(academicPerformanceAverage) || 0)))
    : 0;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const upcomingAssignments = selectedChild?.isRealParentChild
    ? (selectedChild.academicUpcomingAssignments || []).map(mapParentUpcomingAssignmentRow)
    : [
      ...selectedChild.tasks.map((task) => mapParentUpcomingAssignmentRow({
        id: task.id,
        title: task.title,
        subject: task.course,
        type: /quiz/i.test(task.title) ? 'Quiz' : /taller/i.test(task.title) ? 'Taller' : 'Tarea',
        dueLabel: task.dueLabel,
      })),
      ...academicCalendarItems
        .filter((item) => {
          const itemDate = new Date(item.date || item.dueAt || item.scheduledAt || '');
          const normalizedType = normalizeLookupKey(item.type || item.title);
          return !Number.isNaN(itemDate.getTime())
            && itemDate >= todayStart
            && /tarea|quiz|taller|examen|evaluacion|evaluaci|proyecto|entrega|actividad/.test(normalizedType);
        })
        .sort((left, right) => new Date(left.date || left.dueAt || 0) - new Date(right.date || right.dueAt || 0))
        .slice(0, 5)
        .map(mapParentUpcomingAssignmentRow),
    ];
  const weeklyAssignedActivities = upcomingAssignments;
  const recentGradeEntries = sortedGradebookSubjects
    .flatMap((subject) => (subject.periods || []).flatMap((period) => (period.components || []).flatMap((component) => (component.evaluations || [])
      .filter((evaluation) => evaluation.score !== null && evaluation.score !== undefined)
      .map((evaluation) => ({
        id: `${subject.id}-${period.id}-${component.id}-${evaluation.id}`,
        subjectId: subject.id,
        componentId: component.id,
        subject: subject.name,
        teacher: subject.teacher,
        title: evaluation.title || component.label,
        score: Number(evaluation.score),
        date: evaluation.gradedAt || evaluation.date || '',
        feedback: evaluation.feedback || '',
      })))))
    .sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0))
    .slice(0, 5);
  const subjectsToReinforce = sortedGradebookSubjects
    .filter((subject) => subject.finalAverage !== null && subject.finalAverage !== undefined && Number(subject.finalAverage) <= 79)
    .slice(0, 4);
  const attendanceSummary = selectedChild?.isRealParentChild
    ? parentAcademicAttendance.summary || { attendanceRate: 'Sin datos', lateCount: 0, excusedAbsences: 0, unexcusedAbsences: 0, total: 0 }
    : academicWorkspace.attendance;
  const attendanceRecords = selectedChild?.isRealParentChild ? parentAcademicAttendance.records : academicWorkspace.attendance.records;
  const recentBehaviorComments = academicWorkspace.behavior.teacherComments.slice(0, 2);

  const canNavigateAcademic = typeof onSelectAcademicView === 'function';
  const goToAcademicView = (viewId) => {
    if (canNavigateAcademic) {
      onSelectAcademicView(viewId);
    }
  };

  if (effectiveActiveView === 'academic-performance') {
    const PerformanceHeroTag = canNavigateAcademic ? 'button' : 'article';
    const PerformanceKpiTag = canNavigateAcademic ? 'button' : 'article';

    return (
      <section className="campus-parent-mobile__academic-page">
        <PerformanceHeroTag
          className={`campus-parent-mobile__performance-hero${performanceHeroClassName ? ` ${performanceHeroClassName}` : ''}${isPerformanceLoading ? ' is-loading' : ''}${canNavigateAcademic ? ' is-clickable' : ''}`}
          onClick={canNavigateAcademic ? () => goToAcademicView('academic-ranking') : undefined}
          style={performanceHeroStyle}
          type={canNavigateAcademic ? 'button' : undefined}
        >
          <div className="campus-parent-mobile__performance-hero-body">
            <div className="campus-parent-mobile__performance-hero-main">
              <div className="campus-parent-mobile__performance-hero-copy">
                <span className="campus-parent-mobile__performance-hero-eyebrow">Promedio general</span>
                <h2>
                  {isPerformanceLoading
                    ? '—'
                    : (academicPerformanceAverage !== null && academicPerformanceAverage !== undefined ? formatGrade(academicPerformanceAverage) : 'Sin nota')}
                </h2>
                <p>
                  {isPerformanceLoading
                    ? 'Consultando calificaciones'
                    : getGradeTextLabel(academicPerformanceAverage, resolvedPerformanceLevel)}
                </p>
              </div>
            </div>
            <div
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={isPerformanceLoading ? 0 : performanceProgress}
              className="campus-parent-mobile__performance-hero-progress"
              role="progressbar"
            >
              <div
                className="campus-parent-mobile__performance-hero-progress-bar"
                style={{ width: isPerformanceLoading ? '0%' : `${performanceProgress}%` }}
              />
            </div>
          </div>
          <div className="campus-parent-mobile__performance-rank">
            <span className="campus-parent-mobile__performance-rank-label">
              <span className="campus-parent-mobile__performance-rank-icon" aria-hidden="true">
                <ParentAcademicKpiIcon variant="ranking" />
              </span>
              Ranking del curso
            </span>
            <strong>
              {isPerformanceLoading
                ? 'Cargando...'
                : formatAcademicRankingLabel(academicWorkspace.ranking, sortedGradebookSubjects)}
            </strong>
          </div>
        </PerformanceHeroTag>
        <section className="campus-parent-mobile__performance-kpi-grid" aria-label="Indicadores académicos del alumno">
          <PerformanceKpiTag
            className={`campus-parent-mobile__performance-kpi-card is-primary${canNavigateAcademic ? ' is-clickable' : ''}`}
            onClick={canNavigateAcademic ? () => goToAcademicView('academic-grades') : undefined}
            type={canNavigateAcademic ? 'button' : undefined}
          >
            <span className="campus-parent-mobile__performance-kpi-icon" aria-hidden="true">
              <ParentAcademicKpiIcon variant="grades" />
            </span>
            <div className="campus-parent-mobile__performance-kpi-copy">
              <span>Materias con nota</span>
              <strong>{gradedSubjects.length}</strong>
              <small>{sortedGradebookSubjects.length} asignadas</small>
            </div>
          </PerformanceKpiTag>
          <PerformanceKpiTag
            className={`campus-parent-mobile__performance-kpi-card is-warn${canNavigateAcademic ? ' is-clickable' : ''}`}
            onClick={canNavigateAcademic ? () => goToAcademicView('academic-grades') : undefined}
            type={canNavigateAcademic ? 'button' : undefined}
          >
            <span className="campus-parent-mobile__performance-kpi-icon" aria-hidden="true">
              <ParentAcademicKpiIcon variant="warn" />
            </span>
            <div className="campus-parent-mobile__performance-kpi-copy">
              <span>Bajo desempeño</span>
              <strong>{subjectsToReinforce.length}</strong>
              <small>{subjectsToReinforce.length ? 'Requieren seguimiento' : 'Sin alertas'}</small>
            </div>
          </PerformanceKpiTag>
          <PerformanceKpiTag
            className={`campus-parent-mobile__performance-kpi-card is-violet${canNavigateAcademic ? ' is-clickable' : ''}`}
            onClick={canNavigateAcademic ? () => goToAcademicView('academic-assignments') : undefined}
            type={canNavigateAcademic ? 'button' : undefined}
          >
            <span className="campus-parent-mobile__performance-kpi-icon" aria-hidden="true">
              <ParentAcademicKpiIcon variant="assignments" />
            </span>
            <div className="campus-parent-mobile__performance-kpi-copy">
              <span>Próximas asignaciones</span>
              <strong>{weeklyAssignedActivities.length}</strong>
              <small>Publicadas por docentes</small>
            </div>
          </PerformanceKpiTag>
          <PerformanceKpiTag
            className={`campus-parent-mobile__performance-kpi-card is-good${canNavigateAcademic ? ' is-clickable' : ''}`}
            onClick={canNavigateAcademic ? () => goToAcademicView('academic-attendance') : undefined}
            type={canNavigateAcademic ? 'button' : undefined}
          >
            <span className="campus-parent-mobile__performance-kpi-icon" aria-hidden="true">
              <ParentAcademicKpiIcon variant="attendance" />
            </span>
            <div className="campus-parent-mobile__performance-kpi-copy">
              <span>Asistencia</span>
              <strong>{attendanceSummary.attendanceRate || selectedChild.attendanceRate}</strong>
              <small>{Number(attendanceSummary.total || 0)} registros</small>
            </div>
          </PerformanceKpiTag>
        </section>
        <section className="campus-parent-mobile__academic-section campus-parent-mobile__assignments-section">
          <header className="campus-parent-mobile__assignments-head">
            <h3>Próximas asignaciones</h3>
            {typeof onSelectAcademicView === 'function' ? (
              <button
                className="campus-parent-mobile__assignments-link"
                onClick={() => onSelectAcademicView('academic-assignments')}
                type="button"
              >
                Ver todas
                <span aria-hidden="true">&gt;</span>
              </button>
            ) : null}
          </header>
          {parentAcademicCalendar.isLoading ? <p className="campus-parent-mobile__academic-calendar-status">Cargando calendario académico...</p> : null}
          {parentAcademicCalendar.error ? <p className="campus-parent-mobile__academic-calendar-status is-error">{parentAcademicCalendar.error}</p> : null}
          <div className="campus-parent-mobile__assignments-list">
            {weeklyAssignedActivities.length ? weeklyAssignedActivities.slice(0, 5).map((activity) => {
              const canOpenAssignment = activity.id
                && activity.courseId
                && typeof onOpenAssignment === 'function';
              const CardTag = canOpenAssignment ? 'button' : 'article';

              return (
                <CardTag
                  className={`campus-parent-mobile__assignment-card${canOpenAssignment ? ' is-clickable' : ''}`}
                  key={activity.id}
                  onClick={canOpenAssignment ? () => onOpenAssignment(activity.id) : undefined}
                  type={canOpenAssignment ? 'button' : undefined}
                >
                  <span className={`campus-parent-mobile__assignment-card-icon is-${activity.accent || 'task'}`} aria-hidden="true">
                    <ParentAssignmentTypeIcon variant={activity.iconVariant || 'task'} />
                  </span>
                  <div className="campus-parent-mobile__assignment-card-copy">
                    <span className={`campus-parent-mobile__assignment-card-type is-${activity.accent || 'task'}`}>
                      {activity.typeLabel || 'TAREA'}
                    </span>
                    <strong>{activity.title}</strong>
                    <small>{activity.subtitle}</small>
                  </div>
                  <div className="campus-parent-mobile__assignment-card-due">
                    <span className="campus-parent-mobile__assignment-card-date">
                      <ParentAssignmentCalendarIcon />
                      {activity.meta || 'Sin fecha'}
                    </span>
                    {activity.remainingLabel ? (
                      <span className="campus-parent-mobile__assignment-card-remaining">{activity.remainingLabel}</span>
                    ) : null}
                  </div>
                </CardTag>
              );
            }) : (
              <article className="campus-parent-mobile__performance-empty-card">
                <strong>Sin asignaciones próximas</strong>
                <span>Las tareas, quices, talleres o exámenes aparecerán cuando el colegio los publique.</span>
              </article>
            )}
          </div>
        </section>
        <section className="campus-parent-mobile__academic-section campus-parent-mobile__grades-section">
          <h3>Últimas calificaciones</h3>
          <div className="campus-parent-mobile__grades-list">
            {recentGradeEntries.length ? recentGradeEntries.map((gradeEntry) => {
              const scoreTone = getGradeScoreTone(gradeEntry.score);

              return (
                <button
                  className="campus-parent-mobile__grade-card is-clickable"
                  key={gradeEntry.id}
                  onClick={() => openGradeEvaluationDetail(gradeEntry.subjectId, gradeEntry.componentId)}
                  type="button"
                >
                  <span className={`campus-parent-mobile__grade-card-icon is-${scoreTone}`} aria-hidden="true">
                    <ParentGradeScoreIcon tone={scoreTone} />
                  </span>
                  <div className="campus-parent-mobile__grade-card-copy">
                    <strong>{gradeEntry.title}</strong>
                    <small>
                      {gradeEntry.teacher}
                      {gradeEntry.feedback ? ` · ${gradeEntry.feedback}` : ''}
                    </small>
                  </div>
                  <div className="campus-parent-mobile__grade-card-score">
                    <strong className={`is-${scoreTone}`}>{formatGrade(gradeEntry.score)}</strong>
                    <span className={`is-${scoreTone}`}>{getGradeDisplayLabel(gradeEntry.score)}</span>
                  </div>
                  <span className="campus-parent-mobile__grade-card-chevron" aria-hidden="true">
                    <ParentAcademicChevronIcon />
                  </span>
                </button>
              );
            }) : (
              <article className="campus-parent-mobile__performance-empty-card">
                <strong>Sin calificaciones recientes</strong>
                <span>Cuando un docente guarde notas, verás aquí las más nuevas.</span>
              </article>
            )}
          </div>
        </section>
        <section className="campus-parent-mobile__academic-section campus-parent-mobile__reinforce-section">
          <header className="campus-parent-mobile__assignments-head">
            <h3>Materias con bajo desempeño</h3>
            {typeof onSelectAcademicView === 'function' ? (
              <button
                className="campus-parent-mobile__assignments-link"
                onClick={() => onSelectAcademicView('academic-grades')}
                type="button"
              >
                Ver todas
                <span aria-hidden="true">&gt;</span>
              </button>
            ) : null}
          </header>
          <div className="campus-parent-mobile__reinforce-list">
            {subjectsToReinforce.length ? subjectsToReinforce.map((subject) => {
              const scoreTone = getGradeScoreTone(subject.finalAverage);

              return (
                <button
                  className="campus-parent-mobile__reinforce-card is-clickable"
                  key={subject.id}
                  onClick={() => openGradeEvaluationDetail(subject.id)}
                  type="button"
                >
                  <span className={`campus-parent-mobile__reinforce-card-icon is-${scoreTone}`} aria-hidden="true">
                    <ParentGradeScoreIcon tone={scoreTone} />
                  </span>
                  <div className="campus-parent-mobile__reinforce-card-copy">
                    <strong>{subject.name}</strong>
                    <small>{subject.teacher}</small>
                    <span className="campus-parent-mobile__reinforce-card-badge">Bajo desempeño</span>
                  </div>
                  <div className="campus-parent-mobile__reinforce-card-score">
                    <strong className={`is-${scoreTone}`}>{formatGrade(subject.finalAverage)}</strong>
                    <small>Requiere seguimiento</small>
                  </div>
                  <span className="campus-parent-mobile__reinforce-card-chevron" aria-hidden="true">
                    <ParentAcademicChevronIcon />
                  </span>
                </button>
              );
            }) : (
              <article className="campus-parent-mobile__performance-empty-card is-good">
                <strong>Sin materias críticas</strong>
                <span>Las materias con nota están por encima del umbral de bajo desempeño.</span>
              </article>
            )}
          </div>
        </section>
        <section className="campus-parent-mobile__academic-section campus-parent-mobile__attendance-summary-section">
          <h3>Asistencia</h3>
          {parentAcademicAttendance.isLoading ? <p className="campus-parent-mobile__academic-calendar-status">Cargando asistencia...</p> : null}
          {parentAcademicAttendance.error ? <p className="campus-parent-mobile__academic-calendar-status is-error">{parentAcademicAttendance.error}</p> : null}
          <div className="campus-parent-mobile__attendance-kpi-grid">
            {[
              { key: 'present', className: 'is-present', variant: 'present', label: 'Presente', value: attendanceSummary.present || 0 },
              { key: 'late', className: 'is-late', variant: 'late', label: 'Tardanzas', value: attendanceSummary.lateCount || 0 },
              { key: 'absent', className: 'is-absent', variant: 'absent', label: 'Ausencias', value: attendanceSummary.unexcusedAbsences || 0 },
            ].map((kpi) => {
              const AttendanceKpiTag = canNavigateAcademic ? 'button' : 'article';

              return (
                <AttendanceKpiTag
                  className={`campus-parent-mobile__attendance-kpi-card ${kpi.className}${canNavigateAcademic ? ' is-clickable' : ''}`}
                  key={kpi.key}
                  onClick={canNavigateAcademic ? () => goToAcademicView('academic-attendance') : undefined}
                  type={canNavigateAcademic ? 'button' : undefined}
                >
                  <span className="campus-parent-mobile__attendance-kpi-icon" aria-hidden="true">
                    <ParentAttendanceSummaryIcon variant={kpi.variant} />
                  </span>
                  <span className="campus-parent-mobile__attendance-kpi-label">{kpi.label}</span>
                  <strong>{kpi.value}</strong>
                  <small>días</small>
                </AttendanceKpiTag>
              );
            })}
          </div>
          {!parentAcademicAttendance.isLoading && attendanceRecords.length === 0 ? (
            <article className="campus-parent-mobile__attendance-empty-card">
              <span className="campus-parent-mobile__attendance-empty-icon" aria-hidden="true">
                <ParentAttendanceSummaryIcon variant="group" />
              </span>
              <div className="campus-parent-mobile__attendance-empty-copy">
                <strong>Sin asistencias registradas</strong>
                <span>Cuando el colegio tome asistencia, aparecerá aquí el resumen del alumno.</span>
              </div>
            </article>
          ) : null}
          {attendanceRecords.length ? (
            <div className="campus-parent-mobile__attendance-records-list">
              {attendanceRecords.slice(0, 3).map((record) => (
                <article className="campus-parent-mobile__attendance-record-card" key={record.id}>
                  <div className="campus-parent-mobile__attendance-record-copy">
                    <span>{record.statusLabel}</span>
                    <strong>{record.dateLabel || record.date}</strong>
                    <small>{[record.attendanceTypeLabel, record.courseTitle || record.subject].filter(Boolean).join(' · ')}</small>
                  </div>
                  <small>{record.note || 'Registrado'}</small>
                </article>
              ))}
            </div>
          ) : null}
        </section>
        {recentBehaviorComments.length ? (
          <section className="campus-parent-mobile__academic-section">
            <h3>Comentarios recientes</h3>
            <div className="campus-parent-mobile__performance-list">
              {recentBehaviorComments.map((comment) => (
                <article className="campus-parent-mobile__performance-row" key={comment.id}>
                  <div>
                    <strong>{comment.teacher}</strong>
                    <small>{comment.text}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    );
  }

  if (effectiveActiveView === 'academic-ranking') {
    const rankingData = academicWorkspace.ranking || {};
    const rankingTop = Array.isArray(rankingData.top) ? rankingData.top : [];
    const rankingPosition = Number(rankingData.position || 0);
    const rankingTotal = Number(rankingData.total || 0);

    return (
      <section className="campus-parent-mobile__academic-page">
        <section className="campus-parent-mobile__academic-section campus-parent-mobile__ranking-section">
          <header className="campus-parent-mobile__assignments-head">
            <h3>Ranking del curso</h3>
            {canNavigateAcademic ? (
              <button
                className="campus-parent-mobile__assignments-link"
                onClick={() => goToAcademicView('academic-performance')}
                type="button"
              >
                Volver
              </button>
            ) : null}
          </header>
          <article className="campus-parent-mobile__ranking-hero">
            <span>{studentPortalMode ? 'Tu puesto' : `Puesto de ${selectedChild.name}`}</span>
            <strong>{rankingPosition ? `#${rankingPosition}` : 'Sin ranking'}</strong>
            <small>{rankingTotal ? `de ${rankingTotal} alumnos del curso` : 'Aún no hay calificaciones publicadas'}</small>
          </article>
          {rankingTop.length ? (
            <div className="campus-parent-mobile__ranking-list">
              {rankingTop.map((entry) => (
                <article
                  className={`campus-parent-mobile__ranking-row${entry.isSelf ? ' is-self' : ''}${entry.position <= 3 ? ` is-top-${entry.position}` : ''}`}
                  key={entry.studentId || entry.position}
                >
                  <span className="campus-parent-mobile__ranking-position" aria-hidden="true">{entry.position}</span>
                  <div className="campus-parent-mobile__ranking-copy">
                    <strong>{entry.name}</strong>
                    {entry.isSelf ? <small>{studentPortalMode ? 'Tú' : 'Tu hijo(a)'}</small> : null}
                  </div>
                  <strong className="campus-parent-mobile__ranking-score">{formatGrade(entry.average)}</strong>
                </article>
              ))}
            </div>
          ) : (
            <article className="campus-parent-mobile__performance-empty-card">
              <strong>Sin ranking disponible</strong>
              <span>Cuando los docentes publiquen calificaciones, verás aquí los mejores promedios del curso.</span>
            </article>
          )}
          <p className="campus-parent-mobile__ranking-note">Se muestran solo los 10 mejores promedios del curso.</p>
        </section>
      </section>
    );
  }

  if (effectiveActiveView === 'academic-calendar') {
    return (
      <section className="campus-parent-mobile__academic-page">
        <section className="campus-parent-mobile__academic-section">
          <article className="campus-parent-mobile__academic-calendar-board">
            <div className="campus-parent-mobile__academic-calendar-board-head">
              <div>
                <span>Calendario mensual</span>
                <strong>{academicCalendarGrid.monthLabel}</strong>
              </div>
              <div className="campus-parent-mobile__academic-calendar-nav">
                <button aria-label="Mes anterior" onClick={() => changeCalendarMonth(-1)} type="button">
                  <svg viewBox="0 0 24 24">
                    <path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </button>
                <button aria-label="Mes siguiente" onClick={() => changeCalendarMonth(1)} type="button">
                  <svg viewBox="0 0 24 24">
                    <path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </button>
              </div>
            </div>
            {parentAcademicCalendar.isLoading ? (
              <p className="campus-parent-mobile__academic-calendar-status">Cargando publicaciones...</p>
            ) : null}
            {parentAcademicCalendar.error ? (
              <p className="campus-parent-mobile__academic-calendar-status is-error">{parentAcademicCalendar.error}</p>
            ) : null}
            <div className="campus-parent-mobile__academic-calendar-weekdays">
              {academicCalendarGrid.weekdayLabels.map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>
            <div className="campus-parent-mobile__academic-calendar-grid">
              {academicCalendarGrid.cells.map((cell) => {
                if (cell.isBlank) {
                  return <div className="campus-parent-mobile__academic-calendar-day is-blank" key={cell.id} />;
                }

                return (
                  <button
                    className={`campus-parent-mobile__academic-calendar-day${cell.isToday ? ' is-today' : ''}`}
                    key={cell.id}
                    onClick={() => setSelectedCalendarDay(cell)}
                    type="button"
                  >
                    <strong>{cell.day}</strong>
                    {cell.items.length ? (
                      <div className="campus-parent-mobile__academic-calendar-items">
                        {cell.items.slice(0, 2).map((item) => (
                          <span className={`campus-parent-mobile__academic-calendar-pill is-${item.accent}`} key={item.id}>
                            {item.title}
                          </span>
                        ))}
                        {cell.items.length > 2 ? (
                          <span className="campus-parent-mobile__academic-calendar-more">+{cell.items.length - 2}</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="campus-parent-mobile__academic-calendar-empty">Sin eventos</span>
                    )}
                  </button>
                );
              })}
            </div>
          </article>
        </section>
        <section className="campus-parent-mobile__academic-section campus-parent-mobile__assignments-section">
          <header className="campus-parent-mobile__assignments-head">
            <h3>Próximas fechas clave</h3>
          </header>
          <div className="campus-parent-mobile__assignments-list">
            {academicCalendarItems.length ? paginatedCalendarKeyDates.map((item) => {
              const keyDate = mapParentUpcomingAssignmentRow(item);
              const canOpenAssignment = Boolean(
                keyDate.id
                && keyDate.courseId
                && typeof onOpenAssignment === 'function'
              );
              const CardTag = canOpenAssignment ? 'button' : 'article';

              return (
                <CardTag
                  className={`campus-parent-mobile__assignment-card${canOpenAssignment ? ' is-clickable' : ''}`}
                  key={keyDate.id}
                  onClick={canOpenAssignment ? () => onOpenAssignment(keyDate.id) : undefined}
                  type={canOpenAssignment ? 'button' : undefined}
                >
                  <span className={`campus-parent-mobile__assignment-card-icon is-${keyDate.accent || 'task'}`} aria-hidden="true">
                    <ParentAssignmentTypeIcon variant={keyDate.iconVariant || 'task'} />
                  </span>
                  <div className="campus-parent-mobile__assignment-card-copy">
                    <span className={`campus-parent-mobile__assignment-card-type is-${keyDate.accent || 'task'}`}>
                      {keyDate.typeLabel || 'TAREA'}
                    </span>
                    <strong>{keyDate.title}</strong>
                    <small>{keyDate.subtitle}</small>
                  </div>
                  <div className="campus-parent-mobile__assignment-card-due">
                    <span className="campus-parent-mobile__assignment-card-date">
                      <ParentAssignmentCalendarIcon />
                      {keyDate.meta || 'Sin fecha'}
                    </span>
                    {keyDate.remainingLabel ? (
                      <span className="campus-parent-mobile__assignment-card-remaining">{keyDate.remainingLabel}</span>
                    ) : null}
                  </div>
                </CardTag>
              );
            }) : (
              <article className="campus-parent-mobile__performance-empty-card">
                <strong>Sin publicaciones este mes</strong>
                <span>Las tareas, quices, evaluaciones y avisos aparecerán cuando el docente los publique.</span>
              </article>
            )}
          </div>
          {calendarKeyDatesTotalPages > 1 ? (
            <div className="campus-parent-mobile__calendar-keydates-pagination" aria-label="Paginación de fechas clave">
              {Array.from({ length: calendarKeyDatesTotalPages }, (_, index) => index + 1).map((pageNumber) => (
                <button
                  aria-current={pageNumber === calendarKeyDatesPage ? 'page' : undefined}
                  className={pageNumber === calendarKeyDatesPage ? 'is-active' : ''}
                  key={`calendar-keydates-page-${pageNumber}`}
                  onClick={() => setCalendarKeyDatesPage(pageNumber)}
                  type="button"
                >
                  {pageNumber}
                </button>
              ))}
            </div>
          ) : null}
        </section>
        {selectedCalendarDay ? (
          <div className="campus-parent-mobile__academic-modal-backdrop" onClick={() => setSelectedCalendarDay(null)} role="presentation">
            <div className="campus-parent-mobile__academic-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
              <div className="campus-parent-mobile__academic-modal-head">
                <div>
                  <span>Actividades del dia</span>
                  <h3>{selectedCalendarDay.dateLabel}</h3>
                </div>
                <button aria-label="Cerrar" className="campus-parent-mobile__academic-modal-close" onClick={() => setSelectedCalendarDay(null)} type="button">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </button>
              </div>
              <div className="campus-parent-mobile__academic-modal-body">
                {selectedCalendarDay.items.length ? (
                  selectedCalendarDay.items.map((item) => (
                    <article className={`campus-parent-mobile__academic-modal-item is-${item.accent}`} key={item.id}>
                      <span>{item.type}</span>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                      <small>{item.subject || item.courseTitle || item.dateLabel || formatAcademicCalendarDate(item.date)}</small>
                    </article>
                  ))
                ) : (
                  <article className="campus-parent-mobile__academic-modal-empty">
                    <strong>Sin actividades programadas</strong>
                    <p>No hay tareas, quices, evaluaciones ni avisos publicados para esta fecha.</p>
                  </article>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (effectiveActiveView === 'academic-assignments') {
    return (
      <section className="campus-parent-mobile__academic-page">
        <StudentAssignmentsPanel
          initialAssignmentId={focusedAssignmentId}
          onClearInitialAssignment={onClearFocusedAssignment}
          readOnly={!studentPortalMode}
          studentId={studentPortalMode ? '' : selectedChild?.id}
          studentName={selectedChild?.name || ''}
        />
      </section>
    );
  }

  if (effectiveActiveView === 'academic-tasks') {
    return (
      <section className="campus-parent-mobile__academic-page">
        <section className="campus-parent-mobile__academic-section">
          <h3>Tareas</h3>
          <div className="campus-parent-mobile__card-stack">
            {selectedChild.tasks.map((task) => (
              <article className={`campus-parent-mobile__task-card is-${task.urgency}`} key={task.id}>
                <div className="campus-parent-mobile__task-card-top">
                  <span>{task.course}</span>
                  <strong>{task.dueLabel}</strong>
                </div>
                <h3>{task.title}</h3>
                <p>{task.meta}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="campus-parent-mobile__academic-section">
          <h3>Materiales de apoyo</h3>
          <div className="campus-parent-mobile__card-stack">
            {selectedChild.materials.map((material) => (
              <article className="campus-parent-mobile__list-card" key={material.id}>
                <div>
                  <strong>{material.title}</strong>
                  <span>{material.course}</span>
                </div>
                <strong>{material.type}</strong>
              </article>
            ))}
          </div>
        </section>
      </section>
    );
  }

  if (effectiveActiveView === 'academic-schedule') {
    return (
      <section className="campus-parent-mobile__academic-page">
        <section className="campus-parent-mobile__academic-section">
          <h3>Horario de clase</h3>
          {weeklyClassSchedule.slots.length ? (
            <div className="campus-parent-mobile__schedule-table-wrap">
              {weeklyClassSchedule.hourMarks?.length ? (
                <div
                  className="campus-parent-mobile__schedule-board"
                  style={{ '--schedule-board-hours': Math.max(1, (Number(weeklyClassSchedule.rangeEnd || 0) - Number(weeklyClassSchedule.rangeStart || 0)) / 60) }}
                >
                  <div className="campus-parent-mobile__schedule-board-head">
                    <span>Hora</span>
                    {weeklyClassSchedule.weekdays.map((day) => (
                      <strong key={day}>{day}</strong>
                    ))}
                  </div>
                  <div className="campus-parent-mobile__schedule-board-body">
                    <div className="campus-parent-mobile__schedule-time-rail">
                      {weeklyClassSchedule.hourMarks.map((mark) => (
                        <span
                          className={`${mark.minutes === weeklyClassSchedule.rangeStart ? 'is-first' : ''}${mark.minutes === weeklyClassSchedule.rangeEnd ? ' is-last' : ''}`.trim()}
                          key={`${mark.minutes}-${mark.label}`}
                          style={{ top: `${((mark.minutes - weeklyClassSchedule.rangeStart) / Math.max(1, weeklyClassSchedule.rangeEnd - weeklyClassSchedule.rangeStart)) * 100}%` }}
                        >
                          {mark.label}
                        </span>
                      ))}
                    </div>
                    {weeklyClassSchedule.weekdays.map((day) => (
                      <div className="campus-parent-mobile__schedule-day-column" key={day}>
                        {weeklyClassSchedule.dayRanges?.[day] ? (
                          <>
                            <span
                              className="campus-parent-mobile__schedule-off-hours is-before"
                              style={{
                                top: 0,
                                height: `${Math.max(0, ((weeklyClassSchedule.dayRanges[day].start - weeklyClassSchedule.rangeStart) / Math.max(1, weeklyClassSchedule.rangeEnd - weeklyClassSchedule.rangeStart)) * 100)}%`,
                              }}
                            />
                            <span
                              className="campus-parent-mobile__schedule-off-hours is-after"
                              style={{
                                top: `${Math.max(0, ((weeklyClassSchedule.dayRanges[day].end - weeklyClassSchedule.rangeStart) / Math.max(1, weeklyClassSchedule.rangeEnd - weeklyClassSchedule.rangeStart)) * 100)}%`,
                                height: `${Math.max(0, ((weeklyClassSchedule.rangeEnd - weeklyClassSchedule.dayRanges[day].end) / Math.max(1, weeklyClassSchedule.rangeEnd - weeklyClassSchedule.rangeStart)) * 100)}%`,
                              }}
                            />
                          </>
                        ) : (
                          <span className="campus-parent-mobile__schedule-off-hours is-full" />
                        )}
                        {weeklyClassSchedule.hourMarks.map((mark) => (
                          <span
                            className="campus-parent-mobile__schedule-hour-line"
                            key={`${day}-${mark.minutes}`}
                            style={{ top: `${((mark.minutes - weeklyClassSchedule.rangeStart) / Math.max(1, weeklyClassSchedule.rangeEnd - weeklyClassSchedule.rangeStart)) * 100}%` }}
                          />
                        ))}
                        {(weeklyClassSchedule.eventsByDay?.[day] || []).map((item, index) => {
                          const isCompactBlock = Number(item.endMinutes || 0) - Number(item.startMinutes || 0) <= 25;

                          return (
                            <button
                              aria-label={`Ver detalle de ${item.subject}`}
                              className={`campus-parent-mobile__schedule-cell is-floating is-${item.tone || 'class'}${isCompactBlock ? ' is-compact' : ''}`}
                              key={`${day}-${item.subject}-${item.startMinutes}-${index}`}
                              onClick={() => setSelectedScheduleBlock({ ...item, day })}
                              style={{
                                top: `${((item.startMinutes - weeklyClassSchedule.rangeStart) / Math.max(1, weeklyClassSchedule.rangeEnd - weeklyClassSchedule.rangeStart)) * 100}%`,
                                height: `${Math.max(4, ((item.endMinutes - item.startMinutes) / Math.max(1, weeklyClassSchedule.rangeEnd - weeklyClassSchedule.rangeStart)) * 100)}%`,
                              }}
                              title={`${item.subject}${item.timeLabel ? ` · ${item.timeLabel}` : ''}`}
                              type="button"
                            >
                              <strong>{item.subject}</strong>
                              {item.timeLabel ? <small>{item.timeLabel}</small> : null}
                              <span>{item.detail}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <table className="campus-parent-mobile__schedule-table">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      {weeklyClassSchedule.weekdays.map((day) => (
                        <th key={day}>{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyClassSchedule.slots.map((slot) => (
                      <tr key={slot}>
                        <th>{slot}</th>
                        {weeklyClassSchedule.weekdays.map((day) => {
                          const entry = weeklyClassSchedule.entries[slot]?.[day];
                          const dayEntries = Array.isArray(entry) ? entry : entry ? [entry] : [];

                          return (
                            <td key={`${slot}-${day}`}>
                              {dayEntries.length ? (
                                <div className="campus-parent-mobile__schedule-cell-stack">
                                  {dayEntries.map((item, index) => (
                                    <div className={`campus-parent-mobile__schedule-cell is-${item.tone || 'class'}`} key={`${slot}-${day}-${item.subject}-${index}`}>
                                      {item.timeLabel ? <small>{item.timeLabel}</small> : null}
                                      <strong>{item.subject}</strong>
                                      <span>{item.detail}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="campus-parent-mobile__schedule-empty">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <article className="campus-parent-mobile__empty-state">
              <span className="campus-parent-mobile__eyebrow">{selectedChild.name}</span>
              <h3>Sin horario publicado</h3>
              <p>Cuando el colegio asigne clases al curso {getParentStudentGradeLabel(selectedChild)}, apareceran aqui.</p>
            </article>
          )}
        </section>
        {selectedScheduleBlock ? (
          <div className="campus-parent-mobile__academic-modal-backdrop" onClick={() => setSelectedScheduleBlock(null)} role="presentation">
            <div className="campus-parent-mobile__academic-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
              <div className="campus-parent-mobile__academic-modal-head">
                <div>
                  <span>Detalle del bloque</span>
                  <h3>{selectedScheduleBlock.subject}</h3>
                </div>
                <button aria-label="Cerrar" className="campus-parent-mobile__academic-modal-close" onClick={() => setSelectedScheduleBlock(null)} type="button">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                  </svg>
                </button>
              </div>
              <div className="campus-parent-mobile__academic-modal-body">
                <article className={`campus-parent-mobile__academic-modal-item is-${selectedScheduleBlock.tone === 'break' ? 'warn' : selectedScheduleBlock.tone === 'guidance' ? 'sky' : selectedScheduleBlock.tone === 'control' ? 'neutral' : 'good'}`}>
                  <span>{selectedScheduleBlock.day}</span>
                  <strong>{selectedScheduleBlock.timeLabel || 'Horario publicado'}</strong>
                  <p>{selectedScheduleBlock.detail || 'Sin detalle adicional.'}</p>
                  <small>{selectedChild?.name || 'Alumno'}</small>
                </article>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (effectiveActiveView === 'academic-behavior') {
    return (
      <section className="campus-parent-mobile__academic-page">
        <article className="campus-parent-mobile__hero-card is-behavior">
          <span className="campus-parent-mobile__eyebrow">Comportamiento y disciplina</span>
          <h2>{academicWorkspace.behavior.summary.score}/100</h2>
        </article>
        <section className="campus-parent-mobile__mini-grid">
          <article className="campus-parent-mobile__metric-card">
            <span>Tendencia</span>
            <strong>{academicWorkspace.behavior.summary.trend}</strong>
          </article>
          <article className="campus-parent-mobile__metric-card">
            <span>Balance</span>
            <strong>{academicWorkspace.behavior.summary.positiveCount} / {academicWorkspace.behavior.summary.negativeCount}</strong>
          </article>
          <article className="campus-parent-mobile__metric-card">
            <span>Positivos</span>
            <strong>🟢 {academicWorkspace.behavior.summary.positiveCount}</strong>
          </article>
          <article className="campus-parent-mobile__metric-card">
            <span>Negativos</span>
            <strong>🔴 {academicWorkspace.behavior.summary.negativeCount}</strong>
          </article>
        </section>
        <section className="campus-parent-mobile__academic-section">
          <h3>Categorías de comportamiento</h3>
          <div className="campus-parent-mobile__card-stack">
            {academicWorkspace.behavior.categories.map((category) => (
              <article className="campus-parent-mobile__list-card campus-parent-mobile__behavior-category-card" key={category.id}>
                <div>
                  <strong>{category.icon} {category.label}</strong>
                  <span>{category.score}%</span>
                </div>
                <div className="campus-parent-mobile__behavior-progress">
                  <span style={{ width: `${category.score}%` }} />
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="campus-parent-mobile__academic-section">
          <h3>Evolución en el tiempo</h3>
          <div className="campus-parent-mobile__card-stack">
            {academicWorkspace.behavior.evolution.map((item) => (
              <article className="campus-parent-mobile__list-card campus-parent-mobile__behavior-evolution-card" key={item.id}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.score}/100</span>
                </div>
                <div className="campus-parent-mobile__behavior-bar">
                  <span style={{ height: `${Math.max(item.score, 18)}%` }} />
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="campus-parent-mobile__academic-section">
          <h3>Registro detallado de eventos</h3>
          <div className="campus-parent-mobile__card-stack">
            {academicWorkspace.behavior.reports.map((report) => (
              <article className={`campus-parent-mobile__list-card campus-parent-mobile__behavior-card is-${report.tone}`} key={report.id}>
                <div>
                  <strong>{report.title}</strong>
                  <span>{report.teacher} · {report.date}</span>
                </div>
                <p>{report.description}</p>
                <div className="campus-parent-mobile__behavior-tags">
                  <span>{report.type}</span>
                  <span>{report.category}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="campus-parent-mobile__academic-section">
          <h3>Logros y reconocimientos</h3>
          <div className="campus-parent-mobile__card-stack">
            {academicWorkspace.behavior.recognitions.map((recognition) => (
              <article className="campus-parent-mobile__list-card campus-parent-mobile__behavior-card is-positive" key={recognition.id}>
                <div>
                  <strong>{recognition.title}</strong>
                  <span>{recognition.date}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="campus-parent-mobile__academic-section">
          <h3>Comentarios del docente</h3>
          <div className="campus-parent-mobile__card-stack">
            {academicWorkspace.behavior.teacherComments.map((comment) => (
              <article className="campus-parent-mobile__list-card campus-parent-mobile__behavior-comment-card" key={comment.id}>
                <div>
                  <strong>{comment.teacher}</strong>
                  <span>{comment.text}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="campus-parent-mobile__academic-section">
          <h3>Historial disciplinario</h3>
          <div className="campus-parent-mobile__card-stack">
            {academicWorkspace.behavior.history.map((entry) => (
              <article className="campus-parent-mobile__list-card campus-parent-mobile__behavior-comment-card" key={entry.id}>
                <div>
                  <strong>{entry.period}</strong>
                  <span>{entry.detail}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    );
  }

  if (effectiveActiveView === 'academic-grades') {
    return (
      <section className="campus-parent-mobile__academic-page">
        <section className="campus-parent-mobile__academic-section">
          <h3>Calificaciones</h3>
          <div className="campus-parent-mobile__grade-overall-summary" aria-label="Promedio general del estudiante">
            <span>PROMEDIO GENERAL</span>
            <strong>{overallGradeAverage}</strong>
            <small>{getGradeTextLabel(overallGradeAverage)}</small>
            <div className="campus-parent-mobile__grade-ranking-pill">
              <span>Ranking del curso</span>
              <strong>{formatAcademicRankingLabel(academicWorkspace.ranking, academicWorkspace.gradebook)}</strong>
            </div>
          </div>
          <div className="campus-parent-mobile__subject-tabs" aria-label="Materias del estudiante">
            {sortedGradebookSubjects.map((subject) => {
              const isSubjectOpen = subject.id === selectedGradeSubject?.id;
              const hasSubjectGrade = subject.finalAverage !== null && subject.finalAverage !== undefined;
              const subjectCardColor = getParentSubjectCardColor(subject);

              return (
                <article
                  className={`campus-parent-mobile__subject-card${isSubjectOpen ? ' is-open' : ''}${hasSubjectGrade ? '' : ' is-ungraded'}`}
                  key={subject.id}
                  style={hasSubjectGrade && subjectCardColor ? { '--subject-card-color': subjectCardColor } : undefined}
                >
                  <button
                    className="campus-parent-mobile__subject-card-button"
                    onClick={() => setSelectedGradeSubjectId(isSubjectOpen ? '' : subject.id)}
                    type="button"
                  >
                    <div className="campus-parent-mobile__subject-card-copy">
                      <span>TEACHER: {subject.teacher}</span>
                      <strong>{subject.name}</strong>
                    </div>
                    <div className={`campus-parent-mobile__subject-card-score${hasSubjectGrade ? '' : ' is-empty'}`}>
                      <strong>{hasSubjectGrade ? formatGrade(subject.finalAverage) : 'Sin calificaciones'}</strong>
                      <small>{isSubjectOpen ? 'Ocultar' : 'Ver detalle'}</small>
                    </div>
                  </button>
                  {isSubjectOpen ? (
                    <div className="campus-parent-mobile__subject-card-detail">
                      {subject.periods.some((period) => period.components.length > 0) ? subject.periods.map((period) => (
                <article className="campus-parent-mobile__list-card campus-parent-mobile__grade-period-card" key={period.id}>
                  <div className="campus-parent-mobile__grade-period-head">
                    <div>
                      <strong>{period.label}</strong>
                      <span>{period.weight}%</span>
                    </div>
                    <div className="campus-parent-mobile__grade-period-score">
                      <strong>{formatGrade(period.average)}</strong>
                    </div>
                  </div>
                  <div className="campus-parent-mobile__grade-component-list">
                    {period.components.map((component) => {
                      const isOpen = expandedGradeComponentId === component.id;

                      return (
                        <div className={`campus-parent-mobile__grade-component-card${isOpen ? ' is-open' : ''}`} key={component.id}>
                          <button
                            className="campus-parent-mobile__grade-component-button"
                            onClick={() => setExpandedGradeComponentId(isOpen ? '' : component.id)}
                            type="button"
                          >
                            <div className="campus-parent-mobile__grade-component-copy">
                              <strong>{component.label}</strong>
                              <span>{component.weight}%</span>
                            </div>
                            <div className="campus-parent-mobile__grade-component-score">
                              <strong>{formatGrade(component.average)}</strong>
                              <small>{isOpen ? 'Ocultar detalle' : 'Ver detalle'}</small>
                            </div>
                          </button>
                          {isOpen ? (
                            <div className="campus-parent-mobile__grade-component-detail">
                              {component.evaluations.map((evaluation) => (
                                <article className="campus-parent-mobile__grade-component-detail-item" key={evaluation.id}>
                                  <div className="campus-parent-mobile__grade-component-detail-top">
                                    <strong>{evaluation.title}</strong>
                                    <span>{evaluation.date}</span>
                                  </div>
                                  <div className="campus-parent-mobile__grade-component-detail-bottom">
                                    <span>Tema: {evaluation.topic}</span>
                                    <strong>{formatGrade(evaluation.score)}</strong>
                                  </div>
                                  {evaluation.feedback ? <p>{evaluation.feedback}</p> : null}
                                </article>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
                      )) : (
                        <div className="campus-parent-mobile__subject-empty-detail">
                          <strong>Sin calificaciones registradas</strong>
                          <span>Cuando el docente publique notas de esta materia, aparecerán aquí con sus componentes y observaciones.</span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      </section>
    );
  }

  if (effectiveActiveView === 'academic-attendance') {
    if (selectedChild?.isRealParentChild) {
      const emptyAttendanceSummary = createEmptyParentAttendanceSummary();
      const guidanceRoutineSummary = parentAcademicAttendance.guidanceRoutine?.summary || emptyAttendanceSummary;
      const classAttendanceSummary = parentAcademicAttendance.classAttendance?.summary || emptyAttendanceSummary;
      const classAttendanceSubjectsFromApi = Array.isArray(parentAcademicAttendance.classAttendance?.subjects) ? parentAcademicAttendance.classAttendance.subjects : [];
      const classAttendanceSubjectsMap = new Map(
        classAttendanceSubjectsFromApi.map((subjectGroup) => [
          normalizeLookupKey(subjectGroup?.subject || subjectGroup?.courseTitle || subjectGroup?.key),
          {
            ...subjectGroup,
            summary: { ...emptyAttendanceSummary, ...(subjectGroup?.summary || {}) },
            records: Array.isArray(subjectGroup?.records) ? subjectGroup.records : [],
          },
        ])
      );

      sortedGradebookSubjects.forEach((subject) => {
        const subjectKey = normalizeLookupKey(subject?.name || subject?.subject || subject?.courseTitle || subject?.id);
        if (!subjectKey) {
          return;
        }

        const existingSubjectGroup = classAttendanceSubjectsMap.get(subjectKey);
        if (existingSubjectGroup) {
          classAttendanceSubjectsMap.set(subjectKey, {
            ...existingSubjectGroup,
            subject: existingSubjectGroup.subject || subject.name || subject.subject || '',
            courseTitle: existingSubjectGroup.courseTitle || subject.name || subject.courseTitle || '',
          });
          return;
        }

        classAttendanceSubjectsMap.set(subjectKey, {
          key: subjectKey,
          subject: subject.name || subject.subject || '',
          courseTitle: subject.name || subject.courseTitle || '',
          summary: { ...emptyAttendanceSummary },
          records: [],
        });
      });

      const classAttendanceSubjects = Array.from(classAttendanceSubjectsMap.values()).sort((left, right) => {
        const leftIndex = sortedGradebookSubjects.findIndex((subject) => normalizeLookupKey(subject?.name || subject?.subject || subject?.courseTitle || subject?.id) === left.key);
        const rightIndex = sortedGradebookSubjects.findIndex((subject) => normalizeLookupKey(subject?.name || subject?.subject || subject?.courseTitle || subject?.id) === right.key);

        if (leftIndex !== -1 && rightIndex !== -1 && leftIndex !== rightIndex) {
          return leftIndex - rightIndex;
        }

        if (leftIndex !== -1 && rightIndex === -1) {
          return -1;
        }

        if (leftIndex === -1 && rightIndex !== -1) {
          return 1;
        }

        return String(left.subject || left.courseTitle || '').localeCompare(String(right.subject || right.courseTitle || ''), 'es', { sensitivity: 'base' });
      });

      return (
        <section className="campus-parent-mobile__academic-page campus-parent-mobile__academic-page--attendance">
          <header className="campus-parent-mobile__attendance-heading">
            <span>Académico</span>
            <h2>Puntualidad y asistencia</h2>
            <p>Separamos la llegada al colegio de la asistencia en cada asignatura para que puedas revisar ambas por aparte.</p>
          </header>

          {parentAcademicAttendance.isLoading ? <p className="campus-parent-mobile__academic-calendar-status">Cargando puntualidad y asistencia...</p> : null}
          {parentAcademicAttendance.error ? <p className="campus-parent-mobile__academic-calendar-status is-error">{parentAcademicAttendance.error}</p> : null}

          <section className="campus-parent-mobile__academic-section">
            <div className="campus-parent-mobile__attendance-section-head">
              <div>
                <span>Guidance Routine</span>
                <h3>Llegada al colegio</h3>
                <p>Corresponde al ingreso del alumno a la jornada del día.</p>
              </div>
            </div>
            <div className="campus-parent-mobile__attendance-kpi-grid is-quad">
              <ParentAttendanceKpiCard count={guidanceRoutineSummary.present || 0} iconVariant="present" label="A tiempo" tone="present" />
              <ParentAttendanceKpiCard count={guidanceRoutineSummary.late || 0} iconVariant="late" label="Tarde" tone="late" />
              <ParentAttendanceKpiCard count={guidanceRoutineSummary.absent || 0} iconVariant="absent" label="No llegó" tone="absent" />
              <ParentAttendanceKpiCard count={guidanceRoutineSummary.excused || 0} iconVariant="excused" label="Excusado" tone="excused" />
            </div>
            <div className="campus-parent-mobile__attendance-panel-stack">
              {Number(guidanceRoutineSummary.total || 0) > 0 ? (
                <article className="campus-parent-mobile__attendance-action-card">
                  <span className="campus-parent-mobile__attendance-kpi-icon is-records" aria-hidden="true">
                    <ParentAttendanceSummaryIcon variant="records" />
                  </span>
                  <div className="campus-parent-mobile__attendance-empty-copy">
                    <strong>Ver registros</strong>
                    <span>Consulta el historial de llegadas en páginas de {PARENT_GUIDANCE_ROUTINE_PAGE_SIZE} registros.</span>
                  </div>
                  <button
                    className="campus-parent-mobile__attendance-action-button"
                    onClick={() => setGuidanceRoutineLog((current) => ({ ...current, isOpen: true, page: 1, error: '' }))}
                    type="button"
                  >
                    Abrir
                  </button>
                </article>
              ) : null}
              {!parentAcademicAttendance.isLoading && Number(guidanceRoutineSummary.total || 0) === 0 ? (
                <article className="campus-parent-mobile__attendance-empty-card">
                  <span className="campus-parent-mobile__attendance-empty-icon" aria-hidden="true">
                    <ParentAttendanceSummaryIcon variant="group" />
                  </span>
                  <div className="campus-parent-mobile__attendance-empty-copy">
                    <strong>Sin registros de Guidance Routine</strong>
                    <span>Todavía no hay llegadas al colegio guardadas para este alumno.</span>
                  </div>
                </article>
              ) : null}
            </div>
          </section>

          <section className="campus-parent-mobile__academic-section">
            <div className="campus-parent-mobile__attendance-section-head">
              <div>
                <span>Asistencia a clase</span>
                <h3>Materias del alumno</h3>
                <p>Aquí puedes ver por asignatura si entró a tiempo, llegó tarde o no asistió a la clase.</p>
              </div>
            </div>
            <div className="campus-parent-mobile__attendance-kpi-grid is-quad">
              <ParentAttendanceKpiCard count={classAttendanceSummary.total || 0} iconVariant="records" label="Registros" suffix="total" tone="records" />
              <ParentAttendanceKpiCard count={classAttendanceSummary.present || 0} iconVariant="present" label="A tiempo" tone="present" />
              <ParentAttendanceKpiCard count={classAttendanceSummary.late || 0} iconVariant="late" label="Tarde" tone="late" />
              <ParentAttendanceKpiCard count={classAttendanceSummary.absent || 0} iconVariant="absent" label="No asistió" tone="absent" />
            </div>
            <div className="campus-parent-mobile__attendance-panel-stack">
              {classAttendanceSubjects.map((subjectGroup) => (
                (() => {
                  const summary = subjectGroup.summary || emptyAttendanceSummary;
                  const punctualityRate = getParentAttendanceRate(summary);
                  const isOpen = selectedAttendanceSubjectKey === subjectGroup.key;
                  const hasAttendanceRecords = Number(summary.total || 0) > 0;
                  const rateTone = hasAttendanceRecords ? getAttendanceRateTone(punctualityRate) : 'neutral';
                  const subjectVisual = resolveParentSubjectVisualMeta(subjectGroup.subject || subjectGroup.courseTitle || '');

                  return (
                    <article
                      className={`campus-parent-mobile__attendance-subject-card${isOpen ? ' is-open' : ''}`}
                      key={subjectGroup.key}
                    >
                      <button
                        className="campus-parent-mobile__attendance-subject-trigger"
                        onClick={() => setSelectedAttendanceSubjectKey(isOpen ? '' : subjectGroup.key)}
                        type="button"
                      >
                        <span className={`campus-parent-mobile__grade-card-icon is-${subjectVisual.accent}`} aria-hidden="true">
                          <ParentAssignmentTypeIcon variant={subjectVisual.iconVariant} />
                        </span>
                        <div className="campus-parent-mobile__attendance-subject-copy">
                          <span>{subjectGroup.courseTitle || 'Asistencia a clase'}</span>
                          <strong>{subjectGroup.subject || subjectGroup.courseTitle || 'Asignatura'}</strong>
                        </div>
                        <div className="campus-parent-mobile__attendance-subject-score">
                          <strong className={`is-${rateTone}`}>{hasAttendanceRecords ? `${punctualityRate}%` : 'Sin registros'}</strong>
                          <small>% de llegadas a tiempo</small>
                        </div>
                        <span className={`campus-parent-mobile__attendance-subject-chevron${isOpen ? ' is-open' : ''}`} aria-hidden="true">
                          <ParentAcademicChevronIcon />
                        </span>
                      </button>
                      {isOpen ? (
                        <div className="campus-parent-mobile__attendance-subject-detail">
                          <div className="campus-parent-mobile__attendance-kpi-grid">
                            <ParentAttendanceKpiCard count={summary.present || 0} iconVariant="present" label="A tiempo" tone="present" />
                            <ParentAttendanceKpiCard count={summary.late || 0} iconVariant="late" label="Tarde" tone="late" />
                            <ParentAttendanceKpiCard count={summary.absent || 0} iconVariant="absent" label="No asistió" tone="absent" />
                          </div>
                          {(Array.isArray(subjectGroup.records) ? subjectGroup.records : []).length ? (
                            <div className="campus-parent-mobile__attendance-records-list">
                              {(Array.isArray(subjectGroup.records) ? subjectGroup.records : []).map((record) => (
                                <article className="campus-parent-mobile__attendance-record-card" key={`${subjectGroup.key}-${record.id}`}>
                                  <div className="campus-parent-mobile__attendance-record-copy">
                                    <span>{record.statusLabel || record.status}</span>
                                    <strong>{record.dateLabel || record.date}</strong>
                                    <small>{record.note || record.classSessionKey || 'Registro de clase'}</small>
                                  </div>
                                  <small>{record.attendanceTypeLabel || 'Registrado'}</small>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <article className="campus-parent-mobile__attendance-empty-card is-compact">
                              <span className="campus-parent-mobile__attendance-empty-icon" aria-hidden="true">
                                <ParentAttendanceSummaryIcon variant="group" />
                              </span>
                              <div className="campus-parent-mobile__attendance-empty-copy">
                                <strong>Sin asistencias registradas</strong>
                                <span>Cuando el docente de esta materia guarde asistencia, verás aquí el detalle.</span>
                              </div>
                            </article>
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })()
              ))}
              {!parentAcademicAttendance.isLoading && classAttendanceSubjects.length === 0 ? (
                <article className="campus-parent-mobile__attendance-empty-card">
                  <span className="campus-parent-mobile__attendance-empty-icon" aria-hidden="true">
                    <ParentAttendanceSummaryIcon variant="group" />
                  </span>
                  <div className="campus-parent-mobile__attendance-empty-copy">
                    <strong>Sin asistencias por materia</strong>
                    <span>Todavía no hay clases con asistencia guardada para este alumno.</span>
                  </div>
                </article>
              ) : null}
            </div>
          </section>

          {guidanceRoutineLog.isOpen ? (
            <ParentFeedBottomSheet
              onClose={() => setGuidanceRoutineLog((current) => ({ ...current, isOpen: false }))}
              title="Registros de llegada"
            >
              <div className="campus-parent-mobile__attendance-modal">
                <div className="campus-parent-mobile__attendance-modal-summary">
                  <span>{guidanceRoutineLog.pagination.totalRecords || 0} registros</span>
                  <strong>Página {guidanceRoutineLog.pagination.page || guidanceRoutineLog.page} de {guidanceRoutineLog.pagination.totalPages || 1}</strong>
                </div>
                {guidanceRoutineLog.isLoading ? <p className="campus-parent-mobile__sheet-empty">Cargando registros...</p> : null}
                {guidanceRoutineLog.error ? <p className="campus-parent-mobile__sheet-empty is-error">{guidanceRoutineLog.error}</p> : null}
                {!guidanceRoutineLog.isLoading && !guidanceRoutineLog.error ? (
                  guidanceRoutineLog.records.length ? (
                    <div className="campus-parent-mobile__attendance-table-wrap">
                      <table className="campus-parent-mobile__attendance-table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Estado</th>
                            <th>Nota</th>
                          </tr>
                        </thead>
                        <tbody>
                          {guidanceRoutineLog.records.map((record) => (
                            <tr key={`guidance-modal-${record.id}`}>
                              <td>{record.dateLabel || record.date}</td>
                              <td>{record.statusLabel || record.status}</td>
                              <td>{record.note || 'Ingreso de la jornada'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="campus-parent-mobile__sheet-empty">No hay registros para esta página.</p>
                ) : null}
                <div className="campus-parent-mobile__attendance-pagination">
                  <button
                    disabled={guidanceRoutineLog.isLoading || !guidanceRoutineLog.pagination.hasPreviousPage}
                    onClick={() => setGuidanceRoutineLog((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
                    type="button"
                  >
                    Anterior
                  </button>
                  <span>Página {guidanceRoutineLog.pagination.page || guidanceRoutineLog.page}</span>
                  <button
                    disabled={guidanceRoutineLog.isLoading || !guidanceRoutineLog.pagination.hasNextPage}
                    onClick={() => setGuidanceRoutineLog((current) => ({ ...current, page: current.page + 1 }))}
                    type="button"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </ParentFeedBottomSheet>
          ) : null}
        </section>
      );
    }

    const attendanceSummary = selectedChild?.isRealParentChild
      ? parentAcademicAttendance.summary || { attendanceRate: 'Sin datos', lateCount: 0, excusedAbsences: 0, unexcusedAbsences: 0 }
      : academicWorkspace.attendance;
    const attendanceRecords = selectedChild?.isRealParentChild ? parentAcademicAttendance.records : academicWorkspace.attendance.records;

    return (
      <section className="campus-parent-mobile__academic-page campus-parent-mobile__academic-page--attendance">
        <header className="campus-parent-mobile__attendance-heading">
          <span>Académico</span>
          <h2>Asistencia</h2>
        </header>
        <section className="campus-parent-mobile__mini-grid campus-parent-mobile__attendance-summary-grid">
          <article className="campus-parent-mobile__metric-card">
            <span>Asistencia general</span>
            <strong>{attendanceSummary.attendanceRate || selectedChild.attendanceRate}</strong>
          </article>
          <article className="campus-parent-mobile__metric-card">
            <span>Llegadas tarde</span>
            <strong>{attendanceSummary.lateCount || 0}</strong>
          </article>
          <article className="campus-parent-mobile__metric-card">
            <span>Ausencias justificadas</span>
            <strong>{attendanceSummary.excusedAbsences || 0}</strong>
          </article>
          <article className="campus-parent-mobile__metric-card">
            <span>Ausencias sin justificar</span>
            <strong>{attendanceSummary.unexcusedAbsences || 0}</strong>
          </article>
        </section>
        <section className="campus-parent-mobile__academic-section">
          <h3>Registro diario</h3>
          {parentAcademicAttendance.isLoading ? <p className="campus-parent-mobile__academic-calendar-status">Cargando asistencia...</p> : null}
          {parentAcademicAttendance.error ? <p className="campus-parent-mobile__academic-calendar-status is-error">{parentAcademicAttendance.error}</p> : null}
          <div className="campus-parent-mobile__card-stack">
            {attendanceRecords.map((record) => (
              <article className="campus-parent-mobile__list-card campus-parent-mobile__attendance-card" key={record.id}>
                <div>
                  <strong>{record.statusLabel || record.status}</strong>
                  <span>{[record.attendanceTypeLabel, record.courseTitle || record.subject, record.note].filter(Boolean).join(' · ')}</span>
                </div>
                <strong>{record.dateLabel || record.date}</strong>
              </article>
            ))}
            {!parentAcademicAttendance.isLoading && attendanceRecords.length === 0 ? (
              <article className="campus-parent-mobile__list-card campus-parent-mobile__attendance-card">
                <div>
                  <strong>Sin registros</strong>
                  <span>Todavía no hay asistencia guardada para este alumno.</span>
                </div>
              </article>
            ) : null}
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="campus-parent-mobile__academic-page">
      <section className="campus-parent-mobile__academic-section">
        <h3>Insights con GIO IA</h3>
        <div className="campus-parent-mobile__card-stack">
          {academicWorkspace.insights.map((insight) => (
            <article className={`campus-parent-mobile__list-card campus-parent-mobile__gio-card is-${insight.tone}`} key={insight.id}>
              <div>
                <strong>{insight.title}</strong>
                <span>{insight.detail}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function ParentCampusHome({ routeBase = '', embedPortal = false, studentPortalMode = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const schoolDisplayName = getSchoolDisplayName(user, user?.schoolId || 'Colegio');
  const baseWorkspace = useMemo(() => buildParentPreviewWorkspace(user), [user]);
  const [parentOverview, setParentOverview] = useState(null);
  const [parentAppFeatures, setParentAppFeatures] = useState(defaultParentAppFeatures);
  const [parentOverviewLoading, setParentOverviewLoading] = useState(true);
  const [studentPortalLoadError, setStudentPortalLoadError] = useState('');
  const [studentPortalRetryCount, setStudentPortalRetryCount] = useState(0);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [localActiveSection, setLocalActiveSection] = useState('home');
  const [activeAcademicView, setActiveAcademicView] = useState('academic-performance');
  const [focusedAssignmentId, setFocusedAssignmentId] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showFinanceChildOptions, setShowFinanceChildOptions] = useState(false);
  const [showAcademicMenu, setShowAcademicMenu] = useState(false);
  const [showCafeteriaMenu, setShowCafeteriaMenu] = useState(false);
  const [activeCafeteriaView, setActiveCafeteriaView] = useState('cafeteria-overview');
  const [showCareMenu, setShowCareMenu] = useState(false);
  const [academicFeed, setAcademicFeed] = useState([]);
  const [academicBilling, setAcademicBilling] = useState({
    summary: { pendingAmount: 0, pendingCount: 0 },
    currentCharges: [],
    charges: [],
    payments: [],
    paymentHistory: [],
    pricingGuides: {},
  });
  const [nursingRecords, setNursingRecords] = useState([]);
  const [psychologyCases, setPsychologyCases] = useState([]);
  const [expandedNursingRecordId, setExpandedNursingRecordId] = useState('');
  const [nursingLoading, setNursingLoading] = useState(false);
  const [psychologyLoading, setPsychologyLoading] = useState(false);
  const [academicLoading, setAcademicLoading] = useState(false);
  const [academicPaymentMessage, setAcademicPaymentMessage] = useState('');
  const [payingChargeId, setPayingChargeId] = useState('');
  const [matriculaFlowOpen, setMatriculaFlowOpen] = useState(false);
  const [matriculaFlowPendingResume, setMatriculaFlowPendingResume] = useState(false);
  const [matriculaProcess, setMatriculaProcess] = useState(null);
  const [matriculaFlowCharge, setMatriculaFlowCharge] = useState(null);
  const [matriculaPendingSignature, setMatriculaPendingSignature] = useState(null);
  // Idle + checking keep Millennium locked until the first gate resolution finishes.
  const [matriculaAccessGate, setMatriculaAccessGate] = useState('idle');
  const matriculaAccessRequestRef = useRef(0);
  const [showFinanceConceptsSheet, setShowFinanceConceptsSheet] = useState(false);
  const [financePaymentsPage, setFinancePaymentsPage] = useState(1);
  const [feedLikesSheetId, setFeedLikesSheetId] = useState('');
  const [feedCommentsSheetId, setFeedCommentsSheetId] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [feedActionMessage, setFeedActionMessage] = useState('');
  const [pendingFeedLikeIds, setPendingFeedLikeIds] = useState([]);
  const [pendingFeedCommentLikeKeys, setPendingFeedCommentLikeKeys] = useState([]);
  const [feedRefreshCount, setFeedRefreshCount] = useState(0);
  const [academicRefreshCount, setAcademicRefreshCount] = useState(0);
  const [studentFeedFilter, setStudentFeedFilter] = useState('all');
  const [showCommunityCamera, setShowCommunityCamera] = useState(false);
  const [showCommunityComposer, setShowCommunityComposer] = useState(false);
  const [communityMediaUploading, setCommunityMediaUploading] = useState(false);
  const [communityPublishing, setCommunityPublishing] = useState(false);
  const [communityDraft, setCommunityDraft] = useState({
    title: '',
    body: '',
    audienceType: 'general',
    media: [],
  });
  const pendingFeedLikeIdsRef = useRef(new Set());
  const pendingFeedCommentLikeKeysRef = useRef(new Set());
  const communitySwipeStartRef = useRef(null);
  const userMenuRef = useRef(null);
  const normalizedRouteBase = useMemo(() => normalizeRouteBase(routeBase), [routeBase]);
  const usesRoutedSections = Boolean(normalizedRouteBase);
  const useQuerySectionRouting = shouldUseParentQuerySectionRouting();
  const studentGamesAvailable = useStudentGamesAvailable();
  const portalAppFeatures = useMemo(() => {
    if (!studentPortalMode) {
      return parentAppFeatures;
    }

    return {
      ...parentAppFeatures,
      games: studentGamesAvailable,
    };
  }, [parentAppFeatures, studentPortalMode, studentGamesAvailable]);
  const activeSection = useMemo(() => {
    if (!usesRoutedSections) {
      return localActiveSection;
    }

    const sectionFromSearch = useQuerySectionRouting
      ? resolveParentSectionFromSearch(location.search)
      : '';
    if (sectionFromSearch && isParentSectionEnabled(sectionFromSearch, portalAppFeatures)) {
      return sectionFromSearch;
    }

    return resolveRoutedSection(location.pathname, normalizedRouteBase);
  }, [
    localActiveSection,
    location.pathname,
    location.search,
    normalizedRouteBase,
    portalAppFeatures,
    studentPortalMode,
    useQuerySectionRouting,
    usesRoutedSections,
  ]);

  useEffect(() => {
    const isGamesRoute = activeSection === 'games';
    document.documentElement.classList.toggle('games-route-active', isGamesRoute);
    document.body.classList.toggle('games-route-active', isGamesRoute);

    return () => {
      document.documentElement.classList.remove('games-route-active');
      document.body.classList.remove('games-route-active');
    };
  }, [activeSection]);

  useEffect(() => {
    if (!feedActionMessage) {
      return undefined;
    }
    const ephemeralMessages = new Set([
      'Borrador eliminado.',
      'Tu publicación ya está visible en el feed.',
    ]);
    if (!ephemeralMessages.has(feedActionMessage) && !feedActionMessage.startsWith('Tu publicación quedó')) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setFeedActionMessage((current) => (ephemeralMessages.has(current) || current.startsWith('Tu publicación quedó') ? '' : current));
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [feedActionMessage]);

  useEffect(() => {
    const launchParams = readParentNotificationLaunchParams(location.search, location.pathname);
    const validAcademicViews = new Set(academicMenuItems.map((item) => item.id));

    if (launchParams.studentId) {
      setSelectedChildId(launchParams.studentId);
    }

    if (launchParams.academicView && validAcademicViews.has(launchParams.academicView)) {
      setActiveAcademicView(launchParams.academicView);
      setShowAcademicMenu(false);

      if (usesRoutedSections) {
        const academicTarget = buildParentSectionNavigateTarget(normalizedRouteBase, 'academic');
        const nextSearch = new URLSearchParams(location.search);
        if (useQuerySectionRouting) {
          nextSearch.set('section', 'academic');
        }
        const nextPath = nextSearch.toString() ? `${academicTarget.split('?')[0]}?${nextSearch.toString()}` : academicTarget;
        const currentPath = `${location.pathname}${location.search || ''}`;
        if (currentPath !== nextPath) {
          navigate(nextPath, { replace: true });
        }
      } else {
        setLocalActiveSection('academic');
      }
      return;
    }

    if (!usesRoutedSections && launchParams.section && launchParams.section !== 'home') {
      setLocalActiveSection(launchParams.section);
    }
  }, [location.search, location.pathname, navigate, normalizedRouteBase, useQuerySectionRouting, usesRoutedSections]);
  const cafeteriaBasePath = usesRoutedSections ? buildRoutedSectionPath(normalizedRouteBase, 'cafeteria') : '';
  const shouldUsePortalHeader = activeSection === 'cafeteria';
  const shouldUseEmbeddedCafeteriaPortal = activeSection === 'cafeteria' && embedPortal && cafeteriaBasePath;
  const canUseCampusPullRefresh = !shouldUseEmbeddedCafeteriaPortal;
  const visibleParentAppSections = useMemo(
    () => parentAppSections.filter((section) => isParentSectionEnabled(section.key, portalAppFeatures)),
    [portalAppFeatures]
  );
  const visibleStudentAppSections = useMemo(() => {
    return parentAppSections.filter((section) => {
      if (section.key === 'finance') {
        return false;
      }
      return isParentSectionEnabled(section.key, portalAppFeatures);
    });
  }, [portalAppFeatures]);
  const visiblePortalAppSections = studentPortalMode ? visibleStudentAppSections : visibleParentAppSections;
  const visibleParentCareMenuItems = useMemo(
    () => parentCareMenuItems.filter((item) => parentAppFeatures[item.id] !== false),
    [parentAppFeatures]
  );
  const visibleAcademicMenuItems = useMemo(
    () => academicMenuItems,
    []
  );

  const realParentChildren = useMemo(
    () => (parentOverview?.children || []).map((child) => buildParentChildFromOverview(child, parentOverview)),
    [parentOverview]
  );

  const workspace = useMemo(() => ({
    ...baseWorkspace,
    guardian: {
      ...baseWorkspace.guardian,
      name: parentOverview?.parent?.name || baseWorkspace.guardian.name,
      unreadCount: 0,
    },
    announcements: [],
    children: realParentChildren,
  }), [baseWorkspace, parentOverview, realParentChildren]);

  const isAllChildrenFeedSelected = selectedChildId === PARENT_FEED_ALL_CHILDREN_ID && activeSection === 'home';
  const selectedChild = workspace.children.find((child) => child.id === selectedChildId) || workspace.children[0] || null;
  const selectedChildForSwitcher = isAllChildrenFeedSelected
    ? {
        id: PARENT_FEED_ALL_CHILDREN_ID,
        name: 'Todos',
        displayGrade: `${workspace.children.length} alumnos vinculados`,
        grade: `${workspace.children.length} alumnos vinculados`,
        avatar: 'TD',
      }
    : selectedChild;
  const resolvedAcademicSchedule = useMemo(() => {
    if (!selectedChild?.isRealParentChild || !parentOverview) {
      return null;
    }

    const overviewStudentId = String(parentOverview.selectedStudentId || parentOverview.selectedStudent?._id || '');
    const selectedId = String(selectedChild.id || selectedChild._id || '');

    return overviewStudentId && overviewStudentId === selectedId
      ? parentOverview.academicSchedule || null
      : null;
  }, [parentOverview, selectedChild]);

  const selectedChildTransport = selectedChild?.transport || {};
  const hasAssignedTransportRoute = Boolean(
    String(selectedChildTransport.routeName || '').trim()
    && String(selectedChildTransport.routeName || '').trim().toLowerCase() !== 'sin ruta asignada'
  );

  useEffect(() => {
    let cancelled = false;
    setParentOverviewLoading(true);

    if (studentPortalMode) {
      setStudentPortalLoadError('');
      getStudentPortalOverview()
        .then((response) => {
          if (cancelled) {
            return;
          }
          const mappedOverview = mapStudentPortalOverviewToParentOverview(response.data || {}, user);
          setParentOverview(mappedOverview);
          setParentAppFeatures(normalizeParentAppFeatures(mappedOverview.parentAppFeatures || {}));
          setStudentPortalLoadError('');
        })
        .catch((error) => {
          if (!cancelled) {
            setParentOverview({ children: [] });
            setParentAppFeatures({ ...defaultParentAppFeatures, academic: true, games: true });
            setStudentPortalLoadError(
              error?.response?.data?.message
              || 'No se pudo cargar el portal del alumno. Intenta de nuevo.'
            );
          }
        })
        .finally(() => {
          if (!cancelled) {
            setParentOverviewLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    const overviewParams = selectedChildId && selectedChildId !== PARENT_FEED_ALL_CHILDREN_ID ? { studentId: selectedChildId } : {};

    getParentPortalOverview(overviewParams)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setParentOverview(response.data || { children: [] });
        setParentAppFeatures(normalizeParentAppFeatures(response.data?.parentAppFeatures || {}));
      })
      .catch(() => {
        if (!cancelled) {
          setParentOverview({ children: [] });
          setParentAppFeatures(defaultParentAppFeatures);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setParentOverviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChildId, studentPortalMode, studentPortalRetryCount, user]);

  useEffect(() => {
    if (!workspace.children.length) {
      if (selectedChildId) {
        setSelectedChildId('');
      }
      return;
    }

    if (selectedChildId === PARENT_FEED_ALL_CHILDREN_ID) {
      if (activeSection !== 'home' || workspace.children.length <= 1) {
        setSelectedChildId(workspace.children[0].id);
      }
      return;
    }

    if (!workspace.children.some((child) => child.id === selectedChildId)) {
      setSelectedChildId(workspace.children[0].id);
    }
  }, [activeSection, selectedChildId, workspace.children]);

  useEffect(() => {
    if (studentPortalMode || activeSection !== 'academic' || activeAcademicView !== 'academic-schedule' || !selectedChild?.id) {
      return undefined;
    }

    let cancelled = false;

    getParentPortalOverview({ studentId: selectedChild.id })
      .then((response) => {
        if (!cancelled) {
          setParentOverview(response.data || { children: [] });
          setParentAppFeatures(normalizeParentAppFeatures(response.data?.parentAppFeatures || {}));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeAcademicView, activeSection, selectedChild?.id, studentPortalMode]);

  useEffect(() => {
    if (parentOverviewLoading) {
      return undefined;
    }

    let cancelled = false;
    setAcademicLoading(true);

    const feedRequest = getParentAcademicFeed();
    const billingRequest = studentPortalMode
      ? Promise.resolve({ data: null })
      : getParentAcademicBilling();

    Promise.allSettled([feedRequest, billingRequest])
      .then(([feedResult, billingResult]) => {
        if (cancelled) {
          return;
        }

        if (feedResult.status === 'fulfilled') {
          setAcademicFeed(feedResult.value.data || []);
        } else {
          setFeedActionMessage(feedResult.reason?.response?.data?.message || 'No se pudo actualizar el feed.');
        }

        if (!studentPortalMode && billingResult.status === 'fulfilled') {
          setAcademicBilling(billingResult.value.data || {
            summary: { pendingAmount: 0, pendingCount: 0 },
            currentCharges: [],
            charges: [],
            payments: [],
            paymentHistory: [],
            pricingGuides: {},
          });
        }
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setFeedActionMessage('No se pudo actualizar el feed.');
      })
      .finally(() => {
        if (!cancelled) {
          setAcademicLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [parentOverviewLoading, selectedChildId, feedRefreshCount, studentPortalMode]);

  useEffect(() => {
    let cancelled = false;
    setNursingLoading(true);

    getParentNursingRecords()
      .then((response) => {
        if (!cancelled) {
          setNursingRecords(response.data?.records || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNursingRecords([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setNursingLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studentPortalMode]);

  useEffect(() => {
    let cancelled = false;
    setPsychologyLoading(true);

    getParentPsychologyRecords()
      .then((response) => {
        if (!cancelled) {
          setPsychologyCases(response.data?.cases || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPsychologyCases([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPsychologyLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studentPortalMode]);

  const refreshMatriculaPendingSignatures = useCallback(async () => {
    try {
      const response = await getEnrollmentMatriculaPendingSignatures();
      const items = response.data?.items || [];
      return items[0] || null;
    } catch (error) {
      return null;
    }
  }, []);

  const isMillenniumParent = useMemo(
    () => !studentPortalMode && isMillenniumSchool(schoolDisplayName, user?.schoolId),
    [schoolDisplayName, studentPortalMode, user?.schoolId],
  );

  const openMatriculaFlowFromProcess = useCallback((nextProcess, charge = null, {
    pendingResume = false,
    pendingSignature = null,
  } = {}) => {
    if (!nextProcess) {
      return;
    }

    setMatriculaProcess(nextProcess);
    setMatriculaFlowCharge(charge || nextProcess.charge || null);
    setMatriculaFlowPendingResume(pendingResume);
    setMatriculaFlowOpen(true);
    if (pendingSignature) {
      setMatriculaPendingSignature(pendingSignature);
    }
  }, []);

  const evaluateMatriculaAccess = useCallback(async () => {
    if (!isMillenniumParent || !user?.schoolId) {
      setMatriculaAccessGate('open');
      return;
    }

    const requestId = matriculaAccessRequestRef.current + 1;
    matriculaAccessRequestRef.current = requestId;
    setMatriculaAccessGate('checking');

    try {
      const billingResponse = await getParentAcademicBilling().catch(() => null);
      if (requestId !== matriculaAccessRequestRef.current) {
        return;
      }
      if (billingResponse?.data) {
        setAcademicBilling(billingResponse.data);
      }

      const [requirementResponse, pendingSignature] = await Promise.all([
        getEnrollmentMatriculaRequirement(),
        refreshMatriculaPendingSignatures(),
      ]);

      if (requestId !== matriculaAccessRequestRef.current) {
        return;
      }

      const requirement = requirementResponse.data || {};
      const blockingProcess = (
        (requirement.required && requirement.process)
          ? requirement.process
          : null
      ) || (
        pendingSignature?.requiresSignature || ['payment_confirmed', 'contract_pending', 'pagare_pending', 'office_payment_confirmed'].includes(String(pendingSignature?.status || ''))
          ? pendingSignature
          : null
      );

      if (blockingProcess && !blockingProcess.isCompleted) {
        const isSignaturePending = requirement.reason === 'signature_pending'
          || Boolean(blockingProcess.requiresSignature)
          || ['payment_confirmed', 'contract_pending', 'pagare_pending', 'office_payment_confirmed'].includes(String(blockingProcess.status || ''));

        openMatriculaFlowFromProcess(
          blockingProcess,
          requirement.charge || blockingProcess.charge || null,
          {
            pendingResume: isSignaturePending,
            pendingSignature: isSignaturePending ? blockingProcess : null,
          },
        );
        setMatriculaAccessGate('blocked');
        return;
      }

      if (pendingSignature?._id && !pendingSignature.isCompleted) {
        setMatriculaPendingSignature(pendingSignature);

        if (pendingSignature.requiresSignature) {
          openMatriculaFlowFromProcess(
            pendingSignature,
            pendingSignature.charge || null,
            { pendingResume: true, pendingSignature },
          );
          setMatriculaAccessGate('blocked');
          return;
        }

        try {
          const statusResponse = await getEnrollmentMatriculaPaymentStatus(pendingSignature._id);
          if (requestId !== matriculaAccessRequestRef.current) {
            return;
          }
          const nextProcess = statusResponse.data?.process;
          if (nextProcess?.requiresSignature || !nextProcess?.isCompleted) {
            openMatriculaFlowFromProcess(nextProcess || pendingSignature, nextProcess?.charge || pendingSignature.charge || null, {
              pendingResume: true,
              pendingSignature: nextProcess || pendingSignature,
            });
            setMatriculaAccessGate('blocked');
            return;
          }
        } catch (error) {
          openMatriculaFlowFromProcess(
            pendingSignature,
            pendingSignature.charge || null,
            { pendingResume: true, pendingSignature },
          );
          setMatriculaAccessGate('blocked');
          return;
        }
      }

      setMatriculaPendingSignature(null);
      setMatriculaFlowOpen(false);
      setMatriculaFlowPendingResume(false);
      setMatriculaAccessGate('open');
    } catch (error) {
      if (requestId !== matriculaAccessRequestRef.current) {
        return;
      }
      setMatriculaAccessGate('blocked');
      setAcademicPaymentMessage(error?.response?.data?.message || 'No se pudo validar el estado de matrícula.');
    }
  }, [isMillenniumParent, openMatriculaFlowFromProcess, refreshMatriculaPendingSignatures, user?.schoolId]);

  useEffect(() => {
    evaluateMatriculaAccess();
  }, [evaluateMatriculaAccess, user?.id]);

  useEffect(() => {
    if (!isMillenniumParent || matriculaAccessGate !== 'blocked' || matriculaFlowOpen) {
      return undefined;
    }

    const resumeProcess = (matriculaProcess && !matriculaProcess.isCompleted)
      ? matriculaProcess
      : (matriculaPendingSignature && !matriculaPendingSignature.isCompleted ? matriculaPendingSignature : null);

    if (!resumeProcess) {
      return undefined;
    }

    openMatriculaFlowFromProcess(resumeProcess, resumeProcess.charge || matriculaFlowCharge || null, {
      pendingResume: true,
      pendingSignature: resumeProcess,
    });
    return undefined;
  }, [
    isMillenniumParent,
    matriculaAccessGate,
    matriculaFlowCharge,
    matriculaFlowOpen,
    matriculaPendingSignature,
    matriculaProcess,
    openMatriculaFlowFromProcess,
  ]);

  useEffect(() => {
    if (!isMillenniumParent) {
      return undefined;
    }

    let listenerHandle = null;
    let cancelled = false;

    import('@capacitor/app')
      .then(({ App }) => App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && !cancelled) {
          evaluateMatriculaAccess();
        }
      }))
      .then((handle) => {
        if (!cancelled) {
          listenerHandle = handle;
        } else {
          handle.remove();
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      listenerHandle?.remove();
    };
  }, [evaluateMatriculaAccess, isMillenniumParent]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const processId = String(params.get('matriculaProcessId') || '').trim();
    const paymentPurpose = String(params.get('paymentPurpose') || '').trim();
    const wompiTransactionId = String(params.get('id') || '').trim();
    if (!processId || paymentPurpose !== 'enrollment_matricula') {
      return;
    }

    let cancelled = false;
    const resumeMatriculaFlow = async () => {
      try {
        if (wompiTransactionId) {
          await getWompiMatriculaPaymentStatus({ transactionId: wompiTransactionId }).catch(() => null);
        }
        const response = await getEnrollmentMatriculaPaymentStatus(processId);
        if (cancelled) return;
        const nextProcess = response.data?.process;
        if (!nextProcess) return;
        setMatriculaProcess(nextProcess);
        setMatriculaFlowCharge(nextProcess.charge || null);
        setMatriculaFlowPendingResume(false);
        setMatriculaFlowOpen(true);
        setMatriculaAccessGate('blocked');
        setMatriculaPendingSignature(null);
      } catch (error) {
        if (!cancelled) {
          refreshMatriculaPendingSignatures();
        }
      }
    };

    resumeMatriculaFlow();
    return () => {
      cancelled = true;
    };
  }, [location.search, refreshMatriculaPendingSignatures]);

  const refreshParentSection = useCallback(async () => {
    if (studentPortalMode) {
      const refreshTasks = [
        getStudentPortalOverview()
          .then((response) => {
            const mappedOverview = mapStudentPortalOverviewToParentOverview(response.data || {}, user);
            setParentOverview(mappedOverview);
            setParentAppFeatures(normalizeParentAppFeatures(mappedOverview.parentAppFeatures || {}));
          })
          .catch(() => {
            setParentOverview({ children: [] });
          }),
      ];

      if (['home', 'academic'].includes(activeSection)) {
        setAcademicLoading(true);
        refreshTasks.push(
          getParentAcademicFeed()
            .then((response) => setAcademicFeed(response.data || []))
            .catch(() => setFeedActionMessage('No se pudo actualizar el feed.'))
            .finally(() => setAcademicLoading(false))
        );
      }

      if (activeSection === 'academic') {
        setAcademicRefreshCount((currentValue) => currentValue + 1);
      }

      if (activeSection === 'nursing') {
        setNursingLoading(true);
        refreshTasks.push(
          getParentNursingRecords()
            .then((response) => setNursingRecords(response.data?.records || []))
            .catch(() => setNursingRecords([]))
            .finally(() => setNursingLoading(false))
        );
      }

      if (activeSection === 'wellbeing') {
        setPsychologyLoading(true);
        refreshTasks.push(
          getParentPsychologyRecords()
            .then((response) => setPsychologyCases(response.data?.cases || []))
            .catch(() => setPsychologyCases([]))
            .finally(() => setPsychologyLoading(false))
        );
      }

      await Promise.allSettled(refreshTasks);
      return;
    }

    const overviewParams = selectedChildId && selectedChildId !== PARENT_FEED_ALL_CHILDREN_ID
      ? { studentId: selectedChildId }
      : {};
    const refreshTasks = [
      getParentPortalOverview(overviewParams)
        .then((response) => {
          setParentOverview(response.data || { children: [] });
          setParentAppFeatures(normalizeParentAppFeatures(response.data?.parentAppFeatures || {}));
        })
        .catch(() => {
          setParentOverview({ children: [] });
          setParentAppFeatures(defaultParentAppFeatures);
        }),
      refreshMatriculaPendingSignatures(),
      evaluateMatriculaAccess(),
    ];

    if (['home', 'finance', 'academic'].includes(activeSection)) {
      setAcademicLoading(true);
      refreshTasks.push(
        Promise.allSettled([getParentAcademicFeed(), getParentAcademicBilling()])
          .then(([feedResult, billingResult]) => {
            if (feedResult.status === 'fulfilled') {
              setAcademicFeed(feedResult.value.data || []);
            } else {
              setFeedActionMessage(feedResult.reason?.response?.data?.message || 'No se pudo actualizar el feed.');
            }

            if (billingResult.status === 'fulfilled') {
              setAcademicBilling(billingResult.value.data || {
            summary: { pendingAmount: 0, pendingCount: 0 },
            currentCharges: [],
            charges: [],
            payments: [],
            paymentHistory: [],
            pricingGuides: {},
          });
            }
          })
          .finally(() => setAcademicLoading(false))
      );
    }

    if (activeSection === 'academic') {
      setAcademicRefreshCount((currentValue) => currentValue + 1);
    }

    if (activeSection === 'nursing') {
      setNursingLoading(true);
      refreshTasks.push(
        getParentNursingRecords()
          .then((response) => setNursingRecords(response.data?.records || []))
          .catch(() => setNursingRecords([]))
          .finally(() => setNursingLoading(false))
      );
    }

    if (activeSection === 'wellbeing') {
      setPsychologyLoading(true);
      refreshTasks.push(
        getParentPsychologyRecords()
          .then((response) => setPsychologyCases(response.data?.cases || []))
          .catch(() => setPsychologyCases([]))
          .finally(() => setPsychologyLoading(false))
      );
    }

    await Promise.allSettled(refreshTasks);
  }, [activeSection, evaluateMatriculaAccess, refreshMatriculaPendingSignatures, selectedChildId, studentPortalMode, user]);

  const {
    contentOffset: pullRefreshContentOffset,
    distance: pullRefreshDistance,
    isReady: pullRefreshActive,
    isRefreshing: pullRefreshing,
    threshold: pullRefreshThreshold,
    touchHandlers: pullRefreshTouchHandlers,
  } = useParentPullToRefresh({
    enabled: canUseCampusPullRefresh,
    onRefresh: refreshParentSection,
  });

  const financeCharges = useMemo(() => {
    if (!selectedChild) {
      return [];
    }

    const childId = String(selectedChild._id || selectedChild.id || '');
    const childNameKey = normalizeLookupKey(selectedChild.name);
    const pendingCharges = Array.isArray(academicBilling.currentCharges) && academicBilling.currentCharges.length
      ? academicBilling.currentCharges
      : (academicBilling.charges || []);
    return pendingCharges.filter((charge) => {
      const chargeStudentId = String(charge.studentId?._id || charge.studentId || '');
      return (childId && chargeStudentId === childId) || (childNameKey && normalizeLookupKey(charge.studentName) === childNameKey);
    });
  }, [academicBilling.charges, academicBilling.currentCharges, selectedChild]);

  const financePayments = useMemo(() => {
    if (!selectedChild) {
      return [];
    }

    const childId = String(selectedChild._id || selectedChild.id || '');
    const childNameKey = normalizeLookupKey(selectedChild.name);
    const history = (Array.isArray(academicBilling.paymentHistory) && academicBilling.paymentHistory.length
      ? academicBilling.paymentHistory
      : (academicBilling.payments || []));
    return history
      .filter((payment) => {
        const paymentStudentId = String(payment.studentId?._id || payment.studentId || '');
        return (childId && paymentStudentId === childId) || (childNameKey && normalizeLookupKey(payment.studentName) === childNameKey);
      })
      .sort((left, right) => {
        const leftTime = new Date(left.paidAt || left.createdAt || 0).getTime();
        const rightTime = new Date(right.paidAt || right.createdAt || 0).getTime();
        return rightTime - leftTime;
      });
  }, [academicBilling.paymentHistory, academicBilling.payments, selectedChild]);

  const financePaymentsTotalPages = useMemo(
    () => Math.max(1, Math.ceil(financePayments.length / FINANCE_PAYMENTS_PAGE_SIZE)),
    [financePayments.length],
  );

  const financePaymentsCurrentPage = useMemo(
    () => Math.min(Math.max(financePaymentsPage, 1), financePaymentsTotalPages),
    [financePaymentsPage, financePaymentsTotalPages],
  );

  const paginatedFinancePayments = useMemo(() => {
    const startIndex = (financePaymentsCurrentPage - 1) * FINANCE_PAYMENTS_PAGE_SIZE;
    return financePayments.slice(startIndex, startIndex + FINANCE_PAYMENTS_PAGE_SIZE);
  }, [financePayments, financePaymentsCurrentPage]);

  useEffect(() => {
    setFinancePaymentsPage(1);
  }, [selectedChildId]);

  useEffect(() => {
    setFocusedAssignmentId('');
  }, [selectedChildId]);

  const selectedFinanceSummary = useMemo(() => {
    if (!selectedChild) {
      return null;
    }

    const childId = String(selectedChild._id || selectedChild.id || '');
    const childNameKey = normalizeLookupKey(selectedChild.name);
    const concepts = buildParentFinanceConceptsFromCharges(financeCharges);
    const apiSummary = (academicBilling.studentSummaries || []).find((item) => {
      const summaryStudentId = String(item.studentId || '');
      return (childId && summaryStudentId === childId) || (childNameKey && normalizeLookupKey(item.studentName) === childNameKey);
    });
    const conceptsTotalAmount = concepts.reduce((sum, concept) => sum + Number(concept.amount || 0), 0);
    const conceptsOriginalTotalAmount = concepts.reduce(
      (sum, concept) => sum + Number(concept.originalAmount || concept.amount || 0),
      0,
    );

    if (!concepts.length && !apiSummary) {
      return null;
    }

    return {
      ...(apiSummary || {}),
      studentId: childId,
      studentName: apiSummary?.studentName || selectedChild.name,
      amount: conceptsTotalAmount || Number(apiSummary?.amount || 0),
      totalAmount: conceptsOriginalTotalAmount || Number(apiSummary?.totalAmount || apiSummary?.amount || 0),
      pendingCount: concepts.length || Number(apiSummary?.pendingCount || 0),
      overdueMonths: Number(apiSummary?.overdueMonths || 0),
      requiresDataSchoolContact: Boolean(apiSummary?.requiresDataSchoolContact),
      dataSchoolWhatsappUrl: apiSummary?.dataSchoolWhatsappUrl || '',
      payableChargeIds: concepts.map((concept) => concept.chargeId || concept._id).filter(Boolean),
      concepts,
    };
  }, [academicBilling.studentSummaries, financeCharges, selectedChild]);

  const selectedPricingGuide = useMemo(() => {
    if (!selectedChild) {
      return null;
    }

    return resolveParentPricingGuide(academicBilling.pricingGuides, selectedChild, financeCharges);
  }, [academicBilling.pricingGuides, financeCharges, selectedChild]);

  const matriculaPaymentOptions = useMemo(() => {
    if (!isMillenniumParent) {
      return [];
    }

    const pendingCharges = (academicBilling.charges || []).filter((item) => (
      String(item.category || '').toLowerCase() === 'annual_tuition'
      && ['pending', 'overdue'].includes(String(item.status || '').toLowerCase())
    ));

    return pendingCharges.map((item) => {
      const amount = Number(item.amount || 0);
      const originalAmount = Number(item.originalAmount || item.chargeAmount || item.amount || 0);
      return {
        chargeId: String(item._id || item.id || ''),
        studentId: String(item.studentId?._id || item.studentId || ''),
        studentName: item.studentName || item.student?.name || 'Estudiante',
        concept: item.concept || 'Matrícula anual',
        amount,
        originalAmount,
        hasDiscount: originalAmount > amount && amount > 0,
      };
    }).filter((item) => item.chargeId);
  }, [academicBilling.charges, isMillenniumParent]);

  const onMatriculaPaymentStudentChange = useCallback(async (chargeId) => {
    const response = await getEnrollmentMatriculaProcess(chargeId);
    const nextProcess = response.data?.process;
    if (!nextProcess) {
      throw new Error('No se pudo cargar el proceso de matrícula para ese estudiante.');
    }

    setMatriculaProcess(nextProcess);
    setMatriculaFlowCharge(nextProcess.charge || null);
    setMatriculaFlowPendingResume(false);
    setMatriculaAccessGate('blocked');
  }, []);

  const primaryPendingCharge = resolveParentPayableCharge(financeCharges);
  const shouldLockParentPortal = isMillenniumParent && (
    matriculaAccessGate === 'idle'
    || matriculaAccessGate === 'checking'
    || (matriculaAccessGate === 'blocked' && !(matriculaProcess?.isCompleted))
  );
  const isBlockingMatriculaFlow = Boolean(
    shouldLockParentPortal
    && (matriculaFlowOpen || matriculaAccessGate === 'blocked')
    && matriculaProcess
    && !matriculaProcess.isCompleted,
  );
  const selectedFinanceConcepts = selectedFinanceSummary?.concepts || [];
  const selectedFinanceConceptsTotal = selectedFinanceConcepts.reduce((sum, concept) => sum + Number(concept.amount || 0), 0);
  const selectedFinanceConceptsOriginalTotal = selectedFinanceConcepts.reduce(
    (sum, concept) => sum + Number(concept.originalAmount || concept.amount || 0),
    0,
  );
  const selectedFinanceAmount = selectedFinanceConceptsTotal;
  const selectedFinanceTotalAmount = selectedFinanceConceptsOriginalTotal;
  const selectedFinanceFullAmount = selectedFinanceSummary?.requiresDataSchoolContact ? 0 : selectedFinanceConceptsOriginalTotal;
  const selectedFinanceHasDiscount = selectedFinanceFullAmount > selectedFinanceAmount;
  const financeHeroEyebrow = resolveParentFinanceHeroEyebrow(primaryPendingCharge, selectedFinanceConcepts);
  const financeHeroPayLabel = selectedFinanceSummary?.requiresDataSchoolContact
    ? 'WhatsApp DataSchool'
    : (String(primaryPendingCharge?.category || '').toLowerCase() === 'annual_tuition'
      ? 'Pagar matrícula'
      : String(primaryPendingCharge?.category || '').toLowerCase() === 'monthly_tuition'
        ? 'Pagar pensión'
        : 'Pagar');
  const hideEnrollmentPaymentAmount = shouldHideParentEnrollmentPaymentAmount({
    schoolId: user?.schoolId,
    schoolName: schoolDisplayName,
  }) && String(primaryPendingCharge?.category || '').toLowerCase() === 'annual_tuition';
  const financeHeroNote = selectedFinanceSummary?.requiresDataSchoolContact
    ? `Tienes ${selectedFinanceSummary.overdueMonths} mensualidades vencidas.`
    : selectedFinanceConcepts.length > 1
      ? `${selectedFinanceConcepts.length} cobros pendientes · el siguiente pago es ${primaryPendingCharge?.concept || 'académico'}`
      : primaryPendingCharge
        ? (formatParentFinanceDate(primaryPendingCharge?.dueDate, { day: '2-digit', month: 'long' })
          ? `Vence ${formatParentFinanceDate(primaryPendingCharge?.dueDate, { day: '2-digit', month: 'long' })} · ${primaryPendingCharge.concept || 'Cobro académico'}`
          : (primaryPendingCharge.concept || 'Tienes un cobro académico pendiente'))
        : 'No tienes pagos pendientes este mes';

  const handleNotificationNavigate = useCallback((path) => {
    const nextPath = String(path || '').trim();
    if (!nextPath) {
      return;
    }
    navigate(nextPath);
  }, [navigate]);

  const onLogout = () => {
    setShowUserMenu(false);
    logout();
    navigate(LOGIN_PATH, { replace: true });
  };

  const onPayAcademicCharge = async () => {
    if (selectedFinanceSummary?.requiresDataSchoolContact) {
      if (selectedFinanceSummary.dataSchoolWhatsappUrl) {
        window.open(selectedFinanceSummary.dataSchoolWhatsappUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    const payableChargeIds = primaryPendingCharge?._id ? [primaryPendingCharge._id] : [];

    if (!payableChargeIds.length) {
      return;
    }

    const isAnnualTuition = String(primaryPendingCharge?.category || '').toLowerCase() === 'annual_tuition';

    if (isAnnualTuition) {
      setPayingChargeId(payableChargeIds[0]);
      setAcademicPaymentMessage('');

      try {
        const response = await getEnrollmentMatriculaProcess(payableChargeIds[0]);
        const nextProcess = response.data?.process;
        if (!nextProcess) {
          throw new Error('No se pudo iniciar el proceso de matricula.');
        }
        setMatriculaProcess(nextProcess);
        setMatriculaFlowCharge(nextProcess.charge || primaryPendingCharge);
        setMatriculaFlowPendingResume(false);
        setMatriculaFlowOpen(true);
        setShowFinanceConceptsSheet(false);
      } catch (error) {
        setAcademicPaymentMessage(error?.response?.data?.message || 'No se pudo iniciar el proceso de matricula.');
      } finally {
        setPayingChargeId('');
      }
      return;
    }

    setPayingChargeId(payableChargeIds[0]);
    setAcademicPaymentMessage('');

    try {
      await payParentAcademicCharge(payableChargeIds[0], { method: 'parent_portal' });
      const billingResponse = await getParentAcademicBilling();
      setAcademicBilling(billingResponse.data || {
        summary: { pendingAmount: 0, pendingCount: 0 },
        currentCharges: [],
        charges: [],
        payments: [],
        paymentHistory: [],
        pricingGuides: {},
      });
      setShowFinanceConceptsSheet(false);
      setAcademicPaymentMessage('Pago registrado. Estás al día.');
    } catch (error) {
      const whatsappUrl = error?.response?.data?.dataSchoolWhatsappUrl;
      if (whatsappUrl) {
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      }
      setAcademicPaymentMessage(error?.response?.data?.message || 'No se pudo registrar el pago.');
    } finally {
      setPayingChargeId('');
    }
  };

  const onSelectSection = (sectionKey) => {
    expandBottomNav();

    if (sectionKey === 'nursing') {
      if (visibleParentCareMenuItems.length <= 1) {
        const onlyCareSection = visibleParentCareMenuItems[0]?.id || 'nursing';
        setShowCareMenu(false);
        if (usesRoutedSections) {
          navigate(buildParentSectionNavigateTarget(normalizedRouteBase, onlyCareSection));
          return;
        }
        setLocalActiveSection(onlyCareSection);
        return;
      }
      setShowCareMenu((currentValue) => !currentValue);
      return;
    }

    setShowCareMenu(false);

    if (usesRoutedSections) {
      navigate(buildParentSectionNavigateTarget(normalizedRouteBase, sectionKey));
      return;
    }

    setLocalActiveSection(sectionKey);
  };

  const financeHeroCard = activeSection === 'finance' ? (
    <article className="campus-parent-mobile__hero-card is-finance">
      <div className="campus-parent-mobile__hero-card-head">
        <span className="campus-parent-mobile__eyebrow">
          {financeHeroEyebrow}
        </span>
        {primaryPendingCharge ? (
          <button
            className="campus-parent-mobile__finance-pay-button"
            disabled={(!selectedFinanceSummary?.requiresDataSchoolContact && !primaryPendingCharge) || Boolean(payingChargeId)}
            onClick={onPayAcademicCharge}
            type="button"
          >
            {payingChargeId ? 'Procesando...' : financeHeroPayLabel}
          </button>
        ) : null}
      </div>
      <div className="campus-parent-mobile__finance-price-meta">
        {selectedFinanceSummary?.requiresDataSchoolContact ? <span className="campus-parent-mobile__finance-status-label">Gestión especial</span> : null}
        {!hideEnrollmentPaymentAmount && selectedFinanceHasDiscount ? <span className="campus-parent-mobile__finance-original-amount">{formatCurrency(selectedFinanceFullAmount)}</span> : null}
        {!primaryPendingCharge ? <span className="campus-parent-mobile__finance-discount-tag">Estás al día</span> : null}
      </div>
      <h2>
        {selectedFinanceSummary?.requiresDataSchoolContact
          ? 'Contacta DataSchool'
          : (hideEnrollmentPaymentAmount
            ? 'Matrícula pendiente'
            : (primaryPendingCharge ? formatCurrency(selectedFinanceAmount) : formatCurrency(0)))}
      </h2>
      <span className="campus-parent-mobile__finance-current-note">
        {financeHeroNote}
      </span>
      {selectedFinanceConcepts.length && !hideEnrollmentPaymentAmount ? (
        <button className="campus-parent-mobile__finance-concepts-button" onClick={() => setShowFinanceConceptsSheet(true)} type="button">
          Ver detalle
        </button>
      ) : null}
    </article>
  ) : null;

  const selectedChildNursingRecords = useMemo(() => {
    const childId = String(selectedChild?._id || selectedChild?.id || '');
    const childNameKey = normalizeLookupKey(selectedChild?.name);

    return (nursingRecords || []).filter((record) => {
      const recordStudentId = String(record.studentId || record.student?.id || '');
      const recordStudentNameKey = normalizeLookupKey(record.student?.name);
      return (childId && recordStudentId === childId) || (childNameKey && recordStudentNameKey === childNameKey);
    });
  }, [nursingRecords, selectedChild]);

  const latestNursingRecord = selectedChildNursingRecords[0] || null;

  const selectedChildPsychologyCases = useMemo(() => {
    const childId = String(selectedChild?._id || selectedChild?.id || '');
    const childNameKey = normalizeLookupKey(selectedChild?.name);
    const casesById = new Map();

    [...(parentOverview?.psychologyCases || []), ...(psychologyCases || [])].forEach((item) => {
      const itemId = String(item?.id || item?._id || '');
      if (itemId && !casesById.has(itemId)) {
        casesById.set(itemId, item);
      }
    });

    return [...casesById.values()].filter((item) => {
      const caseStudentId = String(item.studentId || item.student?.id || '');
      const caseStudentNameKey = normalizeLookupKey(item.student?.name);
      return (childId && caseStudentId === childId) || (childNameKey && caseStudentNameKey === childNameKey);
    });
  }, [parentOverview?.psychologyCases, psychologyCases, selectedChild]);

  const latestPsychologyCase = selectedChildPsychologyCases[0] || null;

  const selectedChildCoexistenceObservations = useMemo(() => {
    const childId = String(selectedChild?._id || selectedChild?.id || '');
    const childNameKey = normalizeLookupKey(selectedChild?.name);

    return (parentOverview?.coexistenceObservations || []).filter((item) => {
      const observationStudentId = String(item.studentId || item.student?.id || '');
      const observationStudentNameKey = normalizeLookupKey(item.studentName || item.student?.name);
      return (childId && observationStudentId === childId) || (childNameKey && observationStudentNameKey === childNameKey);
    });
  }, [parentOverview?.coexistenceObservations, selectedChild]);

  const latestCoexistenceObservation = selectedChildCoexistenceObservations[0] || null;

  useEffect(() => {
    setExpandedNursingRecordId('');
  }, [selectedChild?.id]);

  const feedAnnouncements = useMemo(() => {
    if (!(academicFeed || []).length) {
      return workspace.announcements;
    }

    const matchedItems = studentPortalMode
      ? academicFeed.filter((item) => {
        if (studentFeedFilter === 'all') {
          return true;
        }
        return (normalizeLookupKey(item.audienceType) || 'general') === studentFeedFilter;
      })
      : academicFeed.filter((item) => {
        if (isAllChildrenFeedSelected) {
          return workspace.children.some((child) => academicFeedItemMatchesChild(item, child));
        }
        return academicFeedItemMatchesChild(item, selectedChild);
      });
    const uniqueItems = Array.from(matchedItems.reduce((accumulator, item) => {
      const itemKey = getAcademicFeedItemKey(item);
      const fallbackKey = `${normalizeLookupKey(item.title)}:${normalizeLookupKey(item.body)}:${item.sentAt || item.createdAt || ''}`;
      const uniqueKey = itemKey || fallbackKey;
      if (uniqueKey && !accumulator.has(uniqueKey)) {
        accumulator.set(uniqueKey, item);
      }
      return accumulator;
    }, new Map()).values());

    return uniqueItems.map((item) => ({
      id: item._id,
      tone: item.audienceType === 'individual' ? 'neutral' : 'good',
      authorName: item.authorName || item.createdByName || 'Secretaría académica',
      authorPhotoUrl: resolveIosCompatibleImageUrl(item.authorThumbUrl || item.authorPhotoUrl || ''),
      publishedAt: item.publishedAtLabel || '',
      category: getCommunityAudienceLabel(item.audienceType),
      audienceType: item.audienceType || 'general',
      imageLabel: item.title || 'Comunicado académico',
      media: Array.isArray(item.media) ? item.media : [],
      captionTitle: item.title || '',
      caption: item.body || '',
      likedByMe: Boolean(item.likedByMe),
      likesCount: Number(item.likesCount || 0),
      likes: Array.isArray(item.likes) ? item.likes : [],
      commentsCount: Number(item.commentsCount || 0),
      comments: Array.isArray(item.comments) ? item.comments : [],
    }));
  }, [academicFeed, isAllChildrenFeedSelected, selectedChild, studentFeedFilter, studentPortalMode, workspace.announcements, workspace.children]);

  const selectedLikesAnnouncement = feedAnnouncements.find((announcement) => announcement.id === feedLikesSheetId) || null;
  const selectedCommentsAnnouncement = feedAnnouncements.find((announcement) => announcement.id === feedCommentsSheetId) || null;

  const replaceAcademicFeedItem = (updatedItem) => {
    if (!updatedItem?._id) {
      return;
    }
    setAcademicFeed((previous) => previous.map((item) => (item._id === updatedItem._id ? updatedItem : item)));
  };

  const onToggleFeedLike = async (announcementId) => {
    if (pendingFeedLikeIdsRef.current.has(announcementId)) {
      return;
    }

    pendingFeedLikeIdsRef.current.add(announcementId);
    setPendingFeedLikeIds((previous) => [...new Set([...previous, announcementId])]);
    setFeedActionMessage('');
    try {
      const response = await toggleParentAcademicFeedLike(announcementId);
      replaceAcademicFeedItem(response.data);
      return;
    } catch (error) {
      setFeedActionMessage(error?.response?.data?.message || 'No se pudo actualizar la reacción.');
    } finally {
      pendingFeedLikeIdsRef.current.delete(announcementId);
      setPendingFeedLikeIds((previous) => previous.filter((id) => id !== announcementId));
    }
  };

  const onSubmitFeedComment = async (event) => {
    event.preventDefault();

    const communicationId = selectedCommentsAnnouncement?.id;
    const body = commentDraft.trim();
    if (!communicationId || !body) {
      return;
    }

    setFeedActionMessage('');
    try {
      const response = await createParentAcademicFeedComment(communicationId, { body });
      replaceAcademicFeedItem(response.data);
      setCommentDraft('');
    } catch (error) {
      setFeedActionMessage(error?.response?.data?.message || 'No se pudo publicar el comentario.');
    }
  };

  const onDeleteFeedComment = async (communicationId, commentId) => {
    if (!communicationId || !commentId) {
      return;
    }

    setFeedActionMessage('');
    try {
      const response = await deleteParentAcademicFeedComment(communicationId, commentId);
      replaceAcademicFeedItem(response.data);
    } catch (error) {
      setFeedActionMessage(error?.response?.data?.message || 'No se pudo borrar el comentario.');
    }
  };

  const onToggleFeedCommentLike = async (communicationId, commentId) => {
    const pendingKey = `${communicationId}:${commentId}`;
    if (!communicationId || !commentId || pendingFeedCommentLikeKeysRef.current.has(pendingKey)) {
      return;
    }

    pendingFeedCommentLikeKeysRef.current.add(pendingKey);
    setPendingFeedCommentLikeKeys((previous) => [...new Set([...previous, pendingKey])]);
    setFeedActionMessage('');
    try {
      const response = await toggleParentAcademicFeedCommentLike(communicationId, commentId);
      replaceAcademicFeedItem(response.data);
    } catch (error) {
      setFeedActionMessage(error?.response?.data?.message || 'No se pudo actualizar la reacción.');
    } finally {
      pendingFeedCommentLikeKeysRef.current.delete(pendingKey);
      setPendingFeedCommentLikeKeys((previous) => previous.filter((key) => key !== pendingKey));
    }
  };

  const resetCommunityDraft = () => {
    setCommunityDraft({
      title: '',
      body: '',
      audienceType: 'general',
      media: [],
    });
  };

  const hasPendingCommunityDraft = Boolean(
    String(communityDraft.title || '').trim()
    || String(communityDraft.body || '').trim()
    || (Array.isArray(communityDraft.media) && communityDraft.media.length > 0)
  );

  const closeCommunityComposer = () => {
    if (communityPublishing || communityMediaUploading) {
      return;
    }
    setShowCommunityComposer(false);
    if (hasPendingCommunityDraft) {
      setFeedActionMessage('');
    }
  };

  const resumeCommunityDraft = () => {
    setFeedActionMessage('');
    setShowCommunityCamera(false);
    setShowCommunityComposer(true);
  };

  const discardCommunityDraft = () => {
    if (communityPublishing || communityMediaUploading) {
      return;
    }
    resetCommunityDraft();
    setShowCommunityComposer(false);
    setShowCommunityCamera(false);
    setFeedActionMessage('Borrador eliminado.');
  };

  const uploadCommunityMediaFiles = async (files, { fromCamera = false } = {}) => {
    const selectedFiles = Array.from(files || []).filter((file) => {
      const mimeType = String(file?.type || '').split(';')[0].trim().toLowerCase();
      const fileName = String(file?.name || '').toLowerCase();
      return (
        mimeType.startsWith('image/')
        || mimeType.startsWith('video/')
        || /\.(jpe?g|png|gif|webp|heic|heif|mp4|m4v|mov|webm)$/i.test(fileName)
      );
    }).map((file) => {
      const mimeType = String(file?.type || '').split(';')[0].trim().toLowerCase();
      if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
        return mimeType === file.type
          ? file
          : new File([file], file.name, { type: mimeType, lastModified: file.lastModified || Date.now() });
      }
      const fileName = String(file?.name || '').toLowerCase();
      const inferredType = /\.(png)$/i.test(fileName)
        ? 'image/png'
        : /\.(webp)$/i.test(fileName)
          ? 'image/webp'
          : /\.(gif)$/i.test(fileName)
            ? 'image/gif'
            : /\.(webm)$/i.test(fileName)
              ? 'video/webm'
              : /\.(mov)$/i.test(fileName)
                ? 'video/quicktime'
                : /\.(mp4|m4v)$/i.test(fileName)
                  ? 'video/mp4'
                  : /\.(jpe?g|heic|heif)$/i.test(fileName)
                    ? 'image/jpeg'
                    : '';
      return inferredType
        ? new File([file], file.name || `media-${Date.now()}.bin`, { type: inferredType, lastModified: file.lastModified || Date.now() })
        : file;
    });
    if (!selectedFiles.length) {
      setFeedActionMessage('Solo se pueden subir fotos o videos.');
      return;
    }

    if ((communityDraft.media || []).length + selectedFiles.length > 8) {
      setFeedActionMessage('Puedes adjuntar hasta 8 fotos o videos por publicación.');
      return;
    }

    setCommunityMediaUploading(true);
    setFeedActionMessage('');
    try {
      const uploadedMedia = [];
      for (let startIndex = 0; startIndex < selectedFiles.length; startIndex += 6) {
        const response = await uploadCommunityPublicationMedia(selectedFiles.slice(startIndex, startIndex + 6));
        uploadedMedia.push(...(response.media || []));
      }
      setCommunityDraft((currentDraft) => ({
        ...currentDraft,
        media: [...(currentDraft.media || []), ...uploadedMedia].slice(0, 8),
      }));
      setShowCommunityComposer(true);
      if (fromCamera) {
        setShowCommunityCamera(false);
      }
      setFeedActionMessage('');
    } catch (error) {
      setFeedActionMessage(error?.response?.data?.message || error?.message || 'No se pudo subir el archivo.');
    } finally {
      setCommunityMediaUploading(false);
    }
  };

  const onCommunityMediaSelected = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    await uploadCommunityMediaFiles(selectedFiles);
  };

  const onRemoveCommunityMedia = (mediaIndex) => {
    setCommunityDraft((currentDraft) => ({
      ...currentDraft,
      media: (currentDraft.media || []).filter((_, index) => index !== mediaIndex),
    }));
  };

  const onSubmitCommunityPublication = async (event) => {
    event.preventDefault();
    const title = String(communityDraft.title || '').trim();
    const body = String(communityDraft.body || '').trim();
    if (!title || !body) {
      setFeedActionMessage('Escribe un título y una descripción para publicar.');
      return;
    }

    setCommunityPublishing(true);
    setFeedActionMessage('');
    try {
      const payload = {
        title,
        body,
        media: communityDraft.media || [],
        audienceType: studentPortalMode
          ? (communityDraft.audienceType || 'general')
          : 'general',
        studentId: selectedChild?.id || selectedChild?._id || undefined,
      };
      const created = await createCommunityPublication(payload);
      if (created?.status === 'pending' || created?.kind === 'request') {
        resetCommunityDraft();
        setShowCommunityComposer(false);
        setFeedActionMessage(
          created?.message
          || 'Tu publicación quedó en revisión. Rectoría, coordinación, dirección o secretaría académica la autorizarán.'
        );
        return;
      }
      if (created?._id) {
        setAcademicFeed((previous) => [created, ...(previous || [])]);
      } else {
        setFeedRefreshCount((count) => count + 1);
      }
      resetCommunityDraft();
      setShowCommunityComposer(false);
      setFeedActionMessage('Tu publicación ya está visible en el feed.');
    } catch (error) {
      setFeedActionMessage(error?.response?.data?.message || error?.message || 'No se pudo publicar.');
    } finally {
      setCommunityPublishing(false);
    }
  };

  useEffect(() => {
    const isTouchDevice = window.matchMedia?.('(max-width: 960px)')?.matches
      && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    if (
      !isTouchDevice
      || activeSection !== 'home'
      || showCommunityCamera
      || showCommunityComposer
      || pullRefreshActive
      || pullRefreshing
    ) {
      return undefined;
    }

    const isInteractiveTarget = (target) => Boolean(target?.closest?.(
      [
        'input',
        'textarea',
        'select',
        'button',
        'a',
        'video',
        '[contenteditable="true"]',
        '[role="dialog"]',
        '.campus-parent-mobile__post-gallery',
        '.campus-parent-mobile__post-media',
        '.campus-parent-community-composer-layer',
        '.teacher-camera',
        '.campus-parent-mobile__bottom-nav',
      ].join(', ')
    ));

    const onTouchStart = (event) => {
      if (
        showUserMenu
        || showAcademicMenu
        || showCareMenu
        || showFinanceChildOptions
        || feedLikesSheetId
        || feedCommentsSheetId
        || communityMediaUploading
        || communityPublishing
        || event.touches?.length !== 1
        || isInteractiveTarget(event.target)
      ) {
        communitySwipeStartRef.current = null;
        return;
      }

      const touch = event.touches[0];
      communitySwipeStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    };

    const onTouchEnd = (event) => {
      const start = communitySwipeStartRef.current;
      communitySwipeStartRef.current = null;
      const touch = event.changedTouches?.[0];
      if (!start || !touch) {
        return;
      }

      const deltaX = touch.clientX - start.x;
      const deltaY = touch.clientY - start.y;
      const elapsed = Math.max(Date.now() - start.time, 1);
      const velocityX = deltaX / elapsed;
      // Instagram-like: abre con poco recorrido o con un flick rápido.
      const isSwipeRight = deltaX > 0
        && Math.abs(deltaX) >= Math.abs(deltaY) * 1.05
        && elapsed <= 700
        && (deltaX >= 28 || (deltaX >= 16 && velocityX >= 0.4));

      if (isSwipeRight) {
        setShowUserMenu(false);
        setShowAcademicMenu(false);
        setShowCareMenu(false);
        setShowCommunityCamera(true);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [
    activeSection,
    communityMediaUploading,
    communityPublishing,
    feedCommentsSheetId,
    feedLikesSheetId,
    pullRefreshActive,
    pullRefreshing,
    showAcademicMenu,
    showCareMenu,
    showCommunityCamera,
    showCommunityComposer,
    showFinanceChildOptions,
    showUserMenu,
  ]);

  useEffect(() => {
    if (!usesRoutedSections) {
      return;
    }

    const remappedPath = remapLegacyParentPath(location.pathname, normalizedRouteBase);
    if (!remappedPath || remappedPath === location.pathname) {
      return;
    }

    navigate(`${remappedPath}${location.search || ''}${location.hash || ''}`, { replace: true });
  }, [usesRoutedSections, location.pathname, location.search, location.hash, navigate, normalizedRouteBase]);

  useEffect(() => {
    if (isParentSectionEnabled(activeSection, portalAppFeatures)) {
      return;
    }

    const fallbackSection = getFirstEnabledParentSection(portalAppFeatures);
    setShowCareMenu(false);

    if (usesRoutedSections) {
      navigate(buildParentSectionNavigateTarget(normalizedRouteBase, fallbackSection), { replace: true });
      return;
    }

    setLocalActiveSection(fallbackSection);
  }, [activeSection, navigate, normalizedRouteBase, portalAppFeatures, usesRoutedSections]);

  useEffect(() => {
    if (!showUserMenu || typeof document === 'undefined') {
      return undefined;
    }

    const onPointerDown = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    const onEscape = (event) => {
      if (event.key === 'Escape') {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [showUserMenu]);

  useEffect(() => {
    if (activeSection === 'cafeteria') {
      setShowFinanceChildOptions(false);
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== 'academic') {
      setShowAcademicMenu(false);
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== 'cafeteria') {
      setShowCafeteriaMenu(false);
      setActiveCafeteriaView('cafeteria-overview');
    }
  }, [activeSection]);

  useEffect(() => {
    if (!showAcademicMenu || typeof document === 'undefined') {
      return undefined;
    }

    const onEscape = (event) => {
      if (event.key === 'Escape') {
        setShowAcademicMenu(false);
      }
    };

    document.addEventListener('keydown', onEscape);

    return () => {
      document.removeEventListener('keydown', onEscape);
    };
  }, [showAcademicMenu]);

  const bottomNavScrollEnabled = Boolean(selectedChild) && !parentOverviewLoading;
  const { bottomNavClassName, expandBottomNav } = useFloatingBottomNavSize(bottomNavScrollEnabled);

  useEffect(() => {
    expandBottomNav();
  }, [activeSection, activeAcademicView, expandBottomNav]);

  if (isMillenniumParent && (matriculaAccessGate === 'checking' || matriculaAccessGate === 'idle')) {
    return (
      <ColibriBootSplash
        ariaLabel="Validando matrícula"
        eyebrow="Matrícula"
        indeterminate
        message="Estamos verificando el estado de matrícula antes de habilitar el portal."
        title="Validando matrícula"
      />
    );
  }

  if (!selectedChild) {
    if (parentOverviewLoading) {
      return (
        <ColibriBootSplash
          ariaLabel={studentPortalMode ? 'Cargando portal del alumno' : 'Cargando portal de acudientes'}
          eyebrow={studentPortalMode ? 'Portal del alumno' : 'Portal de acudientes'}
          indeterminate
          message={studentPortalMode
            ? 'Estamos preparando tu feed, calificaciones y servicios del colegio.'
            : 'Estamos consultando la información real del acudiente y preparando tu experiencia.'}
          title={studentPortalMode ? 'Cargando portal del alumno' : 'Cargando alumnos vinculados'}
        />
      );
    }

    if (studentPortalMode && studentPortalLoadError) {
      return (
        <section className="campus-page campus-parent-mobile-app parent-portal-state parent-portal-state--empty">
          <header className="campus-parent-mobile__app-header">
            <div className="campus-parent-mobile__app-brand">
              <ComergioBrandTitle />
            </div>
            <div className="campus-parent-mobile__app-title-wrap">
              <span className="campus-parent-mobile__app-school-name">Portal del alumno</span>
            </div>
            <button className="campus-parent-mobile__app-logout-button" onClick={onLogout} type="button">
              Salir
            </button>
          </header>
          <div className="parent-portal-state__body">
            <article className="parent-portal-state__card">
              <div className="parent-portal-state__copy">
                <span className="parent-portal-state__eyebrow">No se pudo cargar</span>
                <h2>Error al abrir tu portal</h2>
                <p>{studentPortalLoadError}</p>
              </div>
              <button
                className="campus-parent-mobile__app-logout-button"
                onClick={() => {
                  setParentOverviewLoading(true);
                  setStudentPortalRetryCount((count) => count + 1);
                }}
                type="button"
              >
                Reintentar
              </button>
            </article>
          </div>
        </section>
      );
    }

    return <ParentPortalEmptyStudentsState onLogout={onLogout} studentPortalMode={studentPortalMode} />;
  }

  const isHomeFeedLoading = parentOverviewLoading || academicLoading;
  const isCareSection = ['nursing', 'wellbeing', 'coexistence'].includes(activeSection);
  const isStackedPortalSection = isCareSection || activeSection === 'transport';

  const parentTransportSectionContent = activeSection === 'transport' ? (
    <ParentTransportSection hasAssignedRoute={hasAssignedTransportRoute} transport={selectedChildTransport} />
  ) : null;

  const parentCareSectionContent = isCareSection ? (
    <>
      {activeSection === 'nursing' ? (
        <section className="campus-parent-mobile__nursing-page">
          <header className="campus-parent-mobile__nursing-overview">
            <div className="campus-parent-mobile__nursing-overview-copy">
              <span className="campus-parent-mobile__nursing-kicker">Enfermería escolar</span>
              <h2>{latestNursingRecord ? 'Seguimiento de salud' : 'Sin atenciones registradas'}</h2>
              <p>
                {latestNursingRecord
                  ? `Última atención registrada para ${selectedChild.name}.`
                  : `${selectedChild.name} no tiene atenciones visibles para acudientes.`}
              </p>
            </div>
            <span className="campus-parent-mobile__nursing-overview-icon"><ParentAppIcon icon="nursing" /></span>
          </header>

          <section className="campus-parent-mobile__nursing-status-grid" aria-label="Resumen de enfermería">
            <article>
              <span>Registros</span>
              <strong>{selectedChildNursingRecords.length}</strong>
            </article>
            <article>
              <span>Última atención</span>
              <strong>{latestNursingRecord ? formatParentNursingDate(latestNursingRecord.attendedAt) : 'Sin fecha'}</strong>
            </article>
            <article>
              <span>Estado</span>
              <strong>{latestNursingRecord ? getParentNursingDispositionLabel(latestNursingRecord.disposition) : 'Sin novedades'}</strong>
            </article>
          </section>

          {nursingLoading ? <p className="campus-parent-mobile__nursing-loading">Actualizando historial de enfermería...</p> : null}

          {!studentPortalMode && selectedChild?.id ? (
            <ParentStudentMedicalProfilePanel
              key={selectedChild.id}
              studentId={selectedChild.id}
              studentName={selectedChild.name}
            />
          ) : null}

          <section className="campus-parent-mobile__nursing-record-list">
            {selectedChildNursingRecords.length > 0 ? selectedChildNursingRecords.map((record) => {
              const recordId = String(record.id || record._id || record.attendedAt || 'nursing-record');
              const isExpanded = expandedNursingRecordId === recordId;

              return (
                <article className={`campus-parent-mobile__nursing-record-card${isExpanded ? ' is-open' : ''}`} key={recordId}>
                  <button
                    aria-expanded={isExpanded}
                    className="campus-parent-mobile__nursing-record-toggle"
                    onClick={() => setExpandedNursingRecordId(isExpanded ? '' : recordId)}
                    type="button"
                  >
                    <div className="campus-parent-mobile__nursing-record-toggle-copy">
                      <span>Atención registrada</span>
                      <strong>{record.symptoms || 'Registro de enfermería'}</strong>
                    </div>
                    <div className="campus-parent-mobile__nursing-record-toggle-meta">
                      <strong>{formatParentNursingDate(record.attendedAt)}</strong>
                      <span>{getParentNursingDispositionLabel(record.disposition)}</span>
                    </div>
                    <span className="campus-parent-mobile__nursing-record-chevron" aria-hidden="true">⌄</span>
                  </button>
                  {isExpanded ? (
                    <>
                      <div className="campus-parent-mobile__nursing-record-body">
                        <article>
                          <span>Síntomas</span>
                          <p>{record.symptoms}</p>
                        </article>
                        <article>
                          <span>Manejo</span>
                          <p>{record.treatment}</p>
                        </article>
                        <article>
                          <span>Resultado</span>
                          <p>{getParentNursingDispositionLabel(record.disposition)}</p>
                        </article>
                        {record.notes ? (
                          <article className="is-wide">
                            <span>Observaciones</span>
                            <p>{record.notes}</p>
                          </article>
                        ) : null}
                      </div>
                      <footer className="campus-parent-mobile__nursing-record-footer">
                        <span>{record.attendedBy?.name ? `Registró ${record.attendedBy.name}` : 'Registro de enfermería'}</span>
                      </footer>
                    </>
                  ) : null}
                </article>
              );
            }) : (
              <article className="campus-parent-mobile__care-empty-card">
                <span className="campus-parent-mobile__care-empty-mark"><ParentAppIcon icon="nursing" /></span>
                <strong>Sin atenciones registradas</strong>
                <p>{selectedChild.name} aún no tiene registros de enfermería visibles para acudientes.</p>
              </article>
            )}
          </section>
        </section>
      ) : null}

      {activeSection === 'wellbeing' ? (
        <section className="campus-parent-mobile__nursing-page campus-parent-mobile__wellbeing-page">
          <header className="campus-parent-mobile__nursing-overview campus-parent-mobile__wellbeing-overview">
            <div className="campus-parent-mobile__nursing-overview-copy">
              <span className="campus-parent-mobile__nursing-kicker">Psicología - bienestar</span>
              <h2>{latestPsychologyCase ? 'Seguimientos activos' : 'Sin seguimientos activos'}</h2>
              <p>
                {latestPsychologyCase
                  ? `Bienestar tiene ${selectedChildPsychologyCases.length} seguimiento${selectedChildPsychologyCases.length === 1 ? '' : 's'} activo${selectedChildPsychologyCases.length === 1 ? '' : 's'} para ${selectedChild.name}.`
                  : `Cuando orientación o bienestar registre acompañamientos para ${selectedChild.name}, los verás aquí.`}
              </p>
            </div>
            <span className="campus-parent-mobile__nursing-overview-icon"><ParentCareOptionIcon icon="wellbeing" /></span>
          </header>

          {psychologyLoading ? <p className="campus-parent-mobile__nursing-loading">Actualizando seguimientos de bienestar...</p> : null}

          {selectedChildPsychologyCases.length > 0 ? (
            <section className="campus-parent-mobile__nursing-record-list">
              {selectedChildPsychologyCases.map((item) => {
                const latestFamilyNote = Array.isArray(item.notes) && item.notes.length ? item.notes[0] : null;
                return (
                  <article className="campus-parent-mobile__nursing-record-card campus-parent-mobile__wellbeing-record-card" key={item.id}>
                    <div className="campus-parent-mobile__nursing-record-toggle">
                      <div className="campus-parent-mobile__nursing-record-toggle-copy">
                        <span>{getParentPsychologyStatusLabel(item.status)}</span>
                        <strong>{item.title || 'Seguimiento de bienestar'}</strong>
                      </div>
                      <div className="campus-parent-mobile__nursing-record-toggle-meta">
                        <strong>{formatParentNursingDate(item.updatedAt || item.createdAt)}</strong>
                        <span>Prioridad {getParentPsychologyPriorityLabel(item.priority)}</span>
                      </div>
                    </div>
                    {latestFamilyNote ? (
                      <div className="campus-parent-mobile__nursing-record-body">
                        <article>
                          <span>Nota para acudientes</span>
                          <p>{latestFamilyNote.content}</p>
                        </article>
                        {latestFamilyNote.recommendations ? (
                          <article className="is-wide">
                            <span>Recomendaciones</span>
                            <p>{latestFamilyNote.recommendations}</p>
                          </article>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ) : !psychologyLoading ? (
            <section className="campus-parent-mobile__care-empty-card is-wellbeing">
              <span className="campus-parent-mobile__care-empty-mark"><ParentCareOptionIcon icon="wellbeing" /></span>
              <strong>Bienestar sin seguimientos activos</strong>
              <p>Cuando orientación o bienestar registre acompañamientos para {selectedChild.name}, los verás aquí.</p>
            </section>
          ) : null}
        </section>
      ) : null}

      {activeSection === 'coexistence' ? (
        <section className="campus-parent-mobile__nursing-page campus-parent-mobile__coexistence-page">
          <header className="campus-parent-mobile__nursing-overview campus-parent-mobile__coexistence-overview">
            <div className="campus-parent-mobile__nursing-overview-copy">
              <span className="campus-parent-mobile__nursing-kicker">Convivencia escolar</span>
              <h2>{latestCoexistenceObservation ? 'Observaciones registradas' : 'Convivencia sin novedades'}</h2>
              <p>
                {latestCoexistenceObservation
                  ? `${selectedChild.name} tiene ${selectedChildCoexistenceObservations.length} observación${selectedChildCoexistenceObservations.length === 1 ? '' : 'es'} de convivencia registrada${selectedChildCoexistenceObservations.length === 1 ? '' : 's'}.`
                  : `Los reportes, acuerdos o reconocimientos de convivencia para ${selectedChild.name} aparecerán aquí.`}
              </p>
            </div>
            <span className="campus-parent-mobile__nursing-overview-icon"><ParentCareOptionIcon icon="coexistence" /></span>
          </header>

          {parentOverviewLoading ? <p className="campus-parent-mobile__nursing-loading">Actualizando convivencia escolar...</p> : null}

          {selectedChildCoexistenceObservations.length > 0 ? (
            <section className="campus-parent-mobile__nursing-record-list">
              {selectedChildCoexistenceObservations.map((item) => (
                <article className="campus-parent-mobile__nursing-record-card campus-parent-mobile__wellbeing-record-card" key={item.id}>
                  <div className="campus-parent-mobile__nursing-record-toggle">
                    <div className="campus-parent-mobile__nursing-record-toggle-copy">
                      <span>{item.subject || item.courseTitle || 'Convivencia escolar'}</span>
                      <strong>{item.observation || 'Observación registrada'}</strong>
                    </div>
                    <div className="campus-parent-mobile__nursing-record-toggle-meta">
                      <strong>{formatParentNursingDate(item.submittedAt || item.createdAt)}</strong>
                      <span>{item.teacherName ? `Docente ${item.teacherName}` : item.courseTitle || 'Registro docente'}</span>
                    </div>
                  </div>
                  {item.courseTitle ? (
                    <div className="campus-parent-mobile__nursing-record-body">
                      <article>
                        <span>Curso</span>
                        <p>{item.courseTitle}</p>
                      </article>
                    </div>
                  ) : null}
                </article>
              ))}
            </section>
          ) : !parentOverviewLoading ? (
            <section className="campus-parent-mobile__care-empty-card is-coexistence">
              <span className="campus-parent-mobile__care-empty-mark"><ParentCareOptionIcon icon="coexistence" /></span>
              <strong>Convivencia sin novedades</strong>
              <p>Los reportes, acuerdos o reconocimientos de convivencia aparecerán en este espacio.</p>
            </section>
          ) : null}
        </section>
      ) : null}
    </>
  ) : null;

  const parentSectionChrome = !shouldUsePortalHeader ? (
    <div className={`parent-mobile-page parent-mobile-page-embedded campus-parent-mobile__portal-shell${showFinanceChildOptions ? ' is-student-selector-open' : ''}${activeSection === 'finance' ? ' is-finance-section' : ''}${isStackedPortalSection ? ' is-stacked-portal-section' : ''}${isCareSection ? ' is-care-section' : ''}`}>
          <ParentMobilePortalHeader
            canOpenMenu={activeSection === 'academic'}
            guardianName={studentPortalMode ? (selectedChild?.name || user?.name) : workspace.guardian.name}
            isMenuOpen={activeSection === 'academic' ? showAcademicMenu : false}
            onLogout={onLogout}
            onNotificationNavigate={handleNotificationNavigate}
            onToggleMenu={() => {
              if (activeSection === 'academic') {
                setShowAcademicMenu((currentValue) => !currentValue);
              }
            }}
            onToggleUserMenu={() => setShowUserMenu((currentValue) => !currentValue)}
            preferStudentNotifications={studentPortalMode}
            showUserMenu={showUserMenu}
            userMenuRef={userMenuRef}
          />
          {activeSection !== 'games' ? (
            studentPortalMode && activeSection === 'home' ? (
              <StudentFeedSelector
                isOpen={showFinanceChildOptions}
                onSelect={(filterId) => {
                  setStudentFeedFilter(filterId);
                  setShowFinanceChildOptions(false);
                }}
                onToggle={() => setShowFinanceChildOptions((currentValue) => !currentValue)}
                selectedFilterId={studentFeedFilter}
              />
            ) : (
              <ParentFinanceStudentSelector
                children={workspace.children}
                includeAllOption={!studentPortalMode && activeSection === 'home' && workspace.children.length > 1}
                isOpen={showFinanceChildOptions}
                onSelectChild={(childId) => {
                  setSelectedChildId(childId);
                  setShowFinanceChildOptions(false);
                }}
                onToggle={() => setShowFinanceChildOptions((currentValue) => !currentValue)}
                readOnly={studentPortalMode}
                selectedChild={selectedChildForSwitcher}
              />
            )
          ) : null}
          {parentCareSectionContent}
          {parentTransportSectionContent}
          {financeHeroCard}
    </div>
  ) : null;

  return (
    <section
      className={`campus-page campus-parent-mobile-app${studentPortalMode ? ' is-student-portal' : ''}${shouldUsePortalHeader ? '' : ' has-parent-portal-header'}${activeSection === 'home' ? ' is-home-section' : ''}${activeSection === 'finance' ? ' is-finance-section' : ''}${activeSection === 'academic' ? ' is-academic-section' : ''}${activeSection === 'cafeteria' ? ' is-cafeteria-section' : ''}${activeSection === 'games' ? ' is-games-section' : ''}${isStackedPortalSection ? ' is-stacked-portal-section' : ''}${isCareSection ? ' is-care-section' : ''}${pullRefreshActive ? ' parent-mobile-page-pull-ready' : ''}${pullRefreshing ? ' parent-mobile-page-refreshing' : ''}${shouldLockParentPortal ? ' is-matricula-locked' : ''}`}
      {...pullRefreshTouchHandlers}
    >
      <ParentPullToRefreshIndicator
        distance={pullRefreshDistance}
        isReady={pullRefreshActive}
        isRefreshing={pullRefreshing}
        threshold={pullRefreshThreshold}
      />
      <TeacherCameraCapture
        isOpen={showCommunityCamera}
        onClose={() => setShowCommunityCamera(false)}
        onFilesReady={(files) => uploadCommunityMediaFiles(files, { fromCamera: true })}
      />
      {showCommunityComposer ? (
        <div
          className="campus-parent-community-composer-layer"
          onClick={closeCommunityComposer}
          role="presentation"
        >
          <form
            aria-label={studentPortalMode ? 'Publicar en el colegio' : 'Publicar para el colegio'}
            className="campus-parent-community-composer"
            onClick={(event) => event.stopPropagation()}
            onSubmit={onSubmitCommunityPublication}
          >
            <header className="campus-parent-community-composer__head">
              <div>
                <span>{studentPortalMode ? 'Nueva publicación' : 'Publicar en el colegio'}</span>
                <strong>
                  {studentPortalMode
                    ? (communityDraft.audienceType === 'general'
                      ? 'Colegio · requiere autorización'
                      : 'Se publica al instante')
                    : 'Requiere autorización institucional'}
                </strong>
              </div>
              <button
                disabled={communityPublishing || communityMediaUploading}
                onClick={closeCommunityComposer}
                type="button"
              >
                Cerrar
              </button>
            </header>

            {studentPortalMode ? (
              <fieldset className="campus-parent-community-composer__audience">
                <legend>¿Quién puede verlo?</legend>
                <label className={communityDraft.audienceType === 'general' ? 'is-active' : ''}>
                  <input
                    checked={communityDraft.audienceType === 'general'}
                    name="community-audience"
                    onChange={() => setCommunityDraft((current) => ({ ...current, audienceType: 'general' }))}
                    type="radio"
                    value="general"
                  />
                  <span>
                    <strong>Colegio</strong>
                    <small>Todo el colegio · pasa por autorización</small>
                  </span>
                </label>
                <label className={communityDraft.audienceType === 'course' ? 'is-active' : ''}>
                  <input
                    checked={communityDraft.audienceType === 'course'}
                    name="community-audience"
                    onChange={() => setCommunityDraft((current) => ({ ...current, audienceType: 'course' }))}
                    type="radio"
                    value="course"
                  />
                  <span>
                    <strong>Mi curso</strong>
                    <small>Alumnos y acudientes · se publica al instante</small>
                  </span>
                </label>
                <label className={communityDraft.audienceType === 'course_students' ? 'is-active' : ''}>
                  <input
                    checked={communityDraft.audienceType === 'course_students'}
                    name="community-audience"
                    onChange={() => setCommunityDraft((current) => ({ ...current, audienceType: 'course_students' }))}
                    type="radio"
                    value="course_students"
                  />
                  <span>
                    <strong>Curso privado</strong>
                    <small>Solo estudiantes · se publica al instante</small>
                  </span>
                </label>
              </fieldset>
            ) : null}

            <label className="campus-parent-community-composer__field">
              Título
              <input
                maxLength={120}
                onChange={(event) => setCommunityDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="¿Qué quieres compartir?"
                value={communityDraft.title}
              />
            </label>
            <label className="campus-parent-community-composer__field">
              Descripción
              <textarea
                maxLength={2000}
                onChange={(event) => setCommunityDraft((current) => ({ ...current, body: event.target.value }))}
                placeholder="Cuenta el momento con tus palabras."
                rows={4}
                value={communityDraft.body}
              />
            </label>

            <div className="campus-parent-community-composer__media">
              <label className="campus-parent-community-composer__upload">
                Agregar fotos o videos
                <input
                  accept="image/*,video/*"
                  disabled={communityMediaUploading || (communityDraft.media || []).length >= 8}
                  multiple
                  onChange={onCommunityMediaSelected}
                  type="file"
                />
              </label>
              {(communityDraft.media || []).length ? (
                <div className="campus-parent-community-composer__media-grid">
                  {(communityDraft.media || []).map((item, index) => (
                    <article key={`${item.kind}-${item.src}-${index}`}>
                      {item.kind === 'video'
                        ? <video controls playsInline src={item.src} />
                        : <img alt={item.alt || `Adjunto ${index + 1}`} src={item.thumbUrl || item.src} />}
                      <button onClick={() => onRemoveCommunityMedia(index)} type="button">Quitar</button>
                    </article>
                  ))}
                </div>
              ) : (
                <p>También puedes deslizar a la derecha para abrir la cámara.</p>
              )}
            </div>

            <div className="campus-parent-community-composer__actions">
              <button
                disabled={communityPublishing || communityMediaUploading}
                onClick={() => {
                  setShowCommunityComposer(false);
                  setShowCommunityCamera(true);
                }}
                type="button"
              >
                Cámara
              </button>
              <button
                disabled={communityPublishing || communityMediaUploading || !hasPendingCommunityDraft}
                onClick={discardCommunityDraft}
                type="button"
              >
                Descartar
              </button>
              <button disabled={communityPublishing || communityMediaUploading} type="submit">
                {communityPublishing
                  ? 'Enviando…'
                  : (!studentPortalMode || communityDraft.audienceType === 'general'
                    ? 'Enviar a revisión'
                    : 'Publicar')}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {activeSection !== 'games' ? parentSectionChrome : null}

      {activeSection === 'academic' && showAcademicMenu ? (
        <div className="campus-parent-mobile__academic-drawer-layer" onClick={() => setShowAcademicMenu(false)} role="presentation">
          <aside
            aria-label="Menu academico"
            className="campus-parent-mobile__academic-drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="campus-parent-mobile__academic-drawer-head">
              <strong>Académico</strong>
              <span>{selectedChild.name} · {getParentStudentGradeLabel(selectedChild)}</span>
            </div>
            <nav className="campus-parent-mobile__academic-drawer-nav">
              {visibleAcademicMenuItems.map((item) => (
                <button
                  className={`campus-parent-mobile__academic-drawer-item${item.id === activeAcademicView ? ' is-active' : ''}`}
                  key={item.id}
                  onClick={() => {
                    setFocusedAssignmentId('');
                    setActiveAcademicView(item.id);
                    setShowAcademicMenu(false);
                  }}
                  type="button"
                >
                  <span className="campus-parent-mobile__academic-drawer-icon">
                    <AcademicMenuIcon icon={item.icon} />
                  </span>
                  <span className="campus-parent-mobile__academic-drawer-copy">
                    <strong>{item.title}</strong>
                  </span>
                </button>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

      {!isStackedPortalSection ? (
      <div
        className={`campus-parent-mobile__content${activeSection === 'finance' ? ' is-finance' : ''}${activeSection === 'academic' ? ' is-academic' : ''}${activeSection === 'home' ? ' is-home' : ''}${activeSection === 'games' ? ' is-games' : ''}`}
        style={{ transform: activeSection === 'games' || !canUseCampusPullRefresh ? undefined : `translateY(${pullRefreshContentOffset}px)` }}
      >
        {activeSection === 'home' ? (
          <>
            {studentPortalMode && studentGamesAvailable ? (
              <button
                className="campus-parent-mobile__game-promo"
                onClick={() => onSelectSection('games')}
                type="button"
              >
                <img alt="" className="campus-parent-mobile__game-promo-image" src={colibriGameCover} />
                <span className="campus-parent-mobile__game-promo-copy">
                  <strong>Fly</strong>
                  <small>Vuela sin límites y alcanza la cima.</small>
                </span>
                <span className="campus-parent-mobile__game-promo-cta">Jugar</span>
              </button>
            ) : null}
            <section className="campus-parent-mobile__feed">
              {isHomeFeedLoading ? (
                <ParentFeedLoadingSkeleton count={2} />
              ) : feedAnnouncements.length ? feedAnnouncements.map((announcement) => {
                const isLikePending = pendingFeedLikeIds.includes(announcement.id);
                return (
                  <article className={`campus-parent-mobile__post is-${announcement.tone}`} key={announcement.id}>
                    <div className="campus-parent-mobile__post-head">
                      <div className="campus-parent-mobile__post-avatar">
                        {announcement.authorPhotoUrl ? <img alt={announcement.authorName} src={announcement.authorPhotoUrl} /> : announcement.authorName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="campus-parent-mobile__post-author-block">
                        <strong>{announcement.authorName}</strong>
                        <span>
                          {announcement.publishedAt}
                          {announcement.category ? ` · ${announcement.category}` : ''}
                        </span>
                      </div>
                    </div>
                    <ParentAnnouncementMedia announcement={announcement} onLike={() => onToggleFeedLike(announcement.id)} />
                    <div className="campus-parent-mobile__post-actions">
                      <button
                        aria-label={announcement.likedByMe ? 'Quitar like' : 'Dar like'}
                        className={`campus-parent-mobile__post-action-heart${announcement.likedByMe ? ' is-liked' : ''}`}
                        disabled={isLikePending}
                        onClick={() => onToggleFeedLike(announcement.id)}
                        type="button"
                      >
                        <FeedHeartIcon filled={announcement.likedByMe} />
                      </button>
                      <button className="campus-parent-mobile__post-action-count" onClick={() => setFeedLikesSheetId(announcement.id)} type="button">
                        {announcement.likesCount}
                      </button>
                      <button className="campus-parent-mobile__post-action-comment" onClick={() => setFeedCommentsSheetId(announcement.id)} type="button">
                        <FeedCommentIcon />
                        <span>{announcement.commentsCount}</span>
                      </button>
                    </div>
                    {announcement.captionTitle ? <h3 className="campus-parent-mobile__post-caption-title">{announcement.captionTitle}</h3> : null}
                    <ParentAnnouncementText text={announcement.caption} />
                  </article>
                );
              }              ) : (
                <ParentFeedEmptyState
                  description={studentPortalMode && studentFeedFilter !== 'all'
                    ? `Aún no hay publicaciones en «${(studentFeedFilterOptions.find((option) => option.id === studentFeedFilter) || {}).label || 'este feed'}». Cambia de feed arriba o vuelve más tarde.`
                    : ''}
                  studentName={selectedChild.name}
                  title={studentPortalMode && studentFeedFilter !== 'all' ? 'Sin publicaciones en este feed' : ''}
                />
              )}
            </section>
          </>
        ) : null}

        {activeSection === 'finance' ? (
          <>
            {academicPaymentMessage ? <p className="campus-parent-mobile__empty-note">{academicPaymentMessage}</p> : null}
            {academicLoading ? <p className="campus-parent-mobile__empty-note">Actualizando cartera académica...</p> : null}
            <ParentFinancePaymentHistory
              onPageChange={setFinancePaymentsPage}
              page={financePaymentsCurrentPage}
              pageSize={FINANCE_PAYMENTS_PAGE_SIZE}
              payments={paginatedFinancePayments}
              totalPages={financePaymentsTotalPages}
            />
            <ParentFinancePricingGuide
              hideEnrollmentAmounts={shouldHideParentEnrollmentPaymentAmount({
                schoolId: user?.schoolId,
                schoolName: schoolDisplayName,
              })}
              isLoading={academicLoading}
              pricingGuide={selectedPricingGuide}
            />
          </>
        ) : null}

        {activeSection === 'academic' ? (
          <>
            <ParentAcademicContent
              academicSchedule={resolvedAcademicSchedule}
              activeView={activeAcademicView}
              focusedAssignmentId={focusedAssignmentId}
              isPerformanceLoading={parentOverviewLoading}
              onClearFocusedAssignment={() => setFocusedAssignmentId('')}
              onOpenAssignment={(assignmentId) => {
                setFocusedAssignmentId(String(assignmentId || ''));
                setActiveAcademicView('academic-assignments');
                setShowAcademicMenu(false);
              }}
              onSelectAcademicView={(viewId) => {
                setFocusedAssignmentId('');
                setActiveAcademicView(viewId);
                setShowAcademicMenu(false);
              }}
              refreshKey={academicRefreshCount}
              selectedChild={selectedChild}
              studentPortalMode={studentPortalMode}
            />
          </>
        ) : null}

        {activeSection === 'cafeteria' ? (
          embedPortal && cafeteriaBasePath ? (
            <ParentPortal
              basePath={cafeteriaBasePath}
              embedded
              initialStudentId={selectedChild?.id || selectedChildId || ''}
              studentPortalMode={studentPortalMode}
            />
          ) : (
            <ParentCafeteriaContent
              activeView={activeCafeteriaView}
              children={workspace.children}
              guardianName={workspace.guardian.name}
              onLogout={onLogout}
              onNotificationNavigate={handleNotificationNavigate}
              onSelectChild={(childId) => {
                setSelectedChildId(childId);
                setShowFinanceChildOptions(false);
              }}
              onSelectView={(viewId) => {
                setActiveCafeteriaView(viewId);
                setShowCafeteriaMenu(false);
              }}
              onToggleChildOptions={() => setShowFinanceChildOptions((currentValue) => !currentValue)}
              onToggleMenu={() => setShowCafeteriaMenu((currentValue) => !currentValue)}
              onToggleUserMenu={() => setShowUserMenu((currentValue) => !currentValue)}
              preferStudentNotifications={studentPortalMode}
              selectedChild={selectedChild}
              showChildOptions={showFinanceChildOptions}
              showMenu={showCafeteriaMenu}
              showUserMenu={showUserMenu}
              userMenuRef={userMenuRef}
            />
          )
        ) : null}

        {activeSection === 'games' && studentGamesAvailable ? (
          <ColibriFlappyGame playerName={selectedChild?.name || user?.name || ''} />
        ) : null}
      </div>
      ) : null}

      {hasPendingCommunityDraft && !showCommunityComposer && !showCommunityCamera ? (
        <div className="campus-parent-mobile__draft-toast" role="status">
          <button className="campus-parent-mobile__draft-toast-main" onClick={resumeCommunityDraft} type="button">
            <strong>Borrador listo</strong>
            <span>
              {(communityDraft.media || []).length
                ? `${communityDraft.media.length} archivo${communityDraft.media.length === 1 ? '' : 's'} · toca para seguir`
                : 'Toca para seguir editando'}
            </span>
          </button>
          <button
            aria-label="Descartar borrador"
            className="campus-parent-mobile__draft-toast-discard"
            onClick={discardCommunityDraft}
            type="button"
          >
            Descartar
          </button>
        </div>
      ) : null}

      {feedActionMessage && !(hasPendingCommunityDraft && !showCommunityComposer && !showCommunityCamera) ? (
        <p className="campus-parent-mobile__feed-toast">{feedActionMessage}</p>
      ) : null}

      {showFinanceConceptsSheet ? (
        <ParentFeedBottomSheet onClose={() => setShowFinanceConceptsSheet(false)} title="Detalle del cobro">
          <div className="campus-parent-mobile__finance-concepts-list">
            {selectedFinanceConcepts.length ? selectedFinanceConcepts.map((concept) => (
              <article className="campus-parent-mobile__finance-concept-row" key={concept._id || `${concept.concept}-${concept.dueDate}`}>
                <div>
                  <strong>{concept.concept || 'Concepto académico'}</strong>
                  {concept.description ? <small>{concept.description}</small> : null}
                </div>
                {hideEnrollmentPaymentAmount ? null : (
                  <strong>{formatCurrency(concept.amount || 0)}</strong>
                )}
              </article>
            )) : <p className="campus-parent-mobile__sheet-empty">No hay detalle disponible para este cobro.</p>}
          </div>
          {!hideEnrollmentPaymentAmount ? (
            <div className="campus-parent-mobile__finance-concepts-total">
              <span>Total</span>
              <strong>{formatCurrency(selectedFinanceConceptsTotal || selectedFinanceAmount)}</strong>
            </div>
          ) : null}
          {selectedFinanceSummary?.requiresDataSchoolContact ? (
            <button className="campus-parent-mobile__finance-sheet-action" onClick={onPayAcademicCharge} type="button">Contactar DataSchool</button>
          ) : primaryPendingCharge ? (
            <button className="campus-parent-mobile__finance-sheet-action" disabled={Boolean(payingChargeId)} onClick={onPayAcademicCharge} type="button">
              {payingChargeId ? 'Procesando...' : financeHeroPayLabel}
            </button>
          ) : null}
        </ParentFeedBottomSheet>
      ) : null}

      {selectedLikesAnnouncement ? (
        <ParentFeedBottomSheet onClose={() => setFeedLikesSheetId('')} title="Likes">
          <div className="campus-parent-mobile__sheet-list">
            {selectedLikesAnnouncement.likes.length ? selectedLikesAnnouncement.likes.map((like) => (
              <article key={`${like.userId}-${like.createdAt || ''}`}>
                <span className="campus-parent-mobile__sheet-avatar">{String(like.name || 'A').slice(0, 2).toUpperCase()}</span>
                <strong>{like.name || 'Acudiente'}</strong>
              </article>
            )) : <p className="campus-parent-mobile__sheet-empty">Todavía no hay likes.</p>}
          </div>
        </ParentFeedBottomSheet>
      ) : null}

      {selectedCommentsAnnouncement ? (
        <ParentFeedBottomSheet onClose={() => setFeedCommentsSheetId('')} title="Comentarios">
          <div className="campus-parent-mobile__comments-list">
            {selectedCommentsAnnouncement.comments.length ? selectedCommentsAnnouncement.comments.map((comment) => (
              <article className="campus-parent-mobile__comment" key={comment.id}>
                <span className="campus-parent-mobile__sheet-avatar">{String(comment.name || 'A').slice(0, 2).toUpperCase()}</span>
                <div>
                  <div className="campus-parent-mobile__comment-bubble">
                    <strong>{comment.name || 'Acudiente'}</strong>
                    <p>{comment.body}</p>
                  </div>
                  <div className="campus-parent-mobile__comment-actions">
                    <button
                      className={comment.likedByMe ? 'is-liked' : ''}
                      disabled={pendingFeedCommentLikeKeys.includes(`${selectedCommentsAnnouncement.id}:${comment.id}`)}
                      onClick={() => onToggleFeedCommentLike(selectedCommentsAnnouncement.id, comment.id)}
                      type="button"
                    >
                      {comment.likedByMe ? '♥' : '♡'} {comment.likesCount || 0}
                    </button>
                    {comment.canDelete ? <button onClick={() => onDeleteFeedComment(selectedCommentsAnnouncement.id, comment.id)} type="button">Borrar</button> : null}
                  </div>
                </div>
              </article>
            )) : <p className="campus-parent-mobile__sheet-empty">Sé el primero en comentar.</p>}
          </div>
          <form className="campus-parent-mobile__comment-form" onSubmit={onSubmitFeedComment}>
            <input onChange={(event) => setCommentDraft(event.target.value)} placeholder="Agrega un comentario..." value={commentDraft} />
            <button disabled={!commentDraft.trim()} type="submit">Publicar</button>
          </form>
        </ParentFeedBottomSheet>
      ) : null}

      {matriculaFlowOpen && matriculaProcess ? (
        <MatriculaEnrollmentFlow
          charge={matriculaFlowCharge || primaryPendingCharge}
          onClose={() => {
            if (isBlockingMatriculaFlow) {
              return;
            }

            setMatriculaFlowOpen(false);
            setMatriculaFlowPendingResume(false);
            refreshMatriculaPendingSignatures();
            getParentAcademicBilling()
              .then((billingResponse) => {
                setAcademicBilling(billingResponse.data || {
                  summary: { pendingAmount: 0, pendingCount: 0 },
                  currentCharges: [],
                  charges: [],
                  payments: [],
                  paymentHistory: [],
                  pricingGuides: {},
                });
              })
              .catch(() => {});
          }}
          onLogout={isBlockingMatriculaFlow ? onLogout : undefined}
          onProcessUpdated={(nextProcess) => {
            setMatriculaProcess(nextProcess);
            if (nextProcess?.isCompleted) {
              setMatriculaPendingSignature(null);
              setMatriculaFlowPendingResume(false);
              setMatriculaFlowOpen(false);
              setMatriculaAccessGate('open');
            } else {
              setMatriculaAccessGate('blocked');
              refreshMatriculaPendingSignatures();
            }
          }}
          onPaymentStudentChange={onMatriculaPaymentStudentChange}
          paymentOptions={matriculaPaymentOptions}
          blocking={isBlockingMatriculaFlow}
          open={matriculaFlowOpen}
          pendingSignatureResume={matriculaFlowPendingResume}
          process={matriculaProcess}
          schoolId={user?.schoolId}
          schoolName={schoolDisplayName}
          startAtIntro={matriculaFlowPendingResume ? false : ['intro_pending', 'consent_pending'].includes(matriculaProcess.status)}
        />
      ) : null}

      {selectedChild && !shouldLockParentPortal ? (
      <CommunityReportFab
        disabled={shouldLockParentPortal}
        studentId={selectedChild?.id || selectedChild?._id || ''}
        studentPortalMode={studentPortalMode}
      />
      ) : null}

      {visiblePortalAppSections.length > 1 && !shouldLockParentPortal ? (
      <nav aria-label={studentPortalMode ? 'Navegacion principal del alumno' : 'Navegacion principal del padre'} className={`campus-parent-mobile__bottom-nav ${bottomNavClassName}${showCareMenu ? ' is-care-menu-open' : ''}`}>
        {visiblePortalAppSections.map((section) => {
          const isCareSection = ['nursing', 'wellbeing', 'coexistence'].includes(activeSection);
          const isActive = section.key === activeSection || (section.key === 'nursing' && isCareSection);

          if (section.key === 'nursing') {
            return (
              <div className="campus-parent-mobile__care-nav" key={section.key}>
                {showCareMenu ? (
                  <div aria-label="Opciones de cuidado" className="campus-parent-mobile__care-menu" role="menu">
                    {visibleParentCareMenuItems.map((item) => (
                      <button
                        className={`campus-parent-mobile__care-menu-item${activeSection === item.id ? ' is-active' : ''}`}
                        key={item.id}
                        onClick={() => {
                          expandBottomNav();
                          setShowCareMenu(false);
                          if (usesRoutedSections) {
                            navigate(buildRoutedSectionPath(normalizedRouteBase, item.id));
                            return;
                          }
                          setLocalActiveSection(item.id);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        <span>{item.id === 'nursing' ? <ParentAppIcon icon="nursing" /> : <ParentCareOptionIcon icon={item.icon} />}</span>
                        <strong>{item.title}</strong>
                      </button>
                    ))}
                  </div>
                ) : null}
                <button
                  aria-label={section.label}
                  aria-expanded={showCareMenu}
                  className={`campus-parent-mobile__nav-item${isActive || showCareMenu ? ' is-active' : ''}`}
                  onClick={() => onSelectSection(section.key)}
                  title={section.label}
                  type="button"
                >
                  <ParentAppIcon icon={section.icon} />
                </button>
              </div>
            );
          }

          return (
            <button
              aria-label={section.label}
              className={`campus-parent-mobile__nav-item${isActive ? ' is-active' : ''}`}
              key={section.key}
              onClick={() => onSelectSection(section.key)}
              title={section.label}
              type="button"
            >
              <ParentAppIcon icon={section.icon} />
            </button>
          );
        })}
      </nav>
      ) : null}
    </section>
  );
}

export default ParentCampusHome;