import { useCallback, useEffect, useRef, useState } from 'react';

function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function getRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  return [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

function getExtensionFromMimeType(mimeType, fallback = 'webm') {
  if (/mp4/i.test(mimeType)) return 'mp4';
  if (/jpeg/i.test(mimeType)) return 'jpg';
  if (/png/i.test(mimeType)) return 'png';
  return fallback;
}

export default function TeacherCameraCapture({
  isOpen = false,
  onClose,
  onFilesReady,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const galleryInputRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const discardRecordingRef = useRef(false);
  const [captureMode, setCaptureMode] = useState('photo');
  const [facingMode, setFacingMode] = useState('environment');
  const [cameraState, setCameraState] = useState('idle');
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isPreparing, setIsPreparing] = useState(false);

  const stopRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopRecordingTimer();
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  }, [stopRecordingTimer]);

  const startCamera = useCallback(async () => {
    discardRecordingRef.current = true;
    stopCamera();
    discardRecordingRef.current = false;
    setCameraState('requesting');
    setError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setError('Este dispositivo no permite abrir la cámara desde la aplicación.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('ready');
    } catch (requestError) {
      setCameraState('error');
      if (requestError?.name === 'NotAllowedError' || requestError?.name === 'PermissionDeniedError') {
        setError('Permite el acceso a la cámara y al micrófono en los ajustes del teléfono para continuar.');
      } else if (requestError?.name === 'NotFoundError') {
        setError('No se encontró una cámara disponible en este dispositivo.');
      } else {
        setError(requestError?.message || 'No se pudo abrir la cámara.');
      }
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    if (!isOpen) {
      discardRecordingRef.current = true;
      stopCamera();
      document.body.classList.remove('teacher-camera-open');
      setCameraState('idle');
      setError('');
      setIsPreparing(false);
      return undefined;
    }

    document.body.classList.add('teacher-camera-open');
    startCamera();
    return () => {
      discardRecordingRef.current = true;
      stopCamera();
      document.body.classList.remove('teacher-camera-open');
    };
  }, [isOpen, startCamera, stopCamera]);

  const deliverFiles = async (files) => {
    const selectedFiles = Array.from(files || []).filter((file) => (
      String(file?.type || '').startsWith('image/')
      || String(file?.type || '').startsWith('video/')
    ));
    if (!selectedFiles.length || typeof onFilesReady !== 'function') {
      return;
    }

    setIsPreparing(true);
    setError('');
    try {
      await onFilesReady(selectedFiles);
    } catch (deliveryError) {
      setError(deliveryError?.message || 'No se pudo preparar el contenido para la publicación.');
      setIsPreparing(false);
    }
  };

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || cameraState !== 'ready') {
      return;
    }

    const width = Number(video.videoWidth || 0);
    const height = Number(video.videoHeight || 0);
    if (!width || !height) {
      setError('La cámara todavía se está preparando.');
      return;
    }

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (facingMode === 'user') {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setError('No se pudo capturar la foto.');
        return;
      }
      const file = new File([blob], `foto-docente-${Date.now()}.jpg`, { type: 'image/jpeg' });
      deliverFiles([file]);
    }, 'image/jpeg', 0.92);
  };

  const stopVideoRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
  };

  const startVideoRecording = () => {
    if (!streamRef.current || cameraState !== 'ready') {
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setError('La grabación de video no está disponible en este dispositivo.');
      return;
    }

    const mimeType = getRecordingMimeType();
    recordingChunksRef.current = [];
    try {
      const recorder = new MediaRecorder(
        streamRef.current,
        mimeType ? { mimeType, videoBitsPerSecond: 5_000_000 } : undefined
      );
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          recordingChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stopRecordingTimer();
        setIsRecording(false);
        if (discardRecordingRef.current) {
          recordingChunksRef.current = [];
          return;
        }
        const resolvedType = recorder.mimeType || mimeType || 'video/webm';
        const blob = new Blob(recordingChunksRef.current, { type: resolvedType });
        recordingChunksRef.current = [];
        if (!blob.size) {
          setError('No se pudo guardar el video.');
          return;
        }
        const extension = getExtensionFromMimeType(resolvedType);
        deliverFiles([
          new File([blob], `video-docente-${Date.now()}.${extension}`, { type: resolvedType }),
        ]);
      };
      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((current) => {
          if (current >= 29) {
            stopVideoRecording();
            return 30;
          }
          return current + 1;
        });
      }, 1000);
    } catch (recordingError) {
      setError(recordingError?.message || 'No se pudo iniciar la grabación.');
    }
  };

  const onCapturePress = () => {
    if (isPreparing) return;
    if (captureMode === 'photo') {
      takePhoto();
      return;
    }
    if (isRecording) {
      stopVideoRecording();
    } else {
      startVideoRecording();
    }
  };

  const onCloseCamera = () => {
    discardRecordingRef.current = true;
    stopCamera();
    onClose?.();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div aria-label="Cámara para publicaciones" aria-modal="true" className="teacher-camera" role="dialog">
      <video
        className={`teacher-camera__preview${facingMode === 'user' ? ' is-mirrored' : ''}`}
        muted
        playsInline
        ref={videoRef}
      />
      <canvas className="teacher-camera__canvas" ref={canvasRef} />
      <div className="teacher-camera__shade" />

      <header className="teacher-camera__topbar">
        <button aria-label="Cerrar cámara" onClick={onCloseCamera} type="button">×</button>
        {isRecording ? <span className="teacher-camera__recording-time">● 0:{String(recordingSeconds).padStart(2, '0')}</span> : <strong>Crear publicación</strong>}
        <button
          aria-label="Cambiar cámara"
          disabled={isRecording || isPreparing}
          onClick={() => setFacingMode((current) => (current === 'user' ? 'environment' : 'user'))}
          type="button"
        >
          ↻
        </button>
      </header>

      {cameraState === 'requesting' ? (
        <div className="teacher-camera__message">
          <strong>Permite usar la cámara</strong>
          <span>Necesitamos acceso a la cámara y al micrófono para crear tu publicación.</span>
        </div>
      ) : null}
      {error ? (
        <div className="teacher-camera__message is-error">
          <strong>No pudimos continuar</strong>
          <span>{error}</span>
          {cameraState === 'error' ? <button onClick={startCamera} type="button">Intentar nuevamente</button> : null}
        </div>
      ) : null}
      {isPreparing ? (
        <div className="teacher-camera__message">
          <strong>Preparando publicación…</strong>
          <span>Estamos cargando el contenido seleccionado.</span>
        </div>
      ) : null}

      <footer className="teacher-camera__controls">
        <div className="teacher-camera__modes">
          <button
            className={captureMode === 'photo' ? 'is-active' : ''}
            disabled={isRecording}
            onClick={() => setCaptureMode('photo')}
            type="button"
          >
            FOTO
          </button>
          <button
            className={captureMode === 'video' ? 'is-active' : ''}
            disabled={isRecording}
            onClick={() => setCaptureMode('video')}
            type="button"
          >
            VIDEO
          </button>
        </div>
        <button
          aria-label={captureMode === 'video' ? (isRecording ? 'Detener grabación' : 'Grabar video') : 'Tomar foto'}
          className={`teacher-camera__shutter${isRecording ? ' is-recording' : ''}`}
          disabled={cameraState !== 'ready' || isPreparing}
          onClick={onCapturePress}
          type="button"
        >
          <span />
        </button>
        <button
          className="teacher-camera__gallery"
          disabled={isRecording || isPreparing}
          onClick={() => galleryInputRef.current?.click()}
          type="button"
        >
          <span aria-hidden="true">▧</span>
          Abrir galería
        </button>
        <input
          accept="image/*,video/*"
          className="teacher-camera__gallery-input"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            deliverFiles(files);
          }}
          ref={galleryInputRef}
          type="file"
        />
      </footer>
    </div>
  );
}
