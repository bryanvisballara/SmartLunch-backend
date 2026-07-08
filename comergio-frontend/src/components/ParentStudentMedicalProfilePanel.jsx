import { useCallback, useEffect, useState } from 'react';
import {
  getParentStudentMedicalProfile,
  getParentStudentMedicalProfileHistory,
  updateParentStudentMedicalProfile,
} from '../services/parent.service';
import {
  createEmptyStudentMedicalProfileDraft,
  mapMedicalProfileToDraft,
} from '../lib/studentMedicalProfile';
import StudentMedicalProfileForm from './StudentMedicalProfileForm';
import StudentMedicalProfileHistory from './StudentMedicalProfileHistory';

function ParentStudentMedicalProfilePanel({ studentId = '', studentName = '' }) {
  const [bloodType, setBloodType] = useState('');
  const [medicalProfile, setMedicalProfile] = useState(createEmptyStudentMedicalProfileDraft());
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const loadMedicalProfile = useCallback(async () => {
    if (!studentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await getParentStudentMedicalProfile(studentId);
      const payload = response.data || {};
      setBloodType(payload.student?.bloodType || '');
      setMedicalProfile(mapMedicalProfileToDraft(payload.medicalProfile));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo cargar la ficha medica.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  const loadHistory = useCallback(async () => {
    if (!studentId) {
      return;
    }

    setHistoryLoading(true);

    try {
      const response = await getParentStudentMedicalProfileHistory(studentId);
      setRevisions(response.data?.revisions || []);
    } catch {
      setRevisions([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadMedicalProfile();
    loadHistory();
  }, [loadHistory, loadMedicalProfile]);

  const onMedicalProfileChange = (patch) => {
    setMedicalProfile((currentProfile) => ({ ...currentProfile, ...patch }));
  };

  const onMedicationAuthorizationChange = (patch) => {
    setMedicalProfile((currentProfile) => ({
      ...currentProfile,
      medicationAuthorization: {
        ...currentProfile.medicationAuthorization,
        ...patch,
      },
    }));
  };

  const onCancelEdit = () => {
    setEditing(false);
    setSuccess('');
    setError('');
    loadMedicalProfile();
  };

  const onSave = async () => {
    if (!studentId || saving) {
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await updateParentStudentMedicalProfile(studentId, {
        bloodType,
        medicalProfile,
      });
      const payload = response.data || {};
      setBloodType(payload.student?.bloodType || bloodType);
      setMedicalProfile(mapMedicalProfileToDraft(payload.medicalProfile));
      setEditing(false);
      setSuccess(payload.message || 'Ficha medica actualizada correctamente.');
      await loadHistory();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar la ficha medica.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="parent-student-medical-profile">
      <header className="parent-student-medical-profile__head">
        <div>
          <span className="campus-parent-mobile__nursing-kicker">Ficha medica</span>
          <h3>Informacion clinica de {studentName || 'tu hijo'}</h3>
          <p>La misma ficha de matricula. Enfermeria consulta estos datos para la atencion diaria.</p>
        </div>
        {!editing ? (
          <button className="parent-student-medical-profile__edit-btn" disabled={loading || !studentId} onClick={() => setEditing(true)} type="button">
            Editar ficha
          </button>
        ) : null}
      </header>

      {loading ? <p className="campus-parent-mobile__nursing-loading">Cargando ficha medica...</p> : null}
      {error ? <p className="parent-student-medical-profile__feedback is-error">{error}</p> : null}
      {!error && success ? <p className="parent-student-medical-profile__feedback">{success}</p> : null}

      {!loading ? (
        <>
          <StudentMedicalProfileForm
            bloodType={bloodType}
            disabled={!editing}
            medicalProfile={medicalProfile}
            onBloodTypeChange={setBloodType}
            onMedicalProfileChange={onMedicalProfileChange}
            onMedicationAuthorizationChange={onMedicationAuthorizationChange}
          />

          {editing ? (
            <div className="parent-student-medical-profile__actions">
              <button className="parent-student-medical-profile__save-btn" disabled={saving} onClick={onSave} type="button">
                {saving ? 'Guardando...' : 'Guardar ficha medica'}
              </button>
              <button className="parent-student-medical-profile__cancel-btn" disabled={saving} onClick={onCancelEdit} type="button">
                Cancelar
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      <section className="parent-student-medical-profile__history">
        <button
          aria-expanded={showHistory}
          className="parent-student-medical-profile__history-toggle"
          onClick={() => setShowHistory((currentValue) => !currentValue)}
          type="button"
        >
          <span>Historial de cambios</span>
          <strong>{revisions.length}</strong>
        </button>

        {showHistory ? (
          historyLoading ? (
            <p className="campus-parent-mobile__nursing-loading">Cargando historial...</p>
          ) : (
            <StudentMedicalProfileHistory revisions={revisions} />
          )
        ) : null}
      </section>
    </section>
  );
}

export default ParentStudentMedicalProfilePanel;
