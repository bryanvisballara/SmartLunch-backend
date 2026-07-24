import { useCallback, useEffect, useRef, useState } from 'react';
import './MatriculaIdentityCapture.css';

function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
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
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve('');
        return;
      }
      resolve(await blobToDataUrl(blob));
    }, 'image/jpeg', quality);
  });
}

export function resolveIdentityCaptureMode(value = {}) {
  if (!value.selfieImage) return 'selfie';
  if (!value.idFrontImage) return 'idFront';
  if (!value.idBackImage) return 'idBack';
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
  value = { selfieImage: '', idFrontImage: '', idBackImage: '' },
  onChange,
  onStepComplete,
  saving = false,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState(() => {
    const resolved = resolveIdentityCaptureMode(value);
    return resolved === 'complete' ? 'idBack' : resolved;
  });
  const [cameraState, setCameraState] = useState('idle');
  const [error, setError] = useState('');
  const [uploadTarget, setUploadTarget] = useState('idFront');
  const [pendingSelfie, setPendingSelfie] = useState('');
  const [pendingIdFront, setPendingIdFront] = useState('');
  const [pendingIdBack, setPendingIdBack] = useState('');
  const [finalReviewOpen, setFinalReviewOpen] = useState(false);

  const stopCamera = useCallback(() => {
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
  }, []);

  const startCamera = useCallback(async (facingMode = 'user') => {
    stopCamera();
    setCameraState('requesting');
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('ready');
    } catch (err) {
      setCameraState('error');
      setError(err?.message || 'No se pudo abrir la cámara. Revisa los permisos del dispositivo.');
    }
  }, [stopCamera]);

  const reviewingPhoto = Boolean(pendingSelfie || pendingIdFront || pendingIdBack || finalReviewOpen);
  const identityComplete = Boolean(value.selfieImage && value.idFrontImage && value.idBackImage);

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

  useEffect(() => {
    if (reviewingPhoto || identityComplete) {
      stopCamera();
      return undefined;
    }
    if (mode === 'selfie') {
      startCamera('user');
    } else {
      startCamera('environment');
    }
    return () => stopCamera();
  }, [mode, reviewingPhoto, identityComplete, startCamera, stopCamera]);

  const commitStep = async (nextValue, step) => {
    onChange?.(nextValue);
    if (onStepComplete) {
      await onStepComplete(nextValue, step);
    }
  };

  const takePhoto = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || cameraState !== 'ready') {
      setError('La cámara todavía se está preparando.');
      return;
    }

    const width = Number(video.videoWidth || 0);
    const height = Number(video.videoHeight || 0);
    if (!width || !height) {
      setError('La cámara todavía se está preparando.');
      return;
    }

    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / width);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (mode === 'selfie') {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = await compressCanvasToDataUrl(canvas, 0.7);
    if (!dataUrl) {
      setError('No se pudo capturar la foto.');
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
    if (!String(file.type || '').startsWith('image/')) {
      setError('Solo se permiten imágenes.');
      return;
    }
    try {
      const dataUrl = await blobToDataUrl(file);
      setError('');
      if (uploadTarget === 'idFront' || mode === 'idFront') {
        setPendingIdFront(dataUrl);
      } else {
        setPendingIdBack(dataUrl);
      }
    } catch (err) {
      setError(err?.message || 'No se pudo cargar el archivo.');
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
      return `${signerName}: coloca tu cara dentro del óvalo y tómate un selfie. No se permite galería.`;
    }
    if (mode === 'idFront') {
      return `${signerName}: captura el FRENTE de tu cédula (cámara o archivo). Puedes continuar después si no la tienes ahora.`;
    }
    return `${signerName}: captura el REVERSO de tu cédula (cámara o archivo).`;
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
      ) : (
        <div className={`matricula-identity__camera ${mode === 'selfie' ? 'is-selfie' : 'is-id'}`}>
          <video autoPlay muted playsInline ref={videoRef} />
          {mode === 'selfie' ? <div aria-hidden className="matricula-identity__face-guide" /> : (
            <div aria-hidden className="matricula-identity__id-guide">
              <span>{mode === 'idFront' ? 'FRENTE' : 'REVERSO'}</span>
            </div>
          )}
          <canvas hidden ref={canvasRef} />
        </div>
      )}

      {error ? <p className="matricula-identity__error">{error}</p> : null}
      {saving && !reviewingPhoto ? <p className="matricula-flow-note matricula-flow-note--muted">Guardando progreso...</p> : null}

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
            disabled={cameraState !== 'ready' || saving}
            onClick={takePhoto}
            type="button"
          >
            {cameraState === 'requesting' ? 'Abriendo cámara...' : saving ? 'Guardando...' : 'Tomar foto'}
          </button>
          {mode !== 'selfie' ? (
            <>
              <button
                className="matricula-flow-secondary"
                disabled={saving}
                onClick={() => {
                  setUploadTarget(mode === 'idFront' ? 'idFront' : 'idBack');
                  fileInputRef.current?.click();
                }}
                type="button"
              >
                Subir archivo
              </button>
              <input
                accept="image/*"
                hidden
                onChange={onPickFile}
                ref={fileInputRef}
                type="file"
              />
            </>
          ) : null}
          {mode !== 'selfie' && value.selfieImage ? (
            <button
              className="matricula-flow-secondary"
              disabled={saving}
              onClick={() => {
                setPendingSelfie('');
                setPendingIdFront('');
                setPendingIdBack('');
                setFinalReviewOpen(false);
                setMode('selfie');
              }}
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
