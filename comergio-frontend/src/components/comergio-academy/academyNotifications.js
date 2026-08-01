/**
 * Notification counts for Comergio Academy sections.
 * Parent badge = conecta + informa (video tutorials do not add to the sum).
 */
export function getComergioAcademyNotificationCounts(overrides = {}) {
  const conecta = Math.max(0, Number(overrides.conecta ?? 0) || 0);
  const informa = Math.max(0, Number(overrides.informa ?? 0) || 0);
  return {
    conecta,
    informa,
    total: conecta + informa,
  };
}
