import { useLayoutEffect, useState } from 'react';
import './ParentViewMotion.css';

const MOTION_BY_VIEW = [
  ['academic-performance', 'rise'],
  ['academic-assignments', 'slide-left'],
  ['academic-content', 'fade-scale'],
  ['academic-attendance', 'slide-up'],
  ['academic-grades', 'slide-right'],
  ['academic-calendar', 'flip-soft'],
  ['academic-schedule', 'slide-left'],
  ['academic-ranking', 'pop'],
  ['academic-tasks', 'slide-up'],
  ['academic-behavior', 'soft-rise'],
  ['academic', 'fade-scale'],
  ['cafeteria-preorders', 'slide-up'],
  ['cafeteria-menu-products', 'slide-left'],
  ['cafeteria-menu', 'slide-right'],
  ['cafeteria-history', 'fade-scale'],
  ['cafeteria-limit', 'slide-left'],
  ['cafeteria-meriendas-day', 'slide-up'],
  ['cafeteria-meriendas', 'pop'],
  ['cafeteria-gio', 'fade-blur'],
  ['cafeteria-add-card', 'slide-up'],
  ['cafeteria-auto-topup', 'fade-scale'],
  ['cafeteria-daviplata', 'slide-left'],
  ['cafeteria-epayco', 'slide-right'],
  ['cafeteria-nequi', 'pop'],
  ['cafeteria-pse', 'slide-up'],
  ['cafeteria-bancolombia', 'slide-left'],
  ['cafeteria-breb', 'soft-rise'],
  ['cafeteria-methods', 'fade-scale'],
  ['cafeteria-topups', 'slide-right'],
  ['cafeteria-bold', 'fade-blur'],
  ['cafeteria-home', 'rise'],
  ['cafeteria-overview', 'rise'],
  ['cafeteria', 'fade-blur'],
  ['finance', 'slide-right'],
  ['nursing', 'slide-left'],
  ['wellbeing', 'soft-rise'],
  ['coexistence', 'slide-right'],
  ['transport', 'slide-up'],
  ['games', 'pop'],
  ['care', 'slide-left'],
  ['home', 'rise'],
];

export function resolveParentViewMotion(viewKey) {
  const key = String(viewKey || '').trim();
  if (!key) {
    return 'rise';
  }

  const match = MOTION_BY_VIEW.find(([prefix]) => (
    key === prefix
    || key.startsWith(`${prefix}:`)
    || key.startsWith(`${prefix}-`)
  ));

  return match?.[1] || 'rise';
}

export function ParentViewMotion({
  children,
  className = '',
  stagger = true,
  variant,
  viewKey,
}) {
  const resolved = variant || resolveParentViewMotion(viewKey);
  const [play, setPlay] = useState(true);

  useLayoutEffect(() => {
    setPlay(false);
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setPlay(true));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [resolved, viewKey]);

  const classes = [
    'parent-view-motion',
    play ? `parent-view-motion--${resolved}` : '',
    stagger ? 'parent-view-motion--stagger' : '',
    className,
  ].filter(Boolean).join(' ');

  return <div className={classes}>{children}</div>;
}
