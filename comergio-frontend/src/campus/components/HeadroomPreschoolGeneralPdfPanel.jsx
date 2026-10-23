import { useState } from 'react';
import { openPreschoolBulletinStudentPdf } from '../../lib/preschoolBulletinPdf';
import { publishCampusTeacherPreschoolHeadroomReportCard } from '../services/campus.service';

export default function HeadroomPreschoolGeneralPdfPanel({
  bulletin,
  signatureDataUrl = '',
  signerName = '',
  coordinatorSignatureDataUrl = '',
  coordinatorSignerName = '',
  schoolId = '',
  schoolName = '',
  sourceCourseKey = '',
  academicPeriodKey = '',
  canPublishToParents = false,
  isPublished = false,
  publishHint = '',
  onNotice,
  onPublished,
}) {
  const [studentId, setStudentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

  const students = bulletin?.students || [];
  const selectedStudent = students.find((student) => student.id === studentId) || null;

  const onGenerate = async () => {
    if (!selectedStudent) {
      onNotice?.({ type: 'error', text: 'Selecciona un estudiante para generar el boletín general en PDF.' });
      return;
    }
    setBusy(true);
    try {
      await openPreschoolBulletinStudentPdf({
        bulletin,
        student: selectedStudent,
        coordinatorSignatureDataUrl,
        coordinatorSignerName,
        headroomSignatureDataUrl: signatureDataUrl,
        headroomSignerName: signerName,
        schoolId,
        schoolName,
      });
    } catch (error) {
      onNotice?.({
        type: 'error',
        text: error?.message || 'No se pudo generar el PDF del boletín general.',
      });
    } finally {
      setBusy(false);
    }
  };

  const onPublishToParents = async () => {
    if (!sourceCourseKey || !academicPeriodKey) {
      onNotice?.({ type: 'error', text: 'Selecciona el curso y el periodo del boletín general.' });
      return;
    }
    if (!signatureDataUrl) {
      onNotice?.({ type: 'error', text: 'Guarda tu firma como director de grupo antes de subir el boletín a padres.' });
      return;
    }
    if (!canPublishToParents) {
      onNotice?.({
        type: 'error',
        text: publishHint || 'Todavía faltan materias o dimensiones por enviar antes de publicar a padres.',
      });
      return;
    }
    setPublishBusy(true);
    try {
      const response = await publishCampusTeacherPreschoolHeadroomReportCard({
        sourceCourseKey,
        academicPeriodKey,
        headroomSignatureDataUrl: signatureDataUrl,
      });
      onNotice?.({
        type: 'success',
        text: response?.message || 'Boletín general publicado. Las familias lo verán en Academia si la cartera está al día.',
      });
      await onPublished?.();
    } catch (error) {
      onNotice?.({
        type: 'error',
        text: error?.response?.data?.message || 'No se pudo subir el boletín general a padres.',
      });
    } finally {
      setPublishBusy(false);
    }
  };

  if (!students.length) {
    return null;
  }

  return (
    <div className="campus-teacher__report-card-general-pdf">
      <h3 className="campus-teacher__report-card-section-title">Boletín general por estudiante</h3>
      <p className="campus-panel__meta">
        PDF consolidado con todas las dimensiones e indicadores calificados por los docentes del curso.
        Incluye la firma del director de grupo si ya la guardaste.
      </p>
      <label>
        Estudiante
        <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
          <option value="">Selecciona un estudiante</option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>{student.name}</option>
          ))}
        </select>
      </label>
      <div className="campus-preschool-grade__actions campus-preschool-grade__actions--split campus-teacher__report-card-general-pdf__actions">
        <button
          className="campus-teacher__ghost-btn"
          disabled={busy || publishBusy || !selectedStudent}
          onClick={onGenerate}
          type="button"
        >
          {busy ? 'Generando PDF…' : 'Generar PDF boletín general'}
        </button>
        <button
          className="campus-teacher__action-btn"
          disabled={publishBusy || busy || isPublished || !canPublishToParents}
          onClick={onPublishToParents}
          type="button"
        >
          {isPublished
            ? 'Boletín general publicado a padres'
            : (publishBusy ? 'Publicando…' : 'Subir boletines generales a padres')}
        </button>
      </div>
      {isPublished ? (
        <p className="campus-panel__meta">Este periodo ya está visible para familias con cartera al día.</p>
      ) : publishHint && !canPublishToParents ? (
        <p className="campus-panel__meta">{publishHint}</p>
      ) : null}
    </div>
  );
}
