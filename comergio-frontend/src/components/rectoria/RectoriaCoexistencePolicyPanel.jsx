import { useEffect, useMemo, useState } from 'react';
import { groupCoexistenceInfractions } from '../../lib/coexistenceInfractions';

function createEmptyInfraction(order = 10) {
  return {
    key: '',
    code: '',
    categoryKey: '',
    categoryLabel: '',
    label: '',
    deductionPercent: 5,
    severityPercent: 0,
    description: '',
    active: true,
    order,
  };
}

export default function RectoriaCoexistencePolicyPanel({
  policy,
  loading = false,
  saving = false,
  onSave,
}) {
  const [startingScore, setStartingScore] = useState(100);
  const [infractions, setInfractions] = useState([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setStartingScore(Number(policy?.startingScore ?? 100));
    setInfractions(
      Array.isArray(policy?.infractions) && policy.infractions.length
        ? policy.infractions.map((item, index) => ({
            key: item.key || '',
            code: item.code || '',
            categoryKey: item.categoryKey || '',
            categoryLabel: item.categoryLabel || '',
            label: item.label || '',
            deductionPercent: Number(item.deductionPercent ?? 0),
            severityPercent: Number(item.severityPercent ?? 0),
            description: item.description || '',
            active: item.active !== false,
            order: Number(item.order ?? (index + 1) * 10),
          }))
        : [createEmptyInfraction(10)]
    );
  }, [policy]);

  const groupedInfractions = useMemo(
    () => groupCoexistenceInfractions(infractions),
    [infractions]
  );

  const activeCount = useMemo(
    () => infractions.filter((item) => item.active !== false && String(item.label || '').trim()).length,
    [infractions]
  );

  const onChangeInfraction = (index, field, value) => {
    setInfractions((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };

  const onAddInfraction = () => {
    setInfractions((current) => [
      ...current,
      createEmptyInfraction((current.length + 1) * 10),
    ]);
  };

  const onRemoveInfraction = (index) => {
    setInfractions((current) => (current.length <= 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setNotice('');
    const cleaned = infractions
      .map((item, index) => ({
        ...item,
        label: String(item.label || '').trim(),
        deductionPercent: Number(item.deductionPercent || 0),
        description: String(item.description || '').trim(),
        order: Number(item.order ?? (index + 1) * 10),
      }))
      .filter((item) => item.label);

    if (!cleaned.length) {
      setNotice('Agrega al menos una falta o conducta con nombre.');
      return;
    }

    if (cleaned.some((item) => item.deductionPercent < 0 || item.deductionPercent > 100)) {
      setNotice('Cada descuento debe estar entre 0% y 100%.');
      return;
    }

    try {
      await onSave?.({
        startingScore: Number(startingScore || 100),
        infractions: cleaned,
      });
      setNotice('Política de convivencia guardada.');
    } catch (error) {
      setNotice(error?.response?.data?.message || error?.message || 'No se pudo guardar la política.');
    }
  };

  return (
    <section className="rectoria-coexistence-policy">
      <header className="rectoria-coexistence-policy__hero">
        <div>
          <span className="rectoria-kicker">Convivencia escolar</span>
          <h2>Calificación cuantitativa de disciplina</h2>
          <p>
            Todos los alumnos parten de un puntaje base de 100. Define las faltas del cuadro de disciplina y los
            puntos que se descuentan cuando un docente registra una observación de convivencia.
          </p>
        </div>
        <div className="rectoria-coexistence-policy__score-pill">
          <strong>{Number(startingScore || 100)}%</strong>
          <span>puntaje inicial</span>
        </div>
      </header>

      {loading ? <p className="campus-panel__meta">Cargando política de convivencia...</p> : null}

      <form className="rectoria-coexistence-policy__form" onSubmit={onSubmit}>
        <label className="rectoria-coexistence-policy__field">
          <span>Puntaje inicial de disciplina</span>
          <input
            max={100}
            min={0}
            onChange={(event) => setStartingScore(event.target.value)}
            step={1}
            type="number"
            value={startingScore}
          />
          <small>Recomendado: 100. El alumno no baja de 0.</small>
        </label>

        <div className="rectoria-coexistence-policy__list-head">
          <div>
            <h3>Faltas y descuentos</h3>
            <p>{activeCount} conducta{activeCount === 1 ? '' : 's'} activa{activeCount === 1 ? '' : 's'} para docentes.</p>
          </div>
          <button className="rectoria-coexistence-policy__add-btn" onClick={onAddInfraction} type="button">
            <span aria-hidden="true">+</span>
            Agregar falta
          </button>
        </div>

        <div className="rectoria-coexistence-policy__list">
          {groupedInfractions.map((group) => (
            <section className="rectoria-coexistence-policy__group" key={group.key}>
              {groupedInfractions.length > 1 || group.key !== '_other' ? (
                <h4 className="rectoria-coexistence-policy__group-title">{group.label}</h4>
              ) : null}
              {group.items.map(({ item, index }) => (
                <article className={`rectoria-coexistence-policy__card${item.active === false ? ' is-inactive' : ''}`} key={`${item.key || item.code || 'new'}-${index}`}>
                  <div className="rectoria-coexistence-policy__card-top">
                    <span className="rectoria-coexistence-policy__card-index">
                      {item.code ? `Falta ${item.code}` : `Falta ${index + 1}`}
                    </span>
                    <button
                      aria-label={`Quitar falta ${item.code || index + 1}`}
                      className="rectoria-coexistence-policy__remove-btn"
                      disabled={infractions.length <= 1}
                      onClick={() => onRemoveInfraction(index)}
                      type="button"
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="rectoria-coexistence-policy__card-grid">
                    <label>
                      <span>Código</span>
                      <input
                        onChange={(event) => onChangeInfraction(index, 'code', event.target.value)}
                        placeholder="Ej. C1"
                        value={item.code}
                      />
                    </label>
                    <label>
                      <span>Puntos a descontar</span>
                      <input
                        max={100}
                        min={0}
                        onChange={(event) => onChangeInfraction(index, 'deductionPercent', event.target.value)}
                        step={1}
                        type="number"
                        value={item.deductionPercent}
                      />
                    </label>
                    <label className="rectoria-coexistence-policy__toggle">
                      <input
                        checked={item.active !== false}
                        onChange={(event) => onChangeInfraction(index, 'active', event.target.checked)}
                        type="checkbox"
                      />
                      <span>Activa para docentes</span>
                    </label>
                  </div>
                  <label>
                    <span>Nombre de la falta</span>
                    <input
                      onChange={(event) => onChangeInfraction(index, 'label', event.target.value)}
                      placeholder="Ej. El estudiante llega tarde al colegio sin justificación"
                      value={item.label}
                    />
                  </label>
                  <label>
                    <span>Descripción (opcional)</span>
                    <input
                      onChange={(event) => onChangeInfraction(index, 'description', event.target.value)}
                      placeholder="Detalle breve de cuándo aplica"
                      value={item.description}
                    />
                  </label>
                </article>
              ))}
            </section>
          ))}
        </div>

        <footer className="rectoria-coexistence-policy__footer">
          <div className="rectoria-coexistence-policy__footer-actions">
            <button className="rectoria-coexistence-policy__save-btn" disabled={saving || loading} type="submit">
              {saving ? 'Guardando...' : 'Guardar política'}
            </button>
            <button className="rectoria-coexistence-policy__add-btn is-quiet" onClick={onAddInfraction} type="button">
              <span aria-hidden="true">+</span>
              Otra falta
            </button>
          </div>
          <p className="campus-panel__meta">
            Los docentes verán estas faltas al registrar una observación de convivencia. El descuento se aplica
            sobre el puntaje inicial de 100.
          </p>
        </footer>
        {notice ? <p className="rectoria-coexistence-policy__notice">{notice}</p> : null}
      </form>
    </section>
  );
}
