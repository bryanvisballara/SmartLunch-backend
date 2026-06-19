import { useCallback, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';

const DEFAULT_THRESHOLD = 88;

function getScrollTop() {
  if (typeof window === 'undefined') {
    return 0;
  }

  const scrollingElement = document.scrollingElement || document.documentElement;
  return Number(scrollingElement?.scrollTop || window.scrollY || 0);
}

export function canUseParentPullToRefresh(enabled = true) {
  if (!enabled) {
    return false;
  }

  if (Capacitor.isNativePlatform()) {
    return true;
  }

  return typeof window !== 'undefined' && 'ontouchstart' in window;
}

export function useParentPullToRefresh({
  onRefresh,
  enabled = true,
  threshold = DEFAULT_THRESHOLD,
  dampening = 0.45,
} = {}) {
  const [distance, setDistance] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const triggeredRef = useRef(false);
  const canUsePullRefresh = canUseParentPullToRefresh(enabled);

  const reset = useCallback(() => {
    trackingRef.current = false;
    triggeredRef.current = false;
    startYRef.current = 0;
    setDistance(0);
    setIsReady(false);
  }, []);

  const triggerRefresh = useCallback(async () => {
    if (!onRefresh || isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    setDistance(threshold);
    setIsReady(true);

    try {
      await onRefresh();
    } finally {
      window.setTimeout(() => {
        setIsRefreshing(false);
        reset();
      }, 220);
    }
  }, [isRefreshing, onRefresh, reset, threshold]);

  const onTouchStart = useCallback((event) => {
    if (!canUsePullRefresh || isRefreshing) {
      return;
    }

    if (getScrollTop() > 0) {
      reset();
      return;
    }

    const touch = event.touches?.[0];
    if (!touch) {
      return;
    }

    startYRef.current = touch.clientY;
    trackingRef.current = true;
    triggeredRef.current = false;
    setDistance(0);
    setIsReady(false);
  }, [canUsePullRefresh, isRefreshing, reset]);

  const onTouchMove = useCallback((event) => {
    if (!canUsePullRefresh || !trackingRef.current || isRefreshing) {
      return;
    }

    if (getScrollTop() > 0) {
      reset();
      return;
    }

    const touch = event.touches?.[0];
    if (!touch) {
      return;
    }

    const deltaY = touch.clientY - startYRef.current;
    if (deltaY <= 0) {
      setDistance(0);
      setIsReady(false);
      return;
    }

    const nextDistance = Math.min(deltaY * dampening, 120);
    if (event.cancelable) {
      event.preventDefault();
    }

    setDistance(nextDistance);
    setIsReady(nextDistance >= threshold);
  }, [canUsePullRefresh, dampening, isRefreshing, reset, threshold]);

  const onTouchEnd = useCallback(() => {
    if (!canUsePullRefresh || isRefreshing) {
      return;
    }

    if (isReady && !triggeredRef.current) {
      triggeredRef.current = true;
      triggerRefresh();
      return;
    }

    reset();
  }, [canUsePullRefresh, isReady, isRefreshing, reset, triggerRefresh]);

  const onTouchCancel = useCallback(() => {
    if (isRefreshing) {
      return;
    }

    reset();
  }, [isRefreshing, reset]);

  const touchHandlers = canUsePullRefresh
    ? {
        onTouchCancel,
        onTouchEnd,
        onTouchMove,
        onTouchStart,
      }
    : {};

  const contentOffset = isRefreshing ? threshold * 0.4 : distance;

  return {
    canUsePullRefresh,
    contentOffset,
    distance,
    isReady,
    isRefreshing,
    threshold,
    touchHandlers,
    triggerRefresh,
  };
}
