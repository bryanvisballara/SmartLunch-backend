import { useCallback, useEffect, useState } from 'react';
import {
  getParentStudentMedicalProfile,
  getParentStudentMedicalProfileHistory,
  updateParentStudentMedicalProfile,
} from '../services/parent.service';
import {
  createEmptyStudentMedicalProfileDraft,
  formatMedicalProfileDateTime,
  mapMedicalProfileToDraft,
} from '../lib/studentMedicalProfile';
import { evaluateSignatureImage } from './enrollment-matricula/signatureValidation';
import SignaturePad, { compressSignatureDataUrl } from './signature/SignaturePad';
import StudentMedicalProfileForm from './StudentMedicalProfileForm';
import StudentMedicalProfileHistory from './StudentMedicalProfileHistory';

function ParentStudentMedicalProfilePanel({
  studentId = '',
  studentName = '',
  onSignedStatusChange,
}) {
  const [bloodType, setBloodType] = useState('');
  const [medicalProfile, setMedicalProfile] = useState(createEmptyStudentMedicalProfileDraft());
  const [savedSignatureImage, setSavedSignatureImage] = useState('');
  const [savedSignedAt, setSavedSignedAt] = useState(null);
  const [savedSignedByParentName, setSavedSignedByParentName] = useState('');
  const [draftSignatureImage, setDraftSignatureImage] = useState('');
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const isSigned = Boolean(savedSignedAt && savedSignatureImage);

  useEffect(() => {
    onSignedStatusChange?.({
      studentId: String(studentId || ''),
      signed: isSigned,
      loading,
    });
  }, [isSigned, loading, onSignedStatusChange, studentId]);

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
      const profile = payload.medicalProfile || {};
      setBloodType(payload.student?.bloodType || '');
      setMedicalProfile(mapMedicalProfileToDraft(profile));
      setSavedSignatureImage(profile.signatureImage || '');
      setSavedSignedAt(profile.signedAt || null);
      setSavedSignedByParentName(profile.signedByParentName || '');
      setDraftSignatureImage('');
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

  const onStartEdit = () => {
    setEditing(true);
    setDraftSignatureImage('');
    setSuccess('');
    setError('');
  };

  const onCancelEdit = () => {
    setEditing(false);
    setDraftSignatureImage('');
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
      const signatureCheck = await evaluateSignatureImage(draftSignatureImage);
      if (!signatureCheck.valid) {
        setError(signatureCheck.message || 'Dibuja tu firma antes de guardar la ficha.');
        setSaving(false);
        return;
      }

      const compressedSignature = await compressSignatureDataUrl(draftSignatureImage, {
        maxWidth: 1000,
        quality: 0.7,
        mimeType: 'image/jpeg',
      });

      const response = await updateParentStudentMedicalProfile(studentId, {
        bloodType,
        medicalProfile,
        signatureImage: compressedSignature,
      });
      const payload = response.data || {};
      const profile = payload.medicalProfile || {};
      setBloodType(payload.student?.bloodType || bloodType);
      setMedicalProfile(mapMedicalProfileToDraft(profile));
      setSavedSignatureImage(profile.signatureImage || compressedSignature);
      setSavedSignedAt(profile.signedAt || new Date().toISOString());
      setSavedSignedByParentName(profile.signedByParentName || '');
      setDraftSignatureImage('');
      setEditing(false);
      setSuccess(payload.message || 'Ficha medica actualizada y firmada correctamente.');
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
          <button className="parent-student-medical-profile__edit-btn" disabled={loading || !studentId} onClick={onStartEdit} type="button">
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
            <section className="parent-student-medical-profile__signature">
              <div className="parent-student-medical-profile__signature-head">
                <strong>Firma del acudiente</strong>
                <p>Firma en el recuadro para confirmar que la informacion clinica es correcta. Enfermeria vera esta firma.</p>
              </div>
              <SignaturePad disabled={saving} onChange={setDraftSignatureImage} />
            </section>
          ) : null}

          {!editing && savedSignatureImage ? (
            <section className="parent-student-medical-profile__signature is-saved">
              <div className="parent-student-medical-profile__signature-head">
                <strong>Firma registrada</strong>
                <p>
                  {savedSignedByParentName ? `Firmada por ${savedSignedByParentName}` : 'Firmada por el acudiente'}
                  {savedSignedAt ? ` · ${formatMedicalProfileDateTime(savedSignedAt)}` : ''}
                </p>
              </div>
              <img alt="Firma del acudiente" className="parent-student-medical-profile__signature-image" src={savedSignatureImage} />
            </section>
          ) : null}

          {!editing && !savedSignatureImage ? (
            <p className="parent-student-medical-profile__signature-empty">
              Esta ficha aun no tiene firma. Editala y firma para autorizar la informacion ante Enfermeria.
            </p>
          ) : null}

          {editing ? (
            <div className="parent-student-medical-profile__actions">
              <button className="parent-student-medical-profile__save-btn" disabled={saving} onClick={onSave} type="button">
                {saving ? 'Guardando...' : 'Guardar y firmar ficha'}
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
