import { Component, useEffect, useMemo, useRef, useState } from 'react';
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
  isMillenniumSchool,
  normalizeOfficialEnrollmentContractParams,
  shouldHideParentEnrollmentPaymentAmount,
} from '../../lib/millenniumEnrollmentContracts';
import MatriculaContractDocumentPreview from './MatriculaContractDocumentPreview';
import MatriculaIdentityCapture from './MatriculaIdentityCapture';
import { evaluateSignatureImage } from './signatureValidation';
import './MatriculaEnrollmentFlow.css';
import './MatriculaIdentityCapture.css';

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

function isPaymentConfirmedForSigning(process) {
  const status = String(process?.status || '');
  if (['payment_confirmed', 'contract_pending', 'pagare_pending', 'office_payment_confirmed'].includes(status)) {
    return true;
  }
  return String(process?.payment?.status || '').toUpperCase().includes('PAID')
    || Boolean(process?.payment?.chargePaymentId);
}

function resolveActiveStep(process) {
  const canSign = isPaymentConfirmedForSigning(process);
  const nextActionType = canSign ? process?.nextSigningAction?.documentType : null;
  if (nextActionType === 'contract') return 'contract';
  if (nextActionType === 'pagare') return 'pagare';

  const status = String(process?.status || '');
  if (['intro_pending', 'consent_pending'].includes(status)) return 'consent';
  if (['consent_accepted', 'payment_pending'].includes(status)) return 'payment';
  if (['payment_confirmed', 'contract_pending', 'office_payment_confirmed'].includes(status)) return 'contract';
  if (status === 'pagare_pending') return 'pagare';
  if (status === 'completed') return 'done';
  return 'consent';
}

function buildDualParentSigners(process, contractParams) {
  const father = contractParams?.father || process?.contractParamsSnapshot?.father || {};
  const mother = contractParams?.mother || process?.contractParamsSnapshot?.mother || {};
  const signers = [];
  if (String(father.name || '').trim()) {
    signers.push({
      order: 1,
      role: 'father',
      displayName: String(father.name).trim(),
      documentNumber: String(father.documentNumber || '').trim(),
    });
  }
  if (
    String(mother.name || '').trim()
    && (
      !String(father.name || '').trim()
      || String(mother.name).trim() !== String(father.name).trim()
      || String(mother._id || '') !== String(father._id || '')
    )
  ) {
    signers.push({
      order: signers.length + 1,
      role: 'mother',
      displayName: String(mother.name).trim(),
      documentNumber: String(mother.documentNumber || '').trim(),
    });
  }
  if (!signers.length && process?.parentName) {
    signers.push({
      order: 1,
      role: 'guardian',
      displayName: process.parentName,
      documentNumber: '',
    });
  }
  return signers;
}

function resolveRequiredSignersFromProcess(process, contractParams, { dualParentSigning = false } = {}) {
  const fromApi = Array.isArray(process?.requiredSigners) ? process.requiredSigners : [];
  if (dualParentSigning) {
    const fromParents = buildDualParentSigners(process, contractParams);
    // Prefer father+mother when API still returns a single guardian (legacy serialize without schoolId).
    if (fromParents.length >= 2) {
      return fromParents;
    }
    if (fromApi.length) {
      return fromApi;
    }
    return fromParents;
  }

  if (fromApi.length) {
    return fromApi;
  }

  if (process?.parentName) {
    return [{
      order: 1,
      role: 'guardian',
      displayName: process.parentName,
      documentNumber: '',
    }];
  }

  return buildDualParentSigners(process, contractParams);
}

