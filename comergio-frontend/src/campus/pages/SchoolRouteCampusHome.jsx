import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/auth.store';
import '../../pages/AcademicSecretaryDashboard.css';
import {
  getCampusSchoolRouteManifest,
  reorderCampusSchoolRouteStops,
  resetCampusSchoolRouteDay,
  runCampusSchoolRouteStopAction,
} from '../services/campus.service';

const statusLabels = {
  pending: 'Pendiente',
  on_way: 'En camino',
  arrived: 'En puerta',
  picked_up: 'Recogido',
  skipped: 'Omitido',
};

function formatStudentMeta(student) {
  return [student.grade, student.course].filter(Boolean).join(' · ') || 'Sin curso asignado';
}

function getNextStop(stops) {
  return (stops || []).find((stop) => ['on_way', 'arrived'].includes(stop.status))
    || (stops || []).find((stop) => stop.status === 'pending')
    || null;
}

function buildNotificationSummary(results = []) {
  const created = results.reduce((total, result) => total + Number(result?.notificationsCreated || 0), 0);
  const tokens = results.reduce((total, result) => total + Number(result?.tokensFound || 0), 0);

  if (!created) {
    return 'No hay acudientes con vinculo activo para esta parada.';
  }

  return tokens > 0
    ? `${created} notificaciones creadas y ${tokens} dispositivos encontrados.`
    : `${created} notificaciones creadas. El acudiente las vera al entrar al portal.`;
}

