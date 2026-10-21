import { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteSuperAdminDemo, listSuperAdminDemos } from '../services/superAdmin.service';

const STATUS_LABELS = {
  provisioning: 'Creando',
  ready: 'Activa',
  failed: 'Falló',
  expired: 'Expirada',
  deleted: 'Eliminada',
};

function formatDate(value) {
  if (!value) {
    return '—';
  }
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function whatsappHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  return `https://wa.me/${digits.length === 10 ? `57${digits}` : digits}`;
}

export default function SuperAdminDemosPanel() {
  const [demos, setDemos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await listSuperAdminDemos();
      setDemos(Array.isArray(data?.demos) ? data.demos : []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudieron cargar las demos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totals = useMemo(() => ({
    total: demos.length,
    active: demos.filter((demo) => demo.status === 'ready').length,
    loggedIn: demos.filter((demo) => demo.loginCount > 0).length,
  }), [demos]);

  const onDelete = async (demo) => {
    if (!window.confirm(`¿Eliminar la demo de ${demo.schoolName}? El lead se conserva.`)) {
      return;
    }
    setDeletingId(demo._id);
    try {
      await deleteSuperAdminDemo(demo._id);
      await load();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo eliminar la demo.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <>
      <section className="sa-kpi-grid" aria-label="Resumen de demos">
        <article className="sa-kpi-card">
          <span>Leads de demo</span>
          <strong>{totals.total}</strong>
          <p>Formularios completados</p>
        </article>
        <article className="sa-kpi-card">
          <span>Demos activas</span>
          <strong>{totals.active}</strong>
          <p>Se eliminan a los 7 días</p>
        </article>
        <article className="sa-kpi-card">
          <span>Iniciaron sesión</span>
          <strong>{totals.loggedIn}</strong>
          <p>Entraron a la app al menos una vez</p>
        </article>
      </section>

      <section className="sa-panel">
        <div className="sa-panel__head">
          <div>
            <h2>Demos</h2>
            <p>Colegios creados desde “Prueba la demo gratis” en comergio.com.</p>
          </div>
          <div className="sa-actions">
            <button className="sa-btn is-secondary" disabled={loading} onClick={load} type="button">Actualizar</button>
          </div>
        </div>

        {error ? <p className="sa-message is-error">{error}</p> : null}

        {!loading && !demos.length ? <p className="sa-muted">Aún no hay demos creadas.</p> : null}

        {demos.length ? (
          <div className="sa-demos-table-wrap">
            <table className="sa-demos-table">
              <thead>
                <tr>
                  <th>Colegio</th>
                  <th>Contacto</th>
                  <th>Hijos</th>
                  <th>Creada</th>
                  <th>Sesión</th>
                  <th>Estado</th>
                  <th>Expira</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {demos.map((demo) => {
                  const isLive = demo.status === 'ready' || demo.status === 'failed' || demo.status === 'provisioning';
                  const waHref = whatsappHref(demo.phone);
                  return (
                    <tr key={demo._id}>
                      <td>
                        <strong>{demo.schoolName}</strong>
                        <small>{demo.city}</small>
                      </td>
                      <td>
                        <strong>{demo.contactName}</strong>
                        <small><a href={`mailto:${demo.email}`}>{demo.email}</a></small>
                        <small>{waHref ? <a href={waHref} target="_blank" rel="noreferrer">{demo.phone}</a> : demo.phone}</small>
                      </td>
                      <td>
                        {demo.children.map((child) => (
                          <small key={`${child.name}-${child.gradeLabel}`}>{child.name} · {child.gradeLabel}</small>
                        ))}
                      </td>
                      <td>{formatDate(demo.createdAt)}</td>
                      <td>
                        {demo.loginCount > 0 ? (
                          <>
                            <strong>{demo.loginCount} {demo.loginCount === 1 ? 'vez' : 'veces'}</strong>
                            <small>Última: {formatDate(demo.lastLoginAt)}</small>
                          </>
                        ) : <span className="sa-muted">No ha entrado</span>}
                      </td>
                      <td>
                        <span className={`sa-demo-status is-${demo.status}`} title={demo.errorMessage || ''}>
                          {STATUS_LABELS[demo.status] || demo.status}
                        </span>
                      </td>
                      <td>{demo.deletedAt ? formatDate(demo.deletedAt) : formatDate(demo.expiresAt)}</td>
                      <td>
                        {isLive ? (
                          <button
                            className="sa-btn is-danger"
                            disabled={deletingId === demo._id}
                            onClick={() => onDelete(demo)}
                            type="button"
                          >
                            {deletingId === demo._id ? 'Eliminando…' : 'Eliminar'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  );
}
