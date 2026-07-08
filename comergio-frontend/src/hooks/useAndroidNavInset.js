import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

const MIN_ANDROID_NAV_INSET_PX = 112;

export function useAndroidNavInset() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android' || !Capacitor.isNativePlatform()) {
      return undefined;
    }

    const updateAndroidNavInset = () => {
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height || window.innerHeight;
      const layoutHeight = window.innerHeight;
      const measuredInset = Math.max(0, Math.round(layoutHeight - viewportHeight - (viewport?.offsetTop || 0)));
      const navInset = Math.max(measuredInset, MIN_ANDROID_NAV_INSET_PX);
      document.documentElement.style.setProperty('--comergio-android-nav-inset', `${navInset}px`);
    };

    updateAndroidNavInset();
    window.visualViewport?.addEventListener('resize', updateAndroidNavInset);
    window.visualViewport?.addEventListener('scroll', updateAndroidNavInset);
    window.addEventListener('resize', updateAndroidNavInset);
    window.addEventListener('orientationchange', updateAndroidNavInset);

    return () => {
      document.documentElement.style.removeProperty('--comergio-android-nav-inset');
      window.visualViewport?.removeEventListener('resize', updateAndroidNavInset);
      window.visualViewport?.removeEventListener('scroll', updateAndroidNavInset);
      window.removeEventListener('resize', updateAndroidNavInset);
      window.removeEventListener('orientationchange', updateAndroidNavInset);
    };
  }, []);
}
