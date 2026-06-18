import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

const FRAMES_CACHE_VERSION = 56;
const VIDEO1_SRC = `/landing/hero-scroll.mp4?v=${FRAMES_CACHE_VERSION}`;
const VIDEO2_SRC = `/landing/hero-scroll-section2.mp4?v=${FRAMES_CACHE_VERSION}`;
const VIDEO3_SRC = `/landing/hero-scroll-section3.mp4?v=${FRAMES_CACHE_VERSION}`;
const VIDEO4_SRC = `/landing/hero-scroll-section4.mp4?v=${FRAMES_CACHE_VERSION}`;
const VIDEO5_SRC = `/landing/hero-scroll-section5.mp4?v=${FRAMES_CACHE_VERSION}`;
const VIDEO6_SRC = `/landing/hero-scroll-section6.mp4?v=${FRAMES_CACHE_VERSION}`;
const VIDEO7_SRC = `/landing/hero-scroll-section7.mp4?v=${FRAMES_CACHE_VERSION}`;
const VIDEO8_SRC = `/landing/hero-scroll-section8.mp4?v=${FRAMES_CACHE_VERSION}`;
const VIDEO9_SRC = `/landing/hero-scroll-section9.mp4?v=${FRAMES_CACHE_VERSION}`;
const VIDEO10_SRC = `/landing/hero-scroll-section10.mp4?v=${FRAMES_CACHE_VERSION}`;
const VIDEO11_SRC = `/landing/hero-scroll-section11.mp4?v=${FRAMES_CACHE_VERSION}`;
const VIDEO12_SRC = `/landing/hero-scroll-section12.mp4?v=${FRAMES_CACHE_VERSION}`;
const FRAME_START_activeFrameWidth = 3344;
const FRAME_START_activeFrameHeight = 1882;
const FRAME_START_SRC_HQ = `/landing/frame-start-hq.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_START_SRC_WEBP = `/landing/frame-start-hq.webp?v=${FRAMES_CACHE_VERSION}`;
const FRAME_SECTION1_activeFrameWidth = 2560;
const FRAME_SECTION1_activeFrameHeight = 1440;
const FRAME_SECTION1_END_SRC = `/landing/frame-ecosistema-educativo.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_SECTION1_END_SRC_WEBP = `/landing/frame-ecosistema-educativo.webp?v=${FRAMES_CACHE_VERSION}`;
const FRAME_COMUNICACIONES_activeFrameWidth = 2560;
const FRAME_COMUNICACIONES_activeFrameHeight = 1440;
const FRAME_COMUNICACIONES_SRC = `/landing/frame-comunicaciones.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_COMUNICACIONES_SRC_WEBP = `/landing/frame-comunicaciones.webp?v=${FRAMES_CACHE_VERSION}`;
const FRAME_PORTAL_ACADEMICO_activeFrameWidth = 2560;
const FRAME_PORTAL_ACADEMICO_activeFrameHeight = 1440;
const FRAME_PORTAL_ACADEMICO_SRC = `/landing/frame-portal-academico.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_PAGOS_EN_LINEA_activeFrameWidth = 2560;
const FRAME_PAGOS_EN_LINEA_activeFrameHeight = 1440;
const FRAME_PAGOS_EN_LINEA_SRC = `/landing/frame-pagos-en-linea.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_ENFERMERIA_activeFrameWidth = 3344;
const FRAME_ENFERMERIA_activeFrameHeight = 1882;
const FRAME_ENFERMERIA_SRC = `/landing/frame-enfermeria.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_CAFETERIA_activeFrameWidth = 3344;
const FRAME_CAFETERIA_activeFrameHeight = 1882;
const FRAME_CAFETERIA_SRC = `/landing/frame-cafeteria.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_BIENESTAR_activeFrameWidth = 3344;
const FRAME_BIENESTAR_activeFrameHeight = 1882;
const FRAME_BIENESTAR_SRC = `/landing/frame-bienestar.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_TRANSPORTE_activeFrameWidth = 3344;
const FRAME_TRANSPORTE_activeFrameHeight = 1882;
const FRAME_TRANSPORTE_SRC = `/landing/frame-transporte.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_RECURSOS_HUMANOS_activeFrameWidth = 3344;
const FRAME_RECURSOS_HUMANOS_activeFrameHeight = 1882;
const FRAME_RECURSOS_HUMANOS_SRC = `/landing/frame-recursos-humanos.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_CARTERA_activeFrameWidth = 3344;
const FRAME_CARTERA_activeFrameHeight = 1882;
const FRAME_CARTERA_SRC = `/landing/frame-cartera.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_EMBUDO_ADMISIONES_activeFrameWidth = 3344;
const FRAME_EMBUDO_ADMISIONES_activeFrameHeight = 1882;
const FRAME_EMBUDO_ADMISIONES_SRC = `/landing/frame-embudo-admisiones.png?v=${FRAMES_CACHE_VERSION}`;
const FRAME_CONEXION_activeFrameWidth = 3344;
const FRAME_CONEXION_activeFrameHeight = 1882;
const FRAME_CONEXION_SRC = `/landing/frame-conexion.png?v=${FRAMES_CACHE_VERSION}`;
const DESKTOP_FRAME_WIDTH = 1024;
const DESKTOP_FRAME_HEIGHT = 576;
const MOBILE_FRAME_WIDTH = 512;
const MOBILE_FRAME_HEIGHT = 288;
const MOBILE_FRAME_FPS = 10;
const MOBILE_MAX_RETAINED_VIDEOS = 3;

let activeFrameWidth = DESKTOP_FRAME_WIDTH;
let activeFrameHeight = DESKTOP_FRAME_HEIGHT;
let activeFrameFps = 24;
let landingProfile = null;
const PIN_ZONE = 0.07;
const FADE_ZONE = 0.08;
const SECTION1_END_PIN = 0.06;
const VIDEO1_DISPLAY_MAX = 1;
const VIDEO_DISPLAY_MAX = VIDEO1_DISPLAY_MAX;
const PRE_FINAL_TRIM_FRAMES = 7;
const EDGE_TRIM_FRAMES = 10;
const VIDEO_SCROLL_LOCAL_LEN = 0.36;
const VIDEO2_TRIM_START_SEC = 0;
const VIDEO2_PIN_TAIL_FRAMES = 0;
const VIDEO3_SCROLL_LOCAL_LEN = VIDEO_SCROLL_LOCAL_LEN;
const VIDEO4_SCROLL_LOCAL_LEN = VIDEO_SCROLL_LOCAL_LEN;
const VIDEO5_SCROLL_LOCAL_LEN = VIDEO_SCROLL_LOCAL_LEN;
const VIDEO3_TRIM_START_SEC = 0;
const VIDEO3_PIN_TAIL_FRAMES = 0;
const VIDEO4_TRIM_START_SEC = 0;
const VIDEO4_PIN_TAIL_FRAMES = 0;
const VIDEO5_TRIM_START_SEC = 0;
const VIDEO5_PIN_TAIL_FRAMES = 0;
const VIDEO6_TRIM_START_SEC = 0;
const VIDEO6_PIN_TAIL_FRAMES = 0;
const VIDEO6_SCROLL_LOCAL_LEN = VIDEO_SCROLL_LOCAL_LEN;
const VIDEO7_TRIM_START_SEC = 0;
const VIDEO7_PIN_TAIL_FRAMES = 0;
const VIDEO7_SCROLL_LOCAL_LEN = VIDEO_SCROLL_LOCAL_LEN;
const VIDEO8_TRIM_START_SEC = 0;
const VIDEO8_PIN_TAIL_FRAMES = 0;
const VIDEO8_SCROLL_LOCAL_LEN = VIDEO_SCROLL_LOCAL_LEN;
const VIDEO9_TRIM_START_SEC = 0;
const VIDEO9_PIN_TAIL_FRAMES = 0;
const VIDEO9_SCROLL_LOCAL_LEN = VIDEO_SCROLL_LOCAL_LEN;
const VIDEO10_TRIM_START_SEC = 0;
const VIDEO10_PIN_TAIL_FRAMES = 0;
const VIDEO10_SCROLL_LOCAL_LEN = VIDEO_SCROLL_LOCAL_LEN;
const VIDEO11_TRIM_START_SEC = 0;
const VIDEO11_PIN_TAIL_FRAMES = 0;
const VIDEO11_SCROLL_LOCAL_LEN = VIDEO_SCROLL_LOCAL_LEN;
const VIDEO12_TRIM_START_SEC = 0;
const VIDEO12_PIN_TAIL_FRAMES = 0;
const VIDEO12_SCROLL_LOCAL_LEN = VIDEO_SCROLL_LOCAL_LEN;
const VIDEO1_PIN_TAIL_FRAMES = 0;
const VIDEO_INTRO_DISPLAY_PROGRESS = 0.03;
const VIDEO_OUTRO_DISPLAY_PROGRESS = 0.97;
const VIDEO_DISPLAY_FRAME_START = {
  video1: 0,
  video2: 0,
  video3: VIDEO_INTRO_DISPLAY_PROGRESS,
  video4: VIDEO_INTRO_DISPLAY_PROGRESS,
  video5: VIDEO_INTRO_DISPLAY_PROGRESS,
  video6: VIDEO_INTRO_DISPLAY_PROGRESS,
  video7: VIDEO_INTRO_DISPLAY_PROGRESS,
  video8: VIDEO_INTRO_DISPLAY_PROGRESS,
  video9: VIDEO_INTRO_DISPLAY_PROGRESS,
  video10: VIDEO_INTRO_DISPLAY_PROGRESS,
  video11: VIDEO_INTRO_DISPLAY_PROGRESS,
  video12: VIDEO_INTRO_DISPLAY_PROGRESS,
};
const VIDEO_DISPLAY_FRAME_END = {
  video1: VIDEO_OUTRO_DISPLAY_PROGRESS,
  video2: VIDEO_OUTRO_DISPLAY_PROGRESS,
  video3: VIDEO_OUTRO_DISPLAY_PROGRESS,
  video4: VIDEO_OUTRO_DISPLAY_PROGRESS,
  video5: VIDEO_OUTRO_DISPLAY_PROGRESS,
  video6: VIDEO_OUTRO_DISPLAY_PROGRESS,
  video7: VIDEO_OUTRO_DISPLAY_PROGRESS,
  video8: VIDEO_OUTRO_DISPLAY_PROGRESS,
  video9: VIDEO_OUTRO_DISPLAY_PROGRESS,
  video10: VIDEO_OUTRO_DISPLAY_PROGRESS,
  video11: VIDEO_OUTRO_DISPLAY_PROGRESS,
  video12: VIDEO_OUTRO_DISPLAY_PROGRESS,
};
const LOAD_PROGRESS_VIDEO1_FRAMES_START = 0.25;
const LOAD_PROGRESS_VIDEO2_FRAMES_START = 0.45;
const VIDEO_PIN_TAIL_RATIO = 0.2;
const SECTION_SCROLL_PAUSE_MS = 500;
const SECTION_ANCHOR_EPSILON = 0.000001;
const ONBOARDING_HINT_MS = 5000;

const MIN_SECTION_TRANSITION_MS = 3500;
const VIDEO_SECTION_NAV_TRANSITION_MS = 4000;

const NAV_JUMP = {
  ecosistemaTransitionMs: 4000,
  sectionTransitionMs: MIN_SECTION_TRANSITION_MS,
  portalTransitionMs: VIDEO_SECTION_NAV_TRANSITION_MS,
  pagosTransitionMs: VIDEO_SECTION_NAV_TRANSITION_MS,
  enfermeriaTransitionMs: VIDEO_SECTION_NAV_TRANSITION_MS,
  cafeteriaTransitionMs: VIDEO_SECTION_NAV_TRANSITION_MS,
  bienestarTransitionMs: VIDEO_SECTION_NAV_TRANSITION_MS,
  transporteTransitionMs: VIDEO_SECTION_NAV_TRANSITION_MS,
  recursosHumanosTransitionMs: VIDEO_SECTION_NAV_TRANSITION_MS,
  carteraTransitionMs: VIDEO_SECTION_NAV_TRANSITION_MS,
  embudoAdmisionesTransitionMs: VIDEO_SECTION_NAV_TRANSITION_MS,
  conexionTransitionMs: VIDEO_SECTION_NAV_TRANSITION_MS,
};

const LANDING_SECTIONS = [
  { id: 'bienvenido', title: 'Bienvenido', pause: false },
  { id: 'ecosistema', title: 'Ecosistema educativo', pause: true },
  { id: 'comunicaciones', title: 'Comunicaciones', pause: false },
  { id: 'portal', title: 'Portal académico', pause: false },
  { id: 'pagos', title: 'Pagos en línea', pause: false },
  { id: 'enfermeria', title: 'Enfermería', pause: false },
  { id: 'cafeteria', title: 'Cafetería', pause: false },
  { id: 'bienestar', title: 'Bienestar', pause: false },
  { id: 'transporte', title: 'Transporte', pause: false },
  { id: 'recursos-humanos', title: 'Recursos humanos', pause: false },
  { id: 'cartera', title: 'Cartera', pause: false },
  { id: 'embudo-admisiones', title: 'Embudo de admisiones', pause: false },
  { id: 'conexion', title: 'Conexión', pause: false },
];

const SCROLL_PHYSICS = {
  progressPerPixel: 0.00085,
  keyProgressStep: 0.035,
  wheelLineHeightPx: 16,
};

let landingFramesCache = null;
let landingSessionReady = false;

const LANDING_UI_INTERACTIVE_SELECTOR = [
  '.landing-video-page__section-nav',
  '.landing-video-page__mobile-section-dock',
  '.landing-video-page__mobile-section-backdrop',
  '.landing-video-page__mobile-section-sheet',
  '.landing-video-page__mobile-topbar',
  '.landing-video-page__actions--desktop',
].join(', ');

function isLandingUiTarget(target) {
  return target instanceof Element && Boolean(target.closest(LANDING_UI_INTERACTIVE_SELECTOR));
}

function ensureLandingProfile() {
  if (landingProfile) {
    return landingProfile;
  }

  if (typeof window === 'undefined') {
    landingProfile = {
      isMobile: false,
      isIOS: false,
      useModuleCache: true,
      eagerBackgroundLoad: true,
      maxRetainedVideos: 12,
    };
    return landingProfile;
  }

  const isIOS = /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
  const isMobileViewport = window.matchMedia('(max-width: 900px)').matches;
  const isCoarsePointer = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const isMobile = isIOS || isMobileViewport || isCoarsePointer;

  if (isMobile) {
    activeFrameWidth = MOBILE_FRAME_WIDTH;
    activeFrameHeight = MOBILE_FRAME_HEIGHT;
    activeFrameFps = MOBILE_FRAME_FPS;
  }

  landingProfile = {
    isMobile,
    isIOS,
    useModuleCache: !isMobile,
    eagerBackgroundLoad: !isMobile,
    maxRetainedVideos: isMobile ? MOBILE_MAX_RETAINED_VIDEOS : 12,
  };

  return landingProfile;
}

function getMobileVideosToKeepForSection(sectionIndex) {
  const keep = new Set([1]);
  const center = Math.min(12, Math.max(2, sectionIndex + 1));
  keep.add(center);

  if (center > 2) {
    keep.add(center - 1);
  } else if (center < 12) {
    keep.add(center + 1);
  }

  return keep;
}

function getMobileVideosToKeepForSections(sectionIndexes) {
  const keep = new Set();

  sectionIndexes.forEach((sectionIndex) => {
    getMobileVideosToKeepForSection(sectionIndex).forEach((videoNumber) => {
      keep.add(videoNumber);
    });
  });

  return keep;
}

function releaseFrameBitmaps(framesRef) {
  if (framesRef.current.length === 0) {
    return;
  }

  framesRef.current.forEach((bitmap) => {
    bitmap.close?.();
  });
  framesRef.current = [];
}

function getWheelDeltaPixels(event) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * SCROLL_PHYSICS.wheelLineHeightPx;
  }

  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * window.innerHeight;
  }

  return event.deltaY;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function snapPinFromVideoBlend(blend) {
  return blend > 0 ? 1 : 0;
}

function getScrollTimeline() {
  const pin = PIN_ZONE;
  const scrollable = 1 - 2 * pin;
  const fadeLocal = FADE_ZONE / scrollable;
  const crossHalf = FADE_ZONE / scrollable / 2;
  const pinLocal = SECTION1_END_PIN / scrollable;

  const v1Len = VIDEO_SCROLL_LOCAL_LEN;
  const v2Len = VIDEO_SCROLL_LOCAL_LEN;
  const v3Len = VIDEO3_SCROLL_LOCAL_LEN;
  const v4Len = VIDEO4_SCROLL_LOCAL_LEN;
  const v5Len = VIDEO5_SCROLL_LOCAL_LEN;
  const v6Len = VIDEO6_SCROLL_LOCAL_LEN;
  const v7Len = VIDEO7_SCROLL_LOCAL_LEN;
  const v8Len = VIDEO8_SCROLL_LOCAL_LEN;
  const v9Len = VIDEO9_SCROLL_LOCAL_LEN;
  const v10Len = VIDEO10_SCROLL_LOCAL_LEN;
  const v11Len = VIDEO11_SCROLL_LOCAL_LEN;
  const v12Len = VIDEO12_SCROLL_LOCAL_LEN;

  const v1Start = fadeLocal;
  const v1End = fadeLocal + v1Len;
  const s1PinStart = v1End + crossHalf;
  const s1PinEnd = s1PinStart + pinLocal;
  const v2Start = s1PinEnd + crossHalf;
  const v2End = v2Start + v2Len;
  const comPinStart = v2End + crossHalf;
  const comPinEnd = comPinStart + pinLocal;
  const v3Start = comPinEnd + crossHalf;
  const v3End = v3Start + v3Len;
  const portalPinStart = v3End + crossHalf;
  const portalPinEnd = portalPinStart + pinLocal;
  const v4Start = portalPinEnd + crossHalf;
  const v4End = v4Start + v4Len;
  const pagosPinStart = v4End + crossHalf;
  const pagosPinEnd = pagosPinStart + pinLocal;
  const v5Start = pagosPinEnd + crossHalf;
  const v5End = v5Start + v5Len;
  const enfPinStart = v5End + crossHalf;
  const enfPinEnd = enfPinStart + pinLocal;
  const v6Start = enfPinEnd + crossHalf;
  const v6End = v6Start + v6Len;
  const cafPinStart = v6End + crossHalf;
  const cafPinEnd = cafPinStart + pinLocal;
  const v7Start = cafPinEnd + crossHalf;
  const v7End = v7Start + v7Len;
  const bienPinStart = v7End + crossHalf;
  const bienPinEnd = bienPinStart + pinLocal;
  const v8Start = bienPinEnd + crossHalf;
  const v8End = v8Start + v8Len;
  const transPinStart = v8End + crossHalf;
  const transPinEnd = transPinStart + pinLocal;
  const v9Start = transPinEnd + crossHalf;
  const v9End = v9Start + v9Len;
  const rrhhPinStart = v9End + crossHalf;
  const rrhhPinEnd = rrhhPinStart + pinLocal;
  const v10Start = rrhhPinEnd + crossHalf;
  const v10End = v10Start + v10Len;
  const carPinStart = v10End + crossHalf;
  const carPinEnd = carPinStart + pinLocal;
  const v11Start = carPinEnd + crossHalf;
  const v11End = v11Start + v11Len;
  const embPinStart = v11End + crossHalf;
  const embPinEnd = embPinStart + pinLocal;
  const v12Start = embPinEnd + crossHalf;
  const v12End = v12Start + v12Len;
  const conPinStart = v12End + crossHalf;
  const conPinEnd = conPinStart + pinLocal;

  const pinAnchor = (start, end) => (start + end) / 2;

  const toProgress = (local) => pin + local * scrollable;

  return {
    pin,
    scrollable,
    fadeLocal,
    v1Start,
    v1End,
    s1PinStart,
    s1PinEnd,
    v2Start,
    v2End,
    comPinStart,
    comPinEnd,
    v3Start,
    v3End,
    portalPinStart,
    portalPinEnd,
    v4Start,
    v4End,
    pagosPinStart,
    pagosPinEnd,
    v5Start,
    v5End,
    enfPinStart,
    enfPinEnd,
    v6Start,
    v6End,
    cafPinStart,
    cafPinEnd,
    v7Start,
    v7End,
    bienPinStart,
    bienPinEnd,
    v8Start,
    v8End,
    transPinStart,
    transPinEnd,
    v9Start,
    v9End,
    rrhhPinStart,
    rrhhPinEnd,
    v10Start,
    v10End,
    carPinStart,
    carPinEnd,
    v11Start,
    v11End,
    embPinStart,
    embPinEnd,
    v12Start,
    v12End,
    conPinStart,
    conPinEnd,
    toProgress,
    s1EndProgress: toProgress(pinAnchor(s1PinStart, s1PinEnd)),
    comProgress: toProgress(pinAnchor(comPinStart, comPinEnd)),
    portalProgress: toProgress(pinAnchor(portalPinStart, portalPinEnd)),
    pagosProgress: toProgress(pinAnchor(pagosPinStart, pagosPinEnd)),
    enfermeriaProgress: toProgress(pinAnchor(enfPinStart, enfPinEnd)),
    cafeteriaProgress: toProgress(pinAnchor(cafPinStart, cafPinEnd)),
    bienestarProgress: toProgress(pinAnchor(bienPinStart, bienPinEnd)),
    transporteProgress: toProgress(pinAnchor(transPinStart, transPinEnd)),
    recursosHumanosProgress: toProgress(pinAnchor(rrhhPinStart, rrhhPinEnd)),
    carteraProgress: toProgress(pinAnchor(carPinStart, carPinEnd)),
    embudoAdmisionesProgress: toProgress(pinAnchor(embPinStart, embPinEnd)),
    conexionProgress: toProgress(pinAnchor(conPinStart, conPinEnd)),
  };
}

function getTimelineMaxProgress() {
  const t = getScrollTimeline();

  return PIN_ZONE + t.conPinEnd * t.scrollable + PIN_ZONE;
}

function clampScrollProgress(progress) {
  return clamp(progress, 0, getTimelineMaxProgress());
}

function computeLayers(progress) {
  const maxProgress = getTimelineMaxProgress();
  const p = clamp(progress, 0, maxProgress);
  const pin = PIN_ZONE;

  if (p <= pin) {
    return {
      start: 1,
      video1: 0,
      section1End: 0,
      video2: 0,
      comunicaciones: 0,
      video3: 0,
      portal: 0,
      video4: 0,
      pagos: 0,
      video5: 0,
      enfermeria: 0,
      video6: 0,
      cafeteria: 0,
      video7: 0,
      bienestar: 0,
      video8: 0,
      transporte: 0,
      video9: 0,
      recursosHumanos: 0,
      video10: 0,
      cartera: 0,
      video11: 0,
      embudoAdmisiones: 0,
      video12: 0,
      conexion: 0,
      video1Progress: 0,
      video2Progress: 0,
      video3Progress: 0,
      video4Progress: 0,
      video5Progress: 0,
      video6Progress: 0,
      video7Progress: 0,
      video8Progress: 0,
      video9Progress: 0,
      video10Progress: 0,
      video11Progress: 0,
      video12Progress: 0,
    };
  }

  if (p >= maxProgress - pin) {
    return {
      start: 0,
      video1: 0,
      section1End: 0,
      video2: 0,
      comunicaciones: 0,
      video3: 0,
      portal: 0,
      video4: 0,
      pagos: 0,
      video5: 0,
      enfermeria: 0,
      video6: 0,
      cafeteria: 0,
      video7: 0,
      bienestar: 0,
      video8: 0,
      transporte: 0,
      video9: 0,
      recursosHumanos: 0,
      video10: 0,
      cartera: 0,
      video11: 0,
      embudoAdmisiones: 0,
      video12: 0,
      conexion: 1,
      video1Progress: 1,
      video2Progress: 1,
      video3Progress: 1,
      video4Progress: 1,
      video5Progress: 1,
      video6Progress: 1,
      video7Progress: 1,
      video8Progress: 1,
      video9Progress: 1,
      video10Progress: 1,
      video11Progress: 1,
      video12Progress: 1,
    };
  }

  const t = getScrollTimeline();
  const local = (p - pin) / t.scrollable;

  let start = 0;
  let video1 = 0;
  let section1End = 0;
  let video2 = 0;
  let comunicaciones = 0;
  let video3 = 0;
  let portal = 0;
  let video4 = 0;
  let pagos = 0;
  let video5 = 0;
  let enfermeria = 0;
  let video6 = 0;
  let cafeteria = 0;
  let video7 = 0;
  let bienestar = 0;
  let video8 = 0;
  let transporte = 0;
  let video9 = 0;
  let recursosHumanos = 0;
  let video10 = 0;
  let cartera = 0;
  let video11 = 0;
  let embudoAdmisiones = 0;
  let video12 = 0;
  let conexion = 0;
  let video1Progress = 0;
  let video2Progress = 0;
  let video3Progress = 0;
  let video4Progress = 0;
  let video5Progress = 0;
  let video6Progress = 0;
  let video7Progress = 0;
  let video8Progress = 0;
  let video9Progress = 0;
  let video10Progress = 0;
  let video11Progress = 0;
  let video12Progress = 0;

  if (local < t.fadeLocal) {
    video1 = 1;
    video1Progress = clamp(local / t.fadeLocal) * 0.05;
  } else if (local < t.v1End) {
    video1 = 1;
    video1Progress = (local - t.v1Start) / Math.max(t.v1End - t.v1Start, 0.001);
  } else if (local < t.s1PinStart) {
    const blend = (local - t.v1End) / Math.max(t.s1PinStart - t.v1End, 0.001);
    video1 = blend > 0 ? 0 : 1;
    section1End = snapPinFromVideoBlend(blend);
    video1Progress = 1;
  } else if (local < t.s1PinEnd) {
    section1End = 1;
  } else if (local < t.v2Start) {
    const blend = (local - t.s1PinEnd) / Math.max(t.v2Start - t.s1PinEnd, 0.001);
    section1End = 1 - blend;
    video2 = blend;
  } else if (local < t.v2End) {
    video2 = 1;
    video2Progress = (local - t.v2Start) / Math.max(t.v2End - t.v2Start, 0.001);
  } else if (local < t.comPinStart) {
    const blend = (local - t.v2End) / Math.max(t.comPinStart - t.v2End, 0.001);
    video2 = blend > 0 ? 0 : 1;
    comunicaciones = snapPinFromVideoBlend(blend);
    video2Progress = 1;
  } else if (local < t.comPinEnd) {
    comunicaciones = 1;
  } else if (local < t.v3Start) {
    const blend = (local - t.comPinEnd) / Math.max(t.v3Start - t.comPinEnd, 0.001);
    comunicaciones = 1 - blend;
    video3 = blend;
  } else if (local < t.v3End) {
    video3 = 1;
    video3Progress = (local - t.v3Start) / Math.max(t.v3End - t.v3Start, 0.001);
  } else if (local < t.portalPinStart) {
    const blend = (local - t.v3End) / Math.max(t.portalPinStart - t.v3End, 0.001);
    video3 = blend > 0 ? 0 : 1;
    portal = snapPinFromVideoBlend(blend);
    video3Progress = 1;
  } else if (local < t.portalPinEnd) {
    portal = 1;
  } else if (local < t.v4Start) {
    const blend = (local - t.portalPinEnd) / Math.max(t.v4Start - t.portalPinEnd, 0.001);
    portal = 1 - blend;
    video4 = blend;
  } else if (local < t.v4End) {
    video4 = 1;
    video4Progress = (local - t.v4Start) / Math.max(t.v4End - t.v4Start, 0.001);
  } else if (local < t.pagosPinStart) {
    const blend = (local - t.v4End) / Math.max(t.pagosPinStart - t.v4End, 0.001);
    video4 = blend > 0 ? 0 : 1;
    pagos = snapPinFromVideoBlend(blend);
    video4Progress = 1;
  } else if (local < t.pagosPinEnd) {
    pagos = 1;
  } else if (local < t.v5Start) {
    const blend = (local - t.pagosPinEnd) / Math.max(t.v5Start - t.pagosPinEnd, 0.001);
    pagos = 1 - blend;
    video5 = blend;
  } else if (local < t.v5End) {
    video5 = 1;
    video5Progress = (local - t.v5Start) / Math.max(t.v5End - t.v5Start, 0.001);
  } else if (local < t.enfPinStart) {
    const blend = (local - t.v5End) / Math.max(t.enfPinStart - t.v5End, 0.001);
    video5 = blend > 0 ? 0 : 1;
    enfermeria = snapPinFromVideoBlend(blend);
    video5Progress = 1;
  } else if (local < t.enfPinEnd) {
    enfermeria = 1;
  } else if (local < t.v6Start) {
    const blend = (local - t.enfPinEnd) / Math.max(t.v6Start - t.enfPinEnd, 0.001);
    enfermeria = 1 - blend;
    video6 = blend;
  } else if (local < t.v6End) {
    video6 = 1;
    video6Progress = (local - t.v6Start) / Math.max(t.v6End - t.v6Start, 0.001);
  } else if (local < t.cafPinStart) {
    const blend = (local - t.v6End) / Math.max(t.cafPinStart - t.v6End, 0.001);
    video6 = blend > 0 ? 0 : 1;
    cafeteria = snapPinFromVideoBlend(blend);
    video6Progress = 1;
  } else if (local < t.cafPinEnd) {
    cafeteria = 1;
  } else if (local < t.v7Start) {
    const blend = (local - t.cafPinEnd) / Math.max(t.v7Start - t.cafPinEnd, 0.001);
    cafeteria = 1 - blend;
    video7 = blend;
  } else if (local < t.v7End) {
    video7 = 1;
    video7Progress = (local - t.v7Start) / Math.max(t.v7End - t.v7Start, 0.001);
  } else if (local < t.bienPinStart) {
    const blend = (local - t.v7End) / Math.max(t.bienPinStart - t.v7End, 0.001);
    video7 = blend > 0 ? 0 : 1;
    bienestar = snapPinFromVideoBlend(blend);
    video7Progress = 1;
  } else if (local < t.bienPinEnd) {
    bienestar = 1;
  } else if (local < t.v8Start) {
    const blend = (local - t.bienPinEnd) / Math.max(t.v8Start - t.bienPinEnd, 0.001);
    bienestar = 1 - blend;
    video8 = blend;
  } else if (local < t.v8End) {
    video8 = 1;
    video8Progress = (local - t.v8Start) / Math.max(t.v8End - t.v8Start, 0.001);
  } else if (local < t.transPinStart) {
    const blend = (local - t.v8End) / Math.max(t.transPinStart - t.v8End, 0.001);
    video8 = blend > 0 ? 0 : 1;
    transporte = snapPinFromVideoBlend(blend);
    video8Progress = 1;
  } else if (local < t.transPinEnd) {
    transporte = 1;
  } else if (local < t.v9Start) {
    const blend = (local - t.transPinEnd) / Math.max(t.v9Start - t.transPinEnd, 0.001);
    transporte = 1 - blend;
    video9 = blend;
  } else if (local < t.v9End) {
    video9 = 1;
    video9Progress = (local - t.v9Start) / Math.max(t.v9End - t.v9Start, 0.001);
  } else if (local < t.rrhhPinStart) {
    const blend = (local - t.v9End) / Math.max(t.rrhhPinStart - t.v9End, 0.001);
    video9 = blend > 0 ? 0 : 1;
    recursosHumanos = snapPinFromVideoBlend(blend);
    video9Progress = 1;
  } else if (local < t.rrhhPinEnd) {
    recursosHumanos = 1;
  } else if (local < t.v10Start) {
    const blend = (local - t.rrhhPinEnd) / Math.max(t.v10Start - t.rrhhPinEnd, 0.001);
    recursosHumanos = 1 - blend;
    video10 = blend;
  } else if (local < t.v10End) {
    video10 = 1;
    video10Progress = (local - t.v10Start) / Math.max(t.v10End - t.v10Start, 0.001);
  } else if (local < t.carPinStart) {
    const blend = (local - t.v10End) / Math.max(t.carPinStart - t.v10End, 0.001);
    video10 = blend > 0 ? 0 : 1;
    cartera = snapPinFromVideoBlend(blend);
    video10Progress = 1;
  } else if (local < t.carPinEnd) {
    cartera = 1;
  } else if (local < t.v11Start) {
    const blend = (local - t.carPinEnd) / Math.max(t.v11Start - t.carPinEnd, 0.001);
    cartera = 1 - blend;
    video11 = blend;
  } else if (local < t.v11End) {
    video11 = 1;
    video11Progress = (local - t.v11Start) / Math.max(t.v11End - t.v11Start, 0.001);
  } else if (local < t.embPinStart) {
    const blend = (local - t.v11End) / Math.max(t.embPinStart - t.v11End, 0.001);
    video11 = blend > 0 ? 0 : 1;
    embudoAdmisiones = snapPinFromVideoBlend(blend);
    video11Progress = 1;
  } else if (local < t.embPinEnd) {
    embudoAdmisiones = 1;
  } else if (local < t.v12Start) {
    const blend = (local - t.embPinEnd) / Math.max(t.v12Start - t.embPinEnd, 0.001);
    embudoAdmisiones = 1 - blend;
    video12 = blend;
  } else if (local < t.v12End) {
    video12 = 1;
    video12Progress = (local - t.v12Start) / Math.max(t.v12End - t.v12Start, 0.001);
  } else if (local < t.conPinStart) {
    const blend = (local - t.v12End) / Math.max(t.conPinStart - t.v12End, 0.001);
    video12 = blend > 0 ? 0 : 1;
    conexion = snapPinFromVideoBlend(blend);
    video12Progress = 1;
  } else {
    conexion = 1;
  }

  return {
    start,
    video1,
    section1End,
    video2,
    comunicaciones,
    video3,
    portal,
    video4,
    pagos,
    video5,
    enfermeria,
    video6,
    cafeteria,
    video7,
    bienestar,
    video8,
    transporte,
    video9,
    recursosHumanos,
    video10,
    cartera,
    video11,
    embudoAdmisiones,
    video12,
    conexion,
    video1Progress: clamp(video1Progress),
    video2Progress: clamp(video2Progress),
    video3Progress: clamp(video3Progress),
    video4Progress: clamp(video4Progress),
    video5Progress: clamp(video5Progress),
    video6Progress: clamp(video6Progress),
    video7Progress: clamp(video7Progress),
    video8Progress: clamp(video8Progress),
    video9Progress: clamp(video9Progress),
    video10Progress: clamp(video10Progress),
    video11Progress: clamp(video11Progress),
    video12Progress: clamp(video12Progress),
  };
}

function getSection1EndProgress() {
  return getScrollTimeline().s1EndProgress;
}

function getVideo1MotionStartProgress() {
  return PIN_ZONE + FADE_ZONE + 0.003;
}

function getVideo2ZoneStartProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v2Start);
}

function getVideo3ZoneStartProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v3Start);
}

function getVideoSectionNavTransitionMs() {
  return VIDEO_SECTION_NAV_TRANSITION_MS;
}

function getPortalNavTransitionMs() {
  return getVideoSectionNavTransitionMs();
}

function getPagosNavTransitionMs() {
  return getVideoSectionNavTransitionMs();
}

function getEnfermeriaNavTransitionMs() {
  return getVideoSectionNavTransitionMs();
}

function getCafeteriaNavTransitionMs() {
  return getVideoSectionNavTransitionMs();
}

function getBienestarNavTransitionMs() {
  return getVideoSectionNavTransitionMs();
}

function getTransporteNavTransitionMs() {
  return getVideoSectionNavTransitionMs();
}

function getRecursosHumanosNavTransitionMs() {
  return getVideoSectionNavTransitionMs();
}

function getCarteraNavTransitionMs() {
  return getVideoSectionNavTransitionMs();
}

function getEmbudoAdmisionesNavTransitionMs() {
  return getVideoSectionNavTransitionMs();
}

function getConexionNavTransitionMs() {
  return getVideoSectionNavTransitionMs();
}

function getVideoDisplayProgress(videoKey, progress) {
  const startOffset = VIDEO_DISPLAY_FRAME_START[videoKey] ?? 0;
  const endMax = VIDEO_DISPLAY_FRAME_END[videoKey] ?? VIDEO_DISPLAY_MAX;
  const p = clamp(progress);

  return startOffset + p * (endMax - startOffset);
}

function getVideo4ZoneStartProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v4Start);
}

function getVideo1EndBeforeEcosistemaProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v1End);
}

function getVideo5ZoneStartProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v5Start);
}

function getVideo6ZoneStartProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v6Start);
}

function getVideo7ZoneStartProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v7Start);
}

function getVideo8ZoneStartProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v8Start);
}

function getVideo9ZoneStartProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v9Start);
}

function getVideo10ZoneStartProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v10Start);
}

function getVideo11ZoneStartProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v11Start);
}

function getVideo12ZoneStartProgress() {
  const t = getScrollTimeline();

  return t.toProgress(t.v12Start);
}

function getSectionAnchors() {
  const t = getScrollTimeline();

  return [
    0,
    t.s1EndProgress,
    t.comProgress,
    t.portalProgress,
    t.pagosProgress,
    t.enfermeriaProgress,
    t.cafeteriaProgress,
    t.bienestarProgress,
    t.transporteProgress,
    t.recursosHumanosProgress,
    t.carteraProgress,
    t.embudoAdmisionesProgress,
    t.conexionProgress,
  ];
}

function getSection6GateProgress() {
  const t = getScrollTimeline();

  return t.toProgress(Math.max(t.pagosPinStart, t.pagosPinEnd - 0.001));
}

function getSection7GateProgress() {
  const t = getScrollTimeline();

  return t.toProgress(Math.max(t.enfPinStart, t.enfPinEnd - 0.001));
}

function getSection8GateProgress() {
  const t = getScrollTimeline();

  return t.toProgress(Math.max(t.cafPinStart, t.cafPinEnd - 0.001));
}

function getSection9GateProgress() {
  const t = getScrollTimeline();

  return t.toProgress(Math.max(t.bienPinStart, t.bienPinEnd - 0.001));
}

function getSection10GateProgress() {
  const t = getScrollTimeline();

  return t.toProgress(Math.max(t.transPinStart, t.transPinEnd - 0.001));
}

function getSection11GateProgress() {
  const t = getScrollTimeline();

  return t.toProgress(Math.max(t.rrhhPinStart, t.rrhhPinEnd - 0.001));
}

function getSection12GateProgress() {
  const t = getScrollTimeline();

  return t.toProgress(Math.max(t.carPinStart, t.carPinEnd - 0.001));
}

function getSection13GateProgress() {
  const t = getScrollTimeline();

  return t.toProgress(Math.max(t.embPinStart, t.embPinEnd - 0.001));
}

function getSection3GateProgress() {
  const t = getScrollTimeline();

  return t.toProgress(Math.max(t.s1PinStart, t.s1PinEnd - 0.001));
}

function getSection4GateProgress() {
  const t = getScrollTimeline();

  return t.toProgress(Math.max(t.comPinStart, t.comPinEnd - 0.001));
}

function getSection5GateProgress() {
  const t = getScrollTimeline();

  return t.toProgress(Math.max(t.portalPinStart, t.portalPinEnd - 0.001));
}

function getMaxScrollProgress(
  video2Ready,
  video3Ready,
  video4Ready,
  video5Ready,
  video6Ready,
  video7Ready,
  video8Ready,
  video9Ready,
  video10Ready,
  video11Ready,
  video12Ready,
) {
  if (!video2Ready) {
    return getSection3GateProgress();
  }

  if (!video3Ready) {
    return getSection4GateProgress();
  }

  if (!video4Ready) {
    return getSection5GateProgress();
  }

  if (!video5Ready) {
    return getSection6GateProgress();
  }

  if (!video6Ready) {
    return getSection7GateProgress();
  }

  if (!video7Ready) {
    return getSection8GateProgress();
  }

  if (!video8Ready) {
    return getSection9GateProgress();
  }

  if (!video9Ready) {
    return getSection10GateProgress();
  }

  if (!video10Ready) {
    return getSection11GateProgress();
  }

  if (!video11Ready) {
    return getSection12GateProgress();
  }

  if (!video12Ready) {
    return getSection13GateProgress();
  }

  return getTimelineMaxProgress();
}

function clampProgressForLateSections(
  progress,
  video2Ready,
  video3Ready,
  video4Ready,
  video5Ready,
  video6Ready,
  video7Ready,
  video8Ready,
  video9Ready,
  video10Ready,
  video11Ready,
  video12Ready,
) {
  return Math.min(progress, getMaxScrollProgress(
    video2Ready,
    video3Ready,
    video4Ready,
    video5Ready,
    video6Ready,
    video7Ready,
    video8Ready,
    video9Ready,
    video10Ready,
    video11Ready,
    video12Ready,
  ));
}

function mapSkipEcosistemaProgress(t, start, target, v2Start, v1End) {
  const phase1End = 0.42;
  const warpEnd = 0.5;

  if (t < phase1End) {
    return start + (v2Start - start) * (t / phase1End);
  }

  if (t < warpEnd) {
    const warpT = (t - phase1End) / (warpEnd - phase1End);

    return v2Start + (v1End - v2Start) * warpT;
  }

  const tailT = (t - warpEnd) / (1 - warpEnd);

  return v1End + (target - v1End) * tailT;
}

function getActiveSectionIndex(progress, anchors) {
  let active = 0;

  for (let i = 1; i < anchors.length; i += 1) {
    const threshold = (anchors[i] + anchors[i - 1]) / 2;
    if (progress >= threshold) {
      active = i;
    }
  }

  return active;
}

function computeJumpEase() {
  return (t) => t;
}

function fitMediaToViewport(viewport, mediaElements, mediaWidth, mediaHeight) {
  if (!viewport || !mediaWidth || !mediaHeight) {
    return;
  }

  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;
  if (!viewportWidth || !viewportHeight) {
    return;
  }

  const scale = Math.min(
    viewportWidth / mediaWidth,
    viewportHeight / mediaHeight,
  );
  const width = Math.round(mediaWidth * scale);
  const height = Math.round(mediaHeight * scale);

  mediaElements.forEach((element) => {
    if (element) {
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
    }
  });
}

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function seekVideoTo(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.001) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      video.removeEventListener('seeked', onSeeked);
      clearTimeout(timeoutId);
      resolve();
    };

    const onSeeked = () => finish();
    const timeoutId = setTimeout(finish, 2500);

    video.addEventListener('seeked', onSeeked);

    try {
      video.currentTime = time;
    } catch {
      finish();
    }
  });
}

function trimPreFinalFrames(frames, trimCount = PRE_FINAL_TRIM_FRAMES) {
  if (frames.length <= trimCount + 1) {
    return frames;
  }

  const lastIndex = frames.length - 1;
  const trimStart = lastIndex - trimCount;

  for (let i = trimStart; i < lastIndex; i += 1) {
    frames[i]?.close();
  }

  return frames.slice(0, trimStart).concat(frames[lastIndex]);
}

function trimEdgeFrames(frames, trimCount = EDGE_TRIM_FRAMES) {
  const minLength = 2 + trimCount * 2;
  if (frames.length <= minLength) {
    return frames;
  }

  const endTrimStart = frames.length - trimCount - 1;

  for (let i = 1; i <= trimCount; i += 1) {
    frames[i]?.close();
  }

  for (let i = endTrimStart; i < frames.length - 1; i += 1) {
    frames[i]?.close();
  }

  return [
    frames[0],
    ...frames.slice(1 + trimCount, endTrimStart),
    frames[frames.length - 1],
  ];
}

async function extractVideoFrames(video, onProgress, trimStartSec = 0, trimEndSec = 0) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const trimStart = clamp(trimStartSec, 0, Math.max(0, duration - 0.2));
  const trimEnd = clamp(trimEndSec, 0, Math.max(0, duration - trimStart - 0.2));
  const playableDuration = Math.max(duration - trimStart - trimEnd, 0.1);
  const frameCount = Math.max(2, Math.ceil(playableDuration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const videoProgress = i / (frameCount - 1);
    const targetTime = trimStart + videoProgress * Math.max(playableDuration - 0.001, 0);
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimEdgeFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function extractVideo1Frames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const frameCount = Math.max(2, Math.ceil(duration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const targetTime = Math.min(i / activeFrameFps, Math.max(0, duration - 0.001));
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimPreFinalFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function extractVideo2Frames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const trimStart = clamp(VIDEO2_TRIM_START_SEC, 0, Math.max(0, duration - 0.2));
  const playableDuration = Math.max(duration - trimStart, 0.1);
  const frameCount = Math.max(2, Math.ceil(playableDuration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const targetTime = Math.min(
      trimStart + i / activeFrameFps,
      Math.max(trimStart, duration - 0.001),
    );
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimEdgeFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function extractVideo4Frames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const trimStart = clamp(VIDEO4_TRIM_START_SEC, 0, Math.max(0, duration - 0.2));
  const playableDuration = Math.max(duration - trimStart, 0.1);
  const frameCount = Math.max(2, Math.ceil(playableDuration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const targetTime = Math.min(
      trimStart + i / activeFrameFps,
      Math.max(trimStart, duration - 0.001),
    );
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimEdgeFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function extractVideo5Frames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const trimStart = clamp(VIDEO5_TRIM_START_SEC, 0, Math.max(0, duration - 0.2));
  const playableDuration = Math.max(duration - trimStart, 0.1);
  const frameCount = Math.max(2, Math.ceil(playableDuration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const targetTime = Math.min(
      trimStart + i / activeFrameFps,
      Math.max(trimStart, duration - 0.001),
    );
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimEdgeFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function extractVideo6Frames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const trimStart = clamp(VIDEO6_TRIM_START_SEC, 0, Math.max(0, duration - 0.2));
  const playableDuration = Math.max(duration - trimStart, 0.1);
  const frameCount = Math.max(2, Math.ceil(playableDuration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const targetTime = Math.min(
      trimStart + i / activeFrameFps,
      Math.max(trimStart, duration - 0.001),
    );
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimEdgeFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function extractVideo7Frames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const trimStart = clamp(VIDEO7_TRIM_START_SEC, 0, Math.max(0, duration - 0.2));
  const playableDuration = Math.max(duration - trimStart, 0.1);
  const frameCount = Math.max(2, Math.ceil(playableDuration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const targetTime = Math.min(
      trimStart + i / activeFrameFps,
      Math.max(trimStart, duration - 0.001),
    );
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimEdgeFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function extractVideo8Frames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const trimStart = clamp(VIDEO8_TRIM_START_SEC, 0, Math.max(0, duration - 0.2));
  const playableDuration = Math.max(duration - trimStart, 0.1);
  const frameCount = Math.max(2, Math.ceil(playableDuration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const targetTime = Math.min(
      trimStart + i / activeFrameFps,
      Math.max(trimStart, duration - 0.001),
    );
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimEdgeFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function extractVideo9Frames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const trimStart = clamp(VIDEO9_TRIM_START_SEC, 0, Math.max(0, duration - 0.2));
  const playableDuration = Math.max(duration - trimStart, 0.1);
  const frameCount = Math.max(2, Math.ceil(playableDuration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const targetTime = Math.min(
      trimStart + i / activeFrameFps,
      Math.max(trimStart, duration - 0.001),
    );
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimEdgeFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function extractVideo10Frames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const trimStart = clamp(VIDEO10_TRIM_START_SEC, 0, Math.max(0, duration - 0.2));
  const playableDuration = Math.max(duration - trimStart, 0.1);
  const frameCount = Math.max(2, Math.ceil(playableDuration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const targetTime = Math.min(
      trimStart + i / activeFrameFps,
      Math.max(trimStart, duration - 0.001),
    );
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimEdgeFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function extractVideo11Frames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const trimStart = clamp(VIDEO11_TRIM_START_SEC, 0, Math.max(0, duration - 0.2));
  const playableDuration = Math.max(duration - trimStart, 0.1);
  const frameCount = Math.max(2, Math.ceil(playableDuration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const targetTime = Math.min(
      trimStart + i / activeFrameFps,
      Math.max(trimStart, duration - 0.001),
    );
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimEdgeFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function extractVideo12Frames(video, onProgress) {
  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!duration || !Number.isFinite(duration) || !width || !height) {
    return { frames: [], width: 0, height: 0 };
  }

  const trimStart = clamp(VIDEO12_TRIM_START_SEC, 0, Math.max(0, duration - 0.2));
  const playableDuration = Math.max(duration - trimStart, 0.1);
  const frameCount = Math.max(2, Math.ceil(playableDuration * activeFrameFps));
  const frames = [];
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');

  for (let i = 0; i < frameCount; i += 1) {
    const targetTime = Math.min(
      trimStart + i / activeFrameFps,
      Math.max(trimStart, duration - 0.001),
    );
    await seekVideoTo(video, targetTime);
    ctx.drawImage(video, 0, 0, activeFrameWidth, activeFrameHeight);
    frames.push(await createImageBitmap(scratch));

    onProgress?.((i + 1) / frameCount);

    if (i % 3 === 0) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }

  return { frames: trimEdgeFrames(frames), width: activeFrameWidth, height: activeFrameHeight };
}

async function createNativePinBitmap(image) {
  const scratch = document.createElement('canvas');
  scratch.width = activeFrameWidth;
  scratch.height = activeFrameHeight;
  const ctx = scratch.getContext('2d');
  ctx.drawImage(image, 0, 0, activeFrameWidth, activeFrameHeight);
  return createImageBitmap(scratch);
}

async function applyPinTailToFrames(frames, pinImage, tailRatio = VIDEO_PIN_TAIL_RATIO, tailFrameCount = null) {
  if (frames.length === 0) {
    return;
  }

  const tailCount = tailFrameCount != null
    ? Math.min(frames.length, Math.max(0, tailFrameCount))
    : Math.max(1, Math.round(frames.length * tailRatio));

  if (tailCount <= 0) {
    return;
  }

  const pinBitmap = await createNativePinBitmap(pinImage);
  const tailStart = frames.length - tailCount;

  for (let i = tailStart; i < frames.length; i += 1) {
    if (frames[i] && frames[i] !== pinBitmap) {
      frames[i].close();
    }
    frames[i] = pinBitmap;
  }
}

function isPinHoldActive(layers) {
  const pinVisible = layers.section1End >= 0.99
    || layers.comunicaciones >= 0.99
    || layers.portal >= 0.99
    || layers.pagos >= 0.99
    || layers.enfermeria >= 0.99
    || layers.cafeteria >= 0.99
    || layers.bienestar >= 0.99
    || layers.transporte >= 0.99
    || layers.recursosHumanos >= 0.99
    || layers.cartera >= 0.99
    || layers.embudoAdmisiones >= 0.99
    || layers.conexion >= 0.99
    || layers.start >= 0.99;
  const videoVisible = layers.video1 > 0.02
    || layers.video2 > 0.02
    || layers.video3 > 0.02
    || layers.video4 > 0.02
    || layers.video5 > 0.02
    || layers.video6 > 0.02
    || layers.video7 > 0.02
    || layers.video8 > 0.02
    || layers.video9 > 0.02
    || layers.video10 > 0.02
    || layers.video11 > 0.02
    || layers.video12 > 0.02;

  return pinVisible && !videoVisible;
}

function LandingPage() {
  ensureLandingProfile();
  const video1Ref = useRef(null);
  const video2Ref = useRef(null);
  const video3Ref = useRef(null);
  const video4Ref = useRef(null);
  const video5Ref = useRef(null);
  const video6Ref = useRef(null);
  const video7Ref = useRef(null);
  const video8Ref = useRef(null);
  const video9Ref = useRef(null);
  const video10Ref = useRef(null);
  const video11Ref = useRef(null);
  const video12Ref = useRef(null);
  const canvas1Ref = useRef(null);
  const canvas2Ref = useRef(null);
  const canvas3Ref = useRef(null);
  const canvas4Ref = useRef(null);
  const canvas5Ref = useRef(null);
  const canvas6Ref = useRef(null);
  const canvas7Ref = useRef(null);
  const canvas8Ref = useRef(null);
  const canvas9Ref = useRef(null);
  const canvas10Ref = useRef(null);
  const canvas11Ref = useRef(null);
  const canvas12Ref = useRef(null);
  const viewportRef = useRef(null);
  const startRef = useRef(null);
  const section1EndRef = useRef(null);
  const comunicacionesRef = useRef(null);
  const portalRef = useRef(null);
  const pagosRef = useRef(null);
  const enfermeriaRef = useRef(null);
  const cafeteriaRef = useRef(null);
  const bienestarRef = useRef(null);
  const transporteRef = useRef(null);
  const recursosHumanosRef = useRef(null);
  const carteraRef = useRef(null);
  const embudoAdmisionesRef = useRef(null);
  const conexionRef = useRef(null);
  const shadeRef = useRef(null);
  const frames1Ref = useRef([]);
  const frames2Ref = useRef([]);
  const frames3Ref = useRef([]);
  const frames4Ref = useRef([]);
  const frames5Ref = useRef([]);
  const frames6Ref = useRef([]);
  const frames7Ref = useRef([]);
  const frames8Ref = useRef([]);
  const frames9Ref = useRef([]);
  const frames10Ref = useRef([]);
  const frames11Ref = useRef([]);
  const frames12Ref = useRef([]);
  const frameCountsRef = useRef({ f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1, f7: 1, f8: 1, f9: 1, f10: 1, f11: 1, f12: 1 });
  const mediaSizeRef = useRef({ width: activeFrameWidth, height: activeFrameHeight });
  const lastFrameIndex1Ref = useRef(-1);
  const lastFrameIndex2Ref = useRef(-1);
  const lastFrameIndex3Ref = useRef(-1);
  const lastFrameIndex4Ref = useRef(-1);
  const lastFrameIndex5Ref = useRef(-1);
  const lastFrameIndex6Ref = useRef(-1);
  const lastFrameIndex7Ref = useRef(-1);
  const lastFrameIndex8Ref = useRef(-1);
  const lastFrameIndex9Ref = useRef(-1);
  const lastFrameIndex10Ref = useRef(-1);
  const lastFrameIndex11Ref = useRef(-1);
  const lastFrameIndex12Ref = useRef(-1);
  const progressRef = useRef(0);
  const velocityRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const inputActiveRef = useRef(false);
  const loopActiveRef = useRef(false);
  const lastTouchYRef = useRef(0);
  const lastTouchTimeRef = useRef(0);
  const touchVelocityRef = useRef(0);
  const rafRef = useRef(0);
  const pauseActiveRef = useRef(false);
  const pauseTimerRef = useRef(0);
  const sectionPauseAnchorRef = useRef(0);
  const jumpAnimRef = useRef(0);
  const jumpActiveRef = useRef(false);
  const jumpTargetSectionRef = useRef(null);
  const touchUiActiveRef = useRef(false);
  const touchSectionSelectLockRef = useRef(false);
  const lastActiveSectionRef = useRef(0);
  const video3ReadyRef = useRef(false);
  const video2ReadyRef = useRef(false);
  const video4ReadyRef = useRef(false);
  const video5ReadyRef = useRef(false);
  const video6ReadyRef = useRef(false);
  const video7ReadyRef = useRef(false);
  const video8ReadyRef = useRef(false);
  const video9ReadyRef = useRef(false);
  const video10ReadyRef = useRef(false);
  const video11ReadyRef = useRef(false);
  const video12ReadyRef = useRef(false);
  const video2LoadStartedRef = useRef(false);
  const video3LoadStartedRef = useRef(false);
  const video4LoadStartedRef = useRef(false);
  const video5LoadStartedRef = useRef(false);
  const video6LoadStartedRef = useRef(false);
  const video7LoadStartedRef = useRef(false);
  const video8LoadStartedRef = useRef(false);
  const video9LoadStartedRef = useRef(false);
  const video10LoadStartedRef = useRef(false);
  const video11LoadStartedRef = useRef(false);
  const video12LoadStartedRef = useRef(false);
  const backgroundLoadRef = useRef(0);
  const ensureVideo2LoadRef = useRef(null);
  const ensureVideo3LoadRef = useRef(null);
  const ensureVideo4LoadRef = useRef(null);
  const ensureVideo5LoadRef = useRef(null);
  const ensureVideo6LoadRef = useRef(null);
  const ensureVideo7LoadRef = useRef(null);
  const ensureVideo8LoadRef = useRef(null);
  const ensureVideo9LoadRef = useRef(null);
  const ensureVideo10LoadRef = useRef(null);
  const ensureVideo11LoadRef = useRef(null);
  const ensureVideo12LoadRef = useRef(null);

  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      ensureLandingProfile();
    }

    return !(
      landingSessionReady
      && ensureLandingProfile().useModuleCache
      && landingFramesCache?.version === FRAMES_CACHE_VERSION
    );
  });
  const [loadProgress, setLoadProgress] = useState(0);
  const [section3Loading, setSection3Loading] = useState(false);
  const [section4Loading, setSection4Loading] = useState(false);
  const [section5Loading, setSection5Loading] = useState(false);
  const [section6Loading, setSection6Loading] = useState(false);
  const [section7Loading, setSection7Loading] = useState(false);
  const [section8Loading, setSection8Loading] = useState(false);
  const [section9Loading, setSection9Loading] = useState(false);
  const [section10Loading, setSection10Loading] = useState(false);
  const [section11Loading, setSection11Loading] = useState(false);
  const [section12Loading, setSection12Loading] = useState(false);
  const [section13Loading, setSection13Loading] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [showRotatePrompt, setShowRotatePrompt] = useState(false);
  const [showOnboardingHints, setShowOnboardingHints] = useState(false);

  const evictRemoteVideosForMobileRef = useRef(null);

  const evictRemoteVideosForMobile = useCallback((activeSectionIndex, extraSectionIndexes = []) => {
    const profile = ensureLandingProfile();
    if (!profile.isMobile) {
      return;
    }

    const keep = getMobileVideosToKeepForSections([activeSectionIndex, ...extraSectionIndexes]);
    const entries = [
      [2, frames2Ref, video2ReadyRef, video2LoadStartedRef, setSection3Loading],
      [3, frames3Ref, video3ReadyRef, video3LoadStartedRef, setSection4Loading],
      [4, frames4Ref, video4ReadyRef, video4LoadStartedRef, setSection5Loading],
      [5, frames5Ref, video5ReadyRef, video5LoadStartedRef, setSection6Loading],
      [6, frames6Ref, video6ReadyRef, video6LoadStartedRef, setSection7Loading],
      [7, frames7Ref, video7ReadyRef, video7LoadStartedRef, setSection8Loading],
      [8, frames8Ref, video8ReadyRef, video8LoadStartedRef, setSection9Loading],
      [9, frames9Ref, video9ReadyRef, video9LoadStartedRef, setSection10Loading],
      [10, frames10Ref, video10ReadyRef, video10LoadStartedRef, setSection11Loading],
      [11, frames11Ref, video11ReadyRef, video11LoadStartedRef, setSection12Loading],
      [12, frames12Ref, video12ReadyRef, video12LoadStartedRef, setSection13Loading],
    ];

    entries.forEach(([videoNumber, framesRef, readyRef, startedRef, setLoadingFlag]) => {
      if (keep.has(videoNumber) || framesRef.current.length === 0) {
        return;
      }

      releaseFrameBitmaps(framesRef);
      readyRef.current = false;
      startedRef.current = false;
      setLoadingFlag(false);
    });
  }, []);

  useLayoutEffect(() => {
    evictRemoteVideosForMobileRef.current = evictRemoteVideosForMobile;
  }, [evictRemoteVideosForMobile]);

  const paintCanvas = useCallback((canvas, frames, videoProgress, lastIndexRef) => {
    if (!canvas || frames.length === 0) {
      return;
    }

    const index = Math.min(
      frames.length - 1,
      Math.max(0, Math.round(clamp(videoProgress) * (frames.length - 1))),
    );

    lastIndexRef.current = index;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(frames[index], 0, 0, activeFrameWidth, activeFrameHeight);
  }, []);

  const applyLayers = useCallback((layers) => {
    const start = startRef.current;
    const canvas1 = canvas1Ref.current;
    const section1End = section1EndRef.current;
    const canvas2 = canvas2Ref.current;
    const comunicaciones = comunicacionesRef.current;
    const canvas3 = canvas3Ref.current;
    const portal = portalRef.current;
    const canvas4 = canvas4Ref.current;
    const pagos = pagosRef.current;
    const canvas5 = canvas5Ref.current;
    const enfermeria = enfermeriaRef.current;
    const canvas6 = canvas6Ref.current;
    const cafeteria = cafeteriaRef.current;
    const canvas7 = canvas7Ref.current;
    const bienestar = bienestarRef.current;
    const canvas8 = canvas8Ref.current;
    const transporte = transporteRef.current;
    const canvas9 = canvas9Ref.current;
    const recursosHumanos = recursosHumanosRef.current;
    const canvas10 = canvas10Ref.current;
    const cartera = carteraRef.current;
    const canvas11 = canvas11Ref.current;
    const embudoAdmisiones = embudoAdmisionesRef.current;
    const canvas12 = canvas12Ref.current;
    const conexion = conexionRef.current;

    if (start) {
      start.style.opacity = String(layers.start);
      start.style.visibility = layers.start > 0 ? 'visible' : 'hidden';
    }

    if (canvas1) {
      canvas1.style.opacity = String(layers.video1);
      canvas1.style.visibility = 'visible';
    }

    if (section1End) {
      section1End.style.opacity = String(layers.section1End);
      section1End.style.visibility = layers.section1End > 0 ? 'visible' : 'hidden';
    }

    if (canvas2) {
      canvas2.style.opacity = String(layers.video2);
      canvas2.style.visibility = 'visible';
    }

    if (comunicaciones) {
      comunicaciones.style.opacity = String(layers.comunicaciones);
      comunicaciones.style.visibility = layers.comunicaciones > 0 ? 'visible' : 'hidden';
    }

    if (canvas3) {
      canvas3.style.opacity = String(layers.video3);
      canvas3.style.visibility = 'visible';
    }

    if (portal) {
      portal.style.opacity = String(layers.portal);
      portal.style.visibility = layers.portal > 0 ? 'visible' : 'hidden';
    }

    if (canvas4) {
      canvas4.style.opacity = String(layers.video4);
      canvas4.style.visibility = 'visible';
    }

    if (pagos) {
      pagos.style.opacity = String(layers.pagos);
      pagos.style.visibility = layers.pagos > 0 ? 'visible' : 'hidden';
    }

    if (canvas5) {
      canvas5.style.opacity = String(layers.video5);
      canvas5.style.visibility = 'visible';
    }

    if (enfermeria) {
      enfermeria.style.opacity = String(layers.enfermeria);
      enfermeria.style.visibility = layers.enfermeria > 0 ? 'visible' : 'hidden';
    }

    if (canvas6) {
      canvas6.style.opacity = String(layers.video6);
      canvas6.style.visibility = 'visible';
    }

    if (cafeteria) {
      cafeteria.style.opacity = String(layers.cafeteria);
      cafeteria.style.visibility = layers.cafeteria > 0 ? 'visible' : 'hidden';
    }

    if (canvas7) {
      canvas7.style.opacity = String(layers.video7);
      canvas7.style.visibility = 'visible';
    }

    if (bienestar) {
      bienestar.style.opacity = String(layers.bienestar);
      bienestar.style.visibility = layers.bienestar > 0 ? 'visible' : 'hidden';
    }

    if (canvas8) {
      canvas8.style.opacity = String(layers.video8);
      canvas8.style.visibility = 'visible';
    }

    if (transporte) {
      transporte.style.opacity = String(layers.transporte);
      transporte.style.visibility = layers.transporte > 0 ? 'visible' : 'hidden';
    }

    if (canvas9) {
      canvas9.style.opacity = String(layers.video9);
      canvas9.style.visibility = 'visible';
    }

    if (recursosHumanos) {
      recursosHumanos.style.opacity = String(layers.recursosHumanos);
      recursosHumanos.style.visibility = layers.recursosHumanos > 0 ? 'visible' : 'hidden';
    }

    if (canvas10) {
      canvas10.style.opacity = String(layers.video10);
      canvas10.style.visibility = 'visible';
    }

    if (cartera) {
      cartera.style.opacity = String(layers.cartera);
      cartera.style.visibility = layers.cartera > 0 ? 'visible' : 'hidden';
    }

    if (canvas11) {
      canvas11.style.opacity = String(layers.video11);
      canvas11.style.visibility = 'visible';
    }

    if (embudoAdmisiones) {
      embudoAdmisiones.style.opacity = String(layers.embudoAdmisiones);
      embudoAdmisiones.style.visibility = layers.embudoAdmisiones > 0 ? 'visible' : 'hidden';
    }

    if (canvas12) {
      canvas12.style.opacity = String(layers.video12);
      canvas12.style.visibility = 'visible';
    }

    if (conexion) {
      conexion.style.opacity = String(layers.conexion);
      conexion.style.visibility = layers.conexion > 0 ? 'visible' : 'hidden';
    }

    const shade = shadeRef.current;
    if (shade) {
      shade.style.opacity = isPinHoldActive(layers) ? '0.06' : '1';
    }
  }, []);

  const clearSectionPause = useCallback(() => {
    pauseActiveRef.current = false;
    clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = 0;
  }, []);

  const engageSectionPause = useCallback((anchorProgress, durationMs = SECTION_SCROLL_PAUSE_MS) => {
    sectionPauseAnchorRef.current = anchorProgress;
    pauseActiveRef.current = true;
    velocityRef.current = 0;
    loopActiveRef.current = false;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;

    clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = window.setTimeout(() => {
      pauseActiveRef.current = false;
      pauseTimerRef.current = 0;
    }, durationMs);

    return anchorProgress;
  }, []);

  const applyProgress = useCallback((nextProgress) => {
    const gated = clampProgressForLateSections(
      nextProgress,
      video2ReadyRef.current,
      video3ReadyRef.current,
      video4ReadyRef.current,
      video5ReadyRef.current,
      video6ReadyRef.current,
      video7ReadyRef.current,
      video8ReadyRef.current,
      video9ReadyRef.current,
      video10ReadyRef.current,
      video11ReadyRef.current,
      video12ReadyRef.current,
    );
    const clamped = clampScrollProgress(gated);
    progressRef.current = clamped;

    const timelineMaxProgress = getTimelineMaxProgress();

    const hasVideo1Frames = frames1Ref.current.length > 0;
    const hasVideo2Frames = frames2Ref.current.length > 0;
    const hasVideo3Frames = frames3Ref.current.length > 0;
    const hasVideo4Frames = frames4Ref.current.length > 0;
    const hasVideo5Frames = frames5Ref.current.length > 0;
    const hasVideo6Frames = frames6Ref.current.length > 0;
    const hasVideo7Frames = frames7Ref.current.length > 0;
    const hasVideo8Frames = frames8Ref.current.length > 0;
    const hasVideo9Frames = frames9Ref.current.length > 0;
    const hasVideo10Frames = frames10Ref.current.length > 0;
    const hasVideo11Frames = frames11Ref.current.length > 0;
    const hasVideo12Frames = frames12Ref.current.length > 0;
    const layers = hasVideo1Frames
      ? computeLayers(clamped)
      : clamped >= timelineMaxProgress - PIN_ZONE
        ? {
          start: 0,
          video1: 0,
          section1End: 0,
          video2: 0,
          comunicaciones: 0,
          video3: 0,
          portal: 0,
          video4: 0,
          pagos: 0,
          video5: 0,
          enfermeria: 0,
          video6: 0,
          cafeteria: 0,
          video7: 0,
          bienestar: 0,
          video8: 0,
          transporte: 0,
          video9: 0,
          recursosHumanos: 0,
          video10: 0,
          cartera: 0,
          video11: 0,
          embudoAdmisiones: 0,
          video12: 0,
          conexion: 1,
          video1Progress: 1,
          video2Progress: 1,
          video3Progress: 1,
          video4Progress: 1,
          video5Progress: 1,
          video6Progress: 1,
          video7Progress: 1,
          video8Progress: 1,
          video9Progress: 1,
          video10Progress: 1,
          video11Progress: 1,
          video12Progress: 1,
        }
        : {
          start: 1,
          video1: 0,
          section1End: 0,
          video2: 0,
          comunicaciones: 0,
          video3: 0,
          portal: 0,
          video4: 0,
          pagos: 0,
          video5: 0,
          enfermeria: 0,
          video6: 0,
          cafeteria: 0,
          video7: 0,
          bienestar: 0,
          video8: 0,
          transporte: 0,
          video9: 0,
          recursosHumanos: 0,
          video10: 0,
          cartera: 0,
          video11: 0,
          embudoAdmisiones: 0,
          video12: 0,
          conexion: 0,
          video1Progress: 0,
          video2Progress: 0,
          video3Progress: 0,
          video4Progress: 0,
          video5Progress: 0,
          video6Progress: 0,
          video7Progress: 0,
          video8Progress: 0,
          video9Progress: 0,
          video10Progress: 0,
          video11Progress: 0,
          video12Progress: 0,
        };

    const shouldPaintVideo = (videoOpacity, pinOpacity) => (
      videoOpacity > 0 || pinOpacity > 0
    );

    if (hasVideo1Frames && layers.video1 > 0) {
      paintCanvas(
        canvas1Ref.current,
        frames1Ref.current,
        getVideoDisplayProgress('video1', layers.video1Progress),
        lastFrameIndex1Ref,
      );
    } else if (layers.video1 === 0) {
      lastFrameIndex1Ref.current = -1;
    }

    if (hasVideo2Frames && shouldPaintVideo(layers.video2, layers.section1End)) {
      paintCanvas(
        canvas2Ref.current,
        frames2Ref.current,
        getVideoDisplayProgress('video2', layers.video2 > 0 ? layers.video2Progress : 0),
        lastFrameIndex2Ref,
      );
    } else if (layers.video2 === 0 && layers.section1End === 0) {
      lastFrameIndex2Ref.current = -1;
    }

    if (hasVideo3Frames && shouldPaintVideo(layers.video3, layers.comunicaciones)) {
      paintCanvas(
        canvas3Ref.current,
        frames3Ref.current,
        getVideoDisplayProgress('video3', layers.video3 > 0 ? layers.video3Progress : 0),
        lastFrameIndex3Ref,
      );
    } else if (layers.video3 === 0 && layers.comunicaciones === 0) {
      lastFrameIndex3Ref.current = -1;
    }

    if (hasVideo4Frames && shouldPaintVideo(layers.video4, layers.portal)) {
      paintCanvas(
        canvas4Ref.current,
        frames4Ref.current,
        getVideoDisplayProgress('video4', layers.video4 > 0 ? layers.video4Progress : 0),
        lastFrameIndex4Ref,
      );
    } else if (layers.video4 === 0 && layers.portal === 0) {
      lastFrameIndex4Ref.current = -1;
    }

    if (hasVideo5Frames && shouldPaintVideo(layers.video5, layers.pagos)) {
      paintCanvas(
        canvas5Ref.current,
        frames5Ref.current,
        getVideoDisplayProgress('video5', layers.video5 > 0 ? layers.video5Progress : 0),
        lastFrameIndex5Ref,
      );
    } else if (layers.video5 === 0 && layers.pagos === 0) {
      lastFrameIndex5Ref.current = -1;
    }

    if (hasVideo6Frames && shouldPaintVideo(layers.video6, layers.enfermeria)) {
      paintCanvas(
        canvas6Ref.current,
        frames6Ref.current,
        getVideoDisplayProgress('video6', layers.video6 > 0 ? layers.video6Progress : 0),
        lastFrameIndex6Ref,
      );
    } else if (layers.video6 === 0 && layers.enfermeria === 0) {
      lastFrameIndex6Ref.current = -1;
    }

    if (hasVideo7Frames && shouldPaintVideo(layers.video7, layers.cafeteria)) {
      paintCanvas(
        canvas7Ref.current,
        frames7Ref.current,
        getVideoDisplayProgress('video7', layers.video7 > 0 ? layers.video7Progress : 0),
        lastFrameIndex7Ref,
      );
    } else if (layers.video7 === 0 && layers.cafeteria === 0) {
      lastFrameIndex7Ref.current = -1;
    }

    if (hasVideo8Frames && shouldPaintVideo(layers.video8, layers.bienestar)) {
      paintCanvas(
        canvas8Ref.current,
        frames8Ref.current,
        getVideoDisplayProgress('video8', layers.video8 > 0 ? layers.video8Progress : 0),
        lastFrameIndex8Ref,
      );
    } else if (layers.video8 === 0 && layers.bienestar === 0) {
      lastFrameIndex8Ref.current = -1;
    }

    if (hasVideo9Frames && shouldPaintVideo(layers.video9, layers.transporte)) {
      paintCanvas(
        canvas9Ref.current,
        frames9Ref.current,
        getVideoDisplayProgress('video9', layers.video9 > 0 ? layers.video9Progress : 0),
        lastFrameIndex9Ref,
      );
    } else if (layers.video9 === 0 && layers.transporte === 0) {
      lastFrameIndex9Ref.current = -1;
    }

    if (hasVideo10Frames && shouldPaintVideo(layers.video10, layers.recursosHumanos)) {
      paintCanvas(
        canvas10Ref.current,
        frames10Ref.current,
        getVideoDisplayProgress('video10', layers.video10 > 0 ? layers.video10Progress : 0),
        lastFrameIndex10Ref,
      );
    } else if (layers.video10 === 0 && layers.recursosHumanos === 0) {
      lastFrameIndex10Ref.current = -1;
    }

    if (hasVideo11Frames && shouldPaintVideo(layers.video11, layers.cartera)) {
      paintCanvas(
        canvas11Ref.current,
        frames11Ref.current,
        getVideoDisplayProgress('video11', layers.video11 > 0 ? layers.video11Progress : 0),
        lastFrameIndex11Ref,
      );
    } else if (layers.video11 === 0 && layers.cartera === 0) {
      lastFrameIndex11Ref.current = -1;
    }

    if (hasVideo12Frames && shouldPaintVideo(layers.video12, layers.embudoAdmisiones)) {
      paintCanvas(
        canvas12Ref.current,
        frames12Ref.current,
        getVideoDisplayProgress('video12', layers.video12 > 0 ? layers.video12Progress : 0),
        lastFrameIndex12Ref,
      );
    } else if (layers.video12 === 0 && layers.embudoAdmisiones === 0) {
      lastFrameIndex12Ref.current = -1;
    }

    applyLayers(layers);

    const anchors = getSectionAnchors();
    const nextActive = getActiveSectionIndex(clamped, anchors);
    if (nextActive !== lastActiveSectionRef.current) {
      lastActiveSectionRef.current = nextActive;
      setActiveSection(nextActive);
    }

    const profile = ensureLandingProfile();

    if (profile.isMobile && !jumpActiveRef.current) {
      evictRemoteVideosForMobile(nextActive);
    }

    if (profile.isMobile) {
      const loadUpTo = Math.min(12, Math.max(2, nextActive + 1));
      const ensureByVideo = {
        2: ensureVideo2LoadRef,
        3: ensureVideo3LoadRef,
        4: ensureVideo4LoadRef,
        5: ensureVideo5LoadRef,
        6: ensureVideo6LoadRef,
        7: ensureVideo7LoadRef,
        8: ensureVideo8LoadRef,
        9: ensureVideo9LoadRef,
        10: ensureVideo10LoadRef,
        11: ensureVideo11LoadRef,
        12: ensureVideo12LoadRef,
      };

      for (let videoNumber = 2; videoNumber <= loadUpTo; videoNumber += 1) {
        ensureByVideo[videoNumber]?.current?.();
      }
    } else if (nextActive >= 1) {
      ensureVideo2LoadRef.current?.();
      ensureVideo3LoadRef.current?.();
    }

    if (!profile.isMobile && nextActive >= 2) {
      ensureVideo4LoadRef.current?.();
    }

    if (!profile.isMobile && nextActive >= 4) {
      ensureVideo5LoadRef.current?.();
    }

    if (!profile.isMobile && nextActive >= 5) {
      ensureVideo6LoadRef.current?.();
    }

    if (!profile.isMobile && nextActive >= 6) {
      ensureVideo7LoadRef.current?.();
    }

    if (!profile.isMobile && nextActive >= 7) {
      ensureVideo8LoadRef.current?.();
    }

    if (!profile.isMobile && nextActive >= 8) {
      ensureVideo9LoadRef.current?.();
    }

    if (!profile.isMobile && nextActive >= 9) {
      ensureVideo10LoadRef.current?.();
    }

    if (!profile.isMobile && nextActive >= 10) {
      ensureVideo11LoadRef.current?.();
    }

    if (!profile.isMobile && nextActive >= 11) {
      ensureVideo12LoadRef.current?.();
    }
  }, [applyLayers, evictRemoteVideosForMobile, paintCanvas]);

  const jumpToSection = useCallback((sectionIndex) => {
    const anchors = getSectionAnchors();
    let target = anchors[sectionIndex] ?? 0;
    const section = LANDING_SECTIONS[sectionIndex];

    if (section?.id === 'comunicaciones' && !video2ReadyRef.current) {
      target = getSection3GateProgress();
    }

    if (section?.id === 'portal' && !video3ReadyRef.current) {
      target = video2ReadyRef.current
        ? getSection4GateProgress()
        : getSection3GateProgress();
    }

    if (section?.id === 'pagos' && !video4ReadyRef.current) {
      if (!video3ReadyRef.current) {
        target = video2ReadyRef.current
          ? getSection4GateProgress()
          : getSection3GateProgress();
      } else {
        target = getSection5GateProgress();
      }
    }

    if (section?.id === 'enfermeria' && !video5ReadyRef.current) {
      if (!video4ReadyRef.current) {
        target = video3ReadyRef.current
          ? getSection5GateProgress()
          : video2ReadyRef.current
            ? getSection4GateProgress()
            : getSection3GateProgress();
      } else {
        target = getSection6GateProgress();
      }
    }

    if (section?.id === 'cafeteria' && !video6ReadyRef.current) {
      if (!video5ReadyRef.current) {
        target = video4ReadyRef.current
          ? getSection6GateProgress()
          : video3ReadyRef.current
            ? getSection5GateProgress()
            : video2ReadyRef.current
              ? getSection4GateProgress()
              : getSection3GateProgress();
      } else {
        target = getSection7GateProgress();
      }
    }

    if (section?.id === 'bienestar' && !video7ReadyRef.current) {
      if (!video6ReadyRef.current) {
        target = video5ReadyRef.current
          ? getSection7GateProgress()
          : video4ReadyRef.current
            ? getSection6GateProgress()
            : video3ReadyRef.current
              ? getSection5GateProgress()
              : video2ReadyRef.current
                ? getSection4GateProgress()
                : getSection3GateProgress();
      } else {
        target = getSection8GateProgress();
      }
    }

    if (section?.id === 'transporte' && !video8ReadyRef.current) {
      if (!video7ReadyRef.current) {
        target = video6ReadyRef.current
          ? getSection8GateProgress()
          : video5ReadyRef.current
            ? getSection7GateProgress()
            : video4ReadyRef.current
              ? getSection6GateProgress()
              : video3ReadyRef.current
                ? getSection5GateProgress()
                : video2ReadyRef.current
                  ? getSection4GateProgress()
                  : getSection3GateProgress();
      } else {
        target = getSection9GateProgress();
      }
    }

    if (section?.id === 'recursos-humanos' && !video9ReadyRef.current) {
      if (!video8ReadyRef.current) {
        target = video7ReadyRef.current
          ? getSection9GateProgress()
          : video6ReadyRef.current
            ? getSection8GateProgress()
            : video5ReadyRef.current
              ? getSection7GateProgress()
              : video4ReadyRef.current
                ? getSection6GateProgress()
                : video3ReadyRef.current
                  ? getSection5GateProgress()
                  : video2ReadyRef.current
                    ? getSection4GateProgress()
                    : getSection3GateProgress();
      } else {
        target = getSection10GateProgress();
      }
    }

    if (section?.id === 'cartera' && !video10ReadyRef.current) {
      if (!video9ReadyRef.current) {
        target = video8ReadyRef.current
          ? getSection10GateProgress()
          : video7ReadyRef.current
            ? getSection9GateProgress()
            : video6ReadyRef.current
              ? getSection8GateProgress()
              : video5ReadyRef.current
                ? getSection7GateProgress()
                : video4ReadyRef.current
                  ? getSection6GateProgress()
                  : video3ReadyRef.current
                    ? getSection5GateProgress()
                    : video2ReadyRef.current
                      ? getSection4GateProgress()
                      : getSection3GateProgress();
      } else {
        target = getSection11GateProgress();
      }
    }

    if (section?.id === 'embudo-admisiones' && !video11ReadyRef.current) {
      if (!video10ReadyRef.current) {
        target = video9ReadyRef.current
          ? getSection11GateProgress()
          : video8ReadyRef.current
            ? getSection10GateProgress()
            : video7ReadyRef.current
              ? getSection9GateProgress()
              : video6ReadyRef.current
                ? getSection8GateProgress()
                : video5ReadyRef.current
                  ? getSection7GateProgress()
                  : video4ReadyRef.current
                    ? getSection6GateProgress()
                    : video3ReadyRef.current
                      ? getSection5GateProgress()
                      : video2ReadyRef.current
                        ? getSection4GateProgress()
                        : getSection3GateProgress();
      } else {
        target = getSection12GateProgress();
      }
    }

    if (section?.id === 'conexion' && !video12ReadyRef.current) {
      if (!video11ReadyRef.current) {
        target = video10ReadyRef.current
          ? getSection12GateProgress()
          : video9ReadyRef.current
            ? getSection11GateProgress()
            : video8ReadyRef.current
              ? getSection10GateProgress()
              : video7ReadyRef.current
                ? getSection9GateProgress()
                : video6ReadyRef.current
                  ? getSection8GateProgress()
                  : video5ReadyRef.current
                    ? getSection7GateProgress()
                    : video4ReadyRef.current
                      ? getSection6GateProgress()
                      : video3ReadyRef.current
                        ? getSection5GateProgress()
                        : video2ReadyRef.current
                          ? getSection4GateProgress()
                          : getSection3GateProgress();
      } else {
        target = getSection13GateProgress();
      }
    }

    if (section?.id === 'ecosistema') {
      ensureVideo2LoadRef.current?.();
      if (!ensureLandingProfile().isMobile) {
        ensureVideo3LoadRef.current?.();
      } else {
        evictRemoteVideosForMobileRef.current?.(1);
      }
    }

    if (section?.id === 'comunicaciones') {
      ensureVideo2LoadRef.current?.();
      ensureVideo3LoadRef.current?.();
      if (!ensureLandingProfile().isMobile) {
        ensureVideo4LoadRef.current?.();
      }
    }

    if (section?.id === 'portal') {
      ensureVideo3LoadRef.current?.();
    }

    if (section?.id === 'pagos') {
      ensureVideo3LoadRef.current?.();
      ensureVideo4LoadRef.current?.();
      ensureVideo5LoadRef.current?.();
    }

    if (section?.id === 'enfermeria') {
      ensureVideo4LoadRef.current?.();
      ensureVideo5LoadRef.current?.();
      ensureVideo6LoadRef.current?.();
    }

    if (section?.id === 'cafeteria') {
      ensureVideo5LoadRef.current?.();
      ensureVideo6LoadRef.current?.();
      ensureVideo7LoadRef.current?.();
    }

    if (section?.id === 'bienestar') {
      ensureVideo6LoadRef.current?.();
      ensureVideo7LoadRef.current?.();
      ensureVideo8LoadRef.current?.();
    }

    if (section?.id === 'transporte') {
      ensureVideo7LoadRef.current?.();
      ensureVideo8LoadRef.current?.();
      ensureVideo9LoadRef.current?.();
    }

    if (section?.id === 'recursos-humanos') {
      ensureVideo8LoadRef.current?.();
      ensureVideo9LoadRef.current?.();
      ensureVideo10LoadRef.current?.();
    }

    if (section?.id === 'cartera') {
      ensureVideo9LoadRef.current?.();
      ensureVideo10LoadRef.current?.();
      ensureVideo11LoadRef.current?.();
    }

    if (section?.id === 'embudo-admisiones') {
      ensureVideo10LoadRef.current?.();
      ensureVideo11LoadRef.current?.();
      ensureVideo12LoadRef.current?.();
    }

    if (section?.id === 'conexion') {
      ensureVideo11LoadRef.current?.();
      ensureVideo12LoadRef.current?.();
    }

    const s1End = getSection1EndProgress();

    cancelAnimationFrame(rafRef.current);
    cancelAnimationFrame(jumpAnimRef.current);
    loopActiveRef.current = false;
    velocityRef.current = 0;
    clearSectionPause();
    jumpActiveRef.current = true;
    jumpTargetSectionRef.current = sectionIndex;

    const start = progressRef.current;
    const skipEcosistema = section?.id === 'bienvenido' && start > s1End + 0.01;
    const isForwardToEcosistema = section?.pause && target > start;
    let animFrom = start;

    if (isForwardToEcosistema && start <= PIN_ZONE) {
      animFrom = getVideo1MotionStartProgress();
      if (frames1Ref.current.length > 0) {
        paintCanvas(
          canvas1Ref.current,
          frames1Ref.current,
          0,
          lastFrameIndex1Ref,
        );
      }
      applyProgress(animFrom);
    }

    const isForwardToComunicaciones = section?.id === 'comunicaciones' && target > start;
    if (isForwardToComunicaciones && start >= s1End - 0.015 && video2ReadyRef.current) {
      animFrom = getVideo2ZoneStartProgress();
      if (frames2Ref.current.length > 0) {
        paintCanvas(
          canvas2Ref.current,
          frames2Ref.current,
          getVideoDisplayProgress('video2', 0),
          lastFrameIndex2Ref,
        );
      }
      applyProgress(animFrom);
    }

    const comProgress = getScrollTimeline().comProgress;
    const isForwardToPortal = section?.id === 'portal' && target > start;
    if (isForwardToPortal && start >= comProgress - 0.015 && video3ReadyRef.current) {
      animFrom = getVideo3ZoneStartProgress();
      if (frames3Ref.current.length > 0) {
        paintCanvas(
          canvas3Ref.current,
          frames3Ref.current,
          getVideoDisplayProgress('video3', 0),
          lastFrameIndex3Ref,
        );
      }
      applyProgress(animFrom);
    }

    const portalProgress = getScrollTimeline().portalProgress;
    const pagosProgress = getScrollTimeline().pagosProgress;
    const isForwardToPagos = section?.id === 'pagos' && target > start;
    if (isForwardToPagos && start >= portalProgress - 0.015 && video4ReadyRef.current) {
      animFrom = getVideo4ZoneStartProgress();
      if (frames4Ref.current.length > 0) {
        paintCanvas(
          canvas4Ref.current,
          frames4Ref.current,
          getVideoDisplayProgress('video4', 0),
          lastFrameIndex4Ref,
        );
      }
      applyProgress(animFrom);
    }

    const isForwardToEnfermeria = section?.id === 'enfermeria' && target > start;
    if (isForwardToEnfermeria && start >= pagosProgress - 0.015 && video5ReadyRef.current) {
      animFrom = getVideo5ZoneStartProgress();
      if (frames5Ref.current.length > 0) {
        paintCanvas(
          canvas5Ref.current,
          frames5Ref.current,
          getVideoDisplayProgress('video5', 0),
          lastFrameIndex5Ref,
        );
      }
      applyProgress(animFrom);
    }

    const enfermeriaProgress = getScrollTimeline().enfermeriaProgress;
    const isForwardToCafeteria = section?.id === 'cafeteria' && target > start;
    if (isForwardToCafeteria && start >= enfermeriaProgress - 0.015 && video6ReadyRef.current) {
      animFrom = getVideo6ZoneStartProgress();
      if (frames6Ref.current.length > 0) {
        paintCanvas(
          canvas6Ref.current,
          frames6Ref.current,
          getVideoDisplayProgress('video6', 0),
          lastFrameIndex6Ref,
        );
      }
      applyProgress(animFrom);
    }

    const cafeteriaProgress = getScrollTimeline().cafeteriaProgress;
    const isForwardToBienestar = section?.id === 'bienestar' && target > start;
    if (isForwardToBienestar && start >= cafeteriaProgress - 0.015 && video7ReadyRef.current) {
      animFrom = getVideo7ZoneStartProgress();
      if (frames7Ref.current.length > 0) {
        paintCanvas(
          canvas7Ref.current,
          frames7Ref.current,
          getVideoDisplayProgress('video7', 0),
          lastFrameIndex7Ref,
        );
      }
      applyProgress(animFrom);
    }

    const bienestarProgress = getScrollTimeline().bienestarProgress;
    const isForwardToTransporte = section?.id === 'transporte' && target > start;
    if (isForwardToTransporte && start >= bienestarProgress - 0.015 && video8ReadyRef.current) {
      animFrom = getVideo8ZoneStartProgress();
      if (frames8Ref.current.length > 0) {
        paintCanvas(
          canvas8Ref.current,
          frames8Ref.current,
          getVideoDisplayProgress('video8', 0),
          lastFrameIndex8Ref,
        );
      }
      applyProgress(animFrom);
    }

    const transporteProgress = getScrollTimeline().transporteProgress;
    const isForwardToRecursosHumanos = section?.id === 'recursos-humanos' && target > start;
    if (isForwardToRecursosHumanos && start >= transporteProgress - 0.015 && video9ReadyRef.current) {
      animFrom = getVideo9ZoneStartProgress();
      if (frames9Ref.current.length > 0) {
        paintCanvas(
          canvas9Ref.current,
          frames9Ref.current,
          getVideoDisplayProgress('video9', 0),
          lastFrameIndex9Ref,
        );
      }
      applyProgress(animFrom);
    }

    const recursosHumanosProgress = getScrollTimeline().recursosHumanosProgress;
    const isForwardToCartera = section?.id === 'cartera' && target > start;
    if (isForwardToCartera && start >= recursosHumanosProgress - 0.015 && video10ReadyRef.current) {
      animFrom = getVideo10ZoneStartProgress();
      if (frames10Ref.current.length > 0) {
        paintCanvas(
          canvas10Ref.current,
          frames10Ref.current,
          getVideoDisplayProgress('video10', 0),
          lastFrameIndex10Ref,
        );
      }
      applyProgress(animFrom);
    }

    const carteraProgress = getScrollTimeline().carteraProgress;
    const isForwardToEmbudoAdmisiones = section?.id === 'embudo-admisiones' && target > start;
    if (isForwardToEmbudoAdmisiones && start >= carteraProgress - 0.015 && video11ReadyRef.current) {
      animFrom = getVideo11ZoneStartProgress();
      if (frames11Ref.current.length > 0) {
        paintCanvas(
          canvas11Ref.current,
          frames11Ref.current,
          getVideoDisplayProgress('video11', 0),
          lastFrameIndex11Ref,
        );
      }
      applyProgress(animFrom);
    }

    const embudoAdmisionesProgress = getScrollTimeline().embudoAdmisionesProgress;
    const isForwardToConexion = section?.id === 'conexion' && target > start;
    if (isForwardToConexion && start >= embudoAdmisionesProgress - 0.015 && video12ReadyRef.current) {
      animFrom = getVideo12ZoneStartProgress();
      if (frames12Ref.current.length > 0) {
        paintCanvas(
          canvas12Ref.current,
          frames12Ref.current,
          getVideoDisplayProgress('video12', 0),
          lastFrameIndex12Ref,
        );
      }
      applyProgress(animFrom);
    }

    const duration = section?.id === 'ecosistema'
      ? NAV_JUMP.ecosistemaTransitionMs
      : section?.id === 'portal'
      ? getPortalNavTransitionMs()
      : section?.id === 'pagos'
        ? getPagosNavTransitionMs()
        : section?.id === 'enfermeria'
          ? getEnfermeriaNavTransitionMs()
          : section?.id === 'cafeteria'
            ? getCafeteriaNavTransitionMs()
          : section?.id === 'bienestar'
            ? getBienestarNavTransitionMs()
            : section?.id === 'transporte'
              ? getTransporteNavTransitionMs()
              : section?.id === 'recursos-humanos'
                ? getRecursosHumanosNavTransitionMs()
                : section?.id === 'cartera'
                  ? getCarteraNavTransitionMs()
                  : section?.id === 'embudo-admisiones'
                    ? getEmbudoAdmisionesNavTransitionMs()
                    : section?.id === 'conexion'
                      ? getConexionNavTransitionMs()
                      : NAV_JUMP.sectionTransitionMs;
    const ease = computeJumpEase();
    const startTime = performance.now();
    const movingForward = target >= animFrom;
    const v2Start = getVideo2ZoneStartProgress();
    const v1EndBeforeEcosistema = getVideo1EndBeforeEcosistemaProgress();

    const finishJump = (progress) => {
      jumpActiveRef.current = false;
      jumpTargetSectionRef.current = null;

      if (section?.pause) {
        const anchors = getSectionAnchors();
        const boundary = engageSectionPause(anchors[sectionIndex] ?? target, SECTION_SCROLL_PAUSE_MS);
        applyProgress(boundary);
        return;
      }

      applyProgress(progress);
    };

    if (Math.abs(target - animFrom) < 0.004) {
      finishJump(target);
      return;
    }

    const step = (now) => {
      const elapsed = clamp((now - startTime) / duration);
      const eased = ease(elapsed);
      const next = skipEcosistema
        ? mapSkipEcosistemaProgress(eased, animFrom, target, v2Start, v1EndBeforeEcosistema)
        : animFrom + (target - animFrom) * eased;

      if (section?.pause && movingForward && next >= s1End - 0.001) {
        finishJump(s1End);
        return;
      }

      applyProgress(next);

      if (elapsed < 1) {
        jumpAnimRef.current = requestAnimationFrame(step);
      } else {
        finishJump(target);
      }
    };

    jumpAnimRef.current = requestAnimationFrame(step);
  }, [applyProgress, clearSectionPause, engageSectionPause, paintCanvas]);

  const isSectionPending = useCallback((sectionId) => (
    (sectionId === 'comunicaciones' && section3Loading)
    || (sectionId === 'portal' && section4Loading)
    || (sectionId === 'pagos' && section5Loading)
    || (sectionId === 'enfermeria' && section6Loading)
    || (sectionId === 'cafeteria' && section7Loading)
    || (sectionId === 'bienestar' && section8Loading)
    || (sectionId === 'transporte' && section9Loading)
    || (sectionId === 'recursos-humanos' && section10Loading)
    || (sectionId === 'cartera' && section11Loading)
    || (sectionId === 'embudo-admisiones' && section12Loading)
    || (sectionId === 'conexion' && section13Loading)
  ), [
    section10Loading,
    section11Loading,
    section12Loading,
    section13Loading,
    section3Loading,
    section4Loading,
    section5Loading,
    section6Loading,
    section7Loading,
    section8Loading,
    section9Loading,
  ]);

  const stopScrollPhysics = useCallback(() => {
    loopActiveRef.current = false;
    lastFrameTimeRef.current = 0;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    velocityRef.current = 0;
    touchVelocityRef.current = 0;
    inputActiveRef.current = false;
  }, []);

  const handleSectionSelect = useCallback((index) => {
    stopScrollPhysics();
    clearSectionPause();
    setSectionMenuOpen(false);
    jumpToSection(index);
  }, [clearSectionPause, jumpToSection, stopScrollPhysics]);

  const createSectionActivateHandler = useCallback((index) => ({
    onPointerUp(event) {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (touchSectionSelectLockRef.current) {
        return;
      }

      touchSectionSelectLockRef.current = true;
      window.setTimeout(() => {
        touchSectionSelectLockRef.current = false;
      }, 400);
      handleSectionSelect(index);
    },
    onClick(event) {
      if (touchSectionSelectLockRef.current) {
        event.preventDefault();
        return;
      }

      handleSectionSelect(index);
    },
  }), [handleSectionSelect]);

  useEffect(() => {
    if (!sectionMenuOpen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSectionMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sectionMenuOpen]);

  useEffect(() => {
    const updateRotatePrompt = () => {
      const isMobile = window.matchMedia('(max-width: 720px)').matches;
      const isPortrait = window.matchMedia('(orientation: portrait)').matches;
      setShowRotatePrompt(isMobile && isPortrait);
    };

    updateRotatePrompt();
    window.addEventListener('resize', updateRotatePrompt);
    window.addEventListener('orientationchange', updateRotatePrompt);

    return () => {
      window.removeEventListener('resize', updateRotatePrompt);
      window.removeEventListener('orientationchange', updateRotatePrompt);
    };
  }, []);

  useEffect(() => {
    if (loading) {
      setShowOnboardingHints(false);
      return undefined;
    }

    setShowOnboardingHints(true);
    const timer = window.setTimeout(() => {
      setShowOnboardingHints(false);
    }, ONBOARDING_HINT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loading]);

  const syncMediaSize = useCallback(() => {
    const { width, height } = mediaSizeRef.current;
    fitMediaToViewport(viewportRef.current, [
      startRef.current,
      canvas1Ref.current,
      section1EndRef.current,
      canvas2Ref.current,
      comunicacionesRef.current,
      canvas3Ref.current,
      portalRef.current,
      canvas4Ref.current,
      pagosRef.current,
      canvas5Ref.current,
      enfermeriaRef.current,
      canvas6Ref.current,
      cafeteriaRef.current,
      canvas7Ref.current,
      bienestarRef.current,
      canvas8Ref.current,
      transporteRef.current,
      canvas9Ref.current,
      recursosHumanosRef.current,
      canvas10Ref.current,
      carteraRef.current,
      canvas11Ref.current,
      embudoAdmisionesRef.current,
      canvas12Ref.current,
      conexionRef.current,
    ], width, height);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('landing-route-active');
    document.body.classList.add('landing-route-active');
    window.scrollTo(0, 0);

    return () => {
      document.documentElement.classList.remove('landing-route-active');
      document.body.classList.remove('landing-route-active');
    };
  }, []);

  const applyProgressRef = useRef(applyProgress);
  const syncMediaSizeRef = useRef(syncMediaSize);

  useLayoutEffect(() => {
    applyProgressRef.current = applyProgress;
    syncMediaSizeRef.current = syncMediaSize;
  });

  useEffect(() => {
    let cancelled = false;
    const video1 = video1Ref.current;
    const video2 = video2Ref.current;
    const video3 = video3Ref.current;
    const video4 = video4Ref.current;
    const video5 = video5Ref.current;
    const video6 = video6Ref.current;
    const video7 = video7Ref.current;
    const video8 = video8Ref.current;
    const video9 = video9Ref.current;
    const video10 = video10Ref.current;
    const video11 = video11Ref.current;
    const video12 = video12Ref.current;
    if (!video1 || !video2 || !video3 || !video4 || !video5 || !video6 || !video7 || !video8 || !video9 || !video10 || !video11 || !video12) {
      return undefined;
    }

    velocityRef.current = 0;
    progressRef.current = 0;

    const prepCanvas = (canvas, frames) => {
      if (!canvas || frames.length === 0) {
        return;
      }

      canvas.width = activeFrameWidth;
      canvas.height = activeFrameHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(frames[0], 0, 0, activeFrameWidth, activeFrameHeight);
    };

    const activateExperience = (
      video1Frames,
      video2Frames,
      video3Frames,
      video4Frames,
      video5Frames,
      width,
      height,
      estimatedF2,
      estimatedF3,
      estimatedF4,
      estimatedF5,
      { skipLateLoad = false } = {},
    ) => {
      frames1Ref.current = video1Frames;
      frames2Ref.current = video2Frames;
      frames3Ref.current = video3Frames;
      frames4Ref.current = video4Frames;
      frames5Ref.current = video5Frames;
      frameCountsRef.current = {
        f1: video1Frames.length,
        f2: video2Frames.length > 0 ? video2Frames.length : estimatedF2,
        f3: video3Frames.length > 0 ? video3Frames.length : estimatedF3,
        f4: video4Frames.length > 0 ? video4Frames.length : estimatedF4,
        f5: video5Frames.length > 0 ? video5Frames.length : estimatedF5,
      };
      mediaSizeRef.current = { width, height };
      video2ReadyRef.current = video2Frames.length > 0;
      video3ReadyRef.current = video3Frames.length > 0;
      video4ReadyRef.current = video4Frames.length > 0;
      video5ReadyRef.current = video5Frames.length > 0;
      video2LoadStartedRef.current = video2Frames.length > 0;
      video3LoadStartedRef.current = video3Frames.length > 0;
      video4LoadStartedRef.current = video4Frames.length > 0;
      video5LoadStartedRef.current = video5Frames.length > 0;

      prepCanvas(canvas1Ref.current, video1Frames);
      if (video2Frames.length > 0) {
        prepCanvas(canvas2Ref.current, video2Frames);
        lastFrameIndex2Ref.current = 0;
      } else {
        lastFrameIndex2Ref.current = -1;
      }
      if (video3Frames.length > 0) {
        prepCanvas(canvas3Ref.current, video3Frames);
        lastFrameIndex3Ref.current = 0;
      } else {
        lastFrameIndex3Ref.current = -1;
      }
      if (video4Frames.length > 0) {
        prepCanvas(canvas4Ref.current, video4Frames);
        lastFrameIndex4Ref.current = 0;
      } else {
        lastFrameIndex4Ref.current = -1;
      }
      if (video5Frames.length > 0) {
        prepCanvas(canvas5Ref.current, video5Frames);
        lastFrameIndex5Ref.current = 0;
      } else {
        lastFrameIndex5Ref.current = -1;
      }
      lastFrameIndex1Ref.current = 0;

      applyProgressRef.current(0);
      syncMediaSizeRef.current();
      setLoadProgress(1);
      landingSessionReady = true;
      setLoading(false);

      if (!skipLateLoad && !video2ReadyRef.current) {
        bootstrapVideo1FramesRef.current = video1Frames;
        bootstrapSizeRef.current = { width, height };
        ensureVideo2LoadRef.current?.();
      }
    };

    const bootstrapVideo1FramesRef = { current: null };
    const bootstrapSizeRef = { current: { width: activeFrameWidth, height: activeFrameHeight } };

    const waitForEvent = (video, eventName) => new Promise((resolve, reject) => {
      const onSuccess = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Video event failed: ${eventName}`));
      };
      const cleanup = () => {
        video.removeEventListener(eventName, onSuccess);
        video.removeEventListener('error', onError);
      };

      video.addEventListener(eventName, onSuccess, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    const loadVideo = async (video) => {
      if (video.readyState < 1) {
        video.load();
      }

      await waitForEvent(video, 'loadeddata');
      video.pause();
    };

    const syncFramesCache = (video1Frames, width, height) => {
      if (!ensureLandingProfile().useModuleCache) {
        return;
      }

      landingFramesCache = {
        version: FRAMES_CACHE_VERSION,
        video1: { frames: video1Frames },
        video2: { frames: frames2Ref.current },
        video3: { frames: frames3Ref.current },
        video4: { frames: frames4Ref.current },
        video5: { frames: frames5Ref.current },
        video6: { frames: frames6Ref.current },
        video7: { frames: frames7Ref.current },
        video8: { frames: frames8Ref.current },
        video9: { frames: frames9Ref.current },
        video10: { frames: frames10Ref.current },
        video11: { frames: frames11Ref.current },
        video12: { frames: frames12Ref.current },
        size: { width, height },
      };
    };

    const ensureVideo2Load = (video1Frames, width, height) => {
      if (video2ReadyRef.current || video2LoadStartedRef.current) {
        return;
      }

      video2LoadStartedRef.current = true;
      backgroundLoadRef.current += 1;
      const loadId = backgroundLoadRef.current;
      setSection3Loading(true);

      (async () => {
        try {
          await preloadImage(FRAME_COMUNICACIONES_SRC_WEBP);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const comunicacionesPinImage = await preloadImage(FRAME_COMUNICACIONES_SRC);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          video2.src = VIDEO2_SRC;
          await loadVideo(video2);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const video2Result = await extractVideo2Frames(video2);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            video2Result.frames.forEach((bitmap) => bitmap.close());
            return;
          }

          if (video2Result.frames.length === 0) {
            throw new Error('No frames extracted from video 2');
          }

          if (VIDEO2_PIN_TAIL_FRAMES > 0) {
            await applyPinTailToFrames(
              video2Result.frames,
              comunicacionesPinImage,
              VIDEO_PIN_TAIL_RATIO,
              VIDEO2_PIN_TAIL_FRAMES,
            );
          }

          frames2Ref.current = video2Result.frames;
          frameCountsRef.current = {
            ...frameCountsRef.current,
            f2: video2Result.frames.length,
          };
          video2ReadyRef.current = true;
          prepCanvas(canvas2Ref.current, video2Result.frames);
          lastFrameIndex2Ref.current = 0;
          syncFramesCache(video1Frames, width, height);
          applyProgressRef.current(progressRef.current);
          setSection3Loading(false);
          ensureVideo3Load(video1Frames, width, height);
        } catch {
          video2LoadStartedRef.current = false;
          if (!cancelled && loadId === backgroundLoadRef.current) {
            setSection3Loading(false);
          }
        }
      })();
    };

    const ensureVideo3Load = (video1Frames, width, height) => {
      if (video3ReadyRef.current || video3LoadStartedRef.current) {
        return;
      }

      if (!video2ReadyRef.current) {
        return;
      }

      video3LoadStartedRef.current = true;
      backgroundLoadRef.current += 1;
      const loadId = backgroundLoadRef.current;
      setSection4Loading(true);

      (async () => {
        try {
          const portalPinImage = await preloadImage(FRAME_PORTAL_ACADEMICO_SRC);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          video3.src = VIDEO3_SRC;
          await loadVideo(video3);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const video3Result = await extractVideoFrames(
            video3,
            undefined,
            VIDEO3_TRIM_START_SEC,
          );

          if (cancelled || loadId !== backgroundLoadRef.current) {
            video3Result.frames.forEach((bitmap) => bitmap.close());
            return;
          }

          if (video3Result.frames.length === 0) {
            throw new Error('No frames extracted from video 3');
          }

          if (VIDEO3_PIN_TAIL_FRAMES > 0) {
            await applyPinTailToFrames(
              video3Result.frames,
              portalPinImage,
              VIDEO_PIN_TAIL_RATIO,
              VIDEO3_PIN_TAIL_FRAMES,
            );
          }

          frames3Ref.current = video3Result.frames;
          frameCountsRef.current = {
            ...frameCountsRef.current,
            f3: video3Result.frames.length,
          };
          video3ReadyRef.current = true;
          prepCanvas(canvas3Ref.current, video3Result.frames);
          lastFrameIndex3Ref.current = 0;
          syncFramesCache(video1Frames, width, height);
          applyProgressRef.current(progressRef.current);
          setSection4Loading(false);
          ensureVideo4Load(video1Frames, width, height);
        } catch {
          video3LoadStartedRef.current = false;
          if (!cancelled && loadId === backgroundLoadRef.current) {
            setSection4Loading(false);
          }
        }
      })();
    };

    const ensureVideo4Load = (video1Frames, width, height) => {
      if (video4ReadyRef.current || video4LoadStartedRef.current) {
        return;
      }

      if (!video3ReadyRef.current) {
        return;
      }

      video4LoadStartedRef.current = true;
      backgroundLoadRef.current += 1;
      const loadId = backgroundLoadRef.current;
      setSection5Loading(true);

      (async () => {
        try {
          const pagosPinImage = await preloadImage(FRAME_PAGOS_EN_LINEA_SRC);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          video4.src = VIDEO4_SRC;
          await loadVideo(video4);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const video4Result = await extractVideo4Frames(video4);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            video4Result.frames.forEach((bitmap) => bitmap.close());
            return;
          }

          if (video4Result.frames.length === 0) {
            throw new Error('No frames extracted from video 4');
          }

          if (VIDEO4_PIN_TAIL_FRAMES > 0) {
            await applyPinTailToFrames(
              video4Result.frames,
              pagosPinImage,
              VIDEO_PIN_TAIL_RATIO,
              VIDEO4_PIN_TAIL_FRAMES,
            );
          }

          frames4Ref.current = video4Result.frames;
          frameCountsRef.current = {
            ...frameCountsRef.current,
            f4: video4Result.frames.length,
          };
          video4ReadyRef.current = true;
          prepCanvas(canvas4Ref.current, video4Result.frames);
          lastFrameIndex4Ref.current = 0;
          syncFramesCache(video1Frames, width, height);
          applyProgressRef.current(progressRef.current);
          setSection5Loading(false);
          ensureVideo5Load(video1Frames, width, height);
        } catch {
          video4LoadStartedRef.current = false;
          if (!cancelled && loadId === backgroundLoadRef.current) {
            setSection5Loading(false);
          }
        }
      })();
    };

    const ensureVideo5Load = (video1Frames, width, height) => {
      if (video5ReadyRef.current || video5LoadStartedRef.current) {
        return;
      }

      if (!video4ReadyRef.current) {
        return;
      }

      video5LoadStartedRef.current = true;
      backgroundLoadRef.current += 1;
      const loadId = backgroundLoadRef.current;
      setSection6Loading(true);

      (async () => {
        try {
          const enfermeriaPinImage = await preloadImage(FRAME_ENFERMERIA_SRC);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          video5.src = VIDEO5_SRC;
          await loadVideo(video5);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const video5Result = await extractVideo5Frames(video5);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            video5Result.frames.forEach((bitmap) => bitmap.close());
            return;
          }

          if (video5Result.frames.length === 0) {
            throw new Error('No frames extracted from video 5');
          }

          if (VIDEO5_PIN_TAIL_FRAMES > 0) {
            await applyPinTailToFrames(
              video5Result.frames,
              enfermeriaPinImage,
              VIDEO_PIN_TAIL_RATIO,
              VIDEO5_PIN_TAIL_FRAMES,
            );
          }

          frames5Ref.current = video5Result.frames;
          frameCountsRef.current = {
            ...frameCountsRef.current,
            f5: video5Result.frames.length,
          };
          video5ReadyRef.current = true;
          prepCanvas(canvas5Ref.current, video5Result.frames);
          lastFrameIndex5Ref.current = 0;
          syncFramesCache(video1Frames, width, height);
          applyProgressRef.current(progressRef.current);
          setSection6Loading(false);
          ensureVideo6Load(video1Frames, width, height);
        } catch {
          video5LoadStartedRef.current = false;
          if (!cancelled && loadId === backgroundLoadRef.current) {
            setSection6Loading(false);
          }
        }
      })();
    };

    const ensureVideo6Load = (video1Frames, width, height) => {
      if (video6ReadyRef.current || video6LoadStartedRef.current) {
        return;
      }

      if (!video5ReadyRef.current) {
        return;
      }

      video6LoadStartedRef.current = true;
      backgroundLoadRef.current += 1;
      const loadId = backgroundLoadRef.current;
      setSection7Loading(true);

      (async () => {
        try {
          const cafeteriaPinImage = await preloadImage(FRAME_CAFETERIA_SRC);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          video6.src = VIDEO6_SRC;
          await loadVideo(video6);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const video6Result = await extractVideo6Frames(video6);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            video6Result.frames.forEach((bitmap) => bitmap.close());
            return;
          }

          if (video6Result.frames.length === 0) {
            throw new Error('No frames extracted from video 6');
          }

          if (VIDEO6_PIN_TAIL_FRAMES > 0) {
            await applyPinTailToFrames(
              video6Result.frames,
              cafeteriaPinImage,
              VIDEO_PIN_TAIL_RATIO,
              VIDEO6_PIN_TAIL_FRAMES,
            );
          }

          frames6Ref.current = video6Result.frames;
          frameCountsRef.current = {
            ...frameCountsRef.current,
            f6: video6Result.frames.length,
          };
          video6ReadyRef.current = true;
          prepCanvas(canvas6Ref.current, video6Result.frames);
          lastFrameIndex6Ref.current = 0;
          syncFramesCache(video1Frames, width, height);
          applyProgressRef.current(progressRef.current);
          setSection7Loading(false);
          ensureVideo7Load(video1Frames, width, height);
        } catch {
          video6LoadStartedRef.current = false;
          if (!cancelled && loadId === backgroundLoadRef.current) {
            setSection7Loading(false);
          }
        }
      })();
    };

    const ensureVideo7Load = (video1Frames, width, height) => {
      if (video7ReadyRef.current || video7LoadStartedRef.current) {
        return;
      }

      if (!video6ReadyRef.current) {
        return;
      }

      video7LoadStartedRef.current = true;
      backgroundLoadRef.current += 1;
      const loadId = backgroundLoadRef.current;
      setSection8Loading(true);

      (async () => {
        try {
          const bienestarPinImage = await preloadImage(FRAME_BIENESTAR_SRC);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          video7.src = VIDEO7_SRC;
          await loadVideo(video7);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const video7Result = await extractVideo7Frames(video7);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            video7Result.frames.forEach((bitmap) => bitmap.close());
            return;
          }

          if (video7Result.frames.length === 0) {
            throw new Error('No frames extracted from video 7');
          }

          if (VIDEO7_PIN_TAIL_FRAMES > 0) {
            await applyPinTailToFrames(
              video7Result.frames,
              bienestarPinImage,
              VIDEO_PIN_TAIL_RATIO,
              VIDEO7_PIN_TAIL_FRAMES,
            );
          }

          frames7Ref.current = video7Result.frames;
          frameCountsRef.current = {
            ...frameCountsRef.current,
            f7: video7Result.frames.length,
          };
          video7ReadyRef.current = true;
          prepCanvas(canvas7Ref.current, video7Result.frames);
          lastFrameIndex7Ref.current = 0;
          syncFramesCache(video1Frames, width, height);
          applyProgressRef.current(progressRef.current);
          setSection8Loading(false);
          ensureVideo8Load(video1Frames, width, height);
        } catch {
          video7LoadStartedRef.current = false;
          if (!cancelled && loadId === backgroundLoadRef.current) {
            setSection8Loading(false);
          }
        }
      })();
    };

    const ensureVideo8Load = (video1Frames, width, height) => {
      if (video8ReadyRef.current || video8LoadStartedRef.current) {
        return;
      }

      if (!video7ReadyRef.current) {
        return;
      }

      video8LoadStartedRef.current = true;
      backgroundLoadRef.current += 1;
      const loadId = backgroundLoadRef.current;
      setSection9Loading(true);

      (async () => {
        try {
          const transportePinImage = await preloadImage(FRAME_TRANSPORTE_SRC);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          video8.src = VIDEO8_SRC;
          await loadVideo(video8);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const video8Result = await extractVideo8Frames(video8);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            video8Result.frames.forEach((bitmap) => bitmap.close());
            return;
          }

          if (video8Result.frames.length === 0) {
            throw new Error('No frames extracted from video 8');
          }

          if (VIDEO8_PIN_TAIL_FRAMES > 0) {
            await applyPinTailToFrames(
              video8Result.frames,
              transportePinImage,
              VIDEO_PIN_TAIL_RATIO,
              VIDEO8_PIN_TAIL_FRAMES,
            );
          }

          frames8Ref.current = video8Result.frames;
          frameCountsRef.current = {
            ...frameCountsRef.current,
            f8: video8Result.frames.length,
          };
          video8ReadyRef.current = true;
          prepCanvas(canvas8Ref.current, video8Result.frames);
          lastFrameIndex8Ref.current = 0;
          syncFramesCache(video1Frames, width, height);
          applyProgressRef.current(progressRef.current);
          setSection9Loading(false);
          ensureVideo9Load(video1Frames, width, height);
        } catch {
          video8LoadStartedRef.current = false;
          if (!cancelled && loadId === backgroundLoadRef.current) {
            setSection9Loading(false);
          }
        }
      })();
    };

    const ensureVideo9Load = (video1Frames, width, height) => {
      if (video9ReadyRef.current || video9LoadStartedRef.current) {
        return;
      }

      if (!video8ReadyRef.current) {
        return;
      }

      video9LoadStartedRef.current = true;
      backgroundLoadRef.current += 1;
      const loadId = backgroundLoadRef.current;
      setSection10Loading(true);

      (async () => {
        try {
          const recursosHumanosPinImage = await preloadImage(FRAME_RECURSOS_HUMANOS_SRC);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          video9.src = VIDEO9_SRC;
          await loadVideo(video9);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const video9Result = await extractVideo9Frames(video9);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            video9Result.frames.forEach((bitmap) => bitmap.close());
            return;
          }

          if (video9Result.frames.length === 0) {
            throw new Error('No frames extracted from video 9');
          }

          if (VIDEO9_PIN_TAIL_FRAMES > 0) {
            await applyPinTailToFrames(
              video9Result.frames,
              recursosHumanosPinImage,
              VIDEO_PIN_TAIL_RATIO,
              VIDEO9_PIN_TAIL_FRAMES,
            );
          }

          frames9Ref.current = video9Result.frames;
          frameCountsRef.current = {
            ...frameCountsRef.current,
            f9: video9Result.frames.length,
          };
          video9ReadyRef.current = true;
          prepCanvas(canvas9Ref.current, video9Result.frames);
          lastFrameIndex9Ref.current = 0;
          syncFramesCache(video1Frames, width, height);
          applyProgressRef.current(progressRef.current);
          setSection10Loading(false);
          ensureVideo10Load(video1Frames, width, height);
        } catch {
          video9LoadStartedRef.current = false;
          if (!cancelled && loadId === backgroundLoadRef.current) {
            setSection10Loading(false);
          }
        }
      })();
    };

    const ensureVideo10Load = (video1Frames, width, height) => {
      if (video10ReadyRef.current || video10LoadStartedRef.current) {
        return;
      }

      if (!video9ReadyRef.current) {
        return;
      }

      video10LoadStartedRef.current = true;
      backgroundLoadRef.current += 1;
      const loadId = backgroundLoadRef.current;
      setSection11Loading(true);

      (async () => {
        try {
          const carteraPinImage = await preloadImage(FRAME_CARTERA_SRC);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          video10.src = VIDEO10_SRC;
          await loadVideo(video10);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const video10Result = await extractVideo10Frames(video10);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            video10Result.frames.forEach((bitmap) => bitmap.close());
            return;
          }

          if (video10Result.frames.length === 0) {
            throw new Error('No frames extracted from video 10');
          }

          if (VIDEO10_PIN_TAIL_FRAMES > 0) {
            await applyPinTailToFrames(
              video10Result.frames,
              carteraPinImage,
              VIDEO_PIN_TAIL_RATIO,
              VIDEO10_PIN_TAIL_FRAMES,
            );
          }

          frames10Ref.current = video10Result.frames;
          frameCountsRef.current = {
            ...frameCountsRef.current,
            f10: video10Result.frames.length,
          };
          video10ReadyRef.current = true;
          prepCanvas(canvas10Ref.current, video10Result.frames);
          lastFrameIndex10Ref.current = 0;
          syncFramesCache(video1Frames, width, height);
          applyProgressRef.current(progressRef.current);
          setSection11Loading(false);
          ensureVideo11Load(video1Frames, width, height);
        } catch {
          video10LoadStartedRef.current = false;
          if (!cancelled && loadId === backgroundLoadRef.current) {
            setSection11Loading(false);
          }
        }
      })();
    };

    const ensureVideo11Load = (video1Frames, width, height) => {
      if (video11ReadyRef.current || video11LoadStartedRef.current) {
        return;
      }

      if (!video10ReadyRef.current) {
        return;
      }

      video11LoadStartedRef.current = true;
      backgroundLoadRef.current += 1;
      const loadId = backgroundLoadRef.current;
      setSection12Loading(true);

      (async () => {
        try {
          const embudoPinImage = await preloadImage(FRAME_EMBUDO_ADMISIONES_SRC);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          video11.src = VIDEO11_SRC;
          await loadVideo(video11);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const video11Result = await extractVideo11Frames(video11);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            video11Result.frames.forEach((bitmap) => bitmap.close());
            return;
          }

          if (video11Result.frames.length === 0) {
            throw new Error('No frames extracted from video 11');
          }

          if (VIDEO11_PIN_TAIL_FRAMES > 0) {
            await applyPinTailToFrames(
              video11Result.frames,
              embudoPinImage,
              VIDEO_PIN_TAIL_RATIO,
              VIDEO11_PIN_TAIL_FRAMES,
            );
          }

          frames11Ref.current = video11Result.frames;
          frameCountsRef.current = {
            ...frameCountsRef.current,
            f11: video11Result.frames.length,
          };
          video11ReadyRef.current = true;
          prepCanvas(canvas11Ref.current, video11Result.frames);
          lastFrameIndex11Ref.current = 0;
          syncFramesCache(video1Frames, width, height);
          applyProgressRef.current(progressRef.current);
          setSection12Loading(false);
          ensureVideo12Load(video1Frames, width, height);
        } catch {
          video11LoadStartedRef.current = false;
          if (!cancelled && loadId === backgroundLoadRef.current) {
            setSection12Loading(false);
          }
        }
      })();
    };

    const ensureVideo12Load = (video1Frames, width, height) => {
      if (video12ReadyRef.current || video12LoadStartedRef.current) {
        return;
      }

      if (!video11ReadyRef.current) {
        return;
      }

      video12LoadStartedRef.current = true;
      backgroundLoadRef.current += 1;
      const loadId = backgroundLoadRef.current;
      setSection13Loading(true);

      (async () => {
        try {
          const conexionPinImage = await preloadImage(FRAME_CONEXION_SRC);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          video12.src = VIDEO12_SRC;
          await loadVideo(video12);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            return;
          }

          const video12Result = await extractVideo12Frames(video12);

          if (cancelled || loadId !== backgroundLoadRef.current) {
            video12Result.frames.forEach((bitmap) => bitmap.close());
            return;
          }

          if (video12Result.frames.length === 0) {
            throw new Error('No frames extracted from video 12');
          }

          if (VIDEO12_PIN_TAIL_FRAMES > 0) {
            await applyPinTailToFrames(
              video12Result.frames,
              conexionPinImage,
              VIDEO_PIN_TAIL_RATIO,
              VIDEO12_PIN_TAIL_FRAMES,
            );
          }

          frames12Ref.current = video12Result.frames;
          frameCountsRef.current = {
            ...frameCountsRef.current,
            f12: video12Result.frames.length,
          };
          video12ReadyRef.current = true;
          prepCanvas(canvas12Ref.current, video12Result.frames);
          lastFrameIndex12Ref.current = 0;
          syncFramesCache(video1Frames, width, height);
          applyProgressRef.current(progressRef.current);
          setSection13Loading(false);
        } catch {
          video12LoadStartedRef.current = false;
          if (!cancelled && loadId === backgroundLoadRef.current) {
            setSection13Loading(false);
          }
        }
      })();
    };

    const kickoffBackgroundLoadChain = () => {
      if (!ensureLandingProfile().eagerBackgroundLoad) {
        return;
      }

      const video1Frames = bootstrapVideo1FramesRef.current;
      if (!video1Frames) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;

      if (!video2ReadyRef.current) {
        ensureVideo2Load(video1Frames, width, height);
      } else if (!video3ReadyRef.current) {
        ensureVideo3Load(video1Frames, width, height);
      } else if (!video4ReadyRef.current) {
        ensureVideo4Load(video1Frames, width, height);
      } else if (!video5ReadyRef.current) {
        ensureVideo5Load(video1Frames, width, height);
      } else if (!video6ReadyRef.current) {
        ensureVideo6Load(video1Frames, width, height);
      } else if (!video7ReadyRef.current) {
        ensureVideo7Load(video1Frames, width, height);
      } else if (!video8ReadyRef.current) {
        ensureVideo8Load(video1Frames, width, height);
      } else if (!video9ReadyRef.current) {
        ensureVideo9Load(video1Frames, width, height);
      } else if (!video10ReadyRef.current) {
        ensureVideo10Load(video1Frames, width, height);
      } else if (!video11ReadyRef.current) {
        ensureVideo11Load(video1Frames, width, height);
      } else if (!video12ReadyRef.current) {
        ensureVideo12Load(video1Frames, width, height);
      }
    };

    ensureVideo2LoadRef.current = () => {
      if (!bootstrapVideo1FramesRef.current) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;
      ensureVideo2Load(bootstrapVideo1FramesRef.current, width, height);
    };

    ensureVideo3LoadRef.current = () => {
      if (!bootstrapVideo1FramesRef.current) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;
      ensureVideo3Load(bootstrapVideo1FramesRef.current, width, height);
    };

    ensureVideo4LoadRef.current = () => {
      if (!bootstrapVideo1FramesRef.current) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;
      ensureVideo4Load(bootstrapVideo1FramesRef.current, width, height);
    };

    ensureVideo5LoadRef.current = () => {
      if (!bootstrapVideo1FramesRef.current) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;
      ensureVideo5Load(bootstrapVideo1FramesRef.current, width, height);
    };

    ensureVideo6LoadRef.current = () => {
      if (!bootstrapVideo1FramesRef.current) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;
      ensureVideo6Load(bootstrapVideo1FramesRef.current, width, height);
    };

    ensureVideo7LoadRef.current = () => {
      if (!bootstrapVideo1FramesRef.current) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;
      ensureVideo7Load(bootstrapVideo1FramesRef.current, width, height);
    };

    ensureVideo8LoadRef.current = () => {
      if (!bootstrapVideo1FramesRef.current) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;
      ensureVideo8Load(bootstrapVideo1FramesRef.current, width, height);
    };

    ensureVideo9LoadRef.current = () => {
      if (!bootstrapVideo1FramesRef.current) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;
      ensureVideo9Load(bootstrapVideo1FramesRef.current, width, height);
    };

    ensureVideo10LoadRef.current = () => {
      if (!bootstrapVideo1FramesRef.current) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;
      ensureVideo10Load(bootstrapVideo1FramesRef.current, width, height);
    };

    ensureVideo11LoadRef.current = () => {
      if (!bootstrapVideo1FramesRef.current) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;
      ensureVideo11Load(bootstrapVideo1FramesRef.current, width, height);
    };

    ensureVideo12LoadRef.current = () => {
      if (!bootstrapVideo1FramesRef.current) {
        return;
      }

      const { width, height } = bootstrapSizeRef.current;
      ensureVideo12Load(bootstrapVideo1FramesRef.current, width, height);
    };

    if (
      landingFramesCache?.version === FRAMES_CACHE_VERSION
      && ensureLandingProfile().useModuleCache
    ) {
      activateExperience(
        landingFramesCache.video1.frames,
        landingFramesCache.video2.frames,
        landingFramesCache.video3.frames,
        landingFramesCache.video4.frames,
        landingFramesCache.video5.frames,
        landingFramesCache.size.width,
        landingFramesCache.size.height,
        landingFramesCache.video2.frames.length,
        landingFramesCache.video3.frames.length,
        landingFramesCache.video4.frames.length,
        landingFramesCache.video5.frames.length,
        { skipLateLoad: true },
      );

      if (landingFramesCache.video6?.frames?.length > 0) {
        frames6Ref.current = landingFramesCache.video6.frames;
        frameCountsRef.current = {
          ...frameCountsRef.current,
          f6: landingFramesCache.video6.frames.length,
        };
        video6ReadyRef.current = true;
        video6LoadStartedRef.current = true;
        prepCanvas(canvas6Ref.current, landingFramesCache.video6.frames);
        lastFrameIndex6Ref.current = 0;
      }

      if (landingFramesCache.video7?.frames?.length > 0) {
        frames7Ref.current = landingFramesCache.video7.frames;
        frameCountsRef.current = {
          ...frameCountsRef.current,
          f7: landingFramesCache.video7.frames.length,
        };
        video7ReadyRef.current = true;
        video7LoadStartedRef.current = true;
        prepCanvas(canvas7Ref.current, landingFramesCache.video7.frames);
        lastFrameIndex7Ref.current = 0;
      }

      if (landingFramesCache.video8?.frames?.length > 0) {
        frames8Ref.current = landingFramesCache.video8.frames;
        frameCountsRef.current = {
          ...frameCountsRef.current,
          f8: landingFramesCache.video8.frames.length,
        };
        video8ReadyRef.current = true;
        video8LoadStartedRef.current = true;
        prepCanvas(canvas8Ref.current, landingFramesCache.video8.frames);
        lastFrameIndex8Ref.current = 0;
      }

      if (landingFramesCache.video9?.frames?.length > 0) {
        frames9Ref.current = landingFramesCache.video9.frames;
        frameCountsRef.current = {
          ...frameCountsRef.current,
          f9: landingFramesCache.video9.frames.length,
        };
        video9ReadyRef.current = true;
        video9LoadStartedRef.current = true;
        prepCanvas(canvas9Ref.current, landingFramesCache.video9.frames);
        lastFrameIndex9Ref.current = 0;
      }

      if (landingFramesCache.video10?.frames?.length > 0) {
        frames10Ref.current = landingFramesCache.video10.frames;
        frameCountsRef.current = {
          ...frameCountsRef.current,
          f10: landingFramesCache.video10.frames.length,
        };
        video10ReadyRef.current = true;
        video10LoadStartedRef.current = true;
        prepCanvas(canvas10Ref.current, landingFramesCache.video10.frames);
        lastFrameIndex10Ref.current = 0;
      }

      if (landingFramesCache.video11?.frames?.length > 0) {
        frames11Ref.current = landingFramesCache.video11.frames;
        frameCountsRef.current = {
          ...frameCountsRef.current,
          f11: landingFramesCache.video11.frames.length,
        };
        video11ReadyRef.current = true;
        video11LoadStartedRef.current = true;
        prepCanvas(canvas11Ref.current, landingFramesCache.video11.frames);
        lastFrameIndex11Ref.current = 0;
      }

      if (landingFramesCache.video12?.frames?.length > 0) {
        frames12Ref.current = landingFramesCache.video12.frames;
        frameCountsRef.current = {
          ...frameCountsRef.current,
          f12: landingFramesCache.video12.frames.length,
        };
        video12ReadyRef.current = true;
        video12LoadStartedRef.current = true;
        prepCanvas(canvas12Ref.current, landingFramesCache.video12.frames);
        lastFrameIndex12Ref.current = 0;
      }

      bootstrapVideo1FramesRef.current = landingFramesCache.video1.frames;
      bootstrapSizeRef.current = landingFramesCache.size;
      kickoffBackgroundLoadChain();

      return () => {
        cancelled = true;
        backgroundLoadRef.current += 1;
        ensureVideo2LoadRef.current = null;
        ensureVideo3LoadRef.current = null;
        ensureVideo4LoadRef.current = null;
        ensureVideo5LoadRef.current = null;
        ensureVideo6LoadRef.current = null;
        ensureVideo7LoadRef.current = null;
        ensureVideo8LoadRef.current = null;
        ensureVideo9LoadRef.current = null;
        ensureVideo10LoadRef.current = null;
        ensureVideo11LoadRef.current = null;
        ensureVideo12LoadRef.current = null;
      };
    }

    const bootstrap = async () => {
      setLoadProgress(0.08);
      await preloadImage(FRAME_START_SRC_WEBP);

      if (cancelled) {
        return;
      }

      setLoadProgress(0.18);
      await preloadImage(FRAME_SECTION1_END_SRC_WEBP);

      if (cancelled) {
        return;
      }

      setLoadProgress(0.28);
      await loadVideo(video1);

      if (cancelled) {
        return;
      }

      setLoadProgress(LOAD_PROGRESS_VIDEO1_FRAMES_START);

      const section1PinImage = await preloadImage(FRAME_SECTION1_END_SRC);

      if (cancelled) {
        return;
      }

      const video1Result = await extractVideo1Frames(
        video1,
        (fraction) => {
          if (!cancelled) {
            setLoadProgress(
              LOAD_PROGRESS_VIDEO1_FRAMES_START + fraction * (1 - LOAD_PROGRESS_VIDEO1_FRAMES_START),
            );
          }
        },
      );

      if (cancelled) {
        video1Result.frames.forEach((bitmap) => bitmap.close());
        return;
      }

      if (video1Result.frames.length === 0) {
        throw new Error('No frames extracted from video 1');
      }

      if (VIDEO1_PIN_TAIL_FRAMES > 0) {
        await applyPinTailToFrames(
          video1Result.frames,
          section1PinImage,
          VIDEO_PIN_TAIL_RATIO,
          VIDEO1_PIN_TAIL_FRAMES,
        );
      }

      const estimatedLateFrames = Math.max(2, Math.round(video1Result.frames.length * 0.85));

      activateExperience(
        video1Result.frames,
        [],
        [],
        [],
        [],
        video1Result.width,
        video1Result.height,
        estimatedLateFrames,
        estimatedLateFrames,
        estimatedLateFrames,
        estimatedLateFrames,
      );
    };

    bootstrap().catch(() => {
      if (!cancelled) {
        frames1Ref.current = [];
        frames2Ref.current = [];
        frames3Ref.current = [];
        frames4Ref.current = [];
        frames5Ref.current = [];
        frames6Ref.current = [];
        frames7Ref.current = [];
        frames8Ref.current = [];
        frames9Ref.current = [];
        frames10Ref.current = [];
        frames11Ref.current = [];
        frames12Ref.current = [];
        landingSessionReady = true;
        setLoadProgress(1);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      backgroundLoadRef.current += 1;
      if (ensureLandingProfile().isMobile) {
        landingFramesCache = null;
        landingSessionReady = false;
      }
      video2ReadyRef.current = false;
      video3ReadyRef.current = false;
      video4ReadyRef.current = false;
      video5ReadyRef.current = false;
      video6ReadyRef.current = false;
      video7ReadyRef.current = false;
      video8ReadyRef.current = false;
      video9ReadyRef.current = false;
      video10ReadyRef.current = false;
      video11ReadyRef.current = false;
      video12ReadyRef.current = false;
      video2LoadStartedRef.current = false;
      video3LoadStartedRef.current = false;
      video4LoadStartedRef.current = false;
      video5LoadStartedRef.current = false;
      video6LoadStartedRef.current = false;
      video7LoadStartedRef.current = false;
      video8LoadStartedRef.current = false;
      video9LoadStartedRef.current = false;
      video10LoadStartedRef.current = false;
      video11LoadStartedRef.current = false;
      video12LoadStartedRef.current = false;
      ensureVideo2LoadRef.current = null;
      ensureVideo3LoadRef.current = null;
      ensureVideo4LoadRef.current = null;
      ensureVideo5LoadRef.current = null;
      ensureVideo6LoadRef.current = null;
      ensureVideo7LoadRef.current = null;
      ensureVideo8LoadRef.current = null;
      ensureVideo9LoadRef.current = null;
      ensureVideo10LoadRef.current = null;
      ensureVideo11LoadRef.current = null;
      ensureVideo12LoadRef.current = null;
      [
        frames1Ref,
        frames2Ref,
        frames3Ref,
        frames4Ref,
        frames5Ref,
        frames6Ref,
        frames7Ref,
        frames8Ref,
        frames9Ref,
        frames10Ref,
        frames11Ref,
        frames12Ref,
      ].forEach((framesRef) => {
        releaseFrameBitmaps(framesRef);
      });
      lastFrameIndex1Ref.current = -1;
      lastFrameIndex2Ref.current = -1;
      lastFrameIndex3Ref.current = -1;
      lastFrameIndex4Ref.current = -1;
      lastFrameIndex5Ref.current = -1;
      lastFrameIndex6Ref.current = -1;
      lastFrameIndex7Ref.current = -1;
      lastFrameIndex8Ref.current = -1;
      lastFrameIndex9Ref.current = -1;
      lastFrameIndex10Ref.current = -1;
      lastFrameIndex11Ref.current = -1;
      lastFrameIndex12Ref.current = -1;
    };
  }, []);

  useLayoutEffect(() => {
    syncMediaSize();
  }, [loading, syncMediaSize]);

  useEffect(() => {
    if (loading) {
      return undefined;
    }

    const blockScroll = (event) => {
      event.preventDefault();
    };

    const stopPhysicsLoop = () => {
      loopActiveRef.current = false;
      lastFrameTimeRef.current = 0;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };

    const resolveProgress = (nextProgress, scrollDirection = 0) => {
      if (jumpActiveRef.current) {
        return progressRef.current;
      }

      if (pauseActiveRef.current) {
        if (scrollDirection < 0) {
          clearSectionPause();
        } else {
          stopPhysicsLoop();
          applyProgress(sectionPauseAnchorRef.current);
          velocityRef.current = 0;
          return sectionPauseAnchorRef.current;
        }
      }

      const prevProgress = progressRef.current;
      const anchors = getSectionAnchors();

      if (scrollDirection > 0) {
        for (let sectionIndex = 1; sectionIndex < anchors.length; sectionIndex += 1) {
          const anchor = anchors[sectionIndex];

          if (
            prevProgress < anchor - SECTION_ANCHOR_EPSILON
            && nextProgress >= anchor - SECTION_ANCHOR_EPSILON
          ) {
            engageSectionPause(anchor, SECTION_SCROLL_PAUSE_MS);
            applyProgress(anchor);
            stopPhysicsLoop();
            velocityRef.current = 0;
            return anchor;
          }
        }
      }

      applyProgress(nextProgress);

      const maxProgress = getMaxScrollProgress(
        video2ReadyRef.current,
        video3ReadyRef.current,
        video4ReadyRef.current,
        video5ReadyRef.current,
        video6ReadyRef.current,
        video7ReadyRef.current,
        video8ReadyRef.current,
        video9ReadyRef.current,
        video10ReadyRef.current,
        video11ReadyRef.current,
        video12ReadyRef.current,
      );
      if (progressRef.current < nextProgress - 0.0001 && progressRef.current >= maxProgress - 0.0001) {
        velocityRef.current = 0;
      }

      return progressRef.current;
    };

    const applyScrollDelta = (deltaPixels, scrollDirection) => {
      if (jumpActiveRef.current || deltaPixels === 0) {
        return;
      }

      stopPhysicsLoop();
      velocityRef.current = 0;
      touchVelocityRef.current = 0;

      const progressDelta = deltaPixels * SCROLL_PHYSICS.progressPerPixel;
      resolveProgress(progressRef.current + progressDelta, scrollDirection);
    };

    const onWheel = (event) => {
      event.preventDefault();

      if (jumpActiveRef.current) {
        return;
      }

      const deltaPixels = getWheelDeltaPixels(event);
      applyScrollDelta(deltaPixels, deltaPixels >= 0 ? 1 : -1);
    };

    const canScrollSectionMenu = (target, deltaY) => {
      if (!(target instanceof Element)) {
        return false;
      }

      const menuList = target.closest('.landing-video-page__mobile-section-list');
      if (!menuList) {
        return false;
      }

      if (menuList.scrollHeight <= menuList.clientHeight + 1) {
        return false;
      }

      if (deltaY > 0) {
        return menuList.scrollTop + menuList.clientHeight < menuList.scrollHeight - 1;
      }

      if (deltaY < 0) {
        return menuList.scrollTop > 0;
      }

      return false;
    };

    const onTouchStart = (event) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      const touchTarget = document.elementFromPoint(touch.clientX, touch.clientY);
      touchUiActiveRef.current = isLandingUiTarget(touchTarget);

      if (touchUiActiveRef.current) {
        return;
      }

      const touchY = touch.clientY;
      lastTouchYRef.current = touchY;
      lastTouchTimeRef.current = performance.now();
      touchVelocityRef.current = 0;
      velocityRef.current = 0;
    };

    const onTouchMove = (event) => {
      if (touchUiActiveRef.current) {
        return;
      }

      if (event.touches.length !== 1) {
        event.preventDefault();
        return;
      }

      const currentY = event.touches[0]?.clientY ?? lastTouchYRef.current;
      const now = performance.now();
      const deltaY = lastTouchYRef.current - currentY;

      if (isLandingUiTarget(event.target) || canScrollSectionMenu(event.target, deltaY)) {
        lastTouchYRef.current = currentY;
        lastTouchTimeRef.current = now;
        return;
      }

      event.preventDefault();

      if (Math.abs(deltaY) > 0) {
        if (jumpActiveRef.current) {
          return;
        }

        applyScrollDelta(deltaY, deltaY >= 0 ? 1 : -1);
      }

      lastTouchYRef.current = currentY;
      lastTouchTimeRef.current = now;
    };

    const onTouchEnd = () => {
      if (touchUiActiveRef.current) {
        touchUiActiveRef.current = false;
        return;
      }

      velocityRef.current = 0;
      touchVelocityRef.current = 0;
    };

    const onKeyDown = (event) => {
      if (event.key === 'ArrowDown' || event.key === 'PageDown') {
        event.preventDefault();
        stopPhysicsLoop();
        velocityRef.current = 0;
        resolveProgress(progressRef.current + SCROLL_PHYSICS.keyProgressStep, 1);
      }

      if (event.key === 'ArrowUp' || event.key === 'PageUp') {
        event.preventDefault();
        stopPhysicsLoop();
        velocityRef.current = 0;
        resolveProgress(progressRef.current - SCROLL_PHYSICS.keyProgressStep, -1);
      }

      if (event.key === 'Home') {
        event.preventDefault();
        velocityRef.current = 0;
        stopPhysicsLoop();
        clearSectionPause();
        applyProgress(0);
      }

      if (event.key === 'End') {
        event.preventDefault();
        velocityRef.current = 0;
        stopPhysicsLoop();
        applyProgress(getMaxScrollProgress(
          video2ReadyRef.current,
          video3ReadyRef.current,
          video4ReadyRef.current,
          video5ReadyRef.current,
          video6ReadyRef.current,
          video7ReadyRef.current,
          video8ReadyRef.current,
          video9ReadyRef.current,
          video10ReadyRef.current,
          video11ReadyRef.current,
          video12ReadyRef.current,
        ));
      }
    };

    const resizeObserver = viewportRef.current
      ? new ResizeObserver(() => syncMediaSize())
      : null;

    resizeObserver?.observe(viewportRef.current);
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', syncMediaSize);
    document.addEventListener('scroll', blockScroll, { passive: false });

    return () => {
      stopPhysicsLoop();
      clearSectionPause();
      cancelAnimationFrame(jumpAnimRef.current);
      jumpActiveRef.current = false;
      velocityRef.current = 0;
      resizeObserver?.disconnect();
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', syncMediaSize);
      document.removeEventListener('scroll', blockScroll);
    };
  }, [loading]);

  const initialLayers = computeLayers(0);

  return (
    <div className="landing-video-page">
      <div ref={viewportRef} className="landing-video-page__viewport">
        <div className="landing-video-page__stage">
          <picture className="landing-video-page__frame-picture">
            <source type="image/webp" srcSet={FRAME_START_SRC_WEBP} />
            <img
              ref={startRef}
              alt=""
              className="landing-video-page__frame landing-video-page__frame--start"
              decoding="sync"
              draggable={false}
              fetchPriority="high"
              loading="eager"
              src={FRAME_START_SRC_HQ}
              width={FRAME_START_activeFrameWidth}
              height={FRAME_START_activeFrameHeight}
              style={{
                opacity: initialLayers.start,
                visibility: initialLayers.start > 0 ? 'visible' : 'hidden',
              }}
            />
          </picture>
          <canvas
            ref={canvas1Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-1"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video1,
              visibility: initialLayers.video1 > 0 ? 'visible' : 'hidden',
            }}
          />
          <picture className="landing-video-page__frame-picture">
            <source type="image/webp" srcSet={FRAME_SECTION1_END_SRC_WEBP} />
            <img
              ref={section1EndRef}
              alt=""
              className="landing-video-page__frame landing-video-page__frame--section1-end"
              decoding="sync"
              draggable={false}
              fetchPriority="high"
              loading="eager"
              src={FRAME_SECTION1_END_SRC}
              width={FRAME_SECTION1_activeFrameWidth}
              height={FRAME_SECTION1_activeFrameHeight}
              style={{
                opacity: initialLayers.section1End,
                visibility: initialLayers.section1End > 0 ? 'visible' : 'hidden',
              }}
            />
          </picture>
          <canvas
            ref={canvas2Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-2"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video2,
              visibility: initialLayers.video2 > 0 ? 'visible' : 'hidden',
            }}
          />
          <picture className="landing-video-page__frame-picture">
            <source type="image/webp" srcSet={FRAME_COMUNICACIONES_SRC_WEBP} />
            <img
              ref={comunicacionesRef}
              alt=""
              className="landing-video-page__frame landing-video-page__frame--comunicaciones"
              decoding="sync"
              draggable={false}
              fetchPriority="high"
              loading="eager"
              src={FRAME_COMUNICACIONES_SRC}
              width={FRAME_COMUNICACIONES_activeFrameWidth}
              height={FRAME_COMUNICACIONES_activeFrameHeight}
              style={{
                opacity: initialLayers.comunicaciones,
                visibility: initialLayers.comunicaciones > 0 ? 'visible' : 'hidden',
              }}
            />
          </picture>
          <canvas
            ref={canvas3Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-3"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video3,
              visibility: initialLayers.video3 > 0 ? 'visible' : 'hidden',
            }}
          />
          <img
            ref={portalRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--portal-academico"
            decoding="sync"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={FRAME_PORTAL_ACADEMICO_SRC}
            width={FRAME_PORTAL_ACADEMICO_activeFrameWidth}
            height={FRAME_PORTAL_ACADEMICO_activeFrameHeight}
            style={{
              opacity: initialLayers.portal,
              visibility: initialLayers.portal > 0 ? 'visible' : 'hidden',
            }}
          />
          <canvas
            ref={canvas4Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-4"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video4,
              visibility: initialLayers.video4 > 0 ? 'visible' : 'hidden',
            }}
          />
          <img
            ref={pagosRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--pagos-en-linea"
            decoding="sync"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={FRAME_PAGOS_EN_LINEA_SRC}
            width={FRAME_PAGOS_EN_LINEA_activeFrameWidth}
            height={FRAME_PAGOS_EN_LINEA_activeFrameHeight}
            style={{
              opacity: initialLayers.pagos,
              visibility: initialLayers.pagos > 0 ? 'visible' : 'hidden',
            }}
          />
          <canvas
            ref={canvas5Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-5"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video5,
              visibility: initialLayers.video5 > 0 ? 'visible' : 'hidden',
            }}
          />
          <img
            ref={enfermeriaRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--enfermeria"
            decoding="sync"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={FRAME_ENFERMERIA_SRC}
            width={FRAME_ENFERMERIA_activeFrameWidth}
            height={FRAME_ENFERMERIA_activeFrameHeight}
            style={{
              opacity: initialLayers.enfermeria,
              visibility: initialLayers.enfermeria > 0 ? 'visible' : 'hidden',
            }}
          />
          <canvas
            ref={canvas6Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-6"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video6,
              visibility: initialLayers.video6 > 0 ? 'visible' : 'hidden',
            }}
          />
          <img
            ref={cafeteriaRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--cafeteria"
            decoding="sync"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={FRAME_CAFETERIA_SRC}
            width={FRAME_CAFETERIA_activeFrameWidth}
            height={FRAME_CAFETERIA_activeFrameHeight}
            style={{
              opacity: initialLayers.cafeteria,
              visibility: initialLayers.cafeteria > 0 ? 'visible' : 'hidden',
            }}
          />
          <canvas
            ref={canvas7Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-7"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video7,
              visibility: initialLayers.video7 > 0 ? 'visible' : 'hidden',
            }}
          />
          <img
            ref={bienestarRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--bienestar"
            decoding="sync"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={FRAME_BIENESTAR_SRC}
            width={FRAME_BIENESTAR_activeFrameWidth}
            height={FRAME_BIENESTAR_activeFrameHeight}
            style={{
              opacity: initialLayers.bienestar,
              visibility: initialLayers.bienestar > 0 ? 'visible' : 'hidden',
            }}
          />
          <canvas
            ref={canvas8Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-8"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video8,
              visibility: initialLayers.video8 > 0 ? 'visible' : 'hidden',
            }}
          />
          <img
            ref={transporteRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--transporte"
            decoding="sync"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={FRAME_TRANSPORTE_SRC}
            width={FRAME_TRANSPORTE_activeFrameWidth}
            height={FRAME_TRANSPORTE_activeFrameHeight}
            style={{
              opacity: initialLayers.transporte,
              visibility: initialLayers.transporte > 0 ? 'visible' : 'hidden',
            }}
          />
          <img
            ref={recursosHumanosRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--recursos-humanos"
            decoding="sync"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={FRAME_RECURSOS_HUMANOS_SRC}
            width={FRAME_RECURSOS_HUMANOS_activeFrameWidth}
            height={FRAME_RECURSOS_HUMANOS_activeFrameHeight}
            style={{
              opacity: initialLayers.recursosHumanos,
              visibility: initialLayers.recursosHumanos > 0 ? 'visible' : 'hidden',
            }}
          />
          <canvas
            ref={canvas9Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-9"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video9,
              visibility: initialLayers.video9 > 0 ? 'visible' : 'hidden',
            }}
          />
          <img
            ref={carteraRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--cartera"
            decoding="sync"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={FRAME_CARTERA_SRC}
            width={FRAME_CARTERA_activeFrameWidth}
            height={FRAME_CARTERA_activeFrameHeight}
            style={{
              opacity: initialLayers.cartera,
              visibility: initialLayers.cartera > 0 ? 'visible' : 'hidden',
            }}
          />
          <canvas
            ref={canvas10Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-10"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video10,
              visibility: initialLayers.video10 > 0 ? 'visible' : 'hidden',
            }}
          />
          <img
            ref={embudoAdmisionesRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--embudo-admisiones"
            decoding="sync"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={FRAME_EMBUDO_ADMISIONES_SRC}
            width={FRAME_EMBUDO_ADMISIONES_activeFrameWidth}
            height={FRAME_EMBUDO_ADMISIONES_activeFrameHeight}
            style={{
              opacity: initialLayers.embudoAdmisiones,
              visibility: initialLayers.embudoAdmisiones > 0 ? 'visible' : 'hidden',
            }}
          />
          <canvas
            ref={canvas11Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-11"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video11,
              visibility: initialLayers.video11 > 0 ? 'visible' : 'hidden',
            }}
          />
          <canvas
            ref={canvas12Ref}
            className="landing-video-page__frame landing-video-page__frame--canvas landing-video-page__frame--canvas-12"
            width={activeFrameWidth}
            height={activeFrameHeight}
            aria-hidden="true"
            style={{
              opacity: initialLayers.video12,
              visibility: initialLayers.video12 > 0 ? 'visible' : 'hidden',
            }}
          />
          <img
            ref={conexionRef}
            alt=""
            className="landing-video-page__frame landing-video-page__frame--conexion"
            decoding="sync"
            draggable={false}
            fetchPriority="high"
            loading="eager"
            src={FRAME_CONEXION_SRC}
            width={FRAME_CONEXION_activeFrameWidth}
            height={FRAME_CONEXION_activeFrameHeight}
            style={{
              opacity: initialLayers.conexion,
              visibility: initialLayers.conexion > 0 ? 'visible' : 'hidden',
            }}
          />
        </div>

        <video
          ref={video1Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="auto"
          src={VIDEO1_SRC}
          tabIndex={-1}
          aria-hidden="true"
        />
        <video
          ref={video2Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
        />
        <video
          ref={video3Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
        />
        <video
          ref={video4Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
        />
        <video
          ref={video5Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
        />
        <video
          ref={video6Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
        />
        <video
          ref={video7Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
        />
        <video
          ref={video8Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
        />
        <video
          ref={video9Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
        />
        <video
          ref={video10Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
        />
        <video
          ref={video11Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
        />

        <video
          ref={video12Ref}
          className="landing-video-page__video-source"
          muted
          playsInline
          preload="none"
          tabIndex={-1}
          aria-hidden="true"
        />

        <div ref={shadeRef} className="landing-video-page__shade" />

        <header className="landing-video-page__mobile-topbar">
          <Link className="landing-video-page__mobile-logo" to="/">
            <img alt="Comergio" src="/logonuevo.png" />
          </Link>
          <div className="landing-video-page__mobile-topbar-actions">
            <Link className="landing-video-page__mobile-topbar-link" to="/contact">
              Contacto
            </Link>
            <Link className="landing-video-page__mobile-topbar-btn" to="/login">
              Entrar
            </Link>
          </div>
        </header>

        <header className="landing-video-page__actions landing-video-page__actions--desktop">
          <Link className="landing-video-page__button landing-video-page__button--primary" to="/login">
            Iniciar sesión
          </Link>
          <Link className="landing-video-page__button" to="/contact">
            Contacto
          </Link>
        </header>

        {!loading ? (
          <>
            <nav className="landing-video-page__section-nav landing-video-page__section-nav--desktop" aria-label="Secciones">
              <span className="landing-video-page__section-nav-rail" aria-hidden="true" />
              <ul>
                {LANDING_SECTIONS.map((section, index) => {
                  const isPending = isSectionPending(section.id);
                  const sectionActivateHandlers = createSectionActivateHandler(index);

                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        className={
                          activeSection === index
                            ? 'landing-video-page__section-nav-item landing-video-page__section-nav-item--active'
                            : isPending
                              ? 'landing-video-page__section-nav-item landing-video-page__section-nav-item--pending'
                              : 'landing-video-page__section-nav-item'
                        }
                        aria-current={activeSection === index ? 'true' : undefined}
                        aria-busy={isPending ? 'true' : undefined}
                        {...sectionActivateHandlers}
                      >
                        {section.title}
                        {isPending ? (
                          <span className="landing-video-page__section-nav-item-spinner" aria-hidden="true" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="landing-video-page__mobile-section-dock">
              <button
                aria-expanded={sectionMenuOpen}
                aria-haspopup="dialog"
                className="landing-video-page__mobile-section-trigger"
                onClick={() => setSectionMenuOpen(true)}
                type="button"
              >
                <span className="landing-video-page__mobile-section-trigger-label">Sección</span>
                <span className="landing-video-page__mobile-section-trigger-value">
                  {LANDING_SECTIONS[activeSection]?.title}
                </span>
              </button>
            </div>

            {sectionMenuOpen ? (
              <>
                <button
                  aria-label="Cerrar menú de secciones"
                  className="landing-video-page__mobile-section-backdrop"
                  onClick={() => setSectionMenuOpen(false)}
                  type="button"
                />
                <div
                  aria-label="Secciones"
                  className="landing-video-page__mobile-section-sheet"
                  role="dialog"
                >
                  <div className="landing-video-page__mobile-section-sheet-head">
                    <h2>Explorar secciones</h2>
                    <button
                      aria-label="Cerrar"
                      className="landing-video-page__mobile-section-close"
                      onClick={() => setSectionMenuOpen(false)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                  <ul className="landing-video-page__mobile-section-list">
                    {LANDING_SECTIONS.map((section, index) => {
                      const isPending = isSectionPending(section.id);
                      const sectionActivateHandlers = createSectionActivateHandler(index);

                      return (
                        <li key={section.id}>
                          <button
                            type="button"
                            className={
                              activeSection === index
                                ? 'landing-video-page__mobile-section-item landing-video-page__mobile-section-item--active'
                                : isPending
                                  ? 'landing-video-page__mobile-section-item landing-video-page__mobile-section-item--pending'
                                  : 'landing-video-page__mobile-section-item'
                            }
                            aria-current={activeSection === index ? 'true' : undefined}
                            aria-busy={isPending ? 'true' : undefined}
                            {...sectionActivateHandlers}
                          >
                            <span className="landing-video-page__mobile-section-item-index">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="landing-video-page__mobile-section-item-title">{section.title}</span>
                            {isPending ? (
                              <span className="landing-video-page__section-nav-item-spinner" aria-hidden="true" />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {loading ? (
        <div className="landing-video-page__loader">
          <div className="landing-video-page__loader-content">
            <p>Preparando experiencia</p>
            <div className="landing-video-page__loader-bar">
              <span
                className="landing-video-page__loader-bar-fill"
                style={{ transform: `scaleX(${Math.max(loadProgress, 0.02)})` }}
              />
            </div>
            <small>{Math.round(loadProgress * 100)}%</small>
          </div>
        </div>
      ) : null}

      {showOnboardingHints && !showRotatePrompt ? (
        <div aria-hidden="true" className="landing-video-page__onboarding-hints">
          <div className="landing-video-page__onboarding-hint landing-video-page__onboarding-hint--scroll">
            <span className="landing-video-page__onboarding-hint-icon">↓</span>
            <p>Desliza hacia abajo para explorar</p>
          </div>
          <div className="landing-video-page__onboarding-hint landing-video-page__onboarding-hint--nav">
            <span className="landing-video-page__onboarding-hint-icon landing-video-page__onboarding-hint-icon--tap">◎</span>
            <p className="landing-video-page__onboarding-hint-text--desktop">
              Haz clic en las secciones para saltar
            </p>
            <p className="landing-video-page__onboarding-hint-text--mobile">
              Toca aquí para cambiar de sección
            </p>
          </div>
        </div>
      ) : null}

      {showRotatePrompt ? (
        <div aria-live="polite" className="landing-video-page__rotate-prompt" role="status">
          <div className="landing-video-page__rotate-prompt-card">
            <div aria-hidden="true" className="landing-video-page__rotate-phone">
              <svg className="landing-video-page__rotate-phone-svg" viewBox="0 0 64 64">
                <rect
                  className="landing-video-page__rotate-phone-body"
                  height="44"
                  rx="8"
                  width="24"
                  x="20"
                  y="10"
                />
                <circle className="landing-video-page__rotate-phone-button" cx="32" cy="48" r="2.5" />
              </svg>
              <span className="landing-video-page__rotate-phone-arrow">↻</span>
            </div>
            <h2>Gira tu teléfono</h2>
            <p>Para vivir la experiencia completa, coloca el dispositivo en horizontal.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LandingPage;
