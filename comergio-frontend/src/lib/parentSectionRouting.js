import { Capacitor } from '@capacitor/core';

export const PARENT_SECTION_QUERY_KEY = 'section';

const ROUTED_PARENT_SECTION_SUFFIXES = {
  home: '',
  academic: '/academic',
  cafeteria: '/cafeteria',
  finance: '/finance',
  nursing: '/enfermeria',
  wellbeing: '/wellbeing',
  coexistence: '/coexistence',
  transport: '/transport',
};

// Sections that still 404 on Hostinger unless the latest dist-deploy bundle is extracted.
const NATIVE_QUERY_SECTION_KEYS = new Set(['finance', 'academic', 'transport']);

function normalizeRouteBase(routeBase) {
  const normalizedBase = String(routeBase || '').trim();
  if (!normalizedBase) {
    return '';
  }

  const baseWithLeadingSlash = normalizedBase.startsWith('/') ? normalizedBase : `/${normalizedBase}`;
  return baseWithLeadingSlash.replace(/\/+$/, '');
}

export function buildParentRoutedSectionPath(routeBase, sectionKey) {
  const normalizedBase = normalizeRouteBase(routeBase);
  const suffix = ROUTED_PARENT_SECTION_SUFFIXES[sectionKey] ?? '';

  if (!normalizedBase) {
    return '';
  }

  return suffix ? `${normalizedBase}${suffix}` : normalizedBase;
}

export function shouldUseParentQuerySectionRouting() {
  return Capacitor.isNativePlatform();
}

export function resolveParentSectionFromSearch(search = '') {
  return String(new URLSearchParams(search).get(PARENT_SECTION_QUERY_KEY) || '').trim();
}

export function shouldNavigateParentSectionWithQuery(sectionKey = '') {
  return shouldUseParentQuerySectionRouting()
    && NATIVE_QUERY_SECTION_KEYS.has(String(sectionKey || '').trim());
}

export function buildParentSectionNavigateTarget(routeBase, sectionKey = '') {
  const normalizedBase = normalizeRouteBase(routeBase);
  if (!normalizedBase) {
    return '';
  }

  const normalizedSection = String(sectionKey || '').trim();
  if (!normalizedSection || normalizedSection === 'home') {
    return normalizedBase;
  }

  if (shouldNavigateParentSectionWithQuery(normalizedSection)) {
    return `${normalizedBase}?${PARENT_SECTION_QUERY_KEY}=${encodeURIComponent(normalizedSection)}`;
  }

  return buildParentRoutedSectionPath(normalizedBase, normalizedSection);
}

export function resolveParentNotificationSection(path = '', search = '') {
  const sectionFromSearch = resolveParentSectionFromSearch(search);
  if (sectionFromSearch) {
    return sectionFromSearch;
  }

  const normalizedPath = String(path || '').trim().toLowerCase();

  if (normalizedPath.includes('/enfermeria') || normalizedPath.includes('/nursing')) {
    return 'nursing';
  }

  if (normalizedPath.includes('/wellbeing')) {
    return 'wellbeing';
  }

  if (normalizedPath.includes('/coexistence')) {
    return 'coexistence';
  }

  if (normalizedPath.includes('/transport')) {
    return 'transport';
  }

  if (normalizedPath.includes('/finance')) {
    return 'finance';
  }

  if (normalizedPath.includes('/academic')) {
    return 'academic';
  }

  if (normalizedPath.includes('/cafeteria')) {
    return 'cafeteria';
  }

  return 'home';
}
