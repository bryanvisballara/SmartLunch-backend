export function AcademyNotificationBadge({ count = 0, label = 'notificaciones' }) {
  const safeCount = Number(count || 0);
  if (safeCount <= 0) return null;
  return (
    <span aria-label={`${safeCount} ${label}`} className="comergio-academy-badge">
      {safeCount > 99 ? '99+' : safeCount}
    </span>
  );
}