function compressDataUrlImage(dataUrl, { maxWidth = 900, quality = 0.72, mimeType = 'image/jpeg' } = {}) {
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

function isSignerCompleteLocal(signer, requireIdentity) {
  if (!signer?.signatureImage) return false;
  if (!requireIdentity) return true;
  // Parent API may slim identity images and only send hasSelfie/hasId* flags.
  if (signer.selfieImage && signer.idFrontImage && signer.idBackImage) {
    return true;
  }
  return Boolean(signer.hasSelfie && signer.hasIdFront && signer.hasIdBack);
}

function isPersonFullyCompleteLocal(process, signerOrder, requireIdentityOnContract) {
  return isSignerCompleteLocal(
    getSavedSignerProgress(process, 'contract', signerOrder),
    requireIdentityOnContract,
  ) && isSignerCompleteLocal(
    getSavedSignerProgress(process, 'pagare', signerOrder),
    false,
  );
}

/** Cada persona: contrato (+ identidad) → pagaré (solo firma), luego la siguiente. */
function getNextSigningActionLocal(process, contractParams, { dualParentSigning = false, requireIdentityOnContract = false } = {}) {
  if (!isPaymentConfirmedForSigning(process)) {
    return null;
  }

  if (process?.nextSigningAction?.signer && process?.nextSigningAction?.documentType) {
    return process.nextSigningAction;
  }

  const required = resolveRequiredSignersFromProcess(process, contractParams, { dualParentSigning });
  for (const signer of required) {
    const contractSaved = getSavedSignerProgress(process, 'contract', signer.order);
    if (!isSignerCompleteLocal(contractSaved, requireIdentityOnContract)) {
      return { documentType: 'contract', signer };
    }
    const pagareSaved = getSavedSignerProgress(process, 'pagare', signer.order);
    if (!isSignerCompleteLocal(pagareSaved, false)) {
      return { documentType: 'pagare', signer };
    }
  }
  return null;
}

function getNextSigner(process, documentType, contractParams, { dualParentSigning = false, requireIdentity = false } = {}) {
  // Millennium: identity only on contract; order is per-person (contract → pagaré → next person).
  if (dualParentSigning) {
    const action = getNextSigningActionLocal(process, contractParams, {
      dualParentSigning,
      requireIdentityOnContract: requireIdentity,
    });
    if (!action || action.documentType !== documentType) return null;
    return action.signer;
  }

  const required = resolveRequiredSignersFromProcess(process, contractParams, { dualParentSigning });
  const document = documentType === 'pagare' ? process?.pagare : process?.contract;
  const completedOrders = new Set(
    (Array.isArray(document?.signers) ? document.signers : [])
      .filter((signer) => isSignerCompleteLocal(signer, documentType === 'contract' && requireIdentity))
      .map((signer) => Number(signer.order))
  );
  return required.find((signer) => !completedOrders.has(Number(signer.order))) || null;
}

function emptyIdentityEvidence() {
  return { selfieImage: '', idFrontImage: '', idBackImage: '' };
}

function getSavedSignerProgress(process, documentType, signerOrder) {
  const document = documentType === 'pagare' ? process?.pagare : process?.contract;
  const signers = Array.isArray(document?.signers) ? document.signers : [];
  return signers.find((signer) => Number(signer.order) === Number(signerOrder)) || null;
}

function signerHasIdentityEvidence(saved) {
  const evidence = saved && typeof saved === 'object' ? saved : {};
  if (evidence.selfieImage && evidence.idFrontImage && evidence.idBackImage) {
    return true;
  }
  return Boolean(evidence.hasSelfie && evidence.hasIdFront && evidence.hasIdBack);
}

function hydrateSigningStateFromSaved(saved, requireIdentity) {
  if (!saved?.signatureImage) {
    return {
      signatureImage: '',
      identityEvidence: emptyIdentityEvidence(),
      signingPhase: 'idle',
      accepted: false,
    };
  }

  const identityEvidence = {
    selfieImage: saved.selfieImage || '',
    idFrontImage: saved.idFrontImage || '',
    idBackImage: saved.idBackImage || '',
  };
  const identityComplete = !requireIdentity || signerHasIdentityEvidence(saved);

  return {
    signatureImage: saved.signatureImage,
    identityEvidence,
    // Signature already on file but identity missing → jump to selfie/cédula.
    signingPhase: requireIdentity && !identityComplete ? 'identity' : 'signature',
    accepted: true,
  };
}

function SignerOrderBanner({
  requiredSigners = [],
  currentSigner = null,
  documentLabel = 'documento',
  process = null,
  documentType = 'contract',
  requireIdentity = false,
}) {
  if (!currentSigner) return null;
  const total = requiredSigners.length;
  const isFirst = Number(currentSigner.order) === 1;
  const nextAfter = requiredSigners.find((signer) => Number(signer.order) === Number(currentSigner.order) + 1);
  const saved = getSavedSignerProgress(process, documentType, currentSigner.order);
  const progressBits = [];
  if (saved?.signatureImage) progressBits.push('firma');
  if (documentType === 'contract' && requireIdentity && (saved?.selfieImage || saved?.hasSelfie)) progressBits.push('selfie');
  if (documentType === 'contract' && requireIdentity && (saved?.idFrontImage || saved?.hasIdFront)) progressBits.push('cédula frente');
  if (documentType === 'contract' && requireIdentity && (saved?.idBackImage || saved?.hasIdBack)) progressBits.push('cédula reverso');
  const identityNeeded = documentType === 'contract' && requireIdentity ? 3 : 0;
  const progressNeeded = 1 + identityNeeded;

  return (
    <div className="matricula-signer-banner">
      <strong>
        Trámite de {currentSigner.displayName}
      </strong>
      <p>
        {isFirst
          ? `Primero ${currentSigner.displayName} completa contrato y pagaré. Ahora: ${documentLabel}.`
          : `Ahora el trámite es de ${currentSigner.displayName} (${documentLabel}). Pasa el dispositivo o que entre desde su cuenta.`}
      </p>
      {progressBits.length ? (
        <p>
          Progreso guardado: {progressBits.join(', ')}.
          {progressBits.length < progressNeeded ? ' Puedes continuar más tarde desde el paso pendiente.' : ''}
        </p>
      ) : null}
      {total > 1 ? (
        <ol>
          {requiredSigners.map((signer) => {
            const done = isPersonFullyCompleteLocal(process, signer.order, Boolean(requireIdentity));
            const contractSaved = getSavedSignerProgress(process, 'contract', signer.order);
            const pagareSaved = getSavedSignerProgress(process, 'pagare', signer.order);
            const partial = Boolean(contractSaved?.signatureImage || pagareSaved?.signatureImage) && !done;
            const contractDone = isSignerCompleteLocal(contractSaved, Boolean(requireIdentity));
            const pagareDone = isSignerCompleteLocal(pagareSaved, false);
            return (
              <li key={`${signer.role}-${signer.order}`}>
                {Number(signer.order) === 1 ? 'Primero' : 'Después'}: {signer.displayName}
                {done
                  ? ' ✓ completo'
                  : partial
                    ? ` (contrato${contractDone ? ' ✓' : ''} · pagaré${pagareDone ? ' ✓' : ''})`
                    : ''}
              </li>
            );
          })}
        </ol>
      ) : null}
      {nextAfter && Number(currentSigner.order) === 1 ? (
        <p>Cuando termines contrato y pagaré, continuará {nextAfter.displayName}.</p>
      ) : null}
    </div>
  );
}

function SignerPersonChip({ signerName = '', phaseLabel = '' }) {
  if (!signerName) return null;
  return (
    <div className="matricula-signer-chip">
      <span>Persona en trámite</span>
      <strong>{signerName}</strong>
      {phaseLabel ? <em>{phaseLabel}</em> : null}
    </div>
  );
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
      // Android Chrome fires visualViewport resize often; skip no-op resizes that wipe ink.
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

    // Pointer Events cover Android/iOS/desktop more reliably than mixed touch+mouse.
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
    const context = canvas.getContext('2d');
    const { width, height } = displaySizeRef.current;
    context.clearRect(0, 0, width || canvas.offsetWidth, height || canvas.offsetHeight);
    snapshotRef.current = '';
    onChangeRef.current?.('');
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

function PendingSignatureIntro({
  process,
  pendingSignatureResume,
  requiredSigners = [],
  nextSigner = null,
  requireIdentity = false,
  requireIdentityOnContract = false,
}) {
  if (!pendingSignatureResume || !process) return null;

  const pendingLabel = process.pendingContractSignature || ['payment_confirmed', 'contract_pending'].includes(process.status)
    ? 'contrato oficial de matrícula'
    : 'pagaré';
  const onContract = process.pendingContractSignature || ['payment_confirmed', 'contract_pending'].includes(process.status);

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
      {requireIdentityOnContract ? (
        <p>
          Cada acudiente completa
          {' '}
          <strong>contrato</strong>
          {' '}
          (firma, selfie y cédula) y enseguida su
          {' '}
          <strong>pagaré</strong>
          {' '}
          (solo firma), antes de pasar al siguiente.
        </p>
      ) : (
        <p>Debes completar esta firma para finalizar el proceso de matrícula.</p>
      )}
      {onContract && requireIdentity ? (
        <p className="matricula-flow-note matricula-flow-note--muted">
          En este paso se pide selfie y cédula una sola vez.
        </p>
      ) : null}
      {!onContract && requireIdentityOnContract ? (
        <p className="matricula-flow-note matricula-flow-note--muted">
          En el pagaré solo necesitas firmar; la selfie y la cédula ya quedaron en el contrato.
        </p>
      ) : null}
      {requiredSigners.length > 1 ? (
        <ul className="matricula-flow-pending-signers">
          {requiredSigners.map((signer) => {
            const done = isPersonFullyCompleteLocal(process, signer.order, requireIdentityOnContract);
            const isCurrent = nextSigner && Number(nextSigner.order) === Number(signer.order);
            return (
              <li key={`${signer.role}-${signer.order}`} className={done ? 'is-done' : (isCurrent ? 'is-current' : '')}>
                <strong>{signer.displayName}</strong>
                {' — '}
                {done ? 'Completado' : (isCurrent ? 'En turno ahora' : 'Pendiente')}
              </li>
            );
          })}
        </ul>
      ) : null}
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
  const [identityEvidence, setIdentityEvidence] = useState(() => emptyIdentityEvidence());
  const [identityReady, setIdentityReady] = useState(false);
  const [signingPhase, setSigningPhase] = useState('idle'); // idle | signature | identity

  useEffect(() => {
    setProcess(initialProcess);
  }, [initialProcess]);

  useEffect(() => {
    setShowIntro(Boolean(startAtIntro));
  }, [startAtIntro, initialProcess?._id, pendingSignatureResume]);

  const activeStep = useMemo(() => {
    const base = resolveActiveStep(process);
    const snapshot = process?.contractParamsSnapshot || {};
    const looksMillennium = Boolean(process?.looksLikeMillennium)
      || Boolean(process?.requiresIdentityOnContract)
      || isMillenniumSchool(
        schoolName || snapshot.schoolName || '',
        schoolId || process?.schoolId || snapshot.schoolId || '',
      )
      || String(process?.schoolId || '').toLowerCase().includes('millennium')
      || String(snapshot.schoolId || '').toLowerCase().includes('millennium')
      || String(snapshot.schoolName || '').toLowerCase().includes('millennium')
      || String(snapshot.schoolName || '').toLowerCase().includes('milenium');

    if (!looksMillennium) return base;

    if (!isPaymentConfirmedForSigning(process)) {
      return base;
    }

    const action = getNextSigningActionLocal(process, snapshot, {
      dualParentSigning: true,
      requireIdentityOnContract: true,
    });
    if (action?.documentType === 'contract') return 'contract';
    if (action?.documentType === 'pagare') return 'pagare';
    if (!action && String(process?.status || '') === 'completed') return 'done';
    return base;
  }, [process, schoolId, schoolName]);

  useEffect(() => {
    if (activeStep !== 'payment') {
      setWompiCheckoutConfig(null);
      setWompiCheckoutLoading(false);
    }
  }, [activeStep, process?._id]);

  useEffect(() => {
    if (!process?._id || !isPaymentConfirmedForSigning(process)) return undefined;
    if (process?.contractParamsSnapshot?.student?.firstName && process?.contractParamsSnapshot?.schoolId) {
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await getEnrollmentMatriculaPaymentStatus(process._id);
        if (cancelled) return;
        const nextProcess = response.data?.process;
        if (nextProcess) {
          setProcess(nextProcess);
          onProcessUpdated?.(nextProcess);
        }
      } catch (_error) {
        // Keep current process; user can retry from UI.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onProcessUpdated, process?._id, process?.contractParamsSnapshot?.schoolId, process?.contractParamsSnapshot?.student?.firstName, process?.payment?.chargePaymentId, process?.payment?.status, process?.status]);

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
  const effectiveSchoolId = schoolId
    || process?.schoolId
    || contractParams?.schoolId
    || '';
  const effectiveSchoolName = schoolName
    || contractParams?.schoolName
    || process?.schoolName
    || '';
  const isMillennium = Boolean(process?.looksLikeMillennium)
    || Boolean(process?.requiresIdentityOnContract)
    || isMillenniumSchool(effectiveSchoolName, effectiveSchoolId)
    || String(process?.schoolId || '').toLowerCase().includes('millennium')
    || String(contractParams?.schoolId || '').toLowerCase().includes('millennium')
    || String(contractParams?.schoolName || '').toLowerCase().includes('millennium')
    || String(contractParams?.schoolName || '').toLowerCase().includes('milenium');
  const dualParentSigning = isMillennium;
  // Selfie + cédula solo en el contrato; el pagaré es solo firma.
  const requireIdentity = isMillennium && activeStep === 'contract';
  const requireIdentityOnContract = isMillennium || Boolean(process?.requiresIdentityOnContract);
  const hideEnrollmentPaymentAmount = shouldHideParentEnrollmentPaymentAmount({
    schoolId: effectiveSchoolId,
    schoolName: effectiveSchoolName,
  })
    && activeStep === 'payment'
    && process.payment?.status !== 'PAID';

  const requiredSigners = useMemo(
    () => resolveRequiredSignersFromProcess(process, contractParams, { dualParentSigning }),
    [process, contractParams, dualParentSigning],
  );
  const nextContractSigner = useMemo(
    () => getNextSigner(process, 'contract', contractParams, {
      dualParentSigning,
      requireIdentity: requireIdentityOnContract,
    }),
    [process, contractParams, dualParentSigning, requireIdentityOnContract],
  );
  const nextPagareSigner = useMemo(
    () => getNextSigner(process, 'pagare', contractParams, {
      dualParentSigning,
      requireIdentity: requireIdentityOnContract,
    }),
    [process, contractParams, dualParentSigning, requireIdentityOnContract],
  );
  const currentSigner = activeStep === 'pagare' ? nextPagareSigner : nextContractSigner;

  const previousSignerStepKeyRef = useRef('');
  const hydratedSignerKeyRef = useRef('');

  const applyHydratedSigningState = (saved) => {
    const hydrated = hydrateSigningStateFromSaved(saved, requireIdentity);
    setSignatureImage(hydrated.signatureImage);
    setIdentityEvidence(hydrated.identityEvidence || emptyIdentityEvidence());
    setIdentityReady(!requireIdentity || signerHasIdentityEvidence(saved) || Boolean(
      hydrated.identityEvidence?.selfieImage
      && hydrated.identityEvidence?.idFrontImage
      && hydrated.identityEvidence?.idBackImage
    ));
    setSigningPhase(hydrated.signingPhase);
    if (activeStep === 'contract') setContractAccepted(hydrated.accepted);
    if (activeStep === 'pagare') setPagareAccepted(hydrated.accepted);
  };

  const resetSigningSubflow = () => {
    setSignatureImage('');
    setIdentityEvidence(emptyIdentityEvidence());
    setIdentityReady(!requireIdentity);
    setSigningPhase('idle');
    if (activeStep === 'contract') setContractAccepted(false);
    if (activeStep === 'pagare') setPagareAccepted(false);
  };

  useEffect(() => {
    previousSignerStepKeyRef.current = '';
    hydratedSignerKeyRef.current = '';
    resetSigningSubflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar documento/proceso
  }, [activeStep, process?._id]);

  useEffect(() => {
    const signerKey = `${activeStep}|${currentSigner?.order || ''}|${currentSigner?.displayName || ''}`;
    if (!currentSigner?.displayName || (activeStep !== 'contract' && activeStep !== 'pagare')) {
      return;
    }

    const documentType = activeStep === 'pagare' ? 'pagare' : 'contract';
    const saved = getSavedSignerProgress(process, documentType, currentSigner.order);
    const hydrateKey = `${signerKey}|${saved?.signatureImage ? 'sig' : ''}|${saved?.selfieImage ? 'selfie' : ''}|${saved?.idFrontImage ? 'front' : ''}|${saved?.idBackImage ? 'back' : ''}`;

    if (previousSignerStepKeyRef.current && previousSignerStepKeyRef.current !== signerKey) {
      // Cambió de firmante: hidratar progreso guardado del nuevo (puede venir de otra ciudad/sesión).
      previousSignerStepKeyRef.current = signerKey;
      hydratedSignerKeyRef.current = hydrateKey;
      applyHydratedSigningState(saved);
      return;
    }

    previousSignerStepKeyRef.current = signerKey;

    // Primera carga o actualización remota del mismo firmante: restaurar sin borrar progreso.
    if (hydratedSignerKeyRef.current !== hydrateKey) {
      hydratedSignerKeyRef.current = hydrateKey;
      if (saved?.signatureImage) {
        applyHydratedSigningState(saved);
      }
    }
  }, [
    activeStep,
    currentSigner?.order,
    currentSigner?.displayName,
    process,
    requireIdentity,
  ]);

  useEffect(() => {
    if (!requireIdentity) {
      setIdentityReady(true);
      return;
    }
    const saved = getSavedSignerProgress(process, activeStep === 'pagare' ? 'pagare' : 'contract', currentSigner?.order);
    setIdentityReady(Boolean(
      (identityEvidence?.selfieImage
        && identityEvidence?.idFrontImage
        && identityEvidence?.idBackImage)
      || signerHasIdentityEvidence(saved)
    ));
  }, [identityEvidence, requireIdentity, process, currentSigner?.order, activeStep]);

  // Si el colegio Millennium se detecta después de marcar el check, subir al flujo con aviso.
  useEffect(() => {
    if (!requireIdentity) return;
    if (activeStep !== 'contract' || !contractAccepted) return;

    const saved = getSavedSignerProgress(process, 'contract', currentSigner?.order);
    if (saved?.signatureImage && !signerHasIdentityEvidence(saved) && signingPhase !== 'identity') {
      setSignatureImage((previous) => previous || saved.signatureImage);
      setSigningPhase('identity');
      return;
    }

    if (signingPhase === 'idle') {
      setSigningPhase('signature');
    }
  }, [requireIdentity, activeStep, contractAccepted, signingPhase, process, currentSigner?.order]);

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
      const processId = String(process?._id || process?.id || '').trim();
      const currentStatus = String(process?.status || '');

      // Already past the intro step — never trap the parent on this screen.
      if (!processId || (currentStatus && currentStatus !== 'intro_pending')) {
        setShowIntro(false);
        return;
      }

      const response = await acknowledgeEnrollmentMatriculaIntro(processId);
      const nextProcess = response.data?.process || { ...process, status: 'consent_pending' };
      setProcess(nextProcess);
      onProcessUpdated?.(nextProcess);
      setShowIntro(false);
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'No se pudo continuar.';
      setErrorMessage(message);
      // Soft-continue only if the process already moved forward on the server.
      const status = String(process?.status || '');
      if (status && status !== 'intro_pending') {
        setShowIntro(false);
      }
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

  const beginMillenniumSignerFlow = () => {
    setSigningPhase('signature');
    setIdentityEvidence(emptyIdentityEvidence());
    setIdentityReady(false);
    setSignatureImage('');
    setErrorMessage('');
  };

  const onAcceptContractTerms = (checked) => {
    setContractAccepted(checked);
    if (!checked) {
      setSigningPhase('idle');
      setSignatureImage('');
      setIdentityEvidence(emptyIdentityEvidence());
      setIdentityReady(!requireIdentity);
      return;
    }
    if (requireIdentity) {
      const saved = getSavedSignerProgress(process, 'contract', currentSigner?.order);
      if (saved?.signatureImage) {
        applyHydratedSigningState(saved);
        return;
      }
      beginMillenniumSignerFlow();
      return;
    }
    setSigningPhase('idle');
  };

  const onAcceptPagareTerms = (checked) => {
    setPagareAccepted(checked);
    if (!checked) {
      setSigningPhase('idle');
      setSignatureImage('');
      setIdentityEvidence(emptyIdentityEvidence());
      setIdentityReady(true);
      return;
    }
    // Pagaré: solo firma (sin selfie/cédula).
    const saved = getSavedSignerProgress(process, 'pagare', currentSigner?.order);
    if (saved?.signatureImage) {
      setSignatureImage(saved.signatureImage);
      setSigningPhase('signature');
      return;
    }
    setSigningPhase('idle');
  };

  const buildSignedPdfPayload = (documentType, currentSignerMeta, signatureOverride = '') => {
    const activeSignature = signatureOverride || signatureImage;
    const document = documentType === 'pagare' ? process?.pagare : process?.contract;
    const existingSigners = Array.isArray(document?.signers) ? document.signers : [];
    const firstExisting = existingSigners.find((signer) => Number(signer.order) === 1);
    const isLastSigner = Number(currentSignerMeta.order) >= requiredSigners.length;
    if (!isLastSigner) {
      return { signedPdfBase64: '', fileName: '' };
    }

    const primarySignature = Number(currentSignerMeta.order) === 1
      ? activeSignature
      : (firstExisting?.signatureImage || activeSignature);
    const secondarySignature = Number(currentSignerMeta.order) > 1 ? activeSignature : '';
    const secondaryName = Number(currentSignerMeta.order) > 1
      ? (currentSignerMeta.displayName || '')
      : (requiredSigners.find((signer) => Number(signer.order) === 2)?.displayName || '');

    if (documentType === 'pagare') {
      const signedDocument = generateSignedPagarePdfBase64(contractDocumentParams, primarySignature, {
        secondarySignatureDataUrl: secondarySignature,
        secondarySignerName: secondaryName,
      });
      return { signedPdfBase64: signedDocument.base64, fileName: signedDocument.fileName };
    }

    const signedDocument = generateSignedEnrollmentContractPdfBase64(contractDocumentParams, primarySignature, {
      secondarySignatureDataUrl: secondarySignature,
      secondarySignerName: secondaryName,
    });
    return { signedPdfBase64: signedDocument.base64, fileName: signedDocument.fileName };
  };

  const persistSignerProgress = async (documentType, {
    signatureImage: nextSignature = signatureImage,
    selfieImage = identityEvidence?.selfieImage,
    idFrontImage = identityEvidence?.idFrontImage,
    idBackImage = identityEvidence?.idBackImage,
    finalize = false,
  } = {}) => {
    if (!currentSigner) {
      throw new Error('No hay un firmante pendiente.');
    }
    if (!canUseOfficialDocs) {
      throw new Error('Los documentos de matrícula aún no están disponibles para este colegio.');
    }

    // Let the UI paint "Guardando..." before heavy PDF work.
    await new Promise((resolve) => window.setTimeout(resolve, 40));

    const needsIdentity = requireIdentityOnContract && documentType === 'contract';
    const savedCurrent = getSavedSignerProgress(process, documentType, currentSigner.order);
    const effectiveSelfie = selfieImage || savedCurrent?.selfieImage || '';
    const effectiveIdFront = idFrontImage || savedCurrent?.idFrontImage || '';
    const effectiveIdBack = idBackImage || savedCurrent?.idBackImage || '';
    const compressedSignature = await compressDataUrlImage(nextSignature, {
      maxWidth: 1000,
      quality: 0.7,
    });

    const signerComplete = Boolean(compressedSignature)
      && (!needsIdentity || Boolean(effectiveSelfie && effectiveIdFront && effectiveIdBack)
        || Boolean(savedCurrent?.hasSelfie && savedCurrent?.hasIdFront && savedCurrent?.hasIdBack));
    const othersComplete = requiredSigners
      .filter((signer) => Number(signer.order) !== Number(currentSigner.order))
      .every((signer) => {
        const saved = getSavedSignerProgress(process, documentType, signer.order);
        return isSignerCompleteLocal(saved, needsIdentity);
      });
    const shouldFinalize = finalize && signerComplete && othersComplete;

    let pdfPayload = { signedPdfBase64: '', fileName: '' };
    if (shouldFinalize) {
      try {
        pdfPayload = buildSignedPdfPayload(documentType, currentSigner, compressedSignature);
      } catch (error) {
        throw new Error(error?.message || 'No se pudo generar el PDF firmado. Intenta de nuevo.');
      }
      if (!pdfPayload.signedPdfBase64) {
        throw new Error('No se pudo generar el PDF firmado. Intenta de nuevo.');
      }
    }

    // Avoid resending large identity blobs that are already stored server-side.
    const alreadyHasIdentity = Boolean(
      (savedCurrent?.selfieImage && savedCurrent?.idFrontImage && savedCurrent?.idBackImage)
      || (savedCurrent?.hasSelfie && savedCurrent?.hasIdFront && savedCurrent?.hasIdBack)
    );

    const payload = {
      signatureImage: compressedSignature,
      signedPdfBase64: pdfPayload.signedPdfBase64,
      fileName: pdfPayload.fileName,
      signerOrder: currentSigner.order,
      displayName: currentSigner.displayName,
      role: currentSigner.role,
      selfieImage: needsIdentity && !alreadyHasIdentity ? effectiveSelfie : '',
      idFrontImage: needsIdentity && !alreadyHasIdentity ? effectiveIdFront : '',
      idBackImage: needsIdentity && !alreadyHasIdentity ? effectiveIdBack : '',
    };

    const response = documentType === 'pagare'
      ? await signEnrollmentMatriculaPagare(process._id, payload)
      : await signEnrollmentMatriculaContract(process._id, payload);

    const nextProcess = response.data?.process || process;
    setProcess(nextProcess);
    onProcessUpdated?.(nextProcess);
    return nextProcess;
  };

  const onContinueToIdentityAfterSignature = async () => {
    if (!(await validateSignatureBeforeSubmit())) {
      return;
    }
    // Move UI to identity immediately so Android doesn't sit on a blank shell
    // while the API call + camera init run.
    setSigningPhase('identity');
    setLoading(true);
    setErrorMessage('');
    try {
      await persistSignerProgress(activeStep === 'pagare' ? 'pagare' : 'contract', {
        signatureImage,
        selfieImage: '',
        idFrontImage: '',
        idBackImage: '',
        finalize: false,
      });
    } catch (error) {
      setSigningPhase('signature');
      setErrorMessage(error?.response?.data?.message || error?.message || 'No se pudo guardar la firma.');
    } finally {
      setLoading(false);
    }
  };

  const onIdentityStepComplete = async (nextEvidence, step) => {
    const safeEvidence = nextEvidence && typeof nextEvidence === 'object'
      ? nextEvidence
      : emptyIdentityEvidence();
    setIdentityEvidence(safeEvidence);
    setLoading(true);
    setErrorMessage('');
    try {
      const documentType = activeStep === 'pagare' ? 'pagare' : 'contract';
      const nextProcess = await persistSignerProgress(documentType, {
        signatureImage,
        selfieImage: safeEvidence.selfieImage,
        idFrontImage: safeEvidence.idFrontImage,
        idBackImage: safeEvidence.idBackImage,
        finalize: step === 'idBack',
      });

      const nextPending = getNextSigner(nextProcess, documentType, nextProcess?.contractParamsSnapshot || contractParams, {
        dualParentSigning,
        requireIdentity: requireIdentityOnContract,
      });
      if (!nextPending || Number(nextPending.order) !== Number(currentSigner?.order)) {
        setSignatureImage('');
        setIdentityEvidence(emptyIdentityEvidence());
        setIdentityReady(!requireIdentityOnContract);
        setSigningPhase('idle');
        if (activeStep === 'contract') setContractAccepted(false);
        if (activeStep === 'pagare') setPagareAccepted(false);
      }
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || error?.message || 'No se pudo guardar el progreso de identidad.');
    } finally {
      setLoading(false);
    }
  };

  const onSignContract = async () => {
    if (!contractAccepted) {
      setErrorMessage('Debes leer y aceptar el contrato para habilitar la firma.');
      return;
    }
    if (!currentSigner) {
      setErrorMessage('No hay un firmante pendiente para el contrato. Cierra y vuelve a abrir la matrícula, o contacta al colegio.');
      return;
    }
    if (requireIdentity && !identityReady) {
      const saved = getSavedSignerProgress(process, 'contract', currentSigner.order);
      if (saved?.signatureImage || signatureImage) {
        if (signatureImage || saved?.signatureImage) {
          setSignatureImage(signatureImage || saved.signatureImage);
        }
        setSigningPhase('identity');
        setErrorMessage(`Firma guardada. Ahora ${currentSigner.displayName} debe completar selfie y cédula para continuar.`);
        return;
      }
      setErrorMessage(`Completa la verificación de identidad de ${currentSigner.displayName || 'el firmante'} antes de firmar.`);
      return;
    }
    if (!(await validateSignatureBeforeSubmit())) {
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const nextProcess = await persistSignerProgress('contract', {
        finalize: true,
      });
      const nextPending = getNextSigner(nextProcess, 'contract', nextProcess?.contractParamsSnapshot || contractParams, {
        dualParentSigning: Boolean(nextProcess?.looksLikeMillennium) || dualParentSigning,
        requireIdentity: Boolean(nextProcess?.requiresIdentityOnContract) || requireIdentityOnContract,
      });
      const sameSignerStillPending = nextPending
        && Number(nextPending.order) === Number(currentSigner.order);

      if (sameSignerStillPending && (Boolean(nextProcess?.requiresIdentityOnContract) || requireIdentityOnContract)) {
        setSigningPhase('identity');
        setContractAccepted(true);
        setErrorMessage(`Firma guardada. Ahora completa selfie y cédula de ${currentSigner.displayName}.`);
        return;
      }

      setSignatureImage('');
      setIdentityEvidence(emptyIdentityEvidence());
      setIdentityReady(!requireIdentity);
      setSigningPhase('idle');
      setContractAccepted(false);
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
    if (!currentSigner) {
      setErrorMessage('No hay un firmante pendiente para el pagaré.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      await persistSignerProgress('pagare', {
        finalize: true,
      });
      setSignatureImage('');
      setIdentityEvidence(emptyIdentityEvidence());
      setIdentityReady(true);
      setSigningPhase('idle');
      setPagareAccepted(false);
    } catch (error) {
      setErrorMessage(error?.response?.data?.message || 'No se pudo guardar la firma del pagaré.');
    } finally {
      setLoading(false);
    }
  };

  if (!open || !process) {
    return null;
  }

  const signaturePadVisible = (
    (activeStep === 'contract' && contractAccepted && signingPhase === 'signature')
    || (activeStep === 'pagare' && pagareAccepted && signingPhase === 'signature')
    || (activeStep === 'contract' && contractAccepted && !requireIdentity)
    || (activeStep === 'pagare' && pagareAccepted && !requireIdentity)
  );
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
              {errorMessage ? <div className="matricula-flow-error matricula-flow-error--intro">{errorMessage}</div> : null}
              <button
                className="matricula-flow-primary matricula-flow-primary--intro"
                disabled={loading}
                onClick={onAckIntro}
                type="button"
              >
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
                  <PendingSignatureIntro
                    nextSigner={nextContractSigner}
                    pendingSignatureResume={pendingSignatureResume}
                    process={process}
                    requireIdentity={requireIdentity}
                    requireIdentityOnContract={requireIdentityOnContract}
                    requiredSigners={requiredSigners}
                  />
                ) : isPaymentConfirmedForSigning(process) ? (
                  <p className="matricula-flow-note">
                    Pago confirmado por {formatCurrency(process.payment?.amount)} el {formatDateTime(process.payment?.paidAt)}.
                  </p>
                ) : null}
                {pendingSignatureResume && isPaymentConfirmedForSigning(process) && process.payment?.paidAt ? (
                  <p className="matricula-flow-note matricula-flow-note--muted">
                    Pago confirmado por {formatCurrency(process.payment?.amount)} el {formatDateTime(process.payment?.paidAt)}.
                  </p>
                ) : null}
                {isMillennium ? (
                  <SignerOrderBanner
                    currentSigner={nextContractSigner}
                    documentLabel="contrato de matrícula"
                    documentType="contract"
                    process={process}
                    requireIdentity={requireIdentityOnContract}
                    requiredSigners={requiredSigners}
                  />
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
                    onChange={(event) => onAcceptContractTerms(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    He leído el contrato y acepto los términos y condiciones suscritos en él.
                  </span>
                </label>
                {!contractAccepted ? (
                  <p className="matricula-flow-note matricula-flow-note--muted">
                    Marca la casilla de aceptación para continuar.
                  </p>
                ) : null}

                {contractAccepted && nextContractSigner ? (
                  <SignerPersonChip
                    phaseLabel={
                      requireIdentity
                        ? (signingPhase === 'signature'
                          ? '1. Firma'
                          : signingPhase === 'identity'
                            ? '2. Selfie y cédula'
                            : '')
                        : 'Firma del contrato'
                    }
                    signerName={nextContractSigner.displayName}
                  />
                ) : null}

                {contractAccepted && !nextContractSigner ? (
                  <p className="matricula-flow-note matricula-flow-note--error">
                    No hay un firmante pendiente para este contrato. Cierra la ventana y vuelve a abrir la matrícula. Si el problema continúa, contacta al colegio.
                  </p>
                ) : null}

                {errorMessage && contractAccepted ? (
                  <p className="matricula-flow-note matricula-flow-note--error">{errorMessage}</p>
                ) : null}

                {contractAccepted && nextContractSigner && (!requireIdentity || signingPhase === 'signature') ? (
                  <MatriculaSignatureZone
                    enabled
                    disabled={loading}
                    helperText={
                      `${nextContractSigner.displayName}: firma con tu dedo en el recuadro.`
                    }
                    loading={loading}
                    onChange={setSignatureImage}
                    onSubmit={requireIdentity ? onContinueToIdentityAfterSignature : onSignContract}
                    submitLabel={
                      requireIdentity
                        ? `Continuar con selfie de ${nextContractSigner.displayName}`
                        : (requiredSigners.length > 1
                          ? `Firmar contrato (${nextContractSigner.displayName})`
                          : 'Firmar contrato')
                    }
                    submittingLabel={requireIdentity ? 'Validando firma...' : 'Guardando firma...'}
                  />
                ) : null}

                {contractAccepted && requireIdentity && signingPhase === 'identity' && nextContractSigner ? (
                  <>
                    <p className="matricula-flow-note matricula-flow-note--muted">
                      Cada paso se guarda automáticamente. Puedes cerrar y continuar después, o que el otro acudiente complete su parte desde otro dispositivo.
                    </p>
                    {!signatureImage ? (
                      <p className="matricula-flow-note matricula-flow-note--error">
                        Falta la firma de {nextContractSigner.displayName}. Vuelve al paso de firma antes de la selfie.
                      </p>
                    ) : null}
                    <MatriculaIdentityCapture
                      onChange={(next) => setIdentityEvidence(next || emptyIdentityEvidence())}
                      onStepComplete={onIdentityStepComplete}
                      saving={loading}
                      signerName={nextContractSigner.displayName}
                      value={identityEvidence || emptyIdentityEvidence()}
                    />
                    {signatureImage ? (
                      <button
                        className="matricula-flow-secondary"
                        disabled={loading}
                        onClick={() => setSigningPhase('signature')}
                        type="button"
                      >
                        Volver a la firma de {nextContractSigner.displayName}
                      </button>
                    ) : (
                      <button
                        className="matricula-flow-primary"
                        disabled={loading}
                        onClick={() => setSigningPhase('signature')}
                        type="button"
                      >
                        Ir a firmar ({nextContractSigner.displayName})
                      </button>
                    )}
                    {identityReady ? (
                      <button
                        className="matricula-flow-primary"
                        disabled={loading || !signatureImage}
                        onClick={onSignContract}
                        type="button"
                      >
                        {loading
                          ? 'Guardando...'
                          : `Confirmar trámite de ${nextContractSigner.displayName}`}
                      </button>
                    ) : null}
                    {errorMessage ? (
                      <p className="matricula-flow-note matricula-flow-note--error">{errorMessage}</p>
                    ) : null}
                  </>
                ) : null}
              </section>
            ) : null}

            {activeStep === 'pagare' ? (
              <section className="matricula-flow-panel">
                <PendingSignatureIntro
                  nextSigner={nextPagareSigner}
                  pendingSignatureResume={pendingSignatureResume}
                  process={process}
                  requireIdentity={false}
                  requireIdentityOnContract={requireIdentityOnContract}
                  requiredSigners={requiredSigners}
                />
                {isMillennium ? (
                  <SignerOrderBanner
                    currentSigner={nextPagareSigner}
                    documentLabel="pagaré"
                    documentType="pagare"
                    process={process}
                    requireIdentity={requireIdentityOnContract}
                    requiredSigners={requiredSigners}
                  />
                ) : null}
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
                    onChange={(event) => onAcceptPagareTerms(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    He leído el pagaré y acepto los términos y condiciones suscritos en él.
                  </span>
                </label>
                {!pagareAccepted ? (
                  <p className="matricula-flow-note matricula-flow-note--muted">
                    Marca la casilla de aceptación para continuar.
                  </p>
                ) : null}

                {pagareAccepted && nextPagareSigner ? (
                  <SignerPersonChip
                    phaseLabel="Firma del pagaré"
                    signerName={nextPagareSigner.displayName}
                  />
                ) : null}

                {errorMessage && pagareAccepted ? (
                  <p className="matricula-flow-note matricula-flow-note--error">{errorMessage}</p>
                ) : null}

                {pagareAccepted ? (
                  <MatriculaSignatureZone
                    enabled
                    disabled={loading}
                    helperText={
                      nextPagareSigner
                        ? `${nextPagareSigner.displayName}: firma con tu dedo en el recuadro.`
                        : 'Firma con tu dedo en el recuadro para completar tu matrícula.'
                    }
                    loading={loading}
                    onChange={setSignatureImage}
                    onSubmit={onSignPagare}
                    submitLabel={
                      nextPagareSigner && requiredSigners.length > 1
                        ? `Firmar pagaré (${nextPagareSigner.displayName})`
                        : 'Firmar pagaré'
                    }
                    submittingLabel="Guardando firma..."
                  />
                ) : null}
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

class MatriculaEnrollmentFlowBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Error inesperado en el flujo de matrícula.',
    };
  }

  componentDidCatch(error) {
    // Keep a console trail for Android remote debugging without crashing the shell.
    console.error('[MatriculaEnrollmentFlow]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="matricula-flow-overlay" role="presentation">
          <div aria-modal="true" className="matricula-flow-shell" role="dialog">
            <h2>No se pudo mostrar la matrícula</h2>
            <p className="matricula-flow-note matricula-flow-note--error">
              {this.state.message}
            </p>
            <p className="matricula-flow-note matricula-flow-note--muted">
              Cierra e intenta de nuevo. Si el problema continúa, reinicia la app.
            </p>
            <button
              className="matricula-flow-primary"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                this.props.onClose?.();
              }}
              type="button"
            >
              Cerrar
            </button>
          </div>
        </div>
      );
    }

    return <MatriculaEnrollmentFlow {...this.props} />;
  }
}

export default MatriculaEnrollmentFlowBoundary;
