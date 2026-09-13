import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TRIVIA_AGE_BANDS,
  TRIVIA_CATEGORIES,
  TRIVIA_DIFFICULTIES,
  TRIVIA_STATUSES,
  adminDraftFrom,
  createAdminDraft,
  formatTriviaDate,
  getEntityId,
  getErrorMessage,
  normalizeCollection,
  triviaPayloadFrom,
  validateTriviaDraft,
} from './triviaAuthoring';
import './trivia-authoring.css';

const EMPTY_FILTERS = { category: '', ageBand: '', difficulty: '', status: '' };

function StatusBadge({ status }) {
  const published = status === 'published';
  return (
    <span className={`trivia-authoring__status is-${published ? 'published' : 'draft'}`}>
      <span aria-hidden="true" />
      {published ? 'Publicada' : 'Borrador'}
    </span>
  );
}

function difficultyLabel(value) {
  return TRIVIA_DIFFICULTIES.find((item) => item.value === value)?.label || value;
}

export default function TriviaAdminPanel({ api }) {
  const [activeTab, setActiveTab] = useState('bank');
  const [questions, setQuestions] = useState([]);
  const [reports, setReports] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadQuestions = useCallback(async () => {
    if (!api?.listAdminTriviaQuestions) {
      setError('Falta api.listAdminTriviaQuestions.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const response = await api.listAdminTriviaQuestions(query);
      setQuestions(normalizeCollection(response, 'questions'));
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudo cargar el banco global.'));
    } finally {
      setLoading(false);
    }
  }, [api, filters]);

  const loadReports = useCallback(async () => {
    if (!api?.listTriviaModerationReports) {
      setError('Falta api.listTriviaModerationReports.');
      setReportsLoading(false);
      return;
    }
    setReportsLoading(true);
    try {
      const response = await api.listTriviaModerationReports({ status: 'open' });
      setReports(normalizeCollection(response, 'reports'));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudieron cargar los reportes.'));
    } finally {
      setReportsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const summary = useMemo(() => ({
    total: questions.length,
    published: questions.filter((question) => question.status === 'published').length,
    reports: reports.length,
  }), [questions, reports]);

  const updateAnswer = (index, value) => {
    setDraft((current) => ({
      ...current,
      answers: current.answers.map((answer, answerIndex) => (answerIndex === index ? value : answer)),
    }));
  };

  const saveQuestion = async (event) => {
    event.preventDefault();
    const validationErrors = validateTriviaDraft(draft);
    if (validationErrors.length) {
      setError(validationErrors[0]);
      return;
    }
    const method = draft.id ? api?.updateAdminTriviaQuestion : api?.createAdminTriviaQuestion;
    if (!method) {
      setError(`Falta api.${draft.id ? 'updateAdminTriviaQuestion' : 'createAdminTriviaQuestion'}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = triviaPayloadFrom(draft, {
        category: draft.category,
        ageBand: draft.ageBand,
        difficulty: draft.difficulty,
        status: draft.status,
      });
      if (draft.id) await method(draft.id, payload);
      else await method(payload);
      setDraft(null);
      setNotice(draft.id ? 'Pregunta global actualizada.' : 'Pregunta añadida al banco global.');
      await loadQuestions();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudo guardar la pregunta.'));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (question) => {
    const id = getEntityId(question);
    const nextStatus = question.status === 'published' ? 'draft' : 'published';
    if (!api?.setAdminTriviaQuestionStatus) {
      setError('Falta api.setAdminTriviaQuestionStatus.');
      return;
    }
    setBusyId(id);
    setError('');
    try {
      await api.setAdminTriviaQuestionStatus(id, nextStatus, question);
      setNotice(nextStatus === 'published' ? 'Pregunta publicada.' : 'Pregunta movida a borradores.');
      await loadQuestions();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudo cambiar el estado.'));
    } finally {
      setBusyId('');
    }
  };

  const deleteQuestion = async (question) => {
    const id = getEntityId(question);
    if (!window.confirm('¿Eliminar esta pregunta del banco global?')) return;
    if (!api?.deleteAdminTriviaQuestion) {
      setError('Falta api.deleteAdminTriviaQuestion.');
      return;
    }
    setBusyId(id);
    setError('');
    try {
      await api.deleteAdminTriviaQuestion(id);
      setNotice('Pregunta eliminada del banco global.');
      await loadQuestions();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudo eliminar la pregunta.'));
    } finally {
      setBusyId('');
    }
  };

  const moderateReport = async (report, action) => {
    const id = getEntityId(report);
    const isProfileReport = report.targetType === 'profile';
    if (action === 'remove_question' && !window.confirm(
      isProfileReport
        ? '¿Desactivar el perfil reportado y resolver el reporte?'
        : '¿Retirar la pregunta reportada y resolver el reporte?'
    )) return;
    if (!api?.moderateTriviaReport) {
      setError('Falta api.moderateTriviaReport.');
      return;
    }
    setBusyId(id);
    setError('');
    try {
      await api.moderateTriviaReport(id, { action });
      setNotice(
        action === 'remove_question'
          ? (isProfileReport ? 'Perfil desactivado y reporte resuelto.' : 'Pregunta retirada y reporte resuelto.')
          : 'Reporte descartado.'
      );
      await Promise.all([loadReports(), action === 'remove_question' ? loadQuestions() : Promise.resolve()]);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudo moderar el reporte.'));
    } finally {
      setBusyId('');
    }
  };

  return (
    <section className="trivia-authoring is-admin">
      <header className="trivia-authoring__hero">
        <div>
          <p className="trivia-authoring__eyebrow">Comergio Trivia · Super Admin</p>
          <h1>Centro de contenido</h1>
          <p>Administra el banco global y protege la calidad de cada pregunta.</p>
        </div>
        <button className="trivia-authoring__button is-primary" onClick={() => setDraft(createAdminDraft())} type="button">
          <span aria-hidden="true">＋</span> Nueva pregunta
        </button>
      </header>

      <div className="trivia-authoring__metrics" aria-label="Resumen del banco global">
        <div><strong>{summary.total}</strong><span>En esta vista</span></div>
        <div><strong>{summary.published}</strong><span>Publicadas</span></div>
        <div className={summary.reports ? 'has-alert' : ''}><strong>{summary.reports}</strong><span>Reportes abiertos</span></div>
      </div>

      {error ? <div className="trivia-authoring__alert is-error" role="alert">{error}</div> : null}
      {notice ? <div className="trivia-authoring__alert is-success" role="status">{notice}</div> : null}

      <nav className="trivia-authoring__tabs" aria-label="Secciones de administración">
        <button className={activeTab === 'bank' ? 'is-active' : ''} onClick={() => setActiveTab('bank')} type="button">
          Banco global <span>{questions.length}</span>
        </button>
        <button className={activeTab === 'reports' ? 'is-active' : ''} onClick={() => setActiveTab('reports')} type="button">
          Moderación <span className={reports.length ? 'has-alert' : ''}>{reports.length}</span>
        </button>
      </nav>

      {activeTab === 'bank' ? (
        <>
          <div className="trivia-authoring__toolbar is-admin">
            <div className="trivia-authoring__toolbar-title">
              <strong>Preguntas globales</strong>
              <span>Contenido disponible para todas las instituciones</span>
            </div>
            <label>
              <span>Categoría</span>
              <select onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))} value={filters.category}>
                <option value="">Todas</option>
                {TRIVIA_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>Edad</span>
              <select onChange={(event) => setFilters((current) => ({ ...current, ageBand: event.target.value }))} value={filters.ageBand}>
                <option value="">Todas</option>
                {TRIVIA_AGE_BANDS.map((value) => <option key={value} value={value}>{value} años</option>)}
              </select>
            </label>
            <label>
              <span>Dificultad</span>
              <select onChange={(event) => setFilters((current) => ({ ...current, difficulty: event.target.value }))} value={filters.difficulty}>
                <option value="">Todas</option>
                {TRIVIA_DIFFICULTIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} value={filters.status}>
                <option value="">Todos</option>
                {TRIVIA_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>

          {loading ? (
            <div className="trivia-authoring__empty"><span className="trivia-authoring__spinner" /> Cargando banco global…</div>
          ) : questions.length ? (
            <div className="trivia-authoring__question-grid">
              {questions.map((question) => {
                const id = getEntityId(question);
                return (
                  <article className="trivia-authoring__question-card" key={id}>
                    <div className="trivia-authoring__card-top">
                      <StatusBadge status={question.status} />
                      {question.updatedAt ? <time>{formatTriviaDate(question.updatedAt)}</time> : null}
                    </div>
                    <h2>{question.prompt || question.question}</h2>
                    <div className="trivia-authoring__chips">
                      <span>{question.category}</span>
                      <span>{question.ageBand} años</span>
                      <span>{difficultyLabel(question.difficulty)}</span>
                    </div>
                    <div className="trivia-authoring__card-actions">
                      <button className="trivia-authoring__button is-soft" disabled={busyId === id} onClick={() => setDraft(adminDraftFrom(question))} type="button">Editar</button>
                      <button className="trivia-authoring__button is-primary" disabled={busyId === id} onClick={() => changeStatus(question)} type="button">
                        {question.status === 'published' ? 'Despublicar' : 'Publicar'}
                      </button>
                      <button className="trivia-authoring__icon-button is-danger" disabled={busyId === id} onClick={() => deleteQuestion(question)} title="Eliminar pregunta" type="button">
                        <span aria-hidden="true">⌫</span><span className="trivia-authoring__sr-only">Eliminar</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="trivia-authoring__empty">
              <span className="trivia-authoring__empty-icon" aria-hidden="true">?</span>
              <strong>No hay preguntas con estos filtros</strong>
              <p>Ajusta los filtros o agrega una pregunta al banco global.</p>
            </div>
          )}
        </>
      ) : (
        <div className="trivia-authoring__reports">
          <div className="trivia-authoring__section-heading">
            <div><h2>Reportes abiertos</h2><p>Revisa las alertas enviadas por la comunidad.</p></div>
            <button className="trivia-authoring__button is-soft" disabled={reportsLoading} onClick={loadReports} type="button">Actualizar</button>
          </div>
          {reportsLoading ? (
            <div className="trivia-authoring__empty"><span className="trivia-authoring__spinner" /> Cargando reportes…</div>
          ) : reports.length ? reports.map((report) => {
            const id = getEntityId(report);
            const snapshot = report.question || report.questionSnapshot || {};
            return (
              <article className="trivia-authoring__report-card" key={id}>
                <div className="trivia-authoring__report-mark" aria-hidden="true">!</div>
                <div className="trivia-authoring__report-body">
                  <div className="trivia-authoring__card-top">
                    <span className="trivia-authoring__report-reason">{report.reason || 'Contenido reportado'}</span>
                    <time>{formatTriviaDate(report.createdAt)}</time>
                  </div>
                  <h3>{snapshot.prompt || snapshot.question || report.questionPrompt || 'Pregunta no disponible'}</h3>
                  {report.details || report.comment ? <blockquote>“{report.details || report.comment}”</blockquote> : null}
                  <p className="trivia-authoring__report-meta">
                    Reportado por {report.reporter?.name || report.reporterName || 'usuario de Comergio'}
                    {snapshot.category ? ` · ${snapshot.category}` : ''}
                  </p>
                  <div className="trivia-authoring__card-actions">
                    <button className="trivia-authoring__button is-soft" disabled={busyId === id} onClick={() => moderateReport(report, 'dismiss')} type="button">
                      Descartar reporte
                    </button>
                    <button className="trivia-authoring__button is-danger" disabled={busyId === id} onClick={() => moderateReport(report, 'remove_question')} type="button">
                      {report.targetType === 'profile' ? 'Desactivar perfil' : 'Retirar pregunta'}
                    </button>
                  </div>
                </div>
              </article>
            );
          }) : (
            <div className="trivia-authoring__empty">
              <span className="trivia-authoring__empty-icon is-success" aria-hidden="true">✓</span>
              <strong>Todo está al día</strong>
              <p>No hay reportes pendientes de moderación.</p>
            </div>
          )}
        </div>
      )}

      {draft ? (
        <div className="trivia-authoring__overlay" role="presentation">
          <form aria-modal="true" className="trivia-authoring__editor" onSubmit={saveQuestion} role="dialog">
            <div className="trivia-authoring__editor-header">
              <div>
                <p className="trivia-authoring__eyebrow">{draft.id ? 'Editar contenido' : 'Nuevo contenido'}</p>
                <h2>Pregunta del banco global</h2>
              </div>
              <button aria-label="Cerrar editor" className="trivia-authoring__close" onClick={() => setDraft(null)} type="button">×</button>
            </div>

            <div className="trivia-authoring__form-grid">
              <label className="is-wide">
                <span>Enunciado</span>
                <textarea
                  autoFocus
                  maxLength={500}
                  onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
                  placeholder="Escribe una pregunta clara y verificable"
                  rows={4}
                  value={draft.prompt}
                />
                <small>{draft.prompt.length}/500</small>
              </label>
              <label>
                <span>Categoría</span>
                <select onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} value={draft.category}>
                  {TRIVIA_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span>Rango de edad</span>
                <select onChange={(event) => setDraft((current) => ({ ...current, ageBand: event.target.value }))} value={draft.ageBand}>
                  {TRIVIA_AGE_BANDS.map((value) => <option key={value} value={value}>{value} años</option>)}
                </select>
              </label>
              <label>
                <span>Dificultad</span>
                <select onChange={(event) => setDraft((current) => ({ ...current, difficulty: event.target.value }))} value={draft.difficulty}>
                  {TRIVIA_DIFFICULTIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label>
                <span>Estado</span>
                <select onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} value={draft.status}>
                  {TRIVIA_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            </div>

            <fieldset className="trivia-authoring__answers">
              <legend>Respuestas <small>Marca una única respuesta correcta</small></legend>
              {draft.answers.map((answer, index) => (
                <label className={draft.correctAnswerIndex === index ? 'is-correct' : ''} key={index}>
                  <input
                    checked={draft.correctAnswerIndex === index}
                    name="admin-correct-answer"
                    onChange={() => setDraft((current) => ({ ...current, correctAnswerIndex: index }))}
                    type="radio"
                  />
                  <span className="trivia-authoring__answer-letter">{String.fromCharCode(65 + index)}</span>
                  <input
                    aria-label={`Respuesta ${index + 1}`}
                    maxLength={240}
                    onChange={(event) => updateAnswer(index, event.target.value)}
                    placeholder={`Respuesta ${index + 1}`}
                    value={answer}
                  />
                  <span className="trivia-authoring__check" aria-hidden="true">✓</span>
                </label>
              ))}
            </fieldset>

            <div className="trivia-authoring__editor-footer">
              <span>La pregunta tendrá exactamente cuatro opciones.</span>
              <div>
                <button className="trivia-authoring__button is-soft" disabled={saving} onClick={() => setDraft(null)} type="button">Cancelar</button>
                <button className="trivia-authoring__button is-primary" disabled={saving} type="submit">
                  {saving ? 'Guardando…' : 'Guardar pregunta'}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
