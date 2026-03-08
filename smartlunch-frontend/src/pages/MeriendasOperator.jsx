import { useEffect, useMemo, useState } from 'react';
import DismissibleNotice from '../components/DismissibleNotice';
import {
  getMeriendaOperatorSubscriptions,
  saveMeriendaOperatorIntake,
} from '../services/meriendasOperator.service';

const todayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const statusLabel = {
  pending: 'Sin registrar',
  ate: 'Comió',
  not_ate: 'No comió',
};

function MeriendasOperator() {
  const [date, setDate] = useState(todayIso);
  const [search, setSearch] = useState('');
  const [showStudentOptions, setShowStudentOptions] = useState(false);
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState('');
  const [draftBySubscription, setDraftBySubscription] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const clearMessages = () => {
    setError('');
    setOk('');
  };

  const loadSubscriptions = async (params = {}) => {
    setLoading(true);
    clearMessages();
    try {
      const response = await getMeriendaOperatorSubscriptions({
        date: params.date || date,
        q: params.q ?? search,
      });
      const items = response.data?.subscriptions || [];
      setSubscriptions(items);
      setDraftBySubscription((prev) => {
        const next = { ...prev };
        items.forEach((item) => {
          const id = String(item._id);
          if (!next[id]) {
            next[id] = {
              ateStatus: item.intake?.ateStatus || 'pending',
              observations: item.intake?.observations || '',
            };
          }
        });
        return next;
      });

      if (!items.some((item) => String(item._id) === String(selectedSubscriptionId))) {
        setSelectedSubscriptionId(items[0]?._id || '');
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo cargar el portal de meriendas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscriptions({ date, q: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const selectedSubscription = useMemo(
    () => subscriptions.find((item) => String(item._id) === String(selectedSubscriptionId)) || null,
    [subscriptions, selectedSubscriptionId]
  );

  const selectedDraft = useMemo(() => {
    if (!selectedSubscription) {
      return { ateStatus: 'pending', observations: '' };
    }

    return (
      draftBySubscription[String(selectedSubscription._id)] || {
        ateStatus: selectedSubscription.intake?.ateStatus || 'pending',
        observations: selectedSubscription.intake?.observations || '',
      }
    );
  }, [selectedSubscription, draftBySubscription]);

  const filteredStudentOptions = useMemo(() => {
    const query = String(search || '').trim().toLowerCase();
    if (!query) {
      return subscriptions;
    }

    return subscriptions.filter((item) => {
      const childName = String(item.childName || '').toLowerCase();
      const childGrade = String(item.childGrade || '').toLowerCase();
      const childDocument = String(item.childDocument || '').toLowerCase();
      const parentName = String(item.parentName || '').toLowerCase();
      const parentUsername = String(item.parentUsername || '').toLowerCase();
      return (
        childName.includes(query) ||
        childGrade.includes(query) ||
        childDocument.includes(query) ||
        parentName.includes(query) ||
        parentUsername.includes(query)
      );
    });
  }, [subscriptions, search]);

  const onSearch = async (event) => {
    event.preventDefault();
    await loadSubscriptions({ date, q: search });
  };

  const onChangeStatus = (subscriptionId, status) => {
    const id = String(subscriptionId);
    setDraftBySubscription((prev) => ({
      ...prev,
      [id]: {
        ateStatus: prev[id]?.ateStatus === status ? 'pending' : status,
        observations: prev[id]?.observations || '',
      },
    }));
  };

  const onChangeObservations = (subscriptionId, observations) => {
    const id = String(subscriptionId);
    setDraftBySubscription((prev) => ({
      ...prev,
      [id]: {
        ateStatus: prev[id]?.ateStatus || 'pending',
        observations,
      },
    }));
  };

  const onSaveRecord = async () => {
    if (!selectedSubscription) {
      return;
    }

    const id = String(selectedSubscription._id);
    const draft = draftBySubscription[id] || { ateStatus: 'pending', observations: '' };

    setSaving(true);
    clearMessages();
    try {
      const response = await saveMeriendaOperatorIntake(id, {
        date,
        ateStatus: draft.ateStatus,
        observations: draft.observations,
      });

      const saved = response.data || {};

      setSubscriptions((prev) =>
        prev.map((item) => {
          if (String(item._id) !== id) {
            return item;
          }
          return {
            ...item,
            intake: {
              ...(item.intake || {}),
              ateStatus: saved.ateStatus || draft.ateStatus,
              observations: saved.observations || draft.observations,
              updatedAt: saved.updatedAt || new Date().toISOString(),
            },
          };
        })
      );
      setOk('Registro de alimentación guardado.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar el registro de alimentación.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-portal">
      <section className="admin-hero">
        <div className="admin-hero-main">
          <p className="admin-kicker">SmartLunch Meriendas</p>
          <h2>Portal Tutor de alimentación</h2>
          <p>Registra si el alumno comió, observaciones del comportamiento y revisa recomendaciones/restricciones alimentarias.</p>
        </div>
      </section>

      <DismissibleNotice onClose={() => setError('')} text={error} type="error" />
      <DismissibleNotice onClose={() => setOk('')} text={ok} type="ok" />

      <section className="panel admin-section">
        <form className="admin-form-grid" onSubmit={onSearch}>
          <label>
            Fecha de control
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
          <label>
            Buscar alumno
            <div className="product-picker">
              <input
                placeholder="Nombre, grado, documento o padre"
                value={search}
                onFocus={() => setShowStudentOptions(true)}
                onBlur={() => {
                  setTimeout(() => {
                    setShowStudentOptions(false);
                  }, 120);
                }}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setShowStudentOptions(true);
                }}
              />
              {showStudentOptions ? (
                <div className="product-picker-menu">
                  {filteredStudentOptions.map((item) => (
                    <button
                      className="product-picker-option"
                      key={item._id}
                      onMouseDown={() => {
                        setSelectedSubscriptionId(item._id);
                        setSearch(item.childName || 'Alumno');
                        setShowStudentOptions(false);
                      }}
                      type="button"
                    >
                      {item.childName || 'Alumno'} {item.childGrade ? `(${item.childGrade})` : ''}
                    </button>
                  ))}
                  {filteredStudentOptions.length === 0 ? (
                    <p className="product-picker-empty">Sin coincidencias</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </label>
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </form>
      </section>

      <section className="panel admin-section">
        <h4>Alumnos suscritos ({subscriptions.length})</h4>
        <div className="page-scroll-list">
          <table className="simple-table">
            <thead>
              <tr>
                <th>Alumnos</th>
                <th>Padre</th>
                <th>Recomendaciones del padre</th>
                <th>Restricciones alimentarias</th>
                <th>Seleccionar</th>
                <th className="followup-cell">Seguimiento</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((item) => {
                const isActive = String(item._id) === String(selectedSubscriptionId);
                return (
                  <tr key={item._id}>
                    <td>
                      <strong>{item.childName || 'Alumno'}</strong>
                      <br />
                      <small>Estado: {statusLabel[item.intake?.ateStatus] || statusLabel.pending}</small>
                    </td>
                    <td>{item.parentName || 'N/A'} ({item.parentUsername || 'N/A'})</td>
                    <td>{item.parentRecommendations || 'Sin recomendaciones registradas.'}</td>
                    <td>{item.childFoodRestrictions || item.childAllergies || 'Sin restricciones alimentarias registradas.'}</td>
                    <td>
                      <button
                        className="btn"
                        onClick={() => setSelectedSubscriptionId(item._id)}
                        type="button"
                      >
                        {isActive ? 'Seleccionado' : 'Seleccionar'}
                      </button>
                    </td>
                    <td className="followup-cell">
                      {item.intake?.updatedAt ? <span className="followup-check">✓</span> : <span>-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {subscriptions.length === 0 ? <p>No hay suscripciones activas para la fecha seleccionada.</p> : null}
      </section>

      <section className="panel admin-section">
        {!selectedSubscription ? <p>Selecciona un alumno desde la tabla para registrar consumo.</p> : null}
        {selectedSubscription ? (
          <>
            <h4>Registro de consumo: {selectedSubscription.childName || 'Alumno'}</h4>
            <p>Padre: {selectedSubscription.parentName || 'N/A'} ({selectedSubscription.parentUsername || 'N/A'})</p>

            <div className="row gap">
              <label className="meriendas-check-option">
                <input
                  checked={selectedDraft.ateStatus === 'ate'}
                  onChange={() => onChangeStatus(selectedSubscription._id, 'ate')}
                  type="checkbox"
                />
                Comió
              </label>
              <label className="meriendas-check-option">
                <input
                  checked={selectedDraft.ateStatus === 'not_ate'}
                  onChange={() => onChangeStatus(selectedSubscription._id, 'not_ate')}
                  type="checkbox"
                />
                No comió
              </label>
            </div>

            <label>
              Observaciones
              <textarea
                placeholder="Ej: rechazó vegetales al inicio, luego aceptó con apoyo"
                rows={4}
                value={selectedDraft.observations}
                onChange={(event) => onChangeObservations(selectedSubscription._id, event.target.value)}
              />
            </label>

            <button className="btn btn-primary" disabled={saving} onClick={onSaveRecord} type="button">
              {saving ? 'Guardando...' : 'Guardar registro'}
            </button>
          </>
        ) : null}
      </section>
    </div>
  );
}

export default MeriendasOperator;
