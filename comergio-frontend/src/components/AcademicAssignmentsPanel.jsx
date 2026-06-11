import { useMemo, useState } from 'react';

const assignmentTypeOptions = ['Actividad', 'Evento', 'Tarea', 'Quiz', 'Evaluación', 'Taller', 'Proyecto', 'Recordatorio'];

function createEmptyDraft() {
  return {
    title: '',
    type: 'Actividad',
    scheduledAt: '',
    body: '',
    scope: 'all_school',
    targetGradeKeys: [],
  };
}

function formatAssignmentDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export default function AcademicAssignmentsPanel({
  assignments = [],
  gradeOptions = [],
  onCreate,
  onArchive,
  busy = false,
  variant = 'secretary',
}) {
  const [draft, setDraft] = useState(createEmptyDraft);
  const [localError, setLocalError] = useState('');
  const panelClassName = variant === 'rectoria' ? 'panel rectoria-panel' : 'academic-secretary__panel';
  const fieldClassName = variant === 'rectoria' ? 'rectoria-form-field' : 'academic-secretary__field';
  const listClassName = variant === 'rectoria' ? 'rectoria-team-assignment-list' : 'academic-secretary__communication-list';
  const cardClassName = variant === 'rectoria' ? 'rectoria-team-assignment-card' : 'academic-secretary__communication-card';
  const submitClassName = variant === 'rectoria' ? 'rectoria-action-button is-primary' : 'academic-secretary__primary';
  const secondaryClassName = variant === 'rectoria' ? 'rectoria-action-button' : 'academic-secretary__secondary';
  const normalizedAssignments = useMemo(
    () => [...(Array.isArray(assignments) ? assignments : [])].sort((left, right) => new Date(left.scheduledAt || 0) - new Date(right.scheduledAt || 0)),
    [assignments]
  );

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const toggleGrade = (gradeKey) => {
    setDraft((current) => {
      const currentKeys = new Set(current.targetGradeKeys || []);
      if (currentKeys.has(gradeKey)) {
        currentKeys.delete(gradeKey);
      } else {
        currentKeys.add(gradeKey);
      }
      return { ...current, targetGradeKeys: Array.from(currentKeys) };
    });
  };

  const submitAssignment = async (event) => {
    event.preventDefault();
    setLocalError('');

    if (!draft.title.trim()) {
      setLocalError('Escribe un título para la asignación.');
      return;
    }

    if (!draft.scheduledAt) {
      setLocalError('Selecciona la fecha que debe aparecer en el calendario escolar.');
      return;
    }

    if (draft.scope === 'grades' && draft.targetGradeKeys.length === 0) {
      setLocalError('Selecciona al menos un grado o marca todo el colegio.');
      return;
    }

    try {
      await onCreate?.(draft);
      setDraft(createEmptyDraft());
    } catch {
      // Parent surfaces the API error in the portal message area.
    }
  };

  return (
    <section className={panelClassName}>
      <div className={variant === 'rectoria' ? 'rectoria-section-header' : 'academic-secretary__panel-head'}>
        <div>
          <h3>Asignaciones institucionales</h3>
          <p>Publica actividades generales o por grado para alimentar el calendario escolar de los acudientes.</p>
        </div>
      </div>

      <form className={variant === 'rectoria' ? 'rectoria-form-grid' : 'academic-secretary__form-grid'} onSubmit={submitAssignment}>
        <label className={fieldClassName}>
          <span>Título</span>
          <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="Family Day" />
        </label>
        <label className={fieldClassName}>
          <span>Tipo</span>
          <select value={draft.type} onChange={(event) => updateDraft('type', event.target.value)}>
            {assignmentTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className={fieldClassName}>
          <span>Fecha</span>
          <input type="date" value={draft.scheduledAt} onChange={(event) => updateDraft('scheduledAt', event.target.value)} />
        </label>
        <label className={fieldClassName}>
          <span>Dirigido a</span>
          <select value={draft.scope} onChange={(event) => updateDraft('scope', event.target.value)}>
            <option value="all_school">Todo el colegio</option>
            <option value="grades">Grados específicos</option>
          </select>
        </label>
        <label className={`${fieldClassName} is-wide`}>
          <span>Descripción</span>
          <textarea value={draft.body} onChange={(event) => updateDraft('body', event.target.value)} placeholder="Detalles que verá el acudiente al abrir el día." rows={3} />
        </label>
        {draft.scope === 'grades' ? (
          <div className={`${fieldClassName} is-wide`}>
            <span>Grados</span>
            <div className="academic-assignments__chips">
              {gradeOptions.map((grade) => (
                <button
                  className={draft.targetGradeKeys.includes(grade.value) ? 'is-active' : ''}
                  key={grade.value}
                  onClick={() => toggleGrade(grade.value)}
                  type="button"
                >
                  {grade.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {localError ? <p className="academic-assignments__error">{localError}</p> : null}
        <div className="academic-assignments__actions">
          <button className={submitClassName} disabled={busy} type="submit">Publicar asignación</button>
        </div>
      </form>

      <div className={listClassName}>
        {normalizedAssignments.length ? normalizedAssignments.map((item) => (
          <article className={cardClassName} key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <p>{[item.type, formatAssignmentDate(item.scheduledAt), item.scope === 'all_school' ? 'Todo el colegio' : `${(item.targetGradeKeys || []).length} grado(s)`].filter(Boolean).join(' · ')}</p>
              {item.body ? <p>{item.body}</p> : null}
            </div>
            {onArchive ? (
              <button className={secondaryClassName} disabled={busy} onClick={() => onArchive(item)} type="button">Archivar</button>
            ) : null}
          </article>
        )) : (
          <p className={variant === 'rectoria' ? 'rectoria-role-empty' : 'academic-secretary__empty'}>Todavía no hay asignaciones institucionales publicadas.</p>
        )}
      </div>
    </section>
  );
}
