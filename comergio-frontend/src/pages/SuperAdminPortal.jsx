import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LOGIN_PATH } from '../lib/authNavigation';
import useAuthStore from '../store/auth.store';
import {
  confirmSuperAdminSchoolDelete,
  createSuperAdminSchool,
  getSuperAdminRectoriaUser,
  getSuperAdminSummary,
  requestSuperAdminSchoolDelete,
  saveSuperAdminRectoriaUser,
  updateSuperAdminSchoolSettings,
} from '../services/superAdmin.service';
import { PortalBootSplash } from '../components/PortalBootSplash';
import SuperAdminDianPanel from './SuperAdminDianPanel';
import InformaPanel from '../components/comergio-academy/InformaPanel';
import InformaDraftsPanel from '../components/comergio-academy/InformaDraftsPanel';
import '../components/comergio-academy/InformaPanel.css';
import '../components/comergio-academy/InformaDraftsPanel.css';
import { STAFF_FEATURE_OPTIONS, normalizeStaffFeatures } from '../lib/staffFeatures';
import { STUDENT_FEATURE_OPTIONS, normalizeStudentFeatures } from '../lib/studentFeatures';
import './SuperAdminPortal.css';

const SA_SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'schools', label: 'Colegios' },
  { id: 'publications', label: 'Publicaciones' },
  { id: 'billing', label: 'Facturación' },
];

const featureOptions = [
  { key: 'home', label: 'Inicio' },
  { key: 'finance', label: 'Cartera' },
  { key: 'academic', label: 'Académico' },
  { key: 'cafeteria', label: 'Comida' },
  { key: 'nursing', label: 'Enfermería' },
  { key: 'wellbeing', label: 'Bienestar' },
  { key: 'coexistence', label: 'Convivencia' },
  { key: 'transport', label: 'Ruta escolar' },
];

const statusOptions = [
  { value: 'subscribed', label: 'Suscrito' },
  { value: 'trial', label: 'Piloto' },
  { value: 'paused', label: 'Pausado' },
  { value: 'disabled', label: 'Deshabilitado' },
];

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function getDefaultFeatures(features = {}) {
  return featureOptions.reduce((accumulator, item) => {
    accumulator[item.key] = features[item.key] === undefined ? true : Boolean(features[item.key]);
    return accumulator;
  }, {});
}

function getDefaultStaffFeatures(features = {}) {
  return normalizeStaffFeatures(features);
}

function getDefaultStudentFeatures(features = {}) {
  return normalizeStudentFeatures(features);
}

function buildBillingPartyDraft(party = {}) {
  return {
    legalName: party.legalName || '',
    nit: party.nit || '',
    dv: party.dv || '',
    email: party.email || '',
    phone: party.phone || '',
    personType: party.personType || '1',
    taxLevelCode: party.taxLevelCode || 'R-99-PN',
    addressLine: party.addressLine || '',
    cityCode: party.cityCode || '11001',
    cityName: party.cityName || 'Bogotá',
    departmentCode: party.departmentCode || '11',
    departmentName: party.departmentName || 'Bogotá',
    postalCode: party.postalCode || '',
  };
}

function buildDraftFromSchool(school = {}) {
  return {
    schoolName: school.schoolName || '',
    subscriptionStatus: school.settings?.subscriptionStatus || 'subscribed',
    pricePerStudent: String(Number(school.settings?.pricePerStudent || 0)),
    notes: school.settings?.notes || '',
    parentFeatures: getDefaultFeatures(school.settings?.parentFeatures || {}),
    staffFeatures: getDefaultStaffFeatures(school.settings?.staffFeatures || {}),
    studentFeatures: getDefaultStudentFeatures(school.settings?.studentFeatures || {}),
    billingParty: buildBillingPartyDraft(school.settings?.billingParty || {
      legalName: school.schoolName || '',
    }),
  };
}

function buildRectoriaDraft(existingUser = null) {
  return {
    username: existingUser?.username || '',
    password: '',
    confirmPassword: '',
    name: existingUser?.name || '',
    email: existingUser?.email || '',
  };
}

function generateRectoriaPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  return Array.from({ length: 12 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function getSchoolInitials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CO';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function formatRoleLabel(role = '') {
  const labels = {
    parent: 'Padre',
    teacher: 'Docente',
    rectoria: 'Rectoría',
    coordination: 'Coordinación',
    academic_secretary: 'Secretaría',
    nursing: 'Enfermería',
    psychology: 'Psicología',
    human_resources: 'Talento humano',
    admissions: 'Admisiones',
    direccion: 'Dirección',
  };
  return labels[role] || role || 'Usuario';
}

function SaNavIcon({ id }) {
  if (id === 'dashboard') {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M4.5 10.5 12 4.5l7.5 6V19a1.5 1.5 0 0 1-1.5 1.5h-3.5V14H9.5v6.5H6A1.5 1.5 0 0 1 4.5 19v-8.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    );
  }
  if (id === 'schools') {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M4.5 19.5V8.5L12 4.5l7.5 4v11" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        <path d="M9 19.5v-5h6v5" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    );
  }
  if (id === 'publications') {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M7 4.5h7.5L18 8v11.5H7V4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        <path d="M9.5 12h5M9.5 15.5h3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <rect height="12" rx="2" stroke="currentColor" strokeWidth="1.7" width="14" x="5" y="6" />
      <path d="M8 10h8M8 13.5h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function SuperAdminPortal() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [summary, setSummary] = useState({ totals: {}, schools: [] });
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [draftsBySchool, setDraftsBySchool] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingSchoolId, setSavingSchoolId] = useState('');
  const [deletingSchoolId, setDeletingSchoolId] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [rectoriaUser, setRectoriaUser] = useState(null);
  const [rectoriaDraft, setRectoriaDraft] = useState(buildRectoriaDraft());
  const [loadingRectoria, setLoadingRectoria] = useState(false);
  const [savingRectoria, setSavingRectoria] = useState(false);
  const [rectoriaFeedback, setRectoriaFeedback] = useState(null);
  const [rectoriaFeedbackFading, setRectoriaFeedbackFading] = useState(false);
  const [showCreateSchoolModal, setShowCreateSchoolModal] = useState(false);
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [createSchoolDraft, setCreateSchoolDraft] = useState({
    schoolName: '',
    subscriptionStatus: 'subscribed',
    pricePerStudent: '0',
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const selectedSchool = useMemo(
    () => summary.schools.find((school) => school.schoolId === selectedSchoolId) || summary.schools[0] || null,
    [selectedSchoolId, summary.schools]
  );
  const selectedDraft = selectedSchool ? draftsBySchool[selectedSchool.schoolId] || buildDraftFromSchool(selectedSchool) : null;

  const loadSummary = () => {
    setLoading(true);
    setMessage('');

    getSuperAdminSummary()
      .then((response) => {
        const nextSummary = response.data || { totals: {}, schools: [] };
        setSummary(nextSummary);
        setDraftsBySchool((currentDrafts) => {
          const nextDrafts = { ...currentDrafts };
          (nextSummary.schools || []).forEach((school) => {
            nextDrafts[school.schoolId] = nextDrafts[school.schoolId] || buildDraftFromSchool(school);
          });
          return nextDrafts;
        });
        setSelectedSchoolId((currentSchoolId) => (
          currentSchoolId && nextSummary.schools?.some((school) => school.schoolId === currentSchoolId)
            ? currentSchoolId
            : nextSummary.schools?.[0]?.schoolId || ''
        ));
      })
      .catch((error) => {
        setMessage(error?.response?.data?.message || error?.message || 'No se pudo cargar el portal.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSummary();
  }, []);

  useEffect(() => {
    const token = String(searchParams.get('confirmDeleteToken') || '').trim();
    if (!token || confirmingDelete) {
      return undefined;
    }

    let cancelled = false;
    setConfirmingDelete(true);
    setActiveSection('schools');
    setMessageTone('info');
    setMessage('Confirmando eliminación del colegio...');

    confirmSuperAdminSchoolDelete(token)
      .then((response) => {
        if (cancelled) return;
        setMessageTone('success');
        setMessage(response.data?.message || 'Colegio eliminado permanentemente.');
        loadSummary();
      })
      .catch((error) => {
        if (cancelled) return;
        setMessageTone('error');
        setMessage(error?.response?.data?.message || error?.message || 'No se pudo confirmar la eliminación.');
      })
      .finally(() => {
        if (cancelled) return;
        setConfirmingDelete(false);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('confirmDeleteToken');
        setSearchParams(nextParams, { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, confirmingDelete, setSearchParams]);

  useEffect(() => {
    if (!rectoriaFeedback || rectoriaFeedback.type !== 'success') {
      setRectoriaFeedbackFading(false);
      return undefined;
    }

    setRectoriaFeedbackFading(false);

    const fadeTimer = setTimeout(() => {
      setRectoriaFeedbackFading(true);
    }, 2700);

    const closeTimer = setTimeout(() => {
      setRectoriaFeedback(null);
      setRectoriaFeedbackFading(false);
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [rectoriaFeedback]);

  const showRectoriaFeedback = (type, message) => {
    setRectoriaFeedback({ type, message });
  };

  const loadRectoriaUser = async (schoolId, { showLoading = true, clearFeedback = true } = {}) => {
    if (showLoading) {
      setLoadingRectoria(true);
    }
    if (clearFeedback) {
      setRectoriaFeedback(null);
    }

    try {
      const response = await getSuperAdminRectoriaUser(schoolId);
      const nextUser = response.data?.user || null;
      setRectoriaUser(nextUser);
      setRectoriaDraft(buildRectoriaDraft(nextUser));
      return nextUser;
    } catch (error) {
      setRectoriaUser(null);
      setRectoriaDraft(buildRectoriaDraft());
      showRectoriaFeedback('error', error?.response?.data?.message || error?.message || 'No se pudo cargar el usuario de rectoría.');
      return null;
    } finally {
      if (showLoading) {
        setLoadingRectoria(false);
      }
    }
  };

  useEffect(() => {
    if (!selectedSchool?.schoolId) {
      setRectoriaUser(null);
      setRectoriaDraft(buildRectoriaDraft());
      setRectoriaFeedback(null);
      return undefined;
    }

    let cancelled = false;
    setLoadingRectoria(true);
    setRectoriaFeedback(null);

    getSuperAdminRectoriaUser(selectedSchool.schoolId)
      .then((response) => {
        if (cancelled) {
          return;
        }

        const nextUser = response.data?.user || null;
        setRectoriaUser(nextUser);
        setRectoriaDraft(buildRectoriaDraft(nextUser));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setRectoriaUser(null);
        setRectoriaDraft(buildRectoriaDraft());
        showRectoriaFeedback('error', error?.response?.data?.message || error?.message || 'No se pudo cargar el usuario de rectoría.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingRectoria(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSchool?.schoolId]);

  const saveRectoriaUser = async () => {
    if (!selectedSchool) {
      return;
    }

    const normalizedUsername = String(rectoriaDraft.username || '').trim().toLowerCase();
    const password = String(rectoriaDraft.password || '');
    const confirmPassword = String(rectoriaDraft.confirmPassword || '');
    const isUpdate = Boolean(rectoriaUser);

    if (!normalizedUsername) {
      showRectoriaFeedback('error', 'El nombre de usuario es obligatorio.');
      return;
    }

    if (!isUpdate && (!password || password.length < 8)) {
      showRectoriaFeedback('error', 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password && password.length < 8) {
      showRectoriaFeedback('error', 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password && password !== confirmPassword) {
      showRectoriaFeedback('error', 'Las contraseñas no coinciden.');
      return;
    }

    setSavingRectoria(true);
    setRectoriaFeedback(null);

    try {
      const payload = {
        username: normalizedUsername,
        name: String(rectoriaDraft.name || '').trim(),
        email: String(rectoriaDraft.email || '').trim(),
      };

      if (password) {
        payload.password = password;
      }

      const response = await saveSuperAdminRectoriaUser(selectedSchool.schoolId, payload);
      await loadRectoriaUser(selectedSchool.schoolId, { showLoading: false, clearFeedback: false });
      showRectoriaFeedback('success', response.data?.message || 'Usuario de rectoría guardado.');
    } catch (error) {
      showRectoriaFeedback('error', error?.response?.data?.message || error?.message || 'No se pudo guardar el usuario de rectoría.');
    } finally {
      setSavingRectoria(false);
    }
  };

  const generatePassword = () => {
    const nextPassword = generateRectoriaPassword();
    setRectoriaDraft((currentDraft) => ({
      ...currentDraft,
      password: nextPassword,
      confirmPassword: nextPassword,
    }));
  };

  const updateDraft = (schoolId, updater) => {
    setDraftsBySchool((currentDrafts) => {
      const currentDraft = currentDrafts[schoolId] || buildDraftFromSchool(summary.schools.find((school) => school.schoolId === schoolId));
      const nextDraft = typeof updater === 'function' ? updater(currentDraft) : { ...currentDraft, ...updater };
      return { ...currentDrafts, [schoolId]: nextDraft };
    });
  };

  const recomputeSummaryTotals = (schools = []) => schools.reduce((accumulator, school) => {
    accumulator.totalSchools += 1;
    accumulator.subscribedSchools += school.settings?.subscriptionStatus === 'subscribed' ? 1 : 0;
    accumulator.activeStudents += Number(school.activeStudents || 0);
    accumulator.parentUsers += Number(school.parentUsers || 0);
    accumulator.projectedMonthlyBilling += Number(school.monthlyCharge || 0);
    return accumulator;
  }, {
    totalSchools: 0,
    subscribedSchools: 0,
    activeStudents: 0,
    parentUsers: 0,
    projectedMonthlyBilling: 0,
  });

  const saveSelectedSchool = async () => {
    if (!selectedSchool || !selectedDraft) {
      return;
    }

    const normalizedSchoolName = String(selectedDraft.schoolName || '').trim();
    if (normalizedSchoolName.length < 3) {
      setMessage('El nombre del colegio debe tener al menos 3 caracteres.');
      return;
    }

    setSavingSchoolId(selectedSchool.schoolId);
    setMessage('');
    try {
      const response = await updateSuperAdminSchoolSettings(selectedSchool.schoolId, {
        ...selectedDraft,
        schoolName: normalizedSchoolName,
        pricePerStudent: Number(selectedDraft.pricePerStudent || 0),
      });
      const updatedSchool = response.data?.school;
      if (updatedSchool) {
        setSummary((currentSummary) => {
          const nextSchools = currentSummary.schools.map((school) => (
            school.schoolId === updatedSchool.schoolId ? updatedSchool : school
          ));
          return {
            ...currentSummary,
            schools: nextSchools,
            totals: recomputeSummaryTotals(nextSchools),
          };
        });
        setDraftsBySchool((currentDrafts) => ({ ...currentDrafts, [updatedSchool.schoolId]: buildDraftFromSchool(updatedSchool) }));
      }
      setMessage('Configuración guardada.');
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'No se pudo guardar.');
    } finally {
      setSavingSchoolId('');
    }
  };

  const openCreateSchoolModal = () => {
    setCreateSchoolDraft({
      schoolName: '',
      subscriptionStatus: 'subscribed',
      pricePerStudent: '0',
    });
    setShowCreateSchoolModal(true);
  };

  const closeCreateSchoolModal = () => {
    if (creatingSchool) {
      return;
    }
    setShowCreateSchoolModal(false);
  };

  const createSchool = async () => {
    const normalizedSchoolName = String(createSchoolDraft.schoolName || '').trim();
    if (normalizedSchoolName.length < 3) {
      setMessage('El nombre del colegio debe tener al menos 3 caracteres.');
      return;
    }

    setCreatingSchool(true);
    setMessage('');
    try {
      const response = await createSuperAdminSchool({
        schoolName: normalizedSchoolName,
        subscriptionStatus: createSchoolDraft.subscriptionStatus,
        pricePerStudent: Number(createSchoolDraft.pricePerStudent || 0),
      });
      const createdSchool = response.data?.school;
      if (createdSchool) {
        setSummary((currentSummary) => {
          const nextSchools = [...currentSummary.schools, createdSchool]
            .sort((left, right) => left.schoolName.localeCompare(right.schoolName, 'es', { sensitivity: 'base' }));
          return {
            ...currentSummary,
            schools: nextSchools,
            totals: recomputeSummaryTotals(nextSchools),
          };
        });
        setDraftsBySchool((currentDrafts) => ({
          ...currentDrafts,
          [createdSchool.schoolId]: buildDraftFromSchool(createdSchool),
        }));
        setSelectedSchoolId(createdSchool.schoolId);
      }
      setShowCreateSchoolModal(false);
      setMessage(response.data?.message || 'Colegio creado correctamente.');
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'No se pudo crear el colegio.');
    } finally {
      setCreatingSchool(false);
    }
  };

  const deleteSelectedSchool = async () => {
    if (!selectedSchool) {
      return;
    }

    const dataWarning = selectedSchool.activeStudents > 0 || selectedSchool.parentUsers > 0
      ? `Este colegio tiene ${formatNumber(selectedSchool.activeStudents)} alumnos activos y ${formatNumber(selectedSchool.parentUsers)} acudientes. `
      : '';
    const confirmed = window.confirm(
      `${dataWarning}Se enviará un correo a mercancias.visbal@gmail.com para confirmar la eliminación de "${selectedSchool.schoolName}". El colegio NO se borra hasta que confirmes desde ese correo. ¿Continuar?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingSchoolId(selectedSchool.schoolId);
    setMessage('');
    setMessageTone('info');
    try {
      const response = await requestSuperAdminSchoolDelete(selectedSchool.schoolId);
      setMessageTone('success');
      setMessage(response.data?.message || 'Correo de confirmación enviado.');
    } catch (error) {
      setMessageTone('error');
      setMessage(error?.response?.data?.message || error?.message || 'No se pudo solicitar la eliminación.');
    } finally {
      setDeletingSchoolId('');
    }
  };

  const openSchoolSection = (schoolId = '') => {
    if (schoolId) {
      setSelectedSchoolId(schoolId);
    }
    setActiveSection('schools');
  };

  const onLogout = () => {
    logout();
    navigate(LOGIN_PATH, { replace: true });
  };

  const sectionTitle = SA_SECTIONS.find((section) => section.id === activeSection)?.label || 'Dashboard';
  const userInitials = getSchoolInitials(user?.name || user?.username || 'AS');

  if (loading && !(summary.schools || []).length) {
    return <PortalBootSplash portal="super-admin" />;
  }

  return (
    <section className="super-admin-page sa-shell">
      <aside className="sa-sidebar" aria-label="Navegación gerencia">
        <div className="sa-sidebar__brand">
          <span className="sa-sidebar__brand-mark" aria-hidden="true">C</span>
          <div>
            <strong>Comergio</strong>
            <span>Gerencia</span>
          </div>
        </div>

        <div>
          <p className="sa-sidebar__nav-label">Gerencia Comergio</p>
          <nav className="sa-sidebar__nav">
            {SA_SECTIONS.map((section) => (
              <button
                key={section.id}
                className={`sa-sidebar__link${activeSection === section.id ? ' is-active' : ''}`}
                type="button"
                onClick={() => setActiveSection(section.id)}
              >
                <SaNavIcon id={section.id} />
                {section.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="sa-sidebar__foot">
          <div className="sa-sidebar__help">
            <strong>Help Center</strong>
            <p>Gestiona colegios, facturación y publicaciones institucionales desde un solo lugar.</p>
          </div>
          <div className="sa-sidebar__user">
            <span className="sa-sidebar__avatar" aria-hidden="true">{userInitials}</span>
            <div>
              <strong>{user?.name || 'Administrador supremo'}</strong>
              <span>{user?.email || user?.username || 'admin@comergio.com.co'}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="sa-main">
        <header className="sa-topbar">
          <div>
            <h1>{activeSection === 'dashboard' ? `¡Bienvenido! ${user?.name || 'Administrador supremo'}` : sectionTitle}</h1>
            <p>
              {activeSection === 'dashboard' && 'KPIs consolidados de toda la red de colegios.'}
              {activeSection === 'schools' && 'Consulta, edita y administra cada colegio suscrito.'}
              {activeSection === 'publications' && 'Borradores y publicaciones de Comergio Informa.'}
              {activeSection === 'billing' && 'Proyección de cobro y facturación electrónica por colegio.'}
            </p>
          </div>
          <button className="sa-topbar__logout" onClick={onLogout} type="button">Cerrar sesión</button>
        </header>

        <div className="sa-content">
          {message ? (
            <p className={`sa-message${messageTone === 'error' ? ' is-error' : ''}${messageTone === 'success' ? ' is-success' : ''}`}>
              {message}
            </p>
          ) : null}

          {activeSection === 'dashboard' ? (
            <>
              <section className="sa-kpi-grid" aria-label="Resumen general">
                <article className="sa-kpi-card">
                  <span className="sa-kpi-card__icon is-green" aria-hidden="true"><SaNavIcon id="schools" /></span>
                  <span>Colegios suscritos</span>
                  <strong>{formatNumber(summary.totals?.subscribedSchools)}</strong>
                  <p>{formatNumber(summary.totals?.totalSchools)} colegios totales</p>
                </article>
                <article className="sa-kpi-card">
                  <span className="sa-kpi-card__icon is-blue" aria-hidden="true"><SaNavIcon id="dashboard" /></span>
                  <span>Alumnos matriculados</span>
                  <strong>{formatNumber(summary.totals?.activeStudents)}</strong>
                  <p>Activos en todos los colegios</p>
                </article>
                <article className="sa-kpi-card">
                  <span className="sa-kpi-card__icon is-violet" aria-hidden="true"><SaNavIcon id="publications" /></span>
                  <span>Acudientes activos</span>
                  <strong>{formatNumber(summary.totals?.parentUsers)}</strong>
                  <p>Usuarios padre registrados</p>
                </article>
                <article className="sa-kpi-card">
                  <span className="sa-kpi-card__icon is-amber" aria-hidden="true"><SaNavIcon id="billing" /></span>
                  <span>Descargas de la app</span>
                  <strong>{formatNumber(Number(summary.totals?.iosDevices || 0) + Number(summary.totals?.androidDevices || 0))}</strong>
                  <p>{formatNumber(summary.totals?.iosDevices)} iOS · {formatNumber(summary.totals?.androidDevices)} Android</p>
                </article>
                <article className="sa-kpi-card">
                  <span className="sa-kpi-card__icon is-teal" aria-hidden="true"><SaNavIcon id="billing" /></span>
                  <span>Cobro mensual proyectado</span>
                  <strong>{formatCurrency(summary.totals?.projectedMonthlyBilling)}</strong>
                  <p>Según precio por alumno</p>
                </article>
              </section>

              <div className="sa-dash-grid">
                <section className="sa-panel">
                  <div className="sa-panel__head">
                    <div>
                      <h2>Colegios</h2>
                      <p>Vista rápida de la red. Entra a Colegios para editar o eliminar.</p>
                    </div>
                    <div className="sa-actions">
                      <button className="sa-btn is-secondary" disabled={loading || creatingSchool} onClick={loadSummary} type="button">Actualizar</button>
                      <button className="sa-btn" disabled={loading || creatingSchool} onClick={openCreateSchoolModal} type="button">+ Crear colegio</button>
                    </div>
                  </div>
                  <div className="sa-school-list">
                    {summary.schools.map((school) => (
                      <button
                        key={school.schoolId}
                        className={`sa-school-item${selectedSchool?.schoolId === school.schoolId ? ' is-active' : ''}`}
                        type="button"
                        onClick={() => openSchoolSection(school.schoolId)}
                      >
                        <span className="sa-school-item__avatar" aria-hidden="true">{getSchoolInitials(school.schoolName)}</span>
                        <span>
                          <strong>{school.schoolName}</strong>
                          <small>{school.schoolId}</small>
                        </span>
                        <b>{formatNumber(school.activeStudents)}</b>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="sa-panel">
                  <div className="sa-panel__head">
                    <div>
                      <h2>Acciones rápidas</h2>
                      <p>Atajos para operar la plataforma.</p>
                    </div>
                  </div>
                  <div className="sa-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <button className="sa-btn" type="button" onClick={openCreateSchoolModal}>Crear un colegio nuevo</button>
                    <button className="sa-btn is-secondary" type="button" onClick={() => setActiveSection('schools')}>Administrar colegios</button>
                    <button className="sa-btn is-secondary" type="button" onClick={() => setActiveSection('publications')}>Ir a publicaciones</button>
                    <button className="sa-btn is-secondary" type="button" onClick={() => setActiveSection('billing')}>Ir a facturación</button>
                  </div>
                </section>
              </div>
            </>
          ) : null}

          {activeSection === 'schools' ? (
            <div className="sa-schools-layout">
              <aside className="sa-panel" aria-label="Listado de colegios">
                <div className="sa-panel__head">
                  <div>
                    <h2>Colegios</h2>
                    <p>{formatNumber(summary.schools.length)} registrados</p>
                  </div>
                  <div className="sa-actions">
                    <button className="sa-btn is-secondary" disabled={loading} onClick={loadSummary} type="button">Actualizar</button>
                    <button className="sa-btn" disabled={creatingSchool} onClick={openCreateSchoolModal} type="button">+ Crear</button>
                  </div>
                </div>
                <div className="sa-school-list">
                  {summary.schools.map((school) => (
                    <button
                      key={school.schoolId}
                      className={`sa-school-item${selectedSchool?.schoolId === school.schoolId ? ' is-active' : ''}`}
                      type="button"
                      onClick={() => setSelectedSchoolId(school.schoolId)}
                    >
                      <span className="sa-school-item__avatar" aria-hidden="true">{getSchoolInitials(school.schoolName)}</span>
                      <span>
                        <strong>{school.schoolName}</strong>
                        <small>{school.schoolId}</small>
                      </span>
                      <b>{formatNumber(school.activeStudents)}</b>
                    </button>
                  ))}
                </div>
              </aside>

              {selectedSchool && selectedDraft ? (
                <section className="sa-panel">
                  <div className="sa-panel__head">
                    <div>
                      <h2>{selectedSchool.schoolName}</h2>
                      <p>{selectedSchool.schoolId}</p>
                    </div>
                    <div className="super-admin-charge-box">
                      <span>Cobro estimado</span>
                      <strong>{formatCurrency(Number(selectedDraft.pricePerStudent || 0) * Number(selectedSchool.activeStudents || 0))}</strong>
                    </div>
                  </div>

                  <div className="sa-stat-grid">
                    <div className="sa-stat-chip"><span>Estudiantes</span><strong>{formatNumber(selectedSchool.activeStudents)}</strong></div>
                    <div className="sa-stat-chip"><span>Staff</span><strong>{formatNumber(selectedSchool.staffUsers)}</strong></div>
                    <div className="sa-stat-chip"><span>Padres</span><strong>{formatNumber(selectedSchool.parentUsers)}</strong></div>
                    <div className="sa-stat-chip"><span>Materias</span><strong>{formatNumber(selectedSchool.subjectsCount)}</strong></div>
                    <div className="sa-stat-chip"><span>Grados</span><strong>{formatNumber(selectedSchool.gradesCount)}</strong></div>
                    <div className="sa-stat-chip"><span>Cursos</span><strong>{formatNumber(selectedSchool.coursesCount)}</strong></div>
                  </div>

                  <h3 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem' }}>Últimos usuarios creados</h3>
                  <div className="sa-recent-list">
                    {(selectedSchool.recentUsers || []).length === 0 ? (
                      <p className="sa-muted">Todavía no hay usuarios recientes en este colegio.</p>
                    ) : selectedSchool.recentUsers.map((recentUser) => (
                      <div className="sa-recent-item" key={recentUser._id}>
                        <div>
                          <strong>{recentUser.name || recentUser.username || 'Usuario'}</strong>
                          <small>{formatRoleLabel(recentUser.role)} · {recentUser.username}</small>
                        </div>
                        <small>{recentUser.createdAt ? new Date(recentUser.createdAt).toLocaleDateString('es-CO') : '—'}</small>
                      </div>
                    ))}
                  </div>

                  <div className="sa-form-grid super-admin-form-grid">
                    <label className="is-wide">
                      Nombre del colegio
                      <input
                        onChange={(event) => updateDraft(selectedSchool.schoolId, { schoolName: event.target.value })}
                        placeholder="Nombre visible en login y toda la app"
                        type="text"
                        value={selectedDraft.schoolName}
                      />
                    </label>
                    <label>
                      Estado comercial
                      <select
                        value={selectedDraft.subscriptionStatus}
                        onChange={(event) => updateDraft(selectedSchool.schoolId, { subscriptionStatus: event.target.value })}
                      >
                        {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>
                      Precio mensual por alumno
                      <input
                        min="0"
                        onChange={(event) => updateDraft(selectedSchool.schoolId, { pricePerStudent: event.target.value })}
                        step="1000"
                        type="number"
                        value={selectedDraft.pricePerStudent}
                      />
                    </label>
                    <label className="is-wide">
                      Notas internas
                      <textarea
                        onChange={(event) => updateDraft(selectedSchool.schoolId, { notes: event.target.value })}
                        rows="3"
                        value={selectedDraft.notes}
                      />
                    </label>
                  </div>

                  <section className="super-admin-feature-panel" style={{ marginTop: 16 }}>
                    <div className="super-admin-panel-head">
                      <div>
                        <h3>Datos fiscales del colegio (adquiriente)</h3>
                        <p>Se usan al emitir la factura electrónica DIAN a este cliente.</p>
                      </div>
                    </div>
                    <div className="super-admin-form-grid">
                      <label>
                        Razón social
                        <input
                          onChange={(event) => updateDraft(selectedSchool.schoolId, (current) => ({
                            ...current,
                            billingParty: { ...current.billingParty, legalName: event.target.value },
                          }))}
                          type="text"
                          value={selectedDraft.billingParty?.legalName || ''}
                        />
                      </label>
                      <label>
                        NIT
                        <input
                          onChange={(event) => updateDraft(selectedSchool.schoolId, (current) => ({
                            ...current,
                            billingParty: { ...current.billingParty, nit: event.target.value },
                          }))}
                          type="text"
                          value={selectedDraft.billingParty?.nit || ''}
                        />
                      </label>
                      <label>
                        DV
                        <input
                          onChange={(event) => updateDraft(selectedSchool.schoolId, (current) => ({
                            ...current,
                            billingParty: { ...current.billingParty, dv: event.target.value },
                          }))}
                          type="text"
                          value={selectedDraft.billingParty?.dv || ''}
                        />
                      </label>
                      <label>
                        Correo recepción FE
                        <input
                          onChange={(event) => updateDraft(selectedSchool.schoolId, (current) => ({
                            ...current,
                            billingParty: { ...current.billingParty, email: event.target.value },
                          }))}
                          type="email"
                          value={selectedDraft.billingParty?.email || ''}
                        />
                      </label>
                      <label className="is-wide">
                        Dirección
                        <input
                          onChange={(event) => updateDraft(selectedSchool.schoolId, (current) => ({
                            ...current,
                            billingParty: { ...current.billingParty, addressLine: event.target.value },
                          }))}
                          type="text"
                          value={selectedDraft.billingParty?.addressLine || ''}
                        />
                      </label>
                      <label>
                        Ciudad
                        <input
                          onChange={(event) => updateDraft(selectedSchool.schoolId, (current) => ({
                            ...current,
                            billingParty: { ...current.billingParty, cityName: event.target.value },
                          }))}
                          type="text"
                          value={selectedDraft.billingParty?.cityName || ''}
                        />
                      </label>
                      <label>
                        Código DANE ciudad
                        <input
                          onChange={(event) => updateDraft(selectedSchool.schoolId, (current) => ({
                            ...current,
                            billingParty: { ...current.billingParty, cityCode: event.target.value },
                          }))}
                          type="text"
                          value={selectedDraft.billingParty?.cityCode || ''}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="super-admin-feature-panel">
                    <div className="super-admin-panel-head">
                      <div>
                        <h3>Opciones visibles en la app de padres</h3>
                        <p>Al desactivar una opción, desaparece de la barra inferior de los papás de este colegio.</p>
                      </div>
                    </div>
                    <div className="sa-feature-grid">
                      {featureOptions.map((feature) => (
                        <label className="sa-toggle" key={feature.key}>
                          <input
                            checked={Boolean(selectedDraft.parentFeatures?.[feature.key])}
                            onChange={(event) => updateDraft(selectedSchool.schoolId, (currentDraft) => ({
                              ...currentDraft,
                              parentFeatures: {
                                ...getDefaultFeatures(currentDraft.parentFeatures),
                                [feature.key]: event.target.checked,
                              },
                            }))}
                            type="checkbox"
                          />
                          <span>{feature.label}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="super-admin-feature-panel">
                    <div className="super-admin-panel-head">
                      <div>
                        <h3>Opciones visibles para los alumnos</h3>
                        <p>Al desactivar una opción, desaparece de la barra inferior de los alumnos de este colegio.</p>
                      </div>
                    </div>
                    <div className="sa-feature-grid">
                      {STUDENT_FEATURE_OPTIONS.map((feature) => (
                        <label className="sa-toggle" key={feature.key}>
                          <input
                            checked={Boolean(selectedDraft.studentFeatures?.[feature.key])}
                            onChange={(event) => updateDraft(selectedSchool.schoolId, (currentDraft) => ({
                              ...currentDraft,
                              studentFeatures: {
                                ...getDefaultStudentFeatures(currentDraft.studentFeatures),
                                [feature.key]: event.target.checked,
                              },
                            }))}
                            type="checkbox"
                          />
                          <span>{feature.label}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="super-admin-feature-panel">
                    <div className="super-admin-panel-head">
                      <div>
                        <h3>Opciones visibles para el staff</h3>
                        <p>Al desactivar un portal, el equipo de este colegio deja de verlo y no puede entrar.</p>
                      </div>
                    </div>
                    <div className="sa-feature-grid">
                      {STAFF_FEATURE_OPTIONS.map((feature) => (
                        <label className="sa-toggle" key={feature.key}>
                          <input
                            checked={Boolean(selectedDraft.staffFeatures?.[feature.key])}
                            onChange={(event) => updateDraft(selectedSchool.schoolId, (currentDraft) => ({
                              ...currentDraft,
                              staffFeatures: {
                                ...getDefaultStaffFeatures(currentDraft.staffFeatures),
                                [feature.key]: event.target.checked,
                              },
                            }))}
                            type="checkbox"
                          />
                          <span>{feature.label}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="super-admin-feature-panel">
                    <div className="super-admin-panel-head">
                      <div>
                        <h3>Usuario de rectoría</h3>
                        <p>Crea o actualiza las credenciales para que el rector ingrese al portal del colegio.</p>
                      </div>
                    </div>

                    {loadingRectoria ? <p className="sa-muted">Cargando usuario de rectoría...</p> : null}
                    {rectoriaFeedback?.type === 'error' ? (
                      <p className="sa-message is-error" role="alert">{rectoriaFeedback.message}</p>
                    ) : null}

                    {rectoriaUser ? (
                      <p className="sa-muted">
                        Usuario activo: <strong>{rectoriaUser.username}</strong>
                        {rectoriaUser.name ? ` · ${rectoriaUser.name}` : ''}
                      </p>
                    ) : (
                      <p className="sa-muted">Este colegio aún no tiene un usuario de rectoría.</p>
                    )}

                    <div className="super-admin-form-grid">
                      <label>
                        Nombre de usuario
                        <input
                          autoComplete="username"
                          onChange={(event) => setRectoriaDraft((currentDraft) => ({ ...currentDraft, username: event.target.value }))}
                          type="text"
                          value={rectoriaDraft.username}
                        />
                      </label>
                      <label>
                        Nombre (opcional)
                        <input
                          onChange={(event) => setRectoriaDraft((currentDraft) => ({ ...currentDraft, name: event.target.value }))}
                          type="text"
                          value={rectoriaDraft.name}
                        />
                      </label>
                      <label>
                        Correo (opcional)
                        <input
                          autoComplete="email"
                          onChange={(event) => setRectoriaDraft((currentDraft) => ({ ...currentDraft, email: event.target.value }))}
                          type="email"
                          value={rectoriaDraft.email}
                        />
                      </label>
                      <label>
                        {rectoriaUser ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                        <input
                          autoComplete="new-password"
                          onChange={(event) => setRectoriaDraft((currentDraft) => ({ ...currentDraft, password: event.target.value }))}
                          placeholder={rectoriaUser ? 'Dejar vacío para mantener la actual' : ''}
                          type="password"
                          value={rectoriaDraft.password}
                        />
                      </label>
                      <label>
                        {rectoriaUser ? 'Confirmar nueva contraseña' : 'Confirmar contraseña'}
                        <input
                          autoComplete="new-password"
                          onChange={(event) => setRectoriaDraft((currentDraft) => ({ ...currentDraft, confirmPassword: event.target.value }))}
                          placeholder={rectoriaUser ? 'Solo si cambia la contraseña' : ''}
                          type="password"
                          value={rectoriaDraft.confirmPassword}
                        />
                      </label>
                    </div>

                    <div className="super-admin-rectoria-actions" style={{ marginTop: 12 }}>
                      <button className="sa-btn is-secondary" disabled={loadingRectoria || savingRectoria} onClick={generatePassword} type="button">
                        Generar contraseña
                      </button>
                      <button className="sa-btn" disabled={loadingRectoria || savingRectoria} onClick={saveRectoriaUser} type="button">
                        {savingRectoria
                          ? 'Guardando...'
                          : rectoriaUser
                            ? 'Actualizar usuario de rectoría'
                            : 'Crear usuario de rectoría'}
                      </button>
                    </div>
                  </section>

                  <footer className="sa-detail-footer">
                    <div>
                      <strong>{formatNumber(selectedSchool.activeStudents)} alumnos activos</strong>
                      <div className="sa-muted">{formatNumber(selectedSchool.parentUsers)} acudientes · {formatNumber(selectedSchool.staffUsers)} staff</div>
                    </div>
                    <div className="sa-actions">
                      <button
                        className="sa-btn is-danger"
                        disabled={deletingSchoolId === selectedSchool.schoolId || savingSchoolId === selectedSchool.schoolId || confirmingDelete}
                        onClick={deleteSelectedSchool}
                        type="button"
                      >
                        {deletingSchoolId === selectedSchool.schoolId ? 'Enviando correo...' : 'Solicitar eliminación'}
                      </button>
                      <button
                        className="sa-btn"
                        disabled={savingSchoolId === selectedSchool.schoolId || deletingSchoolId === selectedSchool.schoolId}
                        onClick={saveSelectedSchool}
                        type="button"
                      >
                        {savingSchoolId === selectedSchool.schoolId ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                    </div>
                  </footer>
                </section>
              ) : (
                <section className="sa-panel"><p className="sa-muted">Selecciona un colegio para ver y editar su información.</p></section>
              )}
            </div>
          ) : null}

          {activeSection === 'publications' ? (
            <section className="sa-panel">
              <div className="sa-panel__head">
                <div>
                  <h2>Comergio Informa</h2>
                  <p>Noticias con título, texto e imagen generados con OpenAI para previsualizar antes de publicar.</p>
                </div>
              </div>
              <InformaDraftsPanel />
              <InformaPanel />
            </section>
          ) : null}

          {activeSection === 'billing' ? (
            <>
              <section className="sa-panel" style={{ marginBottom: 12 }}>
                <div className="sa-panel__head">
                  <div>
                    <h2>Cobro por colegio</h2>
                    <p>Proyección mensual según alumnos activos y precio configurado.</p>
                  </div>
                  <strong>{formatCurrency(summary.totals?.projectedMonthlyBilling)}</strong>
                </div>
                <div className="sa-billing-grid">
                  {summary.schools.map((school) => (
                    <div className="sa-billing-row" key={`billing-${school.schoolId}`}>
                      <div>
                        <strong>{school.schoolName}</strong>
                        <small>{formatNumber(school.activeStudents)} alumnos · {formatCurrency(school.settings?.pricePerStudent || 0)} / alumno</small>
                      </div>
                      <strong>{formatCurrency(school.monthlyCharge)}</strong>
                      <button className="sa-btn is-secondary" type="button" onClick={() => openSchoolSection(school.schoolId)}>
                        Ver colegio
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              <SuperAdminDianPanel selectedDraft={selectedDraft} selectedSchool={selectedSchool} />
            </>
          ) : null}
        </div>
      </div>

      {rectoriaFeedback?.type === 'success' ? (
        <div
          className={`snack-save-toast admin-confirm-toast${rectoriaFeedbackFading ? ' is-fading' : ''}`}
          role="status"
          aria-live="polite"
        >
          <div className="snack-save-toast-icon" aria-hidden="true">✓</div>
          <div className="snack-save-toast-text">
            <h4>Usuario de rectoría</h4>
            <p>{rectoriaFeedback.message}</p>
          </div>
        </div>
      ) : null}

      {showCreateSchoolModal ? (
        <div className="super-admin-modal-overlay" onClick={closeCreateSchoolModal} role="presentation">
          <section
            aria-labelledby="super-admin-create-school-title"
            className="super-admin-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="super-admin-modal-head">
              <div>
                <span className="super-admin-kicker">Nuevo colegio</span>
                <h3 id="super-admin-create-school-title">Crear colegio</h3>
                <p>Se creará el espacio del colegio para configurar rectoría, costos y usuarios.</p>
              </div>
              <button aria-label="Cerrar" className="super-admin-modal-close" disabled={creatingSchool} onClick={closeCreateSchoolModal} type="button">×</button>
            </div>

            <div className="super-admin-form-grid">
              <label className="is-wide">
                Nombre del colegio
                <input
                  autoFocus
                  onChange={(event) => setCreateSchoolDraft((currentDraft) => ({ ...currentDraft, schoolName: event.target.value }))}
                  placeholder="Ej: Colegio Nuevo"
                  type="text"
                  value={createSchoolDraft.schoolName}
                />
              </label>
              <label>
                Estado comercial
                <select
                  onChange={(event) => setCreateSchoolDraft((currentDraft) => ({ ...currentDraft, subscriptionStatus: event.target.value }))}
                  value={createSchoolDraft.subscriptionStatus}
                >
                  {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                Precio mensual por alumno
                <input
                  min="0"
                  onChange={(event) => setCreateSchoolDraft((currentDraft) => ({ ...currentDraft, pricePerStudent: event.target.value }))}
                  step="1000"
                  type="number"
                  value={createSchoolDraft.pricePerStudent}
                />
              </label>
            </div>

            <footer className="super-admin-modal-actions">
              <button className="is-secondary" disabled={creatingSchool} onClick={closeCreateSchoolModal} type="button">Cancelar</button>
              <button disabled={creatingSchool} onClick={createSchool} type="button">
                {creatingSchool ? 'Creando...' : 'Crear colegio'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default SuperAdminPortal;
