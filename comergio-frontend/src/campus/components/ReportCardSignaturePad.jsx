import { useEffect, useRef } from 'react';

function clampSignaturePoint(value, max) {
  return Math.max(0, Math.min(max, value));
}

function getCanvasPoint(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clampSignaturePoint(clientX - rect.left, rect.width),
    y: clampSignaturePoint(clientY - rect.top, rect.height),
  };
}

export default function ReportCardSignaturePad({
  value = '',
  onChange,
  disabled = false,
  ariaLabel = 'Espacio para firmar',
}) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const emitFrameRef = useRef(null);
  const displaySizeRef = useRef({ width: 0, height: 0 });
  const snapshotRef = useRef(value || '');
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    snapshotRef.current = value || '';
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const image = new Image();
    image.onload = () => {
      const { width, height } = displaySizeRef.current;
      if (!width || !height) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, width, height);
    };
    image.src = value;
  }, [value]);

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
        context.clearRect(0, 0, canvas.width, canvas.height);
        configureContext(context);
        context.drawImage(image, 0, 0, width, height);
      };
      image.src = dataUrl;
    };

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || canvas.clientWidth || 280;
      const height = rect.height || canvas.clientHeight || 120;
      if (!width || !height) return;

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      const context = canvas.getContext('2d');
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      configureContext(context);
      displaySizeRef.current = { width, height };
      restoreSnapshot();
    };

    resize();
    window.addEventListener('resize', resize);

    const startDraw = (point) => {
      const context = canvas.getContext('2d');
      if (!context) return;
      drawingRef.current = true;
      context.beginPath();
      context.moveTo(point.x, point.y);
    };

    const draw = (point) => {
      if (!drawingRef.current) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.lineTo(point.x, point.y);
      context.stroke();
      scheduleEmitSignature();
    };

    const endDraw = () => {
      drawingRef.current = false;
    };

    const onPointerDown = (event) => {
      if (disabled) return;
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      startDraw(getCanvasPoint(canvas, event.clientX, event.clientY));
    };

    const onPointerMove = (event) => {
      if (!drawingRef.current || disabled) return;
      draw(getCanvasPoint(canvas, event.clientX, event.clientY));
    };

    const onPointerUp = () => endDraw();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      if (emitFrameRef.current) {
        window.cancelAnimationFrame(emitFrameRef.current);
      }
    };
  }, [disabled]);

  const onClear = () => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return;
    const context = canvas.getContext('2d');
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    snapshotRef.current = '';
    onChangeRef.current?.('');
  };

  return (
    <div className="campus-report-card-signature">
      <canvas
        aria-label={ariaLabel}
        className="campus-report-card-signature__canvas"
        ref={canvasRef}
      />
      <button
        className="campus-teacher__ghost-btn campus-teacher__action-btn--compact"
        disabled={disabled}
        onClick={onClear}
        type="button"
      >
        Limpiar firma
      </button>
    </div>
  );
}
