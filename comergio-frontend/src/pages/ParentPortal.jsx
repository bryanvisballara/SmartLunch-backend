import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { Browser } from '@capacitor/browser';
import { useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth.store';
import {
  addToMeriendasWaitlist,
  askParentGioIaChat,
  cancelParentMeriendasSubscription,
  confirmParentCardVerification,
  createParentCardPaymentMethod,
  deleteParentCardPaymentMethod,
  getParentCardPaymentMethods,
  getParentMeriendasPortal,
  getParentPortalCategories,
  getParentPortalOrdersHistory,
  getParentPortalOverview,
  requestParentCardVerification,
  subscribeParentMeriendas,
  updateParentMeriendasSubscription,
  updateParentPortalStudentBlock,
  updateParentPortalStudentDailyLimit,
  updateParentPortalStudentGrade,
  updateParentPortalStudentAutoDebit,
} from '../services/parent.service';
import {
  createBoldRechargePayment,
  createEpaycoRechargePayment,
  getBoldPseBanks,
  getBoldRechargeStatus,
  getEpaycoRechargeStatus,
} from '../services/payments.service';
import { getProducts } from '../services/products.service';
import bancolombiaLogo from '../assets/bancolombia.png';
import brebLogo from '../assets/breb.png';
import pseLogo from '../assets/PSE.png';
import warningLogo from '../assets/warning.png';
import smartLogo from '../assets/comergio.png';

function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatSignedCurrency(value) {
  const amount = Number(value || 0);
  const absAmount = Math.abs(amount);
  const prefix = amount < 0 ? '-' : '+';
  return `${prefix} ${formatCurrency(absAmount)}`;
}

function BoldResultContent() {
  const params = new URLSearchParams(window.location.search);
  const txStatus = String(params.get('bold-tx-status') || '').toLowerCase();
  const orderId = String(params.get('bold-order-id') || '');

  if (txStatus === 'approved') {
    return (
      <div className="parent-topup-davi-fee-box">
        <p style={{ fontWeight: 'bold', color: '#22c55e' }}>¡Pago exitoso!</p>
        <p>Tu recarga está siendo procesada. El saldo se acreditará en unos instantes.</p>
        {orderId ? <p style={{ fontSize: '0.8rem', color: '#888' }}>Referencia: {orderId}</p> : null}
      </div>
    );
  }

  if (txStatus === 'rejected' || txStatus === 'failed' || txStatus === 'denied') {
    return (
      <div className="parent-topup-davi-fee-box">
        <p style={{ fontWeight: 'bold', color: '#ef4444' }}>Pago rechazado</p>
        <p>No fue posible procesar tu pago. Por favor intenta de nuevo.</p>
      </div>
    );
  }

  return (
    <div className="parent-topup-davi-fee-box">
      <p style={{ fontWeight: 'bold' }}>Pago en proceso</p>
      <p>Tu pago está siendo verificado. Recibirás una confirmación pronto.</p>
      {orderId ? <p style={{ fontSize: '0.8rem', color: '#888' }}>Referencia: {orderId}</p> : null}
    </div>
  );
}

function buildBoldDeviceFingerprint() {
  const userAgent = String(window.navigator?.userAgent || '').trim();
  const platform = String(window.navigator?.platform || '').trim();
  const language = String(window.navigator?.language || 'es-CO').trim();
  const javaEnabled = typeof window.navigator?.javaEnabled === 'function'
    ? Boolean(window.navigator.javaEnabled())
    : false;
  const browser = userAgent.includes('Chrome')
    ? 'Chrome'
    : userAgent.includes('Safari')
      ? 'Safari'
      : userAgent.includes('Firefox')
        ? 'Firefox'
        : 'Unknown';
  const mobile = /android|iphone|ipad|ipod/i.test(userAgent);

  return {
    device_type: mobile ? 'SMARTPHONE' : 'DESKTOP',
    os: platform || 'Unknown',
    model: '',
    browser,
    java_enabled: javaEnabled,
    language,
    color_depth: Number(window.screen?.colorDepth || 24),
    screen_height: Number(window.screen?.height || 0),
    screen_width: Number(window.screen?.width || 0),
    time_zone_offset: Number(new Date().getTimezoneOffset() * -1),
    user_agent: userAgent,
    platform,
  };
}

let epaycoCheckoutScriptPromise = null;

function loadEpaycoCheckoutScript() {
  if (window.ePayco?.checkout?.configure) {
    return Promise.resolve(window.ePayco);
  }

  if (!epaycoCheckoutScriptPromise) {
    epaycoCheckoutScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-epayco-checkout="true"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.ePayco));
        existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar checkout.js de ePayco.')));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://checkout.epayco.co/checkout.js';
      script.async = true;
      script.dataset.epaycoCheckout = 'true';
      script.onload = () => {
        if (window.ePayco?.checkout?.configure) {
          resolve(window.ePayco);
          return;
        }

        reject(new Error('ePayco no quedó disponible después de cargar checkout.js.'));
      };
      script.onerror = () => reject(new Error('No se pudo cargar checkout.js de ePayco.'));
      document.body.appendChild(script);
    });
  }

  return epaycoCheckoutScriptPromise;
}

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseYearMonth(value) {
  const fallback = currentYearMonth();
  const [yearText, monthText] = String(value || fallback).split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const [fallbackYear, fallbackMonth] = fallback.split('-');
    return {
      year: Number(fallbackYear),
      month: Number(fallbackMonth),
    };
  }

  return { year, month };
}

function dedupeParentMenuProducts(products) {
  const map = new Map();

  for (const product of Array.isArray(products) ? products : []) {
    const name = String(product?.name || '').trim().toLowerCase();
    const categoryId = String(product?.categoryId || '').trim();
    const price = Number(product?.price || 0);
    const imageUrl = String(product?.imageUrl || '').trim();
    const thumbUrl = String(product?.thumbUrl || '').trim();
    const shortDescription = String(product?.shortDescription || '').trim().toLowerCase();
    const key = `${name}|${categoryId}|${price}|${thumbUrl}|${imageUrl}|${shortDescription}`;

    if (!map.has(key)) {
      map.set(key, product);
    }
  }

  return Array.from(map.values());
}

function ParentPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const [overview, setOverview] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [childrenOpen, setChildrenOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState('');
  const [menuProducts, setMenuProducts] = useState([]);
  const [menuProductsLoading, setMenuProductsLoading] = useState(false);
  const [menuProductsError, setMenuProductsError] = useState('');
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyOrdersLoading, setHistoryOrdersLoading] = useState(false);
  const [historyOrdersError, setHistoryOrdersError] = useState('');
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [historyFilters, setHistoryFilters] = useState({ from: '', to: '' });
  const [blockActionError, setBlockActionError] = useState('');
  const [blockingTargetKey, setBlockingTargetKey] = useState('');
  const [dailyLimitDraft, setDailyLimitDraft] = useState('0');
  const [dailyLimitSaving, setDailyLimitSaving] = useState(false);
  const [dailyLimitError, setDailyLimitError] = useState('');
  const [gradeDraft, setGradeDraft] = useState('');
  const [gradeSaving, setGradeSaving] = useState(false);
  const [gradeError, setGradeError] = useState('');
  const [gradeEditOpen, setGradeEditOpen] = useState(false);
  const [daviAmount, setDaviAmount] = useState('');
  const [daviSubmitLoading, setDaviSubmitLoading] = useState(false);
  const [daviSubmitError, setDaviSubmitError] = useState('');
  const [daviSubmitSuccess, setDaviSubmitSuccess] = useState('');
  const [showBoldCardForm, setShowBoldCardForm] = useState(false);
  const [isBoldCardFormClosing, setIsBoldCardFormClosing] = useState(false);
  const [boldTopupCardNumber, setBoldTopupCardNumber] = useState('');
  const [boldTopupCardExpiry, setBoldTopupCardExpiry] = useState('');
  const [boldTopupCardCvv, setBoldTopupCardCvv] = useState('');
  const [boldTopupCardholderName, setBoldTopupCardholderName] = useState('');
  const [epaycoAmount, setEpaycoAmount] = useState('');
  const [epaycoSubmitLoading, setEpaycoSubmitLoading] = useState(false);
  const [epaycoSubmitError, setEpaycoSubmitError] = useState('');
  const [epaycoSubmitSuccess, setEpaycoSubmitSuccess] = useState('');
  const [nequiAmount, setNequiAmount] = useState('');
  const [nequiSubmitLoading, setNequiSubmitLoading] = useState(false);
  const [nequiSubmitError, setNequiSubmitError] = useState('');
  const [nequiSubmitSuccess, setNequiSubmitSuccess] = useState('');
  const [pseAmount, setPseAmount] = useState('');
  const [pseBanks, setPseBanks] = useState([]);
  const [pseBanksLoading, setPseBanksLoading] = useState(false);
  const [pseSelectedBankCode, setPseSelectedBankCode] = useState('');
  const [pseSubmitLoading, setPseSubmitLoading] = useState(false);
  const [pseSubmitError, setPseSubmitError] = useState('');
  const [pseSubmitSuccess, setPseSubmitSuccess] = useState('');
  const [bancolombiaAmount, setBancolombiaAmount] = useState('');
  const [bancolombiaSubmitLoading, setBancolombiaSubmitLoading] = useState(false);
  const [bancolombiaSubmitError, setBancolombiaSubmitError] = useState('');
  const [bancolombiaSubmitSuccess, setBancolombiaSubmitSuccess] = useState('');
  const [brebAmount, setBrebAmount] = useState('');
  const [brebSubmitLoading, setBrebSubmitLoading] = useState(false);
  const [brebSubmitError, setBrebSubmitError] = useState('');
  const [brebSubmitSuccess, setBrebSubmitSuccess] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardFirstName, setCardFirstName] = useState('');
  const [cardLastName, setCardLastName] = useState('');
  const [cardDocType, setCardDocType] = useState('CC');
  const [cardDocument, setCardDocument] = useState('');
  const [addCardLoading, setAddCardLoading] = useState(false);
  const [addCardError, setAddCardError] = useState('');
  const [addCardSuccess, setAddCardSuccess] = useState('');
  const [manualCardEntryEnabled, setManualCardEntryEnabled] = useState(false);
  const [cardMenuOpenId, setCardMenuOpenId] = useState('');
  const [deletingCardId, setDeletingCardId] = useState('');
  const [autoTopupMinBalance, setAutoTopupMinBalance] = useState('');
  const [autoTopupPresetAmount, setAutoTopupPresetAmount] = useState(50000);
  const [autoTopupCustomAmount, setAutoTopupCustomAmount] = useState('');
  const [autoTopupSelectedCardId, setAutoTopupSelectedCardId] = useState('');
  const [autoTopupCardPickerOpen, setAutoTopupCardPickerOpen] = useState(false);
  const [autoTopupSubmitLoading, setAutoTopupSubmitLoading] = useState(false);
  const [autoTopupSubmitError, setAutoTopupSubmitError] = useState('');
  const [autoTopupSubmitSuccess, setAutoTopupSubmitSuccess] = useState('');
  const [autoTopupAuthorizationLoading, setAutoTopupAuthorizationLoading] = useState(false);
  const [autoTopupPendingAuthorizationUrl, setAutoTopupPendingAuthorizationUrl] = useState('');
  const [autoTopupPendingPreapprovalId, setAutoTopupPendingPreapprovalId] = useState('');
  const [autoDebitMenuOpen, setAutoDebitMenuOpen] = useState(false);
  const [autoDebitCancelLoading, setAutoDebitCancelLoading] = useState(false);
  const autoDebitMenuRef = useRef(null);
  const autoTopupAuthProcessedRef = useRef('');
  const [showAutoTopupCongratsModal, setShowAutoTopupCongratsModal] = useState(false);
  const [autoTopupCongratsStudentName, setAutoTopupCongratsStudentName] = useState('');
  const [savedCards, setSavedCards] = useState([]);
  const [savedCardsLoading, setSavedCardsLoading] = useState(false);
  const [savedCardsError, setSavedCardsError] = useState('');
  const [showCardVerificationModal, setShowCardVerificationModal] = useState(false);
  const [cardVerificationStep, setCardVerificationStep] = useState('intro');
  const [cardVerificationCardId, setCardVerificationCardId] = useState('');
  const [cardVerificationCardLabel, setCardVerificationCardLabel] = useState('');
  const [cardVerificationAmount, setCardVerificationAmount] = useState('');
  const [cardVerificationSubmitting, setCardVerificationSubmitting] = useState(false);
  const [cardVerificationError, setCardVerificationError] = useState('');
  const [cardVerificationSuccess, setCardVerificationSuccess] = useState('');
  const [cardVerificationExpiresAt, setCardVerificationExpiresAt] = useState('');
  const [meriendasData, setMeriendasData] = useState(null);
  const [meriendasLoading, setMeriendasLoading] = useState(false);
  const [meriendasError, setMeriendasError] = useState('');
  const [meriendasRestrictionsText, setMeriendasRestrictionsText] = useState('');
  const [meriendasRestrictionReason, setMeriendasRestrictionReason] = useState('');
  const [meriendasParentComments, setMeriendasParentComments] = useState('');
  const [meriendasSubmitLoading, setMeriendasSubmitLoading] = useState(false);
  const [meriendasSubmitError, setMeriendasSubmitError] = useState('');
  const [meriendasSubmitSuccess, setMeriendasSubmitSuccess] = useState('');
  const [meriendasStatusMenuOpen, setMeriendasStatusMenuOpen] = useState(false);
  const [showMeriendasCancelModal, setShowMeriendasCancelModal] = useState(false);
  const [showWaitlistSuccessModal, setShowWaitlistSuccessModal] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [waitlistSuccessMessage, setWaitlistSuccessMessage] = useState('');
  const [walletReturnNotice, setWalletReturnNotice] = useState(null);
  const [gioMessages, setGioMessages] = useState([
    {
      role: 'assistant',
      content: 'Hola, soy GIO - IA. Pregúntame sobre el consumo de tu hijo: por fecha, promedio o tendencias.',
    },
  ]);
  const [gioInput, setGioInput] = useState('');
  const [gioSending, setGioSending] = useState(false);
  const [gioError, setGioError] = useState('');
  const [gioContext, setGioContext] = useState(null);
  const gioThreadEndRef = useRef(null);
  const processedPaymentReturnKeyRef = useRef('');

  const isMenuRoute = location.pathname === '/parent/menu' || location.pathname.startsWith('/parent/menu/');
  const isTopupsPage = location.pathname === '/parent/recargas';
  const isTopupMethodsPage = location.pathname === '/parent/recargas/metodos';
  const isTopupDaviPlataPage = location.pathname === '/parent/recargas/metodos/daviplata';
  const isTopupEpaycoPage = location.pathname === '/parent/recargas/metodos/epayco';
  const isTopupNequiPage = location.pathname === '/parent/recargas/metodos/nequi';
  const isBoldResultPage = location.pathname === '/parent/bold-resultado';
  const isTopupPsePage = location.pathname === '/parent/recargas/metodos/pse';
  const isTopupBancolombiaPage = location.pathname === '/parent/recargas/metodos/bancolombia';
  const isTopupBrebPage = location.pathname === '/parent/recargas/metodos/breb';
  const isAddCardPage = location.pathname === '/parent/recargas/agregar-tarjeta';
  const isAutoTopupPage = location.pathname === '/parent/recargas/automatica';
  const isMeriendasDayPage = /^\/parent\/meriendas\/dia\/\d+$/.test(location.pathname);
  const isMeriendasPage = location.pathname === '/parent/meriendas';
  const isHistoryPage = location.pathname === '/parent/historial-ordenes';
  const isLimitPage = location.pathname === '/parent/limitar-consumo';
  const isGioIaPage = location.pathname === '/parent/gio-ia';
  const menuCategoryId = useMemo(() => {
    const prefix = '/parent/menu/';
    if (!location.pathname.startsWith(prefix)) {
      return '';
    }
    return decodeURIComponent(location.pathname.slice(prefix.length));
  }, [location.pathname]);
  const isMenuPage = isMenuRoute && !menuCategoryId;
  const isMenuProductsPage = Boolean(menuCategoryId);

  const selectedStudent = overview?.selectedStudent || null;
  const selectedStudentFirstName = String(selectedStudent?.name || 'tu hijo').trim().split(/\s+/)[0] || 'tu hijo';
  const blockedCategoryIds = useMemo(
    () => new Set((selectedStudent?.blockedCategories || []).map((item) => String(item._id || item))),
    [selectedStudent?.blockedCategories]
  );
  const blockedProductIds = useMemo(
    () => new Set((selectedStudent?.blockedProducts || []).map((item) => String(item._id || item))),
    [selectedStudent?.blockedProducts]
  );

  const headerName = useMemo(() => {
    const source = overview?.parent?.name || user?.name || user?.username || 'Padre';
    return String(source).split(' ')[0] || 'Padre';
  }, [overview?.parent?.name, user?.name, user?.username]);

  const parentInitial = String(overview?.parent?.name || user?.name || user?.username || 'P').charAt(0).toUpperCase();
  const minimumBoldRecharge = 20000;
  const rechargeFeeRate = 0.015;
  const daviAmountNumber = Number(daviAmount || 0);
  const daviFeeAmount = Number.isFinite(daviAmountNumber) && daviAmountNumber > 0
    ? Math.round(daviAmountNumber * rechargeFeeRate)
    : 0;
  const daviTotalCharge = Number.isFinite(daviAmountNumber) && daviAmountNumber > 0
    ? daviAmountNumber + daviFeeAmount
    : 0;
  const epaycoAmountNumber = Number(epaycoAmount || 0);
  const epaycoFeeAmount = Number.isFinite(epaycoAmountNumber) && epaycoAmountNumber > 0
    ? Math.round(epaycoAmountNumber * rechargeFeeRate)
    : 0;
  const epaycoTotalCharge = Number.isFinite(epaycoAmountNumber) && epaycoAmountNumber > 0
    ? epaycoAmountNumber + epaycoFeeAmount
    : 0;
  const nequiAmountNumber = Number(nequiAmount || 0);
  const nequiFeeAmount = Number.isFinite(nequiAmountNumber) && nequiAmountNumber > 0
    ? Math.round(nequiAmountNumber * rechargeFeeRate)
    : 0;
  const nequiTotalCharge = Number.isFinite(nequiAmountNumber) && nequiAmountNumber > 0
    ? nequiAmountNumber + nequiFeeAmount
    : 0;
  const pseAmountNumber = Number(pseAmount || 0);
  const pseFeeAmount = Number.isFinite(pseAmountNumber) && pseAmountNumber > 0
    ? Math.round(pseAmountNumber * rechargeFeeRate)
    : 0;
  const pseTotalCharge = Number.isFinite(pseAmountNumber) && pseAmountNumber > 0
    ? pseAmountNumber + pseFeeAmount
    : 0;
  const pseSelectedBank = pseBanks.find((bank) => String(bank.bankCode) === String(pseSelectedBankCode)) || null;
  const bancolombiaAmountNumber = Number(bancolombiaAmount || 0);
  const bancolombiaFeeAmount = Number.isFinite(bancolombiaAmountNumber) && bancolombiaAmountNumber > 0
    ? Math.round(bancolombiaAmountNumber * rechargeFeeRate)
    : 0;
  const bancolombiaTotalCharge = Number.isFinite(bancolombiaAmountNumber) && bancolombiaAmountNumber > 0
    ? bancolombiaAmountNumber + bancolombiaFeeAmount
    : 0;
  const brebAmountNumber = Number(brebAmount || 0);
  const brebFeeAmount = Number.isFinite(brebAmountNumber) && brebAmountNumber > 0
    ? Math.round(brebAmountNumber * rechargeFeeRate)
    : 0;
  const brebTotalCharge = Number.isFinite(brebAmountNumber) && brebAmountNumber > 0
    ? brebAmountNumber + brebFeeAmount
    : 0;
  const canContinueDaviRecharge = Boolean(
    Number.isFinite(daviAmountNumber) &&
    daviAmountNumber >= minimumBoldRecharge
  );
  const canContinueEpaycoRecharge = Boolean(
    Number.isFinite(epaycoAmountNumber) &&
    epaycoAmountNumber >= minimumBoldRecharge
  );
  const canContinueNequiRecharge = Boolean(
    Number.isFinite(nequiAmountNumber) &&
    nequiAmountNumber >= minimumBoldRecharge &&
    nequiDocumentDigits.length >= 5
  );
  const boldTopupCardDigits = String(boldTopupCardNumber || '').replace(/\D/g, '');
  const boldTopupExpiryDigits = String(boldTopupCardExpiry || '').replace(/\D/g, '');
  const boldTopupCvvDigits = String(boldTopupCardCvv || '').replace(/\D/g, '');
  const canSubmitBoldCardDetails = Boolean(
    boldTopupCardDigits.length >= 13 &&
    boldTopupCardDigits.length <= 19 &&
    boldTopupExpiryDigits.length === 4 &&
    boldTopupCvvDigits.length >= 3 &&
    boldTopupCvvDigits.length <= 4 &&
    String(boldTopupCardholderName || '').trim().length >= 5
  );
  const canContinuePseRecharge = Boolean(
    Number.isFinite(pseAmountNumber) &&
    pseAmountNumber >= minimumBoldRecharge &&
    pseSelectedBank
  );
  const canContinueBancolombiaRecharge = Boolean(
    Number.isFinite(bancolombiaAmountNumber) &&
    bancolombiaAmountNumber >= minimumBoldRecharge
  );
  const canContinueBrebRecharge = Boolean(
    Number.isFinite(brebAmountNumber) && brebAmountNumber > 0
  );
  const cardDigits = String(cardNumber || '').replace(/\D/g, '');
  const cardExpiryDigits = String(cardExpiry || '').replace(/\D/g, '');
  const cardCvvDigits = String(cardCvv || '').replace(/\D/g, '');
  const cardDocumentDigits = String(cardDocument || '').replace(/\D/g, '');
  const canContinueAddCard = Boolean(
    cardDigits.length >= 13 &&
    cardDigits.length <= 19 &&
    cardExpiryDigits.length === 4 &&
    cardCvvDigits.length >= 3 &&
    cardCvvDigits.length <= 4 &&
    String(cardFirstName || '').trim().length >= 2 &&
    String(cardLastName || '').trim().length >= 2 &&
    cardDocumentDigits.length >= 5
  );
  const autoTopupPresetOptions = [30000, 50000, 100000];
  const autoTopupMinBalanceNumber = Number(autoTopupMinBalance || 0);
  const autoTopupCustomAmountNumber = Number(autoTopupCustomAmount || 0);
  const autoTopupRechargeAmount = autoTopupPresetAmount === 0 ? autoTopupCustomAmountNumber : autoTopupPresetAmount;
  const autoDebitLimitConfigured = Number(selectedStudent?.wallet?.autoDebitLimit || 0);
  const showAutoDebitEstablishedNotice = Boolean(
    selectedStudent?.wallet?.autoDebitEnabled &&
    Number.isFinite(autoDebitLimitConfigured) &&
    autoDebitLimitConfigured > 0
  );
  const autoTopupFeeAmount = Number.isFinite(autoTopupRechargeAmount) && autoTopupRechargeAmount > 0
    ? Math.round(autoTopupRechargeAmount * rechargeFeeRate)
    : 0;
  const verifiedSavedCards = useMemo(
    () => savedCards.filter((card) => {
      const status = String(card?.verificationStatus || 'verified').toLowerCase();
      const provider = String(card?.provider || '').toLowerCase();
      return status === 'verified' && provider === 'epayco';
    }),
    [savedCards]
  );
  const autoTopupSelectedCard = verifiedSavedCards.find((card) => String(card._id) === String(autoTopupSelectedCardId)) || null;
  const canActivateAutoTopup = Boolean(
    autoTopupSelectedCardId &&
    Number.isFinite(autoTopupMinBalanceNumber) &&
    autoTopupMinBalanceNumber >= 20000 &&
    Number.isFinite(autoTopupRechargeAmount) &&
    autoTopupRechargeAmount >= 20000
  );

  useEffect(() => {
    if (!autoDebitMenuOpen) {
      return undefined;
    }

    const onDocumentMouseDown = (event) => {
      if (autoDebitMenuRef.current && !autoDebitMenuRef.current.contains(event.target)) {
        setAutoDebitMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
    };
  }, [autoDebitMenuOpen]);

      useEffect(() => {
        if (!isTopupMethodsPage) {
          return;
        }

        navigate('/parent/recargas/metodos/epayco', { replace: true });
      }, [isTopupMethodsPage, navigate]);

  useEffect(() => {
    setAutoDebitMenuOpen(false);
  }, [location.pathname, selectedStudent?._id]);

  const meriendaSubscription = meriendasData?.subscription || null;
  const isMeriendasSubscribed = Boolean(meriendaSubscription?.active);
  const meriendaScheduleDays = useMemo(
    () => (Array.isArray(meriendasData?.schedule?.days) ? meriendasData.schedule.days : []),
    [meriendasData?.schedule?.days]
  );
  const meriendaScheduleMonth = meriendasData?.month || currentYearMonth();
  const parsedMeriendasMonth = useMemo(() => parseYearMonth(meriendaScheduleMonth), [meriendaScheduleMonth]);
  const meriendaMonthLabel = useMemo(() => {
    const monthDate = new Date(parsedMeriendasMonth.year, parsedMeriendasMonth.month - 1, 1);
    const label = new Intl.DateTimeFormat('es-CO', {
      month: 'long',
      year: 'numeric',
    }).format(monthDate);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [parsedMeriendasMonth.month, parsedMeriendasMonth.year]);
  const meriendaCalendarWeekdays = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const selectedMeriendaDay = useMemo(() => {
    if (!isMeriendasDayPage) {
      return null;
    }

    const matched = location.pathname.match(/\/parent\/meriendas\/dia\/(\d+)$/);
    if (!matched) {
      return null;
    }

    const dayNumber = Number(matched[1]);
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
      return null;
    }

    return dayNumber;
  }, [isMeriendasDayPage, location.pathname]);
  const meriendaCalendarCells = useMemo(() => {
    const { year, month } = parsedMeriendasMonth;
    const startDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysMap = new Map(
      meriendaScheduleDays
        .filter((item) => Number.isInteger(Number(item?.day)))
        .map((item) => [Number(item.day), item])
    );
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();
    const cells = [];

    for (let i = 0; i < startDay; i += 1) {
      cells.push({ empty: true, key: `empty-start-${i}` });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        empty: false,
        key: `day-${day}`,
        day,
        item: daysMap.get(day) || null,
        isToday: day === todayDay && month === todayMonth && year === todayYear,
      });
    }

    const remaining = cells.length % 7;
    if (remaining > 0) {
      for (let i = 0; i < 7 - remaining; i += 1) {
        cells.push({ empty: true, key: `empty-end-${i}` });
      }
    }

    return cells;
  }, [meriendaScheduleDays, parsedMeriendasMonth]);
  const selectedMeriendaDayDetails = useMemo(
    () => meriendaScheduleDays.find((item) => Number(item?.day) === Number(selectedMeriendaDay)) || null,
    [meriendaScheduleDays, selectedMeriendaDay]
  );
  const canSubmitMeriendas = Boolean(selectedStudentId);

  const getCardBrandLabel = (brand) => {
    const normalized = String(brand || '').toLowerCase();
    if (normalized === 'visa') return 'Visa';
    if (normalized === 'mastercard') return 'Mastercard';
    if (normalized === 'amex') return 'American Express';
    if (normalized === 'discover') return 'Discover';
    return 'Tarjeta';
  };

  useEffect(() => {
    setDailyLimitDraft(String(Number(selectedStudent?.dailyLimit || 0)));
    setDailyLimitError('');
    setGradeDraft(String(selectedStudent?.grade || ''));
    setGradeError('');
    setGradeEditOpen(false);
  }, [selectedStudent?._id, selectedStudent?.dailyLimit, selectedStudent?.grade]);

  const loadOverview = async (studentId = '') => {
    setLoading(true);
    setError('');

    try {
      const response = await getParentPortalOverview(studentId ? { studentId } : {});
      const payload = response.data;
      setOverview(payload);

      if (!studentId && payload?.selectedStudentId) {
        setSelectedStudentId(String(payload.selectedStudentId));
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo cargar el portal del padre.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview('');
  }, []);

  useEffect(() => {
    if ((location.pathname !== '/parent' && location.pathname !== '/parent/recargas') || loading || error) {
      return;
    }

    const params = new URLSearchParams(location.search || '');
    const queryStudentId = String(params.get('studentId') || '').trim();

    if (!queryStudentId) {
      return;
    }

    const currentStudentId = String(selectedStudent?._id || selectedStudentId || '').trim();
    if (currentStudentId === queryStudentId) {
      return;
    }

    setSelectedStudentId(queryStudentId);
    loadOverview(queryStudentId);
  }, [location.pathname, location.search, loading, error, selectedStudent?._id, selectedStudentId]);

  useEffect(() => {
    if ((location.pathname !== '/parent' && location.pathname !== '/parent/recargas') || loading || error) {
      return;
    }

    const params = new URLSearchParams(location.search || '');
    const paymentSource = String(params.get('paymentSource') || '').trim().toLowerCase();
    const paymentReference = String(params.get('paymentReference') || '').trim();
    const paymentStatus = String(params.get('paymentStatus') || '').trim().toLowerCase();
    const queryStudentId = String(params.get('studentId') || '').trim();

    if (paymentSource !== 'bold' || !paymentReference) {
      return;
    }

    const processKey = `bold|${queryStudentId}|${paymentReference}|${paymentStatus}`;
    if (processedPaymentReturnKeyRef.current === processKey) {
      return;
    }

    processedPaymentReturnKeyRef.current = processKey;

    let cancelled = false;

    const buildParentUrl = () => {
      const nextParams = new URLSearchParams();
      if (queryStudentId) {
        nextParams.set('studentId', queryStudentId);
      }
      const query = nextParams.toString();
      return query ? `/parent/recargas?${query}` : '/parent/recargas';
    };

    const finishReturn = (notice) => {
      if (cancelled) {
        return;
      }

      setWalletReturnNotice(notice);
      navigate(buildParentUrl(), { replace: true });
    };

    const syncBoldReturn = async () => {
      if (queryStudentId) {
        setSelectedStudentId(queryStudentId);
        await loadOverview(queryStudentId);
      }

      if (paymentStatus === 'rejected' || paymentStatus === 'failed' || paymentStatus === 'denied') {
        finishReturn({
          type: 'error',
          message: 'El pago con Bold no fue aprobado. La billetera no recibió saldo nuevo.',
        });
        return;
      }

      setWalletReturnNotice({
        type: 'info',
        message: 'Estamos confirmando tu recarga con Bold y actualizando el saldo de la billetera.',
      });

      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (cancelled) {
          return;
        }

        try {
          const response = await getBoldRechargeStatus(paymentReference);
          const status = String(response.data?.status || '').trim().toLowerCase();
          const responseStudentId = String(response.data?.studentId || queryStudentId).trim();

          if (status === 'approved') {
            if (responseStudentId) {
              setSelectedStudentId(responseStudentId);
              await loadOverview(responseStudentId);
            }

            finishReturn({
              type: 'success',
              message: 'La recarga fue acreditada correctamente. Ya actualizamos el saldo de la billetera.',
            });
            return;
          }

          if (status === 'rejected' || status === 'failed') {
            finishReturn({
              type: 'error',
              message: 'El pago con Bold no fue aprobado. Revisa el estado e intenta de nuevo si es necesario.',
            });
            return;
          }
        } catch (requestError) {
          if (attempt === 7) {
            finishReturn({
              type: 'info',
              message: requestError?.response?.data?.message || 'No pudimos confirmar la recarga todavía. Vuelve a revisar la billetera en unos segundos.',
            });
            return;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1800));
      }

      finishReturn({
        type: 'info',
        message: 'Seguimos verificando la recarga. Si el saldo aún no cambia, vuelve a entrar en unos segundos.',
      });
    };

    syncBoldReturn();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, loading, error, navigate]);

  useEffect(() => {
    if ((location.pathname !== '/parent' && location.pathname !== '/parent/recargas') || loading || error) {
      return;
    }

    const params = new URLSearchParams(location.search || '');
    const paymentSource = String(params.get('paymentSource') || '').trim().toLowerCase();
    const paymentReference = String(params.get('paymentReference') || '').trim();
    const paymentStatus = String(params.get('paymentStatus') || '').trim().toLowerCase();
    const queryStudentId = String(params.get('studentId') || '').trim();

    if (paymentSource !== 'epayco' || !paymentReference) {
      return;
    }

    const processKey = `epayco|${queryStudentId}|${paymentReference}|${paymentStatus}`;
    if (processedPaymentReturnKeyRef.current === processKey) {
      return;
    }

    processedPaymentReturnKeyRef.current = processKey;

    let cancelled = false;

    const buildParentUrl = () => {
      const nextParams = new URLSearchParams();
      if (queryStudentId) {
        nextParams.set('studentId', queryStudentId);
      }
      const query = nextParams.toString();
      return query ? `/parent/recargas?${query}` : '/parent/recargas';
    };

    const finishReturn = (notice) => {
      if (cancelled) {
        return;
      }

      setWalletReturnNotice(notice);
      navigate(buildParentUrl(), { replace: true });
    };

    const syncEpaycoReturn = async () => {
      if (['rejected', 'failed', 'denied', 'cancelled', 'canceled', 'abandoned'].includes(paymentStatus)) {
        finishReturn({
          type: 'error',
          message: 'Cancelaste o rechazaste el pago con ePayco. La billetera no recibió saldo nuevo.',
        });
        return;
      }

      if (queryStudentId) {
        setSelectedStudentId(queryStudentId);
        await loadOverview(queryStudentId);
      }

      setWalletReturnNotice({
        type: 'info',
        message: 'Estamos confirmando tu recarga con ePayco y actualizando el saldo de la billetera.',
      });

      for (let attempt = 0; attempt < 8; attempt += 1) {
        if (cancelled) {
          return;
        }

        try {
          const response = await getEpaycoRechargeStatus(paymentReference);
          const status = String(response.data?.status || '').trim().toLowerCase();
          const responseStudentId = String(response.data?.studentId || queryStudentId).trim();

          if (status === 'approved') {
            if (responseStudentId) {
              setSelectedStudentId(responseStudentId);
              await loadOverview(responseStudentId);
            }

            finishReturn({
              type: 'success',
              message: 'La recarga fue acreditada correctamente. Ya actualizamos el saldo de la billetera.',
            });
            return;
          }

          if (status === 'rejected' || status === 'failed') {
            finishReturn({
              type: 'error',
              message: 'El pago con ePayco no fue aprobado. Revisa el estado e intenta de nuevo si es necesario.',
            });
            return;
          }
        } catch (requestError) {
          if (attempt === 7) {
            finishReturn({
              type: 'info',
              message: requestError?.response?.data?.message || 'No pudimos confirmar la recarga todavía. Vuelve a revisar la billetera en unos segundos.',
            });
            return;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1800));
      }

      finishReturn({
        type: 'info',
        message: 'Seguimos verificando la recarga. Si el saldo aún no cambia, vuelve a entrar en unos segundos.',
      });
    };

    syncEpaycoReturn();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, loading, error, navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  const loadOrdersHistory = async (filters = historyFilters) => {
    if (!selectedStudentId) {
      setHistoryOrders([]);
      return;
    }

    setHistoryOrdersLoading(true);
    setHistoryOrdersError('');

    try {
      const response = await getParentPortalOrdersHistory({
        studentId: selectedStudentId,
        from: filters.from || undefined,
        to: filters.to || undefined,
      });
      setHistoryOrders(Array.isArray(response.data?.orders) ? response.data.orders : []);
    } catch (requestError) {
      setHistoryOrdersError(requestError?.response?.data?.message || requestError?.message || 'No se pudo cargar el historial de órdenes.');
      setHistoryOrders([]);
    } finally {
      setHistoryOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (!isHistoryPage || loading || error || !selectedStudentId) {
      return;
    }

    loadOrdersHistory(historyFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHistoryPage, selectedStudentId, loading, error]);

  useEffect(() => {
    if (!isMenuRoute) {
      return;
    }

    let isCancelled = false;

    const loadCategories = async () => {
      setCategoriesLoading(true);
      setCategoriesError('');

      try {
        const response = await getParentPortalCategories();
        if (!isCancelled) {
          setCategories(Array.isArray(response.data) ? response.data : []);
        }
      } catch (requestError) {
        if (!isCancelled) {
          setCategoriesError(requestError?.response?.data?.message || requestError?.message || 'No se pudieron cargar las categorías.');
          setCategories([]);
        }
      } finally {
        if (!isCancelled) {
          setCategoriesLoading(false);
        }
      }
    };

    loadCategories();

    return () => {
      isCancelled = true;
    };
  }, [isMenuRoute]);

  useEffect(() => {
    if (!isMenuProductsPage) {
      setMenuProducts([]);
      setMenuProductsError('');
      setMenuProductsLoading(false);
      return;
    }

    let isCancelled = false;

    const loadProducts = async () => {
      setMenuProductsLoading(true);
      setMenuProductsError('');

      try {
        const response = await getProducts({ categoryId: menuCategoryId });
        if (!isCancelled) {
          setMenuProducts(dedupeParentMenuProducts(response.data));
        }
      } catch (requestError) {
        if (!isCancelled) {
          setMenuProductsError(requestError?.response?.data?.message || requestError?.message || 'No se pudieron cargar los productos.');
          setMenuProducts([]);
        }
      } finally {
        if (!isCancelled) {
          setMenuProductsLoading(false);
        }
      }
    };

    loadProducts();

    return () => {
      isCancelled = true;
    };
  }, [isMenuProductsPage, menuCategoryId]);

  const loadSavedCards = async () => {
    setSavedCardsLoading(true);
    setSavedCardsError('');

    try {
      const response = await getParentCardPaymentMethods();
      setSavedCards(Array.isArray(response.data?.cards) ? response.data.cards : []);
    } catch (requestError) {
      setSavedCardsError(requestError?.response?.data?.message || requestError?.message || 'No se pudieron cargar las tarjetas guardadas.');
      setSavedCards([]);
    } finally {
      setSavedCardsLoading(false);
    }
  };

  const loadMeriendasData = async () => {
    if (!selectedStudentId) {
      setMeriendasData(null);
      return;
    }

    setMeriendasLoading(true);
    setMeriendasError('');

    try {
      const response = await getParentMeriendasPortal({
        studentId: selectedStudentId,
        month: currentYearMonth(),
      });
      const payload = response.data || null;
      setMeriendasData(payload);

      setMeriendasRestrictionsText(String(payload?.subscription?.childFoodRestrictions || ''));
      setMeriendasRestrictionReason(String(payload?.subscription?.childFoodRestrictionReason || ''));
      setMeriendasParentComments(String(payload?.subscription?.parentComments || ''));
    } catch (requestError) {
      setMeriendasError(requestError?.response?.data?.message || requestError?.message || 'No se pudo cargar la página de meriendas.');
      setMeriendasData(null);
    } finally {
      setMeriendasLoading(false);
    }
  };

  useEffect(() => {
    if ((!isTopupsPage && !isTopupMethodsPage && !isTopupDaviPlataPage && !isAutoTopupPage) || loading || error) {
      return;
    }

    loadSavedCards();
  }, [isTopupsPage, isTopupMethodsPage, isTopupDaviPlataPage, isAutoTopupPage, loading, error]);

  useEffect(() => {
    if ((!isMeriendasPage && !isMeriendasDayPage) || loading || error || !selectedStudentId) {
      return;
    }

    loadMeriendasData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMeriendasPage, isMeriendasDayPage, loading, error, selectedStudentId]);

  useEffect(() => {
    if (!isMeriendasPage) {
      setMeriendasStatusMenuOpen(false);
      setShowMeriendasCancelModal(false);
    }
  }, [isMeriendasPage]);

  useEffect(() => {
    if (!isGioIaPage) {
      return;
    }

    setGioMessages([
      {
        role: 'assistant',
        content: `Hola, soy GIO - IA. Estoy listo para ayudarte con el consumo de ${selectedStudentFirstName}.`,
      },
    ]);
    setGioInput('');
    setGioError('');
    setGioContext(null);
  }, [isGioIaPage, selectedStudent?._id, selectedStudentFirstName]);

  useEffect(() => {
    if (!isGioIaPage) {
      return;
    }

    gioThreadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [gioMessages, gioSending, isGioIaPage]);

  useEffect(() => {
    if (!isAutoTopupPage) {
      return;
    }

    navigate('/parent/recargas', { replace: true });
  }, [isAutoTopupPage, navigate]);

  useEffect(() => {
    if (!verifiedSavedCards.length) {
      if (autoTopupSelectedCardId) {
        setAutoTopupSelectedCardId('');
      }
      return;
    }

    const cardStillExists = verifiedSavedCards.some((card) => String(card._id) === String(autoTopupSelectedCardId));
    if (!cardStillExists) {
      setAutoTopupSelectedCardId(String(verifiedSavedCards[0]._id));
    }
  }, [verifiedSavedCards, autoTopupSelectedCardId]);

  useEffect(() => {
    if (!isAutoTopupPage || !selectedStudent?._id || loading || error) {
      return;
    }

    const params = new URLSearchParams(location.search || '');
    const preapprovalFromQuery = String(params.get('preapproval_id') || params.get('preapprovalId') || '').trim();
    const pendingAgreementId = String(selectedStudent?.wallet?.autoDebitAgreementId || '').trim();
    const pendingAgreementStatus = String(selectedStudent?.wallet?.autoDebitAgreementStatus || '').trim().toLowerCase();

    const preapprovalId = preapprovalFromQuery || (
      !selectedStudent?.wallet?.autoDebitEnabled &&
      pendingAgreementId &&
      pendingAgreementStatus === 'pending'
        ? pendingAgreementId
        : ''
    );

    if (!preapprovalId) {
      return;
    }

    if (autoTopupAuthProcessedRef.current === preapprovalId) {
      return;
    }

    autoTopupAuthProcessedRef.current = preapprovalId;
    setAutoTopupAuthorizationLoading(true);
    setAutoTopupSubmitError('');
    setAutoTopupSubmitSuccess('');

    const activateAutoTopupDirectly = async () => {
      try {
        const response = await updateParentPortalStudentAutoDebit(selectedStudent._id, {
          enabled: true,
          autoDebitLimit: autoTopupMinBalanceNumber,
          autoDebitAmount: autoTopupRechargeAmount,
          autoDebitPaymentMethodId: autoTopupSelectedCardId,
        });

        mergeStudentData(response.data?.student || {
          _id: selectedStudent._id,
          wallet: {
            autoDebitEnabled: true,
            autoDebitLimit: autoTopupMinBalanceNumber,
            autoDebitAmount: autoTopupRechargeAmount,
            autoDebitPaymentMethodId: null,
          },
        });

        setAutoTopupSubmitSuccess('Recarga automática activada correctamente.');
        setAutoTopupCongratsStudentName(String(selectedStudent?.name || selectedStudentFirstName || 'tu hijo'));
        setShowAutoTopupCongratsModal(true);
        navigate('/parent/recargas/automatica', { replace: true });
      } catch (requestError) {
        setAutoTopupSubmitError(
          requestError?.response?.data?.message || requestError?.message || 'No se pudo activar la recarga automática de ePayco.'
        );
      } finally {
        setAutoTopupAuthorizationLoading(false);
      }
    };

    activateAutoTopupDirectly();
  }, [
    isAutoTopupPage,
    selectedStudent?._id,
    selectedStudent?.wallet?.autoDebitAgreementId,
    selectedStudent?.wallet?.autoDebitAgreementStatus,
    selectedStudent?.wallet?.autoDebitEnabled,
    loading,
    error,
    location.search,
    autoTopupMinBalanceNumber,
    autoTopupRechargeAmount,
  ]);

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  const onSelectChild = (studentId) => {
    setSelectedStudentId(String(studentId));
    setChildrenOpen(false);
    loadOverview(String(studentId));
  };

  const onSendGioMessage = async () => {
    const message = String(gioInput || '').trim();
    if (!message || gioSending) {
      return;
    }

    if (!selectedStudentId) {
      setGioError('Selecciona un alumno para continuar.');
      return;
    }

    const userMessage = { role: 'user', content: message };
    const nextMessages = [...gioMessages, userMessage];
    setGioMessages(nextMessages);
    setGioInput('');
    setGioError('');
    setGioSending(true);

    try {
      const historyPayload = nextMessages.slice(-20).map((item) => ({
        role: item.role,
        content: String(item.content || ''),
      }));
      const response = await askParentGioIaChat({
        studentId: selectedStudentId,
        message,
        history: historyPayload,
        context: gioContext,
      });

      const answer = String(response.data?.answer || 'No tengo una respuesta para esa consulta todavía.').trim();
      setGioMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
      setGioContext(response.data?.context || null);
    } catch (requestError) {
      const messageError = requestError?.response?.data?.message || requestError?.message || 'No se pudo procesar tu pregunta.';
      setGioError(messageError);
      setGioMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'No pude responder en este momento. Intenta de nuevo en unos segundos.' },
      ]);
    } finally {
      setGioSending(false);
    }
  };

  const selectedMenuCategory = categories.find((category) => String(category._id) === String(menuCategoryId));

  const onRunMenuAction = (label) => {
    setDrawerOpen(false);
    setProfileMenuOpen(false);

    if (label === 'Inicio') {
      navigate('/parent');
      return;
    }

    if (label === 'Menu - bloquear products') {
      navigate('/parent/menu');
      return;
    }

    if (label === 'Recargas') {
      navigate('/parent/recargas');
      return;
    }

    if (label === 'Historial de órdenes') {
      navigate('/parent/historial-ordenes');
      return;
    }

    if (label === 'Limitar consumo') {
      navigate('/parent/limitar-consumo');
      return;
    }

    if (label === 'Meriendas') {
      navigate('/parent/meriendas');
      return;
    }

    if (label === 'GIO - IA') {
      navigate('/parent/gio-ia');
    }
  };

  const onOpenOrderDetail = (order) => {
    if (!order?._id) {
      return;
    }
    setSelectedOrderDetail(order);
  };

  const onCloseOrderDetail = () => {
    setSelectedOrderDetail(null);
  };

  const menuItems = [
    { key: 'Inicio', label: 'Inicio', icon: 'home' },
    { key: 'Menu - bloquear products', label: 'Menú - bloquear productos', icon: 'food-menu' },
    { key: 'Recargas', label: 'Recargas', icon: 'wallet' },
    { key: 'Historial de órdenes', label: 'Historial de órdenes', icon: 'ticket' },
    { key: 'Limitar consumo', label: 'Limitar consumo', icon: 'limit' },
    { key: 'Meriendas', label: 'Meriendas', icon: 'star' },
    { key: 'GIO - IA', label: 'GIO - IA', icon: 'sparkles' },
  ];

  const mergeStudentData = (updatedStudent) => {
    setOverview((prev) => {
      if (!prev || !updatedStudent?._id) {
        return prev;
      }

      const blockedProducts = Array.isArray(updatedStudent.blockedProducts) ? updatedStudent.blockedProducts : [];
      const blockedCategories = Array.isArray(updatedStudent.blockedCategories) ? updatedStudent.blockedCategories : [];
      const hasDailyLimit = Object.prototype.hasOwnProperty.call(updatedStudent, 'dailyLimit');
      const nextDailyLimit = hasDailyLimit ? Number(updatedStudent.dailyLimit || 0) : null;
      const hasGrade = Object.prototype.hasOwnProperty.call(updatedStudent, 'grade');
      const nextGrade = hasGrade ? String(updatedStudent.grade || '').trim() : '';
      const hasAutoDebitEnabled = Boolean(
        Object.prototype.hasOwnProperty.call(updatedStudent, 'autoDebitEnabled') ||
        Object.prototype.hasOwnProperty.call(updatedStudent?.wallet || {}, 'autoDebitEnabled')
      );
      const hasAutoDebitLimit = Boolean(
        Object.prototype.hasOwnProperty.call(updatedStudent, 'autoDebitLimit') ||
        Object.prototype.hasOwnProperty.call(updatedStudent?.wallet || {}, 'autoDebitLimit')
      );
      const hasAutoDebitAmount = Boolean(
        Object.prototype.hasOwnProperty.call(updatedStudent, 'autoDebitAmount') ||
        Object.prototype.hasOwnProperty.call(updatedStudent?.wallet || {}, 'autoDebitAmount')
      );
      const nextAutoDebitEnabled = updatedStudent?.wallet?.autoDebitEnabled ?? updatedStudent?.autoDebitEnabled;
      const nextAutoDebitLimit = updatedStudent?.wallet?.autoDebitLimit ?? updatedStudent?.autoDebitLimit;
      const nextAutoDebitAmount = updatedStudent?.wallet?.autoDebitAmount ?? updatedStudent?.autoDebitAmount;

      const mapStudent = (student) => {
        if (!student || String(student._id) !== String(updatedStudent._id)) {
          return student;
        }

        const nextStudent = {
          ...student,
        };

        if (hasDailyLimit) {
          nextStudent.dailyLimit = nextDailyLimit;
        }

        if (hasGrade) {
          nextStudent.grade = nextGrade;
        }

        if (Array.isArray(updatedStudent.blockedProducts)) {
          nextStudent.blockedProducts = blockedProducts;
          nextStudent.blockedProductsCount = blockedProducts.length;
        }

        if (Array.isArray(updatedStudent.blockedCategories)) {
          nextStudent.blockedCategories = blockedCategories;
          nextStudent.blockedCategoriesCount = blockedCategories.length;
        }

        if (hasAutoDebitEnabled || hasAutoDebitLimit || hasAutoDebitAmount) {
          nextStudent.wallet = {
            ...(nextStudent.wallet || {}),
          };

          if (hasAutoDebitEnabled) {
            nextStudent.wallet.autoDebitEnabled = Boolean(nextAutoDebitEnabled);
          }

          if (hasAutoDebitLimit) {
            nextStudent.wallet.autoDebitLimit = Number(nextAutoDebitLimit || 0);
          }

          if (hasAutoDebitAmount) {
            nextStudent.wallet.autoDebitAmount = Number(nextAutoDebitAmount || 0);
          }
        }

        return nextStudent;
      };

      return {
        ...prev,
        children: Array.isArray(prev.children) ? prev.children.map(mapStudent) : prev.children,
        selectedStudent: mapStudent(prev.selectedStudent),
      };
    });
  };

  const onToggleBlock = async (type, targetId, blocked) => {
    if (!selectedStudentId) {
      setBlockActionError('Selecciona un alumno para gestionar bloqueos.');
      return;
    }

    const targetKey = `${type}:${targetId}`;
    setBlockingTargetKey(targetKey);
    setBlockActionError('');

    try {
      const response = await updateParentPortalStudentBlock(selectedStudentId, {
        type,
        targetId,
        blocked,
      });
      mergeStudentData(response.data?.student || null);
    } catch (requestError) {
      setBlockActionError(requestError?.response?.data?.message || requestError?.message || 'No se pudo actualizar el bloqueo.');
    } finally {
      setBlockingTargetKey('');
    }
  };

  const onSaveDailyLimit = async (nextLimitValue) => {
    if (!selectedStudentId) {
      setDailyLimitError('Selecciona un alumno para definir el tope diario.');
      return;
    }

    const parsed = Number(nextLimitValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDailyLimitError('Ingresa un valor válido mayor o igual a 0.');
      return;
    }

    setDailyLimitSaving(true);
    setDailyLimitError('');

    try {
      const response = await updateParentPortalStudentDailyLimit(selectedStudentId, {
        dailyLimit: parsed,
      });
      const updatedStudent = response.data?.student || null;
      mergeStudentData(updatedStudent);
      setDailyLimitDraft(String(Number(updatedStudent?.dailyLimit || 0)));
    } catch (requestError) {
      setDailyLimitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo guardar el tope diario.');
    } finally {
      setDailyLimitSaving(false);
    }
  };

  const onSaveStudentGrade = async () => {
    if (!selectedStudentId) {
      setGradeError('Selecciona un alumno para actualizar el curso.');
      return;
    }

    const normalizedGrade = String(gradeDraft || '').trim();
    if (!normalizedGrade) {
      setGradeError('Ingresa el curso del alumno.');
      return;
    }

    setGradeSaving(true);
    setGradeError('');

    try {
      const response = await updateParentPortalStudentGrade(selectedStudentId, {
        grade: normalizedGrade,
      });
      const updatedStudent = response.data?.student || null;
      mergeStudentData(updatedStudent);
      setGradeDraft(String(updatedStudent?.grade || normalizedGrade));
      setGradeEditOpen(false);
    } catch (requestError) {
      setGradeError(requestError?.response?.data?.message || requestError?.message || 'No se pudo guardar el curso.');
    } finally {
      setGradeSaving(false);
    }
  };

  useEffect(() => {
    if (!isTopupPsePage) {
      return;
    }

    let cancelled = false;

    const loadPseBanks = async () => {
      try {
        setPseBanksLoading(true);
        const response = await getBoldPseBanks();
        const banks = Array.isArray(response?.data?.banks) ? response.data.banks : [];

        if (cancelled) {
          return;
        }

        setPseBanks(banks);
        setPseSelectedBankCode((current) => {
          if (current && banks.some((bank) => String(bank.bankCode) === String(current))) {
            return current;
          }

          return String(banks[0]?.bankCode || '');
        });
      } catch (requestError) {
        if (!cancelled) {
          setPseBanks([]);
          setPseSelectedBankCode('');
          setPseSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo cargar la lista de bancos PSE.');
        }
      } finally {
        if (!cancelled) {
          setPseBanksLoading(false);
        }
      }
    };

    loadPseBanks();

    return () => {
      cancelled = true;
    };
  }, [isTopupPsePage]);

  useEffect(() => {
    if (!isTopupDaviPlataPage) {
      setShowBoldCardForm(false);
      setIsBoldCardFormClosing(false);
      setDaviSubmitError('');
      setDaviSubmitSuccess('');
      return;
    }

    if (!selectedStudent?._id) {
      setDaviSubmitError('Selecciona un alumno antes de continuar.');
      return;
    }

    if (!canContinueDaviRecharge) {
      setDaviSubmitSuccess('');
      if (daviAmountNumber > 0) {
        setDaviSubmitError(`El valor minimo para recargar con Bold es ${formatCurrency(minimumBoldRecharge)}.`);
      } else {
        setDaviSubmitError('');
      }
      return;
    }

    setDaviSubmitError('');
  }, [isTopupDaviPlataPage, selectedStudent?._id, daviAmountNumber, canContinueDaviRecharge, minimumBoldRecharge]);

  useEffect(() => {
    if (!isBoldCardFormClosing) {
      return undefined;
    }

    const closeTimer = window.setTimeout(() => {
      setShowBoldCardForm(false);
      setIsBoldCardFormClosing(false);
    }, 220);

    return () => window.clearTimeout(closeTimer);
  }, [isBoldCardFormClosing]);

  const openBoldCardModal = () => {
    setIsBoldCardFormClosing(false);
    setShowBoldCardForm(true);
  };

  const closeBoldCardModal = () => {
    if (daviSubmitLoading || !showBoldCardForm) {
      return;
    }

    setIsBoldCardFormClosing(true);
  };

  const onSubmitPseTopup = async () => {
    if (!canContinuePseRecharge) {
      setPseSubmitError(`Ingresa un valor de al menos ${formatCurrency(minimumBoldRecharge)} y selecciona un banco PSE.`);
      return;
    }

    setPseSubmitLoading(true);
    setPseSubmitError('');
    setPseSubmitSuccess('');

    try {
      await startBoldRedirectTopup({
        amount: pseAmountNumber,
        paymentMethodName: 'PSE',
        bankCode: pseSelectedBank?.bankCode,
        bankName: pseSelectedBank?.bankName,
      });
      setPseSubmitSuccess('Te estamos redirigiendo a PSE para completar la recarga.');
    } catch (requestError) {
      setPseSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo iniciar la recarga por PSE.');
    } finally {
      setPseSubmitLoading(false);
    }
  };

  const redirectAfterBoldTopupStart = async (payload, studentId) => {
    const reference = String(payload?.reference || '').trim();
    const redirectUrl = String(payload?.redirectUrl || '').trim();
    const redirectMethod = String(payload?.redirectMethod || 'GET').trim().toUpperCase();

    if (redirectUrl) {
      if (redirectMethod === 'GET' && Capacitor.isNativePlatform()) {
        try {
          const result = await AppLauncher.openUrl({ url: redirectUrl });
          if (result?.completed) {
            return;
          }
        } catch (launchError) {
          console.warn('[BOLD_REDIRECT_EXTERNAL_LAUNCH_FAILED]', launchError);
        }

        await Browser.open({ url: redirectUrl });
        return;
      }

      if (redirectMethod === 'POST') {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = redirectUrl;
        form.style.display = 'none';
        document.body.appendChild(form);
        form.submit();
        return;
      }

      window.location.assign(redirectUrl);
      return;
    }

    const params = new URLSearchParams();
    params.set('studentId', String(studentId));
    params.set('paymentSource', 'bold');
    if (reference) {
      params.set('paymentReference', reference);
    }
    navigate(`/parent/recargas?${params.toString()}`);
  };

  const startBoldRedirectTopup = async ({ amount, paymentMethodName, bankCode, bankName }) => {
    if (!selectedStudent?._id) {
      throw new Error('Selecciona un alumno antes de continuar.');
    }

    const response = await createBoldRechargePayment({
      studentId: selectedStudent._id,
      amount,
      description: `Recarga Comergio - ${selectedStudent?.name || 'Alumno'}`,
      paymentMethod: {
        name: paymentMethodName,
        ...(bankCode || bankName
          ? {
              bankCode,
              bankName,
            }
          : {}),
      },
      deviceFingerprint: buildBoldDeviceFingerprint(),
    });

    await redirectAfterBoldTopupStart(response.data, selectedStudent._id);
  };

  const onSubmitEpaycoTopup = async () => {
    if (!canContinueEpaycoRecharge) {
      setEpaycoSubmitError(`Ingresa un valor de al menos ${formatCurrency(minimumBoldRecharge)}.`);
      return;
    }

    if (!selectedStudent?._id) {
      setEpaycoSubmitError('Selecciona un alumno antes de continuar.');
      return;
    }

    setEpaycoSubmitLoading(true);
    setEpaycoSubmitError('');
    setEpaycoSubmitSuccess('');

    try {
      const response = await createEpaycoRechargePayment({
        studentId: selectedStudent._id,
        amount: epaycoAmountNumber,
        description: `Recarga Comergio - ${selectedStudent?.name || 'Alumno'}`,
      });

      const checkout = response?.data?.checkout || null;
      const checkoutData = checkout?.data || null;
      const publicKey = String(checkout?.publicKey || '').trim();

      if (!publicKey || !checkoutData) {
        throw new Error('No recibimos la configuración de checkout de ePayco.');
      }

      const epayco = await loadEpaycoCheckoutScript();
      const handler = epayco.checkout.configure({
        key: publicKey,
        test: Boolean(checkout?.test),
      });

      handler.open(checkoutData);
      setEpaycoSubmitSuccess('Abrimos ePayco para que completes la recarga.');
    } catch (requestError) {
      setEpaycoSubmitError(
        requestError?.response?.data?.message || requestError?.message || 'No se pudo iniciar la recarga con ePayco.'
      );
    } finally {
      setEpaycoSubmitLoading(false);
    }
  };

  const onSubmitNequiTopup = async () => {
    if (!canContinueNequiRecharge) {
      setNequiSubmitError(`Ingresa un valor de al menos ${formatCurrency(minimumBoldRecharge)}.`);
      return;
    }

    setNequiSubmitLoading(true);
    setNequiSubmitError('');
    setNequiSubmitSuccess('');

    try {
      await startBoldRedirectTopup({
        amount: nequiAmountNumber,
        paymentMethodName: 'NEQUI',
      });
      setNequiSubmitSuccess('Te estamos redirigiendo a Nequi para completar la recarga.');
    } catch (requestError) {
      setNequiSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo iniciar la recarga con Nequi.');
    } finally {
      setNequiSubmitLoading(false);
    }
  };

  const onSubmitBancolombiaTopup = async () => {
    if (!canContinueBancolombiaRecharge) {
      setBancolombiaSubmitError(`Ingresa un valor de al menos ${formatCurrency(minimumBoldRecharge)}.`);
      return;
    }

    setBancolombiaSubmitLoading(true);
    setBancolombiaSubmitError('');
    setBancolombiaSubmitSuccess('');

    try {
      await startBoldRedirectTopup({
        amount: bancolombiaAmountNumber,
        paymentMethodName: 'BOTON_BANCOLOMBIA',
      });
      setBancolombiaSubmitSuccess('Te estamos redirigiendo a Botón Bancolombia para completar la recarga.');
    } catch (requestError) {
      setBancolombiaSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo iniciar la recarga por Bancolombia.');
    } finally {
      setBancolombiaSubmitLoading(false);
    }
  };

  const onSubmitBrebTopup = async () => {
    if (!canContinueBrebRecharge) {
      setBrebSubmitError('Ingresa un valor válido para continuar.');
      return;
    }

    setBrebSubmitLoading(true);
    setBrebSubmitError('');
    setBrebSubmitSuccess('');

    try {
      setBrebSubmitSuccess('Recarga Bre-B registrada. En el siguiente paso te llevaremos a la pasarela de pago.');
    } catch (requestError) {
      setBrebSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo iniciar la recarga por Bre-B.');
    } finally {
      setBrebSubmitLoading(false);
    }
  };

  const onSubmitBoldCardTopup = async () => {
    if (!selectedStudent?._id) {
      setDaviSubmitError('Selecciona un alumno antes de continuar.');
      return;
    }

    if (!canContinueDaviRecharge) {
      setDaviSubmitError(`El valor minimo para recargar con Bold es ${formatCurrency(minimumBoldRecharge)}.`);
      return;
    }

    if (!canSubmitBoldCardDetails) {
      setDaviSubmitError('Completa correctamente los datos de la tarjeta y del titular.');
      return;
    }

    const expiryMonth = boldTopupExpiryDigits.slice(0, 2);
    const expiryYear = `20${boldTopupExpiryDigits.slice(2, 4)}`;

    setDaviSubmitLoading(true);
    setDaviSubmitError('');
    setDaviSubmitSuccess('');

    try {
      const response = await createBoldRechargePayment({
        studentId: selectedStudent._id,
        amount: daviAmountNumber,
        description: `Recarga Comergio - ${selectedStudent?.name || 'Alumno'}`,
        payer: {
          name: String(boldTopupCardholderName || '').trim(),
        },
        paymentMethod: {
          cardNumber: boldTopupCardDigits,
          cardholderName: String(boldTopupCardholderName || '').trim(),
          expirationMonth: expiryMonth,
          expirationYear: expiryYear,
          installments: 1,
          cvc: boldTopupCvvDigits,
        },
        deviceFingerprint: buildBoldDeviceFingerprint(),
      });

      setDaviSubmitSuccess('Pago enviado a Bold. Estamos validando el resultado.');
      await redirectAfterBoldTopupStart(response.data, selectedStudent._id);
    } catch (requestError) {
      setDaviSubmitError(
        requestError?.response?.data?.message || requestError?.message || 'No se pudo iniciar el pago con Bold.'
      );
    } finally {
      setDaviSubmitLoading(false);
    }
  };

  const openCardVerificationModal = (card) => {
    const cardId = String(card?._id || '').trim();
    if (!cardId) {
      return;
    }

    setCardVerificationCardId(cardId);
    setCardVerificationCardLabel(`${getCardBrandLabel(card?.brand)} **** ${card?.last4 || ''}`.trim());
    setCardVerificationAmount('');
    setCardVerificationError('');
    setCardVerificationSuccess('');
    setCardVerificationExpiresAt(String(card?.verificationExpiresAt || ''));
    setCardVerificationStep('intro');
    setShowCardVerificationModal(true);
  };

  const closeCardVerificationModal = () => {
    if (cardVerificationSubmitting) {
      return;
    }

    setShowCardVerificationModal(false);
    setCardVerificationStep('intro');
    setCardVerificationAmount('');
    setCardVerificationError('');
    setCardVerificationSuccess('');
  };

  const onStartCardVerification = async () => {
    if (!cardVerificationCardId) {
      return;
    }

    setCardVerificationSubmitting(true);
    setCardVerificationError('');
    setCardVerificationSuccess('');

    try {
      const response = await requestParentCardVerification(cardVerificationCardId);
      const responseCard = response?.data?.card || null;
      setCardVerificationExpiresAt(String(responseCard?.verificationExpiresAt || ''));
      setCardVerificationStep('amount');
      await loadSavedCards();
    } catch (requestError) {
      setCardVerificationError(
        requestError?.response?.data?.message || requestError?.message || 'No se pudo iniciar la verificación de la tarjeta.'
      );
    } finally {
      setCardVerificationSubmitting(false);
    }
  };

  const onConfirmCardVerification = async () => {
    if (!cardVerificationCardId) {
      return;
    }

    const parsedAmount = Number(String(cardVerificationAmount || '').replace(/\D/g, ''));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setCardVerificationError('Ingresa el valor exacto del cobro para continuar.');
      return;
    }

    setCardVerificationSubmitting(true);
    setCardVerificationError('');
    setCardVerificationSuccess('');

    try {
      await confirmParentCardVerification(cardVerificationCardId, { amount: parsedAmount });
      await loadSavedCards();
      setAddCardSuccess(`Tarjeta ${cardVerificationCardLabel} verificada correctamente.`);
      setShowCardVerificationModal(false);
      setCardVerificationAmount('');
      setCardVerificationStep('intro');
    } catch (requestError) {
      const attemptsRemaining = Number(requestError?.response?.data?.attemptsRemaining);
      const fallbackMessage = requestError?.response?.data?.message || requestError?.message || 'No se pudo verificar la tarjeta.';
      const message = Number.isFinite(attemptsRemaining)
        ? `${fallbackMessage} Intentos restantes: ${attemptsRemaining}.`
        : fallbackMessage;
      setCardVerificationError(message);
    } finally {
      setCardVerificationSubmitting(false);
    }
  };

  const onSubmitAddCard = async () => {
    if (!canContinueAddCard) {
      setAddCardError('Completa todos los campos para continuar.');
      return;
    }

    setAddCardLoading(true);
    setAddCardError('');
    setAddCardSuccess('');

    try {
      const firstName = String(cardFirstName || '').trim();
      const lastName = String(cardLastName || '').trim();
      const documentType = String(cardDocType || '').trim().toUpperCase();
      const documentNumber = cardDocumentDigits;
      const expMonth = cardExpiryDigits.slice(0, 2);
      const expYearShort = cardExpiryDigits.slice(2, 4);
      const expYear = String(2000 + Number(expYearShort || 0));

      const payload = {
        provider: 'epayco',
        firstName,
        lastName,
        documentType,
        documentNumber,
        cardNumber: cardDigits,
        cardExpiry: `${expMonth}/${expYearShort}`,
        cardCvv: cardCvvDigits,
        cardExpMonth: Number(expMonth),
        cardExpYear: Number(expYear),
        cardLast4: cardDigits.slice(-4),
        cardBrand: 'unknown',
      };

      const response = await createParentCardPaymentMethod(payload);

      const createdCard = response?.data?.paymentMethod || null;
      const last4 = createdCard?.last4 || cardDigits.slice(-4);
      const isVerifiedCard = String(createdCard?.verificationStatus || '').toLowerCase() === 'verified';
      setAddCardSuccess(
        isVerifiedCard
          ? `Tarjeta terminada en ${last4} guardada y verificada. Ya puedes activar recarga automática.`
          : `Tarjeta terminada en ${last4} registrada. Completa la verificación para habilitarla.`
      );
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');
      setCardFirstName('');
      setCardLastName('');
      setCardDocType('CC');
      setCardDocument('');
      await loadSavedCards();
      if (createdCard?._id && String(createdCard?.verificationStatus || '').toLowerCase() !== 'verified') {
        openCardVerificationModal(createdCard);
      }
    } catch (requestError) {
      setAddCardError(requestError?.response?.data?.message || requestError?.message || 'No se pudo registrar la tarjeta.');
    } finally {
      setAddCardLoading(false);
    }
  };

  const onSubmitAddCardForm = (event) => {
    event.preventDefault();
    onSubmitAddCard();
  };

  const onSubmitAutoTopup = async () => {
    if (!selectedStudent?._id) {
      setAutoTopupSubmitError('Selecciona un alumno para activar la recarga automática.');
      return;
    }

    if (!verifiedSavedCards.length) {
      setAutoTopupSubmitError('Debes agregar y verificar una tarjeta para activar la recarga automática.');
      return;
    }

    if (!canActivateAutoTopup) {
      setAutoTopupSubmitError('Completa los datos para activar la recarga automática.');
      return;
    }

    setAutoTopupSubmitLoading(true);
    setAutoTopupSubmitError('');
    setAutoTopupSubmitSuccess('');

    try {
      const response = await updateParentPortalStudentAutoDebit(selectedStudent._id, {
        enabled: true,
        autoDebitLimit: autoTopupMinBalanceNumber,
        autoDebitAmount: autoTopupRechargeAmount,
        autoDebitPaymentMethodId: autoTopupSelectedCardId,
      });

      const requiresAuthorization = Boolean(response?.data?.requiresAuthorization);
      const authorizationUrl = String(response?.data?.authorizationUrl || '').trim();

      if (requiresAuthorization && authorizationUrl) {
        const pendingPreapprovalId = String(response?.data?.preapprovalId || '').trim();
        setAutoTopupPendingAuthorizationUrl(authorizationUrl);
        setAutoTopupPendingPreapprovalId(pendingPreapprovalId);
        mergeStudentData(response.data?.student || {
          _id: selectedStudent?._id || selectedStudentId,
          wallet: { autoDebitAgreementId: pendingPreapprovalId, autoDebitAgreementStatus: 'pending', autoDebitEnabled: false },
        });
        try { window.open(authorizationUrl, '_blank'); } catch (_) { /* ignore */ }
        return;
      }

      mergeStudentData(response.data?.student || {
        _id: selectedStudent?._id || selectedStudentId,
        wallet: {
          autoDebitEnabled: true,
          autoDebitLimit: autoTopupMinBalanceNumber,
          autoDebitAmount: autoTopupRechargeAmount,
          autoDebitPaymentMethodId: autoTopupSelectedCardId,
        },
      });
      setAutoTopupSubmitSuccess('Recarga automática activada correctamente.');
      setAutoTopupCongratsStudentName(String(selectedStudent?.name || selectedStudentFirstName || 'tu hijo'));
      setShowAutoTopupCongratsModal(true);
    } catch (requestError) {
      setAutoTopupSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo activar la recarga automática.');
    } finally {
      setAutoTopupSubmitLoading(false);
    }
  };

  const onDisableAutoTopup = async () => {
    if (!selectedStudent?._id || autoDebitCancelLoading) {
      return;
    }

    setAutoDebitCancelLoading(true);
    setAutoTopupSubmitError('');
    setAutoTopupSubmitSuccess('');

    try {
      const response = await updateParentPortalStudentAutoDebit(selectedStudent._id, {
        enabled: false,
      });

      mergeStudentData(response.data?.student || {
        _id: selectedStudent._id,
        wallet: {
          autoDebitEnabled: false,
          autoDebitLimit: 0,
          autoDebitAmount: 0,
          autoDebitPaymentMethodId: null,
        },
      });

      setAutoDebitMenuOpen(false);
      setAutoTopupSubmitSuccess('Debito automatico cancelado correctamente.');
    } catch (requestError) {
      setAutoTopupSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo cancelar el debito automatico.');
    } finally {
      setAutoDebitCancelLoading(false);
    }
  };

  const closeAutoTopupCongratsModal = () => {
    setShowAutoTopupCongratsModal(false);
  };

  const onOpenMPAuthorization = async () => {
    if (autoTopupAuthorizationLoading || autoTopupSubmitLoading || !selectedStudent?._id) {
      return;
    }

    const existingPreapprovalId = String(
      autoTopupPendingPreapprovalId || selectedStudent?.wallet?.autoDebitAgreementId || ''
    ).trim();

    if (existingPreapprovalId) {
      setAutoTopupAuthorizationLoading(true);
      setAutoTopupSubmitError('');
      setAutoTopupSubmitSuccess('');
      try {
        const confirmResponse = await updateParentPortalStudentAutoDebit(selectedStudent._id, {
          enabled: true,
          autoDebitLimit: autoTopupMinBalanceNumber,
          autoDebitAmount: autoTopupRechargeAmount,
          autoDebitPaymentMethodId: autoTopupSelectedCardId,
        });

        mergeStudentData(confirmResponse.data?.student || { _id: selectedStudent._id, wallet: { autoDebitEnabled: true } });
        setAutoTopupPendingAuthorizationUrl('');
        setAutoTopupPendingPreapprovalId('');
        setAutoTopupCongratsStudentName(String(selectedStudent?.name || selectedStudentFirstName || 'tu hijo'));
        setShowAutoTopupCongratsModal(true);
        return;
      } catch (err) {
        if (Number(err?.response?.status || 0) !== 409) {
          setAutoTopupSubmitError(err?.response?.data?.message || err?.message || 'No se pudo activar la recarga automática de ePayco.');
          return;
        }
      } finally {
        setAutoTopupAuthorizationLoading(false);
      }
    }

    const fallbackLimit = Number(selectedStudent?.wallet?.autoDebitLimit || 0);
    const fallbackAmount = Number(selectedStudent?.wallet?.autoDebitAmount || 0);
    const payloadLimit = autoTopupMinBalanceNumber > 0 ? autoTopupMinBalanceNumber : fallbackLimit;
    const payloadAmount = autoTopupRechargeAmount > 0 ? autoTopupRechargeAmount : fallbackAmount;

    if (!payloadLimit || !payloadAmount) {
      setAutoTopupSubmitError('Completa o verifica los datos de recarga automática antes de continuar.');
      return;
    }

    setAutoTopupSubmitLoading(true);
    setAutoTopupSubmitError('');
    setAutoTopupSubmitSuccess('');

    try {
      const response = await updateParentPortalStudentAutoDebit(selectedStudent._id, {
        enabled: true,
        autoDebitLimit: payloadLimit,
        autoDebitAmount: payloadAmount,
      });

      mergeStudentData(response.data?.student || {
        _id: selectedStudent._id,
        wallet: {
          autoDebitEnabled: true,
          autoDebitLimit: payloadLimit,
          autoDebitAmount: payloadAmount,
          autoDebitPaymentMethodId: autoTopupSelectedCardId,
          autoDebitAgreementId: '',
          autoDebitAgreementStatus: '',
        },
      });
      setAutoTopupPendingAuthorizationUrl('');
      setAutoTopupPendingPreapprovalId('');
      setAutoTopupSubmitSuccess('Recarga automática activada correctamente.');
      setAutoTopupCongratsStudentName(String(selectedStudent?.name || selectedStudentFirstName || 'tu hijo'));
      setShowAutoTopupCongratsModal(true);
    } catch (requestError) {
      setAutoTopupSubmitError(
        requestError?.response?.data?.message || requestError?.message || 'No se pudo activar la recarga automática de ePayco.'
      );
    } finally {
      setAutoTopupSubmitLoading(false);
    }
  };

  const onSubmitMeriendas = async () => {
    if (!selectedStudentId) {
      setMeriendasSubmitError('Selecciona un alumno para continuar.');
      return;
    }

    setMeriendasSubmitLoading(true);
    setMeriendasSubmitError('');
    setMeriendasSubmitSuccess('');

    try {
      await subscribeParentMeriendas({
        studentId: selectedStudentId,
        targetMonth: currentYearMonth(),
        childFoodRestrictions: String(meriendasRestrictionsText || '').trim(),
        childFoodRestrictionReason: String(meriendasRestrictionReason || '').trim(),
      });
      setMeriendasSubmitSuccess('Suscripción de meriendas activada correctamente.');

      await loadMeriendasData();
    } catch (requestError) {
      setMeriendasSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo guardar la configuración de meriendas.');
    } finally {
      setMeriendasSubmitLoading(false);
    }
  };

  const onSendMeriendasComment = async () => {
    if (!meriendaSubscription?._id) {
      setMeriendasSubmitError('No hay una suscripción activa para enviar comentarios.');
      return;
    }

    const comment = String(meriendasParentComments || '').trim();
    if (!comment) {
      setMeriendasSubmitError('Escribe un comentario antes de enviar.');
      return;
    }

    setMeriendasSubmitLoading(true);
    setMeriendasSubmitError('');
    setMeriendasSubmitSuccess('');

    try {
      await updateParentMeriendasSubscription(meriendaSubscription._id, {
        parentComments: comment,
      });
      setMeriendasParentComments('');
      setMeriendasSubmitSuccess('Comentario enviado al Tutor de alimentación.');
    } catch (requestError) {
      setMeriendasSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo enviar el comentario.');
    } finally {
      setMeriendasSubmitLoading(false);
    }
  };

  const onOpenCancelMeriendasSubscriptionModal = () => {
    setMeriendasStatusMenuOpen(false);
    setMeriendasSubmitError('');
    setMeriendasSubmitSuccess('');
    setShowMeriendasCancelModal(true);
  };

  const onJoinMeriendasWaitlist = async () => {
    setWaitlistLoading(true);
    setMeriendasSubmitError('');
    try {
      const response = await addToMeriendasWaitlist();
      setWaitlistSuccessMessage(
        response?.data?.message || 'Cuando el servicio esté disponible en tu colegio, te avisaremos por aquí.'
      );
      setShowWaitlistSuccessModal(true);
    } catch (requestError) {
      setMeriendasSubmitError(
        requestError?.response?.data?.message || requestError?.message || 'No se pudo agregar a la lista de espera.'
      );
    } finally {
      setWaitlistLoading(false);
    }
  };

  const onCancelMeriendasSubscription = async () => {
    if (!meriendaSubscription?._id) {
      setMeriendasSubmitError('No se encontró una suscripción activa para cancelar.');
      return;
    }

    setMeriendasSubmitLoading(true);
    setMeriendasSubmitError('');
    setMeriendasSubmitSuccess('');
    setMeriendasStatusMenuOpen(false);

    try {
      await cancelParentMeriendasSubscription(meriendaSubscription._id);
      setMeriendasSubmitSuccess('Suscripción de meriendas cancelada correctamente.');
      setShowMeriendasCancelModal(false);
      await loadMeriendasData();
    } catch (requestError) {
      setMeriendasSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo cancelar la suscripción de meriendas.');
    } finally {
      setMeriendasSubmitLoading(false);
    }
  };

  const onDeleteSavedCard = async (cardId) => {
    if (!cardId) {
      return;
    }

    setDeletingCardId(String(cardId));
    setSavedCardsError('');

    try {
      await deleteParentCardPaymentMethod(cardId);
      setCardMenuOpenId('');
      await loadSavedCards();
    } catch (requestError) {
      setSavedCardsError(requestError?.response?.data?.message || requestError?.message || 'No se pudo eliminar la tarjeta.');
    } finally {
      setDeletingCardId('');
    }
  };

  const unlockManualCardEntry = () => {
    if (!manualCardEntryEnabled) {
      setManualCardEntryEnabled(true);
    }
  };

  const renderProfileIcon = (icon) => {
    if (icon === 'user') {
      return (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 12a5 5 0 1 0-5-5a5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.1-8 4.6V21h16v-2.4C20 16.1 16.4 14 12 14Z" fill="currentColor"/>
        </svg>
      );
    }
    if (icon === 'wallet') {
      return (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 7a3 3 0 0 1 3-3h11a1 1 0 0 1 0 2H6a1 1 0 0 0 0 2h13a2 2 0 0 1 2 2v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Zm14 5a1.5 1.5 0 1 0 1.5 1.5A1.5 1.5 0 0 0 17 12Z" fill="currentColor"/>
        </svg>
      );
    }
    if (icon === 'home') {
      return (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="m12 3l9 7h-2v10h-5v-6h-4v6H5V10H3l9-7Z" fill="currentColor"/>
        </svg>
      );
    }
    if (icon === 'food-menu') {
      return (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 4h2v7a1 1 0 0 0 2 0V4h2v7a3 3 0 0 1-2 2.82V20H6v-6.18A3 3 0 0 1 4 11V4Zm10 0a4 4 0 0 1 4 4v12h-2v-5h-4v5h-2V8a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v5h4V8a2 2 0 0 0-2-2Z" fill="currentColor"/>
        </svg>
      );
    }
    if (icon === 'ticket') {
      return (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Zm7 3v2h2V9h-2Zm0 4v2h2v-2h-2Z" fill="currentColor"/>
        </svg>
      );
    }
    if (icon === 'star') {
      return (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="m12 2.5l2.9 6l6.6.9l-4.8 4.6l1.1 6.5L12 17.3l-5.8 3.2l1.1-6.5l-4.8-4.6l6.6-.9L12 2.5Z" fill="currentColor"/>
        </svg>
      );
    }
    if (icon === 'block') {
      return (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 2.5a7.5 7.5 0 0 1 5.5 2.4L6.9 17.5A7.5 7.5 0 0 1 12 4.5Zm0 15a7.5 7.5 0 0 1-5.5-2.4L17.1 6.5A7.5 7.5 0 0 1 12 19.5Z" fill="currentColor"/>
        </svg>
      );
    }
    if (icon === 'limit') {
      return (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 3a9 9 0 1 0 9 9a9 9 0 0 0-9-9Zm1 4v5.4l3.6 2.2l-1 1.6L11 13.3V7h2Z" fill="currentColor"/>
        </svg>
      );
    }
    if (icon === 'sparkles') {
      return (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2.5a1 1 0 0 1 .96.73l1.12 4.04l4.03 1.12a1 1 0 0 1 0 1.93l-4.03 1.12l-1.12 4.04a1 1 0 0 1-1.92 0l-1.12-4.04l-4.03-1.12a1 1 0 0 1 0-1.93l4.03-1.12l1.12-4.04A1 1 0 0 1 12 2.5Zm6.5 11.5a.75.75 0 0 1 .72.54l.5 1.76l1.76.5a.75.75 0 0 1 0 1.44l-1.76.5l-.5 1.76a.75.75 0 0 1-1.44 0l-.5-1.76l-1.76-.5a.75.75 0 0 1 0-1.44l1.76-.5l.5-1.76a.75.75 0 0 1 .72-.54Z" fill="currentColor"/>
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2a10 10 0 0 0-3.2 19.5l1.2-2a2.4 2.4 0 1 1 4 0l1.2 2A10 10 0 0 0 12 2Zm-.1 11.2A2.4 2.4 0 1 1 14.3 11a2.3 2.3 0 0 1-2.4 2.2Z" fill="currentColor"/>
      </svg>
    );
  };

  const drawerHeaderName = overview?.parent?.name || user?.name || user?.username || 'Padre';

  return (
    <div className="parent-mobile-page">
      <header className="parent-topbar">
        <button aria-label="Abrir menu" className="parent-icon-btn" onClick={() => setDrawerOpen(true)} type="button">
          <span />
          <span />
          <span />
        </button>

        <div className="parent-title-wrap">
          <img className="parent-brand-logo" src={smartLogo} alt="Comergio" />
          <h1>Hola, {headerName}!</h1>
        </div>

        <div className="parent-profile-wrap">
          <button
            aria-expanded={profileMenuOpen}
            aria-haspopup="menu"
            aria-label="Abrir opciones de perfil"
            className="parent-avatar parent-avatar-btn"
            onClick={() => setProfileMenuOpen((prev) => !prev)}
            type="button"
          >
            {parentInitial}
          </button>

          {profileMenuOpen ? (
            <div className="parent-profile-menu" role="menu">
              <button className="logout" onClick={onLogout} type="button">
                <span className="icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm7.6 4.6L16.2 9l2.6 2H9v2h9.8l-2.6 2l1.4 1.4L23 12l-5.4-4.4Z" fill="currentColor"/>
                  </svg>
                </span>
                <span>Cerrar sesión</span>
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <section className="parent-student-switcher">
        <button className="parent-student-toggle" onClick={() => setChildrenOpen((prev) => !prev)} type="button">
          <div>
            <p className="meta">Alumno seleccionado</p>
            <h3>{selectedStudent?.name || 'Sin alumno'}</h3>
            <p>
              {selectedStudent?.grade || 'Sin grado'}
            </p>
          </div>
          <span className={`chevron ${childrenOpen ? 'open' : ''}`}>⌄</span>
        </button>

        {childrenOpen ? (
          <div className="parent-student-options">
            {(overview?.children || []).map((child) => (
              <button key={child._id} onClick={() => onSelectChild(child._id)} type="button">
                <strong>{child.name}</strong>
                <span>
                  {child.grade || 'Sin grado'}
                </span>
              </button>
            ))}
            {(overview?.children || []).length === 0 ? <p className="empty">No hay alumnos vinculados.</p> : null}
          </div>
        ) : null}
      </section>

      <main className="parent-mobile-content">
        {loading ? <div className="parent-loading">Cargando portal...</div> : null}
        {!loading && error ? <div className="parent-error">{error}</div> : null}
        {!loading && !error && walletReturnNotice?.message ? (
          <div className={walletReturnNotice?.type === 'error' ? 'parent-error' : walletReturnNotice?.type === 'success' ? 'parent-success' : 'parent-topup-fee-note'}>
            {walletReturnNotice.message}
          </div>
        ) : null}

        {!loading && !error && isMenuPage ? (
          <section className="parent-menu-page" id="parent-menu-page">
            <h2>Categorías</h2>
            <p className="parent-menu-caption">Bloquea categorías completas o entra para bloquear productos puntuales.</p>

            {categoriesLoading ? <p className="parent-loading">Cargando categorías...</p> : null}
            {!categoriesLoading && categoriesError ? <p className="parent-error">{categoriesError}</p> : null}
            {!categoriesLoading && !categoriesError && blockActionError ? <p className="parent-error">{blockActionError}</p> : null}

            {!categoriesLoading && !categoriesError ? (
              <div className="parent-categories-grid">
                {categories.map((category) => (
                  <article
                    className="parent-category-card"
                    key={category._id}
                    onClick={() => navigate(`/parent/menu/${encodeURIComponent(String(category._id))}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/parent/menu/${encodeURIComponent(String(category._id))}`);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="parent-category-image-wrap">
                      {category.imageUrl ? (
                        <img alt={category.name} decoding="async" loading="lazy" src={category.thumbUrl || category.imageUrl} />
                      ) : (
                        <div className="parent-category-image-fallback">{String(category.name || 'C').charAt(0).toUpperCase()}</div>
                      )}
                    </div>
                    <h3>{category.name || 'Sin nombre'}</h3>
                    <div className="parent-category-actions">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleBlock('category', category._id, !blockedCategoryIds.has(String(category._id)));
                        }}
                        type="button"
                      >
                        {blockingTargetKey === `category:${category._id}`
                          ? 'Guardando...'
                          : blockedCategoryIds.has(String(category._id))
                            ? 'Desbloquear categoría'
                            : 'Bloquear categoría'}
                      </button>
                    </div>
                  </article>
                ))}

                {categories.length === 0 ? <p className="empty">No hay categorías activas creadas por el administrador.</p> : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {!loading && !error && isMenuProductsPage ? (
          <section className="parent-menu-products-page">
            <div className="parent-menu-products-head">
              <button
                aria-label="Volver a categorías"
                className="parent-back-btn"
                onClick={() => navigate('/parent/menu')}
                type="button"
              >
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
                </svg>
              </button>
              <h2>Productos</h2>
            </div>

            <p className="parent-menu-products-category">{selectedMenuCategory?.name || 'Categoría'}</p>
            {blockActionError ? <p className="parent-error">{blockActionError}</p> : null}

            {menuProductsLoading ? <p className="parent-loading">Cargando productos...</p> : null}
            {!menuProductsLoading && menuProductsError ? <p className="parent-error">{menuProductsError}</p> : null}

            {!menuProductsLoading && !menuProductsError ? (
              <div className="parent-products-list">
                {menuProducts.map((product) => (
                  <article className="parent-product-row" key={product._id}>
                    <div className="parent-product-thumb-wrap">
                      {product.imageUrl ? (
                        <img alt={product.name} decoding="async" loading="lazy" src={product.thumbUrl || product.imageUrl} />
                      ) : (
                        <div className="parent-product-thumb-fallback">{String(product.name || 'P').charAt(0).toUpperCase()}</div>
                      )}
                    </div>

                    <div className="parent-product-content">
                      <h3>{product.name || 'Sin nombre'}</h3>
                      <p>{product.shortDescription || 'Sin descripcion corta'}</p>
                      <div className="parent-product-bottom-row">
                        <strong>{formatCurrency(product.price || 0)}</strong>
                        <button
                          className={`parent-block-btn ${blockedProductIds.has(String(product._id)) ? 'is-blocked' : ''}`}
                          onClick={() => onToggleBlock('product', product._id, !blockedProductIds.has(String(product._id)))}
                          type="button"
                        >
                          {blockingTargetKey === `product:${product._id}`
                            ? 'Guardando...'
                            : blockedProductIds.has(String(product._id))
                              ? 'Desbloquear producto'
                              : 'Bloquear producto'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}

                {menuProducts.length === 0 ? <p className="empty">No hay productos activos en esta categoría.</p> : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {!loading && !error && isHistoryPage ? (
          <section className="parent-history-page">
            <h2>Historial de órdenes</h2>
            <p className="parent-history-student">
              Alumno seleccionado: <strong>{selectedStudent?.name || 'Sin alumno'}</strong>
            </p>

            <div className="parent-history-filters">
              <label>
                Desde
                <input
                  type="date"
                  value={historyFilters.from}
                  onChange={(event) => setHistoryFilters((prev) => ({ ...prev, from: event.target.value }))}
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  value={historyFilters.to}
                  onChange={(event) => setHistoryFilters((prev) => ({ ...prev, to: event.target.value }))}
                />
              </label>
              <div className="parent-history-filter-actions">
                <button onClick={() => loadOrdersHistory(historyFilters)} type="button">
                  Aplicar filtros
                </button>
                <button
                  onClick={() => {
                    const cleared = { from: '', to: '' };
                    setHistoryFilters(cleared);
                    loadOrdersHistory(cleared);
                  }}
                  type="button"
                >
                  Limpiar
                </button>
              </div>
            </div>

            {historyOrdersLoading ? <p className="parent-loading">Cargando órdenes...</p> : null}
            {!historyOrdersLoading && historyOrdersError ? <p className="parent-error">{historyOrdersError}</p> : null}

            {!historyOrdersLoading && !historyOrdersError ? (
              <div className="parent-history-list parent-history-list-scroll">
                {historyOrders.map((order) => (
                  <article
                    key={order._id}
                    className="is-clickable"
                    onClick={() => onOpenOrderDetail(order)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onOpenOrderDetail(order);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div>
                      <strong className="amount-negative">- {formatCurrency(order.total)}</strong>
                      <p>{order.storeName || 'Tienda'}</p>
                    </div>
                    <div>
                      <small>{order.itemsCount} items</small>
                      <p>{formatDateTime(order.createdAt)}</p>
                    </div>
                  </article>
                ))}

                {historyOrders.length === 0 ? <p className="empty">No hay órdenes para el rango seleccionado.</p> : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {!loading && !error && isTopupsPage ? (
          <section className="parent-topups-page" id="parent-topups-section">
            <h2>Billetera</h2>
            <p className="parent-topups-subtitle">Gestiona y monitorea las recargas del alumno seleccionado.</p>

            <p className="parent-topups-student">Alumno: <strong>{selectedStudent?.name || 'Sin alumno'}</strong></p>

            <div className="parent-topups-balance-card">
              <p className="parent-topups-kicker">Saldo disponible</p>
              <h3>{formatCurrency(selectedStudent?.wallet?.balance || 0)}</h3>
              <div className="parent-topups-pill">
                <span className="dot" aria-hidden="true" />
                <span>Recarga mínima sugerida {formatCurrency(minimumBoldRecharge)}</span>
              </div>
            </div>

            <div className="parent-topups-actions parent-topups-actions-single">
              <button onClick={() => navigate('/parent/recargas/metodos/epayco')} type="button">
                <span className="parent-topups-action-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V4a1 1 0 0 1 1-1Z" fill="currentColor"/>
                  </svg>
                </span>
                <span>Recargar saldo</span>
              </button>
            </div>

            <section className="parent-section">
              <h3>Ultimas recargas</h3>
              <div className="parent-list parent-list-scroll">
                {(overview?.recentTopups || []).map((topup) => (
                  <article key={topup._id}>
                    <div>
                      <strong className={Number(topup.amount || 0) < 0 ? 'amount-negative' : 'amount-positive'}>
                        {formatSignedCurrency(topup.amount)}
                      </strong>
                      {String(topup.notes || '').trim() ? <p className="parent-amount-reason">{topup.notes}</p> : null}
                      <p>{topup.student?.name || 'Alumno'}</p>
                    </div>
                    <div>
                      <small>{topup.method || 'recarga'}</small>
                      <p>{formatDateTime(topup.createdAt)}</p>
                    </div>
                  </article>
                ))}
                {(overview?.recentTopups || []).length === 0 ? <p className="empty">No hay recargas registradas para los alumnos vinculados.</p> : null}
              </div>
            </section>
          </section>
        ) : null}

        {!loading && !error && isMeriendasPage ? (
          <section className="parent-meriendas-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver</span>
            </button>

            <h2>Meriendas</h2>
            <p className="parent-meriendas-coming-soon">(Próximamente)</p>
            <p className="parent-meriendas-subtitle">
              Fomentemos en <strong>{selectedStudentFirstName}</strong> una alimentacion saludable desde temprana edad con meriendas equilibradas que apoyan su desarrollo y energia durante el dia.
            </p>

            {meriendasLoading ? <p className="parent-loading">Cargando información de meriendas...</p> : null}
            {!meriendasLoading && meriendasError ? <p className="parent-error">{meriendasError}</p> : null}

            {!meriendasLoading && !meriendasError ? (
              <>
                {isMeriendasSubscribed ? (
                  <div className="parent-meriendas-status subscribed">
                    <div className="parent-meriendas-status-row">
                      <div>
                        <p>Estado de suscripción</p>
                        <strong>Suscrito</strong>
                      </div>

                      <div className="parent-meriendas-status-menu-wrap">
                        <button
                          aria-expanded={meriendasStatusMenuOpen}
                          aria-label="Más opciones de suscripción"
                          className="parent-meriendas-status-menu-btn"
                          onClick={() => setMeriendasStatusMenuOpen((prev) => !prev)}
                          type="button"
                        >
                          <span />
                          <span />
                          <span />
                        </button>

                        {meriendasStatusMenuOpen ? (
                          <div className="parent-meriendas-status-menu">
                            <button
                              disabled={meriendasSubmitLoading}
                              onClick={onOpenCancelMeriendasSubscriptionModal}
                              type="button"
                            >
                              {meriendasSubmitLoading ? 'Cancelando...' : 'Cancelar servicio'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="parent-meriendas-status pending">
                    <p>Estado de suscripción</p>
                    <strong>Sin suscripción</strong>
                  </div>
                )}

                <section className="parent-meriendas-schedule">
                  <h3>Cronograma de meriendas</h3>
                  <p className="parent-meriendas-schedule-hint">
                    Presiona en cualquier dia para que veas a detalle la programacion de alimentos del dia.
                  </p>
                  <div className="parent-meriendas-calendar-shell">
                    <div className="parent-meriendas-calendar-header">
                      <p>Calendario mensual</p>
                      <strong>{meriendaMonthLabel}</strong>
                    </div>

                    <div className="parent-meriendas-calendar-grid" role="list" aria-label={`Cronograma de meriendas para ${meriendaMonthLabel}`}>
                      {meriendaCalendarWeekdays.map((label, index) => (
                        <div
                          key={`weekday-${label}-${index}`}
                          className="parent-meriendas-calendar-weekday"
                          role="listitem"
                          aria-hidden="true"
                        >
                          {label}
                        </div>
                      ))}

                      {meriendaCalendarCells.map((cell) => {
                        if (cell.empty) {
                          return <div key={cell.key} className="parent-meriendas-calendar-empty" aria-hidden="true" />;
                        }

                        return (
                          <button
                            key={cell.key}
                            className={`parent-meriendas-calendar-day${cell.isToday ? ' is-today' : ''}`}
                            onClick={() => navigate(`/parent/meriendas/dia/${cell.day}`)}
                            type="button"
                            role="listitem"
                            aria-label={`Ver detalle de merienda del dia ${cell.day}`}
                          >
                            <span className="day-number">{cell.day}</span>

                            {cell.item?.firstSnack?.title ? (
                              <span className="day-chip primary" title={cell.item.firstSnack.title}>
                                {cell.item.firstSnack.title}
                              </span>
                            ) : null}

                            {cell.item?.secondSnack?.title ? (
                              <span className="day-chip secondary" title={cell.item.secondSnack.title}>
                                {cell.item.secondSnack.title}
                              </span>
                            ) : null}

                            {!cell.item?.firstSnack?.title && !cell.item?.secondSnack?.title ? (
                              <span className="day-chip empty">Sin merienda</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <section className="parent-meriendas-form">
                  <h3>Restricciones alimentarias</h3>

                  <label>
                    ¿Qué alimentos no puede consumir?
                    <textarea
                      placeholder="Ej: leche, maní, mariscos"
                      value={meriendasRestrictionsText}
                      onChange={(event) => setMeriendasRestrictionsText(event.target.value)}
                    />
                  </label>

                  <label>
                    Motivo
                    <select
                      value={meriendasRestrictionReason}
                      onChange={(event) => setMeriendasRestrictionReason(event.target.value)}
                    >
                      <option value="">Selecciona un motivo</option>
                      <option value="Alergia">Alergia</option>
                      <option value="Intolerancia">Intolerancia</option>
                      <option value="Dieta especial">Dieta especial</option>
                      <option value="Religión">Religión</option>
                    </select>
                  </label>

                  {isMeriendasSubscribed ? (
                    <label>
                      Comentarios para el Tutor de alimentación
                      <textarea
                        placeholder="Ayúdanos a motivar al niño para que consuma su merienda"
                        value={meriendasParentComments}
                        onChange={(event) => setMeriendasParentComments(event.target.value)}
                      />
                      <button
                        className="parent-meriendas-comment-send-btn"
                        disabled={meriendasSubmitLoading || !String(meriendasParentComments || '').trim()}
                        onClick={onSendMeriendasComment}
                        type="button"
                      >
                        {meriendasSubmitLoading ? 'Enviando...' : 'Enviar'}
                      </button>
                    </label>
                  ) : null}

                  {isMeriendasSubscribed ? (
                    <div className="parent-meriendas-operator-comment">
                      <p>Comentarios del Tutor de alimentación</p>
                      <strong>
                        {meriendasData?.subscription?.operatorComments?.text || 'Aún no hay comentarios del Tutor de alimentación.'}
                      </strong>
                      {meriendasData?.subscription?.operatorComments?.handledByName ? (
                        <small>
                          Por {meriendasData.subscription.operatorComments.handledByName}
                          {meriendasData?.subscription?.operatorComments?.date
                            ? ` - ${meriendasData.subscription.operatorComments.date}`
                            : ''}
                        </small>
                      ) : null}
                    </div>
                  ) : null}
                </section>

                {!isMeriendasSubscribed ? (
                  <div className="parent-meriendas-cost-card">
                    <p>Valor de suscripción mensual</p>
                    <strong>{formatCurrency(meriendasData?.subscriptionCost || 0)}</strong>
                  </div>
                ) : null}

                {!isMeriendasSubscribed ? (
                  <button
                    className="parent-meriendas-submit-btn"
                    disabled={waitlistLoading}
                    onClick={onJoinMeriendasWaitlist}
                    type="button"
                  >
                    {waitlistLoading ? 'Guardando...' : 'Agregarse a la lista de espera'}
                  </button>
                ) : null}

                {showWaitlistSuccessModal ? (
                  <div className="parent-meriendas-cancel-modal-overlay" role="dialog" aria-modal="true" aria-label="Lista de espera meriendas">
                    <div className="parent-meriendas-cancel-modal">
                      <p className="kicker">Comergio Meriendas</p>
                      <h4>¡Te agregamos a la lista!</h4>
                      <p>Cuando el servicio esté disponible en tu colegio, te avisaremos por aquí.</p>
                      <div className="parent-meriendas-cancel-modal-actions">
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() => setShowWaitlistSuccessModal(false)}
                        >
                          Entendido
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {meriendasSubmitError ? <p className="parent-error">{meriendasSubmitError}</p> : null}
                {meriendasSubmitSuccess ? <p className="parent-success">{meriendasSubmitSuccess}</p> : null}

                {showMeriendasCancelModal ? (
                  <div className="parent-meriendas-cancel-modal-overlay" role="dialog" aria-modal="true" aria-label="Cancelar suscripción de meriendas">
                    <div className="parent-meriendas-cancel-modal">
                      <p className="kicker">Comergio Meriendas</p>
                      <h4>¿Cancelar suscripción?</h4>
                      <p>
                        Esta acción desactivará el servicio de meriendas para <strong>{selectedStudentFirstName}</strong> y podrás volver a suscribirlo cuando quieras.
                      </p>
                      <div className="parent-meriendas-cancel-modal-actions">
                        <button
                          className="btn-secondary"
                          disabled={meriendasSubmitLoading}
                          onClick={() => setShowMeriendasCancelModal(false)}
                          type="button"
                        >
                          Volver
                        </button>
                        <button
                          className="btn-danger"
                          disabled={meriendasSubmitLoading}
                          onClick={onCancelMeriendasSubscription}
                          type="button"
                        >
                          {meriendasSubmitLoading ? 'Cancelando...' : 'Sí, cancelar'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        {!loading && !error && isMeriendasDayPage ? (
          <section className="parent-meriendas-day-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/meriendas')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver al cronograma</span>
            </button>

            <h2>Detalle de merienda</h2>
            <p className="parent-meriendas-subtitle">
              {selectedMeriendaDay
                ? `Dia ${selectedMeriendaDay} de ${meriendaMonthLabel}`
                : 'Selecciona un dia desde el cronograma mensual.'}
            </p>

            {meriendasLoading ? <p className="parent-loading">Cargando detalle de merienda...</p> : null}
            {!meriendasLoading && meriendasError ? <p className="parent-error">{meriendasError}</p> : null}

            {!meriendasLoading && !meriendasError ? (
              <div className="parent-meriendas-day-cards">
                {selectedMeriendaDayDetails?.firstSnack ? (
                  <article className="parent-meriendas-day-card">
                    {selectedMeriendaDayDetails.firstSnack.imageUrl ? (
                      <img
                        alt={selectedMeriendaDayDetails.firstSnack.title || 'Snack principal'}
                        decoding="async"
                        loading="lazy"
                        src={selectedMeriendaDayDetails.firstSnack.thumbUrl || selectedMeriendaDayDetails.firstSnack.imageUrl}
                      />
                    ) : (
                      <div className="image-fallback">Snack principal</div>
                    )}
                    <div className="content">
                      <p className="kicker">Snack principal</p>
                      <h3>{selectedMeriendaDayDetails.firstSnack.title || 'Sin titulo'}</h3>
                      <p>{selectedMeriendaDayDetails.firstSnack.description || 'Sin descripcion disponible.'}</p>
                    </div>
                  </article>
                ) : null}

                {selectedMeriendaDayDetails?.secondSnack ? (
                  <article className="parent-meriendas-day-card">
                    {selectedMeriendaDayDetails.secondSnack.imageUrl ? (
                      <img
                        alt={selectedMeriendaDayDetails.secondSnack.title || 'Complemento'}
                        decoding="async"
                        loading="lazy"
                        src={selectedMeriendaDayDetails.secondSnack.thumbUrl || selectedMeriendaDayDetails.secondSnack.imageUrl}
                      />
                    ) : (
                      <div className="image-fallback">Complemento</div>
                    )}
                    <div className="content">
                      <p className="kicker">Complemento</p>
                      <h3>{selectedMeriendaDayDetails.secondSnack.title || 'Sin titulo'}</h3>
                      <p>{selectedMeriendaDayDetails.secondSnack.description || 'Sin descripcion disponible.'}</p>
                    </div>
                  </article>
                ) : null}

                {!selectedMeriendaDayDetails?.firstSnack && !selectedMeriendaDayDetails?.secondSnack ? (
                  <p className="empty">No hay meriendas registradas para este dia.</p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {!loading && !error && isTopupDaviPlataPage ? (
          <section className="parent-topup-davi-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/recargas')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver</span>
            </button>

            <div className="parent-topup-davi-head">
              <h2>Recarga la cuenta de {selectedStudent?.name || 'alumno seleccionado'} con Bold</h2>
            </div>

            <label className="parent-topup-davi-amount">
              ¿Cuánto vas a recargar?
              <input
                min={minimumBoldRecharge}
                step="1000"
                type="number"
                placeholder="Ingrese un valor"
                value={daviAmount}
                onChange={(event) => setDaviAmount(event.target.value)}
              />
            </label>

            <p className="parent-topup-fee-note">
              Monto minimo para recargar: <strong>{formatCurrency(minimumBoldRecharge)}</strong>
            </p>

            {daviAmountNumber > 0 ? (
              <div className="parent-topup-davi-fee-box">
                <p>
                  Valor a recargar: <strong>{formatCurrency(daviAmountNumber)}</strong>
                </p>
                <p>
                  Costo de transacción (1.5%): <strong>{formatCurrency(daviFeeAmount)}</strong>
                </p>
                <p className="total">
                  Total a pagar: <strong>{formatCurrency(daviTotalCharge)}</strong>
                </p>
              </div>
            ) : null}

            <div className="parent-topup-method-selector-wrap">
              <button
                className={`parent-topup-method-selector ${showBoldCardForm ? 'is-selected' : ''}`}
                onClick={openBoldCardModal}
                type="button"
              >
                <span className="parent-topup-method-selector-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v1H3V7Zm0 4h18v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-6Zm3 3a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2H6Z" fill="currentColor"/>
                  </svg>
                </span>
                <span className="parent-topup-method-selector-copy">
                  <strong>Tarjeta de credito o debito</strong>
                  <small>Visa, Mastercard y otras franquicias</small>
                  <small>Si Bold solicita 3DS, te redirigiremos y luego volverás a esta billetera para confirmar la recarga.</small>
                </span>
              </button>
            </div>

            {showBoldCardForm ? (
              <div
                className={`parent-bold-card-modal-overlay ${isBoldCardFormClosing ? 'is-closing' : ''}`}
                onClick={closeBoldCardModal}
                role="dialog"
                aria-modal="true"
                aria-label="Formulario de tarjeta para recarga Bold"
              >
                <div className={`parent-bold-card-modal ${isBoldCardFormClosing ? 'is-closing' : ''}`} onClick={(event) => event.stopPropagation()}>
                  <button
                    aria-label="Cerrar formulario de tarjeta"
                    className="parent-bold-card-modal-close"
                    disabled={daviSubmitLoading}
                    onClick={closeBoldCardModal}
                    type="button"
                  >
                    ×
                  </button>

                  <div className="parent-bold-card-modal-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v1H3V7Zm0 4h18v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-6Zm3 3a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2H6Z" fill="currentColor"/>
                    </svg>
                  </div>

                  <div className="parent-bold-card-modal-head">
                    <h3>Tarjeta de credito o debito</h3>
                    <p>Completa los datos de la tarjeta para continuar con la recarga.</p>
                  </div>

                  <div className="parent-topup-card-form">
                    <label className="parent-topup-davi-amount">
                      Nombre del titular
                      <input
                        type="text"
                        placeholder="Nombre completo"
                        value={boldTopupCardholderName}
                        onChange={(event) => setBoldTopupCardholderName(event.target.value)}
                      />
                    </label>

                    <label className="parent-topup-davi-amount">
                      Número de tarjeta
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="4111 1111 1111 1111"
                        value={boldTopupCardNumber}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, '').slice(0, 19);
                          const chunks = digits.match(/.{1,4}/g) || [];
                          setBoldTopupCardNumber(chunks.join(' '));
                        }}
                      />
                    </label>

                    <div className="parent-topup-davi-grid">
                      <label>
                        Vencimiento
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="MM/AA"
                          value={boldTopupCardExpiry}
                          onChange={(event) => {
                            const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
                            const formatted = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
                            setBoldTopupCardExpiry(formatted);
                          }}
                        />
                      </label>

                      <label>
                        CVV
                        <input
                          type="password"
                          inputMode="numeric"
                          placeholder="123"
                          value={boldTopupCardCvv}
                          onChange={(event) => setBoldTopupCardCvv(event.target.value.replace(/\D/g, '').slice(0, 4))}
                        />
                      </label>
                    </div>
                  </div>

                  <button
                    className="parent-topup-davi-continue"
                    disabled={!canSubmitBoldCardDetails || daviSubmitLoading}
                    onClick={onSubmitBoldCardTopup}
                    type="button"
                  >
                    {daviSubmitLoading ? 'Procesando...' : 'Pagar con tarjeta'}
                  </button>

                  {daviSubmitError ? <p className="parent-error">{daviSubmitError}</p> : null}
                  {daviSubmitSuccess ? <p className="parent-success">{daviSubmitSuccess}</p> : null}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {isBoldResultPage ? (
          <section className="parent-topup-davi-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/recargas')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Ir a recargas</span>
            </button>
            <BoldResultContent />
          </section>
        ) : null}

        {!loading && !error && isTopupEpaycoPage ? (
          <section className="parent-topup-davi-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/recargas')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver</span>
            </button>

            <div className="parent-topup-davi-head">
              <h2>Recarga la cuenta de {selectedStudent?.name || 'alumno seleccionado'} con ePayco</h2>
              <span className="parent-topup-brand-chip is-nequi">ePayco</span>
            </div>

            <p className="parent-topup-davi-caption">
              Abriremos el checkout de ePayco para que completes la recarga y luego volverás a la billetera.
            </p>

            <label className="parent-topup-davi-amount">
              ¿Cuánto vas a recargar?
              <input
                min={minimumBoldRecharge}
                step="1000"
                type="number"
                placeholder="Ingrese un valor"
                value={epaycoAmount}
                onChange={(event) => setEpaycoAmount(event.target.value)}
              />
            </label>

            <p className="parent-topup-fee-note">
              Monto minimo para recargar: <strong>{formatCurrency(minimumBoldRecharge)}</strong>
            </p>

            {epaycoAmountNumber > 0 ? (
              <div className="parent-topup-davi-fee-box">
                <p>
                  Valor a recargar: <strong>{formatCurrency(epaycoAmountNumber)}</strong>
                </p>
                <p>
                  Costo de transacción (1.5%): <strong>{formatCurrency(epaycoFeeAmount)}</strong>
                </p>
                <p className="total">
                  Total a pagar: <strong>{formatCurrency(epaycoTotalCharge)}</strong>
                </p>
              </div>
            ) : null}

            <button
              className="parent-topup-davi-continue"
              disabled={!canContinueEpaycoRecharge || epaycoSubmitLoading}
              onClick={onSubmitEpaycoTopup}
              type="button"
            >
              {epaycoSubmitLoading ? 'Abriendo checkout...' : 'Recarga ahora'}
            </button>

            {epaycoSubmitError ? <p className="parent-error">{epaycoSubmitError}</p> : null}
            {epaycoSubmitSuccess ? <p className="parent-success">{epaycoSubmitSuccess}</p> : null}
          </section>
        ) : null}

        {!loading && !error && isTopupNequiPage ? (
          <section className="parent-topup-davi-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/recargas/metodos')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver</span>
            </button>

            <div className="parent-topup-davi-head">
              <h2>Recarga la cuenta de {selectedStudent?.name || 'alumno seleccionado'} con Nequi</h2>
              <span className="parent-topup-brand-chip is-nequi">Nequi</span>
            </div>

            <p className="parent-topup-davi-caption">
              Bold te redirigirá al flujo de Nequi para completar la recarga y luego volverás a la billetera.
            </p>

            <label className="parent-topup-davi-amount">
              ¿Cuánto vas a recargar?
              <input
                min={minimumBoldRecharge}
                step="1000"
                type="number"
                placeholder="Ingrese un valor"
                value={nequiAmount}
                onChange={(event) => setNequiAmount(event.target.value)}
              />
            </label>

            <p className="parent-topup-fee-note">
              Monto minimo para recargar: <strong>{formatCurrency(minimumBoldRecharge)}</strong>
            </p>

            {nequiAmountNumber > 0 ? (
              <div className="parent-topup-davi-fee-box">
                <p>
                  Valor a recargar: <strong>{formatCurrency(nequiAmountNumber)}</strong>
                </p>
                <p>
                  Costo de transacción (1.5%): <strong>{formatCurrency(nequiFeeAmount)}</strong>
                </p>
                <p className="total">
                  Total a pagar: <strong>{formatCurrency(nequiTotalCharge)}</strong>
                </p>
              </div>
            ) : null}

            <button
              className="parent-topup-davi-continue"
              disabled={!canContinueNequiRecharge || nequiSubmitLoading}
              onClick={onSubmitNequiTopup}
              type="button"
            >
              {nequiSubmitLoading ? 'Redirigiendo...' : 'Continuar con Nequi'}
            </button>

            {nequiSubmitError ? <p className="parent-error">{nequiSubmitError}</p> : null}
            {nequiSubmitSuccess ? <p className="parent-success">{nequiSubmitSuccess}</p> : null}
          </section>
        ) : null}

        {!loading && !error && isTopupPsePage ? (
          <section className="parent-topup-davi-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/recargas/metodos')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver</span>
            </button>

            <div className="parent-topup-davi-head">
              <h2>Recarga la cuenta de {selectedStudent?.name || 'alumno seleccionado'} con PSE</h2>
              <img alt="PSE" src={pseLogo} />
            </div>

            <label className="parent-topup-davi-amount">
              ¿Cuánto vas a recargar?
              <input
                min={minimumBoldRecharge}
                step="1000"
                type="number"
                placeholder="Ingrese un valor"
                value={pseAmount}
                onChange={(event) => setPseAmount(event.target.value)}
              />
            </label>

            <label className="parent-topup-davi-amount">
              Banco PSE
              <select
                disabled={pseBanksLoading || !pseBanks.length}
                value={pseSelectedBankCode}
                onChange={(event) => setPseSelectedBankCode(event.target.value)}
              >
                <option value="">{pseBanksLoading ? 'Cargando bancos...' : 'Selecciona un banco'}</option>
                {pseBanks.map((bank) => (
                  <option key={bank.bankCode} value={bank.bankCode}>
                    {bank.bankName}
                  </option>
                ))}
              </select>
            </label>

            <p className="parent-topup-fee-note">
              Monto minimo para recargar: <strong>{formatCurrency(minimumBoldRecharge)}</strong>
            </p>

            {!pseBanksLoading && !pseBanks.length ? (
              <p className="parent-error">No pudimos cargar los bancos PSE disponibles en este momento.</p>
            ) : null}

            {pseAmountNumber > 0 ? (
              <div className="parent-topup-davi-fee-box">
                <p>
                  Valor a recargar: <strong>{formatCurrency(pseAmountNumber)}</strong>
                </p>
                <p>
                  Costo de transacción (1.5%): <strong>{formatCurrency(pseFeeAmount)}</strong>
                </p>
                <p className="total">
                  Total a pagar: <strong>{formatCurrency(pseTotalCharge)}</strong>
                </p>
              </div>
            ) : null}

            <button
              className="parent-topup-davi-continue"
              disabled={!canContinuePseRecharge || pseSubmitLoading}
              onClick={onSubmitPseTopup}
              type="button"
            >
              {pseSubmitLoading ? 'Enviando...' : 'Continuar'}
            </button>

            {pseSubmitError ? <p className="parent-error">{pseSubmitError}</p> : null}
            {pseSubmitSuccess ? <p className="parent-success">{pseSubmitSuccess}</p> : null}
          </section>
        ) : null}

        {!loading && !error && isTopupBancolombiaPage ? (
          <section className="parent-topup-davi-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/recargas/metodos')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver</span>
            </button>

            <div className="parent-topup-davi-head">
              <h2>Recarga la cuenta de {selectedStudent?.name || 'alumno seleccionado'} con Bancolombia</h2>
              <img alt="Bancolombia" src={bancolombiaLogo} />
            </div>

            <label className="parent-topup-davi-amount">
              ¿Cuánto vas a recargar?
              <input
                min={minimumBoldRecharge}
                step="1000"
                type="number"
                placeholder="Ingrese un valor"
                value={bancolombiaAmount}
                onChange={(event) => setBancolombiaAmount(event.target.value)}
              />
            </label>

            <p className="parent-topup-fee-note">
              Monto minimo para recargar: <strong>{formatCurrency(minimumBoldRecharge)}</strong>
            </p>

            {bancolombiaAmountNumber > 0 ? (
              <div className="parent-topup-davi-fee-box">
                <p>
                  Valor a recargar: <strong>{formatCurrency(bancolombiaAmountNumber)}</strong>
                </p>
                <p>
                  Costo de transacción (1.5%): <strong>{formatCurrency(bancolombiaFeeAmount)}</strong>
                </p>
                <p className="total">
                  Total a pagar: <strong>{formatCurrency(bancolombiaTotalCharge)}</strong>
                </p>
              </div>
            ) : null}

            <button
              className="parent-topup-davi-continue"
              disabled={!canContinueBancolombiaRecharge || bancolombiaSubmitLoading}
              onClick={onSubmitBancolombiaTopup}
              type="button"
            >
              {bancolombiaSubmitLoading ? 'Enviando...' : 'Continuar'}
            </button>

            {bancolombiaSubmitError ? <p className="parent-error">{bancolombiaSubmitError}</p> : null}
            {bancolombiaSubmitSuccess ? <p className="parent-success">{bancolombiaSubmitSuccess}</p> : null}
          </section>
        ) : null}

        {!loading && !error && isTopupBrebPage ? (
          <section className="parent-topup-davi-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/recargas/metodos')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver</span>
            </button>

            <div className="parent-topup-davi-head">
              <h2>Recarga la cuenta de {selectedStudent?.name || 'alumno seleccionado'} con Bre-B</h2>
              <img alt="Bre-B" src={brebLogo} />
            </div>

            <label className="parent-topup-davi-amount">
              ¿Cuánto vas a recargar?
              <input
                min="1"
                step="1000"
                type="number"
                placeholder="Ingrese un valor"
                value={brebAmount}
                onChange={(event) => setBrebAmount(event.target.value)}
              />
            </label>

            {brebAmountNumber > 0 ? (
              <div className="parent-topup-davi-fee-box">
                <p>
                  Valor a recargar: <strong>{formatCurrency(brebAmountNumber)}</strong>
                </p>
                <p>
                  Costo de transacción (1.5%): <strong>{formatCurrency(brebFeeAmount)}</strong>
                </p>
                <p className="total">
                  Total a pagar: <strong>{formatCurrency(brebTotalCharge)}</strong>
                </p>
              </div>
            ) : null}

            <button
              className="parent-topup-davi-continue"
              disabled={!canContinueBrebRecharge || brebSubmitLoading}
              onClick={onSubmitBrebTopup}
              type="button"
            >
              {brebSubmitLoading ? 'Enviando...' : 'Continuar'}
            </button>

            {brebSubmitError ? <p className="parent-error">{brebSubmitError}</p> : null}
            {brebSubmitSuccess ? <p className="parent-success">{brebSubmitSuccess}</p> : null}
          </section>
        ) : null}

        {!loading && !error && isAddCardPage ? (
          <section className="parent-add-card-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/recargas')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver</span>
            </button>

            <h2>Agrega una tarjeta crédito o débito</h2>

            <form
              className="parent-add-card-form"
              onSubmit={onSubmitAddCardForm}
              autoComplete="off"
              onFocusCapture={unlockManualCardEntry}
              onPointerDown={unlockManualCardEntry}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
            >
              <input
                aria-hidden="true"
                autoComplete="username"
                name="fake-username"
                tabIndex={-1}
                type="text"
                style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, width: 0 }}
              />
              <input
                aria-hidden="true"
                autoComplete="new-password"
                name="fake-password"
                tabIndex={-1}
                type="password"
                style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, width: 0 }}
              />

              <label className="parent-card-field">
                Número de la tarjeta
                <input
                  type="text"
                  name="acc-field-01"
                  autoComplete="new-password"
                  placeholder="XXXX XXXX XXXX XXXX"
                  value={cardNumber}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, '').slice(0, 19);
                    const chunks = digits.match(/.{1,4}/g) || [];
                    setCardNumber(chunks.join(' '));
                  }}
                  inputMode="numeric"
                  spellCheck={false}
                  readOnly={!manualCardEntryEnabled}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                />
              </label>

              <div className="parent-card-field-grid">
                <label className="parent-card-field">
                  Fecha de vencimiento
                  <input
                    type="text"
                    name="acc-field-02"
                    autoComplete="new-password"
                    placeholder="MM / YY"
                    value={cardExpiry}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '').slice(0, 4);
                      const formatted = digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
                      setCardExpiry(formatted);
                    }}
                    inputMode="numeric"
                    spellCheck={false}
                    readOnly={!manualCardEntryEnabled}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                  />
                </label>

                <label className="parent-card-field">
                  CVV
                  <input
                    type="text"
                    name="acc-field-03"
                    autoComplete="new-password"
                    placeholder="XXX"
                    value={cardCvv}
                    onChange={(event) => setCardCvv(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    spellCheck={false}
                    readOnly={!manualCardEntryEnabled}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                  />
                </label>
              </div>

              <label className="parent-card-field">
                Nombres
                <input
                  type="text"
                  name="acc-field-04"
                  autoComplete="new-password"
                  value={cardFirstName}
                  onChange={(event) => setCardFirstName(event.target.value)}
                  readOnly={!manualCardEntryEnabled}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                />
              </label>

              <label className="parent-card-field">
                Apellidos
                <input
                  type="text"
                  name="acc-field-05"
                  autoComplete="new-password"
                  value={cardLastName}
                  onChange={(event) => setCardLastName(event.target.value)}
                  readOnly={!manualCardEntryEnabled}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                />
              </label>

              <div className="parent-card-field-grid">
                <label className="parent-card-field">
                  Tipo de documento
                  <select
                    name="acc-field-06"
                    autoComplete="off"
                    value={cardDocType}
                    onChange={(event) => setCardDocType(event.target.value)}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                  >
                    <option value="CC">CC</option>
                    <option value="TI">TI</option>
                    <option value="CE">CE</option>
                    <option value="NIT">NIT</option>
                    <option value="PP">PP</option>
                  </select>
                </label>

                <label className="parent-card-field">
                  Documento
                  <input
                    type="text"
                    name="acc-field-07"
                    autoComplete="new-password"
                    value={cardDocument}
                    onChange={(event) => setCardDocument(event.target.value.replace(/\D/g, '').slice(0, 20))}
                    inputMode="numeric"
                    spellCheck={false}
                    readOnly={!manualCardEntryEnabled}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                  />
                </label>
              </div>

              <button
                className="parent-card-continue-btn"
                disabled={!canContinueAddCard || addCardLoading}
                type="submit"
              >
                {addCardLoading ? 'Guardando...' : 'Agregar y continuar'}
              </button>
            </form>

            <p className="parent-card-secure-note">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2a5 5 0 0 0-5 5v2H6a2 2 0 0 0-2 2v8a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 7V7a3 3 0 1 1 6 0v2H9Zm3 4a1.5 1.5 0 0 1 1.5 1.5a1.5 1.5 0 0 1-.75 1.3V18a.75.75 0 0 1-1.5 0v-2.2A1.5 1.5 0 0 1 12 13Z" fill="currentColor"/>
                </svg>
              </span>
              Información encriptada y segura
            </p>

            {addCardError ? <p className="parent-error">{addCardError}</p> : null}
            {addCardSuccess ? <p className="parent-success">{addCardSuccess}</p> : null}
          </section>
        ) : null}

        {!loading && !error && isLimitPage ? (
          <section className="parent-limit-page" id="student-control">
            <h2>Limitar consumo diario</h2>
            <p className="parent-limit-student">
              Alumno seleccionado: <strong>{selectedStudent?.name || 'Sin alumno'}</strong>
            </p>

            <div className="parent-limit-card">
              <label htmlFor="daily-limit-input">
                Tope diario (COP)
                <input
                  id="daily-limit-input"
                  min="0"
                  step="100"
                  type="number"
                  value={dailyLimitDraft}
                  onChange={(event) => setDailyLimitDraft(event.target.value)}
                />
              </label>
              <p className="parent-limit-hint">
                Valor actual: <strong>{formatCurrency(selectedStudent?.dailyLimit || 0)}</strong>
              </p>

              {dailyLimitError ? <p className="parent-error">{dailyLimitError}</p> : null}

              <div className="parent-limit-actions">
                <button
                  disabled={dailyLimitSaving}
                  onClick={() => onSaveDailyLimit(dailyLimitDraft)}
                  type="button"
                >
                  {dailyLimitSaving ? 'Guardando...' : 'Guardar tope'}
                </button>
                <button
                  disabled={dailyLimitSaving}
                  onClick={() => onSaveDailyLimit(0)}
                  type="button"
                >
                  Quitar tope
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && !error && isGioIaPage ? (
          <section className="parent-gio-page">
            <h2>GIO - IA</h2>
            <p className="parent-gio-subtitle">
              Conversa con GIO sobre el consumo de <strong>{selectedStudent?.name || 'tu hijo'}</strong>.
            </p>

            <div className="parent-gio-thread" role="log" aria-live="polite">
              {gioMessages.map((item, index) => (
                <article
                  key={`${item.role}-${index}`}
                  className={`parent-gio-bubble ${item.role === 'user' ? 'is-user' : 'is-assistant'}`}
                >
                  <p>{item.content}</p>
                </article>
              ))}

              {gioSending ? (
                <article className="parent-gio-bubble is-assistant">
                  <p>Analizando consumo...</p>
                </article>
              ) : null}

              <div ref={gioThreadEndRef} />
            </div>

            <div className="parent-gio-input-wrap">
              <textarea
                placeholder="Ej: ¿Qué consumió Oliver el 10 de marzo?"
                value={gioInput}
                onChange={(event) => setGioInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    onSendGioMessage();
                  }
                }}
              />
              <button type="button" onClick={onSendGioMessage} disabled={gioSending || !String(gioInput || '').trim()}>
                {gioSending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>

            {gioError ? <p className="parent-error">{gioError}</p> : null}
          </section>
        ) : null}

        {!loading && !error && !isMenuRoute && !isTopupsPage && !isTopupMethodsPage && !isTopupDaviPlataPage && !isTopupEpaycoPage && !isTopupNequiPage && !isTopupPsePage && !isTopupBancolombiaPage && !isTopupBrebPage && !isAddCardPage && !isAutoTopupPage && !isMeriendasPage && !isMeriendasDayPage && !isHistoryPage && !isLimitPage && !isGioIaPage ? (
          <>
            <section className="parent-balance-hero" id="parent-balance-section">
              <p className="meta">Saldo actual</p>
              <h2>{formatCurrency(selectedStudent?.wallet?.balance || 0)}</h2>
              <p>
                Alumno: <strong>{selectedStudent?.name || 'N/A'}</strong>
              </p>
            </section>

            <section className="parent-spending-cards">
              <article className="parent-mini-card">
                <p>Compras del día</p>
                <h4>{formatCurrency(overview?.spending?.day || 0)}</h4>
              </article>
              <article className="parent-mini-card">
                <p>Compras de la semana</p>
                <h4>{formatCurrency(overview?.spending?.week || 0)}</h4>
              </article>
              <article className="parent-mini-card">
                <p>Compras del mes</p>
                <h4>{formatCurrency(overview?.spending?.month || 0)}</h4>
              </article>
            </section>

            <section className="parent-section" id="parent-orders-section">
              <h3>Últimas órdenes del alumno</h3>
              <div className="parent-list">
                {(overview?.recentOrders || []).map((order) => (
                  <article
                    key={order._id}
                    className="is-clickable"
                    onClick={() => onOpenOrderDetail(order)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onOpenOrderDetail(order);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <div>
                      <strong className="amount-negative">- {formatCurrency(order.total)}</strong>
                      <p>{order.storeName || 'Tienda'}</p>
                    </div>
                    <div>
                      <small>{order.itemsCount} items</small>
                      <p>{formatDateTime(order.createdAt)}</p>
                    </div>
                  </article>
                ))}
                {(overview?.recentOrders || []).length === 0 ? <p className="empty">No hay órdenes recientes para este alumno.</p> : null}
              </div>
            </section>

            <section className="parent-section" id="parent-topups-section">
              <h3>Últimas recargas</h3>
              <div className="parent-list">
                {(overview?.recentTopups || []).slice(0, 5).map((topup) => (
                  <article key={topup._id}>
                    <div>
                      <strong className={Number(topup.amount || 0) < 0 ? 'amount-negative' : 'amount-positive'}>
                        {formatSignedCurrency(topup.amount)}
                      </strong>
                      {String(topup.notes || '').trim() ? <p className="parent-amount-reason">{topup.notes}</p> : null}
                      <p>{topup.student?.name || 'Alumno'}</p>
                    </div>
                    <div>
                      <small>{topup.method}</small>
                      <p>{formatDateTime(topup.createdAt)}</p>
                    </div>
                  </article>
                ))}
                {(overview?.recentTopups || []).length === 0 ? <p className="empty">No hay recargas registradas para los alumnos vinculados.</p> : null}
              </div>
            </section>

            <section className="parent-section" id="student-control">
              <h3>Información del alumno</h3>
              <div className="parent-info-grid">
                <p className="parent-info-editable-card">
                  <span>Curso</span>
                  {!gradeEditOpen ? (
                    <>
                      <strong>{selectedStudent?.grade || 'N/A'}</strong>
                      <button
                        type="button"
                        className="parent-info-inline-button"
                        onClick={() => {
                          setGradeDraft(String(selectedStudent?.grade || ''));
                          setGradeError('');
                          setGradeEditOpen(true);
                        }}
                      >
                        Editar curso
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={gradeDraft}
                        onChange={(event) => setGradeDraft(event.target.value)}
                        maxLength={40}
                        placeholder="Ej: 5A"
                      />
                      <div className="parent-info-inline-actions">
                        <button type="button" onClick={onSaveStudentGrade} disabled={gradeSaving}>
                          {gradeSaving ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setGradeDraft(String(selectedStudent?.grade || ''));
                            setGradeError('');
                            setGradeEditOpen(false);
                          }}
                          disabled={gradeSaving}
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  )}
                </p>
                <p>
                  <span>Límite diario</span>
                  <strong>{formatCurrency(selectedStudent?.dailyLimit || 0)}</strong>
                </p>
                <p>
                  <span>Productos bloqueados</span>
                  <strong>{selectedStudent?.blockedProductsCount || 0}</strong>
                </p>
                <p>
                  <span>Categorías bloqueadas</span>
                  <strong>{selectedStudent?.blockedCategoriesCount || 0}</strong>
                </p>
              </div>
              {gradeError ? <p className="parent-error">{gradeError}</p> : null}
              <div className="parent-tags-wrap">
                {(selectedStudent?.blockedProducts || []).slice(0, 6).map((item) => (
                  <span key={item._id} className="parent-tag">
                    {item.name}
                  </span>
                ))}
                {(selectedStudent?.blockedCategories || []).slice(0, 6).map((item) => (
                  <span key={item._id} className="parent-tag secondary">
                    Cat: {item.name}
                  </span>
                ))}
                {(selectedStudent?.blockedProducts || []).length === 0 && (selectedStudent?.blockedCategories || []).length === 0 ? (
                  <p className="empty">Este alumno no tiene bloqueos activos.</p>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </main>

      {selectedOrderDetail ? (
        <div className="parent-order-detail-overlay" onClick={onCloseOrderDetail} role="dialog" aria-modal="true" aria-label="Detalle de orden">
          <div className="parent-order-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="parent-order-detail-header">
              <h3>Detalle de orden</h3>
              <button type="button" onClick={onCloseOrderDetail} aria-label="Cerrar detalle">
                X
              </button>
            </div>

            <p className="parent-order-detail-meta">
              Hora: <strong>{formatDateTime(selectedOrderDetail.createdAt)}</strong>

              {showWaitlistSuccessModal ? (
                <div className="parent-meriendas-cancel-modal-overlay" role="dialog" aria-modal="true" aria-label="Lista de espera meriendas">
                  <div className="parent-meriendas-cancel-modal">
                    <p className="kicker">Comergio Meriendas</p>
                    <h4>¡Te agregamos a la lista!</h4>
                    <p>{waitlistSuccessMessage || 'Cuando el servicio esté disponible en tu colegio, te avisaremos por aquí.'}</p>
                    <div className="parent-meriendas-cancel-modal-actions">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => setShowWaitlistSuccessModal(false)}
                      >
                        Entendido
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </p>
            <p className="parent-order-detail-meta">
              Tienda: <strong>{selectedOrderDetail.storeName || 'Tienda'}</strong>
            </p>

            <div className="parent-order-detail-items">
              {(selectedOrderDetail.items || []).map((item, index) => (
                <article key={`${item.name}-${index}`}>
                  <div>
                    <strong>{item.name || 'Producto'}</strong>
                    <p>{Number(item.quantity || 0)} x {formatCurrency(item.unitPrice || 0)}</p>
                  </div>
                  <strong>{formatCurrency(item.subtotal || 0)}</strong>
                </article>
              ))}

              {(selectedOrderDetail.items || []).length === 0 ? (
                <p className="empty">No hay detalle de productos disponible para esta orden.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showCardVerificationModal ? (
        <div className="parent-card-verification-overlay" role="dialog" aria-modal="true" aria-label="Verificación de tarjeta">
          <div className="parent-card-verification-modal">
            <button
              aria-label="Cerrar verificación"
              className="parent-card-verification-close"
              disabled={cardVerificationSubmitting}
              onClick={closeCardVerificationModal}
              type="button"
            >
              ×
            </button>

            <div className="parent-card-verification-icon" aria-hidden="true">
              {cardVerificationStep === 'intro' ? (
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2 5 5v6c0 5 3.2 9.7 7 11 3.8-1.3 7-6 7-11V5l-7-3Zm-1 12.1-2.2-2.2 1.4-1.4 1.1 1.1 2.9-2.9 1.4 1.4-4.3 4Z" fill="currentColor"/>
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2H3V6Zm0 4h14v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Zm18-1h-2v2h2v2h2v-2h2V9h-2V7h-2v2Z" fill="currentColor"/>
                </svg>
              )}
            </div>

            {cardVerificationStep === 'intro' ? (
              <>
                <h3>Vamos a verificar tu tarjeta</h3>
                <p>
                  Para habilitar <strong>{cardVerificationCardLabel || 'tu tarjeta'}</strong>, registra un microcargo temporal y luego
                  confirma el valor exacto en la app.
                </p>
                <div className="parent-card-verification-note">
                  Este monto se usa solo para validar la tarjeta y expira en 24 horas.
                </div>
                <p className="parent-card-secure-note parent-card-verification-secure">
                  <span aria-hidden="true">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2a5 5 0 0 0-5 5v2H6a2 2 0 0 0-2 2v8a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 7V7a3 3 0 1 1 6 0v2H9Z" fill="currentColor"/>
                    </svg>
                  </span>
                  Información encriptada y segura
                </p>
                <button
                  className="parent-card-verification-cta"
                  disabled={cardVerificationSubmitting}
                  onClick={onStartCardVerification}
                  type="button"
                >
                  {cardVerificationSubmitting ? 'Preparando...' : 'Empezar verificación'}
                </button>
              </>
            ) : (
              <>
                <h3>Ingresa el valor del cobro</h3>
                <p>
                  1. Revisa el valor del microcargo en tu app bancaria.<br />
                  2. Ingresa el valor exacto para validar la tarjeta.
                </p>
                <label className="parent-card-verification-input-wrap">
                  <span>$</span>
                  <input
                    inputMode="numeric"
                    placeholder="0"
                    type="text"
                    value={cardVerificationAmount}
                    onChange={(event) => setCardVerificationAmount(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </label>

                {cardVerificationExpiresAt ? (
                  <p className="parent-card-verification-expiration">
                    Válido hasta {new Date(cardVerificationExpiresAt).toLocaleString('es-CO')}.
                  </p>
                ) : null}

                <button
                  className="parent-card-verification-cta"
                  disabled={cardVerificationSubmitting || !String(cardVerificationAmount || '').trim()}
                  onClick={onConfirmCardVerification}
                  type="button"
                >
                  {cardVerificationSubmitting ? 'Validando...' : 'Validar cobro'}
                </button>
              </>
            )}

            {cardVerificationError ? <p className="parent-error">{cardVerificationError}</p> : null}
            {cardVerificationSuccess ? <p className="parent-success">{cardVerificationSuccess}</p> : null}
          </div>
        </div>
      ) : null}

      {drawerOpen ? (
        <div
          className="parent-drawer-backdrop"
          onClick={() => setDrawerOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDrawerOpen(false);
          }}
          role="button"
          tabIndex={0}
        />
      ) : null}
      {profileMenuOpen ? (
        <div
          className="parent-profile-backdrop"
          onClick={() => setProfileMenuOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setProfileMenuOpen(false);
          }}
          role="button"
          tabIndex={0}
        />
      ) : null}
      <aside className={`parent-drawer ${drawerOpen ? 'open' : ''}`}>
        <h3>Hola, {drawerHeaderName}</h3>
        <p className="parent-drawer-subtitle">¿Qué quieres hacer hoy?</p>
        <nav>
          {menuItems.map((item) => (
            <button key={item.key} onClick={() => onRunMenuAction(item.key)} type="button">
              <span className="icon" aria-hidden="true">{renderProfileIcon(item.icon)}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button className="parent-logout-btn" onClick={onLogout} type="button">
          <span className="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5v-2H5V5h5V3Zm7.6 4.6L16.2 9l2.6 2H9v2h9.8l-2.6 2l1.4 1.4L23 12l-5.4-4.4Z" fill="currentColor"/>
            </svg>
          </span>
          <span>Cerrar sesión</span>
        </button>
      </aside>
    </div>
  );
}

export default ParentPortal;
