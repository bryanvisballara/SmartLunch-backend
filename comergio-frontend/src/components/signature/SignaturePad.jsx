import { useEffect, useRef } from 'react';
import './SignaturePad.css';

function clamp(value, max) {
  return Math.min(Math.max(value, 0), max);
}

function getCanvasPointerPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return { x: 0, y: 0 };
  }

  const touch = event.touches?.[0] || event.changedTouches?.[0];
  const source = touch || event;
  const clientX = Number(source.clientX ?? 0);
  const clientY = Number(source.clientY ?? 0);

  return {
    x: clamp(clientX - rect.left, rect.width),
    y: clamp(clientY - rect.top, rect.height),
  };
}

export function compressSignatureDataUrl(dataUrl, { maxWidth = 900, quality = 0.72, mimeType = 'image/jpeg' } = {}) {
  return new Promise((resolve) => {
    const source = String(dataUrl || '');
    if (!source.startsWith('data:image/')) {
      resolve(source);
      return;
    }

    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / Math.max(1, image.width));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(source);
          return;
        }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL(mimeType, quality));
      } catch (_error) {
        resolve(source);
      }
    };
    image.onerror = () => resolve(source);
    image.src = source;
  });
}

export default function SignaturePad({ onChange, disabled = false, className = '' }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const emitFrameRef = useRef(null);
  const displaySizeRef = useRef({ width: 0, height: 0 });
  const snapshotRef = useRef('');
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const emitSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    snapshotRef.current = dataUrl;
    onChangeRef.current?.(dataUrl);
  };

  const scheduleEmitSignature = () => {
    if (emitFrameRef.current) return;
    emitFrameRef.current = window.requestAnimationFrame(() => {
      emitFrameRef.current = null;
      emitSignature();
    });
  };

  const configureContext = (context) => {
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 2.4;
    context.strokeStyle = '#0f172a';
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const restoreSnapshot = () => {
      const dataUrl = snapshotRef.current;
      if (!dataUrl) return;
      const image = new Image();
      image.onload = () => {
        const context = canvas.getContext('2d');
        if (!context) return;
        const { width, height } = displaySizeRef.current;
        context.save();
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.restore();
        configureContext(context);
        context.drawImage(image, 0, 0, width, height);
      };
      image.src = dataUrl;
    };

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || canvas.clientWidth || canvas.offsetWidth;
      const height = rect.height || canvas.clientHeight || canvas.offsetHeight;
      if (!width || !height) return;

      const previousWidth = displaySizeRef.current.width;
      const previousHeight = displaySizeRef.current.height;
      if (
        Math.abs(previousWidth - width) < 1
        && Math.abs(previousHeight - height) < 1
        && canvas.width === Math.floor(width * ratio)
        && canvas.height === Math.floor(height * ratio)
      ) {
        return;
      }

      if (!snapshotRef.current && canvas.width && canvas.height) {
        try {
          snapshotRef.current = canvas.toDataURL('image/png');
        } catch (_error) {
          // Ignore tainted/empty canvas.
        }
      }

      displaySizeRef.current = { width, height };
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      const context = canvas.getContext('2d');
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      configureContext(context);
      restoreSnapshot();
    };

    resize();

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => resize())
      : null;
    observer?.observe(canvas.parentElement || canvas);
    window.addEventListener('resize', resize);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', resize);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      viewport?.removeEventListener('resize', resize);
      if (emitFrameRef.current) {
        window.cancelAnimationFrame(emitFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return undefined;

    const beginStroke = (event) => {
      if (disabled) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      drawingRef.current = true;
      try {
        canvas.setPointerCapture?.(event.pointerId);
      } catch (_error) {
        // Older WebViews may not support capture.
      }
      const context = canvas.getContext('2d');
      configureContext(context);
      const point = getCanvasPointerPoint(canvas, event);
      context.beginPath();
      context.moveTo(point.x, point.y);
    };

    const continueStroke = (event) => {
      if (!drawingRef.current || disabled) return;
      event.preventDefault();
      const context = canvas.getContext('2d');
      const point = getCanvasPointerPoint(canvas, event);
      context.lineTo(point.x, point.y);
      context.stroke();
      scheduleEmitSignature();
    };

    const endStroke = (event) => {
      if (!drawingRef.current) return;
      event?.preventDefault?.();
      drawingRef.current = false;
      try {
        if (event?.pointerId != null) {
          canvas.releasePointerCapture?.(event.pointerId);
        }
      } catch (_error) {
        // Ignore.
      }
      emitSignature();
    };

    canvas.addEventListener('pointerdown', beginStroke, { passive: false });
    canvas.addEventListener('pointermove', continueStroke, { passive: false });
    canvas.addEventListener('pointerup', endStroke, { passive: false });
    canvas.addEventListener('pointercancel', endStroke, { passive: false });
    window.addEventListener('pointerup', endStroke);

    return () => {
      canvas.removeEventListener('pointerdown', beginStroke);
      canvas.removeEventListener('pointermove', continueStroke);
      canvas.removeEventListener('pointerup', endStroke);
      canvas.removeEventListener('pointercancel', endStroke);
      window.removeEventListener('pointerup', endStroke);
    };
  }, [disabled]);

  const onClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const { width, height } = displaySizeRef.current;
    context.clearRect(0, 0, width || canvas.offsetWidth, height || canvas.offsetHeight);
    snapshotRef.current = '';
    onChangeRef.current?.('');
  };

  return (
    <div className={`signature-pad${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}>
      <div className="signature-pad__surface">
        <canvas ref={canvasRef} />
      </div>
      <button className="signature-pad__clear" disabled={disabled} onClick={onClear} type="button">
        Limpiar firma
      </button>
    </div>
  );
}
