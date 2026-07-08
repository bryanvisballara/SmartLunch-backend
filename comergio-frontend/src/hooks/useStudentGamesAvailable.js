import { useEffect, useState } from 'react';

const MOBILE_GAMES_MEDIA_QUERY = '(hover: none) and (pointer: coarse)';

export function isStudentGamesAvailableDevice() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(MOBILE_GAMES_MEDIA_QUERY).matches;
}

export function useStudentGamesAvailable() {
  const [available, setAvailable] = useState(isStudentGamesAvailableDevice);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_GAMES_MEDIA_QUERY);
    const syncAvailability = () => setAvailable(media.matches);

    syncAvailability();
    media.addEventListener('change', syncAvailability);

    return () => media.removeEventListener('change', syncAvailability);
  }, []);

  return available;
}
