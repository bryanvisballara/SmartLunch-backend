import { useEffect, useMemo, useState } from 'react';
import { saveTeacherPreschoolBulletin } from '../../services/preschoolBulletin.service';

function entryKey(studentId, indicatorId) {
  return `${studentId}:${indicatorId}`;
}

function emptyMark() {
  return { observation: '', performanceKey: '' };
}

export default function HeadroomPreschoolBulletinView({
  bulletin,
  teacherUserId = '',
  onNotice,
  onSaved,
}) {
  const [studentId, setStudentId] = useState('');
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  const levels = bulletin?.performanceLevels || [];
  const ownedBlocks = useMemo(() => {
    const blocks = bulletin?.blocks || [];
    if (!teacherUserId) return blocks;
    return blocks.filter((block) => String(block.teacherUserId || '') === String(teacherUserId));
  }, [bulletin, teacherUserId]);

  const ownedIndicatorIds = useMemo(() => new Set(
    ownedBlocks.flatMap((block) => (block.indicators || []).map((indicator) => indicator.id))
  ), [ownedBlocks]);

  useEffect(() => {
    const next = {};
    (bulletin?.entries || []).forEach((entry) => {
      if (!ownedIndicatorIds.has(entry.indicatorId)) return;
      if (teacherUserId && String(entry.teacherUserId || '') !== String(teacherUserId)) return;
      next[entryKey(entry.studentId, entry.indicatorId)] = {
        observation: entry.observation || '',
        performanceKey: entry.performanceKey || '',
      };
    });
    setMarks(next);
    setStudentId((current) => (
      (bulletin?.students || []).some((student) => student.id === current) ? current : ''
    ));
  }, [bulletin, ownedIndicatorIds, teacherUserId]);

  const selectedStudent = (bulletin?.students || []).find((student) => student.id === studentId) || null;

  const gradedCount = (student) => ownedBlocks.reduce((total, block) => (
    total + (block.indicators || []).filter((indicator) => (
      marks[entryKey(student.id, indicator.id)]?.performanceKey
    )).length
  ), 0);

  const indicatorTotal = ownedBlocks.reduce((total, block) => total + (block.indicators || []).length, 0);

  const setMark = (indicatorId, patch) => {
    if (!selectedStudent) return;
    const key = entryKey(selectedStudent.id, indicatorId);
    setMarks((current) => ({
      ...current,
      [key]: { ...emptyMark(), ...(current[key] || {}), ...patch },
    }));
  };

  const onSave = async (status) => {
    if (!bulletin?.gradeKey || !bulletin?.academicPeriodKey) return;
    const students = bulletin.students || [];
    const entries = students.flatMap((student) => (
      [...ownedIndicatorIds].map((indicatorId) => {
        const mark = marks[entryKey(student.id, indicatorId)] || emptyMark();
        return {
          studentId: student.id,
          studentName: student.name,
          indicatorId,
          observation: mark.observation || '',
          performanceKey: mark.performanceKey || '',
        };
      })
    ));
    setSaving(true);
    try {
      await saveTeacherPreschoolBulletin({
        gradeKey: bulletin.gradeKey,
        periodKey: bulletin.academicPeriodKey,
        status,
        entries,
      });
      onNotice?.({
        type: 'success',
        text: status === 'submitted'
          ? 'Boletín generado. La familia podrá verlo en Academia si está al día en cartera.'
          : 'Borrador del boletín guardado.',
      });
      await onSaved?.();
    } catch (error) {
      onNotice?.({
        type: 'error',
        text: error?.response?.data?.message || 'No se pudieron guardar las calificaciones del boletín preescolar.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!ownedBlocks.length) {
    return (
      <p className="campus-panel__meta">
        Las calificaciones de estos indicadores las registra el docente asignado a cada dimensión.
      </p>
    );
  }

  return (
    <div className="campus-preschool-grade">
      <header>
        <h3>Calificar estudiante</h3>
        <p>Elige un alumno. Después se abren las dimensiones e indicadores de este periodo.</p>
      </header>

      <label>
        Estudiante
        <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
          <option value="">Selecciona un estudiante</option>
          {(bulletin?.students || []).map((student) => {
            const done = gradedCount(student);
            return (
              <option key={student.id} value={student.id}>
                {student.name}{indicatorTotal ? ` · ${done}/${indicatorTotal}` : ''}
              </option>
            );
          })}
        </select>
      </label>

      {!selectedStudent ? (
        <p className="campus-panel__meta">Selecciona un estudiante para ver sus componentes calificables.</p>
      ) : (
        ownedBlocks.map((block) => (
          <section key={block.id}>
            <h4>{block.kind === 'topic' ? 'Tópico' : 'Dimensión'}: {block.name}</h4>
            {(block.indicators || []).map((indicator) => {
              const mark = marks[entryKey(selectedStudent.id, indicator.id)] || emptyMark();
              return (
                <article key={indicator.id}>
                  <strong>{indicator.text}</strong>
                  {indicator.subjectLabel ? <span>{indicator.subjectLabel}</span> : null}
                  <div className="campus-preschool-grade__levels" role="group" aria-label={`Desempeño de ${indicator.text}`}>
                    {levels.map((level) => {
                      const selected = mark.performanceKey === level.key;
                      return (
                        <button
                          key={level.key}
                          type="button"
                          aria-pressed={selected}
                          disabled={saving}
                          style={selected ? { background: level.color || '#0f766e', borderColor: level.color || '#0f766e', color: '#fff' } : undefined}
                          onClick={() => setMark(indicator.id, { performanceKey: selected ? '' : level.key })}
                        >
                          {level.label}
                        </button>
                      );
                    })}
                  </div>
                  <label>
                    Comentario
                    <textarea
                      disabled={saving}
                      placeholder="Comentario opcional"
                      rows={2}
                      value={mark.observation}
                      onChange={(event) => setMark(indicator.id, { observation: event.target.value })}
                    />
                  </label>
                </article>
              );
            })}
          </section>
        ))
      )}

      <div className="campus-preschool-grade__actions">
        <button disabled={saving} onClick={() => onSave('draft')} type="button">Guardar borrador</button>
        <button disabled={saving} onClick={() => onSave('submitted')} type="button">Generar boletín</button>
      </div>
    </div>
  );
}
