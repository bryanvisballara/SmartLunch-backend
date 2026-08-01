import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import './MatriculaIdentityCapture.css';

function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function isCapacitorNativeShell() {
  try {
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch (_error) {
    return false;
  }
}

function isAndroidDevice() {
  try {
    if (String(Capacitor?.getPlatform?.() || '').toLowerCase() === 'android') {
      return true;
    }
  } catch (_error) {
    // Fall through.
  }
  return /android/i.test(navigator.userAgent || '');
}

/** Android/Capacitor WebViews often white-screen if getUserMedia runs on mount. */
function shouldPreferNativeCamera() {
  return isCapacitorNativeShell() || isAndroidDevice();
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(blob);
  });
}

async function compressCanvasToDataUrl(canvas, quality = 0.72) {
  return new Promise((resolve) => {
    const fallback = () => {
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (_error) {
        resolve('');
      }
    };

    if (typeof canvas.toBlob !== 'function') {
      fallback();
      return;
    }

    try {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          fallback();
          return;
        }
        try {
          resolve(await blobToDataUrl(blob));
        } catch (_error) {
          fallback();
        }
      }, 'image/jpeg', quality);
    } catch (_error) {
      fallback();
    }
  });
}

async function compressImageFileToDataUrl(file, { maxWidth = 1280, quality = 0.72 } = {}) {
  const sourceUrl = await blobToDataUrl(file);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = async () => {
      try {
        const scale = Math.min(1, maxWidth / Math.max(1, image.width));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(sourceUrl);
          return;
        }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(await compressCanvasToDataUrl(canvas, quality) || sourceUrl);
      } catch (_error) {
        resolve(sourceUrl);
      }
    };
    image.onerror = () => resolve(sourceUrl);
    image.src = sourceUrl;
  });
}

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function listVideoInputDevices() {
  if (!navigator?.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'videoinput');
  } catch (_error) {
    return [];
  }
}

function pickCameraDeviceId(devices = [], facingMode = 'user') {
  const labels = devices.map((device) => ({
    id: device.deviceId,
    label: String(device.label || '').toLowerCase(),
  }));

  if (facingMode === 'environment') {
    const rear = labels.find((device) => (
      device.label.includes('back')
      || device.label.includes('rear')
      || device.label.includes('environment')
      || device.label.includes('trasera')
      || device.label.includes('atrás')
      || device.label.includes('atras')
      || device.label.includes('world')
    ));
    if (rear?.id) return rear.id;
    // Many Androids list rear camera last when labels are empty/hidden.
    if (labels.length > 1) return labels[labels.length - 1].id;
    return labels[0]?.id || '';
  }

  const front = labels.find((device) => (
    device.label.includes('front')
    || device.label.includes('selfie')
    || device.label.includes('delantera')
    || (device.label.includes('user') && !device.label.includes('back') && !device.label.includes('rear'))
    || (
      device.label.includes('facing')
      && !device.label.includes('back')
      && !device.label.includes('rear')
      && !device.label.includes('environment')
    )
  ));
  if (front?.id) return front.id;
  return labels[0]?.id || '';
}

function deviceLabelLooksLikeFacing(label = '', facingMode = 'user') {
  const text = String(label || '').toLowerCase();
  if (!text) return false;
  if (facingMode === 'environment') {
    return (
      text.includes('back')
      || text.includes('rear')
      || text.includes('environment')
      || text.includes('trasera')
      || text.includes('atrás')
      || text.includes('atras')
      || text.includes('world')
    );
  }
  return (
    text.includes('front')
    || text.includes('selfie')
    || text.includes('delantera')
    || (text.includes('user') && !text.includes('back') && !text.includes('rear'))
    || (text.includes('facing') && !text.includes('back') && !text.includes('rear') && !text.includes('environment'))
  );
}

