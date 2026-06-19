function ParentPullToRefreshIndicator({
  distance = 0,
  isReady = false,
  isRefreshing = false,
  threshold = 88,
  variant = 'portal',
}) {
  if (variant === 'campus') {
    if (!isRefreshing) {
      return null;
    }

    return (
      <div aria-label="Actualizando" className="campus-parent-pull-refresh" role="status">
        <svg fill="none" height="22" viewBox="0 0 24 24" width="22" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="#1d3557" strokeDasharray="48" strokeDashoffset="16" strokeLinecap="round" strokeWidth="2.5" />
        </svg>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`parent-pull-refresh-indicator${isReady ? ' is-ready' : ''}${isRefreshing ? ' is-refreshing' : ''}`}
      style={{
        opacity: distance > 0 || isRefreshing ? 1 : 0,
        transform: `translate(-50%, ${Math.min(distance, threshold)}px)`,
      }}
    >
      <span className="parent-pull-refresh-spinner" />
      <span>{isRefreshing ? 'Actualizando...' : isReady ? 'Suelta para actualizar' : 'Desliza para actualizar'}</span>
    </div>
  );
}

export default ParentPullToRefreshIndicator;
