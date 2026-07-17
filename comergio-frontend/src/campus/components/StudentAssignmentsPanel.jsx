import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveApiAssetUrl } from '../../lib/api';
import {
  getStudentAssignments,
  getStudentAssignmentDetail,
  submitStudentAssignment,
} from '../../services/studentPortal.service';
import './StudentAssignmentsPanel.css';

function formatAssignmentDate(value) {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
  return parsed.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function createEmptyLinkDraft() {
  return { title: '', url: '' };
}

function getAssignmentState(assignment = {}) {
  if (assignment.hasSubmission) {
    return { key: 'done', label: 'Entregada' };
  }
  if (assignment.allowStudentSubmission) {
    return { key: 'open', label: 'Pendiente' };
  }
  return { key: 'read', label: 'Material' };
}

function getAttachmentKind(attachment = {}) {
  const value = String(attachment.fileName || attachment.title || attachment.url || '').toLowerCase();
  if (value.endsWith('.pdf')) return 'PDF';
  if (/\.(png|jpe?g|webp|gif)$/.test(value)) return 'IMG';
  if (/\.(mp4|mov|webm)$/.test(value)) return 'VIDEO';
  if (/\.(docx?|pptx?|xlsx?)$/.test(value)) return 'DOC';
  return 'ARCHIVO';
}

function AssignmentsHeroIllustration() {
  return (
    <svg aria-hidden="true" className="student-assignments-panel__illustration" viewBox="0 0 220 170">
      <defs>
        <linearGradient id="assignmentBag" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#2f7ff5" />
          <stop offset="1" stopColor="#0646ad" />
        </linearGradient>
        <linearGradient id="assignmentPocket" x1="0" x2="1">
          <stop offset="0" stopColor="#236de1" />
          <stop offset="1" stopColor="#0b4cae" />
        </linearGradient>
        <filter id="assignmentShadow" height="150%" width="150%" x="-25%" y="-20%">
          <feDropShadow dx="0" dy="9" floodColor="#1d4ed8" floodOpacity=".2" stdDeviation="8" />
        </filter>
      </defs>
      <ellipse cx="126" cy="149" fill="#2563eb" opacity=".11" rx="80" ry="13" />
      <g transform="translate(12 98) rotate(-7)">
        <rect width="86" height="17" x="0" y="28" rx="5" fill="#66d2c5" />
        <rect width="91" height="16" x="4" y="14" rx="5" fill="#fff" stroke="#b8d5ef" strokeWidth="2" />
        <rect width="80" height="16" x="1" y="0" rx="5" fill="#7ccfc4" />
        <path d="M12 6h55" stroke="#fff" strokeLinecap="round" strokeWidth="2" />
      </g>
      <g filter="url(#assignmentShadow)" transform="translate(86 11)">
        <path d="M37 27V17c0-10 8-17 18-17s18 7 18 17v10" fill="none" stroke="#164d9d" strokeWidth="9" />
        <path d="M19 29c0-11 9-20 20-20h33c17 0 31 14 31 31v90H10V38c0-5 4-9 9-9Z" fill="url(#assignmentBag)" />
        <path d="M10 53C4 58 0 68 0 82v47h14V48c0 0-1 2-4 5ZM103 48c9 10 12 21 12 38v43h-14Z" fill="#0a449a" />
        <rect width="79" height="48" x="18" y="76" rx="14" fill="url(#assignmentPocket)" />
        <path d="M18 88h79" fill="none" stroke="#5da2ff" strokeWidth="3" />
        <circle cx="57" cy="53" r="17" fill="#fff" opacity=".14" />
        <path d="m48 54 6 6 13-15" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      </g>
      <g transform="translate(194 64)">
        <path d="M4 0v58" stroke="#f59e0b" strokeWidth="7" />
        <path d="M13 8v50" stroke="#ec4899" strokeWidth="7" />
        <path d="M22 3v55" stroke="#38bdf8" strokeWidth="7" />
        <path d="M-2 55h31l-4 32H2Z" fill="#164d9d" />
      </g>
    </svg>
  );
}

function AssignmentDetailIllustration() {
  return (
    <svg aria-hidden="true" className="student-assignments-detail__illustration" viewBox="0 0 240 180">
      <defs>
        <linearGradient id="detailPaper" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#e8edf5" />
        </linearGradient>
        <linearGradient id="detailPencil" x1="0" x2="1">
          <stop offset="0" stopColor="#ffd65a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <filter id="detailShadow" height="150%" width="150%" x="-25%" y="-20%">
          <feDropShadow dx="0" dy="9" floodColor="#062d82" floodOpacity=".28" stdDeviation="7" />
        </filter>
      </defs>
      <g fill="#8eb8ff" opacity=".45">
        <ellipse cx="30" cy="112" rx="13" ry="35" transform="rotate(-38 30 112)" />
        <ellipse cx="51" cy="88" rx="11" ry="31" transform="rotate(-17 51 88)" />
        <ellipse cx="206" cy="77" rx="12" ry="33" transform="rotate(33 206 77)" />
      </g>
      <g filter="url(#detailShadow)" transform="translate(60 15) rotate(-7 62 75)">
        <rect width="104" height="142" x="12" y="5" rx="9" fill="url(#detailPaper)" />
        <path d="M35 32h58M35 50h58M35 68h58M35 86h58M35 104h44" stroke="#d7e0eb" strokeLinecap="round" strokeWidth="3" />
        <path d="M17 16H8M17 34H8M17 52H8M17 70H8M17 88H8M17 106H8M17 124H8" stroke="#17396f" strokeLinecap="round" strokeWidth="5" />
        <g transform="translate(78 24) rotate(20)">
          <path d="M0 0h14v96H0Z" fill="url(#detailPencil)" />
          <path d="m0 96 7 14 7-14Z" fill="#f4c28f" />
          <path d="m5 106 2 4 2-4Z" fill="#1f2937" />
          <path d="M0 0h14v12H0Z" fill="#ef6461" />
        </g>
      </g>
      <g transform="translate(174 70)">
        <path d="M0 34h50l-6 70H7Z" fill="#103a87" />
        <path d="M12 0v42M28 8v34M43 2v40" strokeLinecap="round" strokeWidth="8" />
        <path d="M12 0v42" stroke="#38bdf8" strokeLinecap="round" strokeWidth="8" />
        <path d="M28 8v34" stroke="#1e293b" strokeLinecap="round" strokeWidth="8" />
        <path d="M43 2v40" stroke="#7c3aed" strokeLinecap="round" strokeWidth="8" />
      </g>
    </svg>
  );
}

export default function StudentAssignmentsPanel({
  initialAssignmentId = '',
  onClearInitialAssignment = null,
}) {
  const fileInputRef = useRef(null);
  const assignmentsListRef = useRef(null);
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(String(initialAssignmentId || ''));
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [submitNote, setSubmitNote] = useState('');
  const [submitLinks, setSubmitLinks] = useState([createEmptyLinkDraft()]);
  const [submitFiles, setSubmitFiles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError('');

    getStudentAssignments()
      .then((response) => {
        if (cancelled) return;
        const items = response?.data?.assignments || response?.assignments || [];
        setAssignments(Array.isArray(items) ? items : []);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(requestError?.response?.data?.message || requestError?.message || 'No se pudieron cargar las asignaciones.');
        setAssignments([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialAssignmentId) {
      setSelectedId(String(initialAssignmentId));
    }
  }, [initialAssignmentId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }

    let cancelled = false;
    setDetailLoading(true);
    setNotice({ type: '', text: '' });

    getStudentAssignmentDetail(selectedId)
      .then((response) => {
        if (cancelled) return;
        const assignment = response?.data?.assignment || response?.assignment || null;
        setDetail(assignment);
        setSubmitNote('');
        setSubmitLinks([createEmptyLinkDraft()]);
        setSubmitFiles([]);
        setInstructionsExpanded(false);
      })
      .catch((requestError) => {
        if (cancelled) return;
        setDetail(null);
        setNotice({
          type: 'error',
          text: requestError?.response?.data?.message || requestError?.message || 'No se pudo abrir la asignación.',
        });
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const sortedAssignments = useMemo(() => {
    return [...assignments].sort((left, right) => {
      const leftTime = new Date(left.date || left.dueAt || left.scheduledClassDate || 0).getTime();
      const rightTime = new Date(right.date || right.dueAt || right.scheduledClassDate || 0).getTime();
      return leftTime - rightTime;
    });
  }, [assignments]);

  const assignmentCounts = useMemo(() => ({
    all: sortedAssignments.length,
    open: sortedAssignments.filter((item) => getAssignmentState(item).key === 'open').length,
    done: sortedAssignments.filter((item) => getAssignmentState(item).key === 'done').length,
  }), [sortedAssignments]);

  const visibleAssignments = useMemo(() => {
    if (activeFilter === 'all') return sortedAssignments;
    return sortedAssignments.filter((item) => getAssignmentState(item).key === activeFilter);
  }, [activeFilter, sortedAssignments]);

  const onPickFiles = (event) => {
    const nextFiles = Array.from(event.target.files || []);
    setSubmitFiles((current) => [...current, ...nextFiles].slice(0, 6));
    if (event.target) event.target.value = '';
  };

  const onSubmitAssignment = async (event) => {
    event.preventDefault();
    if (!selectedId || !detail?.allowStudentSubmission) return;

    const normalizedLinks = submitLinks
      .map((item) => ({ title: String(item.title || '').trim(), url: String(item.url || '').trim() }))
      .filter((item) => item.url);

    if (!submitFiles.length && !normalizedLinks.length && !String(submitNote || '').trim()) {
      setNotice({ type: 'error', text: 'Agrega un archivo, un enlace o una nota para entregar.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append('note', String(submitNote || '').trim());
      formData.append('materialLinks', JSON.stringify(normalizedLinks));
      submitFiles.forEach((file) => formData.append('files', file));

      const response = await submitStudentAssignment(selectedId, formData);
      const submission = response?.data?.submission || response?.submission || null;
      setDetail((current) => (current ? {
        ...current,
        submission,
        hasSubmission: Boolean(submission),
      } : current));
      setAssignments((current) => current.map((item) => (
        String(item.id) === String(selectedId)
          ? { ...item, submission, hasSubmission: Boolean(submission) }
          : item
      )));
      setSubmitNote('');
      setSubmitLinks([createEmptyLinkDraft()]);
      setSubmitFiles([]);
      setNotice({ type: 'success', text: 'Entrega enviada correctamente.' });
    } catch (requestError) {
      setNotice({
        type: 'error',
        text: requestError?.response?.data?.message || requestError?.message || 'No se pudo enviar la entrega.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedId) {
    const detailState = getAssignmentState(detail || {});
    const detailStatus = detail?.hasSubmission
      ? { key: 'done', label: 'Entregada' }
      : { key: 'open', label: 'Pendiente' };
    return (
      <section className="student-assignments-panel is-detail">
        <header className="student-assignments-panel__toolbar">
          <button
            className="student-assignments-panel__back"
            onClick={() => {
              setSelectedId('');
              setDetail(null);
              if (typeof onClearInitialAssignment === 'function') {
                onClearInitialAssignment();
              }
            }}
            type="button"
          >
            <span aria-hidden="true">←</span>
            <span>Asignaciones</span>
          </button>
        </header>

        {detailLoading ? <p className="student-assignments-panel__status">Cargando asignación...</p> : null}
        {notice.text ? (
          <div className={`student-assignments-panel__notice is-${notice.type || 'info'}`}>{notice.text}</div>
        ) : null}

        {detail ? (
          <article className="student-assignments-detail">
            <div className="student-assignments-detail__head">
              <div className="student-assignments-detail__hero-copy">
                <span className="student-assignments-detail__subject">
                  {detail.subject || detail.courseTitle || 'Curso'}
                </span>
                <h2>{detail.title || 'Sin título'}</h2>
                <div className="student-assignments-detail__meta">
                  <span>
                    <b aria-hidden="true">▣</b>
                    {formatAssignmentDate(detail.date || detail.dueAt || detail.scheduledClassDate)}
                  </span>
                  <i aria-hidden="true" />
                  <span>
                    <b aria-hidden="true">◇</b>
                    {detail.type || detailState.label || 'Asignación'}
                  </span>
                </div>
                <small className={`student-assignments-detail__status is-${detailStatus.key}`}>
                  <i aria-hidden="true" />
                  {detailStatus.label}
                </small>
              </div>
              <AssignmentDetailIllustration />
            </div>

            <section className="student-assignments-detail__section">
              <div className="student-assignments-detail__section-title">
                <span aria-hidden="true">▤</span>
                <h3>Instrucciones</h3>
              </div>
              <p className={instructionsExpanded ? 'is-expanded' : 'is-collapsed'}>
                {detail.body || detail.detail || 'Esta asignación no tiene instrucciones adicionales.'}
              </p>
              <button
                className="student-assignments-detail__expand"
                onClick={() => setInstructionsExpanded((current) => !current)}
                type="button"
              >
                {instructionsExpanded ? 'Ver menos' : 'Ver más detalles'}
                <span aria-hidden="true">{instructionsExpanded ? '⌃' : '⌄'}</span>
              </button>
            </section>

            <section className="student-assignments-detail__section">
              <div className="student-assignments-detail__section-title">
                <span aria-hidden="true">□</span>
                <h3>Material del docente</h3>
              </div>
              {(detail.attachments || []).length ? (
                <div className="student-assignments-attachments">
                  {(detail.attachments || []).map((attachment, index) => {
                    const href = resolveApiAssetUrl(attachment.url);
                    const label = attachment.title || attachment.fileName || `Adjunto ${index + 1}`;
                    if (!href) {
                      return <div className="student-assignments-attachments__item is-disabled" key={`${label}-${index}`}>{label}</div>;
                    }
                    return (
                      <a href={href} key={`${href}-${index}`} rel="noreferrer" target="_blank">
                        <span className={`student-assignments-attachments__icon is-${getAttachmentKind(attachment).toLowerCase()}`}>
                          {getAttachmentKind(attachment)}
                        </span>
                        <span className="student-assignments-attachments__copy">
                          <strong>{label}</strong>
                          <small>{getAttachmentKind(attachment)} · Abrir o descargar</small>
                        </span>
                        <span className="student-assignments-attachments__download" aria-hidden="true">⇩</span>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <p className="student-assignments-panel__status">Sin archivos adjuntos.</p>
              )}
            </section>

            {detail.hasSubmission && detail.submission ? (
              <section className="student-assignments-submission is-done">
                <h3>Tu entrega</h3>
                <p>Enviada el {formatAssignmentDate(detail.submission.submittedAt)}</p>
                {detail.submission.note ? <p>{detail.submission.note}</p> : null}
                {(detail.submission.attachments || []).length ? (
                  <div className="student-assignments-attachments">
                    {(detail.submission.attachments || []).map((attachment, index) => {
                      const href = resolveApiAssetUrl(attachment.url);
                      const label = attachment.title || attachment.fileName || `Entrega ${index + 1}`;
                      if (!href) {
                        return <div className="student-assignments-attachments__item is-disabled" key={`${label}-${index}`}>{label}</div>;
                      }
                      return (
                        <a href={href} key={`${href}-${index}`} rel="noreferrer" target="_blank">
                          {label}
                        </a>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            ) : null}

            {detail.allowStudentSubmission ? (
              <form className="student-assignments-submit" onSubmit={onSubmitAssignment}>
                <div className="student-assignments-detail__section-title">
                  <span aria-hidden="true">↑</span>
                  <div>
                    <h3>{detail.hasSubmission ? 'Reemplazar entrega' : 'Entregar tarea'}</h3>
                    <p>Puedes subir documentos, imágenes, videos o enlaces.</p>
                  </div>
                </div>
                <label>
                  Nota (opcional)
                  <textarea
                    onChange={(event) => setSubmitNote(event.target.value)}
                    placeholder="Escribe un comentario para tu docente..."
                    rows={4}
                    value={submitNote}
                  />
                </label>
                <div className="student-assignments-submit__files">
                  <button onClick={() => fileInputRef.current?.click()} type="button">
                    Adjuntar archivos
                  </button>
                  <input
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,image/*,video/*,audio/*"
                    className="student-assignments-submit__file-input"
                    multiple
                    onChange={onPickFiles}
                    ref={fileInputRef}
                    type="file"
                  />
                  {submitFiles.map((file, index) => (
                    <div className="student-assignments-submit__file" key={`${file.name}-${index}`}>
                      <strong>{file.name}</strong>
                      <button onClick={() => setSubmitFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} type="button">×</button>
                    </div>
                  ))}
                </div>
                <div className="student-assignments-submit__links">
                  {submitLinks.map((link, index) => (
                    <div className="student-assignments-submit__link-row" key={`link-${index}`}>
                      <input
                        onChange={(event) => setSubmitLinks((current) => current.map((entry, entryIndex) => (
                          entryIndex === index ? { ...entry, title: event.target.value } : entry
                        )))}
                        placeholder="Título del enlace"
                        value={link.title}
                      />
                      <input
                        onChange={(event) => setSubmitLinks((current) => current.map((entry, entryIndex) => (
                          entryIndex === index ? { ...entry, url: event.target.value } : entry
                        )))}
                        placeholder="https://..."
                        value={link.url}
                      />
                    </div>
                  ))}
                  <button onClick={() => setSubmitLinks((current) => [...current, createEmptyLinkDraft()])} type="button">
                    + Agregar enlace
                  </button>
                </div>
                <button className="student-assignments-submit__cta" disabled={isSubmitting} type="submit">
                  {isSubmitting ? 'Enviando...' : (detail.hasSubmission ? 'Actualizar entrega' : 'Enviar entrega')}
                </button>
              </form>
            ) : (
              <div className="student-assignments-panel__read-only">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Asignación de consulta</strong>
                  <p>Revisa las instrucciones y descarga el material. Esta actividad no requiere una entrega en el portal.</p>
                </div>
              </div>
            )}
          </article>
        ) : null}
      </section>
    );
  }

  return (
    <section className="student-assignments-panel">
      <header className="student-assignments-panel__head">
        <div className="student-assignments-panel__head-copy">
          <span className="student-assignments-panel__eyebrow">Aula virtual</span>
          <h2>Mis asignaciones</h2>
          <p>Todo tu trabajo escolar en un solo lugar.</p>
          <button
            className="student-assignments-panel__hero-cta"
            onClick={() => assignmentsListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            type="button"
          >
            Ver mis asignaciones
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <AssignmentsHeroIllustration />
        <div className="student-assignments-panel__summary" aria-label={`${assignmentCounts.open} asignaciones pendientes`}>
          <strong>{assignmentCounts.open}</strong>
          <span>pendientes</span>
        </div>
      </header>

      {isLoading ? <p className="student-assignments-panel__status">Cargando asignaciones...</p> : null}
      {error ? <p className="student-assignments-panel__status is-error">{error}</p> : null}
      {!isLoading && !error && sortedAssignments.length === 0 ? (
        <p className="student-assignments-panel__status">Todavía no tienes asignaciones publicadas.</p>
      ) : null}

      {!isLoading && !error && sortedAssignments.length ? (
        <nav className="student-assignments-panel__filters" aria-label="Filtrar asignaciones">
          {[
            { key: 'all', label: 'Todas' },
            { key: 'open', label: 'Pendientes' },
            { key: 'done', label: 'Entregadas' },
          ].map((filter) => (
            <button
              className={activeFilter === filter.key ? 'is-active' : ''}
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              type="button"
            >
              {filter.label}
              <span>{assignmentCounts[filter.key]}</span>
            </button>
          ))}
        </nav>
      ) : null}

      <div className="student-assignments-list" ref={assignmentsListRef}>
        {visibleAssignments.map((assignment) => {
          const state = getAssignmentState(assignment);
          return (
            <button
              className={`student-assignments-card is-${state.key}`}
              key={assignment.id}
              onClick={() => setSelectedId(String(assignment.id))}
              type="button"
            >
              <span className="student-assignments-card__subject-icon" aria-hidden="true">
                {(assignment.subject || assignment.courseTitle || 'A').slice(0, 1).toUpperCase()}
              </span>
              <div className="student-assignments-card__copy">
                <div className="student-assignments-card__topline">
                  <span>{assignment.subject || assignment.courseTitle || 'Curso'}</span>
                  <small className={`student-assignments-badge is-${state.key}`}>{state.label}</small>
                </div>
                <strong>{assignment.title || 'Sin título'}</strong>
                <small className="student-assignments-card__date">
                  <span aria-hidden="true">◷</span>
                  {formatAssignmentDate(assignment.date || assignment.dueAt || assignment.scheduledClassDate)}
                </small>
              </div>
              <span className="student-assignments-card__chevron" aria-hidden="true">›</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