async function openCameraStream(facingMode = 'user', preferredDeviceId = '') {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error('Este dispositivo no permite usar la cámara en pantalla.');
  }

  // Warm permission with the intended camera so Android doesn't stick on the front lens.
  let permissionStream = null;
  try {
    permissionStream = await withTimeout(
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: preferredDeviceId
          ? { deviceId: { ideal: preferredDeviceId } }
          : { facingMode: { ideal: facingMode } },
      }),
      5000,
      'No se pudo pedir permiso de cámara.',
    );
  } catch (_error) {
    // Continue — some devices already granted permission.
  } finally {
    stopMediaStream(permissionStream);
    permissionStream = null;
  }

  // Brief pause so the previous track fully releases before reopening.
  await new Promise((resolve) => window.setTimeout(resolve, 120));

  const devices = await listVideoInputDevices();
  const deviceId = preferredDeviceId || pickCameraDeviceId(devices, facingMode);
  const labeledDevice = devices.find((device) => device.deviceId === deviceId);
  const deviceIsLabeled = deviceLabelLooksLikeFacing(labeledDevice?.label, facingMode);

  const attempts = [];

  // Explicit device chosen by "Voltear cámara" goes first.
  if (preferredDeviceId) {
    attempts.push({
      audio: false,
      video: {
        deviceId: { exact: preferredDeviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    attempts.push({
      audio: false,
      video: {
        deviceId: { ideal: preferredDeviceId },
      },
    });
  }

  // Prefer facingMode first for cédula — unlabeled deviceId guesses often reopen the selfie camera.
  attempts.push({
    audio: false,
    video: {
      facingMode: { exact: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  attempts.push({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  attempts.push({
    audio: false,
    video: {
      facingMode,
    },
  });

  // Only pin deviceId when the label clearly matches front/rear.
  if (deviceId && deviceIsLabeled && deviceId !== preferredDeviceId) {
    attempts.push({
      audio: false,
      video: {
        deviceId: { exact: deviceId },
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    attempts.push({
      audio: false,
      video: {
        deviceId: { exact: deviceId },
      },
    });
  }

  // Last resort only for selfie; never for cédula (would reopen front camera).
  if (facingMode === 'user') {
    if (deviceId) {
      attempts.push({
        audio: false,
        video: {
          deviceId: { ideal: deviceId },
        },
      });
    }
    attempts.push({
      audio: false,
      video: true,
    });
  } else if (deviceId && devices.length > 1 && deviceId !== preferredDeviceId) {
    // Unlabeled multi-camera Android: try the guessed rear deviceId as last option.
    attempts.push({
      audio: false,
      video: {
        deviceId: { exact: deviceId },
      },
    });
  }

  let lastError = null;
  for (const constraints of attempts) {
    try {
      const stream = await withTimeout(
        navigator.mediaDevices.getUserMedia(constraints),
        7000,
        'La cámara en pantalla no respondió a tiempo.',
      );
      // Guard: if we asked for rear but clearly got a front-labeled track, keep trying.
      // Skip this guard when user explicitly flipped to a deviceId.
      if (facingMode === 'environment' && !preferredDeviceId) {
        const track = stream.getVideoTracks?.()?.[0];
        const label = String(track?.label || '').toLowerCase();
        if (label && deviceLabelLooksLikeFacing(label, 'user') && !deviceLabelLooksLikeFacing(label, 'environment')) {
          stopMediaStream(stream);
          lastError = new Error('Se abrió la cámara delantera en lugar de la trasera.');
          continue;
        }
      }
      return stream;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(
    facingMode === 'environment'
      ? 'No se pudo abrir la cámara trasera. Usa “Usar cámara del teléfono” o “Voltear cámara”.'
      : 'No se pudo abrir la cámara. Usa la cámara del teléfono.',
  );
}

export function resolveIdentityCaptureMode(value) {
  const evidence = value && typeof value === 'object' ? value : {};
  if (!evidence.selfieImage) return 'selfie';
  if (!evidence.idFrontImage) return 'idFront';
  if (!evidence.idBackImage) return 'idBack';
  return 'complete';
}

function SinglePhotoReview({
  imageSrc,
  title,
  caption,
  question,
  saving = false,
  onRetake,
  onContinue,
  continueLabel = 'Continuar',
  landscape = false,
}) {
  return (
    <div className={`matricula-identity__photo-review${landscape ? ' is-landscape' : ''}`} role="status">
      <figure>
        <img alt={caption || title} src={imageSrc} />
        <figcaption>{caption || 'Vista previa'}</figcaption>
      </figure>
      {title ? <strong>{title}</strong> : null}
      <p>{question}</p>
      <div className="matricula-identity__actions matricula-identity__actions--review">
        <button className="matricula-flow-secondary" disabled={saving} onClick={onRetake} type="button">
          Tomar otra
        </button>
        <button className="matricula-flow-primary" disabled={saving} onClick={onContinue} type="button">
          {saving ? 'Guardando...' : continueLabel}
        </button>
      </div>
    </div>
  );
}

export default function MatriculaIdentityCapture({
  signerName = 'Acudiente',
  value: valueProp = null,
  onChange,
  onStepComplete,
  saving = false,
}) {
  const value = (valueProp && typeof valueProp === 'object')
    ? valueProp
    : { selfieImage: '', idFrontImage: '', idBackImage: '' };
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const startGenerationRef = useRef(0);
  const videoDeviceIdsRef = useRef([]);
  const deviceIndexRef = useRef(0);
  const androidLikeDevice = shouldPreferNativeCamera();

  const [mode, setMode] = useState(() => {
    const resolved = resolveIdentityCaptureMode(value);
    return resolved === 'complete' ? 'idBack' : resolved;
  });
  // Manual flip only applies to the current step (selfie / cédula).
  const [facingOverride, setFacingOverride] = useState(null);
  const [preferredDeviceId, setPreferredDeviceId] = useState('');
  const [cameraState, setCameraState] = useState('idle');
  const [error, setError] = useState('');
  const [uploadTarget, setUploadTarget] = useState('idFront');
  const [pendingSelfie, setPendingSelfie] = useState('');
  const [pendingIdFront, setPendingIdFront] = useState('');
  const [pendingIdBack, setPendingIdBack] = useState('');
  const [finalReviewOpen, setFinalReviewOpen] = useState(false);

  const defaultFacing = mode === 'selfie' ? 'user' : 'environment';
  const facingMode = facingOverride?.mode === mode
    ? facingOverride.facing
    : defaultFacing;

  const stopCamera = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const openNativeCamera = useCallback((target = mode) => {
    setUploadTarget(target === 'selfie' ? 'selfie' : (target === 'idFront' ? 'idFront' : 'idBack'));
    // Defer so state updates before the picker opens (important on Android WebView).
    window.setTimeout(() => {
      fileInputRef.current?.click();
    }, 40);
  }, [mode]);

  const startCamera = useCallback(async (nextFacing = 'user', nextDeviceId = '') => {
    const generation = startGenerationRef.current + 1;
    startGenerationRef.current = generation;

    // Fully release previous camera before switching front ↔ rear.
    try {
      const video = videoRef.current;
      if (video) {
        video.pause?.();
        video.srcObject = null;
      }
    } catch (_error) {
      // Ignore.
    }
    stopCamera();
    setError('');

    setCameraState('requesting');
    // Give Android a beat to free the previous camera hardware.
    await new Promise((resolve) => window.setTimeout(resolve, androidLikeDevice ? 280 : 180));
    if (startGenerationRef.current !== generation) return;

    try {
      const stream = await openCameraStream(nextFacing, nextDeviceId);
      if (startGenerationRef.current !== generation) {
        stopMediaStream(stream);
        return;
      }
      streamRef.current = stream;

      // Keep a device list so "Voltear cámara" can cycle lenses reliably.
      const devices = await listVideoInputDevices();
      const ids = devices.map((device) => device.deviceId).filter(Boolean);
      if (ids.length) {
        videoDeviceIdsRef.current = ids;
        const activeId = stream.getVideoTracks?.()?.[0]?.getSettings?.()?.deviceId
          || nextDeviceId
          || '';
        const activeIndex = ids.indexOf(activeId);
        if (activeIndex >= 0) deviceIndexRef.current = activeIndex;
      }

      const video = videoRef.current;
      if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        try {
          await withTimeout(video.play(), 4000, 'No se pudo iniciar la vista previa de la cámara.');
        } catch (playError) {
          // Android often throws AbortError when a previous play() is interrupted during camera switch.
          const name = String(playError?.name || '');
          if (name !== 'AbortError' && !String(playError?.message || '').includes('interrupted')) {
            throw playError;
          }
        }
      }
      if (startGenerationRef.current !== generation) return;
      setCameraState('ready');
    } catch (err) {
      if (startGenerationRef.current !== generation) return;
      stopCamera();
      setCameraState('native');
      setError(err?.message || 'Usa la cámara del teléfono para continuar.');
    }
  }, [androidLikeDevice, stopCamera]);

  const flipCamera = useCallback(async () => {
    if (cameraState === 'requesting') return;
    setError('');
    let ids = videoDeviceIdsRef.current;
    if (ids.length < 2) {
      const devices = await listVideoInputDevices();
      ids = devices.map((device) => device.deviceId).filter(Boolean);
      videoDeviceIdsRef.current = ids;
    }

    if (ids.length > 1) {
      const nextIndex = (deviceIndexRef.current + 1) % ids.length;
      deviceIndexRef.current = nextIndex;
      const nextId = ids[nextIndex];
      const devices = await listVideoInputDevices();
      const nextDevice = devices.find((device) => device.deviceId === nextId);
      const nextFacing = deviceLabelLooksLikeFacing(nextDevice?.label, 'environment')
        ? 'environment'
        : (deviceLabelLooksLikeFacing(nextDevice?.label, 'user') ? 'user' : (
          facingMode === 'user' ? 'environment' : 'user'
        ));
      setFacingOverride({ mode, facing: nextFacing });
      setPreferredDeviceId(nextId);
      return;
    }

    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setPreferredDeviceId('');
    setFacingOverride({ mode, facing: nextFacing });
  }, [cameraState, facingMode, mode]);

  const reviewingPhoto = Boolean(pendingSelfie || pendingIdFront || pendingIdBack || finalReviewOpen);
  const identityComplete = Boolean(value.selfieImage && value.idFrontImage && value.idBackImage);
  const useNativeCapture = cameraState === 'native' || cameraState === 'error';
  const mirrorPreview = facingMode === 'user';

  useEffect(() => {
    const resolved = resolveIdentityCaptureMode(value);
    if (resolved === 'complete') {
      setPendingSelfie('');
      setPendingIdFront('');
      setPendingIdBack('');
      setFinalReviewOpen(false);
      return;
    }
    if (reviewingPhoto) return;
    setMode((current) => (current === resolved ? current : resolved));
  }, [value.selfieImage, value.idFrontImage, value.idBackImage, reviewingPhoto]);

  // Drop device pin when the capture step changes (selfie ↔ cédula).
  useEffect(() => {
    setPreferredDeviceId('');
    deviceIndexRef.current = 0;
  }, [mode]);

  useEffect(() => {
    if (reviewingPhoto || identityComplete) {
      stopCamera();
      return undefined;
    }

    // Defer camera until the identity step has painted (avoids Android white-screen race).
    setCameraState((current) => (current === 'ready' ? current : 'requesting'));
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      startCamera(facingMode, preferredDeviceId);
    }, androidLikeDevice ? 550 : 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      startGenerationRef.current += 1;
      stopCamera();
    };
  }, [
    facingMode,
    preferredDeviceId,
    reviewingPhoto,
    identityComplete,
    startCamera,
    stopCamera,
    androidLikeDevice,
  ]);

  const commitStep = async (nextValue, step) => {
    onChange?.(nextValue);
    if (onStepComplete) {
      await onStepComplete(nextValue, step);
    }
  };

  const takePhoto = async () => {
    if (useNativeCapture || cameraState !== 'ready') {
      openNativeCamera(mode);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      openNativeCamera(mode);
      return;
    }

    const width = Number(video.videoWidth || 0);
    const height = Number(video.videoHeight || 0);
    if (!width || !height) {
      setError('La cámara todavía se está preparando. Usa la cámara del teléfono.');
      setCameraState('native');
      return;
    }

    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / width);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (mirrorPreview) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = await compressCanvasToDataUrl(canvas, 0.7);
    if (!dataUrl) {
      setError('No se pudo capturar la foto. Usa la cámara del teléfono.');
      setCameraState('native');
      return;
    }

    setError('');
    if (mode === 'selfie') {
      setPendingSelfie(dataUrl);
      return;
    }
    if (mode === 'idFront') {
      setPendingIdFront(dataUrl);
      return;
    }
    setPendingIdBack(dataUrl);
  };

  const confirmSelfie = async () => {
    if (!pendingSelfie) return;
    const nextValue = { ...value, selfieImage: pendingSelfie };
    setPendingSelfie('');
    await commitStep(nextValue, 'selfie');
    setMode('idFront');
  };

  const confirmIdFront = async () => {
    if (!pendingIdFront) return;
    const nextValue = { ...value, idFrontImage: pendingIdFront };
    setPendingIdFront('');
    await commitStep(nextValue, 'idFront');
    setMode('idBack');
  };

  const confirmIdBackPreview = () => {
    if (!pendingIdBack) return;
    setFinalReviewOpen(true);
  };

  const confirmFinalReview = async () => {
    if (!pendingIdBack && !value.idBackImage) return;
    const nextValue = {
      ...value,
      idBackImage: pendingIdBack || value.idBackImage,
    };
    setPendingIdBack('');
    setFinalReviewOpen(false);
    await commitStep(nextValue, 'idBack');
  };

  const retakeFromFinal = (target = 'idBack') => {
    setFinalReviewOpen(false);
    setPendingIdBack('');
    if (target === 'selfie') {
      setMode('selfie');
      return;
    }
    if (target === 'idFront') {
      setMode('idFront');
      return;
    }
    setMode('idBack');
  };

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!String(file.type || '').startsWith('image/') && !String(file.name || '').match(/\.(jpe?g|png|webp|heic)$/i)) {
      setError('Solo se permiten imágenes.');
      return;
    }
    try {
      const dataUrl = await compressImageFileToDataUrl(file, { maxWidth: 1280, quality: 0.72 });
      setError('');
      if (uploadTarget === 'selfie' || mode === 'selfie') {
        setPendingSelfie(dataUrl);
        return;
      }
      if (uploadTarget === 'idFront' || mode === 'idFront') {
        setPendingIdFront(dataUrl);
        return;
      }
      setPendingIdBack(dataUrl);
    } catch (err) {
      setError(err?.message || 'No se pudo cargar la foto.');
    }
  };

  const captureAttr = facingMode;
  const nativeButtonLabel = mode === 'selfie'
    ? 'Tomar selfie con la cámara'
    : (mode === 'idFront' ? 'Fotografiar frente de cédula' : 'Fotografiar reverso de cédula');
  const flipLabel = facingMode === 'user' ? 'Voltear a trasera' : 'Voltear a delantera';

  const goToPreviousStep = async () => {
    setPendingSelfie('');
    setPendingIdFront('');
    setPendingIdBack('');
    setFinalReviewOpen(false);
    setFacingOverride(null);
    setPreferredDeviceId('');
    setError('');

    if (mode === 'idBack') {
      // Clear front+back so the flow resolves to "cédula frente" again.
      const nextValue = {
        ...value,
        idFrontImage: '',
        idBackImage: '',
      };
      onChange?.(nextValue);
      setMode('idFront');
      if (onStepComplete) {
        await onStepComplete(nextValue, 'idFront');
      }
      return;
    }

    if (mode === 'idFront') {
      const nextValue = {
        selfieImage: '',
        idFrontImage: '',
        idBackImage: '',
      };
      onChange?.(nextValue);
      setMode('selfie');
      if (onStepComplete) {
        await onStepComplete(nextValue, 'selfie');
      }
    }
  };

  const headCopy = (() => {
    if (finalReviewOpen) {
      return 'Revisa las 3 fotos juntas. Si todo está bien, continúa; si no, vuelve a tomar la que necesites.';
    }
    if (pendingSelfie) {
      return 'Revisa tu selfie. Si te gusta, continúa; si no, toma otra.';
    }
    if (pendingIdFront) {
      return 'Revisa el frente de tu cédula. Si se ve claro, continúa; si no, toma otra.';
    }
    if (pendingIdBack) {
      return 'Revisa el reverso de tu cédula. Si se ve claro, continúa; si no, toma otra.';
    }
    if (mode === 'selfie') {
      return useNativeCapture
        ? `${signerName}: toca el botón para abrir la cámara del teléfono y tomarte el selfie.`
        : `${signerName}: coloca tu cara dentro del óvalo y tómate un selfie.`;
    }
    if (mode === 'idFront') {
      return useNativeCapture
        ? `${signerName}: captura el FRENTE de tu cédula con la cámara del teléfono. Si abre la delantera, usa “Voltear a trasera” antes de fotografiar.`
        : `${signerName}: captura el FRENTE de tu cédula. Si sale la delantera, usa “Voltear cámara”.`;
    }
    return useNativeCapture
      ? `${signerName}: captura el REVERSO de tu cédula con la cámara del teléfono. Si abre la delantera, usa “Voltear a trasera” antes de fotografiar.`
      : `${signerName}: captura el REVERSO de tu cédula. Si sale la delantera, usa “Voltear cámara”.`;
  })();

  const finalSelfie = value.selfieImage;
  const finalFront = value.idFrontImage;
  const finalBack = pendingIdBack || value.idBackImage;

  return (
    <div className="matricula-identity">
      <div className="matricula-identity__head">
        <p className="matricula-identity__eyebrow">Verificación de identidad</p>
        <h3>Trámite de {signerName}</h3>
        <p>{headCopy}</p>
      </div>

      <div className="matricula-identity__steps">
        <span className={value.selfieImage ? 'is-done' : mode === 'selfie' || pendingSelfie ? 'is-active' : ''}>1. Selfie</span>
        <span className={value.idFrontImage ? 'is-done' : mode === 'idFront' || pendingIdFront ? 'is-active' : ''}>2. Cédula frente</span>
        <span className={value.idBackImage || finalReviewOpen ? 'is-done' : mode === 'idBack' || pendingIdBack ? 'is-active' : ''}>3. Cédula reverso</span>
      </div>

      {identityComplete ? (
        <div className="matricula-identity__preview-grid">
          <figure><img alt="Selfie" src={value.selfieImage} /><figcaption>Selfie</figcaption></figure>
          <figure><img alt="Cédula frente" src={value.idFrontImage} /><figcaption>Frente</figcaption></figure>
          <figure><img alt="Cédula reverso" src={value.idBackImage} /><figcaption>Reverso</figcaption></figure>
        </div>
      ) : finalReviewOpen ? (
        <div className="matricula-identity__final-review" role="status">
          <div className="matricula-identity__preview-grid">
            <figure><img alt="Selfie" src={finalSelfie} /><figcaption>Selfie</figcaption></figure>
            <figure><img alt="Cédula frente" src={finalFront} /><figcaption>Frente</figcaption></figure>
            <figure><img alt="Cédula reverso" src={finalBack} /><figcaption>Reverso</figcaption></figure>
          </div>
          <p>¿Confirmas estas 3 fotos para continuar?</p>
          <div className="matricula-identity__actions matricula-identity__actions--final">
            <button className="matricula-flow-secondary" disabled={saving} onClick={() => retakeFromFinal('selfie')} type="button">
              Repetir selfie
            </button>
            <button className="matricula-flow-secondary" disabled={saving} onClick={() => retakeFromFinal('idFront')} type="button">
              Repetir frente
            </button>
            <button className="matricula-flow-secondary" disabled={saving} onClick={() => retakeFromFinal('idBack')} type="button">
              Repetir reverso
            </button>
            <button className="matricula-flow-primary" disabled={saving} onClick={confirmFinalReview} type="button">
              {saving ? 'Guardando...' : 'Continuar'}
            </button>
          </div>
        </div>
      ) : pendingSelfie ? (
        <SinglePhotoReview
          caption="Vista previa selfie"
          continueLabel="Continuar"
          imageSrc={pendingSelfie}
          onContinue={confirmSelfie}
          onRetake={() => setPendingSelfie('')}
          question="¿Deseas tomar otra foto o continuar con esta selfie?"
          saving={saving}
          title="Selfie"
        />
      ) : pendingIdFront ? (
        <SinglePhotoReview
          caption="Vista previa frente"
          continueLabel="Continuar"
          imageSrc={pendingIdFront}
          landscape
          onContinue={confirmIdFront}
          onRetake={() => setPendingIdFront('')}
          question="¿Deseas tomar otra foto o continuar con el frente de la cédula?"
          saving={saving}
          title="Cédula — frente"
        />
      ) : pendingIdBack ? (
        <SinglePhotoReview
          caption="Vista previa reverso"
          continueLabel="Continuar"
          imageSrc={pendingIdBack}
          landscape
          onContinue={confirmIdBackPreview}
          onRetake={() => setPendingIdBack('')}
          question="¿Deseas tomar otra foto o continuar con el reverso de la cédula?"
          saving={saving}
          title="Cédula — reverso"
        />
      ) : useNativeCapture ? (
        <div className="matricula-identity__native-wrap">
          <button
            className={`matricula-identity__native-card ${mode === 'selfie' ? 'is-selfie' : 'is-id'}`}
            disabled={saving}
            onClick={() => openNativeCamera(mode)}
            type="button"
          >
            <strong>{mode === 'selfie' ? 'Selfie' : (mode === 'idFront' ? 'Cédula — frente' : 'Cédula — reverso')}</strong>
            <span>Toca aquí para abrir la cámara del teléfono</span>
          </button>
        </div>
      ) : (
        <div className={`matricula-identity__camera ${mode === 'selfie' ? 'is-selfie' : 'is-id'}${mirrorPreview ? ' is-mirrored' : ''}`}>
          <video autoPlay muted playsInline ref={videoRef} />
          {mode === 'selfie' ? <div aria-hidden className="matricula-identity__face-guide" /> : (
            <div aria-hidden className="matricula-identity__id-guide">
              <span>{mode === 'idFront' ? 'FRENTE' : 'REVERSO'}</span>
            </div>
          )}
          <button
            aria-label={flipLabel}
            className="matricula-identity__flip"
            disabled={saving || cameraState === 'requesting'}
            onClick={flipCamera}
            type="button"
          >
            Voltear cámara
          </button>
          <canvas hidden ref={canvasRef} />
        </div>
      )}

      {error ? <p className="matricula-identity__error">{error}</p> : null}
      {saving && !reviewingPhoto ? <p className="matricula-flow-note matricula-flow-note--muted">Guardando progreso...</p> : null}

      <input
        accept="image/*"
        capture={captureAttr}
        hidden
        onChange={onPickFile}
        ref={fileInputRef}
        type="file"
      />

      {identityComplete ? (
        <div className="matricula-identity__actions">
          <button
            className="matricula-flow-secondary"
            disabled={saving}
            onClick={() => {
              onChange?.({ selfieImage: '', idFrontImage: '', idBackImage: '' });
              setPendingSelfie('');
              setPendingIdFront('');
              setPendingIdBack('');
              setFinalReviewOpen(false);
              setMode('selfie');
            }}
            type="button"
          >
            Repetir verificación
          </button>
          <p className="matricula-flow-note matricula-flow-note--muted">
            Identidad lista. El progreso queda guardado aunque cierres y vuelvas después.
          </p>
        </div>
      ) : reviewingPhoto ? null : (
        <div className="matricula-identity__actions">
          <button
            className="matricula-flow-primary"
            disabled={saving || (!useNativeCapture && cameraState === 'requesting')}
            onClick={takePhoto}
            type="button"
          >
            {cameraState === 'requesting'
              ? 'Abriendo cámara...'
              : saving
                ? 'Guardando...'
                : useNativeCapture
                  ? nativeButtonLabel
                  : 'Tomar foto'}
          </button>
          <button
            className="matricula-flow-secondary matricula-identity__flip-action"
            disabled={saving || (!useNativeCapture && cameraState === 'requesting')}
            onClick={flipCamera}
            type="button"
          >
            {flipLabel}
          </button>
          <button
            className="matricula-flow-secondary"
            disabled={saving}
            onClick={() => openNativeCamera(mode)}
            type="button"
          >
            Subir archivo / cámara del teléfono
          </button>
          {mode === 'idBack' ? (
            <button
              className="matricula-flow-secondary"
              disabled={saving}
              onClick={goToPreviousStep}
              type="button"
            >
              Volver a cédula frente
            </button>
          ) : null}
          {mode === 'idFront' && value.selfieImage ? (
            <button
              className="matricula-flow-secondary"
              disabled={saving}
              onClick={goToPreviousStep}
              type="button"
            >
              Volver a selfie
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
