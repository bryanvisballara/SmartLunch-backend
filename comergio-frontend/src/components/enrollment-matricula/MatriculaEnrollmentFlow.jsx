import { useEffect, useMemo, useRef, useState } from 'react';
import {
  acceptEnrollmentMatriculaConsent,
  acknowledgeEnrollmentMatriculaIntro,
  createWompiMatriculaCheckout,
  getEnrollmentMatriculaPaymentStatus,
  getWompiMatriculaPaymentStatus,
  signEnrollmentMatriculaContract,
  signEnrollmentMatriculaPagare,
} from '../../services/enrollmentMatricula.service';
import { launchWompiWebCheckout } from '../WompiPaymentButton';
import {
  canUseOfficialEnrollmentContract,
  generateSignedEnrollmentContractPdfBase64,
  generateSignedPagarePdfBase64,
  normalizeOfficialEnrollmentContractParams,
  shouldHideParentEnrollmentPaymentAmount,
} from '../../lib/millenniumEnrollmentContracts';
import MatriculaContractDocumentPreview from './MatriculaContractDocumentPreview';
import { evaluateSignatureImage } from './signatureValidation';
import './MatriculaEnrollmentFlow.css';

const CONSENT_DECLARATIONS = [
  'He sido informado sobre los costos educativos correspondientes al año lectivo.',
  'He leído y conozco las condiciones generales de matrícula, las obligaciones económicas, académicas y de convivencia establecidas por el colegio.',
  'Entiendo que la matrícula constituye un acuerdo de prestación de servicios educativos entre el colegio y el responsable financiero.',
  'Reconozco que el pago de la matrícula es requisito para formalizar el proceso de matrícula del estudiante.',
  'Declaro que cuento con la capacidad económica para asumir oportunamente los costos educativos derivados de la matrícula, pensiones y demás servicios contratados.',
  'Entiendo que los pagos realizados por concepto de matrícula estarán sujetos a las políticas institucionales establecidas por el colegio.',
  'Autorizo el tratamiento de mis datos personales y los del estudiante para fines académicos, administrativos, financieros y de comunicación, conforme a la normativa colombiana vigente y a la política de tratamiento de datos del colegio.',
  'Entiendo que, una vez confirmado el pago, deberé revisar y firmar electrónicamente el Contrato Oficial de Matrícula y demás documentos requeridos para finalizar el proceso.',
  'Declaro que la información suministrada durante este proceso es veraz y completa.',
  'Manifiesto mi voluntad libre y expresa de continuar con el proceso de matrícula del estudiante en el colegio.',
];

const FLOW_STEPS = [
  { key: 'consent', label: 'Consentimiento previo de matrícula', description: 'Declaración del padre de familia y/o responsable financiero.', icon: 'consent' },
  { key: 'payment', label: 'Hacer el pago', description: 'Pago en línea seguro mediante la pasarela configurada por el colegio.', icon: 'payment' },
  { key: 'contract', label: 'Firma y legalización de matrícula', description: 'Contrato oficial de matrícula con firma digital.', icon: 'contract' },
  { key: 'pagare', label: 'Firmas pagaré', description: 'Pagaré y carta de instrucciones.', icon: 'pagare' },
];

