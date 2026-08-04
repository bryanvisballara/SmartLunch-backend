import { useEffect, useRef, useState } from 'react';
import { getGoogleMapsApiKey, loadGoogleMaps } from './googleMapsLoader';
import './GoogleSchoolRouteMap.css';

function requestDirections(service, request) {
  return new Promise((resolve, reject) => {
    service.route(request, (result, status) => {
      if (status === 'OK' && result) {
        resolve(result);
        return;
      }
      reject(new Error(`Google Maps no pudo calcular el recorrido (${status}).`));
    });
  });
}

function splitRoutePoints(points, maxPoints = 25) {
  if (points.length <= maxPoints) return [points];
  const chunks = [];
  let start = 0;
  while (start < points.length - 1) {
    const chunk = points.slice(start, start + maxPoints);
    chunks.push(chunk);
    start += maxPoints - 1;
  }
  return chunks;
}

function hasStoredCoordinates(stop) {
  const lat = Number(stop?.latitude);
  const lng = Number(stop?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export default function GoogleSchoolRouteMap({ stops = [], routeName = 'Ruta escolar', onMetricsChange }) {
  const mapNodeRef = useRef(null);
  const mapArtifactsRef = useRef({ markers: [], renderers: [] });
  const [state, setState] = useState({ status: 'idle', message: '', unresolved: [] });
  const apiKey = getGoogleMapsApiKey();
  const orderedStops = [...(Array.isArray(stops) ? stops : [])]
    .filter((stop) => String(stop?.pickupAddress || '').trim() || hasStoredCoordinates(stop))
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
  const routeSignature = orderedStops
    .map((stop) => `${stop.id}:${stop.order}:${stop.pickupAddress}:${stop.latitude}:${stop.longitude}:${stop.placeId || ''}`)
    .join('|');

  useEffect(() => {
    let cancelled = false;

    const clearArtifacts = () => {
      mapArtifactsRef.current.markers.forEach((marker) => marker.setMap(null));
      mapArtifactsRef.current.renderers.forEach((renderer) => renderer.setMap(null));
      mapArtifactsRef.current = { markers: [], renderers: [] };
    };

    if (!apiKey) {
      onMetricsChange?.(null);
      setState({
        status: 'missing-key',
        message: 'Configura VITE_GOOGLE_MAPS_API_KEY para visualizar el mapa real.',
        unresolved: [],
      });
      return clearArtifacts;
    }

    if (!orderedStops.length) {
      onMetricsChange?.(null);
      setState({
        status: 'empty',
        message: 'Agrega estudiantes con dirección de Google Maps para visualizar el recorrido.',
        unresolved: [],
      });
      return clearArtifacts;
    }

    const renderMap = async () => {
      onMetricsChange?.(null);
      setState({ status: 'loading', message: 'Ubicando puntos de recogida…', unresolved: [] });
      try {
        const maps = await loadGoogleMaps(apiKey);
        if (cancelled || !mapNodeRef.current) return;

        clearArtifacts();
        const map = new maps.Map(mapNodeRef.current, {
          center: { lat: 10.9685, lng: -74.7813 },
          zoom: 12,
          mapTypeControl: false,
          fullscreenControl: true,
          streetViewControl: false,
          styles: [
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          ],
        });
        const resolved = [];
        const unresolved = [];

        for (const stop of orderedStops) {
          if (cancelled) return;

          // Only pinned Places coordinates — free-text geocode is too ambiguous for Colombian street shorthand.
          if (hasStoredCoordinates(stop)) {
            resolved.push({
              ...stop,
              location: new maps.LatLng(Number(stop.latitude), Number(stop.longitude)),
              formattedAddress: stop.pickupAddress || `${stop.latitude}, ${stop.longitude}`,
            });
          } else {
            unresolved.push(stop);
          }
        }

        if (!resolved.length) {
          setState({
            status: 'error',
            message: 'Selecciona la dirección con el buscador de Google Maps para fijar el punto exacto.',
            unresolved,
          });
          return;
        }

        const bounds = new maps.LatLngBounds();
        const markers = resolved.map((stop, index) => {
          bounds.extend(stop.location);
          return new maps.Marker({
            map,
            position: stop.location,
            label: {
              text: String(stop.order || index + 1),
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: '800',
            },
            title: `${stop.order || index + 1}. ${stop.studentName} — ${stop.formattedAddress}`,
          });
        });

        const renderers = [];
        let distanceMeters = 0;
        let durationSeconds = 0;
        if (resolved.length > 1) {
          const directionsService = new maps.DirectionsService();
          const chunks = splitRoutePoints(resolved);
          for (const [index, chunk] of chunks.entries()) {
            // eslint-disable-next-line no-await-in-loop
            const directions = await requestDirections(directionsService, {
              origin: chunk[0].location,
              destination: chunk[chunk.length - 1].location,
              waypoints: chunk.slice(1, -1).map((stop) => ({ location: stop.location, stopover: true })),
              optimizeWaypoints: false,
              travelMode: maps.TravelMode.DRIVING,
            });
            (directions.routes?.[0]?.legs || []).forEach((leg) => {
              distanceMeters += Number(leg.distance?.value || 0);
              durationSeconds += Number(leg.duration?.value || 0);
            });
            const renderer = new maps.DirectionsRenderer({
              map,
              directions,
              suppressMarkers: true,
              preserveViewport: true,
              polylineOptions: {
                strokeColor: '#1769e0',
                strokeOpacity: 0.92,
                strokeWeight: 5,
                zIndex: 2 + index,
              },
            });
            renderers.push(renderer);
          }
        }

        map.fitBounds(bounds, 48);
        if (resolved.length === 1) map.setZoom(16);
        mapArtifactsRef.current = { markers, renderers };
        onMetricsChange?.({ distanceMeters, durationSeconds, resolvedStops: resolved.length });
        setState({
          status: 'ready',
          message: `${resolved.length} punto(s) trazados en el orden de recogida.`,
          unresolved,
        });
      } catch (error) {
        if (!cancelled) {
          onMetricsChange?.(null);
          setState({
            status: 'error',
            message: error?.message || 'No se pudo mostrar el recorrido.',
            unresolved: [],
          });
        }
      }
    };

    const timer = window.setTimeout(() => {
      void renderMap();
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      clearArtifacts();
    };
  // routeSignature captures ordered addresses without rerunning for unrelated renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, routeSignature]);

  return (
    <div className="google-school-route-map">
      <div className="google-school-route-map__canvas" ref={mapNodeRef} />
      {state.status !== 'ready' ? (
        <div className={`google-school-route-map__overlay is-${state.status}`}>
          {state.status === 'loading' ? <span className="google-school-route-map__spinner" aria-hidden="true" /> : null}
          <strong>{state.status === 'missing-key' ? 'Google Maps no está configurado' : routeName}</strong>
          <p>{state.message}</p>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <div className="google-school-route-map__legend">
          <span>{state.message}</span>
          {state.unresolved.length ? <small>{state.unresolved.length} dirección(es) sin coordenadas de Google Maps.</small> : null}
        </div>
      ) : null}
    </div>
  );
}
