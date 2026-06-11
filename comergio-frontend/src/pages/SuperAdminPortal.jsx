import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth.store';
import { deleteSuperAdminSchool, getSuperAdminSummary, updateSuperAdminSchoolSettings } from '../services/superAdmin.service';

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

function buildDraftFromSchool(school = {}) {
  return {
    subscriptionStatus: school.settings?.subscriptionStatus || 'subscribed',
    pricePerStudent: String(Number(school.settings?.pricePerStudent || 0)),
    notes: school.settings?.notes || '',
    parentFeatures: getDefaultFeatures(school.settings?.parentFeatures || {}),
  };
}

function SuperAdminPortal() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [summary, setSummary] = useState({ totals: {}, schools: [] });
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [draftsBySchool, setDraftsBySchool] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingSchoolId, setSavingSchoolId] = useState('');
  const [deletingSchoolId, setDeletingSchoolId] = useState('');
  const [message, setMessage] = useState('');

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

  const updateDraft = (schoolId, updater) => {
    setDraftsBySchool((currentDrafts) => {
      const currentDraft = currentDrafts[schoolId] || buildDraftFromSchool(summary.schools.find((school) => school.schoolId === schoolId));
      const nextDraft = typeof updater === 'function' ? updater(currentDraft) : { ...currentDraft, ...updater };
      return { ...currentDrafts, [schoolId]: nextDraft };
    });
  };

  const saveSelectedSchool = async () => {
    if (!selectedSchool || !selectedDraft) {
      return;
    }

    setSavingSchoolId(selectedSchool.schoolId);
    setMessage('');
    try {
      const response = await updateSuperAdminSchoolSettings(selectedSchool.schoolId, {
        ...selectedDraft,
        pricePerStudent: Number(selectedDraft.pricePerStudent || 0),
      });
      const updatedSchool = response.data?.school;
      if (updatedSchool) {
        setSummary((currentSummary) => ({
          ...currentSummary,
          schools: currentSummary.schools.map((school) => (school.schoolId === updatedSchool.schoolId ? updatedSchool : school)),
          totals: {
            ...currentSummary.totals,
            subscribedSchools: currentSummary.schools.map((school) => (school.schoolId === updatedSchool.schoolId ? updatedSchool : school)).filter((school) => school.settings?.subscriptionStatus === 'subscribed').length,
            activeStudents: currentSummary.schools.map((school) => (school.schoolId === updatedSchool.schoolId ? updatedSchool : school)).reduce((sum, school) => sum + Number(school.activeStudents || 0), 0),
            projectedMonthlyBilling: currentSummary.schools.map((school) => (school.schoolId === updatedSchool.schoolId ? updatedSchool : school)).reduce((sum, school) => sum + Number(school.monthlyCharge || 0), 0),
          },
        }));
        setDraftsBySchool((currentDrafts) => ({ ...currentDrafts, [updatedSchool.schoolId]: buildDraftFromSchool(updatedSchool) }));
      }
      setMessage('Configuración guardada.');
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'No se pudo guardar.');
    } finally {
      setSavingSchoolId('');
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
      `${dataWarning}¿Eliminar permanentemente "${selectedSchool.schoolName}" (${selectedSchool.schoolId})? Se borrarán usuarios, alumnos, configuración y todos los datos asociados. Esta acción no se puede deshacer.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingSchoolId(selectedSchool.schoolId);
    setMessage('');
    try {
      await deleteSuperAdminSchool(selectedSchool.schoolId);
      setSummary((currentSummary) => {
        const nextSchools = currentSummary.schools.filter((school) => school.schoolId !== selectedSchool.schoolId);
        return {
          schools: nextSchools,
          totals: nextSchools.reduce((accumulator, school) => {
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
          }),
        };
      });
      setDraftsBySchool((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[selectedSchool.schoolId];
        return nextDrafts;
      });
      setSelectedSchoolId((currentSchoolId) => (
        currentSchoolId === selectedSchool.schoolId ? '' : currentSchoolId
      ));
      setMessage('Colegio eliminado.');
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'No se pudo eliminar el colegio.');
    } finally {
      setDeletingSchoolId('');
    }
  };

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <section className="super-admin-page">
      <header className="super-admin-header">
        <div>
          <span className="super-admin-kicker">Gerencia Comergio</span>
          <h1>Administrador supremo</h1>
          <p>{user?.name || user?.username || 'Gerencia'}</p>
        </div>
        <button className="super-admin-logout" onClick={onLogout} type="button">Cerrar sesión</button>
      </header>

      {message ? <p className="super-admin-message">{message}</p> : null}

      <section className="super-admin-kpis" aria-label="Resumen general">
        <article><span>Colegios suscritos</span><strong>{formatNumber(summary.totals?.subscribedSchools)}</strong><p>{formatNumber(summary.totals?.totalSchools)} colegios totales</p></article>
        <article><span>Alumnos matriculados</span><strong>{formatNumber(summary.totals?.activeStudents)}</strong><p>Activos en todos los colegios</p></article>
        <article><span>Acudientes activos</span><strong>{formatNumber(summary.totals?.parentUsers)}</strong><p>Usuarios padre registrados</p></article>
        <article><span>Cobro mensual proyectado</span><strong>{formatCurrency(summary.totals?.projectedMonthlyBilling)}</strong><p>Según precio por alumno</p></article>
      </section>

      <div className="super-admin-layout">
        <aside className="super-admin-school-list" aria-label="Colegios">
          <div className="super-admin-panel-head">
            <h2>Colegios</h2>
            <button onClick={loadSummary} type="button">Actualizar</button>
          </div>
          {loading ? <p className="super-admin-muted">Cargando colegios...</p> : null}
          {summary.schools.map((school) => (
            <button
              className={`super-admin-school-item${selectedSchool?.schoolId === school.schoolId ? ' is-active' : ''}`}
              key={school.schoolId}
              onClick={() => setSelectedSchoolId(school.schoolId)}
              type="button"
            >
              <span>
                <strong>{school.schoolName}</strong>
                <small>{school.schoolId}</small>
              </span>
              <b>{formatNumber(school.activeStudents)}</b>
            </button>
          ))}
        </aside>

        {selectedSchool && selectedDraft ? (
          <section className="super-admin-detail">
            <div className="super-admin-detail-title">
              <div>
                <span className="super-admin-kicker">Colegio seleccionado</span>
                <h2>{selectedSchool.schoolName}</h2>
                <p>{selectedSchool.schoolId}</p>
              </div>
              <div className="super-admin-charge-box">
                <span>Cobro estimado</span>
                <strong>{formatCurrency(Number(selectedDraft.pricePerStudent || 0) * Number(selectedSchool.activeStudents || 0))}</strong>
              </div>
            </div>

            <div className="super-admin-form-grid">
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

            <section className="super-admin-feature-panel">
              <div className="super-admin-panel-head">
                <div>
                  <h3>Opciones visibles en la app de padres</h3>
                  <p>Al desactivar una opción, desaparece de la barra inferior de los papás de este colegio.</p>
                </div>
              </div>
              <div className="super-admin-feature-grid">
                {featureOptions.map((feature) => (
                  <label className="super-admin-toggle" key={feature.key}>
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

            <footer className="super-admin-detail-actions">
              <div>
                <strong>{formatNumber(selectedSchool.activeStudents)} alumnos activos</strong>
                <span>{formatNumber(selectedSchool.parentUsers)} acudientes activos</span>
              </div>
              <div className="super-admin-detail-action-buttons">
                <button
                  className="super-admin-delete-button"
                  disabled={deletingSchoolId === selectedSchool.schoolId || savingSchoolId === selectedSchool.schoolId}
                  onClick={deleteSelectedSchool}
                  type="button"
                >
                  {deletingSchoolId === selectedSchool.schoolId ? 'Eliminando...' : 'Eliminar colegio'}
                </button>
                <button disabled={savingSchoolId === selectedSchool.schoolId || deletingSchoolId === selectedSchool.schoolId} onClick={saveSelectedSchool} type="button">
                  {savingSchoolId === selectedSchool.schoolId ? 'Guardando...' : 'Guardar colegio'}
                </button>
              </div>
            </footer>
          </section>
        ) : (
          <section className="super-admin-detail"><p className="super-admin-muted">No hay colegios disponibles.</p></section>
        )}
      </div>
    </section>
  );
}

export default SuperAdminPortal;