function SchoolRouteCampusHome() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [notice, setNotice] = useState({ type: 'info', text: '' });

  const manifestQuery = useQuery({
    queryKey: ['campus', 'school-route', 'manifest'],
    queryFn: getCampusSchoolRouteManifest,
    staleTime: 30_000,
  });

  const route = manifestQuery.data?.route || { stops: [] };
  const stops = route.stops || [];
  const nextStop = getNextStop(stops);
  const completedStops = stops.filter((stop) => ['picked_up', 'skipped'].includes(stop.status)).length;
  const pickedUpStops = stops.filter((stop) => stop.status === 'picked_up').length;
  const pendingStops = stops.filter((stop) => ['pending', 'on_way', 'arrived'].includes(stop.status)).length;
  const progress = stops.length
    ? Math.round((completedStops / stops.length) * 100)
    : 0;

  function updateRouteCache(data) {
    if (!data?.route) {
      return;
    }
    queryClient.setQueryData(['campus', 'school-route', 'manifest'], (currentData) => ({
      ...(currentData || {}),
      route: data.route,
    }));
  }

  const reorderMutation = useMutation({
    mutationFn: reorderCampusSchoolRouteStops,
    onSuccess: (data) => updateRouteCache(data),
    onError: (error) => setNotice({ type: 'error', text: error?.response?.data?.message || 'No fue posible reordenar la ruta.' }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ stopId, action }) => runCampusSchoolRouteStopAction(stopId, action),
    onSuccess: (data, variables) => {
      updateRouteCache(data);
      const actionText = statusLabels[variables.action] || 'Actualizado';
      setNotice({ type: 'success', text: `${actionText}. ${buildNotificationSummary(data.notificationResults)}` });
    },
    onError: (error) => setNotice({ type: 'error', text: error?.response?.data?.message || 'No fue posible enviar la actualizacion.' }),
  });

  const resetMutation = useMutation({
    mutationFn: resetCampusSchoolRouteDay,
    onSuccess: (data) => {
      updateRouteCache(data);
      setNotice({ type: 'success', text: 'Ruta lista para una nueva jornada.' });
    },
    onError: (error) => setNotice({ type: 'error', text: error?.response?.data?.message || 'No fue posible reiniciar la ruta.' }),
  });

  function moveStop(stopId, direction) {
    const currentIndex = stops.findIndex((stop) => stop.id === stopId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= stops.length) {
      return;
    }
    const nextStops = [...stops];
    const [movedStop] = nextStops.splice(currentIndex, 1);
    nextStops.splice(targetIndex, 0, movedStop);
    reorderMutation.mutate(nextStops.map((stop) => stop.id));
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <section className="academic-secretary campus-school-route campus-school-route--secretary">
      <header className="academic-secretary__hero campus-school-route__hero">
        <div>
          <span className="academic-secretary__eyebrow">Comergio - {user?.schoolId || 'Colegio no definido'}</span>
          <h1>Portal Ruta Escolar</h1>
          <p>Organiza el orden de recogida, actualiza el estado de cada parada y notifica a los acudientes durante la operación.</p>
        </div>
        <div className="campus-school-route__session-card">
          <div>
            <span>Sesión activa</span>
            <strong>{user?.name || user?.username || 'Conductor'}</strong>
            <small>{user?.username || 'Usuario de ruta'}</small>
          </div>
          <button className="academic-secretary__refresh" type="button" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <nav className="academic-secretary__tabs" aria-label="Secciones de ruta escolar">
        <button className="academic-secretary__tab is-active" type="button">Operación de recogida</button>
      </nav>

      {notice.text ? <div className={`academic-secretary__message is-${notice.type === 'error' ? 'error' : 'success'}`}><span>{notice.text}</span></div> : null}

      <section className="academic-secretary__kpis">
        <article className="academic-secretary__kpi"><span>Ruta asignada</span><strong>{route.routeName || 'Ruta escolar'}</strong></article>
        <article className="academic-secretary__kpi"><span>Progreso</span><strong>{progress}%</strong></article>
        <article className="academic-secretary__kpi"><span>Paradas asignadas</span><strong>{stops.length}</strong></article>
        <article className="academic-secretary__kpi"><span>Recogidos</span><strong>{pickedUpStops}</strong></article>
        <article className="academic-secretary__kpi"><span>Pendientes</span><strong>{pendingStops}</strong></article>
      </section>

      <section className="academic-secretary__grid">
        <article className="academic-secretary__panel">
          <div className="academic-secretary__panel-head">
            <div>
              <h2>Parada actual</h2>
              <p>Actualiza el estado operativo y avisa al acudiente correspondiente.</p>
            </div>
          </div>
          {nextStop ? (
            <div className="academic-secretary__subform academic-secretary__subform--soft">
              <div className="campus-school-route__current-head">
                <div>
                  <span className="academic-secretary__badge">Siguiente parada</span>
                  <h3>{nextStop.studentName}</h3>
                  <p>{formatStudentMeta(nextStop)}</p>
                </div>
                <span className={`academic-secretary__status campus-school-route__status is-${nextStop.status}`}>{statusLabels[nextStop.status] || nextStop.status}</span>
              </div>
              <div className="academic-secretary__timeline-item">
                <strong>Dirección de recogida</strong>
                <span>{nextStop.pickupAddress || 'Dirección pendiente por secretaria academica.'}</span>
              </div>
              {nextStop.notes ? (
                <div className="academic-secretary__timeline-item">
                  <strong>Nota de recogida</strong>
                  <span>{nextStop.notes}</span>
                </div>
              ) : null}
              <div className="academic-secretary__actions">
                <button className="academic-secretary__promote-button" type="button" onClick={() => actionMutation.mutate({ stopId: nextStop.id, action: 'on_way' })}>Voy en camino</button>
                <button className="academic-secretary__promote-button" type="button" onClick={() => actionMutation.mutate({ stopId: nextStop.id, action: 'arrived' })}>Estoy en puerta</button>
                <button className="btn btn-primary" type="button" onClick={() => actionMutation.mutate({ stopId: nextStop.id, action: 'picked_up' })}>Recogido</button>
              </div>
            </div>
          ) : <p>No hay paradas pendientes para operar.</p>}
        </article>

        <article className="academic-secretary__panel">
          <div className="academic-secretary__panel-head"><div><h2>Control de jornada</h2><p>Resumen rápido para reiniciar operación cuando empieza una nueva ruta.</p></div></div>
          <div className="academic-secretary__summary-grid">
            <div className="academic-secretary__mini-card is-neutral"><span>Completadas</span><strong>{completedStops}</strong></div>
            <div className="academic-secretary__mini-card is-good"><span>Recogidos</span><strong>{pickedUpStops}</strong></div>
            <div className="academic-secretary__mini-card is-alert"><span>Pendientes</span><strong>{pendingStops}</strong></div>
            <div className="academic-secretary__mini-card is-accent"><span>Avance</span><strong>{progress}%</strong></div>
          </div>
          <div className="academic-secretary__actions campus-school-route__reset-row">
            <button className="academic-secretary__refresh" disabled={resetMutation.isPending || stops.length === 0} onClick={() => resetMutation.mutate()} type="button">Reiniciar jornada</button>
          </div>
        </article>
      </section>

      <section className="academic-secretary__panel">
        <div className="academic-secretary__panel-head">
          <div>
            <h2>Orden de recogida</h2>
            <p>El conductor puede reorganizar la secuencia y actualizar el estado de cada parada.</p>
          </div>
        </div>

        {manifestQuery.isLoading ? <p className="campus-panel__meta">Cargando ruta escolar...</p> : null}
        {!manifestQuery.isLoading && stops.length === 0 ? <p className="campus-panel__meta">No hay estudiantes asignados a esta ruta.</p> : null}

        {stops.length > 0 ? (
          <div className="academic-secretary__table-wrap">
            <table className="academic-secretary__table campus-school-route__table">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Alumno</th>
                  <th>Recogida</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {stops.map((stop, index) => (
                  <tr key={stop.id}>
                    <td><strong>{index + 1}</strong></td>
                    <td><strong>{stop.studentName}</strong><div>{formatStudentMeta(stop)}</div></td>
                    <td><strong>{stop.pickupAddress || 'Sin dirección asignada'}</strong>{stop.notes ? <div>{stop.notes}</div> : null}</td>
                    <td><span className={`academic-secretary__status campus-school-route__status is-${stop.status}`}>{statusLabels[stop.status] || stop.status}</span></td>
                    <td>
                      <div className="academic-secretary__row-actions campus-school-route__table-actions">
                        <button className="academic-secretary__row-icon-button" aria-label={`Subir a ${stop.studentName}`} disabled={index === 0 || reorderMutation.isPending} type="button" onClick={() => moveStop(stop.id, -1)}>↑</button>
                        <button className="academic-secretary__row-icon-button" aria-label={`Bajar a ${stop.studentName}`} disabled={index === stops.length - 1 || reorderMutation.isPending} type="button" onClick={() => moveStop(stop.id, 1)}>↓</button>
                        <button className="academic-secretary__promote-button" type="button" onClick={() => actionMutation.mutate({ stopId: stop.id, action: 'on_way' })}>Camino</button>
                        <button className="academic-secretary__promote-button" type="button" onClick={() => actionMutation.mutate({ stopId: stop.id, action: 'arrived' })}>Puerta</button>
                        <button className="academic-secretary__row-icon-button is-primary" type="button" onClick={() => actionMutation.mutate({ stopId: stop.id, action: 'picked_up' })}>✓</button>
                        <button className="academic-secretary__promote-button" type="button" onClick={() => actionMutation.mutate({ stopId: stop.id, action: 'skipped' })}>Omitir</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  );
}

export default SchoolRouteCampusHome;