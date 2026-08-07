import { useMemo, useState } from 'react';
import teEscuchamosIcon from '../../assets/te-escuchamos-icon.png';
import { createCommunityReport } from '../../services/communityReport.service';
import TeEscuchamosLabel from './TeEscuchamosLabel';

const parentReportTypeOptions = [
  {
    value: 'school_recommendation',
    label: 'Recomendaciones y cuidado',
    hint: 'Un espacio seguro para aportar ideas o compartir lo que te preocupe del bienestar escolar.',
  },
];

const emptyForm = {
  reportType: 'school_recommendation',
  message: '',
  teacherName: '',
  isAnonymous: false,
};

const PARENT_MESSAGE_PLACEHOLDER = 'Puedes compartirnos con confianza lo que quieras cuidar: ideas para mejorar el colegio, una situación de convivencia que te preocupe, el ánimo o bienestar de tu hijo(a), o una experiencia con algún docente. Estamos para escucharte con respeto y acompañarte.';

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
    () => parentReportTypeOptions.find((option) => option.value === form.reportType) || parentReportTypeOptions[0],
    [form.reportType],
  );

  const canSubmit = form.message.trim().length >= 10 && !submitting;

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
        reportType: 'school_recommendation',
        message: form.message.trim(),
        teacherName: '',
        isAnonymous: form.isAnonymous,
        studentId: studentId || undefined,
      });

      setNotice({ type: 'success', text: response.data?.message || 'Mensaje enviado correctamente. Gracias por confiar en nosotros.' });
      setForm(emptyForm);
      window.setTimeout(() => {
        resetAndClose();
      }, 1200);
    } catch (error) {
      setNotice({
        type: 'error',
        text: error?.response?.data?.message || 'No se pudo enviar el mensaje.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (disabled || studentPortalMode) {
    return null;
  }

  return (
    <>
      <button
        aria-label="Te escuchamos: enviar mensaje"
        className="campus-parent-mobile__community-report-fab"
        onClick={() => {
          setOpen(true);
          setNotice({ type: '', text: '' });
        }}
        type="button"
      >
        <img alt="" aria-hidden="true" className="campus-parent-mobile__community-report-fab-icon" src={teEscuchamosIcon} />
      </button>

      {open ? (
        <ParentFeedBottomSheet onClose={resetAndClose} title={<TeEscuchamosLabel className="te-escuchamos-label--sheet" as="span" />}>
          <form className="campus-parent-mobile__community-report-form" onSubmit={onSubmit}>
            <p className="campus-parent-mobile__community-report-intro">
              Este es un canal de confianza para las familias. Tu mensaje nos ayuda a cuidar juntos el bienestar de la comunidad escolar.
            </p>

            <div className="campus-parent-mobile__community-report-types" role="radiogroup" aria-label="Tipo de mensaje">
              {parentReportTypeOptions.map((option) => (
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

            <label className="campus-parent-mobile__community-report-field">
              {selectedType.label}
              <textarea
                onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                placeholder={PARENT_MESSAGE_PLACEHOLDER}
                rows="6"
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
                <small>
                  {form.isAnonymous
                    ? 'Tu nombre no se mostrará al equipo institucional.'
                    : 'Tu nombre aparecerá en el mensaje para facilitar el acompañamiento.'}
                </small>
              </span>
            </label>

            {notice.text ? (
              <p className={`campus-parent-mobile__community-report-notice is-${notice.type || 'info'}`}>{notice.text}</p>
            ) : null}

            <button className="campus-parent-mobile__community-report-submit" disabled={!canSubmit} type="submit">
              {submitting ? 'Enviando...' : 'Enviar mensaje'}
            </button>
          </form>
        </ParentFeedBottomSheet>
      ) : null}
    </>
  );
}
