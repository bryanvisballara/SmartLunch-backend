import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  createAdminFixedCost,
  createAdminCategory,
  createAdminProduct,
  createAdminStore,
  createAdminStudent,
  importAdminLegacyParents,
  importAdminLegacyStudents,
  createAdminUser,
  createParentStudentLink,
  deleteAdminFixedCost,
  deleteAdminCategory,
  deleteAdminProduct,
  deleteAdminStore,
  deleteAdminStudent,
  deleteAdminUser,
  getAdminCategories,
  getAdminProducts,
  getAdminHomepage,
  getAdminStores,
  getAdminUsers,
  getParentStudentLinks,
  getMeriendaSubscriptions,
  getMeriendaFailedPayments,
  updateMeriendaFailedPayment,
  getMeriendaSnacks,
  createMeriendaSnack,
  updateMeriendaSnack,
  getMeriendaSchedule,
  saveMeriendaSchedule,
  getMeriendaOperations,
  saveMeriendaSubscriptionMonthlyCost,
  addMeriendaFixedCost,
  addMeriendaVariableCost,
  deleteMeriendaFixedCost,
  deleteMeriendaVariableCost,
  getMeriendaOperationsHistory,
  getMeriendaIntakeHistory,
  updateAdminCategory,
  updateAdminProduct,
  updateAdminStore,
  updateAdminStudent,
  updateAdminUser,
  uploadAdminImage,
} from '../services/admin.service';
import { applyInventoryMovement, getInventoryRequests, approveInventoryRequest, rejectInventoryRequest } from '../services/inventory.service';
import {
  getOrders,
  getOrderCancellationRequests,
  approveOrderCancellation,
  rejectOrderCancellation,
  cancelOrderDirect,
  markSchoolBillingCollected,
} from '../services/orders.service';
import { getStudents } from '../services/students.service';
import {
  topup,
  debit,
  getTopupRequests,
  getRechargeTransactions,
  getHistory,
  approveTopupRequest,
  rejectTopupRequest,
  getBalance,
  cancelRechargeTransaction,
} from '../services/wallet.service';
import { getDailyClosures } from '../services/dailyClosure.service';
import { getNotificationsAudit } from '../services/notifications.service';
import DismissibleNotice from '../components/DismissibleNotice';

const formatCurrency = (value) => `$${Number(value || 0).toLocaleString('es-CO')}`;
const formatDateTime = (value) => (value ? new Date(value).toLocaleString('es-CO') : 'N/A');

const formatDescriptionForTwoLines = (value) => {
  const description = String(value || '').trim();
  if (!description) {
    return 'Sin descripcion';
  }

  const firstCommaIndex = description.indexOf(',');
  if (firstCommaIndex === -1) {
    return description;
  }

  const firstPart = description.slice(0, firstCommaIndex + 1).trimEnd();
  const secondPart = description.slice(firstCommaIndex + 1).trimStart();

  return secondPart ? `${firstPart}\n${secondPart}` : firstPart;
};

const normalizeProductName = (value) => String(value || '').trim().toLowerCase();

const paymentMethodLabel = {
  system: 'Sistema',
  cash: 'Efectivo',
  qr: 'QR',
  dataphone: 'Datáfono',
  transfer: 'Transferencia',
  school_billing: 'Cuenta de cobro colegio',
};

const pushTypeLabel = {
  order_created: 'Compra POS',
  low_balance_lt20: 'Saldo bajo < 20k',
  low_balance_lt10: 'Saldo bajo < 10k',
  auto_debit_recharge: 'Recarga automática',
  tutor_comment: 'Comentario tutor',
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const normalizeLegacyHeader = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const parseLegacyBalance = (value) => {
  const input = String(value ?? '').trim();
  if (!input) {
    return 0;
  }

  let cleaned = input.replace(/\s+/g, '').replace(/\$/g, '');

  if (cleaned.includes('.') && !cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '');
  } else if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const resolveLegacyColumnIndexes = (headers) => {
  const normalized = (headers || []).map((cell) => normalizeLegacyHeader(cell));
  const findIndex = (keys) => normalized.findIndex((header) => keys.includes(header));

  const nameIndex = findIndex(['alumno', 'nombre', 'nombrealumno', 'student', 'studentname', 'name']);
  const gradeIndex = findIndex(['curso', 'grado', 'grade']);
  const balanceIndex = findIndex([
    'saldoencreditos',
    'saldoencredito',
    'saldoencuenta',
    'saldocreditos',
    'creditos',
    'saldo',
    'balance',
  ]);

  if (nameIndex < 0 || balanceIndex < 0) {
    throw new Error('El archivo debe incluir columnas: Alumno y Saldo en creditos.');
  }

  return {
    nameIndex,
    gradeIndex,
    balanceIndex,
  };
};

const resolveLegacyParentColumnIndexes = (headers) => {
  const normalized = (headers || []).map((cell) => normalizeLegacyHeader(cell));
  const findIndex = (keys) => normalized.findIndex((header) => keys.includes(header));

  const nameIndex = findIndex([
    'nombredelacudiente',
    'nombreacudiente',
    'acudiente',
    'nombrepadre',
    'nombre',
    'name',
  ]);
  const usernameIndex = findIndex([
    'nombredeusuario',
    'usuario',
    'username',
    'user',
  ]);
  const phoneIndex = findIndex([
    'telefono',
    'celular',
    'movil',
    'phone',
  ]);

  if (nameIndex < 0 || usernameIndex < 0) {
    throw new Error('El archivo debe incluir columnas: Nombre del acudiente y Nombre de usuario.');
  }

  return {
    nameIndex,
    usernameIndex,
    phoneIndex,
  };
};

const downloadExcelWorkbook = (sheetName, headers, rows, fileBaseName) => {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileBaseName}-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

const currentMonthIso = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
};

const currentDateIso = () => new Date().toISOString().slice(0, 10);

const daysInIsoMonth = (monthIso) => {
  const [year, month] = String(monthIso || '').split('-').map((part) => Number(part));
  if (!year || !month) {
    return 30;
  }
  return new Date(year, month, 0).getDate();
};

const buildEmptyMeriendaSchedule = (monthIso) => {
  const totalDays = daysInIsoMonth(monthIso);
  return Array.from({ length: totalDays }, (_, index) => String(index + 1)).reduce((acc, day) => {
    acc[day] = { firstSnackId: '', secondSnackId: '' };
    return acc;
  }, {});
};

const meriendasFailedStatusValid = (value) => {
  const normalized = String(value || '').trim();
  if (['pending_contact', 'contacted', 'resolved'].includes(normalized)) {
    return normalized;
  }
  return 'pending_contact';
};

const modules = [
  { id: 'home', label: 'Homepage KPI' },
  { id: 'sales', label: 'Historial de ventas & recargas' },
  { id: 'school_billing', label: 'Cuentas de cobro colegio' },
  { id: 'notifications', label: 'Auditoria push' },
  { id: 'topups', label: 'Recargas' },
  { id: 'creation', label: 'Creaciones' },
  { id: 'edit', label: 'Base de datos' },
  { id: 'modify', label: 'Modificaciones' },
  { id: 'links', label: 'Vinculos' },
  { id: 'meriendas', label: 'Meriendas' },
  { id: 'inventory', label: 'Inventario' },
  { id: 'approvals', label: 'Autorizaciones' },
  { id: 'closure', label: 'Cierre diario' },
];

const MERIENDAS_WEEK_DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MERIENDAS_INTAKE_STATUS_LABEL = {
  pending: 'Sin registrar',
  ate: 'Comió',
  not_ate: 'No comió',
};

