import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import InstitutionalPortalHeader from '../../components/InstitutionalPortalHeader';
import GoogleSchoolRouteMap from '../../components/routes/GoogleSchoolRouteMap';
import { getGoogleMapsApiKey } from '../../components/routes/googleMapsLoader';
import { LOGIN_PATH } from '../../lib/authNavigation';
import { getSchoolDisplayName } from '../../lib/schools';
import useAuthStore from '../../store/auth.store';
import {
  getCampusSchoolRouteManifest,
  reorderCampusSchoolRouteStops,
  resetCampusSchoolRouteDay,
  runCampusSchoolRouteStopAction,
} from '../services/campus.service';
import './SchoolRouteCampusHome.css';

const statusLabels = {
  pending: 'Pendiente',
  on_way: 'En camino',
  arrived: 'En puerta',
  picked_up: 'Recogido',
  skipped: 'Omitido',
};

function getInitials(name = '') {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'AL';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
}

function formatStudentMeta(stop) {
  return [stop.studentGrade || stop.grade, stop.studentCourse || stop.course]
    .filter(Boolean)
    .join(' · ') || 'Sin curso asignado';
}

function getNextStop(stops) {
  return (stops || []).find((stop) => ['on_way', 'arrived'].includes(stop.status))
    || (stops || []).find((stop) => stop.status === 'pending')
    || null;
}

