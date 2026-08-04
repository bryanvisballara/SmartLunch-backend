const GOOGLE_MAPS_SCRIPT_ID = 'comergio-google-maps';
let googleMapsPromise;

export function getGoogleMapsApiKey() {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
}

async function ensurePlacesLibrary(maps) {
  if (maps?.places) return maps;
  if (typeof maps?.importLibrary === 'function') {
    await maps.importLibrary('places');
  }
  if (!window.google?.maps?.places) {
    throw new Error('La API Places de Google Maps no está disponible. Actívala en Google Cloud.');
  }
  return window.google.maps;
}

export function loadGoogleMaps(apiKey = getGoogleMapsApiKey()) {
  if (!apiKey) {
    return Promise.reject(new Error('Falta VITE_GOOGLE_MAPS_API_KEY'));
  }

  if (window.google?.maps?.places) {
    return Promise.resolve(window.google.maps);
  }

  if (window.google?.maps) {
    return ensurePlacesLibrary(window.google.maps);
  }

  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => {
        ensurePlacesLibrary(window.google?.maps)
          .then(resolve)
          .catch(reject);
      }, { once: true });
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Maps.')), { once: true });
      return;
    }

    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      language: 'es',
      region: 'CO',
      // Places: autocomplete de direcciones. Directions: trazado de la ruta asignada.
      libraries: 'places',
    });

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.onload = () => {
      ensurePlacesLibrary(window.google?.maps)
        .then(resolve)
        .catch(reject);
    };
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps.'));
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}