function AdminDashboard() {
  const legacyMigrationInputRef = useRef(null);
  const legacyParentMigrationInputRef = useRef(null);
  const [activeModule, setActiveModule] = useState('home');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [okToastFading, setOkToastFading] = useState(false);

  const [homeData, setHomeData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [students, setStudents] = useState([]);
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [links, setLinks] = useState([]);

  const [pendingInventory, setPendingInventory] = useState([]);
  const [pendingCancellations, setPendingCancellations] = useState([]);
  const [pendingTopups, setPendingTopups] = useState([]);
  const [approvalHistory, setApprovalHistory] = useState([]);
  const [selectedApprovalHistoryId, setSelectedApprovalHistoryId] = useState('');
  const [approvalModule, setApprovalModule] = useState('in');

  const [closures, setClosures] = useState([]);

  const [salesFilters, setSalesFilters] = useState({ studentId: '', from: '', to: '' });
  const [historyType, setHistoryType] = useState('sales');
  const [schoolBillingFilters, setSchoolBillingFilters] = useState({ from: '', to: '', q: '' });
  const [schoolBillingOrders, setSchoolBillingOrders] = useState([]);
  const [salesStudentQuery, setSalesStudentQuery] = useState('');
  const [showSalesStudentOptions, setShowSalesStudentOptions] = useState(false);
  const [salesPage, setSalesPage] = useState(1);
  const [topupHistory, setTopupHistory] = useState([]);
  const [closureFilters, setClosureFilters] = useState({ storeId: '', date: '' });
  const [homeStoreId, setHomeStoreId] = useState('');
  const [notificationAuditFilters, setNotificationAuditFilters] = useState({
    studentId: '',
    type: '',
    status: '',
    from: '',
    to: '',
    q: '',
  });
  const [notificationAuditRows, setNotificationAuditRows] = useState([]);
  const [notificationAuditPage, setNotificationAuditPage] = useState(1);
  const [notificationAuditMeta, setNotificationAuditMeta] = useState({
    total: 0,
    totalPages: 1,
    limit: 50,
  });

  const [manualTopup, setManualTopup] = useState({ studentId: '', amount: '', method: 'cash', notes: '' });
  const [topupStudentQuery, setTopupStudentQuery] = useState('');
  const [showTopupStudentOptions, setShowTopupStudentOptions] = useState(false);
  const [topupBalanceDrafts, setTopupBalanceDrafts] = useState({});
  const [topupBalanceSearchQuery, setTopupBalanceSearchQuery] = useState('');
  const [topupBalancePage, setTopupBalancePage] = useState(1);
  const [savingTopupStudentId, setSavingTopupStudentId] = useState('');
  const [fixedCostForm, setFixedCostForm] = useState({ name: '', amount: '', storeId: '', type: 'fixed' });

  const [categoryForm, setCategoryForm] = useState({ name: '', imageUrl: '' });
  const [uploadingCategoryImage, setUploadingCategoryImage] = useState(false);
  const [storeForm, setStoreForm] = useState({ name: '', location: '' });
  const [productForm, setProductForm] = useState({
    name: '',
    categoryId: '',
    shortDescription: '',
    price: '',
    cost: '',
    stock: '',
    initialStockStoreIds: [],
    inventoryAlertStock: '10',
    imageUrl: '',
  });
  const [uploadingProductImage, setUploadingProductImage] = useState(false);
  const [uploadingEditProductImageId, setUploadingEditProductImageId] = useState('');
  const [userForm, setUserForm] = useState({ name: '', username: '', phone: '', password: '', role: 'parent', assignedStoreId: '' });
  const [studentForm, setStudentForm] = useState({ name: '', grade: '', parentId: '' });

  const [linkForm, setLinkForm] = useState({ parentId: '', studentId: '', relationship: 'parent' });
  const [linkParentQuery, setLinkParentQuery] = useState('');
  const [showLinkParentOptions, setShowLinkParentOptions] = useState(false);
  const [linkStudentQuery, setLinkStudentQuery] = useState('');
  const [showLinkStudentOptions, setShowLinkStudentOptions] = useState(false);

  const [meriendaStudentQuery, setMeriendaStudentQuery] = useState('');
  const [meriendaSubscriptions, setMeriendaSubscriptions] = useState([]);
  const [meriendaFailedPayments, setMeriendaFailedPayments] = useState([]);
  const [firstSnackDraft, setFirstSnackDraft] = useState({ title: '', description: '', imageUrl: '' });
  const [secondSnackDraft, setSecondSnackDraft] = useState({ title: '', description: '', imageUrl: '' });
  const [drinkSnackDraft, setDrinkSnackDraft] = useState({ title: '', description: '', imageUrl: '' });
  const [snackInputResetVersion, setSnackInputResetVersion] = useState({ first: 0, second: 0, drink: 0 });
  const [snackSavePopup, setSnackSavePopup] = useState({ open: false, fading: false, title: '' });
  const [meriendasSnacks, setMeriendasSnacks] = useState([]);
  const [meriendasMonth, setMeriendasMonth] = useState(currentMonthIso);
  const [meriendasScheduleDraft, setMeriendasScheduleDraft] = useState(() => buildEmptyMeriendaSchedule(currentMonthIso()));
  const [selectedScheduleDay, setSelectedScheduleDay] = useState('');
  const [meriendaSubscriptionMonthlyCost, setMeriendaSubscriptionMonthlyCost] = useState('0');
  const [meriendaKpis, setMeriendaKpis] = useState({
    subscribedStudents: 0,
    monthlyIncome: 0,
    fixedCostsTotal: 0,
    variableCostsTotal: 0,
    monthlyUtility: 0,
    fixedCosts: [],
    variableCosts: [],
  });
  const [meriendaFixedCostDraft, setMeriendaFixedCostDraft] = useState({ name: '', amount: '' });
  const [meriendaVariableCostDraft, setMeriendaVariableCostDraft] = useState({ name: '', amount: '' });
  const [meriendaOperationsHistory, setMeriendaOperationsHistory] = useState([]);
  const [selectedMeriendaHistoryMonth, setSelectedMeriendaHistoryMonth] = useState('');
  const [meriendaControlFilters, setMeriendaControlFilters] = useState({
    from: currentDateIso(),
    to: currentDateIso(),
    q: '',
  });
  const [meriendaControlHistory, setMeriendaControlHistory] = useState([]);

  const [inventoryForm, setInventoryForm] = useState({
    type: 'in',
    storeId: '',
    targetStoreId: '',
    productId: '',
    quantity: '1',
    notes: '',
  });
  const [inventoryRequestItems, setInventoryRequestItems] = useState([]);
  const [inventoryProductQuery, setInventoryProductQuery] = useState('');
  const [showInventoryProductOptions, setShowInventoryProductOptions] = useState(false);

  const [editEntity, setEditEntity] = useState('product');
  const [editTableDrafts, setEditTableDrafts] = useState({});
  const [editTablePage, setEditTablePage] = useState(1);
  const [selectedProductRowIds, setSelectedProductRowIds] = useState([]);
  const [editItemId, setEditItemId] = useState('');
  const [editSearchQuery, setEditSearchQuery] = useState('');
  const [editProductStoreFilter, setEditProductStoreFilter] = useState('');
  const [showEditRegistryOptions, setShowEditRegistryOptions] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteTargetLabel, setDeleteTargetLabel] = useState('');
  const [legacyMigrationLoading, setLegacyMigrationLoading] = useState(false);
  const [legacyMigrationLoadingTitle, setLegacyMigrationLoadingTitle] = useState('Migrando base de datos');
  const [inventoryApplyModal, setInventoryApplyModal] = useState({ open: false, fading: false, title: '', message: '' });

  useEffect(() => {
    if (!snackSavePopup.open) {
      return undefined;
    }

    const fadeTimer = setTimeout(() => {
      setSnackSavePopup((prev) => ({ ...prev, fading: true }));
    }, 700);

    const closeTimer = setTimeout(() => {
      setSnackSavePopup({ open: false, fading: false, title: '' });
    }, 1000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [snackSavePopup.open]);

  useEffect(() => {
    if (!ok) {
      setOkToastFading(false);
      return undefined;
    }

    setOkToastFading(false);

    const fadeTimer = setTimeout(() => {
      setOkToastFading(true);
    }, 2700);

    const closeTimer = setTimeout(() => {
      setOk('');
      setOkToastFading(false);
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [ok]);

  useEffect(() => {
    if (!inventoryApplyModal.open) {
      return undefined;
    }

    const fadeTimer = setTimeout(() => {
      setInventoryApplyModal((prev) => ({ ...prev, fading: true }));
    }, 2700);

    const closeTimer = setTimeout(() => {
      setInventoryApplyModal({ open: false, fading: false, title: '', message: '' });
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [inventoryApplyModal.open]);
  const [editCategoryForm, setEditCategoryForm] = useState({ name: '', status: 'active' });
  const [editStoreForm, setEditStoreForm] = useState({ name: '', location: '', status: 'active' });
  const [editProductForm, setEditProductForm] = useState({
    name: '',
    categoryId: '',
    shortDescription: '',
    storeId: '',
    price: '',
    cost: '',
    stock: '',
    inventoryAlertStock: '10',
    imageUrl: '',
    status: 'active',
  });
  const [editUserForm, setEditUserForm] = useState({
    name: '',
    username: '',
    phone: '',
    role: 'parent',
    assignedStoreId: '',
    status: 'active',
    password: '',
  });
  const [editStudentForm, setEditStudentForm] = useState({
    name: '',
    schoolCode: '',
    grade: '',
    dailyLimit: '',
    status: 'active',
    parentId: '',
  });
  const [editStudentBalance, setEditStudentBalance] = useState(null);
  const [loadingEditStudentBalance, setLoadingEditStudentBalance] = useState(false);

  const parentUsers = useMemo(() => users.filter((u) => u.role === 'parent'), [users]);
  const isUserRecordEntity =
    editEntity === 'user' ||
    editEntity === 'parent' ||
    editEntity === 'vendor' ||
    editEntity === 'admin' ||
    editEntity === 'merienda_operator';

  const productProfit = useMemo(() => {
    const price = Number(productForm.price || 0);
    const cost = Number(productForm.cost || 0);
    const utility = price - cost;
    const utilityPercent = price > 0 ? (utility / price) * 100 : 0;

    return {
      utility,
      utilityPercent,
    };
  }, [productForm.price, productForm.cost]);

  const studentParentMap = useMemo(() => {
    return links.reduce((acc, link) => {
      const studentId = String(link.studentId?._id || link.studentId || '');
      const parentId = String(link.parentId?._id || link.parentId || '');
      if (studentId && parentId) {
        acc[studentId] = parentId;
      }
      return acc;
    }, {});
  }, [links]);

  const editEntityItems = useMemo(() => {
    if (editEntity === 'category') {
      return categories;
    }
    if (editEntity === 'store') {
      return stores;
    }
    if (editEntity === 'product') {
      if (!editProductStoreFilter) {
        return products;
      }

      return products.filter((product) => String(product.storeId) === String(editProductStoreFilter));
    }
    if (editEntity === 'parent') {
      return users.filter((user) => user.role === 'parent');
    }
    if (editEntity === 'vendor') {
      return users.filter((user) => user.role === 'vendor');
    }
    if (editEntity === 'admin') {
      return users.filter((user) => user.role === 'admin');
    }
    if (editEntity === 'merienda_operator') {
      return users.filter((user) => user.role === 'merienda_operator');
    }
    if (editEntity === 'user') {
      return users;
    }
    return students;
  }, [editEntity, categories, stores, products, users, students, editProductStoreFilter]);

  const getEditItemLabel = (item) => {
    if (!item) {
      return '';
    }
    if (isUserRecordEntity) {
      return `${item.name || ''} ${item.username ? `(${item.username})` : ''}`.trim();
    }
    if (editEntity === 'student') {
      return `${item.name || ''} ${item.schoolCode ? `(${item.schoolCode})` : ''}`.trim();
    }
    if (editEntity === 'product') {
      return `${item.name || ''} ${item.storeName ? `(${item.storeName})` : ''}`.trim();
    }
    return item.name || item._id || '';
  };

  const filteredEditEntityItems = useMemo(() => {
    const query = String(editSearchQuery || '').trim().toLowerCase();
    if (!query) {
      return editEntityItems;
    }

    return editEntityItems.filter((item) => getEditItemLabel(item).toLowerCase().includes(query));
  }, [editEntityItems, editSearchQuery, isUserRecordEntity]);

  const editTableTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil((filteredEditEntityItems.length || 0) / 20));
  }, [filteredEditEntityItems]);

  const paginatedEditEntityItems = useMemo(() => {
    const start = (editTablePage - 1) * 20;
    return filteredEditEntityItems.slice(start, start + 20);
  }, [filteredEditEntityItems, editTablePage]);

  const isBulkProductMode = activeModule === 'modify' && editEntity === 'product';

  const selectedProductRowsCount = useMemo(() => selectedProductRowIds.length, [selectedProductRowIds]);

  const areAllVisibleProductRowsSelected = useMemo(() => {
    if (!isBulkProductMode || paginatedEditEntityItems.length === 0) {
      return false;
    }

    return paginatedEditEntityItems.every((item) => selectedProductRowIds.includes(String(item._id)));
  }, [isBulkProductMode, paginatedEditEntityItems, selectedProductRowIds]);

  const editProductProfit = useMemo(() => {
    const price = Number(editProductForm.price || 0);
    const cost = Number(editProductForm.cost || 0);
    const utility = price - cost;
    const utilityPercent = price > 0 ? (utility / price) * 100 : 0;

    return {
      utility,
      utilityPercent,
    };
  }, [editProductForm.price, editProductForm.cost]);

  const groupedInventoryRequests = useMemo(
    () =>
      Object.values(
        pendingInventory.reduce((acc, req) => {
          const key = req.batchId || req._id;
          if (!acc[key]) {
            acc[key] = {
              key,
              type: req.type,
              store: req.storeId,
              targetStore: req.targetStoreId,
              requestedBy: req.requestedBy,
              notes: req.notes || '',
              requests: [],
            };
          }
          acc[key].requests.push(req);
          return acc;
        }, {})
      ),
    [pendingInventory]
  );

  const pendingInGroups = useMemo(
    () => groupedInventoryRequests.filter((group) => group.type === 'in'),
    [groupedInventoryRequests]
  );

  const pendingOutGroups = useMemo(
    () => groupedInventoryRequests.filter((group) => group.type === 'out'),
    [groupedInventoryRequests]
  );

  const pendingTransferGroups = useMemo(
    () => groupedInventoryRequests.filter((group) => group.type === 'transfer'),
    [groupedInventoryRequests]
  );

  const approvalModules = useMemo(
    () => [
      { id: 'in', label: 'Ingresos', count: pendingInGroups.length },
      { id: 'out', label: 'Egresos', count: pendingOutGroups.length },
      { id: 'transfer', label: 'Traslados', count: pendingTransferGroups.length },
      { id: 'topups', label: 'Recargas', count: pendingTopups.length },
      { id: 'cancellations', label: 'Anulaciones', count: pendingCancellations.length },
    ],
    [pendingInGroups.length, pendingOutGroups.length, pendingTransferGroups.length, pendingTopups.length, pendingCancellations.length]
  );

  const pendingApprovalsCount = useMemo(
    () => approvalModules.reduce((sum, moduleItem) => sum + Number(moduleItem.count || 0), 0),
    [approvalModules]
  );

  const selectedApprovalHistory = useMemo(
    () => approvalHistory.find((item) => item.id === selectedApprovalHistoryId) || null,
    [approvalHistory, selectedApprovalHistoryId]
  );

  const pendingSchoolBillingOrders = useMemo(
    () => (schoolBillingOrders || []).filter((order) => String(order.schoolBillingStatus || 'pending') !== 'collected'),
    [schoolBillingOrders]
  );

  const collectedSchoolBillingOrders = useMemo(
    () => (schoolBillingOrders || []).filter((order) => String(order.schoolBillingStatus || 'pending') === 'collected'),
    [schoolBillingOrders]
  );

  const filteredSalesStudents = useMemo(() => {
    const query = String(salesStudentQuery || '').trim().toLowerCase();
    if (!query) {
      return students;
    }

    return students.filter((student) => {
      const name = String(student.name || '').toLowerCase();
      const schoolCode = String(student.schoolCode || '').toLowerCase();
      return name.includes(query) || schoolCode.includes(query);
    });
  }, [students, salesStudentQuery]);

  const filteredTopupStudents = useMemo(() => {
    const query = String(topupStudentQuery || '').trim().toLowerCase();
    if (!query) {
      return students;
    }

    return students.filter((student) => {
      const name = String(student.name || '').toLowerCase();
      const schoolCode = String(student.schoolCode || '').toLowerCase();
      return name.includes(query) || schoolCode.includes(query);
    });
  }, [students, topupStudentQuery]);

  const topupBalanceRows = useMemo(() => {
    return [...students].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  }, [students]);

  const filteredTopupBalanceRows = useMemo(() => {
    const query = String(topupBalanceSearchQuery || '').trim().toLowerCase();
    if (!query) {
      return topupBalanceRows;
    }

    return topupBalanceRows.filter((student) => {
      const name = String(student.name || '').toLowerCase();
      const schoolCode = String(student.schoolCode || '').toLowerCase();
      return name.includes(query) || schoolCode.includes(query);
    });
  }, [topupBalanceRows, topupBalanceSearchQuery]);

  const topupBalanceTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil((filteredTopupBalanceRows.length || 0) / 10));
  }, [filteredTopupBalanceRows]);

  const paginatedTopupBalanceRows = useMemo(() => {
    const start = (topupBalancePage - 1) * 10;
    return filteredTopupBalanceRows.slice(start, start + 10);
  }, [filteredTopupBalanceRows, topupBalancePage]);

  const filteredLinkParents = useMemo(() => {
    const query = String(linkParentQuery || '').trim().toLowerCase();
    if (!query) {
      return parentUsers;
    }

    return parentUsers.filter((parent) => {
      const name = String(parent.name || '').toLowerCase();
      const username = String(parent.username || '').toLowerCase();
      return name.includes(query) || username.includes(query);
    });
  }, [parentUsers, linkParentQuery]);

  const filteredLinkStudents = useMemo(() => {
    const query = String(linkStudentQuery || '').trim().toLowerCase();
    if (!query) {
      return students;
    }

    return students.filter((student) => {
      const name = String(student.name || '').toLowerCase();
      const schoolCode = String(student.schoolCode || '').toLowerCase();
      return name.includes(query) || schoolCode.includes(query);
    });
  }, [students, linkStudentQuery]);

  const filteredMeriendaSubscriptions = useMemo(() => {
    const query = String(meriendaStudentQuery || '').trim().toLowerCase();
    if (!query) {
      return meriendaSubscriptions;
    }

    return meriendaSubscriptions.filter((subscription) => {
      const childName = String(subscription.childName || '').toLowerCase();
      const childGrade = String(subscription.childGrade || '').toLowerCase();
      const parentName = String(subscription.parentName || '').toLowerCase();
      const parentUsername = String(subscription.parentUsername || '').toLowerCase();
      const childDocument = String(subscription.childDocument || '').toLowerCase();

      return (
        childName.includes(query) ||
        childGrade.includes(query) ||
        parentName.includes(query) ||
        parentUsername.includes(query) ||
        childDocument.includes(query)
      );
    });
  }, [meriendaSubscriptions, meriendaStudentQuery]);

  const meriendasFirstSnackOptions = useMemo(
    () => meriendasSnacks.filter((snack) => snack.type === 'first'),
    [meriendasSnacks]
  );

  const meriendasSecondSnackOptions = useMemo(
    () => meriendasSnacks.filter((snack) => snack.type === 'second'),
    [meriendasSnacks]
  );

  const snackTitleById = useMemo(() => {
    return (meriendasSnacks || []).reduce((acc, snack) => {
      const snackId = String(snack._id || snack.id || '');
      if (!snackId) {
        return acc;
      }

      acc[snackId] = snack.title || 'Snack';
      return acc;
    }, {});
  }, [meriendasSnacks]);

  const calendarDays = useMemo(() => {
    const [year, month] = String(meriendasMonth || '').split('-').map((part) => Number(part));
    if (!year || !month) {
      return [];
    }

    const firstDayOffset = new Date(year, month - 1, 1).getDay();
    const totalDays = daysInIsoMonth(meriendasMonth);

    return [
      ...Array.from({ length: firstDayOffset }, (_, index) => ({ key: `empty-${index}`, empty: true })),
      ...Array.from({ length: totalDays }, (_, index) => {
        const day = String(index + 1);
        return {
          key: `day-${day}`,
          empty: false,
          day,
          firstSnackId: meriendasScheduleDraft?.[day]?.firstSnackId || '',
          secondSnackId: meriendasScheduleDraft?.[day]?.secondSnackId || '',
        };
      }),
    ];
  }, [meriendasMonth, meriendasScheduleDraft]);

  const selectedDaySchedule = useMemo(() => {
    if (!selectedScheduleDay) {
      return { firstSnackId: '', secondSnackId: '' };
    }

    return {
      firstSnackId: meriendasScheduleDraft?.[selectedScheduleDay]?.firstSnackId || '',
      secondSnackId: meriendasScheduleDraft?.[selectedScheduleDay]?.secondSnackId || '',
    };
  }, [meriendasScheduleDraft, selectedScheduleDay]);

  const selectedMeriendaHistory = useMemo(() => {
    if (!selectedMeriendaHistoryMonth) {
      return null;
    }

    return (
      meriendaOperationsHistory.find((item) => String(item.month) === String(selectedMeriendaHistoryMonth)) || null
    );
  }, [meriendaOperationsHistory, selectedMeriendaHistoryMonth]);

  const loadMeriendasData = async () => {
    const [subscriptionsRes, failedRes, snacksRes] = await Promise.all([
      getMeriendaSubscriptions(),
      getMeriendaFailedPayments(),
      getMeriendaSnacks(),
    ]);

    setMeriendaSubscriptions(subscriptionsRes.data || []);
    setMeriendaFailedPayments(failedRes.data || []);
    setMeriendasSnacks(snacksRes.data || []);
  };

  const loadMeriendaControlHistory = async (filters = meriendaControlFilters) => {
    const response = await getMeriendaIntakeHistory(filters);
    setMeriendaControlHistory(response.data?.records || []);
  };

  const loadMeriendasOperationsMonth = async (month = meriendasMonth) => {
    const response = await getMeriendaOperations(month);
    const data = response.data || {};

    setMeriendaSubscriptionMonthlyCost(String(data.subscriptionMonthlyCost ?? 0));
    setMeriendaKpis({
      subscribedStudents: Number(data.subscribedStudents || 0),
      monthlyIncome: Number(data.monthlyIncome || 0),
      fixedCostsTotal: Number(data.fixedCostsTotal || 0),
      variableCostsTotal: Number(data.variableCostsTotal || 0),
      monthlyUtility: Number(data.monthlyUtility || 0),
      fixedCosts: data.fixedCosts || [],
      variableCosts: data.variableCosts || [],
    });
  };

  const loadMeriendasOperationsHistory = async () => {
    const response = await getMeriendaOperationsHistory();
    const history = response.data || [];
    setMeriendaOperationsHistory(history);

    if (!selectedMeriendaHistoryMonth && history.length > 0) {
      setSelectedMeriendaHistoryMonth(history[0].month);
    }
  };

  const loadMeriendasScheduleMonth = async (month = meriendasMonth) => {
    const response = await getMeriendaSchedule(month);
    const days = response?.data?.days || [];
    const nextDraft = buildEmptyMeriendaSchedule(month);

    days.forEach((item) => {
      const dayKey = String(item.day || '');
      if (!dayKey || !nextDraft[dayKey]) {
        return;
      }

      nextDraft[dayKey] = {
        firstSnackId: String(item.firstSnackId?._id || item.firstSnackId || ''),
        secondSnackId: String(item.secondSnackId?._id || item.secondSnackId || ''),
      };
    });

    setMeriendasScheduleDraft(nextDraft);
  };

  useEffect(() => {
    loadMeriendasScheduleMonth(meriendasMonth).catch(() => {
      setMeriendasScheduleDraft(buildEmptyMeriendaSchedule(meriendasMonth));
    });

    loadMeriendasOperationsMonth(meriendasMonth).catch(() => {
      setMeriendaSubscriptionMonthlyCost('0');
      setMeriendaKpis({
        subscribedStudents: 0,
        monthlyIncome: 0,
        fixedCostsTotal: 0,
        variableCostsTotal: 0,
        monthlyUtility: 0,
        fixedCosts: [],
        variableCosts: [],
      });
    });

    loadMeriendasOperationsHistory().catch(() => {
      setMeriendaOperationsHistory([]);
    });

    loadMeriendaControlHistory(meriendaControlFilters).catch(() => {
      setMeriendaControlHistory([]);
    });
  }, [meriendasMonth]);

  useEffect(() => {
    setSelectedScheduleDay('1');
  }, [meriendasMonth]);

  const onUpdateMeriendaFailedStatus = async (id, status) => {
    try {
      const response = await updateMeriendaFailedPayment(id, { status: meriendasFailedStatusValid(status) });
      const updated = response.data;

      setMeriendaFailedPayments((prev) =>
        prev.map((item) => (String(item._id || item.id) === String(id) ? { ...item, ...updated } : item))
      );
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo actualizar el estado del pago fallido.');
    }
  };

  const onApplyMeriendaControlFilters = async (event) => {
    event.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      await loadMeriendaControlHistory(meriendaControlFilters);
      setOk('Historial de control actualizado.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo cargar el historial de control.');
    } finally {
      setLoading(false);
    }
  };

  const onSnackImageSelected = async (type, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    clearMessages();
    try {
      const imageUrl = await uploadSingleImageToHosting(file, {
        folder: 'meriendas',
        preferredName: file.name,
      });

      if (!imageUrl) {
        throw new Error('No se recibio URL de imagen.');
      }

      setOk('Imagen de snack cargada.');

      if (type === 'first') {
        setFirstSnackDraft((prev) => ({ ...prev, imageUrl }));
        return;
      }
      if (type === 'drink') {
        setDrinkSnackDraft((prev) => ({ ...prev, imageUrl }));
        return;
      }
      setSecondSnackDraft((prev) => ({ ...prev, imageUrl }));
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo subir la imagen.');
    }
  };

  const onSaveSnackByType = async (type) => {
    const draft =
      type === 'first' ? firstSnackDraft : type === 'second' ? secondSnackDraft : drinkSnackDraft;
    const normalizedDraft = {
      title: String(draft.title || '').trim(),
      description: String(draft.description || '').trim(),
      imageUrl: draft.imageUrl || '',
    };

    const typeLabel = type === 'first' ? '1er snack' : type === 'second' ? '2do snack' : 'bebida';

    if (!normalizedDraft.title) {
      setError(`Debes ingresar el titulo de ${typeLabel}.`);
      return;
    }

    setLoading(true);
    clearMessages();
    try {
      const existingSnack = meriendasSnacks.find((item) => item.type === type);
      if (existingSnack?._id) {
        await updateMeriendaSnack(existingSnack._id, normalizedDraft);
      } else {
        await createMeriendaSnack({ type, ...normalizedDraft });
      }

      const emptyDraft = { title: '', description: '', imageUrl: '' };
      if (type === 'first') {
        setFirstSnackDraft(emptyDraft);
      } else if (type === 'second') {
        setSecondSnackDraft(emptyDraft);
      } else {
        setDrinkSnackDraft(emptyDraft);
      }

      setSnackInputResetVersion((prev) => ({
        ...prev,
        [type]: Number(prev[type] || 0) + 1,
      }));

      await loadMeriendasData();
      setOk(`${typeLabel} guardada.`);
      setSnackSavePopup({ open: true, fading: false, title: `${typeLabel} guardado correctamente` });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar el snack.');
    } finally {
      setLoading(false);
    }
  };

  const onLoadSnackDraft = (snack) => {
    if (snack.type === 'first') {
      setFirstSnackDraft({
        title: snack.title || '',
        description: snack.description || '',
        imageUrl: snack.imageUrl || '',
      });
      return;
    }

    if (snack.type === 'drink') {
      setDrinkSnackDraft({
        title: snack.title || '',
        description: snack.description || '',
        imageUrl: snack.imageUrl || '',
      });
      return;
    }

    setSecondSnackDraft({
      title: snack.title || '',
      description: snack.description || '',
      imageUrl: snack.imageUrl || '',
    });
  };

  const onScheduleDaySnackChange = (day, field, value) => {
    if (!day) {
      return;
    }

    setMeriendasScheduleDraft((prev) => ({
      ...prev,
      [day]: {
        firstSnackId: prev?.[day]?.firstSnackId || '',
        secondSnackId: prev?.[day]?.secondSnackId || '',
        [field]: value,
      },
    }));
  };

  const onSaveMeriendasScheduleMonth = async () => {
    setLoading(true);
    clearMessages();
    try {
      const payloadDays = Object.entries(meriendasScheduleDraft || {}).map(([day, value]) => ({
        day: Number(day),
        firstSnackId: value?.firstSnackId || null,
        secondSnackId: value?.secondSnackId || null,
      }));

      await saveMeriendaSchedule(meriendasMonth, { days: payloadDays });
      await loadMeriendasScheduleMonth(meriendasMonth);
      setOk(`Cronograma de meriendas guardado para ${meriendasMonth}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar el cronograma de meriendas.');
    } finally {
      setLoading(false);
    }
  };

  const onSaveScheduleDay = async () => {
    if (!selectedScheduleDay) {
      setError('Selecciona un día del calendario para editar.');
      return;
    }

    await onSaveMeriendasScheduleMonth();
  };

  const onSaveMeriendaSubscriptionMonthlyCost = async () => {
    const parsedAmount = Number(meriendaSubscriptionMonthlyCost || 0);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError('El costo mensual debe ser un número mayor o igual a 0.');
      return;
    }

    setLoading(true);
    clearMessages();
    try {
      const response = await saveMeriendaSubscriptionMonthlyCost(meriendasMonth, { amount: parsedAmount });
      const data = response.data || {};
      setMeriendaSubscriptionMonthlyCost(String(data.subscriptionMonthlyCost ?? parsedAmount));
      setMeriendaKpis((prev) => ({
        ...prev,
        subscribedStudents: Number(data.subscribedStudents || 0),
        monthlyIncome: Number(data.monthlyIncome || 0),
        fixedCostsTotal: Number(data.fixedCostsTotal || 0),
        variableCostsTotal: Number(data.variableCostsTotal || 0),
        monthlyUtility: Number(data.monthlyUtility || 0),
        fixedCosts: data.fixedCosts || prev.fixedCosts,
        variableCosts: data.variableCosts || prev.variableCosts,
      }));
      await loadMeriendasOperationsHistory();
      setOk(`Costo mensual guardado para ${meriendasMonth}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar el costo mensual.');
    } finally {
      setLoading(false);
    }
  };

  const onAddMeriendaOperationCost = async (type) => {
    const draft = type === 'fixed' ? meriendaFixedCostDraft : meriendaVariableCostDraft;
    const normalizedName = String(draft.name || '').trim();
    const normalizedAmount = Number(draft.amount || 0);

    if (!normalizedName) {
      setError(`Debes ingresar el nombre del costo ${type === 'fixed' ? 'fijo' : 'variable'}.`);
      return;
    }

    if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
      setError('El valor del costo debe ser un numero mayor o igual a 0.');
      return;
    }

    setLoading(true);
    clearMessages();
    try {
      const response =
        type === 'fixed'
          ? await addMeriendaFixedCost(meriendasMonth, { name: normalizedName, amount: normalizedAmount })
          : await addMeriendaVariableCost(meriendasMonth, { name: normalizedName, amount: normalizedAmount });

      const data = response.data || {};
      setMeriendaKpis({
        subscribedStudents: Number(data.subscribedStudents || 0),
        monthlyIncome: Number(data.monthlyIncome || 0),
        fixedCostsTotal: Number(data.fixedCostsTotal || 0),
        variableCostsTotal: Number(data.variableCostsTotal || 0),
        monthlyUtility: Number(data.monthlyUtility || 0),
        fixedCosts: data.fixedCosts || [],
        variableCosts: data.variableCosts || [],
      });

      if (type === 'fixed') {
        setMeriendaFixedCostDraft({ name: '', amount: '' });
      } else {
        setMeriendaVariableCostDraft({ name: '', amount: '' });
      }

      await loadMeriendasOperationsHistory();
      setOk(`Costo ${type === 'fixed' ? 'fijo' : 'variable'} agregado para ${meriendasMonth}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar el costo de meriendas.');
    } finally {
      setLoading(false);
    }
  };

  const onDeleteMeriendaOperationCost = async (type, costId) => {
    if (!costId) {
      setError('No se encontro el costo a eliminar.');
      return;
    }

    const confirmed = window.confirm(
      `Esta accion eliminara el costo ${type === 'fixed' ? 'fijo' : 'variable'} seleccionado. Deseas continuar?`
    );
    if (!confirmed) {
      return;
    }

    setLoading(true);
    clearMessages();
    try {
      const response =
        type === 'fixed'
          ? await deleteMeriendaFixedCost(meriendasMonth, costId)
          : await deleteMeriendaVariableCost(meriendasMonth, costId);

      const data = response.data || {};
      setMeriendaKpis({
        subscribedStudents: Number(data.subscribedStudents || 0),
        monthlyIncome: Number(data.monthlyIncome || 0),
        fixedCostsTotal: Number(data.fixedCostsTotal || 0),
        variableCostsTotal: Number(data.variableCostsTotal || 0),
        monthlyUtility: Number(data.monthlyUtility || 0),
        fixedCosts: data.fixedCosts || [],
        variableCosts: data.variableCosts || [],
      });

      await loadMeriendasOperationsHistory();
      setOk(`Costo ${type === 'fixed' ? 'fijo' : 'variable'} eliminado para ${meriendasMonth}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo eliminar el costo de meriendas.');
    } finally {
      setLoading(false);
    }
  };

  const filteredInventoryProducts = useMemo(() => {
    const baseProducts = products.filter((product) => !inventoryForm.storeId || String(product.storeId) === String(inventoryForm.storeId));
    const query = String(inventoryProductQuery || '').trim().toLowerCase();
    if (!query) {
      return baseProducts;
    }

    return baseProducts.filter((product) => String(product.name || '').toLowerCase().includes(query));
  }, [products, inventoryForm.storeId, inventoryProductQuery]);

  const salesRows = useMemo(() => {
    return orders.map((order) => ({
      store: order.storeId?.name || 'N/A',
      orderNumber: order.orderNumber || order._id,
      student: order.studentId?.name || (order.guestSale ? 'Venta externa' : 'N/A'),
      pedidos: (order.items || []).map((item) => `${Number(item.quantity || 0)}x ${item.nameSnapshot || 'Producto'}`).join(', ') || 'N/A',
      paymentMethod: paymentMethodLabel[order.paymentMethod] || order.paymentMethod || 'N/A',
      amountRaw: Number(order.total || 0),
      total: formatCurrency(order.total),
      dateTime: new Date(order.createdAt).toLocaleString('es-CO'),
      _id: order._id,
    }));
  }, [orders]);

  const topupRows = useMemo(() => {
    const fromDate = salesFilters.from ? new Date(`${salesFilters.from}T00:00:00`) : null;
    const toDate = salesFilters.to ? new Date(`${salesFilters.to}T23:59:59`) : null;

    return (topupHistory || [])
      .filter((item) => {
        const studentMatch = !salesFilters.studentId || String(item.studentId?._id || item.studentId || '') === String(salesFilters.studentId);
        if (!studentMatch) {
          return false;
        }

        const createdAt = item.createdAt ? new Date(item.createdAt) : null;
        if (fromDate && createdAt && createdAt < fromDate) {
          return false;
        }
        if (toDate && createdAt && createdAt > toDate) {
          return false;
        }
        return true;
      })
      .map((item) => ({
        store: item.storeId?.name || 'N/A',
        orderNumber: item._id,
        student: item.studentId?.name || 'N/A',
        pedidos: 'Recarga',
        paymentMethod: paymentMethodLabel[item.method] || item.method || 'N/A',
        amountRaw: Number(item.amount || 0),
        total: formatCurrency(item.amount),
        dateTime: item.createdAt ? new Date(item.createdAt).toLocaleString('es-CO') : 'N/A',
        status: 'aplicada',
        requestedBy: item.createdBy?.name || 'N/A',
        _id: item._id,
      }));
  }, [topupHistory, salesFilters.studentId, salesFilters.from, salesFilters.to]);

  const historyRows = useMemo(() => {
    return historyType === 'sales' ? salesRows : topupRows;
  }, [historyType, salesRows, topupRows]);

  const notificationTypeOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        (notificationAuditRows || [])
          .map((item) => String(item?.payload?.type || '').trim())
          .filter(Boolean)
      )
    );
    return values.sort((a, b) => a.localeCompare(b, 'es'));
  }, [notificationAuditRows]);

  const historyTotalAmount = useMemo(() => {
    return historyRows.reduce((sum, row) => sum + Number(row.amountRaw || 0), 0);
  }, [historyRows]);

  const salesTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil((historyRows.length || 0) / 20));
  }, [historyRows]);

  const paginatedSalesOrders = useMemo(() => {
    const start = (salesPage - 1) * 20;
    return historyRows.slice(start, start + 20);
  }, [historyRows, salesPage]);

  const clearMessages = () => {
    setError('');
    setOk('');
  };

  const loadApprovals = async () => {
    const [
      inventoryRes,
      inventoryApprovedRes,
      inventoryRejectedRes,
      cancelRes,
      cancelApprovedRes,
      cancelRejectedRes,
      topupRes,
      topupApprovedRes,
      topupRejectedRes,
    ] = await Promise.all([
      getInventoryRequests({ status: 'pending' }),
      getInventoryRequests({ status: 'approved' }),
      getInventoryRequests({ status: 'rejected' }),
      getOrderCancellationRequests({ status: 'pending' }),
      getOrderCancellationRequests({ status: 'approved' }),
      getOrderCancellationRequests({ status: 'rejected' }),
      getTopupRequests({ status: 'pending' }),
      getTopupRequests({ status: 'approved' }),
      getTopupRequests({ status: 'rejected' }),
    ]);

    setPendingInventory(inventoryRes.data || []);
    setPendingCancellations(cancelRes.data || []);
    setPendingTopups(topupRes.data || []);

    const inventoryHistory = [...(inventoryApprovedRes.data || []), ...(inventoryRejectedRes.data || [])].map((item) => {
      const decision = item.status === 'approved' ? 'approved' : 'rejected';
      return {
        id: `inventory:${item._id}`,
        domain: 'inventory',
        decision,
        decidedAt: item.approvedAt || item.rejectedAt || item.updatedAt || item.createdAt,
        createdAt: item.createdAt,
        title: `Inventario ${item.type === 'in' ? 'Ingreso' : item.type === 'out' ? 'Egreso' : 'Traslado'}`,
        summary: `${item.storeId?.name || 'Tienda'}${item.targetStoreId?.name ? ` -> ${item.targetStoreId.name}` : ''}`,
        decidedBy: decision === 'approved'
          ? item.approvedBy?.name || item.approvedBy?.username || 'N/A'
          : item.rejectedBy?.name || item.rejectedBy?.username || item.approvedBy?.name || item.approvedBy?.username || 'N/A',
        statusLabel: decision === 'approved' ? 'Aprobada' : 'Rechazada',
        detail: item,
      };
    });

    const cancellationHistory = [...(cancelApprovedRes.data || []), ...(cancelRejectedRes.data || [])].map((item) => {
      const decision = item.status === 'approved' ? 'approved' : 'rejected';
      return {
        id: `cancellation:${item._id}`,
        domain: 'cancellation',
        decision,
        decidedAt: item.approvedAt || item.rejectedAt || item.updatedAt || item.createdAt,
        createdAt: item.createdAt,
        title: 'Anulación de venta',
        summary: `Orden ${item.orderId?._id || item.orderId || 'N/A'}`,
        decidedBy: decision === 'approved'
          ? item.approvedBy?.name || item.approvedBy?.username || 'N/A'
          : item.rejectedBy?.name || item.rejectedBy?.username || 'N/A',
        statusLabel: decision === 'approved' ? 'Aprobada' : 'Rechazada',
        detail: item,
      };
    });

    const topupHistory = [...(topupApprovedRes.data || []), ...(topupRejectedRes.data || [])].map((item) => {
      const decision = item.status === 'approved' ? 'approved' : 'rejected';
      return {
        id: `topup:${item._id}`,
        domain: 'topup',
        decision,
        decidedAt: item.approvedAt || item.rejectedAt || item.updatedAt || item.createdAt,
        createdAt: item.createdAt,
        title: 'Recarga',
        summary: `${item.studentId?.name || 'Alumno'} - ${formatCurrency(item.amount)}`,
        decidedBy: decision === 'approved'
          ? item.approvedBy?.name || item.approvedBy?.username || 'N/A'
          : item.rejectedBy?.name || item.rejectedBy?.username || 'N/A',
        statusLabel: decision === 'approved' ? 'Aprobada' : 'Rechazada',
        detail: item,
      };
    });

    const history = [...inventoryHistory, ...cancellationHistory, ...topupHistory]
      .sort((a, b) => new Date(b.decidedAt || b.createdAt) - new Date(a.decidedAt || a.createdAt))
      .slice(0, 300);

    setApprovalHistory(history);
    setSelectedApprovalHistoryId((prev) => {
      if (prev && history.some((item) => item.id === prev)) {
        return prev;
      }
      return history[0]?.id || '';
    });
  };

  const loadHomepage = async (storeId = homeStoreId) => {
    const params = storeId ? { storeId } : {};
    const homeRes = await getAdminHomepage(params);
    setHomeData(homeRes.data || null);
  };

  const loadBaseData = async () => {
    setLoading(true);
    clearMessages();
    try {
      const [studentsRes, productsRes, storesRes, categoriesRes, usersRes, linksRes] = await Promise.all([
        getStudents(),
        getAdminProducts({ includeInactive: true }),
        getAdminStores(),
        getAdminCategories(),
        getAdminUsers(),
        getParentStudentLinks(),
      ]);

      setStudents(studentsRes.data || []);
      setProducts(productsRes.data || []);
      setStores(storesRes.data || []);
      setCategories(categoriesRes.data || []);
      setUsers(usersRes.data || []);
      setLinks(linksRes.data || []);

      const firstStoreId = storesRes.data?.[0]?._id || '';
      setClosureFilters((prev) => ({ ...prev, storeId: prev.storeId || firstStoreId }));
      setInventoryForm((prev) => ({ ...prev, storeId: prev.storeId || firstStoreId }));

      await Promise.all([
        loadApprovals(),
        loadOrders(),
        loadClosures({ storeId: firstStoreId }),
        loadHomepage(homeStoreId),
        loadMeriendasData(),
        loadMeriendasOperationsMonth(meriendasMonth),
        loadMeriendasOperationsHistory(),
      ]);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo cargar el portal administrativo.');
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async (filters = salesFilters) => {
    const response = await getOrders(filters);
    setOrders(response.data || []);
  };

  const loadTopupHistory = async () => {
    try {
      const response = await getRechargeTransactions();
      setTopupHistory(response.data || []);
      return;
    } catch {
      // Fallback for backends that do not expose /wallet/recharges yet.
    }

    const historyResponses = await Promise.all(
      (students || []).map((student) =>
        getHistory(student._id)
          .then((response) => ({ student, records: response.data || [] }))
          .catch(() => ({ student, records: [] }))
      )
    );

    const fallbackRows = historyResponses.flatMap(({ student, records }) =>
      (records || [])
        .filter((record) => record.type === 'recharge')
        .map((record) => ({
          ...record,
          studentId: {
            _id: student._id,
            name: student.name,
            schoolCode: student.schoolCode,
          },
        }))
    );

    fallbackRows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    setTopupHistory(fallbackRows);
  };

  const loadSchoolBillingOrders = async (filters = schoolBillingFilters) => {
    const params = {
      paymentMethod: 'school_billing',
      includeCancelled: 'true',
    };

    if (filters.from) {
      params.from = `${filters.from}T00:00:00.000Z`;
    }

    if (filters.to) {
      params.to = `${filters.to}T23:59:59.999Z`;
    }

    const response = await getOrders(params);
    const rows = (response.data || []).filter(
      (order) => String(order?.paymentMethod || '').toLowerCase() === 'school_billing'
    );
    const query = String(filters.q || '').trim().toLowerCase();

    if (!query) {
      setSchoolBillingOrders(rows);
      return;
    }

    const filtered = rows.filter((order) => {
      const haystack = [
        order._id,
        order.studentId?.name,
        order.storeId?.name,
        order.vendorId?.name,
        order.schoolBillingFor,
        order.schoolBillingResponsible,
        ...(order.items || []).map((item) => item?.nameSnapshot),
      ]
        .map((item) => String(item || '').toLowerCase())
        .join(' ');

      return haystack.includes(query);
    });

    setSchoolBillingOrders(filtered);
  };

  const loadClosures = async (filters = closureFilters) => {
    if (!filters.storeId) {
      setClosures([]);
      return;
    }

    const response = await getDailyClosures(filters);
    setClosures(response.data || []);
  };

  const loadNotificationAudit = async (filters = notificationAuditFilters, page = notificationAuditPage) => {
    const response = await getNotificationsAudit({
      ...filters,
      page,
      limit: notificationAuditMeta.limit,
    });

    setNotificationAuditRows(response?.data?.items || []);
    setNotificationAuditMeta({
      total: Number(response?.data?.total || 0),
      totalPages: Math.max(1, Number(response?.data?.totalPages || 1)),
      limit: Number(response?.data?.limit || notificationAuditMeta.limit || 50),
    });
  };

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    setTopupBalanceDrafts(
      (students || []).reduce((acc, student) => {
        const studentId = String(student._id || '');
        if (!studentId) {
          return acc;
        }

        acc[studentId] = String(Number(student.walletBalance || 0));
        return acc;
      }, {})
    );
  }, [students]);

  useEffect(() => {
    setTopupBalancePage(1);
  }, [topupBalanceSearchQuery]);

  useEffect(() => {
    if (topupBalancePage > topupBalanceTotalPages) {
      setTopupBalancePage(topupBalanceTotalPages);
    }
  }, [topupBalancePage, topupBalanceTotalPages]);

  useEffect(() => {
    if (activeModule !== 'notifications') {
      return;
    }

    if (notificationAuditRows.length > 0) {
      return;
    }

    setLoading(true);
    clearMessages();
    loadNotificationAudit(notificationAuditFilters, 1)
      .then(() => {
        setNotificationAuditPage(1);
      })
      .catch((requestError) => {
        setError(requestError?.response?.data?.message || 'No se pudo cargar la auditoria de notificaciones.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activeModule]);

  useEffect(() => {
    if (activeModule !== 'approvals') {
      return;
    }

    setLoading(true);
    clearMessages();
    loadApprovals()
      .catch((requestError) => {
        setError(requestError?.response?.data?.message || 'No se pudieron cargar las autorizaciones.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activeModule]);

  useEffect(() => {
    if (activeModule !== 'school_billing') {
      return;
    }

    setLoading(true);
    clearMessages();
    loadSchoolBillingOrders(schoolBillingFilters)
      .catch((requestError) => {
        setError(requestError?.response?.data?.message || 'No se pudieron cargar las cuentas de cobro colegio.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [activeModule]);

  const onApplySchoolBillingFilters = (event) => {
    event.preventDefault();
    runAction(() => loadSchoolBillingOrders(schoolBillingFilters), 'Cuentas de cobro actualizadas.');
  };

  const onMarkSchoolBillingCollected = (orderId) => {
    runAction(
      () => markSchoolBillingCollected(orderId),
      'Cuenta de cobro marcada como cobrada.',
      async () => {
        await loadSchoolBillingOrders(schoolBillingFilters);
      }
    );
  };

  useEffect(() => {
    setEditItemId('');
    setEditSearchQuery('');
    setEditProductStoreFilter('');
    setShowEditRegistryOptions(false);
    setEditTableDrafts({});
    setSelectedProductRowIds([]);
    setEditTablePage(1);
  }, [editEntity]);

  useEffect(() => {
    if (!isBulkProductMode) {
      setSelectedProductRowIds([]);
      return;
    }

    const availableIds = new Set(filteredEditEntityItems.map((item) => String(item._id)));
    setSelectedProductRowIds((prev) => prev.filter((id) => availableIds.has(String(id))));
  }, [isBulkProductMode, filteredEditEntityItems]);

  useEffect(() => {
    setEditTablePage(1);
  }, [editSearchQuery]);

  useEffect(() => {
    if (!editItemId) {
      return;
    }

    const selectedItem = editEntityItems.find((item) => String(item._id) === String(editItemId));
    if (selectedItem) {
      setEditSearchQuery(getEditItemLabel(selectedItem));
    }
  }, [editItemId, editEntityItems]);

  useEffect(() => {
    if (!editItemId) {
      return;
    }

    if (editEntity === 'category') {
      const category = categories.find((item) => String(item._id) === String(editItemId));
      if (category) {
        setEditCategoryForm({
          name: category.name || '',
          status: category.status || 'active',
        });
      }
      return;
    }

    if (editEntity === 'store') {
      const store = stores.find((item) => String(item._id) === String(editItemId));
      if (store) {
        setEditStoreForm({
          name: store.name || '',
          location: store.location || '',
          status: store.status || 'active',
        });
      }
      return;
    }

    if (editEntity === 'product') {
      const product = products.find((item) => String(item._id) === String(editItemId));
      if (product) {
        setEditProductForm({
          name: product.name || '',
          categoryId: String(product.categoryId || ''),
          shortDescription: product.shortDescription || '',
          storeId: String(product.storeId || ''),
          price: String(product.price ?? ''),
          cost: String(product.cost ?? ''),
          stock: String(product.stock ?? ''),
          inventoryAlertStock: String(product.inventoryAlertStock ?? 10),
          imageUrl: product.imageUrl || '',
          status: product.status || 'active',
        });
      }
      return;
    }

    if (isUserRecordEntity) {
      const user = users.find((item) => String(item._id) === String(editItemId));
      if (user) {
        setEditUserForm({
          name: user.name || '',
          username: user.username || '',
          phone: user.phone || '',
          role: user.role || 'parent',
          assignedStoreId: String(user.assignedStoreId || ''),
          status: user.status || 'active',
          password: '',
        });
      }
      return;
    }

    const student = students.find((item) => String(item._id) === String(editItemId));
    if (student) {
      setEditStudentForm({
        name: student.name || '',
        schoolCode: student.schoolCode || '',
        grade: student.grade || '',
        dailyLimit: String(student.dailyLimit ?? 0),
        status: student.status || 'active',
        parentId: studentParentMap[String(student._id)] || '',
      });
    }
  }, [editEntity, editItemId, categories, stores, products, users, students, studentParentMap]);

  useEffect(() => {
    if (editEntity !== 'student' || !editItemId) {
      setEditStudentBalance(null);
      setLoadingEditStudentBalance(false);
      return;
    }

    let isMounted = true;
    setLoadingEditStudentBalance(true);
    getBalance(editItemId)
      .then((response) => {
        if (!isMounted) {
          return;
        }
        setEditStudentBalance(Number(response?.data?.balance || 0));
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setEditStudentBalance(null);
      })
      .finally(() => {
        if (!isMounted) {
          return;
        }
        setLoadingEditStudentBalance(false);
      });

    return () => {
      isMounted = false;
    };
  }, [editEntity, editItemId]);

  const runAction = async (action, successMessage, reload = null) => {
    clearMessages();
    setLoading(true);
    try {
      await action();
      if (reload) {
        await reload();
      }
      setOk(successMessage);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo completar la accion.');
    } finally {
      setLoading(false);
    }
  };

  const uploadSingleImageToHosting = async (file, { folder, preferredName }) => {
    const response = await uploadAdminImage(file, { folder, preferredName });
    return String(response?.data?.url || '').trim();
  };

  const onManualTopup = (event) => {
    event.preventDefault();
    runAction(
      () =>
        topup({
          studentId: manualTopup.studentId,
          amount: Number(manualTopup.amount || 0),
          method: manualTopup.method,
          notes: manualTopup.notes,
        }),
      'Recarga manual aplicada correctamente.',
      async () => {
        await Promise.all([loadBaseData(), loadApprovals()]);
        setManualTopup({ studentId: '', amount: '', method: 'cash', notes: '' });
        setTopupStudentQuery('');
      }
    );
  };

  const onChangeTopupBalanceDraft = (studentId, value) => {
    setTopupBalanceDrafts((prev) => ({
      ...prev,
      [studentId]: value,
    }));
  };

  const onSaveTopupBalance = async (student) => {
    const studentId = String(student?._id || '');
    if (!studentId) {
      setError('No se encontro el alumno para actualizar saldo.');
      return;
    }

    const targetBalance = Number(topupBalanceDrafts[studentId]);
    if (!Number.isFinite(targetBalance) || targetBalance < 0) {
      setError('El saldo debe ser un numero mayor o igual a 0.');
      return;
    }

    const roundedTarget = Math.round(targetBalance * 100) / 100;
    const currentBalance = Number(student.walletBalance || 0);
    const diff = Math.round((roundedTarget - currentBalance) * 100) / 100;

    if (Math.abs(diff) < 0.01) {
      setOk(`El saldo de ${student.name || 'Alumno'} ya está actualizado.`);
      return;
    }

    clearMessages();
    setSavingTopupStudentId(studentId);
    try {
      if (diff > 0) {
        await topup({
          studentId,
          amount: diff,
          method: 'system',
          notes: 'Ajuste de saldo desde Admin > Recargas',
        });
      } else {
        await debit({
          studentId,
          amount: Math.abs(diff),
          method: 'system',
          notes: 'Ajuste de saldo desde Admin > Recargas',
        });
      }

      const studentsRes = await getStudents();
      setStudents(studentsRes.data || []);
      setOk(`Saldo actualizado para ${student.name || 'Alumno'}.`);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo actualizar el saldo del alumno.');
    } finally {
      setSavingTopupStudentId('');
    }
  };

  const onCreateCategory = (event) => {
    event.preventDefault();
    runAction(() => createAdminCategory(categoryForm), 'Categoría creada.', async () => {
      const categoriesRes = await getAdminCategories();
      setCategories(categoriesRes.data || []);
      setCategoryForm({ name: '', imageUrl: '' });
    });
  };

  const onCategoryImageSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    clearMessages();
    setUploadingCategoryImage(true);
    try {
      const imageUrl = await uploadSingleImageToHosting(file, {
        folder: 'categories',
        preferredName: categoryForm.name || file.name,
      });
      if (!imageUrl) {
        throw new Error('No se recibio URL de imagen.');
      }
      setCategoryForm((prev) => ({ ...prev, imageUrl }));
      setOk('Imagen de categoria cargada.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo subir la imagen.');
    } finally {
      setUploadingCategoryImage(false);
    }
  };

  const onCreateStore = (event) => {
    event.preventDefault();
    runAction(() => createAdminStore(storeForm), 'Tienda creada.', async () => {
      const storesRes = await getAdminStores();
      setStores(storesRes.data || []);
      setStoreForm({ name: '', location: '' });
    });
  };

  const onCreateProduct = (event) => {
    event.preventDefault();

    const selectedStoreIds = Array.isArray(productForm.initialStockStoreIds)
      ? productForm.initialStockStoreIds
      : [];

    if (stores.length > 0 && selectedStoreIds.length === 0) {
      setError('Selecciona al menos una tienda para crear el producto.');
      return;
    }

    runAction(
      () =>
        createAdminProduct({
          ...productForm,
          createInAllStores: selectedStoreIds.includes('all'),
          initialStockStoreIds: selectedStoreIds.filter((id) => id !== 'all'),
          shortDescription: String(productForm.shortDescription || '').trim(),
          price: Number(productForm.price || 0),
          cost: Number(productForm.cost || 0),
          stock: Number(productForm.stock || 0),
          inventoryAlertStock: Number(productForm.inventoryAlertStock || 0),
        }),
      'Producto creado.',
      async () => {
        const productsRes = await getAdminProducts({ includeInactive: true });
        setProducts(productsRes.data || []);
        setProductForm({
          name: '',
          categoryId: '',
          shortDescription: '',
          price: '',
          cost: '',
          stock: '',
          initialStockStoreIds: [],
          inventoryAlertStock: '10',
          imageUrl: '',
        });
        await loadHomepage(homeStoreId);
      }
    );
  };

  const onProductImageSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    clearMessages();
    setUploadingProductImage(true);
    try {
      const imageUrl = await uploadSingleImageToHosting(file, {
        folder: 'products',
        preferredName: productForm.name || file.name,
      });
      if (!imageUrl) {
        throw new Error('No se recibio URL de imagen.');
      }
      setProductForm((prev) => ({ ...prev, imageUrl }));
      setOk('Imagen de producto cargada.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo subir la imagen.');
    } finally {
      setUploadingProductImage(false);
    }
  };

  const onEditTableProductImageSelected = async (item, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    const itemId = String(item?._id || '');
    clearMessages();
    setUploadingEditProductImageId(itemId);
    try {
      const imageUrl = await uploadSingleImageToHosting(file, {
        folder: 'products',
        preferredName: item?.name || file.name,
      });
      if (!imageUrl) {
        throw new Error('No se recibio URL de imagen.');
      }
      onEditTableDraftChange(item, 'imageUrl', imageUrl);
      setOk('Imagen del producto cargada.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo subir la imagen.');
    } finally {
      setUploadingEditProductImageId('');
    }
  };

  const onCreateUser = (event) => {
    event.preventDefault();

    if (userForm.role === 'vendor' && !userForm.assignedStoreId) {
      setError('Debes asignar una tienda al crear un vendedor.');
      return;
    }

    const payload = {
      name: userForm.name,
      username: userForm.username,
      phone: userForm.phone,
      password: userForm.password,
      role: userForm.role,
      assignedStoreId: userForm.role === 'vendor' ? userForm.assignedStoreId : undefined,
    };

    runAction(() => createAdminUser(payload), 'Usuario creado.', async () => {
      const usersRes = await getAdminUsers();
      setUsers(usersRes.data || []);
      setUserForm({ name: '', username: '', phone: '', password: '', role: 'parent', assignedStoreId: '' });
    });
  };

  const onCreateStudent = (event) => {
    event.preventDefault();
    runAction(
      () =>
        createAdminStudent({
          ...studentForm,
          grade: String(studentForm.grade || '').trim(),
          parentId: studentForm.parentId || undefined,
        }),
      'Alumno creado.',
      async () => {
        const [studentsRes, linksRes] = await Promise.all([getStudents(), getParentStudentLinks()]);
        setStudents(studentsRes.data || []);
        setLinks(linksRes.data || []);
        setStudentForm({ name: '', grade: '', parentId: '' });
      }
    );
  };

  const onCreateLink = (event) => {
    event.preventDefault();
    runAction(() => createParentStudentLink(linkForm), 'Vinculo padre-hijo guardado.', async () => {
      const linksRes = await getParentStudentLinks();
      setLinks(linksRes.data || []);
      setLinkForm({ parentId: '', studentId: '', relationship: 'parent' });
      setLinkParentQuery('');
      setLinkStudentQuery('');
    });
  };

  const onCreateInventoryRequest = (event) => {
    event.preventDefault();

    if (inventoryRequestItems.length === 0) {
      setError('Agrega al menos un producto antes de registrar el movimiento.');
      return;
    }

    if (!inventoryForm.storeId) {
      setError('Selecciona una tienda de origen.');
      return;
    }

    if (inventoryForm.type === 'transfer' && !inventoryForm.targetStoreId) {
      setError('Selecciona una tienda de destino para el traslado.');
      return;
    }

    clearMessages();
    setLoading(true);

    applyInventoryMovement({
      type: inventoryForm.type,
      storeId: inventoryForm.storeId,
      targetStoreId: inventoryForm.type === 'transfer' ? inventoryForm.targetStoreId : undefined,
      items: inventoryRequestItems.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity || 0),
      })),
      notes: inventoryForm.notes,
    })
      .then(async () => {
        await Promise.all([
          loadApprovals(),
          loadHomepage(homeStoreId),
          getAdminProducts({ includeInactive: true }).then((response) => {
            setProducts(response.data || []);
          }),
        ]);

        setInventoryForm((prev) => ({ ...prev, productId: '', quantity: '1', notes: '' }));
        setInventoryRequestItems([]);
        setInventoryProductQuery('');
        setInventoryApplyModal({
          open: true,
          fading: false,
          title: 'Registro aplicado',
          message: 'El movimiento de inventario fue aplicado de manera exitosa.',
        });
      })
      .catch((requestError) => {
        setError(requestError?.response?.data?.message || 'No se pudo aplicar el movimiento de inventario.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const onAddInventoryItem = () => {
    if (!inventoryForm.productId || Number(inventoryForm.quantity || 0) <= 0) {
      setError('Selecciona un producto y una cantidad valida.');
      return;
    }

    setInventoryRequestItems((prev) => {
      const existing = prev.find((item) => String(item.productId) === String(inventoryForm.productId));
      if (existing) {
        return prev.map((item) =>
          String(item.productId) === String(inventoryForm.productId)
            ? { ...item, quantity: Number(item.quantity || 0) + Number(inventoryForm.quantity || 0) }
            : item
        );
      }

      return [...prev, { productId: inventoryForm.productId, quantity: Number(inventoryForm.quantity || 0) }];
    });

    setInventoryForm((prev) => ({ ...prev, productId: '', quantity: '1' }));
    setInventoryProductQuery('');
    setError('');
  };

  const onRemoveInventoryItem = (productId) => {
    setInventoryRequestItems((prev) => prev.filter((item) => String(item.productId) !== String(productId)));
  };

  const onApproveInventoryBatch = (ids) =>
    runAction(
      () => Promise.all(ids.map((id) => approveInventoryRequest(id))),
      'Solicitud de inventario aprobada.',
      loadApprovals
    );

  const onRejectInventoryBatch = (ids) =>
    runAction(
      () => Promise.all(ids.map((id) => rejectInventoryRequest(id))),
      'Solicitud de inventario rechazada.',
      loadApprovals
    );

  const onApproveCancellation = (id) =>
    runAction(() => approveOrderCancellation(id), 'Anulacion aprobada.', loadApprovals);

  const onRejectCancellation = (id) =>
    runAction(() => rejectOrderCancellation(id), 'Anulacion rechazada.', loadApprovals);

  const onApproveTopup = (id) => runAction(() => approveTopupRequest(id), 'Recarga aprobada.', loadApprovals);

  const onRejectTopup = (id) => runAction(() => rejectTopupRequest(id), 'Recarga rechazada.', loadApprovals);

  const onCancelSaleFromHistory = (orderId) => {
    const confirmed = window.confirm('Esta accion anulara la venta, repondra inventario y devolvera saldo si aplica. Deseas continuar?');
    if (!confirmed) {
      return;
    }

    runAction(
      () => cancelOrderDirect(orderId),
      'Venta anulada correctamente.',
      async () => {
        await Promise.all([loadOrders(salesFilters), loadApprovals()]);
      }
    );
  };

  const onCancelRechargeFromHistory = (transactionId) => {
    const confirmed = window.confirm('Esta accion anulara la recarga y descontara el saldo del alumno. Deseas continuar?');
    if (!confirmed) {
      return;
    }

    runAction(
      () => cancelRechargeTransaction(transactionId),
      'Recarga anulada correctamente.',
      async () => {
        await loadTopupHistory();
      }
    );
  };

  const onCreateFixedCost = (event) => {
    event.preventDefault();
    runAction(
      () =>
        createAdminFixedCost({
          name: fixedCostForm.name,
          amount: Number(fixedCostForm.amount || 0),
          storeId: fixedCostForm.storeId || null,
          type: fixedCostForm.type || 'fixed',
        }),
      'Costo fijo agregado.',
      async () => {
        setFixedCostForm({ name: '', amount: '', storeId: '', type: fixedCostForm.type || 'fixed' });
        await loadHomepage(homeStoreId);
      }
    );
  };

  const onDeleteFixedCost = (id) => {
    runAction(() => deleteAdminFixedCost(id), 'Costo fijo eliminado.', async () => {
      await loadHomepage(homeStoreId);
    });
  };

  const onApplySalesFilters = (event) => {
    event.preventDefault();
    const loadHistory = historyType === 'sales' ? () => loadOrders(salesFilters) : () => loadTopupHistory();
    const successMessage = historyType === 'sales' ? 'Ventas filtradas.' : 'Recargas filtradas.';
    runAction(loadHistory, successMessage, async () => {
      setSalesPage(1);
    });
  };

  const onChangeHistoryType = async (nextType) => {
    setHistoryType(nextType);
    setSalesPage(1);
    clearMessages();
    const loadHistory = nextType === 'sales' ? () => loadOrders(salesFilters) : () => loadTopupHistory();
    setLoading(true);
    try {
      await loadHistory();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo cargar el historial seleccionado.');
    } finally {
      setLoading(false);
    }
  };

  const onApplyClosureFilters = (event) => {
    event.preventDefault();
    runAction(() => loadClosures(closureFilters), 'Cierres filtrados.');
  };

  const onApplyNotificationAuditFilters = (event) => {
    event.preventDefault();
    const nextPage = 1;
    setNotificationAuditPage(nextPage);
    runAction(
      () => loadNotificationAudit(notificationAuditFilters, nextPage),
      'Notificaciones filtradas.'
    );
  };

  const onChangeNotificationAuditPage = (nextPage) => {
    const safePage = Math.max(1, Math.min(notificationAuditMeta.totalPages, nextPage));
    setNotificationAuditPage(safePage);
    clearMessages();
    setLoading(true);
    loadNotificationAudit(notificationAuditFilters, safePage)
      .catch((requestError) => {
        setError(requestError?.response?.data?.message || 'No se pudo cargar la auditoria de notificaciones.');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const onExportSalesExcel = () => {
    if (historyRows.length === 0) {
      setError('No hay datos para exportar.');
      return;
    }

    const header = historyType === 'sales'
      ? ['Tienda', 'Número de orden', 'Alumno', 'Pedidos', 'Método de pago', 'Total', 'Fecha y hora']
      : ['Tienda', 'Id recarga', 'Alumno', 'Método', 'Monto', 'Estado', 'Solicitada por', 'Fecha y hora'];

    const rows = historyType === 'sales'
      ? historyRows.map((row) => [row.store, row.orderNumber, row.student, row.pedidos, row.paymentMethod, row.total, row.dateTime])
      : historyRows.map((row) => [row.store, row.orderNumber, row.student, row.paymentMethod, row.total, row.status, row.requestedBy, row.dateTime]);

    downloadExcelWorkbook(
      historyType === 'sales' ? 'Ventas' : 'Recargas',
      header,
      rows,
      historyType === 'sales' ? 'ventas' : 'recargas'
    );
  };

  const onExportSalesPdf = () => {
    if (historyRows.length === 0) {
      setError('No hay datos para exportar.');
      return;
    }

    const rowsHtml =
      historyType === 'sales'
        ? historyRows
            .map(
              (row) => `<tr>
          <td>${escapeHtml(row.store)}</td>
          <td>${escapeHtml(row.orderNumber)}</td>
          <td>${escapeHtml(row.student)}</td>
          <td>${escapeHtml(row.pedidos)}</td>
          <td>${escapeHtml(row.paymentMethod)}</td>
          <td>${escapeHtml(row.total)}</td>
          <td>${escapeHtml(row.dateTime)}</td>
        </tr>`
            )
            .join('')
        : historyRows
            .map(
              (row) => `<tr>
          <td>${escapeHtml(row.store)}</td>
          <td>${escapeHtml(row.orderNumber)}</td>
          <td>${escapeHtml(row.student)}</td>
          <td>${escapeHtml(row.paymentMethod)}</td>
          <td>${escapeHtml(row.total)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td>${escapeHtml(row.requestedBy)}</td>
          <td>${escapeHtml(row.dateTime)}</td>
        </tr>`
            )
            .join('');

    const headHtml =
      historyType === 'sales'
        ? `<tr>
          <th>Tienda</th>
          <th>Número de orden</th>
          <th>Alumno</th>
          <th>Pedidos</th>
          <th>Método de pago</th>
          <th>Total</th>
          <th>Fecha y hora</th>
        </tr>`
        : `<tr>
          <th>Tienda</th>
          <th>Id recarga</th>
          <th>Alumno</th>
          <th>Método</th>
          <th>Monto</th>
          <th>Estado</th>
          <th>Solicitada por</th>
          <th>Fecha y hora</th>
        </tr>`;

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Reporte de ventas</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h2 { margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 6px; text-align: left; vertical-align: top; }
      th { background: #f5f5f5; }
    </style>
  </head>
  <body>
    <h2>Reporte de ${historyType === 'sales' ? 'ventas' : 'recargas'}</h2>
    <table>
      <thead>
        ${headHtml}
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('No se pudo abrir la ventana para generar PDF.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const parseEditNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getProductUtility = (price, cost) => parseEditNumber(price) - parseEditNumber(cost);

  const getProductUtilityPercent = (price, cost) => {
    const costNumber = parseEditNumber(cost);
    if (costNumber <= 0) {
      return 0;
    }

    return (getProductUtility(price, cost) / costNumber) * 100;
  };

  const formatMetricValue = (value) => {
    const numericValue = parseEditNumber(value);
    if (!Number.isFinite(numericValue)) {
      return '0';
    }

    return numericValue.toLocaleString('es-CO', { maximumFractionDigits: 2 });
  };

  const getEditExportPayload = () => {
    const statusLabel = (status) => (status === 'inactive' ? 'Inactivo' : 'Activo');
    const roleLabel = (role) => {
      if (role === 'parent') return 'Acudiente';
      if (role === 'vendor') return 'Vendedor';
      if (role === 'admin') return 'Administrador';
      if (role === 'merienda_operator') return 'Tutor de alimentación';
      return role || 'N/A';
    };

    const parentNameById = parentUsers.reduce((acc, parent) => {
      acc[String(parent._id)] = parent.name || parent.username || 'N/A';
      return acc;
    }, {});

    if (editEntity === 'category') {
      return {
        title: 'Categorías',
        fileBaseName: 'categorias',
        headers: ['Nombre', 'Estado'],
        rows: filteredEditEntityItems.map((item) => {
          const draft = getEditTableDraft(item);
          return [draft.name || 'N/A', statusLabel(draft.status)];
        }),
      };
    }

    if (editEntity === 'store') {
      return {
        title: 'Tiendas',
        fileBaseName: 'tiendas',
        headers: ['Nombre', 'Ubicación', 'Estado'],
        rows: filteredEditEntityItems.map((item) => {
          const draft = getEditTableDraft(item);
          return [draft.name || 'N/A', draft.location || 'N/A', statusLabel(draft.status)];
        }),
      };
    }

    if (editEntity === 'product') {
      return {
        title: 'Productos',
        fileBaseName: 'productos',
        headers: ['Nombre', 'Descripción', 'Categoría', 'Precio', 'Costo', 'Utilidad', '% utilidad', 'Stock', 'Alerta', 'Estado'],
        rows: filteredEditEntityItems.map((item) => {
          const draft = getEditTableDraft(item);
          const category = categories.find((cat) => String(cat._id) === String(draft.categoryId));
          const categoryName = draft.categoryName || category?.name || item.categoryName || 'N/A';
          const utility = getProductUtility(draft.price, draft.cost);
          const utilityPercent = getProductUtilityPercent(draft.price, draft.cost);

          return [
            draft.name || 'N/A',
            draft.shortDescription || 'Sin descripción',
            categoryName,
            String(draft.price ?? ''),
            String(draft.cost ?? ''),
            formatMetricValue(utility),
            `${formatMetricValue(utilityPercent)}%`,
            String(draft.stock ?? ''),
            String(draft.inventoryAlertStock ?? ''),
            statusLabel(draft.status),
          ];
        }),
      };
    }

    if (isUserRecordEntity) {
      return {
        title: 'Usuarios',
        fileBaseName: 'usuarios',
        headers: ['Nombre', 'Usuario', 'Teléfono', 'Rol', 'Tienda asignada', 'Estado'],
        rows: filteredEditEntityItems.map((item) => {
          const draft = getEditTableDraft(item);
          const assignedStoreName = stores.find((store) => String(store._id) === String(draft.assignedStoreId))?.name || 'N/A';
          return [
            draft.name || 'N/A',
            draft.username || 'N/A',
            draft.phone || 'N/A',
            roleLabel(draft.role),
            draft.role === 'vendor' ? assignedStoreName : 'No aplica',
            statusLabel(draft.status),
          ];
        }),
      };
    }

    return {
      title: 'Alumnos',
      fileBaseName: 'alumnos',
      headers: ['Nombre', 'Código escolar', 'Grado', 'Saldo', 'Límite diario', 'Acudiente asignado', 'Estado'],
      rows: filteredEditEntityItems.map((item) => {
        const draft = getEditTableDraft(item);
        const parentName = draft.parentId ? parentNameById[String(draft.parentId)] || 'N/A' : 'Sin asignar';
        return [
          draft.name || 'N/A',
          draft.schoolCode || 'N/A',
          draft.grade || 'N/A',
          formatCurrency(draft.balance),
          String(draft.dailyLimit ?? ''),
          parentName,
          statusLabel(draft.status),
        ];
      }),
    };
  };

  const onExportEditExcel = () => {
    const payload = getEditExportPayload();
    if (!payload.rows.length) {
      setError('No hay datos para exportar en la tabla actual.');
      return;
    }

    downloadExcelWorkbook(payload.title, payload.headers, payload.rows, payload.fileBaseName);
  };

  const onExportEditPdf = () => {
    const payload = getEditExportPayload();
    if (!payload.rows.length) {
      setError('No hay datos para exportar en la tabla actual.');
      return;
    }

    const headHtml = `<tr>${payload.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;
    const rowsHtml = payload.rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('');

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Reporte de ${escapeHtml(payload.title)}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      h2 { margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 6px; text-align: left; vertical-align: top; }
      th { background: #f5f5f5; }
    </style>
  </head>
  <body>
    <h2>Reporte de ${escapeHtml(payload.title)}</h2>
    <table>
      <thead>
        ${headHtml}
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('No se pudo abrir la ventana para generar PDF.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const onOpenLegacyMigrationPicker = () => {
    legacyMigrationInputRef.current?.click();
  };

  const onOpenLegacyParentMigrationPicker = () => {
    legacyParentMigrationInputRef.current?.click();
  };

  const onDownloadLegacyTemplate = () => {
    downloadExcelWorkbook(
      'Plantilla migracion',
      ['Alumno', 'Curso', 'Saldo en creditos'],
      [
        ['Ejemplo Alumno 1', '4A', '71600'],
        ['Ejemplo Alumno 2', 'Preparatorio C', '283500'],
      ],
      'plantilla-migracion-alumnos'
    );
  };

  const onDownloadLegacyParentsTemplate = () => {
    downloadExcelWorkbook(
      'Plantilla migracion acudientes',
      ['Nombre del acudiente', 'Nombre de usuario', 'Telefono'],
      [
        ['Acudiente Ejemplo 1', 'acudiente.demo1', '3001234567'],
        ['Acudiente Ejemplo 2', 'acudiente.demo2', '3019876543'],
      ],
      'plantilla-migracion-acudientes'
    );
  };

  const onLegacyMigrationFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    clearMessages();
    setLoading(true);
    setLegacyMigrationLoadingTitle('Migrando base de datos de alumnos');
    setLegacyMigrationLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        throw new Error('El archivo no tiene hojas para procesar.');
      }

      const sheet = workbook.Sheets[firstSheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      if (!Array.isArray(matrix) || matrix.length < 2) {
        throw new Error('El archivo no contiene filas de datos.');
      }

      const headers = matrix[0] || [];
      const { nameIndex, gradeIndex, balanceIndex } = resolveLegacyColumnIndexes(headers);

      const rows = matrix
        .slice(1)
        .map((row) => ({
          name: String(row?.[nameIndex] || '').trim(),
          grade: gradeIndex >= 0 ? String(row?.[gradeIndex] || '').trim() : '',
          balance: parseLegacyBalance(row?.[balanceIndex]),
        }))
        .filter((row) => row.name);

      if (rows.length === 0) {
        throw new Error('No se encontraron alumnos validos en el archivo.');
      }

      const response = await importAdminLegacyStudents({ rows, mode: 'set' });
      const summary = response.data?.summary || {};

      const [studentsRes, linksRes] = await Promise.all([getStudents(), getParentStudentLinks()]);
      setStudents(studentsRes.data || []);
      setLinks(linksRes.data || []);

      setOk(
        `Migracion completada. Filas: ${summary.totalRows || 0}, creados: ${summary.createdStudents || 0}, actualizados: ${summary.updatedStudents || 0}.`
      );
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError.message || 'No se pudo migrar la base de datos.');
    } finally {
      setLegacyMigrationLoading(false);
      setLoading(false);
    }
  };

  const onLegacyParentMigrationFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    clearMessages();
    setLoading(true);
    setLegacyMigrationLoadingTitle('Migrando base de datos de acudientes');
    setLegacyMigrationLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        throw new Error('El archivo no tiene hojas para procesar.');
      }

      const sheet = workbook.Sheets[firstSheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      if (!Array.isArray(matrix) || matrix.length < 2) {
        throw new Error('El archivo no contiene filas de datos.');
      }

      const headers = matrix[0] || [];
      const { nameIndex, usernameIndex, phoneIndex } = resolveLegacyParentColumnIndexes(headers);

      const rows = matrix
        .slice(1)
        .map((row) => ({
          name: String(row?.[nameIndex] || '').trim(),
          username: String(row?.[usernameIndex] || '').toLowerCase().trim(),
          phone: phoneIndex >= 0 ? String(row?.[phoneIndex] || '').trim() : '',
        }))
        .filter((row) => row.name && row.username);

      if (rows.length === 0) {
        throw new Error('No se encontraron acudientes validos en el archivo.');
      }

      const response = await importAdminLegacyParents({ rows });
      const summary = response.data?.summary || {};

      const usersRes = await getAdminUsers();
      setUsers(usersRes.data || []);

      setOk(
        `Migracion de acudientes completada. Filas: ${summary.totalRows || 0}, creados: ${summary.createdParents || 0}, actualizados: ${summary.updatedParents || 0}.`
      );
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError.message || 'No se pudo migrar la base de datos de acudientes.');
    } finally {
      setLegacyMigrationLoading(false);
      setLoading(false);
    }
  };

  const buildEditTableDraft = (item) => {
    if (editEntity === 'category') {
      return {
        name: item.name || '',
        status: item.status || 'active',
      };
    }

    if (editEntity === 'store') {
      return {
        name: item.name || '',
        location: item.location || '',
        status: item.status || 'active',
      };
    }

    if (editEntity === 'product') {
      if (item.isAggregated) {
        return {
          name: item.name || '',
          categoryId: String(item.categoryId || ''),
          categoryName: item.categoryName || 'Sin categoría',
          shortDescription: item.shortDescription || '',
          storeId: String(item.storeId || ''),
          storeName: item.storeName || 'Todas las tiendas',
          price: String(item.price ?? ''),
          cost: String(item.cost ?? ''),
          stock: String(item.stock ?? ''),
          inventoryAlertStock: String(item.inventoryAlertStock ?? 10),
          imageUrl: item.imageUrl || '',
          status: item.status || 'active',
          isAggregated: true,
          sourceProductIds: Array.isArray(item.sourceProductIds) ? item.sourceProductIds : [],
        };
      }

      return {
        name: item.name || '',
        categoryId: String(item.categoryId || ''),
        shortDescription: item.shortDescription || '',
        storeId: String(item.storeId || ''),
        price: String(item.price ?? ''),
        cost: String(item.cost ?? ''),
        stock: String(item.stock ?? ''),
        inventoryAlertStock: String(item.inventoryAlertStock ?? 10),
        imageUrl: item.imageUrl || '',
        status: item.status || 'active',
      };
    }

    if (isUserRecordEntity) {
      return {
        name: item.name || '',
        username: item.username || '',
        phone: item.phone || '',
        role: item.role || 'parent',
        assignedStoreId: String(item.assignedStoreId || ''),
        status: item.status || 'active',
        password: '',
      };
    }

    return {
      name: item.name || '',
      schoolCode: item.schoolCode || '',
      grade: item.grade || '',
      balance: Number(item.walletBalance || 0),
      dailyLimit: String(item.dailyLimit ?? 0),
      status: item.status || 'active',
      parentId: studentParentMap[String(item._id)] || '',
      parentSearch:
        (() => {
          const parentId = studentParentMap[String(item._id)] || '';
          if (!parentId) {
            return '';
          }
          const parent = parentUsers.find((candidate) => String(candidate._id) === String(parentId));
          return parent ? `${parent.name} (${parent.username || 'sin-usuario'})` : '';
        })(),
      parentPickerOpen: false,
    };
  };

  const getEditTableDraft = (item) => {
    const itemId = String(item._id);
    return editTableDrafts[itemId] || buildEditTableDraft(item);
  };

  const onEditTableDraftChange = (item, field, value) => {
    const itemId = String(item._id);
    setEditTableDrafts((prev) => {
      const current = prev[itemId] || buildEditTableDraft(item);

      if (editEntity === 'product' && field === 'storeId') {
        const normalizedName = String(current.name || '').trim().toLowerCase();
        const nextDraft = {
          ...current,
          storeId: value,
        };

        const sameNameAndCategory = products.find(
          (product) =>
            String(product._id) !== itemId &&
            String(product.storeId) === String(value) &&
            String(product.categoryId) === String(nextDraft.categoryId) &&
            String(product.name || '').trim().toLowerCase() === normalizedName
        );

        const sameNameAnyCategory = products.find(
          (product) =>
            String(product._id) !== itemId &&
            String(product.storeId) === String(value) &&
            String(product.name || '').trim().toLowerCase() === normalizedName
        );

        const sameProductInTargetStore = sameNameAndCategory || sameNameAnyCategory;

        // Stock is store-specific; keep current value if no equivalent product is found.
        if (sameProductInTargetStore) {
          nextDraft.stock = String(sameProductInTargetStore.stock ?? 0);
        }

        return {
          ...prev,
          [itemId]: nextDraft,
        };
      }

      return {
        ...prev,
        [itemId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const reloadEditEntityData = async () => {
    if (editEntity === 'category') {
      const response = await getAdminCategories();
      setCategories(response.data || []);
      return;
    }

    if (editEntity === 'store') {
      const response = await getAdminStores();
      setStores(response.data || []);
      return;
    }

    if (editEntity === 'product') {
      const response = await getAdminProducts({ includeInactive: true });
      setProducts(response.data || []);
      await loadHomepage(homeStoreId);
      return;
    }

    if (isUserRecordEntity) {
      const response = await getAdminUsers();
      setUsers(response.data || []);
      return;
    }

    const [studentsRes, linksRes] = await Promise.all([getStudents(), getParentStudentLinks()]);
    setStudents(studentsRes.data || []);
    setLinks(linksRes.data || []);
  };

  const onSaveEditTableRow = (item) => {
    const itemId = String(item._id);
    const draft = getEditTableDraft(item);

    if (editEntity === 'product' && draft.isAggregated) {
      const sourceIds = Array.isArray(draft.sourceProductIds) ? draft.sourceProductIds : [];
      if (sourceIds.length === 0) {
        setError('No se encontraron productos de tienda para actualizar el producto consolidado.');
        return;
      }

      runAction(
        () =>
          Promise.all(
            sourceIds.map((productId) =>
              updateAdminProduct(productId, {
                name: draft.name,
                categoryId: draft.categoryId,
                price: Number(draft.price || 0),
                cost: Number(draft.cost || 0),
                inventoryAlertStock: Number(draft.inventoryAlertStock || 0),
                imageUrl: draft.imageUrl || '',
              })
            )
          ),
        'Producto consolidado actualizado en todas las tiendas.',
        async () => {
          await reloadEditEntityData();
        }
      );
      return;
    }

    if (editEntity === 'category') {
      runAction(
        () => updateAdminCategory(itemId, { name: draft.name, status: draft.status }),
        'Registro actualizado.',
        async () => {
          await reloadEditEntityData();
        }
      );
      return;
    }

    if (editEntity === 'store') {
      runAction(
        () => updateAdminStore(itemId, { name: draft.name, location: draft.location, status: draft.status }),
        'Registro actualizado.',
        async () => {
          await reloadEditEntityData();
        }
      );
      return;
    }

    if (editEntity === 'product') {
      runAction(
        () =>
          updateAdminProduct(itemId, {
            name: draft.name,
            categoryId: draft.categoryId,
            price: Number(draft.price || 0),
            cost: Number(draft.cost || 0),
            inventoryAlertStock: Number(draft.inventoryAlertStock || 0),
            imageUrl: draft.imageUrl,
          }),
        'Registro actualizado.',
        async () => {
          await reloadEditEntityData();
        }
      );
      return;
    }

    if (isUserRecordEntity) {
      const targetRole = editEntity === 'user' ? draft.role : editEntity;
      if (targetRole === 'vendor' && !draft.assignedStoreId) {
        setError('Debes asignar una tienda al vendedor.');
        return;
      }

      runAction(
        () =>
          updateAdminUser(itemId, {
            name: draft.name,
            username: draft.username,
            phone: draft.phone,
            role: targetRole,
            assignedStoreId: targetRole === 'vendor' ? draft.assignedStoreId || undefined : null,
            status: draft.status,
            password: draft.password || undefined,
          }),
        'Registro actualizado.',
        async () => {
          await reloadEditEntityData();
        }
      );
      return;
    }

    runAction(
      () =>
        updateAdminStudent(itemId, {
          name: draft.name,
          schoolCode: draft.schoolCode,
          grade: draft.grade,
          dailyLimit: Number(draft.dailyLimit || 0),
          status: draft.status,
          parentId: draft.parentId || null,
        }),
      'Registro actualizado.',
      async () => {
        await reloadEditEntityData();
      }
    );
  };

  const onDeleteEditTableRow = (item) => {
    const itemId = String(item._id);

    if (editEntity === 'category') {
      runAction(() => deleteAdminCategory(itemId), 'Registro eliminado.', reloadEditEntityData);
      return;
    }

    if (editEntity === 'store') {
      runAction(() => deleteAdminStore(itemId), 'Registro eliminado.', reloadEditEntityData);
      return;
    }

    if (editEntity === 'product') {
      if (item.isAggregated) {
        const sourceIds = Array.isArray(item.sourceProductIds) ? item.sourceProductIds : [];

        if (sourceIds.length === 0) {
          setError('No se encontraron productos asociados para eliminar este registro consolidado.');
          return;
        }

        runAction(
          () => Promise.all(sourceIds.map((productId) => deleteAdminProduct(productId))),
          'Registros eliminados.',
          reloadEditEntityData
        );
        return;
      }

      runAction(() => deleteAdminProduct(itemId), 'Registro eliminado.', reloadEditEntityData);
      return;
    }

    if (isUserRecordEntity) {
      runAction(() => deleteAdminUser(itemId), 'Registro eliminado.', reloadEditEntityData);
      return;
    }

    runAction(() => deleteAdminStudent(itemId), 'Registro eliminado.', reloadEditEntityData);
  };

  const onToggleProductRowSelection = (itemId, checked) => {
    const normalizedId = String(itemId || '');
    if (!normalizedId) {
      return;
    }

    setSelectedProductRowIds((prev) => {
      const next = new Set(prev.map((id) => String(id)));
      if (checked) {
        next.add(normalizedId);
      } else {
        next.delete(normalizedId);
      }
      return Array.from(next);
    });
  };

  const onToggleSelectAllVisibleProducts = (checked) => {
    if (!isBulkProductMode) {
      return;
    }

    const visibleIds = paginatedEditEntityItems.map((item) => String(item._id));
    setSelectedProductRowIds((prev) => {
      const next = new Set(prev.map((id) => String(id)));
      if (checked) {
        visibleIds.forEach((id) => next.add(id));
      } else {
        visibleIds.forEach((id) => next.delete(id));
      }
      return Array.from(next);
    });
  };

  const onDeleteSelectedProductRows = async () => {
    if (!isBulkProductMode || selectedProductRowIds.length === 0) {
      setError('Selecciona al menos un producto para aplicar acciones en masa.');
      return;
    }

    const selectedSet = new Set(selectedProductRowIds.map((id) => String(id)));
    const selectedItems = filteredEditEntityItems.filter((item) => selectedSet.has(String(item._id)));

    const targetProductIds = new Set();
    for (const item of selectedItems) {
      if (item.isAggregated) {
        const sourceIds = Array.isArray(item.sourceProductIds) ? item.sourceProductIds : [];
        sourceIds.forEach((sourceId) => targetProductIds.add(String(sourceId)));
      } else {
        targetProductIds.add(String(item._id));
      }
    }

    const idsToDelete = Array.from(targetProductIds).filter(Boolean);
    if (idsToDelete.length === 0) {
      setError('No se encontraron productos válidos para eliminar.');
      return;
    }

    clearMessages();
    setLoading(true);

    try {
      await Promise.all(idsToDelete.map((productId) => deleteAdminProduct(productId)));
      setOk(`Se eliminaron ${idsToDelete.length} productos en masa.`);
      setSelectedProductRowIds([]);

      try {
        await reloadEditEntityData();
      } catch (reloadError) {
        // No marcamos la accion como fallida si el borrado ya fue exitoso.
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo completar la accion.');
    } finally {
      setLoading(false);
    }
  };

  const resetEditSection = () => {
    setEditItemId('');
    setEditSearchQuery('');
    setShowEditRegistryOptions(false);
    setEditCategoryForm({ name: '', status: 'active' });
    setEditStoreForm({ name: '', location: '', status: 'active' });
    setEditProductForm({
      name: '',
      categoryId: '',
      shortDescription: '',
      storeId: '',
      price: '',
      cost: '',
      stock: '',
      inventoryAlertStock: '10',
      imageUrl: '',
      status: 'active',
    });
    setEditUserForm({
      name: '',
      username: '',
      phone: '',
      role: 'parent',
      assignedStoreId: '',
      status: 'active',
      password: '',
    });
    setEditStudentForm({
      name: '',
      schoolCode: '',
      grade: '',
      dailyLimit: '',
      status: 'active',
      parentId: '',
    });
    setEditStudentBalance(null);
    setLoadingEditStudentBalance(false);
  };

  const onSaveEdit = (event) => {
    event.preventDefault();

    if (!editItemId) {
      setError('Selecciona un registro para modificar.');
      return;
    }

    if (editEntity === 'category') {
      runAction(
        () =>
          updateAdminCategory(editItemId, {
            name: editCategoryForm.name,
            status: editCategoryForm.status,
          }),
        'Categoría actualizada.',
        async () => {
          const categoriesRes = await getAdminCategories();
          setCategories(categoriesRes.data || []);
          resetEditSection();
        }
      );
      return;
    }

    if (editEntity === 'store') {
      runAction(
        () =>
          updateAdminStore(editItemId, {
            name: editStoreForm.name,
            location: editStoreForm.location,
            status: editStoreForm.status,
          }),
        'Tienda actualizada.',
        async () => {
          const storesRes = await getAdminStores();
          setStores(storesRes.data || []);
          resetEditSection();
        }
      );
      return;
    }

    if (editEntity === 'product') {
      runAction(
        () =>
          updateAdminProduct(editItemId, {
            name: editProductForm.name,
            categoryId: editProductForm.categoryId,
            shortDescription: String(editProductForm.shortDescription || '').trim(),
            storeId: editProductForm.storeId,
            price: Number(editProductForm.price || 0),
            cost: Number(editProductForm.cost || 0),
            stock: Number(editProductForm.stock || 0),
            inventoryAlertStock: Number(editProductForm.inventoryAlertStock || 0),
            imageUrl: editProductForm.imageUrl,
            status: editProductForm.status,
          }),
        'Producto actualizado.',
        async () => {
          const productsRes = await getAdminProducts({ includeInactive: true });
          setProducts(productsRes.data || []);
          resetEditSection();
          await loadHomepage(homeStoreId);
        }
      );
      return;
    }

    if (isUserRecordEntity) {
      const targetRole = editEntity === 'user' ? editUserForm.role : editEntity;
      if (targetRole === 'vendor' && !editUserForm.assignedStoreId) {
        setError('Debes asignar una tienda al vendedor.');
        return;
      }

      runAction(
        () =>
          updateAdminUser(editItemId, {
            name: editUserForm.name,
            username: editUserForm.username,
            phone: editUserForm.phone,
            role: targetRole,
            assignedStoreId: targetRole === 'vendor'
              ? editUserForm.assignedStoreId || undefined
              : null,
            status: editUserForm.status,
            password: editUserForm.password || undefined,
          }),
        'Usuario actualizado.',
        async () => {
          const usersRes = await getAdminUsers();
          setUsers(usersRes.data || []);
          resetEditSection();
        }
      );
      return;
    }

    runAction(
      () =>
        updateAdminStudent(editItemId, {
          name: editStudentForm.name,
          schoolCode: editStudentForm.schoolCode,
          grade: editStudentForm.grade,
          dailyLimit: Number(editStudentForm.dailyLimit || 0),
          status: editStudentForm.status,
          parentId: editStudentForm.parentId || null,
        }),
      'Alumno actualizado.',
      async () => {
        const [studentsRes, linksRes] = await Promise.all([getStudents(), getParentStudentLinks()]);
        setStudents(studentsRes.data || []);
        setLinks(linksRes.data || []);
        resetEditSection();
      }
    );
  };

  const executeDeleteEdit = () => {
    if (!editItemId) {
      setError('Selecciona un registro para eliminar.');
      return;
    }

    if (editEntity === 'category') {
      runAction(
        () => deleteAdminCategory(editItemId),
        'Categoría eliminada.',
        async () => {
          const categoriesRes = await getAdminCategories();
          setCategories(categoriesRes.data || []);
          resetEditSection();
        }
      );
      return;
    }

    if (editEntity === 'store') {
      runAction(
        () => deleteAdminStore(editItemId),
        'Tienda eliminada.',
        async () => {
          const storesRes = await getAdminStores();
          setStores(storesRes.data || []);
          resetEditSection();
        }
      );
      return;
    }

    if (editEntity === 'product') {
      runAction(
        () => deleteAdminProduct(editItemId),
        'Producto eliminado.',
        async () => {
          const productsRes = await getAdminProducts({ includeInactive: true });
          setProducts(productsRes.data || []);
          resetEditSection();
          await loadHomepage(homeStoreId);
        }
      );
      return;
    }

    if (isUserRecordEntity) {
      runAction(
        () => deleteAdminUser(editItemId),
        'Usuario eliminado.',
        async () => {
          const usersRes = await getAdminUsers();
          setUsers(usersRes.data || []);
          resetEditSection();
        }
      );
      return;
    }

    runAction(
      () => deleteAdminStudent(editItemId),
      'Alumno eliminado.',
      async () => {
        const [studentsRes, linksRes] = await Promise.all([getStudents(), getParentStudentLinks()]);
        setStudents(studentsRes.data || []);
        setLinks(linksRes.data || []);
        resetEditSection();
      }
    );
  };

  const onDeleteEdit = () => {
    if (!editItemId) {
      setError('Selecciona un registro para eliminar.');
      return;
    }

    const targetItem = editEntityItems.find((item) => String(item._id) === String(editItemId));
    setDeleteTargetLabel(getEditItemLabel(targetItem) || 'el registro seleccionado');
    setShowDeleteConfirmModal(true);
  };

  const onChangeHomeStore = async (storeId) => {
    setHomeStoreId(storeId);
    setLoading(true);
    clearMessages();
    try {
      await loadHomepage(storeId);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo cargar el homepage KPI.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-portal">
      <section className="admin-hero">
        <div className="admin-hero-main">
          <p className="admin-kicker">SmartLunch Admin</p>
          <h2>Portal administrativo operativo</h2>
          <p>Gestiona KPI, ventas, recargas, creaciones, inventario, autorizaciones y cierres por tienda.</p>
        </div>
        <div className="admin-hero-side">
          <button className="btn btn-primary" onClick={loadBaseData} type="button">
            {loading ? 'Cargando...' : 'Actualizar portal'}
          </button>
        </div>
      </section>

      <section className="admin-view-switch">
        {modules.map((moduleItem) => (
          <button
            className={`btn btn-chip ${activeModule === moduleItem.id ? 'is-active' : ''}`}
            key={moduleItem.id}
            onClick={() => setActiveModule(moduleItem.id)}
            type="button"
          >
            {moduleItem.id === 'approvals'
              ? `${moduleItem.label}${pendingApprovalsCount > 0 ? ` (${pendingApprovalsCount})` : ''}`
              : moduleItem.label}
          </button>
        ))}
      </section>

      <DismissibleNotice text={error} type="error" onClose={() => setError('')} />

      {ok ? (
        <div className={`snack-save-toast admin-confirm-toast ${okToastFading ? 'is-fading' : ''}`} role="status" aria-live="polite">
          <div className="snack-save-toast-icon" aria-hidden="true">✓</div>
          <div className="snack-save-toast-text">
            <h4>Confirmación</h4>
            <p>{ok}</p>
          </div>
        </div>
      ) : null}

      {legacyMigrationLoading ? (
        <div className="legacy-migration-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="legacy-migration-modal">
            <div className="legacy-migration-spinner" aria-hidden="true" />
            <h4>{legacyMigrationLoadingTitle}</h4>
            <p>Estamos procesando el archivo. Este proceso puede tardar unos segundos.</p>
          </div>
        </div>
      ) : null}

      {activeModule === 'home' ? (
        <section className="panel admin-section">
          <form className="admin-form-grid" onSubmit={(event) => event.preventDefault()}>
            <label>
              Tienda para KPIs
              <select value={homeStoreId} onChange={(event) => onChangeHomeStore(event.target.value)}>
                <option value="">Todas las tiendas</option>
                {stores.map((store) => (
                  <option key={store._id} value={store._id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
          </form>

          <div className="cards">
            <div className="card admin-kpi-card">
              <h4>Ventas del día</h4>
              <p>{formatCurrency(homeData?.salesToday)}</p>
            </div>
            <div className="card admin-kpi-card">
              <h4>Ventas de la semana</h4>
              <p>{formatCurrency(homeData?.salesWeek)}</p>
            </div>
            <div className="card admin-kpi-card">
              <h4>Ventas del mes</h4>
              <p>{formatCurrency(homeData?.salesMonth)}</p>
            </div>
            <div className="card admin-kpi-card">
              <h4>Utilidades del día</h4>
              <p>{formatCurrency(homeData?.utilityToday)}</p>
            </div>
            <div className="card admin-kpi-card">
              <h4>Utilidades de la semana</h4>
              <p>{formatCurrency(homeData?.utilityWeek)}</p>
            </div>
            <div className="card admin-kpi-card">
              <h4>Utilidades del mes</h4>
              <p>{formatCurrency(homeData?.utilityMonth)}</p>
            </div>
          </div>

          <div className="cards admin-list-cards">
            <div className="card">
              <h4>Alumnos con mayor consumo (promedio diario)</h4>
              {(homeData?.topStudents || []).map((item) => (
                <p key={String(item.studentId)}>
                  {(item.studentName || 'Alumno')} - {formatCurrency(item.averageDailySpent)} / día
                </p>
              ))}
            </div>
            <div className="card">
              <h4>Productos más rentables por % (Top 10)</h4>
              {(homeData?.topProductsByPercent || []).length === 0 ? <p>Sin productos para mostrar.</p> : null}
              {(homeData?.topProductsByPercent || []).length > 0 ? (
                <div className="admin-low-balance-table-wrap">
                  <table className="admin-low-balance-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Rentabilidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(homeData?.topProductsByPercent || []).map((item) => (
                        <tr key={String(item.productId)}>
                          <td>{item.productName || 'Producto'}</td>
                          <td>{Number(item.utilityPercent || 0).toFixed(2)}% ({formatCurrency(item.utilityValue)})</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
            <div className="card">
              <h4>Productos más rentables por valor (Top 10)</h4>
              {(homeData?.topProductsByValue || []).length === 0 ? <p>Sin productos para mostrar.</p> : null}
              {(homeData?.topProductsByValue || []).length > 0 ? (
                <div className="admin-low-balance-table-wrap">
                  <table className="admin-low-balance-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Utilidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(homeData?.topProductsByValue || []).map((item) => (
                        <tr key={String(item.productId)}>
                          <td>{item.productName || 'Producto'}</td>
                          <td>{formatCurrency(item.utilityValue)} ({Number(item.utilityPercent || 0).toFixed(2)}%)</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
            <div className="card">
              <h4>Productos menos rentables por % (Top 10)</h4>
              {(homeData?.leastProfitableProductsByPercent || []).length === 0 ? <p>Sin productos para mostrar.</p> : null}
              {(homeData?.leastProfitableProductsByPercent || []).length > 0 ? (
                <div className="admin-low-balance-table-wrap">
                  <table className="admin-low-balance-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Rentabilidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(homeData?.leastProfitableProductsByPercent || []).map((item) => (
                        <tr key={String(item.productId)}>
                          <td>{item.productName || 'Producto'}</td>
                          <td>{Number(item.utilityPercent || 0).toFixed(2)}% ({formatCurrency(item.utilityValue)})</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
            <div className="card">
              <h4>Alumnos con poco saldo</h4>
              {(homeData?.lowBalanceStudents || []).length === 0 ? <p>Sin alumnos con poco saldo.</p> : null}
              {(homeData?.lowBalanceStudents || []).length > 0 ? (
                <div className="admin-low-balance-table-wrap admin-card-scroll">
                  <table className="admin-low-balance-table">
                    <thead>
                      <tr>
                        <th>Nombre alumno</th>
                        <th>Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(homeData?.lowBalanceStudents || []).slice(0, 10).map((item) => (
                        <tr key={String(item.studentId)}>
                          <td>{item.studentName || 'Alumno'}</td>
                          <td>{formatCurrency(item.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
            <div className="card">
              <h4>Productos más consumidos</h4>
              {(homeData?.topProducts || []).map((item) => (
                <p key={String(item.productId)}>
                  {(item.productName || 'Producto')} - {item.quantity} und
                </p>
              ))}
            </div>
            <div className="card">
              <h4>Alertas de inventario</h4>
              {(homeData?.lowStockProducts || []).length === 0 ? <p>Sin alertas de inventario.</p> : null}
              {(homeData?.lowStockProducts || []).length > 0 ? (
                <div className="admin-low-balance-table-wrap admin-card-scroll">
                  <table className="admin-low-balance-table">
                    <thead>
                      <tr>
                        <th>Tienda</th>
                        <th>Producto</th>
                        <th>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(homeData?.lowStockProducts || []).slice(0, 10).map((item) => (
                        <tr key={String(item._id)}>
                          <td>{item.storeId?.name || 'Tienda'}</td>
                          <td>{item.name || 'Producto'}</td>
                          <td>{Number(item.stock || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
            <div className="card admin-compact-value-card">
              <h4>Utilidad teorica del mes</h4>
              <p>{formatCurrency(homeData?.utilityTheoreticalMonth ?? homeData?.utilityMonth)}</p>
              <small>Utilidades del mes - costos fijos - costos variables</small>
            </div>
            <div className="card admin-compact-value-card">
              <h4>Costos fijos</h4>
              <p>{formatCurrency(homeData?.totalFixedCosts)}</p>
            </div>
            <div className="card">
              <h4>Costos variables</h4>
              <p>{formatCurrency(homeData?.totalVariableCosts)}</p>
            </div>
            <div className="card">
              <h4>Ingresos - egresos</h4>
              <p>{formatCurrency(homeData?.utilityNetMonth)}</p>
              <small>Ventas del mes - costos fijos - costos variables</small>
            </div>
          </div>

          <div className="card">
            <h4>Costos operativos</h4>
            <form className="admin-form-grid" onSubmit={onCreateFixedCost}>
              <label>
                Tipo
                <select
                  value={fixedCostForm.type}
                  onChange={(event) => setFixedCostForm((prev) => ({ ...prev, type: event.target.value }))}
                >
                  <option value="fixed">Fijo</option>
                  <option value="variable">Variable</option>
                </select>
              </label>
              <label>
                Concepto
                <input
                  value={fixedCostForm.name}
                  onChange={(event) => setFixedCostForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Ej: Arriendo, nomina, internet"
                  required
                />
              </label>
              <label>
                Valor
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={fixedCostForm.amount}
                  onChange={(event) => setFixedCostForm((prev) => ({ ...prev, amount: event.target.value }))}
                  required
                />
              </label>
              <label>
                Tienda (opcional)
                <select
                  value={fixedCostForm.storeId}
                  onChange={(event) => setFixedCostForm((prev) => ({ ...prev, storeId: event.target.value }))}
                >
                  <option value="">Global (todas)</option>
                  {stores.map((store) => (
                    <option key={store._id} value={store._id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-primary" type="submit">
                Agregar costo
              </button>
            </form>

            <div className="admin-cost-summary-row">
              <p>Total costos fijos del mes: <strong>{formatCurrency(homeData?.totalFixedCosts)}</strong></p>
              <p>Total costos variables del mes: <strong>{formatCurrency(homeData?.totalVariableCosts)}</strong></p>
            </div>

            <h5 className="admin-cost-list-title">Costos fijos</h5>
            {(homeData?.fixedCosts || []).length === 0 ? <p>No hay costos fijos registrados.</p> : null}
            {(homeData?.fixedCosts || []).map((item) => (
              <div className="admin-row-actions" key={item._id}>
                <p>
                  {item.name} - {formatCurrency(item.amount)} ({item.storeId?.name || 'Global'})
                </p>
                <button className="btn btn-ghost" onClick={() => onDeleteFixedCost(item._id)} type="button">
                  Eliminar
                </button>
              </div>
            ))}

            <h5 className="admin-cost-list-title">Costos variables</h5>
            {(homeData?.variableCosts || []).length === 0 ? <p>No hay costos variables registrados.</p> : null}
            {(homeData?.variableCosts || []).map((item) => (
              <div className="admin-row-actions" key={item._id}>
                <p>
                  {item.name} - {formatCurrency(item.amount)} ({item.storeId?.name || 'Global'})
                </p>
                <button className="btn btn-ghost" onClick={() => onDeleteFixedCost(item._id)} type="button">
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeModule === 'sales' ? (
        <section className="panel admin-section">
          <h3>Historial de ventas & recargas</h3>
          <div className="row gap">
            <label>
              Buscar en
              <select value={historyType} onChange={(event) => onChangeHistoryType(event.target.value)}>
                <option value="sales">Ventas</option>
                <option value="topups">Recargas</option>
              </select>
            </label>
          </div>
          <form className="admin-form-grid" onSubmit={onApplySalesFilters}>
            <label>
              Alumno
              <div className="product-picker">
                <input
                  placeholder="Todos"
                  value={salesStudentQuery}
                  onFocus={() => setShowSalesStudentOptions(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowSalesStudentOptions(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSalesStudentQuery(value);
                    setSalesFilters((prev) => ({ ...prev, studentId: '' }));
                    setShowSalesStudentOptions(true);
                  }}
                />
                {showSalesStudentOptions ? (
                  <div className="product-picker-menu">
                    <button
                      className="product-picker-option"
                      onMouseDown={() => {
                        setSalesFilters((prev) => ({ ...prev, studentId: '' }));
                        setSalesStudentQuery('');
                        setShowSalesStudentOptions(false);
                      }}
                      type="button"
                    >
                      Todos
                    </button>
                    {filteredSalesStudents.map((student) => (
                      <button
                        className="product-picker-option"
                        key={student._id}
                        onMouseDown={() => {
                          setSalesFilters((prev) => ({ ...prev, studentId: student._id }));
                          setSalesStudentQuery(`${student.name || 'Alumno'}${student.schoolCode ? ` (${student.schoolCode})` : ''}`);
                          setShowSalesStudentOptions(false);
                        }}
                        type="button"
                      >
                        {student.name || 'Alumno'} {student.schoolCode ? `(${student.schoolCode})` : ''}
                      </button>
                    ))}
                    {filteredSalesStudents.length === 0 ? <p className="product-picker-empty">Sin coincidencias</p> : null}
                  </div>
                ) : null}
              </div>
            </label>
            <label>
              Desde
              <input type="date" value={salesFilters.from} onChange={(event) => setSalesFilters((prev) => ({ ...prev, from: event.target.value }))} />
            </label>
            <label>
              Hasta
              <input type="date" value={salesFilters.to} onChange={(event) => setSalesFilters((prev) => ({ ...prev, to: event.target.value }))} />
            </label>
            <button className="btn btn-primary" type="submit">
              {historyType === 'sales' ? 'Filtrar ventas' : 'Filtrar recargas'}
            </button>
          </form>

          <div className="card">
            <div className="row gap">
              <button className="btn" onClick={onExportSalesExcel} type="button">
                Descargar Excel
              </button>
              <button className="btn" onClick={onExportSalesPdf} type="button">
                Descargar PDF
              </button>
            </div>
            <p>
              <strong>
                {historyType === 'sales' ? 'Suma total de ventas filtradas' : 'Suma total de recargas filtradas'}:{' '}
                {formatCurrency(historyTotalAmount)}
              </strong>
            </p>
            <table className="simple-table">
              <thead>
                {historyType === 'sales' ? (
                  <tr>
                    <th>Tienda</th>
                    <th>Número de orden</th>
                    <th>Alumno</th>
                    <th>Pedidos</th>
                    <th>Método de pago</th>
                    <th>Total</th>
                    <th>Fecha y hora</th>
                    <th>Acción</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Tienda</th>
                    <th>Id recarga</th>
                    <th>Alumno</th>
                    <th>Método</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th>Solicitada por</th>
                    <th>Fecha y hora</th>
                    <th>Acción</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {historyType === 'sales'
                  ? paginatedSalesOrders.map((row) => (
                      <tr key={row._id}>
                        <td>{row.store}</td>
                        <td>{row.orderNumber}</td>
                        <td>{row.student}</td>
                        <td>{row.pedidos}</td>
                        <td>{row.paymentMethod}</td>
                        <td>{row.total}</td>
                        <td>{row.dateTime}</td>
                        <td>
                          <button className="btn" onClick={() => onCancelSaleFromHistory(row._id)} type="button">
                            Anular venta
                          </button>
                        </td>
                      </tr>
                    ))
                  : paginatedSalesOrders.map((row) => (
                      <tr key={row._id}>
                        <td>{row.store}</td>
                        <td>{row.orderNumber}</td>
                        <td>{row.student}</td>
                        <td>{row.paymentMethod}</td>
                        <td>{row.total}</td>
                        <td>{row.status}</td>
                        <td>{row.requestedBy}</td>
                        <td>{row.dateTime}</td>
                        <td>
                          <button className="btn" onClick={() => onCancelRechargeFromHistory(row._id)} type="button">
                            Anular recarga
                          </button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {historyRows.length === 0 ? <p>No hay resultados para los filtros seleccionados.</p> : null}

            <div className="row gap">
              <button
                className="btn"
                disabled={salesPage <= 1}
                onClick={() => setSalesPage((prev) => Math.max(1, prev - 1))}
                type="button"
              >
                Anterior
              </button>
              <p>
                Pagina {salesPage} de {salesTotalPages}
              </p>
              <button
                className="btn"
                disabled={salesPage >= salesTotalPages}
                onClick={() => setSalesPage((prev) => Math.min(salesTotalPages, prev + 1))}
                type="button"
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {activeModule === 'school_billing' ? (
        <section className="panel admin-section">
          <h3>Cuentas de cobro colegio</h3>

          <form className="admin-form-grid" onSubmit={onApplySchoolBillingFilters}>
            <label>
              Desde
              <input
                type="date"
                value={schoolBillingFilters.from}
                onChange={(event) => setSchoolBillingFilters((prev) => ({ ...prev, from: event.target.value }))}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={schoolBillingFilters.to}
                onChange={(event) => setSchoolBillingFilters((prev) => ({ ...prev, to: event.target.value }))}
              />
            </label>
            <label>
              Buscar
              <input
                value={schoolBillingFilters.q}
                onChange={(event) => setSchoolBillingFilters((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="Orden, tienda, vendedor, dirigido a, responsable o producto"
              />
            </label>
            <button className="btn btn-primary" type="submit">
              Filtrar
            </button>
          </form>

          <button className="btn" type="button" onClick={() => runAction(() => loadSchoolBillingOrders(schoolBillingFilters), 'Cuentas de cobro actualizadas.') }>
            Actualizar
          </button>

          {schoolBillingOrders.length === 0 ? <p>No hay cuentas de cobro colegio para los filtros seleccionados.</p> : null}

          {pendingSchoolBillingOrders.length > 0 ? (
            <div className="card">
              <h4>Ordenes pendientes</h4>
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Orden</th>
                    <th>Tienda</th>
                    <th>Vendedor</th>
                    <th>Alumno</th>
                    <th>Dirigido a</th>
                    <th>Responsable</th>
                    <th>Total</th>
                    <th>Fecha y hora</th>
                    <th>Detalle de productos</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingSchoolBillingOrders.map((order) => (
                    <tr key={`summary-${order._id}`} className="school-billing-row-detail">
                      <td>{order.orderNumber || order._id}</td>
                      <td>{order.storeId?.name || 'N/A'}</td>
                      <td>{order.vendorId?.name || order.vendorId?.username || 'N/A'}</td>
                      <td>{order.studentId?.name || (order.guestSale ? 'Venta externa' : 'N/A')}</td>
                      <td>{order.schoolBillingFor || 'N/A'}</td>
                      <td>{order.schoolBillingResponsible || 'N/A'}</td>
                      <td>{formatCurrency(order.total)}</td>
                      <td>{formatDateTime(order.createdAt)}</td>
                      <td>
                        <table className="simple-table school-billing-items-table">
                          <thead>
                            <tr>
                              <th>Producto</th>
                              <th>Cantidad</th>
                              <th>Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(order.items || []).map((item, index) => (
                              <tr key={`${order._id}-pending-item-${index}`}>
                                <td>{item.nameSnapshot || 'Producto'}</td>
                                <td>{item.quantity}</td>
                                <td>{formatCurrency(item.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                      <td>PENDIENTE</td>
                      <td>
                        <button className="btn btn-primary" type="button" onClick={() => onMarkSchoolBillingCollected(order._id)}>
                          Cobrado
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {collectedSchoolBillingOrders.length > 0 ? (
            <div className="card">
              <h4>Ordenes cobradas</h4>
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Orden</th>
                    <th>Tienda</th>
                    <th>Vendedor</th>
                    <th>Alumno</th>
                    <th>Dirigido a</th>
                    <th>Responsable</th>
                    <th>Total</th>
                    <th>Fecha y hora</th>
                    <th>Detalle de productos</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {collectedSchoolBillingOrders.map((order) => (
                    <tr key={`collected-${order._id}`} className="school-billing-row-detail">
                      <td>{order.orderNumber || order._id}</td>
                      <td>{order.storeId?.name || 'N/A'}</td>
                      <td>{order.vendorId?.name || order.vendorId?.username || 'N/A'}</td>
                      <td>{order.studentId?.name || (order.guestSale ? 'Venta externa' : 'N/A')}</td>
                      <td>{order.schoolBillingFor || 'N/A'}</td>
                      <td>{order.schoolBillingResponsible || 'N/A'}</td>
                      <td>{formatCurrency(order.total)}</td>
                      <td>{formatDateTime(order.createdAt)}</td>
                      <td>
                        <table className="simple-table school-billing-items-table">
                          <thead>
                            <tr>
                              <th>Producto</th>
                              <th>Cantidad</th>
                              <th>Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(order.items || []).map((item, index) => (
                              <tr key={`${order._id}-collected-item-${index}`}>
                                <td>{item.nameSnapshot || 'Producto'}</td>
                                <td>{item.quantity}</td>
                                <td>{formatCurrency(item.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                      <td>COBRADO</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeModule === 'notifications' ? (
        <section className="panel admin-section">
          <h3>Auditoria de notificaciones push</h3>
          <form className="admin-form-grid" onSubmit={onApplyNotificationAuditFilters}>
            <label>
              Alumno
              <select
                value={notificationAuditFilters.studentId}
                onChange={(event) =>
                  setNotificationAuditFilters((prev) => ({ ...prev, studentId: event.target.value }))
                }
              >
                <option value="">Todos</option>
                {students.map((student) => (
                  <option key={student._id} value={student._id}>
                    {student.name || 'Alumno'} {student.schoolCode ? `(${student.schoolCode})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select
                value={notificationAuditFilters.type}
                onChange={(event) =>
                  setNotificationAuditFilters((prev) => ({ ...prev, type: event.target.value }))
                }
              >
                <option value="">Todos</option>
                <option value="order_created">Compra POS</option>
                <option value="low_balance_lt20">Saldo bajo &lt; 20k</option>
                <option value="low_balance_lt10">Saldo bajo &lt; 10k</option>
                <option value="auto_debit_recharge">Recarga automática</option>
                <option value="tutor_comment">Comentario tutor</option>
                {notificationTypeOptions
                  .filter((item) => !Object.prototype.hasOwnProperty.call(pushTypeLabel, item))
                  .map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Estado
              <select
                value={notificationAuditFilters.status}
                onChange={(event) =>
                  setNotificationAuditFilters((prev) => ({ ...prev, status: event.target.value }))
                }
              >
                <option value="">Todos</option>
                <option value="pending">Pendiente</option>
                <option value="sent">Enviada</option>
                <option value="failed">Fallida</option>
              </select>
            </label>
            <label>
              Desde
              <input
                type="date"
                value={notificationAuditFilters.from}
                onChange={(event) =>
                  setNotificationAuditFilters((prev) => ({ ...prev, from: event.target.value }))
                }
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={notificationAuditFilters.to}
                onChange={(event) =>
                  setNotificationAuditFilters((prev) => ({ ...prev, to: event.target.value }))
                }
              />
            </label>
            <label>
              Buscar texto
              <input
                placeholder="Titulo, mensaje o error"
                value={notificationAuditFilters.q}
                onChange={(event) =>
                  setNotificationAuditFilters((prev) => ({ ...prev, q: event.target.value }))
                }
              />
            </label>
            <button className="btn btn-primary" type="submit">
              {loading ? 'Cargando...' : 'Filtrar notificaciones'}
            </button>
          </form>

          <div className="card">
            <p>
              <strong>Total registros:</strong> {notificationAuditMeta.total}
            </p>
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Alumno</th>
                  <th>Acudiente</th>
                  <th>Tipo</th>
                  <th>Titulo</th>
                  <th>Mensaje</th>
                  <th>Estado</th>
                  <th>Enviada</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {notificationAuditRows.map((row) => {
                  const rowType = String(row?.payload?.type || '').trim();
                  return (
                    <tr key={row._id}>
                      <td>{row.createdAt ? new Date(row.createdAt).toLocaleString('es-CO') : 'N/A'}</td>
                      <td>
                        {row.studentId?.name || 'N/A'}
                        {row.studentId?.schoolCode ? ` (${row.studentId.schoolCode})` : ''}
                      </td>
                      <td>
                        {row.parentId?.name || 'N/A'}
                        {row.parentId?.username ? ` (${row.parentId.username})` : ''}
                      </td>
                      <td>{pushTypeLabel[rowType] || rowType || 'N/A'}</td>
                      <td>{row.title || 'N/A'}</td>
                      <td>{row.body || 'N/A'}</td>
                      <td>
                        {row.status === 'pending'
                          ? 'Pendiente'
                          : row.status === 'sent'
                            ? 'Enviada'
                            : row.status === 'failed'
                              ? 'Fallida'
                              : row.status || 'N/A'}
                      </td>
                      <td>{row.sentAt ? new Date(row.sentAt).toLocaleString('es-CO') : '-'}</td>
                      <td>{row.lastError || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {notificationAuditRows.length === 0 ? <p>No hay notificaciones para los filtros seleccionados.</p> : null}

            <div className="row gap">
              <button
                className="btn"
                type="button"
                disabled={notificationAuditPage <= 1 || loading}
                onClick={() => onChangeNotificationAuditPage(notificationAuditPage - 1)}
              >
                Anterior
              </button>
              <p>
                Pagina {notificationAuditPage} de {notificationAuditMeta.totalPages}
              </p>
              <button
                className="btn"
                type="button"
                disabled={notificationAuditPage >= notificationAuditMeta.totalPages || loading}
                onClick={() => onChangeNotificationAuditPage(notificationAuditPage + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {activeModule === 'topups' ? (
        <section className="panel admin-section">
          <h3>Recarga manual (efectivo o soporte en ventanilla)</h3>
          <form className="admin-form-grid" onSubmit={onManualTopup}>
            <label>
              Alumno
              <div className="product-picker">
                <input
                  placeholder="Selecciona alumno"
                  value={topupStudentQuery}
                  onFocus={() => setShowTopupStudentOptions(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowTopupStudentOptions(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    setTopupStudentQuery(event.target.value);
                    setManualTopup((prev) => ({ ...prev, studentId: '' }));
                    setShowTopupStudentOptions(true);
                  }}
                  required
                />
                {showTopupStudentOptions ? (
                  <div className="product-picker-menu">
                    {filteredTopupStudents.map((student) => (
                      <button
                        className="product-picker-option"
                        key={student._id}
                        onMouseDown={() => {
                          setManualTopup((prev) => ({ ...prev, studentId: student._id }));
                          setTopupStudentQuery(`${student.name || 'Alumno'}${student.schoolCode ? ` (${student.schoolCode})` : ''}`);
                          setShowTopupStudentOptions(false);
                        }}
                        type="button"
                      >
                        {student.name || 'Alumno'} {student.schoolCode ? `(${student.schoolCode})` : ''}
                      </button>
                    ))}
                    {filteredTopupStudents.length === 0 ? <p className="product-picker-empty">Sin coincidencias</p> : null}
                  </div>
                ) : null}
              </div>
              <input type="hidden" value={manualTopup.studentId} required readOnly />
            </label>
            <label>
              Monto
              <input type="number" min="0" step="100" value={manualTopup.amount} onChange={(event) => setManualTopup((prev) => ({ ...prev, amount: event.target.value }))} required />
            </label>
            <label>
              Método
              <select value={manualTopup.method} onChange={(event) => setManualTopup((prev) => ({ ...prev, method: event.target.value }))}>
                <option value="cash">Efectivo</option>
                <option value="dataphone">Datáfono</option>
                <option value="transfer">Transferencia</option>
                <option value="qr">QR</option>
              </select>
            </label>
            <label>
              Observaciones
              <input value={manualTopup.notes} onChange={(event) => setManualTopup((prev) => ({ ...prev, notes: event.target.value }))} />
            </label>
            <button className="btn btn-primary" type="submit">
              Aplicar recarga
            </button>
          </form>

          <h3>Modificar saldos</h3>
          <p className="muted">Ajusta el saldo final de cada alumno y guarda por fila.</p>
          <div className="admin-balance-editor-toolbar">
            <input
              placeholder="Filtrar alumno por nombre o código"
              value={topupBalanceSearchQuery}
              onChange={(event) => setTopupBalanceSearchQuery(event.target.value)}
            />
            <p className="muted">
              Mostrando {paginatedTopupBalanceRows.length} de {filteredTopupBalanceRows.length} alumnos
            </p>
          </div>
          <div className="admin-balance-editor-wrap">
            <table className="admin-balance-editor-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTopupBalanceRows.map((student) => {
                  const studentId = String(student._id || '');
                  const draftValue = topupBalanceDrafts[studentId] ?? String(Number(student.walletBalance || 0));
                  const isSaving = savingTopupStudentId === studentId;

                  return (
                    <tr key={studentId}>
                      <td>
                        {student.name || 'Alumno'}
                        {student.schoolCode ? ` (${student.schoolCode})` : ''}
                      </td>
                      <td>
                        <div className="admin-balance-editor-actions">
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={draftValue}
                            onChange={(event) => onChangeTopupBalanceDraft(studentId, event.target.value)}
                          />
                          <button
                            className="btn btn-primary"
                            type="button"
                            disabled={isSaving}
                            onClick={() => onSaveTopupBalance(student)}
                          >
                            {isSaving ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredTopupBalanceRows.length === 0 ? <p>No hay alumnos para el filtro actual.</p> : null}
            {filteredTopupBalanceRows.length > 0 ? (
              <div className="row gap admin-balance-editor-pagination">
                <button
                  className="btn"
                  type="button"
                  disabled={topupBalancePage <= 1}
                  onClick={() => setTopupBalancePage((prev) => Math.max(1, prev - 1))}
                >
                  Anterior
                </button>
                <p>
                  Pagina {topupBalancePage} de {topupBalanceTotalPages}
                </p>
                <button
                  className="btn"
                  type="button"
                  disabled={topupBalancePage >= topupBalanceTotalPages}
                  onClick={() => setTopupBalancePage((prev) => Math.min(topupBalanceTotalPages, prev + 1))}
                >
                  Siguiente
                </button>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeModule === 'creation' ? (
        <section className="panel admin-section">
          <h3>Creaciones</h3>
          <div className="admin-creation-grid">
            <form className="card" onSubmit={onCreateCategory}>
              <h4>Crear categoría</h4>
              <label>
                Nombre
                <input value={categoryForm.name} onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))} required />
              </label>
              <label>
                Foto de la categoría
                <input type="file" accept="image/*" onChange={onCategoryImageSelected} disabled={uploadingCategoryImage} />
              </label>
              {uploadingCategoryImage ? <p>Subiendo imagen (se optimiza a WEBP 600px)...</p> : null}
              {categoryForm.imageUrl ? <img alt="Vista previa categoría" className="admin-product-preview" src={categoryForm.imageUrl} /> : null}
              <button className="btn btn-primary admin-create-btn" type="submit">Crear</button>
            </form>

            <form className="card" onSubmit={onCreateStore}>
              <h4>Crear tienda</h4>
              <label>
                Nombre
                <input value={storeForm.name} onChange={(event) => setStoreForm((prev) => ({ ...prev, name: event.target.value }))} required />
              </label>
              <label>
                Ubicación
                <input value={storeForm.location} onChange={(event) => setStoreForm((prev) => ({ ...prev, location: event.target.value }))} />
              </label>
              <button className="btn btn-primary admin-create-btn" type="submit">Crear</button>
            </form>

            <form className="card" onSubmit={onCreateProduct}>
              <h4>Crear producto</h4>
              <label>
                Nombre
                <input value={productForm.name} onChange={(event) => setProductForm((prev) => ({ ...prev, name: event.target.value }))} required />
              </label>
              <label>
                Categoría
                <select value={productForm.categoryId} onChange={(event) => setProductForm((prev) => ({ ...prev, categoryId: event.target.value }))} required>
                  <option value="">Selecciona categoría</option>
                  {categories.map((category) => (
                    <option key={category._id} value={category._id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Descripción corta
                <input
                  maxLength={140}
                  placeholder="Ej: Roll crocante con camaron tempura"
                  value={productForm.shortDescription}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, shortDescription: event.target.value }))}
                />
              </label>
              <label>
                Precio de venta
                <input type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((prev) => ({ ...prev, price: event.target.value }))} required />
              </label>
              <label>
                Costo
                <input type="number" min="0" value={productForm.cost} onChange={(event) => setProductForm((prev) => ({ ...prev, cost: event.target.value }))} required />
              </label>
              <label>
                Utilidad
                <input type="number" value={Number(productProfit.utility).toFixed(2)} readOnly />
              </label>
              <label>
                % de utilidad
                <input type="number" value={Number(productProfit.utilityPercent).toFixed(2)} readOnly />
              </label>
              <label>
                Foto del producto
                <input type="file" accept="image/*" onChange={onProductImageSelected} disabled={uploadingProductImage} />
              </label>
              {uploadingProductImage ? <p>Subiendo imagen (se optimiza a WEBP 600px)...</p> : null}
              {productForm.imageUrl ? <img alt="Vista previa" className="admin-product-preview" src={productForm.imageUrl} /> : null}
              <label>
                Stock inicial
                <input type="number" min="0" value={productForm.stock} onChange={(event) => setProductForm((prev) => ({ ...prev, stock: event.target.value }))} />
              </label>
              <label>
                Tiendas del producto
                <div className="admin-store-checklist" role="group" aria-label="Tiendas del producto">
                  <label className="payment-option">
                    <input
                      type="checkbox"
                      checked={productForm.initialStockStoreIds.includes('all')}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setProductForm((prev) => ({
                          ...prev,
                          initialStockStoreIds: checked ? ['all'] : [],
                        }));
                      }}
                    />
                    <span>Todas las tiendas</span>
                  </label>

                  {stores.map((store) => {
                    const checked =
                      productForm.initialStockStoreIds.includes('all') ||
                      productForm.initialStockStoreIds.includes(String(store._id));

                    return (
                      <label className="payment-option" key={store._id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const storeId = String(store._id);
                            const isChecked = event.target.checked;

                            setProductForm((prev) => {
                              const previousIds = Array.isArray(prev.initialStockStoreIds) ? prev.initialStockStoreIds : [];
                              const withoutAll = previousIds.filter((id) => id !== 'all');
                              const nextSet = new Set(withoutAll);

                              if (isChecked) {
                                nextSet.add(storeId);
                              } else {
                                nextSet.delete(storeId);
                              }

                              return {
                                ...prev,
                                initialStockStoreIds: Array.from(nextSet),
                              };
                            });
                          }}
                        />
                        <span>{store.name}</span>
                      </label>
                    );
                  })}
                </div>
              </label>
              <label>
                Alerta inventario (stock minimo)
                <input
                  type="number"
                  min="0"
                  value={productForm.inventoryAlertStock}
                  onChange={(event) => setProductForm((prev) => ({ ...prev, inventoryAlertStock: event.target.value }))}
                  required
                />
              </label>
              <button className="btn btn-primary admin-create-btn" type="submit">Crear</button>
            </form>

            <form className="card" onSubmit={onCreateUser}>
              <h4>Crear usuario (acudiente, vendedor, admin, Tutor de alimentación)</h4>
              <label>
                Nombre
                <input value={userForm.name} onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))} required />
              </label>
              <label>
                Nombre de usuario
                <input value={userForm.username} onChange={(event) => setUserForm((prev) => ({ ...prev, username: event.target.value }))} required />
              </label>
              <label>
                Teléfono
                <input value={userForm.phone} onChange={(event) => setUserForm((prev) => ({ ...prev, phone: event.target.value }))} />
              </label>
              <label>
                Password
                <input type="text" value={userForm.password} onChange={(event) => setUserForm((prev) => ({ ...prev, password: event.target.value }))} required />
              </label>
              <label>
                Rol
                <select
                  value={userForm.role}
                  onChange={(event) =>
                    setUserForm((prev) => ({
                      ...prev,
                      role: event.target.value,
                      assignedStoreId: event.target.value === 'vendor' ? prev.assignedStoreId : '',
                    }))
                  }
                >
                  <option value="parent">Acudiente</option>
                  <option value="vendor">Vendedor</option>
                  <option value="admin">Admin</option>
                  <option value="merienda_operator">Tutor de alimentación</option>
                </select>
              </label>
              {userForm.role === 'vendor' ? (
                <label>
                  Tienda asignada
                  <select
                    value={userForm.assignedStoreId}
                    onChange={(event) => setUserForm((prev) => ({ ...prev, assignedStoreId: event.target.value }))}
                    required
                  >
                    <option value="">Selecciona una tienda</option>
                    {stores
                      .filter((store) => store.status === 'active')
                      .map((store) => (
                        <option key={store._id} value={store._id}>{store.name}</option>
                      ))}
                  </select>
                </label>
              ) : null}
              <button className="btn btn-primary admin-create-btn" type="submit">Crear</button>
            </form>

            <form className="card" onSubmit={onCreateStudent}>
              <h4>Crear alumno</h4>
              <label>
                Nombre
                <input value={studentForm.name} onChange={(event) => setStudentForm((prev) => ({ ...prev, name: event.target.value }))} required />
              </label>
              <label>
                Grado (opcional)
                <input
                  placeholder="Ej: 5A"
                  value={studentForm.grade}
                  onChange={(event) => setStudentForm((prev) => ({ ...prev, grade: event.target.value }))}
                />
              </label>
              <label>
                Acudiente (opcional)
                <select value={studentForm.parentId} onChange={(event) => setStudentForm((prev) => ({ ...prev, parentId: event.target.value }))}>
                  <option value="">Sin asignar</option>
                  {parentUsers.map((parent) => (
                    <option key={parent._id} value={parent._id}>{parent.name} ({parent.username || 'sin-usuario'})</option>
                  ))}
                </select>
              </label>
              <button className="btn btn-primary admin-create-btn" type="submit">Crear</button>
            </form>
          </div>
        </section>
      ) : null}

      {activeModule === 'edit' || activeModule === 'modify' ? (
        <section className="panel admin-section">
          <h3>{activeModule === 'edit' ? 'Base de datos' : 'Modificaciones'}</h3>
          <div className="row gap">
            <label>
              Tipo de registro
              <select value={editEntity} onChange={(event) => setEditEntity(event.target.value)}>
                <option value="product">Producto</option>
                <option value="category">Categoría</option>
                <option value="store">Tienda</option>
                <option value="student">Alumno</option>
                <option value="parent">Acudientes</option>
                <option value="vendor">Vendedores</option>
                <option value="admin">Administradores</option>
                <option value="merienda_operator">Tutores de alimentación</option>
              </select>
            </label>
            {(activeModule === 'edit' || activeModule === 'modify') && editEntity === 'product' ? (
              <label>
                Tienda (filtro)
                <select value={editProductStoreFilter} onChange={(event) => setEditProductStoreFilter(event.target.value)}>
                  <option value="">Todas las tiendas</option>
                  {stores.map((store) => (
                    <option key={store._id} value={store._id}>{store.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              Buscar registro
              <input
                placeholder="Nombre, usuario, código..."
                value={editSearchQuery}
                onChange={(event) => setEditSearchQuery(event.target.value)}
              />
            </label>
          </div>

          <div className="row gap">
            <button className="btn" onClick={onExportEditExcel} type="button">
              Descargar Excel
            </button>
            <button className="btn" onClick={onExportEditPdf} type="button">
              Descargar PDF
            </button>
            {isBulkProductMode ? (
              <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <input
                    type="checkbox"
                    checked={areAllVisibleProductRowsSelected}
                    onChange={(event) => onToggleSelectAllVisibleProducts(event.target.checked)}
                  />
                  <span>Seleccionar visibles</span>
                </label>
                <button className="btn" type="button" onClick={() => setSelectedProductRowIds([])} disabled={selectedProductRowsCount === 0}>
                  Limpiar selección
                </button>
                <button className="btn" type="button" onClick={onDeleteSelectedProductRows} disabled={selectedProductRowsCount === 0}>
                  Eliminar seleccionados ({selectedProductRowsCount})
                </button>
              </div>
            ) : null}
            {activeModule === 'modify' && editEntity === 'student' ? (
              <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.25rem' }}>
                <button className="btn btn-primary" onClick={onOpenLegacyMigrationPicker} type="button" disabled={loading}>
                  Migrar alumnos
                </button>
                <button className="btn" onClick={onDownloadLegacyTemplate} type="button">
                  Plantilla alumnos
                </button>
              </div>
            ) : null}
            {activeModule === 'modify' && editEntity === 'parent' ? (
              <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: '0.25rem' }}>
                <button className="btn btn-primary" onClick={onOpenLegacyParentMigrationPicker} type="button" disabled={loading}>
                  Migrar acudientes
                </button>
                <button className="btn" onClick={onDownloadLegacyParentsTemplate} type="button">
                  Plantilla acudientes
                </button>
              </div>
            ) : null}
            <input
              ref={legacyMigrationInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={onLegacyMigrationFileSelected}
            />
            <input
              ref={legacyParentMigrationInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={onLegacyParentMigrationFileSelected}
            />
          </div>
          {activeModule === 'modify' && editEntity === 'student' ? (
            <p className="helper" style={{ marginTop: '-0.25rem' }}>
              Plantilla requerida para alumnos: <strong>Alumno</strong>, <strong>Curso</strong>, <strong>Saldo en creditos</strong>.
            </p>
          ) : null}
          {activeModule === 'modify' && editEntity === 'parent' ? (
            <p className="helper" style={{ marginTop: '-0.25rem' }}>
              Plantilla requerida para acudientes: <strong>Nombre del acudiente</strong>, <strong>Nombre de usuario</strong>, <strong>Telefono</strong>.
            </p>
          ) : null}

          <div className={`table-wrap ${activeModule === 'edit' ? 'readonly-db-table' : ''}`}>
            <table className={`simple-table ${editEntity === 'product' ? 'admin-products-table' : ''}`}>
              <thead>
                {editEntity === 'category' ? (
                  <tr>
                    <th>Nombre</th>
                    <th>Estado</th>
                    {activeModule === 'modify' ? <th>Acciones</th> : null}
                  </tr>
                ) : null}
                {editEntity === 'store' ? (
                  <tr>
                    <th>Nombre</th>
                    <th>Ubicación</th>
                    <th>Estado</th>
                    {activeModule === 'modify' ? <th>Acciones</th> : null}
                  </tr>
                ) : null}
                {editEntity === 'product' ? (
                  <tr>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th>Foto</th>
                    <th>Tienda</th>
                    <th>Categoría</th>
                    <th>Precio</th>
                    <th>Costo</th>
                    <th>Utilidad</th>
                    <th>% utilidad</th>
                    <th>Stock</th>
                    <th>Alerta</th>
                    {activeModule === 'modify' ? <th>Acciones</th> : null}
                  </tr>
                ) : null}
                {isUserRecordEntity ? (
                  <tr>
                    <th>Nombre</th>
                    <th>Usuario</th>
                    <th>Teléfono</th>
                    <th>Rol</th>
                    <th>Tienda asignada</th>
                    <th>Estado</th>
                    <th>Nueva password</th>
                    {activeModule === 'modify' ? <th>Acciones</th> : null}
                  </tr>
                ) : null}
                {editEntity === 'student' ? (
                  <tr>
                    <th>Nombre</th>
                    <th>Código escolar</th>
                    <th>Grado</th>
                    <th>Saldo</th>
                    <th>Límite diario</th>
                    <th>Acudiente asignado</th>
                    <th>Estado</th>
                    {activeModule === 'modify' ? <th>Acciones</th> : null}
                  </tr>
                ) : null}
              </thead>
              <tbody>
                {paginatedEditEntityItems.map((item) => {
                  const draft = getEditTableDraft(item);
                  const utility = getProductUtility(draft.price, draft.cost);
                  const utilityPercent = getProductUtilityPercent(draft.price, draft.cost);
                  return (
                    <tr key={item._id}>
                      {editEntity === 'category' ? (
                        <>
                          <td>
                            <input value={draft.name} onChange={(event) => onEditTableDraftChange(item, 'name', event.target.value)} />
                          </td>
                          <td>
                            <select value={draft.status} onChange={(event) => onEditTableDraftChange(item, 'status', event.target.value)}>
                              <option value="active">Activo</option>
                              <option value="inactive">Inactivo</option>
                            </select>
                          </td>
                        </>
                      ) : null}

                      {editEntity === 'store' ? (
                        <>
                          <td>
                            <input value={draft.name} onChange={(event) => onEditTableDraftChange(item, 'name', event.target.value)} />
                          </td>
                          <td>
                            <input value={draft.location} onChange={(event) => onEditTableDraftChange(item, 'location', event.target.value)} />
                          </td>
                          <td>
                            <select value={draft.status} onChange={(event) => onEditTableDraftChange(item, 'status', event.target.value)}>
                              <option value="active">Activo</option>
                              <option value="inactive">Inactivo</option>
                            </select>
                          </td>
                        </>
                      ) : null}

                      {editEntity === 'product' ? (
                        <>
                          <td>
                            {activeModule === 'modify' ? (
                              <input value={draft.name} onChange={(event) => onEditTableDraftChange(item, 'name', event.target.value)} />
                            ) : (
                              <div className="admin-db-cell-text">{draft.name || 'N/A'}</div>
                            )}
                          </td>
                          <td>
                            {activeModule === 'modify' ? (
                              <textarea
                                rows={2}
                                value={draft.shortDescription || ''}
                                onChange={(event) => onEditTableDraftChange(item, 'shortDescription', event.target.value)}
                              />
                            ) : (
                              <div className="admin-db-cell-text admin-db-description-text">{formatDescriptionForTwoLines(draft.shortDescription)}</div>
                            )}
                          </td>
                          <td>
                            <div className="admin-edit-product-image-cell">
                              {draft.imageUrl ? (
                                <img alt={draft.name || 'Producto'} className="admin-edit-product-thumb" src={draft.imageUrl} />
                              ) : (
                                <div className="admin-edit-product-thumb admin-edit-product-thumb-empty">Sin foto</div>
                              )}
                              {activeModule === 'modify' ? (
                                <>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    disabled={uploadingEditProductImageId === String(item._id)}
                                    onChange={(event) => onEditTableProductImageSelected(item, event)}
                                  />
                                  {uploadingEditProductImageId === String(item._id) ? <p>Subiendo imagen...</p> : null}
                                  <input
                                    placeholder="URL de imagen"
                                    value={draft.imageUrl || ''}
                                    onChange={(event) => onEditTableDraftChange(item, 'imageUrl', event.target.value)}
                                  />
                                </>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div className="admin-db-cell-text">
                              {stores.find((store) => String(store._id) === String(draft.storeId))?.name || draft.storeName || 'Sin tienda'}
                            </div>
                          </td>
                          <td>
                            {activeModule === 'modify' ? (
                              <select value={draft.categoryId} onChange={(event) => onEditTableDraftChange(item, 'categoryId', event.target.value)}>
                                <option value="">Categoría</option>
                                {categories.map((category) => (
                                  <option key={category._id} value={category._id}>{category.name}</option>
                                ))}
                              </select>
                            ) : (
                              <div className="admin-db-cell-text">
                                {
                                  categories.find((category) => String(category._id) === String(draft.categoryId))?.name ||
                                  draft.categoryName ||
                                  'Sin categoría'
                                }
                              </div>
                            )}
                          </td>
                          <td>
                            {activeModule === 'modify' ? (
                              <input type="number" min="0" value={draft.price} onChange={(event) => onEditTableDraftChange(item, 'price', event.target.value)} />
                            ) : (
                              <div className="admin-db-cell-text">{formatMetricValue(draft.price)}</div>
                            )}
                          </td>
                          <td>
                            {activeModule === 'modify' ? (
                              <input type="number" min="0" value={draft.cost} onChange={(event) => onEditTableDraftChange(item, 'cost', event.target.value)} />
                            ) : (
                              <div className="admin-db-cell-text">{formatMetricValue(draft.cost)}</div>
                            )}
                          </td>
                          <td>
                            <div className="admin-db-cell-text">{formatMetricValue(utility)}</div>
                          </td>
                          <td>
                            <div className="admin-db-cell-text">{formatMetricValue(utilityPercent)}%</div>
                          </td>
                          <td>
                            {activeModule === 'modify' ? (
                              <input
                                type="number"
                                min="0"
                                value={draft.stock}
                                onChange={(event) => onEditTableDraftChange(item, 'stock', event.target.value)}
                                readOnly
                                className="blocked-stock-input"
                              />
                            ) : (
                              <div className="admin-db-cell-text">{draft.stock}</div>
                            )}
                          </td>
                          <td>
                            {activeModule === 'modify' ? (
                              <input
                                type="number"
                                min="0"
                                value={draft.inventoryAlertStock}
                                onChange={(event) => onEditTableDraftChange(item, 'inventoryAlertStock', event.target.value)}
                              />
                            ) : (
                              <div className="admin-db-cell-text">{draft.inventoryAlertStock}</div>
                            )}
                          </td>
                        </>
                      ) : null}

                      {isUserRecordEntity ? (
                        <>
                          <td>
                            <input value={draft.name} onChange={(event) => onEditTableDraftChange(item, 'name', event.target.value)} />
                          </td>
                          <td>
                            <input value={draft.username} onChange={(event) => onEditTableDraftChange(item, 'username', event.target.value)} />
                          </td>
                          <td>
                            <input value={draft.phone} onChange={(event) => onEditTableDraftChange(item, 'phone', event.target.value)} />
                          </td>
                          <td>
                            <input
                              value={
                                draft.role === 'parent'
                                  ? 'Acudiente'
                                  : draft.role === 'vendor'
                                    ? 'Vendedor'
                                    : draft.role === 'admin'
                                      ? 'Administrador'
                                      : draft.role === 'merienda_operator'
                                        ? 'Tutor de alimentación'
                                      : draft.role
                              }
                              readOnly
                            />
                          </td>
                          <td>
                            {draft.role === 'vendor' ? (
                              <select
                                value={draft.assignedStoreId || ''}
                                onChange={(event) => onEditTableDraftChange(item, 'assignedStoreId', event.target.value)}
                              >
                                <option value="">Selecciona tienda</option>
                                {stores
                                  .filter((store) => store.status === 'active')
                                  .map((store) => (
                                    <option key={store._id} value={store._id}>{store.name}</option>
                                  ))}
                              </select>
                            ) : (
                              <input value="No aplica" readOnly />
                            )}
                          </td>
                          <td>
                            <select value={draft.status} onChange={(event) => onEditTableDraftChange(item, 'status', event.target.value)}>
                              <option value="active">Activo</option>
                              <option value="inactive">Inactivo</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="text"
                              placeholder="Opcional"
                              value={draft.password}
                              onChange={(event) => onEditTableDraftChange(item, 'password', event.target.value)}
                            />
                          </td>
                        </>
                      ) : null}

                      {editEntity === 'student' ? (
                        <>
                          <td>
                            <input value={draft.name} onChange={(event) => onEditTableDraftChange(item, 'name', event.target.value)} />
                          </td>
                          <td>
                            <input value={draft.schoolCode} onChange={(event) => onEditTableDraftChange(item, 'schoolCode', event.target.value)} />
                          </td>
                          <td>
                            <input value={draft.grade} onChange={(event) => onEditTableDraftChange(item, 'grade', event.target.value)} />
                          </td>
                          <td>
                            <div className="admin-db-cell-text">{formatCurrency(draft.balance)}</div>
                          </td>
                          <td>
                            <input type="number" min="0" value={draft.dailyLimit} onChange={(event) => onEditTableDraftChange(item, 'dailyLimit', event.target.value)} />
                          </td>
                          <td>
                            <div className="product-picker">
                              <input
                                placeholder="Buscar acudiente..."
                                value={draft.parentSearch || ''}
                                onFocus={() => onEditTableDraftChange(item, 'parentPickerOpen', true)}
                                onBlur={() => {
                                  setTimeout(() => {
                                    onEditTableDraftChange(item, 'parentPickerOpen', false);
                                  }, 120);
                                }}
                                onChange={(event) => {
                                  onEditTableDraftChange(item, 'parentSearch', event.target.value);
                                  onEditTableDraftChange(item, 'parentPickerOpen', true);
                                }}
                              />
                              {draft.parentPickerOpen ? (
                                <div className="product-picker-menu">
                                  <button
                                    type="button"
                                    className="product-picker-option"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                      onEditTableDraftChange(item, 'parentId', '');
                                      onEditTableDraftChange(item, 'parentSearch', '');
                                      onEditTableDraftChange(item, 'parentPickerOpen', false);
                                    }}
                                  >
                                    Sin asignar
                                  </button>
                                  {parentUsers
                                    .filter((parent) => {
                                      const query = String(draft.parentSearch || '').trim().toLowerCase();
                                      if (!query) {
                                        return true;
                                      }

                                      const label = `${parent.name || ''} ${parent.username || ''}`.toLowerCase();
                                      return label.includes(query);
                                    })
                                    .map((parent) => (
                                      <button
                                        type="button"
                                        key={parent._id}
                                        className="product-picker-option"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => {
                                          onEditTableDraftChange(item, 'parentId', parent._id);
                                          onEditTableDraftChange(
                                            item,
                                            'parentSearch',
                                            `${parent.name} (${parent.username || 'sin-usuario'})`
                                          );
                                          onEditTableDraftChange(item, 'parentPickerOpen', false);
                                        }}
                                      >
                                        {parent.name} ({parent.username || 'sin-usuario'})
                                      </button>
                                    ))}
                                  {parentUsers.filter((parent) => {
                                    const query = String(draft.parentSearch || '').trim().toLowerCase();
                                    if (!query) {
                                      return false;
                                    }
                                    const label = `${parent.name || ''} ${parent.username || ''}`.toLowerCase();
                                    return label.includes(query);
                                  }).length === 0 ? (
                                    <p className="product-picker-empty">Sin coincidencias</p>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <select value={draft.status} onChange={(event) => onEditTableDraftChange(item, 'status', event.target.value)}>
                              <option value="active">Activo</option>
                              <option value="inactive">Inactivo</option>
                            </select>
                          </td>
                        </>
                      ) : null}

                      {activeModule === 'modify' ? (
                        <td>
                          <div className="row gap">
                            {editEntity === 'product' ? (
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                <input
                                  type="checkbox"
                                  checked={selectedProductRowIds.includes(String(item._id))}
                                  onChange={(event) => onToggleProductRowSelection(item._id, event.target.checked)}
                                />
                                <span>Seleccionar</span>
                              </label>
                            ) : null}
                            <button
                              className="btn btn-primary"
                              type="button"
                              onClick={() => onSaveEditTableRow(item)}
                            >
                              Guardar modificaciones
                            </button>
                            <button className="btn" type="button" onClick={() => onDeleteEditTableRow(item)}>
                              Eliminar registro
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredEditEntityItems.length === 0 ? <p>No hay registros para el tipo seleccionado.</p> : null}

            <div className="row space-between">
              <button className="btn" type="button" onClick={() => setEditTablePage((prev) => Math.max(1, prev - 1))} disabled={editTablePage <= 1}>
                Anterior
              </button>
              <p>
                Pagina {editTablePage} de {editTableTotalPages}
              </p>
              <button
                className="btn"
                type="button"
                onClick={() => setEditTablePage((prev) => Math.min(editTableTotalPages, prev + 1))}
                disabled={editTablePage >= editTableTotalPages}
              >
                Siguiente
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {activeModule === 'links' ? (
        <section className="panel admin-section">
          <h3>Vincular acudientes con hijos</h3>
          <form className="admin-form-grid" onSubmit={onCreateLink}>
            <label>
              Acudiente
              <div className="product-picker">
                <input
                  placeholder="Selecciona acudiente"
                  value={linkParentQuery}
                  onFocus={() => setShowLinkParentOptions(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowLinkParentOptions(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    setLinkParentQuery(event.target.value);
                    setLinkForm((prev) => ({ ...prev, parentId: '' }));
                    setShowLinkParentOptions(true);
                  }}
                  required
                />
                {showLinkParentOptions ? (
                  <div className="product-picker-menu">
                    {filteredLinkParents.map((parent) => (
                      <button
                        className="product-picker-option"
                        key={parent._id}
                        onMouseDown={() => {
                          setLinkForm((prev) => ({ ...prev, parentId: parent._id }));
                          setLinkParentQuery(`${parent.name || 'Acudiente'}${parent.username ? ` (${parent.username})` : ''}`);
                          setShowLinkParentOptions(false);
                        }}
                        type="button"
                      >
                        {parent.name || 'Acudiente'} {parent.username ? `(${parent.username})` : ''}
                      </button>
                    ))}
                    {filteredLinkParents.length === 0 ? <p className="product-picker-empty">Sin coincidencias</p> : null}
                  </div>
                ) : null}
              </div>
              <input type="hidden" value={linkForm.parentId} required readOnly />
            </label>
            <label>
              Alumno
              <div className="product-picker">
                <input
                  placeholder="Selecciona alumno"
                  value={linkStudentQuery}
                  onFocus={() => setShowLinkStudentOptions(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowLinkStudentOptions(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    setLinkStudentQuery(event.target.value);
                    setLinkForm((prev) => ({ ...prev, studentId: '' }));
                    setShowLinkStudentOptions(true);
                  }}
                  required
                />
                {showLinkStudentOptions ? (
                  <div className="product-picker-menu">
                    {filteredLinkStudents.map((student) => (
                      <button
                        className="product-picker-option"
                        key={student._id}
                        onMouseDown={() => {
                          setLinkForm((prev) => ({ ...prev, studentId: student._id }));
                          setLinkStudentQuery(`${student.name || 'Alumno'}${student.schoolCode ? ` (${student.schoolCode})` : ''}`);
                          setShowLinkStudentOptions(false);
                        }}
                        type="button"
                      >
                        {student.name || 'Alumno'} {student.schoolCode ? `(${student.schoolCode})` : ''}
                      </button>
                    ))}
                    {filteredLinkStudents.length === 0 ? <p className="product-picker-empty">Sin coincidencias</p> : null}
                  </div>
                ) : null}
              </div>
              <input type="hidden" value={linkForm.studentId} required readOnly />
            </label>
            <label>
              Relación
              <input value={linkForm.relationship} onChange={(event) => setLinkForm((prev) => ({ ...prev, relationship: event.target.value }))} />
            </label>
            <button className="btn btn-primary" type="submit">Vincular</button>
          </form>

          <div className="admin-links-grid">
            {links.map((link) => (
              <div className="card admin-link-card" key={link._id}>
                <p>Acudiente: {link.parentId?.name || 'N/A'}</p>
                <p>Usuario: {link.parentId?.username || 'N/A'}</p>
                <p>Alumno: {link.studentId?.name || 'N/A'}</p>
                <p>Relación: {link.relationship || 'parent'}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeModule === 'meriendas' ? (
        <section className="panel admin-section">
          <h3>Meriendas (contabilidad y programación)</h3>

          <div className="card">
            <h4>Configuración mensual ({meriendasMonth})</h4>
            <div className="admin-form-grid">
              <label>
                Costo de la suscripción mensual
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="Escribe y guarda el costo mensual"
                  value={meriendaSubscriptionMonthlyCost}
                  onChange={(event) => setMeriendaSubscriptionMonthlyCost(event.target.value)}
                />
              </label>
              <button className="btn btn-primary" type="button" onClick={onSaveMeriendaSubscriptionMonthlyCost}>
                Guardar costo mensual
              </button>
            </div>
          </div>

          <div className="cards">
            <div className="card admin-kpi-card">
              <h4>Alumnos suscritos</h4>
              <p>{meriendaKpis.subscribedStudents}</p>
            </div>
            <div className="card admin-kpi-card">
              <h4>Ingresos mensuales</h4>
              <p>{formatCurrency(meriendaKpis.monthlyIncome)}</p>
            </div>
            <div className="card admin-kpi-card">
              <h4>Costos fijos</h4>
              <p>{formatCurrency(meriendaKpis.fixedCostsTotal)}</p>
            </div>
            <div className="card admin-kpi-card">
              <h4>Costos variables del mes</h4>
              <p>{formatCurrency(meriendaKpis.variableCostsTotal)}</p>
            </div>
            <div className="card admin-kpi-card">
              <h4>Utilidades del mes</h4>
              <p>{formatCurrency(meriendaKpis.monthlyUtility)}</p>
            </div>
          </div>

          <div className="card">
            <h4>Costos operativos ({meriendasMonth})</h4>
            <p>Los costos variables se manejan por mes, por lo que se reinician automáticamente al cambiar de mes.</p>
            <div className="admin-creation-grid">
              <div className="card">
                <h4>Añadir costo fijo</h4>
                <label>
                  Nombre
                  <input
                    placeholder="Ej: Arriendo cocina"
                    value={meriendaFixedCostDraft.name}
                    onChange={(event) => setMeriendaFixedCostDraft((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </label>
                <label>
                  Valor
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    value={meriendaFixedCostDraft.amount}
                    onChange={(event) => setMeriendaFixedCostDraft((prev) => ({ ...prev, amount: event.target.value }))}
                  />
                </label>
                <button className="btn btn-primary" type="button" onClick={() => onAddMeriendaOperationCost('fixed')}>
                  Guardar costo fijo
                </button>
              </div>

              <div className="card">
                <h4>Añadir costo variable</h4>
                <label>
                  Nombre
                  <input
                    placeholder="Ej: Frutas semana 1"
                    value={meriendaVariableCostDraft.name}
                    onChange={(event) => setMeriendaVariableCostDraft((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </label>
                <label>
                  Valor
                  <input
                    type="number"
                    min="0"
                    step="100"
                    placeholder="0"
                    value={meriendaVariableCostDraft.amount}
                    onChange={(event) => setMeriendaVariableCostDraft((prev) => ({ ...prev, amount: event.target.value }))}
                  />
                </label>
                <button className="btn btn-primary" type="button" onClick={() => onAddMeriendaOperationCost('variable')}>
                  Guardar costo variable
                </button>
              </div>
            </div>

            <div className="admin-creation-grid">
              <div className="card">
                <h4>Detalle costos fijos del mes</h4>
                {(meriendaKpis.fixedCosts || []).length === 0 ? <p>Sin costos fijos registrados.</p> : null}
                {(meriendaKpis.fixedCosts || []).map((item) => (
                  <div className="admin-row-actions" key={item._id || `${item.name}-${item.createdAt}`}>
                    <p>{item.name || 'Costo fijo'}: {formatCurrency(item.amount)}</p>
                    <button className="btn btn-ghost" type="button" onClick={() => onDeleteMeriendaOperationCost('fixed', item._id)}>
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
              <div className="card">
                <h4>Detalle costos variables del mes</h4>
                {(meriendaKpis.variableCosts || []).length === 0 ? <p>Sin costos variables registrados.</p> : null}
                {(meriendaKpis.variableCosts || []).map((item) => (
                  <div className="admin-row-actions" key={item._id || `${item.name}-${item.createdAt}`}>
                    <p>{item.name || 'Costo variable'}: {formatCurrency(item.amount)}</p>
                    <button className="btn btn-ghost" type="button" onClick={() => onDeleteMeriendaOperationCost('variable', item._id)}>
                      Eliminar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <h4>Historial de operaciones</h4>
            <div className="admin-form-grid">
              <label>
                Mes
                <select
                  value={selectedMeriendaHistoryMonth}
                  onChange={(event) => setSelectedMeriendaHistoryMonth(event.target.value)}
                >
                  <option value="">Selecciona un mes</option>
                  {meriendaOperationsHistory.map((item) => (
                    <option key={item.month} value={item.month}>{item.month}</option>
                  ))}
                </select>
              </label>
            </div>

            {!selectedMeriendaHistory ? <p>No hay operaciones historicas para mostrar.</p> : null}
            {selectedMeriendaHistory ? (
              <div className="cards">
                <div className="card admin-kpi-card">
                  <h4>Alumnos suscritos</h4>
                  <p>{selectedMeriendaHistory.subscribedStudents || 0}</p>
                </div>
                <div className="card admin-kpi-card">
                  <h4>Ingresos mensuales</h4>
                  <p>{formatCurrency(selectedMeriendaHistory.monthlyIncome)}</p>
                </div>
                <div className="card admin-kpi-card">
                  <h4>Costos fijos</h4>
                  <p>{formatCurrency(selectedMeriendaHistory.fixedCostsTotal)}</p>
                </div>
                <div className="card admin-kpi-card">
                  <h4>Costos variables del mes</h4>
                  <p>{formatCurrency(selectedMeriendaHistory.variableCostsTotal)}</p>
                </div>
                <div className="card admin-kpi-card">
                  <h4>Utilidades del mes</h4>
                  <p>{formatCurrency(selectedMeriendaHistory.monthlyUtility)}</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="card">
            <h4>Alumnos suscritos</h4>
            <div className="admin-form-grid">
              <label>
                Buscar suscritos
                <input
                  placeholder="Nombre de nino, padre, usuario, grado o documento"
                  value={meriendaStudentQuery}
                  onChange={(event) => setMeriendaStudentQuery(event.target.value)}
                />
              </label>
            </div>

            <div className="admin-links-grid">
              {filteredMeriendaSubscriptions.map((subscription) => (
                <div className="card admin-link-card" key={subscription._id || subscription.id}>
                  <p>Alumno: {subscription.childName || 'N/A'}</p>
                  <p>Grado: {subscription.childGrade || 'N/A'}</p>
                  <p>Documento: {subscription.childDocument || 'N/A'}</p>
                  <p>Acudiente: {subscription.parentName || 'N/A'}</p>
                  <p>Usuario: {subscription.parentUsername || 'N/A'}</p>
                  <p>Recomendaciones: {subscription.parentRecommendations || 'Sin recomendaciones'}</p>
                  <p>Restricciones alimentarias: {subscription.childFoodRestrictions || subscription.childAllergies || 'Sin restricciones alimentarias reportadas'}</p>
                  <p>Mes vigente: {subscription.currentPeriodMonth || 'N/A'}</p>
                </div>
              ))}
            </div>
            {filteredMeriendaSubscriptions.length === 0 ? <p>No hay alumnos suscritos en meriendas.</p> : null}
          </div>

          <div className="card">
            <h4>Restricciones alimentarias</h4>
            <p>Este resumen debe revisarse antes de entregar los snacks del día.</p>
            <div className="admin-links-grid">
              {filteredMeriendaSubscriptions.map((subscription) => (
                <div className="card admin-link-card" key={`feeding-restrictions-${subscription._id || subscription.id}`}>
                  <p><strong>{subscription.childName || 'Alumno'}</strong> ({subscription.childGrade || 'N/A'})</p>
                  <p>{subscription.childFoodRestrictions || subscription.childAllergies || 'Sin restricciones alimentarias reportadas'}</p>
                </div>
              ))}
            </div>
            {filteredMeriendaSubscriptions.length === 0 ? <p>No hay alumnos suscritos para mostrar restricciones.</p> : null}
          </div>

          <div className="card">
            <h4>Recomendaciones de padres</h4>
            <p>Este resumen debe revisarse antes de entregar los snacks del día.</p>
            <div className="admin-links-grid">
              {filteredMeriendaSubscriptions.map((subscription) => (
                <div className="card admin-link-card" key={`feeding-recommendations-${subscription._id || subscription.id}`}>
                  <p><strong>{subscription.childName || 'Alumno'}</strong> ({subscription.childGrade || 'N/A'})</p>
                  <p>{subscription.parentRecommendations || 'Sin recomendaciones'}</p>
                </div>
              ))}
            </div>
            {filteredMeriendaSubscriptions.length === 0 ? <p>No hay alumnos suscritos para mostrar recomendaciones.</p> : null}
          </div>

          <div className="card">
            <h4>Suscripciones fallidas</h4>
            <p>Estas fallas llegan automáticamente cuando la renovación del siguiente mes se rechaza en la app de padres.</p>

            <table className="simple-table">
              <thead>
                <tr>
                  <th>Alumno</th>
                  <th>Grado</th>
                  <th>Acudiente</th>
                  <th>Monto</th>
                  <th>Mes objetivo</th>
                  <th>Motivo</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {meriendaFailedPayments.map((failedItem) => (
                  <tr key={failedItem._id || failedItem.id}>
                    <td>{failedItem.childName || 'N/A'}</td>
                    <td>{failedItem.childGrade || 'N/A'}</td>
                    <td>{failedItem.parentName || 'N/A'} ({failedItem.parentUsername || 'N/A'})</td>
                    <td>{formatCurrency(failedItem.amount)}</td>
                    <td>{failedItem.targetMonth || 'N/A'}</td>
                    <td>{failedItem.reason}</td>
                    <td>
                      <select
                        value={failedItem.status}
                        onChange={(event) => onUpdateMeriendaFailedStatus(failedItem._id || failedItem.id, event.target.value)}
                      >
                        <option value="pending_contact">Pendiente de contacto</option>
                        <option value="contacted">Contactado</option>
                        <option value="resolved">Resuelto</option>
                      </select>
                    </td>
                    <td>{failedItem.failedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {meriendaFailedPayments.length === 0 ? <p>No hay suscripciones fallidas registradas.</p> : null}
          </div>

          <div className="card">
            <h4>Historial de control</h4>
            <form className="admin-form-grid" onSubmit={onApplyMeriendaControlFilters}>
              <label>
                Desde
                <input
                  type="date"
                  value={meriendaControlFilters.from}
                  onChange={(event) =>
                    setMeriendaControlFilters((prev) => ({ ...prev, from: event.target.value }))
                  }
                />
              </label>
              <label>
                Hasta
                <input
                  type="date"
                  value={meriendaControlFilters.to}
                  onChange={(event) =>
                    setMeriendaControlFilters((prev) => ({ ...prev, to: event.target.value }))
                  }
                />
              </label>
              <label>
                Buscar
                <input
                  placeholder="Alumno, padre, recomendaciones, restricciones u observaciones"
                  value={meriendaControlFilters.q}
                  onChange={(event) =>
                    setMeriendaControlFilters((prev) => ({ ...prev, q: event.target.value }))
                  }
                />
              </label>
              <button className="btn btn-primary" type="submit">
                {loading ? 'Cargando...' : 'Filtrar historial'}
              </button>
            </form>

            <table className="simple-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Alumno</th>
                  <th>Padre</th>
                  <th>Estado</th>
                  <th>Observaciones</th>
                  <th>Tutor de alimentación</th>
                  <th className="followup-cell">Seguimiento</th>
                </tr>
              </thead>
              <tbody>
                {meriendaControlHistory.map((item) => (
                  <tr key={item._id}>
                    <td>{item.date || 'N/A'}</td>
                    <td>{item.subscription?.childName || 'N/A'}</td>
                    <td>{item.subscription?.parentName || 'N/A'} ({item.subscription?.parentUsername || 'N/A'})</td>
                    <td>{MERIENDAS_INTAKE_STATUS_LABEL[item.ateStatus] || MERIENDAS_INTAKE_STATUS_LABEL.pending}</td>
                    <td>{item.observations || 'Sin observaciones'}</td>
                    <td>{item.handledByName || 'N/A'}</td>
                    <td className="followup-cell">{item.followUpDone ? <span className="followup-check">✓</span> : <span>-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {meriendaControlHistory.length === 0 ? <p>No hay controles registrados para el rango seleccionado.</p> : null}
          </div>

          <div className="card">
            <h4>Crear meriendas</h4>
            <div className="admin-creation-grid">
              <div className="card">
                <h4>1er snack</h4>
                <label>
                  Titulo
                  <input
                    value={firstSnackDraft.title}
                    onChange={(event) => setFirstSnackDraft((prev) => ({ ...prev, title: event.target.value }))}
                  />
                </label>
                <label>
                  Descripcion
                  <textarea
                    rows={3}
                    value={firstSnackDraft.description}
                    onChange={(event) => setFirstSnackDraft((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </label>
                <label>
                  Foto
                  <input key={`first-snack-file-${snackInputResetVersion.first}`} type="file" accept="image/*" onChange={(event) => onSnackImageSelected('first', event)} />
                </label>
                {firstSnackDraft.imageUrl ? <img alt="Primer snack" className="admin-product-preview" src={firstSnackDraft.imageUrl} /> : null}
                <button className="btn btn-primary" onClick={() => onSaveSnackByType('first')} type="button">
                  Guardar 1er snack
                </button>
              </div>

              <div className="card">
                <h4>2do snack</h4>
                <label>
                  Titulo
                  <input
                    value={secondSnackDraft.title}
                    onChange={(event) => setSecondSnackDraft((prev) => ({ ...prev, title: event.target.value }))}
                  />
                </label>
                <label>
                  Descripcion
                  <textarea
                    rows={3}
                    value={secondSnackDraft.description}
                    onChange={(event) => setSecondSnackDraft((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </label>
                <label>
                  Foto
                  <input key={`second-snack-file-${snackInputResetVersion.second}`} type="file" accept="image/*" onChange={(event) => onSnackImageSelected('second', event)} />
                </label>
                {secondSnackDraft.imageUrl ? <img alt="Segundo snack" className="admin-product-preview" src={secondSnackDraft.imageUrl} /> : null}
                <button className="btn btn-primary" onClick={() => onSaveSnackByType('second')} type="button">
                  Guardar 2do snack
                </button>
              </div>

              <div className="card">
                <h4>Bebidas</h4>
                <label>
                  Titulo
                  <input
                    value={drinkSnackDraft.title}
                    onChange={(event) => setDrinkSnackDraft((prev) => ({ ...prev, title: event.target.value }))}
                  />
                </label>
                <label>
                  Descripcion
                  <textarea
                    rows={3}
                    value={drinkSnackDraft.description}
                    onChange={(event) => setDrinkSnackDraft((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </label>
                <label>
                  Foto
                  <input key={`drink-snack-file-${snackInputResetVersion.drink}`} type="file" accept="image/*" onChange={(event) => onSnackImageSelected('drink', event)} />
                </label>
                {drinkSnackDraft.imageUrl ? <img alt="Bebida" className="admin-product-preview" src={drinkSnackDraft.imageUrl} /> : null}
                <button className="btn btn-primary" onClick={() => onSaveSnackByType('drink')} type="button">
                  Guardar bebida
                </button>
              </div>
            </div>

            <div className="admin-links-grid">
              {meriendasSnacks.map((snack) => (
                <div className="card" key={snack._id || snack.id}>
                  <p>{snack.type === 'first' ? '1er snack' : snack.type === 'second' ? '2do snack' : 'Bebida'}</p>
                  <p><strong>{snack.title || 'Sin titulo'}</strong></p>
                  <p>{snack.description || 'Sin descripcion'}</p>
                  {snack.imageUrl ? <img alt={snack.title || 'Snack'} className="admin-product-preview" src={snack.imageUrl} /> : null}
                  <button className="btn" onClick={() => onLoadSnackDraft(snack)} type="button">
                    Modificar
                  </button>
                </div>
              ))}
            </div>
            {meriendasSnacks.length === 0 ? <p>No hay snacks guardados todavia.</p> : null}
          </div>

          <div className="card">
            <h4>Cronograma de comidas</h4>
            <div className="admin-form-grid">
              <label>
                Mes
                <input type="month" value={meriendasMonth} onChange={(event) => setMeriendasMonth(event.target.value)} />
              </label>
              <button className="btn btn-primary" onClick={onSaveMeriendasScheduleMonth} type="button">
                Guardar mes completo
              </button>
              <button className="btn" onClick={onSaveScheduleDay} type="button">
                Guardar día seleccionado
              </button>
            </div>

            <div className="meriendas-calendar">
              <div className="meriendas-week-header">
                {MERIENDAS_WEEK_DAYS.map((day) => (
                  <div className="meriendas-week-day" key={day}>{day}</div>
                ))}
              </div>
              <div className="meriendas-calendar-grid">
                {calendarDays.map((cell) => {
                  if (cell.empty) {
                    return <div className="meriendas-calendar-cell empty" key={cell.key} />;
                  }

                  const isSelected = String(selectedScheduleDay) === String(cell.day);
                  return (
                    <button
                      className={`meriendas-calendar-cell ${isSelected ? 'selected' : ''}`}
                      key={cell.key}
                      onClick={() => setSelectedScheduleDay(cell.day)}
                      type="button"
                    >
                      <strong>{cell.day}</strong>
                      <span>{cell.firstSnackId ? snackTitleById[cell.firstSnackId] || '1er snack' : 'Sin 1er snack'}</span>
                      <span>{cell.secondSnackId ? snackTitleById[cell.secondSnackId] || '2do snack' : 'Sin 2do snack'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="card">
              <h4>Editar día {selectedScheduleDay || '-'}</h4>
              <div className="admin-form-grid">
                <label>
                  1er snack
                  <select
                    value={selectedDaySchedule.firstSnackId}
                    onChange={(event) => onScheduleDaySnackChange(selectedScheduleDay, 'firstSnackId', event.target.value)}
                    disabled={!selectedScheduleDay}
                  >
                    <option value="">Selecciona snack</option>
                    {meriendasFirstSnackOptions.map((snack) => (
                      <option key={snack._id || snack.id} value={snack._id || snack.id}>{snack.title}</option>
                    ))}
                  </select>
                </label>
                <label>
                  2do snack
                  <select
                    value={selectedDaySchedule.secondSnackId}
                    onChange={(event) => onScheduleDaySnackChange(selectedScheduleDay, 'secondSnackId', event.target.value)}
                    disabled={!selectedScheduleDay}
                  >
                    <option value="">Selecciona snack</option>
                    {meriendasSecondSnackOptions.map((snack) => (
                      <option key={snack._id || snack.id} value={snack._id || snack.id}>{snack.title}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="row gap">
                <button className="btn btn-primary" onClick={onSaveScheduleDay} type="button" disabled={!selectedScheduleDay || loading}>
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeModule === 'inventory' ? (
        <section className="panel admin-section">
          <h3>Inventario (ingresos, egresos, traslados)</h3>
          <form className="admin-form-grid" onSubmit={onCreateInventoryRequest}>
            <label>
              Tipo
              <select
                value={inventoryForm.type}
                onChange={(event) => {
                  const nextType = event.target.value;
                  setInventoryForm((prev) => ({
                    ...prev,
                    type: nextType,
                    targetStoreId: nextType === 'transfer' ? prev.targetStoreId : '',
                    productId: '',
                    quantity: '1',
                  }));
                  setInventoryRequestItems([]);
                  setInventoryProductQuery('');
                }}
              >
                <option value="in">Ingreso</option>
                <option value="out">Egreso</option>
                <option value="transfer">Traslado</option>
              </select>
            </label>
            <label>
              Tienda origen
              <select
                value={inventoryForm.storeId}
                onChange={(event) => {
                  const nextStoreId = event.target.value;
                  setInventoryForm((prev) => ({
                    ...prev,
                    storeId: nextStoreId,
                    targetStoreId: nextStoreId === prev.targetStoreId ? '' : prev.targetStoreId,
                    productId: '',
                    quantity: '1',
                  }));
                  setInventoryRequestItems([]);
                  setInventoryProductQuery('');
                }}
                required
              >
                <option value="">Selecciona tienda</option>
                {stores.map((store) => (
                  <option key={store._id} value={store._id}>{store.name}</option>
                ))}
              </select>
            </label>
            {inventoryForm.type === 'transfer' ? (
              <label>
                Tienda destino
                <select value={inventoryForm.targetStoreId} onChange={(event) => setInventoryForm((prev) => ({ ...prev, targetStoreId: event.target.value }))} required>
                  <option value="">Selecciona tienda destino</option>
                  {stores.filter((store) => store._id !== inventoryForm.storeId).map((store) => (
                    <option key={store._id} value={store._id}>{store.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              Producto
              <div className="product-picker">
                <input
                  placeholder="Selecciona o escribe producto"
                  value={inventoryProductQuery}
                  onFocus={() => setShowInventoryProductOptions(true)}
                  onClick={() => setShowInventoryProductOptions(true)}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowInventoryProductOptions(false);
                    }, 120);
                  }}
                  onChange={(event) => {
                    setInventoryProductQuery(event.target.value);
                    setInventoryForm((prev) => ({ ...prev, productId: '' }));
                    setShowInventoryProductOptions(true);
                  }}
                />
                {showInventoryProductOptions ? (
                  <div className="product-picker-menu">
                    {filteredInventoryProducts.map((product) => (
                      <button
                        className="product-picker-option"
                        key={product._id}
                        onMouseDown={() => {
                          setInventoryForm((prev) => ({ ...prev, productId: product._id }));
                          setInventoryProductQuery(product.name || 'Producto');
                          setShowInventoryProductOptions(false);
                        }}
                        type="button"
                      >
                        {product.name || 'Producto'} (stock {product.stock ?? 0})
                      </button>
                    ))}
                    {filteredInventoryProducts.length === 0 ? <p className="product-picker-empty">Sin coincidencias</p> : null}
                  </div>
                ) : null}
              </div>
            </label>
            <label>
              Cantidad
              <input type="number" min="1" value={inventoryForm.quantity} onChange={(event) => setInventoryForm((prev) => ({ ...prev, quantity: event.target.value }))} />
            </label>
            <button className="btn" onClick={onAddInventoryItem} type="button">Agregar producto</button>
            <label>
              Observaciones generales
              <input value={inventoryForm.notes} onChange={(event) => setInventoryForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </label>
            <button className="btn btn-primary" type="submit">Registrar movimiento</button>
          </form>

          <div className="card">
            <h4>Productos agregados al movimiento</h4>
            {inventoryRequestItems.length === 0 ? <p>No has agregado productos.</p> : null}
            {inventoryRequestItems.length > 0 ? (
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Stock actual</th>
                    <th>Cantidad</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryRequestItems.map((item) => {
                    const product = products.find((p) => String(p._id) === String(item.productId));
                    return (
                      <tr key={item.productId}>
                        <td>{product?.name || 'Producto'}</td>
                        <td>{product?.stock ?? 'N/A'}</td>
                        <td>{item.quantity}</td>
                        <td>
                          <button className="btn" onClick={() => onRemoveInventoryItem(item.productId)} type="button">
                            Quitar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeModule === 'approvals' ? (
        <section className="panel admin-section">
          <h3>Autorizaciones</h3>
          <button className="btn" onClick={() => runAction(loadApprovals, 'Autorizaciones actualizadas.')} type="button">
            Refrescar solicitudes
          </button>

          <div className="admin-view-switch">
            {approvalModules.map((moduleItem) => (
              <button
                className={`btn btn-chip ${approvalModule === moduleItem.id ? 'is-active' : ''}`}
                key={moduleItem.id}
                onClick={() => setApprovalModule(moduleItem.id)}
                type="button"
              >
                {moduleItem.label} ({moduleItem.count})
              </button>
            ))}
          </div>

          {approvalModule === 'in' ? <h4>Solicitudes de ingresos</h4> : null}
          {approvalModule === 'out' ? <h4>Solicitudes de egresos</h4> : null}
          {approvalModule === 'transfer' ? <h4>Solicitudes de traslados</h4> : null}
          {approvalModule === 'topups' ? <h4>Solicitudes de recargas</h4> : null}
          {approvalModule === 'cancellations' ? <h4>Solicitudes de anulacion de venta</h4> : null}

          {(approvalModule === 'in' ? pendingInGroups : approvalModule === 'out' ? pendingOutGroups : approvalModule === 'transfer' ? pendingTransferGroups : []).map((group) => (
            <div className="card" key={group.key}>
              <p>Tienda: {group.store?.name || 'N/A'} {group.targetStore?.name ? `-> ${group.targetStore.name}` : ''}</p>
              <p>Solicitado por: {group.requestedBy?.name || 'N/A'}</p>
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {group.requests.map((request) => (
                    <tr key={request._id}>
                      <td>{request.productId?.name || 'Producto'}</td>
                      <td>{request.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row gap">
                <button className="btn btn-primary" onClick={() => onApproveInventoryBatch(group.requests.map((r) => r._id))} type="button">Aprobar lote</button>
                <button className="btn" onClick={() => onRejectInventoryBatch(group.requests.map((r) => r._id))} type="button">Rechazar lote</button>
              </div>
            </div>
          ))}

          {approvalModule === 'topups'
            ? pendingTopups.map((request) => (
                <div className="card" key={request._id}>
                  <p>Alumno: {request.studentId?.name || 'N/A'}</p>
                  <p>Monto: {formatCurrency(request.amount)}</p>
                  <p>Método: {request.method}</p>
                  <div className="row gap">
                    <button className="btn btn-primary" onClick={() => onApproveTopup(request._id)} type="button">Aprobar</button>
                    <button className="btn" onClick={() => onRejectTopup(request._id)} type="button">Rechazar</button>
                  </div>
                </div>
              ))
            : null}

          {approvalModule === 'cancellations'
            ? pendingCancellations.map((request) => (
                <div className="card" key={request._id}>
                  <p>Orden: {request.orderId?._id || request.orderId}</p>
                  <p>Alumno: {request.orderId?.studentId?.name || 'Venta externa'}</p>
                  <p>Total: {formatCurrency(request.orderId?.total || 0)}</p>
                  <div className="row gap">
                    <button className="btn btn-primary" onClick={() => onApproveCancellation(request._id)} type="button">Aprobar</button>
                    <button className="btn" onClick={() => onRejectCancellation(request._id)} type="button">Rechazar</button>
                  </div>
                </div>
              ))
            : null}

          {approvalModule !== 'topups' && approvalModule === 'in' && pendingInGroups.length === 0 ? <p>No hay ingresos pendientes.</p> : null}
          {approvalModule !== 'topups' && approvalModule === 'out' && pendingOutGroups.length === 0 ? <p>No hay egresos pendientes.</p> : null}
          {approvalModule !== 'topups' && approvalModule === 'transfer' && pendingTransferGroups.length === 0 ? <p>No hay traslados pendientes.</p> : null}
          {approvalModule === 'topups' && pendingTopups.length === 0 ? <p>No hay recargas pendientes.</p> : null}
          {approvalModule === 'cancellations' && pendingCancellations.length === 0 ? <p>No hay anulaciones pendientes.</p> : null}

          <div className="card">
            <h4>Historial de autorizaciones</h4>
            {approvalHistory.length === 0 ? <p>No hay autorizaciones aprobadas o rechazadas.</p> : null}

            {approvalHistory.length > 0 ? (
              <div className="approval-history-scroll approval-history-table-scroll">
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Fecha y hora</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th>Resumen</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvalHistory.map((item) => (
                      <tr key={item.id}>
                        <td>{formatDateTime(item.decidedAt || item.createdAt)}</td>
                        <td>{item.title}</td>
                        <td>{item.statusLabel}</td>
                        <td>{item.summary}</td>
                        <td>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => setSelectedApprovalHistoryId(item.id)}
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {selectedApprovalHistory ? (
              <div className="card">
                <h4>Detalle de autorización</h4>
                <p>Tipo: {selectedApprovalHistory.title}</p>
                <p>Estado: {selectedApprovalHistory.statusLabel}</p>
                <p>Resuelto por: {selectedApprovalHistory.decidedBy}</p>
                <p>Fecha y hora: {formatDateTime(selectedApprovalHistory.decidedAt || selectedApprovalHistory.createdAt)}</p>

                {selectedApprovalHistory.domain === 'inventory' ? (
                  <>
                    <p>Tienda origen: {selectedApprovalHistory.detail?.storeId?.name || 'N/A'}</p>
                    <p>Tienda destino: {selectedApprovalHistory.detail?.targetStoreId?.name || 'N/A'}</p>
                    <p>Producto: {selectedApprovalHistory.detail?.productId?.name || 'N/A'}</p>
                    <p>Cantidad: {selectedApprovalHistory.detail?.quantity || 0}</p>
                    <p>Solicitado por: {selectedApprovalHistory.detail?.requestedBy?.name || 'N/A'}</p>
                    <p>Observaciones: {selectedApprovalHistory.detail?.notes || 'Sin observaciones'}</p>
                  </>
                ) : null}

                {selectedApprovalHistory.domain === 'topup' ? (
                  <>
                    <p>Alumno: {selectedApprovalHistory.detail?.studentId?.name || 'N/A'}</p>
                    <p>Monto: {formatCurrency(selectedApprovalHistory.detail?.amount || 0)}</p>
                    <p>Método: {selectedApprovalHistory.detail?.method || 'N/A'}</p>
                    <p>Tienda: {selectedApprovalHistory.detail?.storeId?.name || 'N/A'}</p>
                    <p>Solicitado por: {selectedApprovalHistory.detail?.requestedBy?.name || 'N/A'}</p>
                    <p>Observaciones: {selectedApprovalHistory.detail?.notes || 'Sin observaciones'}</p>
                  </>
                ) : null}

                {selectedApprovalHistory.domain === 'cancellation' ? (
                  <>
                    <p>Orden: {selectedApprovalHistory.detail?.orderId?._id || selectedApprovalHistory.detail?.orderId || 'N/A'}</p>
                    <p>Alumno: {selectedApprovalHistory.detail?.orderId?.studentId?.name || 'Venta externa'}</p>
                    <p>Total: {formatCurrency(selectedApprovalHistory.detail?.orderId?.total || 0)}</p>
                    <p>Tienda: {selectedApprovalHistory.detail?.storeId?.name || 'N/A'}</p>
                    <p>Solicitado por: {selectedApprovalHistory.detail?.requestedBy?.name || 'N/A'}</p>
                    <p>Motivo: {selectedApprovalHistory.detail?.reason || 'Sin motivo'}</p>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeModule === 'closure' ? (
        <section className="panel admin-section">
          <h3>Cierre diario por tienda</h3>
          <form className="admin-form-grid" onSubmit={onApplyClosureFilters}>
            <label>
              Tienda
              <select value={closureFilters.storeId} onChange={(event) => setClosureFilters((prev) => ({ ...prev, storeId: event.target.value }))} required>
                <option value="">Selecciona tienda</option>
                {stores.map((store) => (
                  <option key={store._id} value={store._id}>{store.name}</option>
                ))}
              </select>
            </label>
            <label>
              Fecha (opcional)
              <input type="date" value={closureFilters.date} onChange={(event) => setClosureFilters((prev) => ({ ...prev, date: event.target.value }))} />
            </label>
            <button className="btn btn-primary" type="submit">Ver cierres</button>
          </form>

          <div className="admin-closures-grid">
            {closures.map((closure) => (
              <div className="card" key={closure._id}>
                <p>Fecha: {closure.date}</p>
                <p>Vendedor: {closure.vendorId?.name || 'N/A'}</p>
                <p>Ingresos efectivo: {formatCurrency(closure.systemCash)}</p>
                <p>Ingresos datáfono: {formatCurrency(closure.systemDataphone)}</p>
                <p>Ingresos transferencia: {formatCurrency(closure.systemTransfer)}</p>
                <p>Ingresos sistema: {formatCurrency(closure.systemWallet)}</p>
                <p>Total ingresos: {formatCurrency(closure.totalSales)}</p>
                <p>Total efectivo sistema: {formatCurrency(closure.cashAccordingSystem)}</p>
                <p>Total efectivo real: {formatCurrency(closure.countedCash)}</p>
                <p>Base inicial: {formatCurrency(closure.baseInitial)}</p>
                <p>Base final: {formatCurrency(closure.baseFinal)}</p>
                <p>Total efectivo guardado: {formatCurrency(closure.totalCashSaved)}</p>
                <p>Deficit: {formatCurrency(closure.cashDifference)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {showDeleteConfirmModal ? (
        <div className="brand-popup-overlay" role="dialog" aria-modal="true" aria-label="Confirmar eliminación">
          <div className="brand-popup brand-popup-warning">
            <h3>Confirmar eliminación</h3>
            <p>Esta accion eliminara {deleteTargetLabel}. Deseas continuar?</p>
            <div className="brand-popup-actions">
              <button className="btn" type="button" onClick={() => setShowDeleteConfirmModal(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  executeDeleteEdit();
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inventoryApplyModal.open ? (
        <div className={`brand-popup-overlay ${inventoryApplyModal.fading ? 'inventory-apply-overlay-fading' : ''}`} role="status" aria-live="polite">
          <div className={`brand-popup brand-popup-success ${inventoryApplyModal.fading ? 'inventory-apply-popup-fading' : ''}`}>
            <h3>{inventoryApplyModal.title}</h3>
            <p>{inventoryApplyModal.message}</p>
          </div>
        </div>
      ) : null}

      {snackSavePopup.open ? (
        <div className={`snack-save-toast ${snackSavePopup.fading ? 'is-fading' : ''}`} role="status" aria-live="polite">
          <div className="snack-save-toast-icon" aria-hidden="true">✓</div>
          <div className="snack-save-toast-text">
            <h4>Snack guardado</h4>
            <p>{snackSavePopup.title}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AdminDashboard;