function hasCoordinates(stop) {
  const lat = Number(stop?.latitude);
  const lng = Number(stop?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function buildGoogleMapsDirectionsUrl(stops = []) {
  const points = (stops || [])
    .filter((stop) => hasCoordinates(stop))
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
    .map((stop) => `${Number(stop.latitude)},${Number(stop.longitude)}`);

  if (!points.length) return '';
  if (points.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(points[0])}`;
  }

  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1);
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  if (waypoints.length) {
    params.set('waypoints', waypoints.join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildNotificationSummary(results = []) {
  const created = results.reduce((total, result) => total + Number(result?.notificationsCreated || 0), 0);
  const tokens = results.reduce((total, result) => total + Number(result?.tokensFound || 0), 0);

  if (!created) {
    return 'Sin acudientes vinculados para notificar en esta parada.';
  }

  return tokens > 0
    ? `Notificado · ${created} aviso${created === 1 ? '' : 's'} · ${tokens} dispositivo${tokens === 1 ? '' : 's'}.`
    : `Notificado · ${created} aviso${created === 1 ? '' : 's'} al portal del acudiente.`;
}

function buildActionNotice(action, notificationResults) {
  const summary = buildNotificationSummary(notificationResults);
  if (action === 'on_way') return `Voy en camino. ${summary}`;
  if (action === 'arrived') return `En puerta. ${summary}`;
  if (action === 'picked_up') return `Alumno recogido. ${summary}`;
  if (action === 'skipped') return `Continuar sin el alumno. ${summary}`;
  return summary;
}

function formatRouteMetrics(metrics) {
  if (!metrics) {
    return { distanceLabel: '—', durationLabel: '—' };
  }
  const km = Number(metrics.distanceMeters || 0) / 1000;
  const minutes = Math.round(Number(metrics.durationSeconds || 0) / 60);
  return {
    distanceLabel: km > 0 ? `${km.toFixed(1)} km` : '—',
    durationLabel: minutes > 0 ? `${minutes} min` : '—',
  };
}

function IconBus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 16.5v2M17 16.5v2M4 12h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="14" r="1.1" fill="currentColor" />
      <circle cx="16" cy="14" r="1.1" fill="currentColor" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 20V6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V20" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 9h2M13 9h2M9 13h2M13 13h2M9 17h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconRoute() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 7.5c4 0 4 9 8 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M20 5v5h-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 8v4.5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconNote() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4.5h7.5L18 8v11.5H7V4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M14.5 4.5V8H18M9.5 12h5M9.5 15.5h3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function IconGrad() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 10.5 12 6l9 4.5-9 4.5-9-4.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M7 13.2v3.3c0 .8 2.2 2 5 2s5-1.2 5-2v-3.3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function IconLeave() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 5h4.5A1.5 1.5 0 0 1 20 6.5v11A1.5 1.5 0 0 1 18.5 19H14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10 16.5 4.5 12 10 7.5M4.5 12H16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function IconExternal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 5h5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 14 19 5M19 14v4.5A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-11A1.5 1.5 0 0 1 6.5 6H11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowUp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m7 11 5-5 5 5M12 6v12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m7 13 5 5 5-5M12 6v12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeroBusArt() {
  return (
    <svg className="route-portal__hero-art" viewBox="0 0 280 180" fill="none" aria-hidden="true">
      <rect x="18" y="118" width="244" height="18" rx="9" fill="#dbeafe" />
      <path d="M30 126h220" stroke="#93c5fd" strokeWidth="3" strokeDasharray="8 10" strokeLinecap="round" />
      <path d="M40 70h40l12-18h70l18 18h40v48H40V70Z" fill="#16a34a" />
      <path d="M84 70 94 56h66l10 14" stroke="#bbf7d0" strokeWidth="3" />
      <rect x="58" y="82" width="34" height="22" rx="4" fill="#ecfdf5" />
      <rect x="102" y="82" width="34" height="22" rx="4" fill="#ecfdf5" />
      <rect x="146" y="82" width="34" height="22" rx="4" fill="#ecfdf5" />
      <rect x="190" y="82" width="28" height="22" rx="4" fill="#bbf7d0" />
      <circle cx="78" cy="126" r="12" fill="#0f172a" />
      <circle cx="78" cy="126" r="5" fill="#e2e8f0" />
      <circle cx="188" cy="126" r="12" fill="#0f172a" />
      <circle cx="188" cy="126" r="5" fill="#e2e8f0" />
      <circle cx="210" cy="48" r="16" fill="#fef3c7" stroke="#f59e0b" strokeWidth="3" />
      <path d="M210 40v10l6 4" stroke="#b45309" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M48 42c18-16 42-20 64-12" stroke="#93c5fd" strokeWidth="4" strokeLinecap="round" />
      <path d="M188 36c22 8 38 28 42 52" stroke="#86efac" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function CurrentStopArt() {
  return (
    <svg className="route-portal__stop-art" viewBox="0 0 220 140" fill="none" aria-hidden="true">
      <rect x="12" y="18" width="196" height="104" rx="18" fill="#eff6ff" />
      <path d="M28 96c28-28 56-28 84 0s56 28 84 0" stroke="#93c5fd" strokeWidth="3" strokeDasharray="6 8" strokeLinecap="round" />
      <path d="M48 70h34l10-14h42l14 14h24v34H48V70Z" fill="#16a34a" />
      <rect x="62" y="78" width="22" height="14" rx="3" fill="#ecfdf5" />
      <rect x="92" y="78" width="22" height="14" rx="3" fill="#ecfdf5" />
      <rect x="122" y="78" width="22" height="14" rx="3" fill="#bbf7d0" />
      <circle cx="74" cy="108" r="8" fill="#0f172a" />
      <circle cx="142" cy="108" r="8" fill="#0f172a" />
      <circle cx="168" cy="52" r="12" fill="#fee2e2" stroke="#ef4444" strokeWidth="2.5" />
      <circle cx="168" cy="52" r="4" fill="#ef4444" />
    </svg>
  );
}

function SchoolRouteCampusHome() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const mapSectionRef = useRef(null);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [notice, setNotice] = useState({ type: 'info', text: '' });
  const [routeMapMetrics, setRouteMapMetrics] = useState(null);
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [alertMinutes, setAlertMinutes] = useState(3);
  const [countdown, setCountdown] = useState(null);
  const [countdownStopId, setCountdownStopId] = useState('');
  const schoolName = getSchoolDisplayName(user, 'Colegio');
  const mapsConfigured = Boolean(getGoogleMapsApiKey());
  const metricsLabels = useMemo(() => formatRouteMetrics(routeMapMetrics), [routeMapMetrics]);

  const manifestQuery = useQuery({
    queryKey: ['campus', 'school-route', 'manifest'],
    queryFn: getCampusSchoolRouteManifest,
    staleTime: 30_000,
  });

  const route = manifestQuery.data?.route || { stops: [], routeName: 'Ruta escolar' };
  const stops = route.stops || [];
  const nextStop = getNextStop(stops);
  const completedStops = stops.filter((stop) => ['picked_up', 'skipped'].includes(stop.status)).length;
  const pickedUpStops = stops.filter((stop) => stop.status === 'picked_up').length;
  const pendingStops = stops.filter((stop) => ['pending', 'on_way', 'arrived'].includes(stop.status)).length;
  const progress = stops.length ? Math.round((completedStops / stops.length) * 100) : 0;
  const routeTitle = route.routeName || 'Ruta escolar';
  const googleMapsUrl = useMemo(() => buildGoogleMapsDirectionsUrl(stops), [stops]);
  const driverName = user?.name || user?.username || 'Conductor';
  const countdownActive = countdown !== null && countdownStopId && nextStop?.id === countdownStopId;
  const countdownExpired = countdownActive && countdown <= 0;
  const onWayDone = ['on_way', 'arrived'].includes(nextStop?.status);

  useEffect(() => {
    if (!countdownActive) return undefined;
    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current === null || current <= 0) return 0;
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdownActive, countdownStopId]);

  useEffect(() => {
    if (!nextStop?.id) {
      setShowAlertPanel(false);
      setCountdown(null);
      setCountdownStopId('');
      return;
    }
    if (countdownStopId && countdownStopId !== nextStop.id) {
      setCountdown(null);
      setCountdownStopId('');
      setShowAlertPanel(false);
    }
  }, [nextStop?.id, countdownStopId]);

  function updateRouteCache(data) {
    if (!data?.route) return;
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
    mutationFn: ({ stopId, action, minutes }) => runCampusSchoolRouteStopAction(
      stopId,
      action,
      action === 'waiting_alert' ? { minutes } : {}
    ),
    onSuccess: (data, variables) => {
      updateRouteCache(data);
      if (variables.action === 'waiting_alert') {
        const minutes = Number(variables.minutes || data.alertMinutes || 0);
        setCountdown(minutes * 60);
        setCountdownStopId(variables.stopId);
        setShowAlertPanel(false);
        setNotice({
          type: 'success',
          text: `En puerta · cronómetro ${minutes} min. ${buildNotificationSummary(data.notificationResults)}`,
        });
        return;
      }
      if (variables.action === 'skipped' || variables.action === 'picked_up') {
        setCountdown(null);
        setCountdownStopId('');
        setShowAlertPanel(false);
      }
      setNotice({
        type: 'success',
        text: buildActionNotice(variables.action, data.notificationResults),
      });
    },
    onError: (error) => setNotice({ type: 'error', text: error?.response?.data?.message || 'No fue posible enviar la actualización.' }),
  });

  const pendingAction = actionMutation.isPending ? actionMutation.variables?.action : '';

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
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= stops.length) return;
    const nextStops = [...stops];
    const [movedStop] = nextStops.splice(currentIndex, 1);
    nextStops.splice(targetIndex, 0, movedStop);
    reorderMutation.mutate(nextStops.map((stop) => stop.id));
  }

  function scrollToMap() {
    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleLogout() {
    logout();
    navigate(LOGIN_PATH, { replace: true });
  }

  const kpiCards = [
    { key: 'route', label: 'Ruta asignada', value: routeTitle, tone: 'green', icon: <IconRoute /> },
    { key: 'progress', label: 'Progreso', value: `${progress}%`, tone: 'blue', icon: <IconRefresh /> },
    { key: 'stops', label: 'Paradas', value: String(stops.length), tone: 'sky', icon: <IconPin /> },
    { key: 'picked', label: 'Recogidos', value: String(pickedUpStops), tone: 'green', icon: <IconUser /> },
    { key: 'pending', label: 'Pendientes', value: String(pendingStops), tone: 'amber', icon: <IconClock /> },
    { key: 'distance', label: 'Distancia', value: metricsLabels.distanceLabel, tone: 'violet', icon: <IconRoute /> },
    { key: 'time', label: 'Tiempo est.', value: metricsLabels.durationLabel, tone: 'teal', icon: <IconClock /> },
  ];

  return (
    <section className="route-portal">
      <InstitutionalPortalHeader
        helperText={schoolName}
        onLogout={handleLogout}
        onRefresh={() => manifestQuery.refetch()}
        portalKicker="Ruta escolar"
        refreshDisabled={manifestQuery.isFetching}
        refreshLabel={manifestQuery.isFetching ? 'Actualizando…' : 'Actualizar ruta'}
        userName={driverName}
      />

      <div className="route-portal__page">
        <header className="route-portal__hero">
          <div className="route-portal__hero-copy">
            <span className="route-portal__pill">Ruta asignada</span>
            <div className="route-portal__hero-title">
              <h1>{routeTitle}</h1>
              <span className="route-portal__hero-bus-icon" aria-hidden="true"><IconBus /></span>
            </div>
            <p>Organiza el orden de recogida, sigue el recorrido en el mapa y notifica a los acudientes durante la operación.</p>
          </div>

          <div className="route-portal__hero-meta">
            <div>
              <span className="route-portal__meta-icon tone-green" aria-hidden="true"><IconBuilding /></span>
              <div>
                <span>Colegio</span>
                <strong>{schoolName}</strong>
              </div>
            </div>
            <div>
              <span className="route-portal__meta-icon tone-blue" aria-hidden="true"><IconUser /></span>
              <div>
                <span>Conductor</span>
                <strong>{driverName}</strong>
              </div>
            </div>
            <div>
              <span className="route-portal__meta-icon tone-sky" aria-hidden="true"><IconPin /></span>
              <div>
                <span>Paradas</span>
                <strong>{stops.length}</strong>
              </div>
            </div>
          </div>

          <div className="route-portal__hero-visual">
            <HeroBusArt />
          </div>
        </header>

        {notice.text ? (
          <div className={`route-portal__notice is-${notice.type === 'error' ? 'error' : 'success'}`}>
            {notice.text}
          </div>
        ) : null}

        <section className="route-portal__kpis" aria-label="Resumen de la ruta">
          {kpiCards.map((card) => (
            <article className={`route-portal__kpi tone-${card.tone}`} key={card.key}>
              <span className="route-portal__kpi-icon" aria-hidden="true">{card.icon}</span>
              <div>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
              </div>
            </article>
          ))}
        </section>

        <section className="route-portal__card route-portal__map-card" ref={mapSectionRef} aria-label="Mapa de la ruta asignada">
          <div className="route-portal__card-head">
            <div>
              <h2>Recorrido · {routeTitle}</h2>
              <p>
                {mapsConfigured
                  ? 'Mapa con Google Maps según el orden de paradas asignadas a esta ruta.'
                  : 'Configura VITE_GOOGLE_MAPS_API_KEY para activar el mapa.'}
              </p>
            </div>
            <div className="route-portal__map-actions">
              <span className={`route-portal__chip${stops.length ? ' is-active' : ''}`}>
                {stops.length ? `${stops.length} parada(s)` : 'Sin paradas'}
              </span>
              {googleMapsUrl ? (
                <a className="route-portal__ghost-btn" href={googleMapsUrl} rel="noopener noreferrer" target="_blank">
                  <IconExternal />
                  Ver en Google Maps
                </a>
              ) : null}
            </div>
          </div>
          <div className="route-portal__map-shell">
            <GoogleSchoolRouteMap
              onMetricsChange={setRouteMapMetrics}
              routeName={routeTitle}
              stops={stops}
            />
            <div className="route-portal__map-destination">
              <span className="route-portal__map-destination-icon" aria-hidden="true"><IconGrad /></span>
              <strong>{schoolName}</strong>
            </div>
          </div>
        </section>

        <section className="route-portal__ops">
          <article className="route-portal__card route-portal__current">
            <div className="route-portal__card-head">
              <div>
                <h2>Parada actual</h2>
                <p>Actualiza el estado operativo y avisa al acudiente correspondiente.</p>
              </div>
            </div>

            {nextStop ? (
              <div className="route-portal__current-body">
                <div className="route-portal__current-main">
                  <div className="route-portal__current-badges">
                    <span className="route-portal__chip is-info">Siguiente parada</span>
                    <span className={`route-portal__status is-${nextStop.status}`}>
                      <IconClock />
                      {statusLabels[nextStop.status] || nextStop.status}
                    </span>
                  </div>
                  <h3>{nextStop.studentName}</h3>
                  <p className="route-portal__current-meta">{formatStudentMeta(nextStop)}</p>

                  <div className="route-portal__detail">
                    <span className="route-portal__detail-icon" aria-hidden="true"><IconPin /></span>
                    <div>
                      <strong>Dirección de recogida</strong>
                      <span>{nextStop.pickupAddress || 'Dirección pendiente por secretaría académica.'}</span>
                    </div>
                  </div>

                  {nextStop.notes ? (
                    <div className="route-portal__detail">
                      <span className="route-portal__detail-icon" aria-hidden="true"><IconNote /></span>
                      <div>
                        <strong>Nota de recogida</strong>
                        <span>{nextStop.notes}</span>
                      </div>
                    </div>
                  ) : null}

                  <div className="route-portal__actions">
                    <button
                      type="button"
                      className={`route-portal__btn is-outline${onWayDone ? ' is-done' : ''}`}
                      disabled={actionMutation.isPending}
                      onClick={() => actionMutation.mutate({ stopId: nextStop.id, action: 'on_way' })}
                    >
                      <IconRoute />
                      {pendingAction === 'on_way' ? 'Notificando…' : (onWayDone ? 'En camino · notificado' : 'Voy en camino')}
                    </button>
                    <button
                      type="button"
                      className={`route-portal__btn is-outline is-alert${showAlertPanel || countdownActive ? ' is-active' : ''}${nextStop.status === 'arrived' || countdownActive ? ' is-done' : ''}`}
                      disabled={actionMutation.isPending || (countdownActive && !countdownExpired)}
                      onClick={() => {
                        if (countdownActive && !countdownExpired) return;
                        setShowAlertPanel((current) => !current);
                      }}
                    >
                      <IconPin />
                      {nextStop.status === 'arrived' || countdownActive ? 'En puerta' : 'Estoy en puerta'}
                    </button>
                    <button
                      type="button"
                      className="route-portal__btn is-primary"
                      disabled={actionMutation.isPending}
                      onClick={() => actionMutation.mutate({ stopId: nextStop.id, action: 'picked_up' })}
                    >
                      <IconCheck />
                      {pendingAction === 'picked_up' ? 'Confirmando…' : 'Recogido'}
                    </button>
                    <button
                      type="button"
                      className="route-portal__btn is-danger"
                      disabled={actionMutation.isPending}
                      onClick={() => actionMutation.mutate({ stopId: nextStop.id, action: 'skipped' })}
                    >
                      <IconLeave />
                      Continuar sin alumno
                    </button>
                  </div>

                  {notice.text ? (
                    <div className={`route-portal__action-notice is-${notice.type === 'error' ? 'error' : 'success'}`} role="status">
                      {notice.text}
                    </div>
                  ) : null}

                  {showAlertPanel && !countdownActive ? (
                    <div className="route-portal__alert-panel">
                      <div>
                        <strong>Estoy en la puerta</strong>
                        <p>Marca llegada y avisa a la familia cuántos minutos tienen para salir. Si no salen, puedes continuar sin el alumno.</p>
                      </div>
                      <div className="route-portal__minute-grid" role="group" aria-label="Minutos de espera">
                        {[1, 2, 3, 4, 5].map((minute) => (
                          <button
                            key={minute}
                            type="button"
                            className={alertMinutes === minute ? 'is-selected' : ''}
                            onClick={() => setAlertMinutes(minute)}
                          >
                            {minute} min
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="route-portal__btn is-primary is-wide"
                        disabled={actionMutation.isPending}
                        onClick={() => actionMutation.mutate({
                          stopId: nextStop.id,
                          action: 'waiting_alert',
                          minutes: alertMinutes,
                        })}
                      >
                        <IconClock />
                        Avisar y cronometrar ({alertMinutes} min)
                      </button>
                    </div>
                  ) : null}

                  {countdownActive ? (
                    <div className={`route-portal__countdown${countdownExpired ? ' is-expired' : ''}`}>
                      <div>
                        <span>{countdownExpired ? 'Tiempo agotado' : 'Esperando salida'}</span>
                        <strong>{formatCountdown(countdown)}</strong>
                        <p>
                          {countdownExpired
                            ? 'El tiempo terminó. Puedes marcar Recogido o Continuar sin alumno.'
                            : `La familia fue avisada: tienen ${Math.ceil(countdown / 60)} min para salir.`}
                        </p>
                      </div>
                      {countdownExpired ? (
                        <button
                          type="button"
                          className="route-portal__btn is-danger"
                          onClick={() => actionMutation.mutate({ stopId: nextStop.id, action: 'skipped' })}
                        >
                          <IconLeave />
                          Continuar sin alumno
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="route-portal__current-art">
                  <CurrentStopArt />
                </div>
              </div>
            ) : (
              <p className="route-portal__empty">No hay paradas pendientes para operar.</p>
            )}
          </article>

          <article className="route-portal__card route-portal__control">
            <div className="route-portal__card-head">
              <div>
                <h2>Control de jornada</h2>
                <p>Resumen rápido para reiniciar operación cuando empieza una nueva ruta.</p>
              </div>
            </div>

            <div className="route-portal__control-grid">
              <div className="route-portal__control-stat tone-green">
                <span className="route-portal__kpi-icon" aria-hidden="true"><IconCheck /></span>
                <span>Completadas</span>
                <strong>{completedStops}</strong>
              </div>
              <div className="route-portal__control-stat tone-teal">
                <span className="route-portal__kpi-icon" aria-hidden="true"><IconUser /></span>
                <span>Recogidos</span>
                <strong>{pickedUpStops}</strong>
              </div>
              <div className="route-portal__control-stat tone-amber">
                <span className="route-portal__kpi-icon" aria-hidden="true"><IconClock /></span>
                <span>Pendientes</span>
                <strong>{pendingStops}</strong>
              </div>
              <div className="route-portal__control-stat tone-violet">
                <span className="route-portal__kpi-icon" aria-hidden="true"><IconRefresh /></span>
                <span>Avance</span>
                <strong>{progress}%</strong>
                <div className="route-portal__progress" aria-hidden="true">
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>

            <button
              className="route-portal__btn is-outline is-wide"
              disabled={resetMutation.isPending || stops.length === 0}
              onClick={() => resetMutation.mutate()}
              type="button"
            >
              <IconRefresh />
              Reiniciar jornada
            </button>
          </article>
        </section>

        <section className="route-portal__card route-portal__order">
          <div className="route-portal__card-head">
            <div>
              <h2>Orden de recogida · {routeTitle}</h2>
              <p>El conductor puede reorganizar la secuencia y actualizar el estado de cada parada.</p>
            </div>
            <button className="route-portal__ghost-btn" type="button" onClick={scrollToMap}>
              <IconPin />
              Ver en mapa
            </button>
          </div>

          {manifestQuery.isLoading ? <p className="route-portal__empty">Cargando ruta escolar…</p> : null}
          {!manifestQuery.isLoading && stops.length === 0 ? (
            <p className="route-portal__empty">No hay estudiantes asignados a esta ruta. Pide a Secretaría académica que asigne paradas.</p>
          ) : null}

          {stops.length > 0 ? (
            <div className="route-portal__table-wrap">
              <table className="route-portal__table">
                <thead>
                  <tr>
                    <th>Orden</th>
                    <th>Alumno</th>
                    <th>Dirección de recogida</th>
                    <th>Nota</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {stops.map((stop, index) => (
                    <tr key={stop.id}>
                      <td>
                        <span className="route-portal__order-badge">{index + 1}</span>
                      </td>
                      <td>
                        <div className="route-portal__student">
                          <span className="route-portal__avatar" aria-hidden="true">{getInitials(stop.studentName)}</span>
                          <div>
                            <strong>{stop.studentName}</strong>
                            <small>{formatStudentMeta(stop)}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="route-portal__address">
                          <IconPin />
                          <span>{stop.pickupAddress || 'Sin dirección asignada'}</span>
                        </div>
                      </td>
                      <td>{stop.notes || '—'}</td>
                      <td>
                        <span className={`route-portal__status is-${stop.status}`}>
                          {statusLabels[stop.status] || stop.status}
                        </span>
                      </td>
                      <td>
                        <div className="route-portal__row-actions">
                          <button aria-label={`Subir a ${stop.studentName}`} disabled={index === 0 || reorderMutation.isPending} type="button" onClick={() => moveStop(stop.id, -1)}>
                            <IconArrowUp />
                          </button>
                          <button aria-label={`Bajar a ${stop.studentName}`} disabled={index === stops.length - 1 || reorderMutation.isPending} type="button" onClick={() => moveStop(stop.id, 1)}>
                            <IconArrowDown />
                          </button>
                          <button type="button" onClick={() => actionMutation.mutate({ stopId: stop.id, action: 'on_way' })}>Camino</button>
                          <button
                            type="button"
                            onClick={() => {
                              if (nextStop?.id === stop.id) {
                                setShowAlertPanel(true);
                                return;
                              }
                              actionMutation.mutate({ stopId: stop.id, action: 'waiting_alert', minutes: alertMinutes });
                            }}
                          >
                            Puerta
                          </button>
                          <button className="is-success" type="button" onClick={() => actionMutation.mutate({ stopId: stop.id, action: 'picked_up' })}>Recogido</button>
                          <button type="button" onClick={() => actionMutation.mutate({ stopId: stop.id, action: 'skipped' })}>Sin alumno</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

export default SchoolRouteCampusHome;
