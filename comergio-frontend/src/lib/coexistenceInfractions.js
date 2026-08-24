export function groupCoexistenceInfractions(infractions = []) {
  const groups = [];
  const indexByKey = new Map();

  (Array.isArray(infractions) ? infractions : []).forEach((item, index) => {
    const categoryKey = String(item?.categoryKey || '').trim() || '_other';
    if (!indexByKey.has(categoryKey)) {
      indexByKey.set(categoryKey, groups.length);
      groups.push({
        key: categoryKey,
        label: String(item?.categoryLabel || '').trim() || (categoryKey === '_other' ? 'Otras faltas' : categoryKey),
        items: [],
      });
    }
    groups[indexByKey.get(categoryKey)].items.push({ item, index });
  });

  return groups;
}

export function formatCoexistenceInfractionOption(item = {}) {
  const code = String(item.code || item.key || '').trim().toUpperCase();
  const points = Number(item.deductionPercent || 0);
  const label = String(item.label || '').trim();
  const prefix = code ? `${code} (−${points})` : `(−${points})`;
  return label ? `${prefix} ${label}` : prefix;
}
