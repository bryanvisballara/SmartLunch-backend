import { useEffect, useMemo, useState } from 'react';
import { saveTeacherPreschoolBulletin } from '../../services/preschoolBulletin.service';

function entryKey(studentId, indicatorId) {
  return `${studentId}:${indicatorId}`;
}

function blockCommentKey(studentId, blockId) {
  return `${studentId}:${blockId}`;
}

function emptyMark() {
  return { observation: '', performanceKey: '' };
}

export default function HeadroomPreschoolBulletinView({
  bulletin,
  teacherUserId = '',
  onNotice,
  onSaved,
  directorGroupView = false,
}) {
  const [studentId, setStudentId] = useState('');
  const [marks, setMarks] = useState({});
  const [blockComments, setBlockComments] = useState({});
  const [openIndicatorComments, setOpenIndicatorComments] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const levels = bulletin?.performanceLevels || [];
  const ownedBlocks = useMemo(() => {
    const blocks = bulletin?.blocks || [];
    if (!teacherUserId) return blocks;
    return blocks.filter((block) => String(block.teacherUserId || '') === String(teacherUserId));
  }, [bulletin, teacherUserId]);

  const ownedBlockIds = useMemo(() => new Set(ownedBlocks.map((block) => block.id)), [ownedBlocks]);

  const ownedIndicatorIds = useMemo(() => new Set(
    ownedBlocks.flatMap((block) => (block.indicators || []).map((indicator) => indicator.id))
  ), [ownedBlocks]);

  useEffect(() => {
    const nextMarks = {};
    const nextOpenComments = new Set();
    (bulletin?.entries || []).forEach((entry) => {
      if (!ownedIndicatorIds.has(entry.indicatorId)) return;
      if (teacherUserId && String(entry.teacherUserId || '') !== String(teacherUserId)) return;
      nextMarks[entryKey(entry.studentId, entry.indicatorId)] = {
        observation: entry.observation || '',
        performanceKey: entry.performanceKey || '',
      };
      if (entry.observation) {
        nextOpenComments.add(entryKey(entry.studentId, entry.indicatorId));
      }
    });

    const nextBlockComments = {};
    (bulletin?.blockComments || []).forEach((item) => {
      if (!ownedBlockIds.has(item.blockId)) return;
      if (teacherUserId && String(item.teacherUserId || '') !== String(teacherUserId)) return;
      nextBlockComments[blockCommentKey(item.studentId, item.blockId)] = item.comment || '';
    });

    setMarks(nextMarks);
    setBlockComments(nextBlockComments);
    setOpenIndicatorComments(nextOpenComments);
    setStudentId((current) => (
      (bulletin?.students || []).some((student) => student.id === current) ? current : ''
    ));
  }, [bulletin, ownedBlockIds, ownedIndicatorIds, teacherUserId]);

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

  const setBlockComment = (blockId, comment) => {
    if (!selectedStudent) return;
    const key = blockCommentKey(selectedStudent.id, blockId);
    setBlockComments((current) => ({ ...current, [key]: comment }));
  };

  const toggleIndicatorComment = (indicatorId) => {
    if (!selectedStudent) return;
    const key = entryKey(selectedStudent.id, indicatorId);
    setOpenIndicatorComments((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const buildPayloadBlockComments = () => {
    const students = bulletin.students || [];
    return students.flatMap((student) => (
      ownedBlocks.map((block) => ({
        studentId: student.id,
        blockId: block.id,
        comment: (blockComments[blockCommentKey(student.id, block.id)] || '').trim(),
      }))
    ));
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
        blockComments: buildPayloadBlockComments(),
      });
      onNotice?.({
        type: 'success',
        text: status === 'submitted'
          ? 'Calificaciones enviadas al director de grupo.'
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
              const markKey = entryKey(selectedStudent.id, indicator.id);
              const mark = marks[markKey] || emptyMark();
              const showIndicatorComment = openIndicatorComments.has(markKey) || Boolean(mark.observation);
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
                  {!showIndicatorComment ? (
                    <button
                      className="campus-preschool-grade__comment-toggle"
                      disabled={saving}
                      onClick={() => toggleIndicatorComment(indicator.id)}
                      type="button"
                    >
                      Agregar comentario de indicador (opcional)
                    </button>
                  ) : (
                    <div className="campus-preschool-grade__indicator-comment">
                      <label>
                        Comentario del indicador
                        <textarea
                          disabled={saving}
                          placeholder="Comentario opcional"
                          rows={2}
                          value={mark.observation}
                          onChange={(event) => setMark(indicator.id, { observation: event.target.value })}
                        />
                      </label>
                      <button
                        className="campus-preschool-grade__comment-toggle"
                        disabled={saving}
                        onClick={() => {
                          setMark(indicator.id, { observation: '' });
                          toggleIndicatorComment(indicator.id);
                        }}
                        type="button"
                      >
                        Quitar comentario
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
            <label className="campus-preschool-grade__dimension-comment">
              Comentario general de la dimensión
              <textarea
                disabled={saving}
                placeholder="Observación general para esta dimensión (opcional)"
                rows={3}
                value={blockComments[blockCommentKey(selectedStudent.id, block.id)] || ''}
                onChange={(event) => setBlockComment(block.id, event.target.value)}
              />
            </label>
          </section>
        ))
      )}

      <div className="campus-preschool-grade__actions campus-preschool-grade__actions--split">
        <button className="campus-teacher__ghost-btn" disabled={saving} onClick={() => onSave('draft')} type="button">
          Guardar borrador
        </button>
        {!directorGroupView ? (
          <button className="campus-teacher__action-btn" disabled={saving} onClick={() => onSave('submitted')} type="button">
            Enviar calificaciones al director
          </button>
        ) : (
          <p className="campus-panel__meta campus-preschool-grade__director-hint">
            El PDF del boletín general y el envío a padres están más abajo, cuando todo el curso esté calificado.
          </p>
        )}
      </div>
    </div>
  );
}
