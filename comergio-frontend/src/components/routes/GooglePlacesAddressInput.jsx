import { useEffect, useRef, useState } from 'react';
import { getGoogleMapsApiKey, loadGoogleMaps } from './googleMapsLoader';
import './GooglePlacesAddressInput.css';

export default function GooglePlacesAddressInput({
  value = '',
  placeholder = 'Busca la dirección en Google Maps…',
  disabled = false,
  onChange,
  onPlaceSelected,
  ariaLabel = 'Dirección de recogida',
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const [ready, setReady] = useState(Boolean(window.google?.maps?.places));
  const [loadError, setLoadError] = useState('');
  const apiKey = getGoogleMapsApiKey();

  useEffect(() => {
    onChangeRef.current = onChange;
    onPlaceSelectedRef.current = onPlaceSelected;
  }, [onChange, onPlaceSelected]);

  useEffect(() => {
    let cancelled = false;

    if (!apiKey) {
      setLoadError('Falta la clave de Google Maps.');
      return undefined;
    }

    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !inputRef.current || autocompleteRef.current) return;

        const autocomplete = new maps.places.Autocomplete(inputRef.current, {
          fields: ['formatted_address', 'geometry', 'place_id', 'name'],
          componentRestrictions: { country: ['co'] },
        });

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          const location = place?.geometry?.location;
          if (!location) {
            onChangeRef.current?.(inputRef.current?.value || '');
            return;
          }

          const nextAddress = place.formatted_address || place.name || inputRef.current?.value || '';
          const nextPlace = {
            pickupAddress: nextAddress,
            latitude: Number(location.lat()),
            longitude: Number(location.lng()),
            placeId: place.place_id || '',
          };

          onChangeRef.current?.(nextAddress);
          onPlaceSelectedRef.current?.(nextPlace);
        });

        autocompleteRef.current = autocomplete;
        setReady(true);
        setLoadError('');
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error?.message || 'No se pudo cargar el buscador de direcciones.');
        }
      });

    return () => {
      cancelled = true;
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      autocompleteRef.current = null;
    };
  }, [apiKey]);

  return (
    <div className={`google-places-address${ready ? ' is-ready' : ''}`}>
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChangeRef.current?.(nextValue);
          onPlaceSelectedRef.current?.({
            pickupAddress: nextValue,
            latitude: null,
            longitude: null,
            placeId: '',
          });
        }}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      {loadError ? (
        <small className="google-places-address__hint is-error">{loadError}</small>
      ) : (
        <small className="google-places-address__hint">Elige una sugerencia de Google Maps para fijar el punto exacto.</small>
      )}
    </div>
  );
}
