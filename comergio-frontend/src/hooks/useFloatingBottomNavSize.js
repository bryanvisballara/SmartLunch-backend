import { useCallback, useEffect, useRef, useState } from 'react';

const SCROLL_DELTA_THRESHOLD = 5;
const MIN_SCROLL_TOP = 20;

function getWindowScrollTop() {
  if (typeof window === 'undefined') {
    return 0;
  }

  const scrollingElement = document.scrollingElement || document.documentElement;
  return Number(scrollingElement?.scrollTop || window.scrollY || 0);
}

function getTargetScrollTop(target) {
  if (!target || target === document || target === window) {
    return getWindowScrollTop();
  }

  if (target instanceof Element) {
    return Number(target.scrollTop || 0);
  }

  return getWindowScrollTop();
}

export function useFloatingBottomNavSize(enabled = true) {
  const [sizeMode, setSizeMode] = useState('expanded');
  const lastScrollTopRef = useRef(0);
  const rafRef = useRef(null);
  const scrollTargetRef = useRef(null);

  const expandBottomNav = useCallback(() => {
    setSizeMode('expanded');
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return undefined;
    }

    lastScrollTopRef.current = getWindowScrollTop();
    scrollTargetRef.current = null;

    const onScroll = (event) => {
      if (rafRef.current) {
        return;
      }

      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;

        const target = event.target;
        const scrollTarget = target instanceof Element && target !== document.documentElement && target !== document.body
          ? target
          : null;

        if (scrollTarget !== scrollTargetRef.current) {
          scrollTargetRef.current = scrollTarget;
          lastScrollTopRef.current = scrollTarget ? getTargetScrollTop(scrollTarget) : getWindowScrollTop();
          return;
        }

        const scrollTop = scrollTarget ? getTargetScrollTop(scrollTarget) : getWindowScrollTop();
        const delta = scrollTop - lastScrollTopRef.current;

        if (Math.abs(delta) < SCROLL_DELTA_THRESHOLD) {
          lastScrollTopRef.current = scrollTop;
          return;
        }

        if (delta > 0 && scrollTop > MIN_SCROLL_TOP) {
          setSizeMode('compact');
        } else if (delta < 0) {
          setSizeMode('expanded');
        }

        lastScrollTopRef.current = scrollTop;
      });
    };

    document.addEventListener('scroll', onScroll, { passive: true, capture: true });

    return () => {
      document.removeEventListener('scroll', onScroll, true);
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [enabled]);

  return {
    bottomNavClassName: sizeMode === 'compact' ? 'is-compact' : 'is-expanded',
    expandBottomNav,
  };
}
