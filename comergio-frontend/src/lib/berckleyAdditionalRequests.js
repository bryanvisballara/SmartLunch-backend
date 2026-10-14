export const ADDITIONAL_REQUEST_OPTIONS = [
  { value: 'bloom', label: 'Información programa de estimulación BLOOM' },
  { value: 'millennium_discovery', label: 'Información colegio millennium y discovery' },
  { value: 'none', label: 'Ninguna' },
];

export function getAdditionalRequestLabel(value) {
  const key = String(value || '').trim();
  if (!key) return '-';
  return ADDITIONAL_REQUEST_OPTIONS.find((option) => option.value === key)?.label || key;
}