function MatriculaStepIcon({ type }) {
  if (type === 'consent') {
    return (
      <svg aria-hidden="true" className="matricula-flow-steps__icon" viewBox="0 0 24 24">
        <path d="M9 12.5 11 14.5 15.5 10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M7 4h10a2 2 0 0 1 2 2v14l-4-2.5L11 20l-4-2.5L3 20V6a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (type === 'payment') {
    return (
      <svg aria-hidden="true" className="matricula-flow-steps__icon" viewBox="0 0 24 24">
        <rect fill="none" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="5" />
        <path d="M3 10h18" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M7 15h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (type === 'contract') {
    return (
      <svg aria-hidden="true" className="matricula-flow-steps__icon" viewBox="0 0 24 24">
        <path d="M12 3 19 6v6c0 4.2-2.8 7.4-7 9-4.2-1.6-7-4.8-7-9V6l7-3Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="m9.5 12.2 1.8 1.8 3.7-3.9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="matricula-flow-steps__icon" viewBox="0 0 24 24">
      <path d="M6 4h12v16H6z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M9 8h6M9 12h6M9 16h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M8 20h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(value || 0)));
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function resolveActiveStep(process) {
  const status = String(process?.status || '');
  if (['intro_pending', 'consent_pending'].includes(status)) return 'consent';
  if (['consent_accepted', 'payment_pending'].includes(status)) return 'payment';
  if (['payment_confirmed', 'contract_pending', 'office_payment_confirmed'].includes(status)) return 'contract';
  if (status === 'pagare_pending') return 'pagare';
  if (status === 'completed') return 'done';
  return 'consent';
}

let fallbackFingerTipOffsetPx = null;
let extraFingerTipCalibrationPx = null;

function isIosTouchDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function measureCssMillimeters(mm) {
  if (typeof document === 'undefined') return mm * 3.78;
  const ruler = document.createElement('div');
  ruler.style.cssText = `position:fixed;left:-9999px;top:0;width:1px;height:${mm}mm;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(ruler);
  const measured = ruler.getBoundingClientRect().height;
  ruler.remove();
  return measured || mm * 3.78;
}

function getFingerTipOffsetPx(touch) {
  if (!touch) return 0;
  if (!isIosTouchDevice()) return 0;
  if (fallbackFingerTipOffsetPx == null) {
    fallbackFingerTipOffsetPx = measureCssMillimeters(5);
  }
  if (extraFingerTipCalibrationPx == null) {
    extraFingerTipCalibrationPx = measureCssMillimeters(3);
  }
  const touchRadius = Number(touch.radiusY || touch.radiusX || 0);
  const calibratedFallback = fallbackFingerTipOffsetPx + extraFingerTipCalibrationPx;
  if (touchRadius > 0) {
    return Math.min(42, Math.max(calibratedFallback, touchRadius + extraFingerTipCalibrationPx));
  }
  return calibratedFallback;
}

function clampSignaturePoint(value, max) {
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
  const clientY = Number(source.clientY ?? 0) + getFingerTipOffsetPx(touch);

  return {
    x: clampSignaturePoint(clientX - rect.left, rect.width),
    y: clampSignaturePoint(clientY - rect.top, rect.height),
  };
}

function SignatureCanvas({ onChange, disabled = false }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const emitFrameRef = useRef(null);
  const displaySizeRef = useRef({ width: 0, height: 0 });

  const emitSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange?.(canvas.toDataURL('image/png'));
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

    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || canvas.clientWidth || canvas.offsetWidth;
      const height = rect.height || canvas.clientHeight || canvas.offsetHeight;
      if (!width || !height) return;
      displaySizeRef.current = { width, height };
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      const context = canvas.getContext('2d');
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      configureContext(context);
    };

    resize();

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => resize())
      : null;
    observer?.observe(canvas);
    window.addEventListener('resize', resize);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
      if (emitFrameRef.current) {
        window.cancelAnimationFrame(emitFrameRef.current);
      }
    };
  }, []);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }

    return getCanvasPointerPoint(canvas, event);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) return undefined;

    const beginStroke = (event) => {
      if (disabled) return;
      event.preventDefault();
      drawingRef.current = true;
      const context = canvas.getContext('2d');
      const point = getPoint(event);
      context.beginPath();
      context.moveTo(point.x, point.y);
    };

    const continueStroke = (event) => {
      if (!drawingRef.current || disabled) return;
      event.preventDefault();
      const context = canvas.getContext('2d');
      const point = getPoint(event);
      context.lineTo(point.x, point.y);
      context.stroke();
      scheduleEmitSignature();
    };

    const endStroke = (event) => {
      if (!drawingRef.current) return;
      event?.preventDefault();
      drawingRef.current = false;
      emitSignature();
    };

    canvas.addEventListener('touchstart', beginStroke, { passive: false });
    canvas.addEventListener('touchmove', continueStroke, { passive: false });
    canvas.addEventListener('touchend', endStroke, { passive: false });
    canvas.addEventListener('touchcancel', endStroke, { passive: false });
    canvas.addEventListener('mousedown', beginStroke);
    canvas.addEventListener('mousemove', continueStroke);
    window.addEventListener('mouseup', endStroke);

    return () => {
      canvas.removeEventListener('touchstart', beginStroke);
      canvas.removeEventListener('touchmove', continueStroke);
      canvas.removeEventListener('touchend', endStroke);
      canvas.removeEventListener('touchcancel', endStroke);
      canvas.removeEventListener('mousedown', beginStroke);
      canvas.removeEventListener('mousemove', continueStroke);
      window.removeEventListener('mouseup', endStroke);
    };
  }, [disabled]);

  const onClear = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const { width, height } = displaySizeRef.current;
    context.clearRect(0, 0, width || canvas.offsetWidth, height || canvas.offsetHeight);
    onChange?.('');
  };

  return (
    <div className={`matricula-signature-canvas${disabled ? ' is-disabled' : ''}`}>
      <div className="matricula-signature-canvas__pad">
        <canvas ref={canvasRef} />
      </div>
      <button className="matricula-signature-canvas__clear" disabled={disabled} onClick={onClear} type="button">
        Limpiar firma
      </button>
    </div>
  );
}

function MatriculaSignatureZone({
  enabled,
  disabled,
  loading,
  helperText,
  submitLabel,
  submittingLabel,
  onChange,
  onSubmit,
}) {
  if (!enabled) {
    return null;
  }

  return (
    <div className="matricula-flow-signature-zone">
      {helperText ? <p className="matricula-flow-signature-label">{helperText}</p> : null}
      <SignatureCanvas disabled={disabled} onChange={onChange} />
      <button
        className="matricula-flow-primary"
        disabled={disabled || loading}
        onClick={onSubmit}
        type="button"
      >
        {loading ? submittingLabel : submitLabel}
      </button>
    </div>
  );
}

function PendingSignatureIntro({ process, pendingSignatureResume }) {
  if (!pendingSignatureResume || !process) return null;

  const pendingLabel = process.pendingContractSignature || ['payment_confirmed', 'contract_pending'].includes(process.status)
    ? 'contrato oficial de matrícula'
    : 'pagaré';

  return (
    <div className="matricula-flow-pending-intro">
      <p>
        Ya confirmamos el pago de matrícula de
        {' '}
        <strong>{process.studentName || 'tu hijo/a'}</strong>
        , pero aún falta firmar el
        {' '}
        {pendingLabel}
        .
      </p>
      <p>Debes completar esta firma para finalizar el proceso de matrícula.</p>
    </div>
  );
}

function MatriculaEnrollmentFlow({
  open,
  process: initialProcess,
  charge,
  schoolName,
  schoolId = '',
  paymentOptions = [],
  onClose,
  onLogout,
  onProcessUpdated,
  onPaymentStudentChange,
  startAtIntro = true,
  pendingSignatureResume = false,
  blocking = false,
}) {
  const [process, setProcess] = useState(initialProcess);
  const [showIntro, setShowIntro] = useState(startAtIntro);
  const [consentChecked, setConsentChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [switchingStudent, setSwitchingStudent] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [contractAccepted, setContractAccepted] = useState(false);
  const [pagareAccepted, setPagareAccepted] = useState(false);
  const [wompiCheckoutConfig, setWompiCheckoutConfig] = useState(null);
  const [wompiCheckoutLoading, setWompiCheckoutLoading] = useState(false);

  useEffect(() => {
    setProcess(initialProcess);
  }, [initialProcess]);

  useEffect(() => {
    setShowIntro(Boolean(startAtIntro));
  }, [startAtIntro, initialProcess?._id, pendingSignatureResume]);

  const activeStep = useMemo(() => resolveActiveStep(process), [process]);

  useEffect(() => {
    if (activeStep !== 'payment') {
      setWompiCheckoutConfig(null);
      setWompiCheckoutLoading(false);
    }
  }, [activeStep, process?._id]);

  useEffect(() => {
    if (activeStep !== 'payment' || process?.payment?.status === 'PAID') {
      return undefined;
    }

    const reference = String(process?.payment?.reference || '').trim();
    if (!reference || String(process?.payment?.method || '').toLowerCase() !== 'wompi') {
      return undefined;
    }

    let cancelled = false;

    const syncPendingWompiPayment = async () => {
      try {
        const response = await getWompiMatriculaPaymentStatus({ reference });
        if (cancelled) return;
        const nextProcess = response.data?.process;
        if (nextProcess?.payment?.status === 'PAID') {
          setProcess(nextProcess);
          onProcessUpdated?.(nextProcess);
          setWompiCheckoutConfig(null);
        }
      } catch (error) {
        // Keep polling while Wompi/webhook reconciliation finishes.
      }
    };

    syncPendingWompiPayment();
    const timer = window.setInterval(syncPendingWompiPayment, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeStep, onProcessUpdated, process?._id, process?.payment?.method, process?.payment?.reference, process?.payment?.status]);

  const contractParams = process?.contractParamsSnapshot || null;
  const hideEnrollmentPaymentAmount = shouldHideParentEnrollmentPaymentAmount({ schoolId, schoolName })
    && activeStep === 'payment'
    && process.payment?.status !== 'PAID';

  useEffect(() => {
    if (activeStep === 'contract') {
      setContractAccepted(false);
      setSignatureImage('');
    }
    if (activeStep === 'pagare') {
      setPagareAccepted(false);
      setSignatureImage('');
    }
  }, [activeStep, process?._id]);
  const contractDocumentParams = useMemo(
    () => (contractParams
      ? normalizeOfficialEnrollmentContractParams({
        ...contractParams,
        schoolId: schoolId || process?.schoolId || contractParams.schoolId,
        schoolName: schoolName || contractParams.schoolName,
      })
      : null),
    [contractParams, process?.schoolId, schoolId, schoolName],
  );
  const canUseOfficialDocs = useMemo(
    () => contractDocumentParams && canUseOfficialEnrollmentContract(contractDocumentParams),
    [contractDocumentParams],
  );

  const refreshProcess = async () => {
    if (!process?._id) return;
    const response = await getEnrollmentMatriculaPaymentStatus(process._id);
    const nextProcess = response.data?.process;
    if (nextProcess) {
      setProcess(nextProcess);
      onProcessUpdated?.(nextProcess);
    }
  };

  const onAckIntro = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await acknowledgeEnrollmentMatriculaIntro(process._id);
      const nextProcess = response.data?.process || process;
      setProcess(nextProcess);
      onProcessUpdated?.(nextProcess);
      setShowIntro(false);
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo continuar.');
    } finally {
      setLoading(false);
    }
  };

  const onAcceptConsent = async () => {
    if (!consentChecked) {
      setErrorMessage('Debes aceptar el consentimiento para continuar.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const response = await acceptEnrollmentMatriculaConsent(process._id, { accepted: true });
      const nextProcess = response.data?.process || process;
      setProcess(nextProcess);
      onProcessUpdated?.(nextProcess);
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo registrar el consentimiento.');
    } finally {
      setLoading(false);
    }
  };

  const selectedPaymentChargeId = String(process?.chargeId || charge?._id || charge?.id || '');
  const hasMultiplePaymentStudents = paymentOptions.length > 1;

  const onSelectPaymentStudent = async (event) => {
    const nextChargeId = String(event.target.value || '').trim();
    if (!nextChargeId || nextChargeId === selectedPaymentChargeId || !onPaymentStudentChange) {
      return;
    }

    setSwitchingStudent(true);
    setErrorMessage('');
    setWompiCheckoutConfig(null);
    try {
      await onPaymentStudentChange(nextChargeId);
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || error?.message || 'No se pudo cambiar el estudiante.');
    } finally {
      setSwitchingStudent(false);
    }
  };

  const onStartPayment = async () => {
    setLoading(true);
    setWompiCheckoutLoading(true);
    setErrorMessage('');
    try {
      const response = await createWompiMatriculaCheckout(process._id);
      const checkout = response.data?.checkout;
      if (!checkout?.reference || !checkout?.integritySignature) {
        throw new Error('No se pudo preparar la pasarela Wompi.');
      }
      setWompiCheckoutConfig(checkout);
      launchWompiWebCheckout(checkout);
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || error?.message || 'No se pudo iniciar el pago con Wompi.');
      setWompiCheckoutConfig(null);
    } finally {
      setLoading(false);
      setWompiCheckoutLoading(false);
    }
  };

  const validateSignatureBeforeSubmit = async () => {
    const result = await evaluateSignatureImage(signatureImage);
    if (!result.valid) {
      setErrorMessage(result.message);
      return false;
    }
    return true;
  };

  const onSignContract = async () => {
    if (!contractAccepted) {
      setErrorMessage('Debes leer y aceptar el contrato para habilitar la firma.');
      return;
    }
    if (!(await validateSignatureBeforeSubmit())) {
      return;
    }
    if (!canUseOfficialDocs) {
      setErrorMessage('Los documentos de matrícula aún no están disponibles para este colegio.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const signedDocument = generateSignedEnrollmentContractPdfBase64(contractDocumentParams, signatureImage);
      const response = await signEnrollmentMatriculaContract(process._id, {
        signatureImage,
        signedPdfBase64: signedDocument.base64,
        fileName: signedDocument.fileName,
      });
      const nextProcess = response.data?.process || process;
      setProcess(nextProcess);
      onProcessUpdated?.(nextProcess);
      setSignatureImage('');
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo guardar la firma del contrato.');
    } finally {
      setLoading(false);
    }
  };

  const onSignPagare = async () => {
    if (!pagareAccepted) {
      setErrorMessage('Debes leer y aceptar el pagaré para habilitar la firma.');
      return;
    }
    if (!(await validateSignatureBeforeSubmit())) {
      return;
    }
    if (!canUseOfficialDocs) {
      setErrorMessage('El pagaré aún no está disponible para este colegio.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const signedDocument = generateSignedPagarePdfBase64(contractDocumentParams, signatureImage);
      const response = await signEnrollmentMatriculaPagare(process._id, {
        signatureImage,
        signedPdfBase64: signedDocument.base64,
        fileName: signedDocument.fileName,
      });
      const nextProcess = response.data?.process || process;
      setProcess(nextProcess);
      onProcessUpdated?.(nextProcess);
      setSignatureImage('');
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo guardar la firma del pagaré.');
    } finally {
      setLoading(false);
    }
  };

  if (!open || !process) {
    return null;
  }

  const signaturePadVisible = (activeStep === 'contract' && contractAccepted)
    || (activeStep === 'pagare' && pagareAccepted);
  const shellClassName = [
    'matricula-flow-shell',
    showIntro ? 'matricula-flow-shell--intro' : '',
    blocking ? 'matricula-flow-shell--blocking' : '',
    signaturePadVisible ? 'matricula-flow-shell--signature-active' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="matricula-flow-overlay" role="presentation">
      <div
        aria-modal="true"
        className={shellClassName}
        role="dialog"
      >
        {!blocking ? (
          <button aria-label="Cerrar" className="matricula-flow-shell__close" onClick={onClose} type="button">
            ×
          </button>
        ) : onLogout ? (
          <button className="matricula-flow-shell__logout" onClick={onLogout} type="button">
            Cerrar sesión
          </button>
        ) : null}

        {showIntro ? (
          <div className="matricula-flow-intro">
            <div className="matricula-flow-intro__hero">
              <div aria-hidden="true" className="matricula-flow-intro__orb matricula-flow-intro__orb--one" />
              <div aria-hidden="true" className="matricula-flow-intro__orb matricula-flow-intro__orb--two" />
              <span className="matricula-flow-eyebrow matricula-flow-eyebrow--hero">Proceso de matrícula</span>
              <h2>Tu matrícula en 4 pasos sencillos</h2>
              <p className="matricula-flow-lead matricula-flow-lead--hero">
                Te acompañaremos paso a paso para formalizar la matrícula de
                {' '}
                <strong>{process.studentName || 'tu hijo/a'}</strong>
                .
              </p>
            </div>

            <div className="matricula-flow-intro__body">
              <ol className="matricula-flow-steps">
                {FLOW_STEPS.map((step, index) => (
                  <li
                    className="matricula-flow-steps__card"
                    key={step.key}
                    style={{ '--step-delay': `${index * 90}ms` }}
                  >
                    <span className="matricula-flow-steps__index">
                      <MatriculaStepIcon type={step.icon} />
                      <em>{index + 1}</em>
                    </span>
                    <div className="matricula-flow-steps__content">
                      <strong>{step.label}</strong>
                      <p>{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <button className="matricula-flow-primary matricula-flow-primary--intro" disabled={loading} onClick={onAckIntro} type="button">
                {loading ? 'Preparando...' : 'Entendido, continuar'}
                {!loading ? <span aria-hidden="true" className="matricula-flow-primary__arrow">→</span> : null}
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="matricula-flow-header">
              <span className="matricula-flow-eyebrow">Matrícula {process.academicYear || ''}</span>
              <h2>
                {pendingSignatureResume
                  ? 'Firma pendiente'
                  : FLOW_STEPS.find((step) => step.key === activeStep)?.label || 'Proceso de matrícula'}
              </h2>
              <div className="matricula-flow-progress">
                {FLOW_STEPS.map((step, index) => {
                  const currentIndex = FLOW_STEPS.findIndex((item) => item.key === activeStep);
                  const isComplete = activeStep === 'done' || index < currentIndex;
                  const isActive = step.key === activeStep;
                  return (
                    <span
                      className={`matricula-flow-progress__item${isComplete ? ' is-complete' : ''}${isActive ? ' is-active' : ''}`}
                      key={step.key}
                    >
                      {index + 1}
                    </span>
                  );
                })}
              </div>
            </header>

            {errorMessage ? <div className="matricula-flow-error">{errorMessage}</div> : null}

            {activeStep === 'consent' ? (
              <section className="matricula-flow-panel">
                <h3>Consentimiento Previo de Matrícula</h3>
                <p className="matricula-flow-subtitle">Declaración del Padre de Familia y/o Responsable Financiero</p>
                <p>Al continuar con el proceso de matrícula del estudiante, declaro que:</p>
                <ul className="matricula-flow-consent-list">
                  {CONSENT_DECLARATIONS.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <label className="matricula-flow-checkbox">
                  <input checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} type="checkbox" />
                  <span>He leído y acepto el Consentimiento Previo de Matrícula y autorizo continuar con el proceso de pago.</span>
                </label>
                <button className="matricula-flow-primary" disabled={loading || !consentChecked} onClick={onAcceptConsent} type="button">
                  {loading ? 'Guardando...' : 'Aceptar y continuar al pago'}
                </button>
              </section>
            ) : null}

            {activeStep === 'payment' ? (
              <section className="matricula-flow-panel">
                {hasMultiplePaymentStudents && process.payment?.status !== 'PAID' ? (
                  <label className="matricula-flow-student-select">
                    <span>Estudiante a matricular</span>
                    <select
                      disabled={loading || switchingStudent || wompiCheckoutLoading}
                      onChange={onSelectPaymentStudent}
                      value={selectedPaymentChargeId}
                    >
                      {paymentOptions.map((option) => (
                        <option key={option.chargeId} value={option.chargeId}>
                          {option.studentName}
                          {option.hasDiscount ? ' · con beneficio' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="matricula-flow-payment-card">
                  <span>Pago de matrícula</span>
                  <p className="matricula-flow-note matricula-flow-note--student">
                    {process.studentName || 'Estudiante'}
                  </p>
                  {hideEnrollmentPaymentAmount ? (
                    <p className="matricula-flow-note">El valor se mostrará en la pasarela de pago.</p>
                  ) : (
                    <strong>{formatCurrency(charge?.amount)}</strong>
                  )}
                  <p>{charge?.concept || 'Matrícula anual'}</p>
                </div>
                <p className="matricula-flow-note">
                  Estado:
                  {' '}
                  <strong>{
                    process.payment?.status === 'PAID' || process.payment?.chargePaymentId
                      ? 'Pago confirmado'
                      : 'Pendiente de pago'
                  }</strong>
                </p>
                {process.consent?.acceptedAt ? (
                  <p className="matricula-flow-note matricula-flow-note--muted">
                    Consentimiento registrado el {formatDateTime(process.consent.acceptedAt)}
                  </p>
                ) : null}
                {process.payment?.status === 'PAID' || process.payment?.chargePaymentId ? (
                  <button className="matricula-flow-primary" onClick={refreshProcess} type="button">
                    Continuar a firma de contrato
                  </button>
                ) : (
                  <>
                    <button className="matricula-flow-primary" disabled={loading || wompiCheckoutLoading || switchingStudent} onClick={onStartPayment} type="button">
                      {loading || wompiCheckoutLoading || switchingStudent ? 'Abriendo Wompi...' : 'Pagar matrícula con Wompi'}
                    </button>
                    {wompiCheckoutConfig?.reference ? (
                      <button className="matricula-flow-secondary" disabled={loading} onClick={refreshProcess} type="button">
                        Ya pagué, verificar estado
                      </button>
                    ) : null}
                    <p className="matricula-flow-note matricula-flow-note--muted">
                      Serás redirigido a la pasarela segura de Wompi en pantalla completa. El pago se confirma automáticamente al aprobarse.
                    </p>
                  </>
                )}
              </section>
            ) : null}

            {activeStep === 'contract' ? (
              <section className="matricula-flow-panel">
                {pendingSignatureResume ? (
                  <PendingSignatureIntro pendingSignatureResume={pendingSignatureResume} process={process} />
                ) : (
                  <p className="matricula-flow-note">
                    Pago confirmado por {formatCurrency(process.payment?.amount)} el {formatDateTime(process.payment?.paidAt)}.
                  </p>
                )}
                {pendingSignatureResume && process.payment?.paidAt ? (
                  <p className="matricula-flow-note matricula-flow-note--muted">
                    Pago confirmado por {formatCurrency(process.payment?.amount)} el {formatDateTime(process.payment?.paidAt)}.
                  </p>
                ) : null}
                <MatriculaContractDocumentPreview
                  contractParams={contractDocumentParams || contractParams}
                  liveSignatureImage={signatureImage}
                  schoolId={schoolId || process?.schoolId || contractParams?.schoolId}
                  schoolName={schoolName}
                  variant="contract"
                />
                <label className="matricula-flow-checkbox">
                  <input
                    checked={contractAccepted}
                    onChange={(event) => setContractAccepted(event.target.checked)}
                    type="checkbox"
                  />
                  <span>He leído el contrato y acepto los términos y condiciones suscritos en él.</span>
                </label>
                {!contractAccepted ? (
                  <p className="matricula-flow-note matricula-flow-note--muted">
                    Marca la casilla de aceptación para habilitar la firma del contrato.
                  </p>
                ) : null}
                <MatriculaSignatureZone
                  enabled={contractAccepted}
                  disabled={loading || !contractAccepted}
                  helperText="Firma con tu dedo en el recuadro para legalizar el contrato."
                  loading={loading}
                  onChange={setSignatureImage}
                  onSubmit={onSignContract}
                  submitLabel="Firmar contrato"
                  submittingLabel="Guardando firma..."
                />
              </section>
            ) : null}

            {activeStep === 'pagare' ? (
              <section className="matricula-flow-panel">
                <PendingSignatureIntro pendingSignatureResume={pendingSignatureResume} process={process} />
                <MatriculaContractDocumentPreview
                  contractParams={contractDocumentParams || contractParams}
                  liveSignatureImage={signatureImage}
                  schoolId={schoolId || process?.schoolId || contractParams?.schoolId}
                  schoolName={schoolName}
                  variant="pagare"
                />
                <label className="matricula-flow-checkbox">
                  <input
                    checked={pagareAccepted}
                    onChange={(event) => setPagareAccepted(event.target.checked)}
                    type="checkbox"
                  />
                  <span>He leído el pagaré y acepto los términos y condiciones suscritos en él.</span>
                </label>
                {!pagareAccepted ? (
                  <p className="matricula-flow-note matricula-flow-note--muted">
                    Marca la casilla de aceptación para habilitar la firma del pagaré.
                  </p>
                ) : null}
                <MatriculaSignatureZone
                  enabled={pagareAccepted}
                  disabled={loading || !pagareAccepted}
                  helperText="Firma con tu dedo en el recuadro para completar tu matrícula."
                  loading={loading}
                  onChange={setSignatureImage}
                  onSubmit={onSignPagare}
                  submitLabel="Firmar pagaré"
                  submittingLabel="Guardando firma..."
                />
              </section>
            ) : null}

            {activeStep === 'done' ? (
              <section className="matricula-flow-panel matricula-flow-panel--success">
                <h3>¡Matrícula completada!</h3>
                <p>Gracias. Hemos registrado tu consentimiento, pago y firmas digitales.</p>
                <button className="matricula-flow-primary" onClick={onClose} type="button">
                  Cerrar
                </button>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default MatriculaEnrollmentFlow;
