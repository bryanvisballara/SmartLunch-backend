import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createTeacherDraft,
  formatTriviaDate,
  getEntityId,
  getErrorMessage,
  getOptionLabel,
  normalizeCollection,
  normalizeOptions,
  teacherDraftFrom,
  triviaPayloadFrom,
  validateTriviaDraft,
} from './triviaAuthoring';
import './trivia-authoring.css';

const EMPTY_FILTERS = { subjectId: '', gradeId: '', status: '' };

function StatusBadge({ status }) {
  const published = status === 'published';
  return (
    <span className={`trivia-authoring__status is-${published ? 'published' : 'draft'}`}>
      <span aria-hidden="true" />
      {published ? 'Publicada' : 'Borrador'}
    </span>
  );
}

export default function TriviaTeacherPanel({ api }) {
  const [options, setOptions] = useState({ subjects: [], grades: [] });
  const [questions, setQuestions] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draft, setDraft] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadOptions = useCallback(async () => {
    if (!api?.getTeacherTriviaOptions) {
      setError('Falta api.getTeacherTriviaOptions.');
      setLoadingOptions(false);
      return;
    }
    setLoadingOptions(true);
    try {
      const response = await api.getTeacherTriviaOptions();
      setOptions(normalizeOptions(response));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudieron cargar tus asignaciones.'));
    } finally {
      setLoadingOptions(false);
    }
  }, [api]);

  const loadQuestions = useCallback(async () => {
    if (!api?.listTeacherTriviaQuestions) {
      setError('Falta api.listTeacherTriviaQuestions.');
      setLoadingQuestions(false);
      return;
    }
    setLoadingQuestions(true);
    try {
      const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
      const response = await api.listTeacherTriviaQuestions(query);
      setQuestions(normalizeCollection(response, 'questions'));
      setError('');
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudieron cargar las preguntas.'));
    } finally {
      setLoadingQuestions(false);
    }
  }, [api, filters]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const counts = useMemo(() => ({
    total: questions.length,
    published: questions.filter((question) => question.status === 'published').length,
    drafts: questions.filter((question) => question.status !== 'published').length,
  }), [questions]);
  const draftGrades = useMemo(() => (
    options.grades.filter((grade) => !grade.subjectId || grade.subjectId === draft?.subjectId)
  ), [draft?.subjectId, options.grades]);

  const openNew = () => {
    setDraft(createTeacherDraft(options));
    setError('');
    setNotice('');
  };

  const openEdit = (question) => {
    setDraft(teacherDraftFrom(question, options));
    setError('');
    setNotice('');
  };

  const updateAnswer = (index, value) => {
    setDraft((current) => ({
      ...current,
      answers: current.answers.map((answer, answerIndex) => (answerIndex === index ? value : answer)),
    }));
  };

  const saveQuestion = async (event) => {
    event.preventDefault();
    const validationErrors = validateTriviaDraft(draft, { teacher: true });
    if (validationErrors.length) {
      setError(validationErrors[0]);
      return;
    }
    const method = draft.id ? api?.updateTeacherTriviaQuestion : api?.createTeacherTriviaQuestion;
    if (!method) {
      setError(`Falta api.${draft.id ? 'updateTeacherTriviaQuestion' : 'createTeacherTriviaQuestion'}.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = triviaPayloadFrom(draft, {
        subjectId: draft.subjectId,
        gradeId: draft.gradeId,
        status: draft.status,
      });
      if (draft.id) await method(draft.id, payload);
      else await method(payload);
      setDraft(null);
      setNotice(draft.id ? 'Pregunta actualizada.' : 'Pregunta creada como borrador.');
      await loadQuestions();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudo guardar la pregunta.'));
    } finally {
      setSaving(false);
    }
  };

  const publishQuestion = async (question) => {
    const id = getEntityId(question);
    if (!api?.publishTeacherTriviaQuestion) {
      setError('Falta api.publishTeacherTriviaQuestion.');
      return;
    }
    setBusyId(id);
    setError('');
    try {
      await api.publishTeacherTriviaQuestion(id, question);
      setNotice('Pregunta publicada y disponible para la institución.');
      await loadQuestions();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudo publicar la pregunta.'));
    } finally {
      setBusyId('');
    }
  };

  const deleteQuestion = async (question) => {
    const id = getEntityId(question);
    if (!window.confirm('¿Eliminar esta pregunta? Esta acción no se puede deshacer.')) return;
    if (!api?.deleteTeacherTriviaQuestion) {
      setError('Falta api.deleteTeacherTriviaQuestion.');
      return;
    }
    setBusyId(id);
    setError('');
    try {
      await api.deleteTeacherTriviaQuestion(id);
      setNotice('Pregunta eliminada.');
      await loadQuestions();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudo eliminar la pregunta.'));
    } finally {
      setBusyId('');
    }
  };

  const noAssignments = !loadingOptions && (!options.subjects.length || !options.grades.length);

  return (
    <section className="trivia-authoring">
      <header className="trivia-authoring__hero">
        <div>
          <p className="trivia-authoring__eyebrow">Comergio Trivia · Docentes</p>
          <h1>Banco institucional</h1>
          <p>Crea preguntas de selección única para tus asignaturas y grados asignados.</p>
        </div>
        <button className="trivia-authoring__button is-primary" disabled={noAssignments} onClick={openNew} type="button">
          <span aria-hidden="true">＋</span> Nueva pregunta
        </button>
      </header>

      <div className="trivia-authoring__metrics" aria-label="Resumen de preguntas">
        <div><strong>{counts.total}</strong><span>En esta vista</span></div>
        <div><strong>{counts.published}</strong><span>Publicadas</span></div>
        <div><strong>{counts.drafts}</strong><span>Borradores</span></div>
      </div>

      {error ? <div className="trivia-authoring__alert is-error" role="alert">{error}</div> : null}
      {notice ? <div className="trivia-authoring__alert is-success" role="status">{notice}</div> : null}
      {noAssignments ? (
        <div className="trivia-authoring__alert is-info">
          Necesitas al menos una asignatura y un grado asignados por la institución para crear preguntas.
        </div>
      ) : null}

      <div className="trivia-authoring__toolbar">
        <div className="trivia-authoring__toolbar-title">
          <strong>Mis preguntas</strong>
          <span>Filtra el contenido del banco</span>
        </div>
        <label>
          <span>Asignatura</span>
          <select
            disabled={loadingOptions}
            onChange={(event) => setFilters((current) => ({ ...current, subjectId: event.target.value }))}
            value={filters.subjectId}
          >
            <option value="">Todas</option>
            {options.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.label}</option>)}
          </select>
        </label>
        <label>
          <span>Grado</span>
          <select
            disabled={loadingOptions}
            onChange={(event) => setFilters((current) => ({ ...current, gradeId: event.target.value }))}
            value={filters.gradeId}
          >
            <option value="">Todos</option>
            {options.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.label}</option>)}
          </select>
        </label>
        <label>
          <span>Estado</span>
          <select
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            value={filters.status}
          >
            <option value="">Todos</option>
            <option value="draft">Borrador</option>
            <option value="published">Publicada</option>
          </select>
        </label>
      </div>

      {loadingQuestions ? (
        <div className="trivia-authoring__empty"><span className="trivia-authoring__spinner" /> Cargando preguntas…</div>
      ) : questions.length ? (
        <div className="trivia-authoring__question-grid">
          {questions.map((question) => {
            const id = getEntityId(question);
            const subjectId = question.subjectId || question.subject?.id || question.subject?._id;
            const gradeId = question.gradeId || question.grade?.id || question.grade?._id;
            return (
              <article className="trivia-authoring__question-card" key={id}>
                <div className="trivia-authoring__card-top">
                  <StatusBadge status={question.status} />
                  {question.updatedAt ? <time>{formatTriviaDate(question.updatedAt)}</time> : null}
                </div>
                <h2>{question.prompt || question.question}</h2>
                <div className="trivia-authoring__chips">
                  <span>{getOptionLabel(options.subjects, subjectId, question.subject?.name || question.subjectName)}</span>
                  <span>{getOptionLabel(options.grades, gradeId, question.grade?.name || question.gradeName)}</span>
                </div>
                <div className="trivia-authoring__card-actions">
                  <button className="trivia-authoring__button is-soft" disabled={busyId === id || loadingOptions} onClick={() => openEdit(question)} type="button">
                    Editar
                  </button>
                  {question.status !== 'published' ? (
                    <button className="trivia-authoring__button is-primary" disabled={busyId === id} onClick={() => publishQuestion(question)} type="button">
                      Publicar
                    </button>
                  ) : null}
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
          <p>Crea una nueva o cambia los filtros para ver más resultados.</p>
        </div>
      )}

      {draft ? (
        <div className="trivia-authoring__overlay" role="presentation">
          <form aria-modal="true" className="trivia-authoring__editor" onSubmit={saveQuestion} role="dialog">
            <div className="trivia-authoring__editor-header">
              <div>
                <p className="trivia-authoring__eyebrow">{draft.id ? 'Editar pregunta' : 'Nueva pregunta'}</p>
                <h2>Pregunta institucional</h2>
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
                  placeholder="Ej. ¿Cuál es la capital de Colombia?"
                  rows={4}
                  value={draft.prompt}
                />
                <small>{draft.prompt.length}/500</small>
              </label>
              <label>
                <span>Asignatura asignada</span>
                <select
                  onChange={(event) => {
                    const subjectId = event.target.value;
                    const firstGrade = options.grades.find((grade) => !grade.subjectId || grade.subjectId === subjectId);
                    setDraft((current) => ({
                      ...current,
                      subjectId,
                      gradeId: firstGrade?.id || '',
                    }));
                  }}
                  required
                  value={draft.subjectId}
                >
                  <option disabled value="">Selecciona</option>
                  {options.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.label}</option>)}
                </select>
              </label>
              <label>
                <span>Grado asignado</span>
                <select
                  onChange={(event) => setDraft((current) => ({ ...current, gradeId: event.target.value }))}
                  required
                  value={draft.gradeId}
                >
                  <option disabled value="">Selecciona</option>
                  {draftGrades.map((grade) => <option key={grade.id} value={grade.id}>{grade.label}</option>)}
                </select>
              </label>
            </div>

            <fieldset className="trivia-authoring__answers">
              <legend>Respuestas <small>Marca una única respuesta correcta</small></legend>
              {draft.answers.map((answer, index) => (
                <label className={draft.correctAnswerIndex === index ? 'is-correct' : ''} key={index}>
                  <input
                    checked={draft.correctAnswerIndex === index}
                    name="correct-answer"
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
              <span>Se guardará como {draft.status === 'published' ? 'publicada' : 'borrador'}.</span>
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
