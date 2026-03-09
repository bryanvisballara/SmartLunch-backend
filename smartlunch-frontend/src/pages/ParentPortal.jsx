import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth.store';
import {
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
  updateParentPortalStudentAutoDebit,
} from '../services/parent.service';
import { createDaviPlataPayment } from '../services/payments.service';
import { getProducts } from '../services/products.service';
import { createMercadoPagoCardToken } from '../lib/mercadopago';
import daviplataLogo from '../assets/daviplata.png';
import bancolombiaLogo from '../assets/bancolombia.png';
import brebLogo from '../assets/breb.png';
import pseLogo from '../assets/PSE.png';
import warningLogo from '../assets/warning.png';
import smartLogo from '../assets/smartlogo.png';

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
    const shortDescription = String(product?.shortDescription || '').trim().toLowerCase();
    const key = `${name}|${categoryId}|${price}|${imageUrl}|${shortDescription}`;

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
  const [historyFilters, setHistoryFilters] = useState({ from: '', to: '' });
  const [blockActionError, setBlockActionError] = useState('');
  const [blockingTargetKey, setBlockingTargetKey] = useState('');
  const [dailyLimitDraft, setDailyLimitDraft] = useState('0');
  const [dailyLimitSaving, setDailyLimitSaving] = useState(false);
  const [dailyLimitError, setDailyLimitError] = useState('');
  const [daviDocType, setDaviDocType] = useState('');
  const [daviDocument, setDaviDocument] = useState('');
  const [daviAmount, setDaviAmount] = useState('');
  const [daviSubmitLoading, setDaviSubmitLoading] = useState(false);
  const [daviSubmitError, setDaviSubmitError] = useState('');
  const [daviSubmitSuccess, setDaviSubmitSuccess] = useState('');
  const [pseAmount, setPseAmount] = useState('');
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

  const isMenuRoute = location.pathname === '/parent/menu' || location.pathname.startsWith('/parent/menu/');
  const isTopupsPage = location.pathname === '/parent/recargas';
  const isTopupMethodsPage = location.pathname === '/parent/recargas/metodos';
  const isTopupDaviPlataPage = location.pathname === '/parent/recargas/metodos/daviplata';
  const isTopupPsePage = location.pathname === '/parent/recargas/metodos/pse';
  const isTopupBancolombiaPage = location.pathname === '/parent/recargas/metodos/bancolombia';
  const isTopupBrebPage = location.pathname === '/parent/recargas/metodos/breb';
  const isAddCardPage = location.pathname === '/parent/recargas/agregar-tarjeta';
  const isAutoTopupPage = location.pathname === '/parent/recargas/automatica';
  const isMeriendasDayPage = /^\/parent\/meriendas\/dia\/\d+$/.test(location.pathname);
  const isMeriendasPage = location.pathname === '/parent/meriendas';
  const isHistoryPage = location.pathname === '/parent/historial-ordenes';
  const isLimitPage = location.pathname === '/parent/limitar-consumo';
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
  const rechargeFeeRate = 0.015;
  const daviAmountNumber = Number(daviAmount || 0);
  const daviFeeAmount = Number.isFinite(daviAmountNumber) && daviAmountNumber > 0
    ? Math.round(daviAmountNumber * rechargeFeeRate)
    : 0;
  const daviTotalCharge = Number.isFinite(daviAmountNumber) && daviAmountNumber > 0
    ? daviAmountNumber + daviFeeAmount
    : 0;
  const pseAmountNumber = Number(pseAmount || 0);
  const pseFeeAmount = Number.isFinite(pseAmountNumber) && pseAmountNumber > 0
    ? Math.round(pseAmountNumber * rechargeFeeRate)
    : 0;
  const pseTotalCharge = Number.isFinite(pseAmountNumber) && pseAmountNumber > 0
    ? pseAmountNumber + pseFeeAmount
    : 0;
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
    daviDocType &&
    String(daviDocument || '').trim().length >= 5 &&
    Number.isFinite(daviAmountNumber) &&
    daviAmountNumber >= 50000 &&
    daviAmountNumber <= 150000
  );
  const canContinuePseRecharge = Boolean(
    Number.isFinite(pseAmountNumber) && pseAmountNumber > 0
  );
  const canContinueBancolombiaRecharge = Boolean(
    Number.isFinite(bancolombiaAmountNumber) && bancolombiaAmountNumber > 0
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
  const mercadopagoPublicKey = String(import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || '').trim();
  const autoTopupMinBalanceNumber = Number(autoTopupMinBalance || 0);
  const autoTopupCustomAmountNumber = Number(autoTopupCustomAmount || 0);
  const autoTopupRechargeAmount = autoTopupPresetAmount === 0 ? autoTopupCustomAmountNumber : autoTopupPresetAmount;
  const autoTopupFeeAmount = Number.isFinite(autoTopupRechargeAmount) && autoTopupRechargeAmount > 0
    ? Math.round(autoTopupRechargeAmount * rechargeFeeRate)
    : 0;
  const verifiedSavedCards = useMemo(
    () => savedCards.filter((card) => {
      const status = String(card?.verificationStatus || 'verified').toLowerCase();
      return status === 'verified';
    }),
    [savedCards]
  );
  const autoTopupSelectedCard = verifiedSavedCards.find((card) => String(card._id) === String(autoTopupSelectedCardId)) || null;
  const canActivateAutoTopup = Boolean(
    autoTopupSelectedCardId &&
    Number.isFinite(autoTopupMinBalanceNumber) &&
    autoTopupMinBalanceNumber >= 20000 &&
    Number.isFinite(autoTopupRechargeAmount) &&
    autoTopupRechargeAmount >= 30000
  );
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
  }, [selectedStudent?._id, selectedStudent?.dailyLimit]);

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
    if ((!isTopupsPage && !isAutoTopupPage) || loading || error) {
      return;
    }

    loadSavedCards();
  }, [isTopupsPage, isAutoTopupPage, loading, error]);

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

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  const onSelectChild = (studentId) => {
    setSelectedStudentId(String(studentId));
    setChildrenOpen(false);
    loadOverview(String(studentId));
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
    }
  };

  const goToAutoTopupPage = () => {
    const targetPath = '/parent/recargas/automatica';
    if (location.pathname === targetPath) {
      return;
    }

    navigate(targetPath);

    // Fallback in case a stale router state prevents SPA navigation.
    setTimeout(() => {
      if (window.location.pathname !== targetPath) {
        window.location.assign(targetPath);
      }
    }, 80);
  };

  const menuItems = [
    { key: 'Inicio', label: 'Inicio', icon: 'home' },
    { key: 'Menu - bloquear products', label: 'Menú - bloquear productos', icon: 'food-menu' },
    { key: 'Recargas', label: 'Recargas', icon: 'wallet' },
    { key: 'Historial de órdenes', label: 'Historial de órdenes', icon: 'ticket' },
    { key: 'Limitar consumo', label: 'Limitar consumo', icon: 'limit' },
    { key: 'Meriendas', label: 'Meriendas', icon: 'star' },
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

  const onSubmitDaviTopup = async () => {
    if (!selectedStudent?._id) {
      setDaviSubmitError('Selecciona un alumno antes de continuar.');
      return;
    }

    if (!canContinueDaviRecharge) {
      setDaviSubmitError('Completa todos los campos con un valor válido.');
      return;
    }

    setDaviSubmitLoading(true);
    setDaviSubmitError('');
    setDaviSubmitSuccess('');

    try {
      const response = await createDaviPlataPayment({
        studentId: selectedStudent._id,
        amount: daviAmountNumber,
        documentType: daviDocType,
        documentNumber: String(daviDocument || '').trim(),
        description: `Recarga SmartLunch - ${selectedStudent?.name || 'Alumno'}`,
      });

      const transactionId = String(response.data?.transactionId || '').trim();
      const providerStatus = String(response.data?.status || 'PENDING').trim();

      setDaviSubmitSuccess(
        transactionId
          ? `Solicitud enviada (${providerStatus}). Revisa tu app DaviPlata para aprobar la recarga. Transacción: ${transactionId}`
          : `Solicitud enviada (${providerStatus}). Revisa tu app DaviPlata para aprobar la recarga.`
      );
    } catch (requestError) {
      setDaviSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo crear la orden de pago.');
    } finally {
      setDaviSubmitLoading(false);
    }
  };

  const onSubmitPseTopup = async () => {
    if (!canContinuePseRecharge) {
      setPseSubmitError('Ingresa un valor válido para continuar.');
      return;
    }

    setPseSubmitLoading(true);
    setPseSubmitError('');
    setPseSubmitSuccess('');

    try {
      // Placeholder UI flow while PSE gateway endpoint is integrated.
      setPseSubmitSuccess('Recarga PSE registrada. En el siguiente paso te llevaremos a la pasarela de pago.');
    } catch (requestError) {
      setPseSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo iniciar la recarga por PSE.');
    } finally {
      setPseSubmitLoading(false);
    }
  };

  const onSubmitBancolombiaTopup = async () => {
    if (!canContinueBancolombiaRecharge) {
      setBancolombiaSubmitError('Ingresa un valor válido para continuar.');
      return;
    }

    setBancolombiaSubmitLoading(true);
    setBancolombiaSubmitError('');
    setBancolombiaSubmitSuccess('');

    try {
      setBancolombiaSubmitSuccess('Recarga Bancolombia registrada. En el siguiente paso te llevaremos a la pasarela de pago.');
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

      let payload = {
        firstName,
        lastName,
        documentType,
        documentNumber,
      };

      if (!mercadopagoPublicKey) {
        setAddCardError('Falta configurar VITE_MERCADOPAGO_PUBLIC_KEY. No se puede tokenizar la tarjeta.');
        setAddCardLoading(false);
        return;
      }

      const tokenizedCard = await createMercadoPagoCardToken({
        publicKey: mercadopagoPublicKey,
        cardNumber: cardDigits,
        cardholderName: `${firstName} ${lastName}`.trim(),
        expirationMonth: expMonth,
        expirationYear: expYear,
        securityCode: cardCvvDigits,
        identificationType: documentType,
        identificationNumber: documentNumber,
      });

      payload = {
        ...payload,
        cardToken: String(tokenizedCard?.id || '').trim(),
        deviceId: String(tokenizedCard?.deviceId || '').trim(),
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
        paymentMethodId: autoTopupSelectedCardId,
      });

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
    } catch (requestError) {
      setAutoTopupSubmitError(requestError?.response?.data?.message || requestError?.message || 'No se pudo activar la recarga automática.');
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
          <img className="parent-brand-logo" src={smartLogo} alt="SmartLunch" />
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
                        <img alt={category.name} loading="lazy" src={category.imageUrl} />
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
                        <img alt={product.name} loading="lazy" src={product.imageUrl} />
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
              <div className="parent-history-list">
                {historyOrders.map((order) => (
                  <article key={order._id}>
                    <div>
                      <strong>{formatCurrency(order.total)}</strong>
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
                <span>Saldo minimo sugerido {formatCurrency(selectedStudent?.wallet?.autoDebitLimit || 20000)}</span>
              </div>
            </div>

            <div className="parent-topups-actions">
              <button onClick={() => navigate('/parent/recargas/metodos')} type="button">
                <span className="parent-topups-action-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V4a1 1 0 0 1 1-1Z" fill="currentColor"/>
                  </svg>
                </span>
                <span>Recargar saldo</span>
              </button>

              <button onClick={() => navigate('/parent/recargas/automatica')} type="button">
                <span className="parent-topups-action-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 2L4 14h6l-1 8l9-12h-6l1-8Z" fill="currentColor"/>
                  </svg>
                </span>
                <span>Recarga automática</span>
              </button>

              <button onClick={() => navigate('/parent/recargas/agregar-tarjeta')} type="button">
                <span className="parent-topups-action-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2h-2V7a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2h2v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Zm12 1h6v2h-2v2h-2v-2h-2V8Z" fill="currentColor"/>
                  </svg>
                </span>
                <span>Agregar tarjeta</span>
              </button>
            </div>

            <div className="parent-topups-method-list">
              {savedCardsLoading ? <p className="parent-loading">Cargando tarjetas...</p> : null}
              {!savedCardsLoading && savedCardsError ? <p className="parent-error">{savedCardsError}</p> : null}

              {!savedCardsLoading && !savedCardsError
                ? savedCards.map((card) => (
                    <div className="parent-topups-method-card" key={card._id}>
                      <div className="parent-topups-method-left">
                        <span className={`parent-topups-brand-dot brand-${String(card.brand || 'unknown').toLowerCase()}`} aria-hidden="true" />
                        <div>
                          <p className="title">{getCardBrandLabel(card.brand)} **** {card.last4}</p>
                          <p className="meta">Vence {String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}</p>
                        </div>
                      </div>
                      <div className="parent-topups-method-actions">
                        <span
                          className={`parent-topups-badge ${String(card?.verificationStatus || 'verified') === 'verified' ? '' : 'pending'}`}
                        >
                          {String(card?.verificationStatus || 'verified') === 'verified' ? 'Verificada' : 'Pendiente'}
                        </span>
                        <button
                          aria-expanded={cardMenuOpenId === String(card._id)}
                          aria-label="Opciones de tarjeta"
                          className="parent-topups-menu-btn"
                          onClick={() => setCardMenuOpenId((prev) => (prev === String(card._id) ? '' : String(card._id)))}
                          type="button"
                        >
                          <span />
                          <span />
                          <span />
                        </button>

                        {cardMenuOpenId === String(card._id) ? (
                          <div className="parent-topups-card-menu">
                            {String(card?.verificationStatus || 'verified') !== 'verified' ? (
                              <button
                                disabled={deletingCardId === String(card._id)}
                                onClick={() => {
                                  setCardMenuOpenId('');
                                  openCardVerificationModal(card);
                                }}
                                type="button"
                              >
                                Verificar tarjeta
                              </button>
                            ) : null}
                            <button
                              disabled={deletingCardId === String(card._id)}
                              onClick={() => onDeleteSavedCard(card._id)}
                              type="button"
                            >
                              {deletingCardId === String(card._id) ? 'Eliminando...' : 'Eliminar tarjeta'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                : null}

              {!savedCardsLoading && !savedCardsError && savedCards.length === 0 ? (
                <p className="parent-topups-empty-method">No tienes tarjetas guardadas todavia.</p>
              ) : null}
            </div>

            <section className="parent-section">
              <h3>Ultimas recargas</h3>
              <div className="parent-list">
                {(overview?.recentTopups || []).map((topup) => (
                  <article key={topup._id}>
                    <div>
                      <strong>{formatCurrency(topup.amount)}</strong>
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

        {!loading && !error && isAutoTopupPage ? (
          <section className="parent-auto-topup-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/recargas')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver</span>
            </button>

            <h2>Recarga automática</h2>
            <p className="parent-auto-topup-hint">
              Define el saldo mínimo para activar la recarga automática. (Saldo mínimo {formatCurrency(20000)})
            </p>

            <label className="parent-auto-topup-input-wrap">
              <input
                min="20000"
                step="1000"
                type="number"
                placeholder="Ingrese un valor"
                value={autoTopupMinBalance}
                onChange={(event) => setAutoTopupMinBalance(event.target.value)}
              />
            </label>

            <div className="parent-auto-topup-card-picker">
              <p>Usa una tarjeta verificada para realizar las recargas automáticas.</p>
              <button
                className="parent-auto-topup-card-btn"
                onClick={() => setAutoTopupCardPickerOpen((prev) => !prev)}
                type="button"
              >
                <span>
                  {autoTopupSelectedCard
                    ? `${getCardBrandLabel(autoTopupSelectedCard.brand)} **** ${autoTopupSelectedCard.last4}`
                    : 'Seleccionar tarjeta'}
                </span>
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9.3 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4-1.4L14.6 12L9.3 6.7a1 1 0 0 1 0-1.4Z" fill="currentColor"/>
                </svg>
              </button>

              {autoTopupCardPickerOpen ? (
                <div className="parent-auto-topup-card-dropdown">
                  {savedCardsLoading ? <p className="parent-auto-topup-card-empty">Cargando tarjetas...</p> : null}
                  {!savedCardsLoading && savedCardsError ? <p className="parent-error">{savedCardsError}</p> : null}

                  {!savedCardsLoading && !savedCardsError
                    ? verifiedSavedCards.map((card) => (
                        <button
                          className={String(card._id) === String(autoTopupSelectedCardId) ? 'is-selected' : ''}
                          key={card._id}
                          onClick={() => {
                            setAutoTopupSelectedCardId(String(card._id));
                            setAutoTopupCardPickerOpen(false);
                          }}
                          type="button"
                        >
                          <span>{getCardBrandLabel(card.brand)} **** {card.last4}</span>
                          <small>Vence {String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}</small>
                        </button>
                      ))
                    : null}

                  <button
                    className="parent-auto-topup-add-card-option"
                    onClick={() => {
                      setAutoTopupCardPickerOpen(false);
                      navigate('/parent/recargas/agregar-tarjeta');
                    }}
                    type="button"
                  >
                    + Agregar tarjeta
                  </button>

                  {!savedCardsLoading && !savedCardsError && verifiedSavedCards.length === 0 ? (
                    <p className="parent-auto-topup-card-empty">No tienes tarjetas verificadas todavía.</p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <p className="parent-auto-topup-hint">
              Indica el valor que deseas que sea recargado a tu cuenta cuando llegue al saldo mínimo.
            </p>

            <div className="parent-auto-topup-amount-grid">
              {autoTopupPresetOptions.map((amount) => (
                <button
                  className={autoTopupPresetAmount === amount ? 'is-active' : ''}
                  key={amount}
                  onClick={() => {
                    setAutoTopupPresetAmount(amount);
                    setAutoTopupCustomAmount('');
                  }}
                  type="button"
                >
                  {formatCurrency(amount)}
                </button>
              ))}
            </div>

            <label className="parent-auto-topup-custom-row">
              <span>Otro valor</span>
              <input
                min="30000"
                step="1000"
                type="number"
                placeholder="Ingrese un valor"
                value={autoTopupCustomAmount}
                onFocus={() => setAutoTopupPresetAmount(0)}
                onChange={(event) => {
                  setAutoTopupPresetAmount(0);
                  setAutoTopupCustomAmount(event.target.value);
                }}
              />
            </label>

            <div className="parent-auto-topup-fee-note">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M11 8h2v7h-2V8Zm0 8h2v2h-2v-2Zm1-14A10 10 0 1 0 22 12A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8a8 8 0 0 1-8 8Z" fill="currentColor"/>
              </svg>
              <p>
                Recuerda que cada recarga tiene un costo adicional de <strong>{formatCurrency(autoTopupFeeAmount)}</strong> por el valor del servicio de recarga.
              </p>
            </div>

            <button
              className="parent-auto-topup-activate-btn"
              disabled={!canActivateAutoTopup || autoTopupSubmitLoading}
              onClick={onSubmitAutoTopup}
              type="button"
            >
              {autoTopupSubmitLoading ? 'Activando...' : 'Activar recarga'}
            </button>

            {autoTopupSubmitError ? <p className="parent-error">{autoTopupSubmitError}</p> : null}
            {autoTopupSubmitSuccess ? <p className="parent-success">{autoTopupSubmitSuccess}</p> : null}
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
                    disabled={!canSubmitMeriendas || meriendasSubmitLoading}
                    onClick={onSubmitMeriendas}
                    type="button"
                  >
                    {meriendasSubmitLoading ? 'Guardando...' : 'Suscribirse'}
                  </button>
                ) : null}

                {meriendasSubmitError ? <p className="parent-error">{meriendasSubmitError}</p> : null}
                {meriendasSubmitSuccess ? <p className="parent-success">{meriendasSubmitSuccess}</p> : null}

                {showMeriendasCancelModal ? (
                  <div className="parent-meriendas-cancel-modal-overlay" role="dialog" aria-modal="true" aria-label="Cancelar suscripción de meriendas">
                    <div className="parent-meriendas-cancel-modal">
                      <p className="kicker">SmartLunch Meriendas</p>
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
                        src={selectedMeriendaDayDetails.firstSnack.imageUrl}
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
                        src={selectedMeriendaDayDetails.secondSnack.imageUrl}
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

        {!loading && !error && isTopupMethodsPage ? (
          <section className="parent-topup-methods-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/recargas')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver</span>
            </button>

            <h2>Recargar cuenta de {selectedStudent?.name || 'alumno seleccionado'}</h2>
            <p className="parent-topup-methods-title">¿Cómo quieres recargar la cuenta?</p>
            <p className="parent-topup-fee-note">
              Todos los medios de pago aplican un costo de transacción del 1.5% sobre el valor que recargues.
            </p>

            <div className="parent-topup-methods-list">
              {!selectedStudent?.wallet?.autoDebitEnabled ? (
                <button
                  className="parent-topup-method-highlight"
                  onClick={goToAutoTopupPage}
                  type="button"
                >
                  <div className="left">
                    <img alt="Advertencia" className="logo" src={warningLogo} />
                    <span>Activa recargas automáticas</span>
                  </div>
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9.3 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4-1.4L14.6 12L9.3 6.7a1 1 0 0 1 0-1.4Z" fill="currentColor"/>
                  </svg>
                </button>
              ) : null}

              <button onClick={() => navigate('/parent/recargas/metodos/daviplata')} type="button">
                <div className="left">
                  <img alt="DaviPlata" className="logo" src={daviplataLogo} />
                  <span>DaviPlata</span>
                </div>
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9.3 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4-1.4L14.6 12L9.3 6.7a1 1 0 0 1 0-1.4Z" fill="currentColor"/>
                </svg>
              </button>

              <button onClick={() => navigate('/parent/recargas/metodos/bancolombia')} type="button">
                <div className="left">
                  <img alt="Bancolombia" className="logo" src={bancolombiaLogo} />
                  <span>Bancolombia</span>
                </div>
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9.3 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4-1.4L14.6 12L9.3 6.7a1 1 0 0 1 0-1.4Z" fill="currentColor"/>
                </svg>
              </button>

              <button onClick={() => navigate('/parent/recargas/metodos/breb')} type="button">
                <div className="left">
                  <img alt="Bre-B" className="logo" src={brebLogo} />
                  <span>Bre-B</span>
                </div>
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9.3 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4-1.4L14.6 12L9.3 6.7a1 1 0 0 1 0-1.4Z" fill="currentColor"/>
                </svg>
              </button>

              <button onClick={() => navigate('/parent/recargas/metodos/pse')} type="button">
                <div className="left">
                  <img alt="PSE" className="logo" src={pseLogo} />
                  <span>PSE</span>
                </div>
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9.3 5.3a1 1 0 0 1 1.4 0l6 6a1 1 0 0 1 0 1.4l-6 6a1 1 0 0 1-1.4-1.4L14.6 12L9.3 6.7a1 1 0 0 1 0-1.4Z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </section>
        ) : null}

        {!loading && !error && isTopupDaviPlataPage ? (
          <section className="parent-topup-davi-page">
            <button className="parent-topup-back-btn" onClick={() => navigate('/parent/recargas/metodos')} type="button">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 5.3a1 1 0 0 1 0 1.4L10.4 11H20a1 1 0 1 1 0 2h-9.6l4.3 4.3a1 1 0 0 1-1.4 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0Z" fill="currentColor"/>
              </svg>
              <span>Volver</span>
            </button>

            <div className="parent-topup-davi-head">
              <h2>Recarga la cuenta de {selectedStudent?.name || 'alumno seleccionado'} con DaviPlata</h2>
              <img alt="DaviPlata" src={daviplataLogo} />
            </div>

            <div className="parent-topup-davi-grid">
              <label>
                Tipo de documento
                <select value={daviDocType} onChange={(event) => setDaviDocType(event.target.value)}>
                  <option value="">Tipo doc</option>
                  <option value="CC">Cedula de ciudadania</option>
                  <option value="TI">Tarjeta de identidad</option>
                  <option value="CE">Cedula de extranjeria</option>
                  <option value="PP">Pasaporte</option>
                </select>
                {!daviDocType ? <small>Selecciona el tipo de documento</small> : null}
              </label>

              <label>
                Documento
                <input
                  placeholder="Ingrese un valor"
                  value={daviDocument}
                  onChange={(event) => setDaviDocument(event.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                />
              </label>
            </div>

            <label className="parent-topup-davi-amount">
              ¿Cuánto vas a recargar?
              <input
                min="50000"
                max="150000"
                step="1000"
                type="number"
                placeholder="Ingrese un valor"
                value={daviAmount}
                onChange={(event) => setDaviAmount(event.target.value)}
              />
            </label>

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

            <button
              className="parent-topup-davi-continue"
              disabled={!canContinueDaviRecharge || daviSubmitLoading}
              onClick={onSubmitDaviTopup}
              type="button"
            >
              {daviSubmitLoading ? 'Enviando...' : 'Continuar'}
            </button>

            {daviSubmitError ? <p className="parent-error">{daviSubmitError}</p> : null}
            {daviSubmitSuccess ? <p className="parent-success">{daviSubmitSuccess}</p> : null}
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
                min="1"
                step="1000"
                type="number"
                placeholder="Ingrese un valor"
                value={pseAmount}
                onChange={(event) => setPseAmount(event.target.value)}
              />
            </label>

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
                min="1"
                step="1000"
                type="number"
                placeholder="Ingrese un valor"
                value={bancolombiaAmount}
                onChange={(event) => setBancolombiaAmount(event.target.value)}
              />
            </label>

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

        {!loading && !error && !isMenuRoute && !isTopupsPage && !isTopupMethodsPage && !isTopupDaviPlataPage && !isTopupPsePage && !isTopupBancolombiaPage && !isTopupBrebPage && !isAddCardPage && !isAutoTopupPage && !isMeriendasPage && !isMeriendasDayPage && !isHistoryPage && !isLimitPage ? (
          <>
            <section className="parent-balance-hero" id="parent-balance-section">
              <p className="meta">Saldo actual</p>
              <h2>{formatCurrency(selectedStudent?.wallet?.balance || 0)}</h2>
              <p>
                Alumno: <strong>{selectedStudent?.name || 'N/A'}</strong>
              </p>
            </section>

            {!selectedStudent?.wallet?.autoDebitEnabled ? (
              <button className="parent-autodebit-banner" onClick={goToAutoTopupPage} type="button">
                <span className="parent-autodebit-banner-title">
                  Activa las recargas automáticas
                  <span aria-hidden="true" className="parent-warning-inline">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2 1 21h22L12 2Zm0 6.5a1.25 1.25 0 0 1 1.25 1.25v5.5a1.25 1.25 0 1 1-2.5 0v-5.5A1.25 1.25 0 0 1 12 8.5Zm0 10.25a1.5 1.5 0 1 1 0-3a1.5 1.5 0 0 1 0 3Z" fill="currentColor"/>
                    </svg>
                  </span>
                </span>
                <span className="parent-autodebit-banner-text">Protege el saldo de {selectedStudentFirstName} y evita que se quede sin fondos.</span>
              </button>
            ) : null}

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
                  <article key={order._id}>
                    <div>
                      <strong>{formatCurrency(order.total)}</strong>
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
                {(overview?.recentTopups || []).map((topup) => (
                  <article key={topup._id}>
                    <div>
                      <strong>{formatCurrency(topup.amount)}</strong>
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
                <p>
                  <span>Débito automático</span>
                  <strong>{selectedStudent?.wallet?.autoDebitEnabled ? 'Activo' : 'Inactivo'}</strong>
                </p>
                <p>
                  <span>Curso</span>
                  <strong>{selectedStudent?.grade || 'N/A'}</strong>
                </p>
                <p>
                  <span>Límite diario</span>
                  <strong>{formatCurrency(selectedStudent?.dailyLimit || 0)}</strong>
                </p>
                <p>
                  <span>Productos bloqueados</span>
                  <strong>{selectedStudent?.blockedProductsCount || 0}</strong>
                </p>
              </div>
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
