import { useState } from 'react';
import { openHeadroomGeneralReportCardPdf } from '../../lib/headroomGeneralReportCardPdf';

export default function HeadroomGeneralPdfPanel({
  students = [],
  sectionLabel = '',
  gradeLabel = '',
  gradingScale = null,
  periodName = '',
  schoolId = '',
  schoolName = '',
  signatureDataUrl = '',
  signerName = '',
  coordinatorSignatureDataUrl = '',
  coordinatorSignerName = '',
  headroomTeacherName = '',
  resolveStudentBulletin,
  canPublishToParents = false,
  isPublished = false,
  publishHint = '',
  onPublishToParents,
  onNotice,
}) {
  const [studentId, setStudentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

  const selectedStudent = students.find((student) => String(student.studentId) === String(studentId)) || null;

  const onGenerate = async () => {
    if (!selectedStudent) {
      onNotice?.({ type: 'error', text: 'Selecciona un estudiante para generar el boletín general en PDF.' });
      return;
    }
    setBusy(true);
    try {
      const bulletin = resolveStudentBulletin?.(selectedStudent) || { subjectLines: selectedStudent.subjectLines || [] };
      await openHeadroomGeneralReportCardPdf({
        schoolId,
        schoolName,
        student: {
          name: selectedStudent.studentName,
          schoolCode: selectedStudent.schoolCode || '',
        },
        gradeLabel,
        sectionLabel,
        gradingScale,
        bulletin: {
          ...bulletin,
          periodName: bulletin.periodName || periodName,
          headroomSignatureDataUrl: signatureDataUrl,
          headroomSignerName: signerName,
          headroomTeacherName,
          coordinatorSignatureDataUrl,
          coordinatorSignerName,
        },
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

  const onPublish = async () => {
    if (!canPublishToParents) {
      onNotice?.({
        type: 'error',
        text: publishHint || 'Todavía faltan materias por enviar antes de publicar a padres.',
      });
      return;
    }
    setPublishBusy(true);
    try {
      await onPublishToParents?.();
    } finally {
      setPublishBusy(false);
    }
  };

  if (!students.length) {
    return (
      <p className="campus-panel__meta">
        Cuando al menos una materia envíe su boletín, podrás generar el PDF por estudiante aquí.
      </p>
    );
  }

  return (
    <div className="campus-teacher__report-card-general-pdf">
      <h3 className="campus-teacher__report-card-section-title">Boletín general por estudiante</h3>
      <p className="campus-panel__meta">
        PDF consolidado con las materias ya enviadas al director de grupo, promedio, observaciones y convivencia.
        Incluye tu firma si ya la guardaste.
      </p>
      <label>
        Estudiante
        <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
          <option value="">Selecciona un estudiante</option>
          {students.map((student) => (
            <option key={student.studentId} value={student.studentId}>{student.studentName}</option>
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
          onClick={onPublish}
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
