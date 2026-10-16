import { useEffect, useMemo, useState } from 'react';
import {
  getPreschoolBulletinCatalog,
  getPreschoolBulletinTemplate,
  savePreschoolBulletinTemplate,
} from '../../services/preschoolBulletin.service';
import './PreschoolBulletinModelPanel.css';

function emptyIndicator() {
  return { text: '', subjectKey: '' };
}

function emptyBlock(kind = 'dimension') {
  return { kind, name: '', teacherUserId: '', indicators: [emptyIndicator()] };
}

export default function PreschoolBulletinModelPanel() {
  const [catalog, setCatalog] = useState({ grades: [], periods: [], configured: [] });
  const [gradeKey, setGradeKey] = useState('');
  const [periodKey, setPeriodKey] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getPreschoolBulletinCatalog()
      .then((data) => {
        if (cancelled) return;
        setCatalog({
          grades: data?.grades || [],
          periods: data?.periods || [],
          teachers: data?.teachers || [],
          configured: data?.configured || [],
        });
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.response?.data?.message || 'No se pudo cargar la malla académica.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!gradeKey || !periodKey) {
      setBlocks([]);
      return undefined;
    }
    let cancelled = false;
    setError('');
    getPreschoolBulletinTemplate(gradeKey, periodKey)
      .then((data) => {
        if (cancelled) return;
        const nextBlocks = data?.template?.blocks || [];
        setBlocks(nextBlocks.length ? nextBlocks.map((block) => ({
          kind: block.kind === 'topic' ? 'topic' : 'dimension',
          name: block.name || '',
          teacherUserId: block.teacherUserId || '',
          indicators: (block.indicators || []).map((indicator) => ({
            text: indicator.text || '',
            subjectKey: indicator.subjectKey || '',
          })),
        })) : [emptyBlock('dimension')]);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.response?.data?.message || 'No se pudo cargar el modelo.');
      });
    return () => {
      cancelled = true;
    };
  }, [gradeKey, periodKey]);

  const selectedGrade = useMemo(
    () => (catalog.grades || []).find((grade) => grade.key === gradeKey) || null,
    [catalog.grades, gradeKey]
  );
  const subjects = selectedGrade?.subjects || [];

  const updateBlock = (index, patch) => {
    setBlocks((current) => current.map((block, blockIndex) => (
      blockIndex === index ? { ...block, ...patch } : block
    )));
  };

  const updateIndicator = (blockIndex, indicatorIndex, patch) => {
    setBlocks((current) => current.map((block, index) => {
      if (index !== blockIndex) return block;
      return {
        ...block,
        indicators: block.indicators.map((indicator, itemIndex) => (
          itemIndex === indicatorIndex ? { ...indicator, ...patch } : indicator
        )),
      };
    }));
  };

  const periodHasModel = (grade, period) => (catalog.configured || []).some((item) => (
    item.gradeKey === grade && item.periodKey === period
  ));

  const onSave = async () => {
    if (!gradeKey || !periodKey) return;
    const missingTeacher = blocks.find((block) => (
      (block.indicators || []).some((indicator) => !String(indicator.subjectKey || '').trim())
      && !String(block.teacherUserId || '').trim()
    ));
    if (missingTeacher) {
      setError(`Asigna un docente a "${missingTeacher.name || 'la dimensión'}" para calificar los indicadores sin materia.`);
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await savePreschoolBulletinTemplate(gradeKey, { periodKey, blocks });
      setNotice('Modelo guardado para este periodo. Quien tenga la materia califica esos indicadores. Si no hay materia, califica el docente que seleccionaste.');
      setCatalog((current) => ({
        ...current,
        configured: (current.configured || []).some((item) => item.gradeKey === gradeKey && item.periodKey === periodKey)
          ? current.configured
          : [...(current.configured || []), { gradeKey, periodKey }],
      }));
    } catch (saveError) {
      setError(saveError?.response?.data?.message || 'No se pudo guardar el modelo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="preschool-bulletin-model">
      <header>
        <p>Boletín de preescolar</p>
        <h2>Modelo por grado y periodo</h2>
        <span>Elige el grado y después el periodo. Cada periodo tiene sus propias dimensiones, tópicos e indicadores.</span>
      </header>

      {loading ? <p className="preschool-bulletin-model__meta">Cargando grados...</p> : null}
      {error ? <p className="preschool-bulletin-model__error">{error}</p> : null}
      {notice ? <p className="preschool-bulletin-model__ok">{notice}</p> : null}

      <div className="preschool-bulletin-model__filters">
        <label>
          Grado
          <select
            value={gradeKey}
            onChange={(event) => {
              setGradeKey(event.target.value);
              setPeriodKey('');
              setBlocks([]);
              setNotice('');
            }}
          >
            <option value="">Selecciona un grado</option>
            {(catalog.grades || []).map((grade) => (
              <option key={grade.key} value={grade.key}>
                {grade.label}
                {(catalog.configured || []).some((item) => item.gradeKey === grade.key) ? ' · con modelo' : ''}
              </option>
            ))}
          </select>
        </label>

        {gradeKey && !(catalog.periods || []).length ? (
          <p className="preschool-bulletin-model__error">Este colegio todavía no tiene periodos académicos.</p>
        ) : null}
        {gradeKey && (catalog.periods || []).length ? (
          <label>
            Periodo
            <select
              value={periodKey}
              onChange={(event) => {
                setPeriodKey(event.target.value);
                setNotice('');
              }}
            >
              <option value="">Selecciona un periodo</option>
              {(catalog.periods || []).map((period) => (
                <option key={period.key} value={period.key}>
                  {period.name}
                  {periodHasModel(gradeKey, period.key) ? ' · con modelo' : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {gradeKey && periodKey ? (
        <>
          <div className="preschool-bulletin-model__actions">
            <button type="button" onClick={() => setBlocks((current) => [...current, emptyBlock('dimension')])}>Agregar dimensión</button>
            <button type="button" onClick={() => setBlocks((current) => [...current, emptyBlock('topic')])}>Agregar tópico</button>
          </div>

          {blocks.map((block, blockIndex) => (
            <article className="preschool-bulletin-model__block" key={`${block.kind}-${blockIndex}`}>
              <div className="preschool-bulletin-model__block-head">
                <label>
                  Tipo
                  <select value={block.kind} onChange={(event) => updateBlock(blockIndex, { kind: event.target.value })}>
                    <option value="dimension">Dimensión</option>
                    <option value="topic">Tópico</option>
                  </select>
                </label>
                <label>
                  Nombre
                  <input
                    value={block.name}
                    placeholder={block.kind === 'topic' ? 'Nombre del tópico' : 'Nombre de la dimensión'}
                    onChange={(event) => updateBlock(blockIndex, { name: event.target.value })}
                  />
                </label>
                <label>
                  Docente que califica
                  <select
                    value={block.teacherUserId || ''}
                    onChange={(event) => updateBlock(blockIndex, { teacherUserId: event.target.value })}
                  >
                    <option value="">Selecciona un docente</option>
                    {(catalog.teachers || []).map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => setBlocks((current) => current.filter((_, index) => index !== blockIndex))}>Quitar</button>
              </div>
              <p className="preschool-bulletin-model__meta">Si un indicador no tiene materia, este docente es quien lo califica.</p>

              {(block.indicators || []).map((indicator, indicatorIndex) => (
                <div className="preschool-bulletin-model__indicator" key={`${blockIndex}-${indicatorIndex}`}>
                  <label>
                    Indicador
                    <textarea
                      rows={2}
                      value={indicator.text}
                      placeholder="Texto del indicador"
                      onChange={(event) => updateIndicator(blockIndex, indicatorIndex, { text: event.target.value })}
                    />
                  </label>
                  <label>
                    Materia del grado (opcional)
                    <select
                      value={indicator.subjectKey}
                      onChange={(event) => updateIndicator(blockIndex, indicatorIndex, { subjectKey: event.target.value })}
                    >
                      <option value="">Sin asignatura</option>
                      {subjects.map((subject) => (
                        <option key={subject.key} value={subject.key}>{subject.label}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => updateBlock(blockIndex, {
                      indicators: block.indicators.filter((_, index) => index !== indicatorIndex),
                    })}
                  >
                    Quitar indicador
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => updateBlock(blockIndex, { indicators: [...(block.indicators || []), emptyIndicator()] })}
              >
                Agregar indicador
              </button>
            </article>
          ))}

          <button className="preschool-bulletin-model__save" disabled={saving} type="button" onClick={onSave}>
            {saving ? 'Guardando...' : 'Guardar modelo'}
          </button>
        </>
      ) : null}
    </section>
  );
}
