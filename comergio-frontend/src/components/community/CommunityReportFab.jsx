import { useMemo, useState } from 'react';
import { createCommunityReport } from '../../services/communityReport.service';

const reportTypeOptions = [
  { value: 'bullying', label: 'Reportar bullying', hint: 'Situaciones de acoso o intimidación.' },
  { value: 'depression', label: 'Reportar depresión', hint: 'Tristeza persistente, desánimo o preocupación por el bienestar emocional.' },
  { value: 'teacher_complaint', label: 'Reportar docente', hint: 'Conducta inapropiada o preocupación con un docente.' },
  { value: 'school_recommendation', label: 'Recomendación', hint: 'Sugerencia para mejorar la experiencia escolar.' },
];

const emptyForm = {
  reportType: 'bullying',
  message: '',
  teacherName: '',
  isAnonymous: false,
};

function CommunityReportHeartIcon() {
  return (
    <svg aria-hidden="true" className="campus-parent-mobile__community-report-fab-icon" viewBox="0 0 24 24">
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function ParentFeedBottomSheet({ children, onClose, title }) {
  return (
    <div className="campus-parent-mobile__sheet-layer" onClick={onClose} role="presentation">
      <section aria-modal="true" className="campus-parent-mobile__sheet campus-parent-mobile__sheet--community-report" onClick={(event) => event.stopPropagation()} role="dialog">
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

export default function CommunityReportFab({
  disabled = false,
  studentId = '',
  studentPortalMode = false,
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const selectedType = useMemo(
    () => reportTypeOptions.find((option) => option.value === form.reportType) || reportTypeOptions[0],
    [form.reportType],
  );

  const canSubmit = form.message.trim().length >= 10
    && (form.reportType !== 'teacher_complaint' || form.teacherName.trim())
    && !submitting;

  const resetAndClose = () => {
    setOpen(false);
    setForm(emptyForm);
    setNotice({ type: '', text: '' });
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setSubmitting(true);
    setNotice({ type: '', text: '' });

    try {
      const response = await createCommunityReport({
        reportType: form.reportType,
        message: form.message.trim(),
        teacherName: form.reportType === 'teacher_complaint' ? form.teacherName.trim() : '',
        isAnonymous: form.isAnonymous,
        studentId: studentId || undefined,
      });

      setNotice({ type: 'success', text: response.data?.message || 'Reporte enviado correctamente.' });
      setForm(emptyForm);
      window.setTimeout(() => {
        resetAndClose();
      }, 1200);
    } catch (error) {
      setNotice({
        type: 'error',
        text: error?.response?.data?.message || 'No se pudo enviar el reporte.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (disabled) {
    return null;
  }

  return (
    <>
      <button
        aria-label="Te escuchamos: enviar reporte"
        className="campus-parent-mobile__community-report-fab"
        onClick={() => {
          setOpen(true);
          setNotice({ type: '', text: '' });
        }}
        type="button"
      >
        <CommunityReportHeartIcon />
      </button>

      {open ? (
        <ParentFeedBottomSheet onClose={resetAndClose} title="Te escuchamos">
          <form className="campus-parent-mobile__community-report-form" onSubmit={onSubmit}>
            <p className="campus-parent-mobile__community-report-intro">
              {studentPortalMode
                ? 'Comparte una preocupación o recomendación para el colegio. Puedes enviarla con tu nombre o de forma anónima.'
                : 'Comparte una preocupación o recomendación para el colegio. Puedes enviarla con tu nombre o de forma anónima.'}
            </p>

            <div className="campus-parent-mobile__community-report-types" role="radiogroup" aria-label="Tipo de reporte">
              {reportTypeOptions.map((option) => (
                <label className={`campus-parent-mobile__community-report-type${form.reportType === option.value ? ' is-active' : ''}`} key={option.value}>
                  <input
                    checked={form.reportType === option.value}
                    name="community-report-type"
                    onChange={() => setForm((current) => ({ ...current, reportType: option.value }))}
                    type="radio"
                    value={option.value}
                  />
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </label>
              ))}
            </div>

            {form.reportType === 'teacher_complaint' ? (
              <label className="campus-parent-mobile__community-report-field">
                Nombre del docente
                <input
                  onChange={(event) => setForm((current) => ({ ...current, teacherName: event.target.value }))}
                  placeholder="Ej. Prof. García"
                  value={form.teacherName}
                />
              </label>
            ) : null}

            <label className="campus-parent-mobile__community-report-field">
              {selectedType.label}
              <textarea
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                placeholder="Describe lo ocurrido o tu recomendación con el mayor detalle posible."
                rows="5"
                value={form.message}
              />
            </label>

            <label className="campus-parent-mobile__community-report-anonymous">
              <input
                checked={form.isAnonymous}
                onChange={(event) => setForm((current) => ({ ...current, isAnonymous: event.target.checked }))}
                type="checkbox"
              />
              <span>
                <strong>Enviar de forma anónima</strong>
                <small>{form.isAnonymous ? 'Tu nombre no se mostrará al equipo institucional.' : 'Tu nombre aparecerá en el reporte para facilitar el seguimiento.'}</small>
              </span>
            </label>

            {notice.text ? (
              <p className={`campus-parent-mobile__community-report-notice is-${notice.type || 'info'}`}>{notice.text}</p>
            ) : null}

            <button className="campus-parent-mobile__community-report-submit" disabled={!canSubmit} type="submit">
              {submitting ? 'Enviando...' : 'Enviar reporte'}
            </button>
          </form>
        </ParentFeedBottomSheet>
      ) : null}
    </>
  );
}
