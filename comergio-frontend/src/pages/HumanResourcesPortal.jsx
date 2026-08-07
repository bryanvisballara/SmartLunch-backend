import { useEffect, useMemo, useState } from 'react';
import {
  acceptHrPurchasingRequest,
  adjustHrSupplyItemStock,
  approveHrSupplyRequest,
  createHrSupplyItem,
  createHrSupplyRequest,
  deliverHrSupplyRequest,
  getHrDashboard,
  getHrPurchaseAreas,
  getHrSupplyItems,
  getHrSupplyRequests,
  rejectHrSupplyRequest,
  submitHrSupplyRequestForApproval,
} from '../services/hr.service';
import useAuthStore from '../store/auth.store';
import { PortalBootSplash } from '../components/PortalBootSplash';
import ComergioAcademyPanel from '../components/comergio-academy/ComergioAcademyPanel';
import { isComergioAcademySection } from '../components/comergio-academy/academyNav';
import StaffPortalShell from '../components/staff-chrome/StaffPortalShell';
import StaffAnnouncementsPanel, { StaffAnnouncementsUnreadBadge, useStaffAnnouncementUnreadCount } from '../components/staff-announcements/StaffAnnouncementsPanel';
import { getSchoolDisplayName } from '../lib/schools';
import './HumanResourcesPortal.css';

const categoryOptions = [
  { value: 'cleaning', label: 'Aseo y limpieza' },
  { value: 'construction', label: 'Construcción y obra' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'stationery', label: 'Papelería' },
  { value: 'classroom', label: 'Aula / docentes' },
  { value: 'furniture', label: 'Mobiliario' },
  { value: 'technology', label: 'Tecnología' },
  { value: 'laboratory', label: 'Laboratorio' },
  { value: 'sports', label: 'Deportes' },
  { value: 'music', label: 'Música' },
  { value: 'cafeteria', label: 'Cafetería' },
  { value: 'nursing', label: 'Enfermería' },
  { value: 'security', label: 'Seguridad' },
  { value: 'admin', label: 'Administración' },
  { value: 'other', label: 'Otros' },
];

const serviceAreaOptions = [
  { value: 'cleaning', label: 'Personal de limpieza' },
  { value: 'maintenance', label: 'Personal de mantenimiento' },
  { value: 'teaching', label: 'Docencia / academia' },
  { value: 'administration', label: 'Administración' },
  { value: 'cafeteria', label: 'Cafetería' },
  { value: 'nursing', label: 'Enfermería' },
  { value: 'sports', label: 'Deportes' },
  { value: 'technology', label: 'Sistemas / tecnología' },
  { value: 'security', label: 'Seguridad' },
  { value: 'general', label: 'General del colegio' },
];

const requestTypeOptions = [
  { value: 'purchase', label: 'Compra / adquisición', help: 'Comprar productos que aún no están en inventario o hay que adquirir afuera.' },
  { value: 'material', label: 'Entrega desde inventario', help: 'Sacar del stock existente para un área o persona.' },
  { value: 'replenishment', label: 'Reposición de inventario', help: 'Reponer materiales del catálogo que ya existen.' },
];

const unitOptions = ['unidad', 'caja', 'paquete', 'rollo', 'galón', 'litro', 'kg', 'metro', 'par', 'juego', 'bolsa'];

const priorityOptions = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const statusLabels = {
  pending_coordination_review: 'Revisión coordinación',
  returned_for_correction: 'Devuelto a corrección',
  consolidated: 'Consolidada',
  pending_hr_review: 'Revisión RRHH',
  pending_purchasing_review: 'Gestión de compras',
  pending_approval: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  delivered: 'Entregada',
  partially_delivered: 'Parcial',
  cancelled: 'Cancelada',
};

const requestTypeLabels = {
  material: 'Entrega desde inventario',
  purchase: 'Compra / adquisición',
  replenishment: 'Reposición de inventario',
};

const historyFilterOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'request', label: 'Solicitudes' },
  { value: 'stock_in', label: 'Ingresos' },
  { value: 'delivery', label: 'Entregas' },
];

const roleCanManageInventory = ['human_resources', 'admin', 'rectoria', 'direccion'];
const roleCanSubmitApproval = ['human_resources', 'admin'];
const roleCanApprove = ['rectoria', 'direccion', 'admin'];
const roleCanDeliver = ['human_resources', 'admin'];
const roleCanAcceptPurchasing = ['human_resources', 'admin'];

const emptyItemForm = {
  name: '',
  category: 'cleaning',
  itemType: 'consumable',
  unit: 'unidad',
  sku: '',
  stock: 0,
  minStock: 0,
  unitCost: 0,
  location: '',
  notes: '',
};

const emptyRequestForm = {
  requestType: 'purchase',
  serviceArea: 'general',
  needCategory: 'other',
  requestedForArea: '',
  requestedForPerson: '',
  purpose: '',
  priority: 'medium',
  neededByDate: '',
  itemId: '',
  customName: '',
  quantity: 1,
  unit: 'unidad',
  unitCost: 0,
  itemNotes: '',
};

const emptyStockForm = {
  itemId: '',
  quantity: 1,
  notes: '',
  receivedByName: '',
};

const ACTIVE_AREA_STORAGE_KEY = 'comergio.hr.activePurchaseAreaId';

const LEGACY_AREA_KEY_ALIASES = {
  academia: 'teaching',
  limpieza: 'cleaning',
  mantenimiento: 'maintenance',
  administracion: 'administration',
};

function formatCop(value) {
  return `$${Number(value || 0).toLocaleString('es-CO')}`;
}

function areaNavKey(areaId) {
  return `area:${areaId}`;
}

function areaIdFromNavKey(key) {
  if (!String(key || '').startsWith('area:')) return '';
  return String(key).slice(5);
}

function resolveServiceAreaFromPurchaseArea(area) {
  const key = String(area?.key || '').trim();
  const modernKey = LEGACY_AREA_KEY_ALIASES[key] || key;
  return serviceAreaOptions.some((option) => option.value === modernKey) ? modernKey : 'general';
}

function isAcademiaPurchaseArea(area) {
  const key = String(area?.key || '').trim();
  return key === 'teaching' || key === 'academia';
}

function isGeneralPurchaseArea(area) {
  return String(area?.key || '').trim() === 'general';
}

function isNursingPurchaseArea(area) {
  return String(area?.key || '').trim() === 'nursing';
}

function isOperationsPortalView(viewKey) {
  return viewKey === 'operations' || String(viewKey || '').startsWith('area:');
}

function isPlannerConsolidateRequest(request) {
  return Array.isArray(request?.consolidatedFromRequestIds) && request.consolidatedFromRequestIds.length > 0;
}

function isNursingIncomingRequest(request) {
  if (!request || isPlannerConsolidateRequest(request)) return false;
  const fromNursing = String(request.serviceArea || '') === 'nursing'
    || String(request.requestedBy?.role || '') === 'nursing'
    || String(request.requestedForArea || '').toLowerCase() === 'enfermería'
    || String(request.requestedForArea || '').toLowerCase() === 'enfermeria';
  if (!fromNursing) return false;
  // Exclude auto-delivered stock adjustments; keep purchase/request workflow items.
  if (request.requestType === 'purchase') return true;
  return ['pending_purchasing_review', 'pending_hr_review', 'pending_approval', 'approved', 'rejected'].includes(request.status);
}

function getConsolidateMaterialRows(request) {
  return (request.items || []).map((entry) => ({
    id: entry.id || `${entry.itemId || entry.customName}-${entry.quantity}`,
    name: entry.item?.name || entry.customName || 'Material',
    quantity: Number(entry.quantity || 0),
    unit: entry.unit || entry.item?.unit || 'unidad',
    unitCost: Math.max(0, Number(entry.unitCost || entry.item?.unitCost || 0)),
  })).filter((row) => row.quantity > 0);
}

function renderHistoryMaterials(request) {
  const rows = getConsolidateMaterialRows(request);
  if (!rows.length) return '—';
  return (
    <ul className="hr-portal__history-materials">
      {rows.map((row) => (
        <li key={row.id}>
          <strong>{row.name}</strong>
          <span> ×{row.quantity} {row.unit}</span>
        </li>
      ))}
    </ul>
  );
}

function getHistoryMovementLabel(request) {
  if (isPlannerConsolidateRequest(request)) {
    return request.plannerCycle?.title
      || request.requestedForArea
      || 'Consolidado de planners docentes';
  }
  return requestTypeLabels[request.requestType] || 'Solicitud de materiales';
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function getRequestItemsLabel(request) {
  return (request.items || [])
    .map((entry) => `${entry.item?.name || entry.customName || 'Material'} x${entry.quantity}${entry.unit ? ` ${entry.unit}` : ''}`)
    .join(', ');
}

function getCategoryLabel(value) {
  return categoryOptions.find((option) => option.value === value)?.label || value || 'Otros';
}

function getServiceAreaLabel(value) {
  return serviceAreaOptions.find((option) => option.value === value)?.label || value || 'General';
}

function mapRequestToHistoryEntry(request) {
  const isDelivered = request.status === 'delivered' || request.status === 'partially_delivered';
  let kind = 'request';
  let kindLabel = 'Solicitud';
  if (isDelivered) {
    if (request.requestType === 'material') {
      kind = 'delivery';
      kindLabel = 'Entrega de material';
    } else {
      kind = 'stock_in';
      kindLabel = 'Ingreso de inventario';
    }
  }
  const sortAt = request.deliveredAt || request.updatedAt || request.createdAt || null;
  return { request, kind, kindLabel, sortAt };
}

function IconBox() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="M12 12v9" />
      <path d="m3 8.5 9 3.5 9-3.5" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 5h6" />
      <path d="M8 3h8a1 1 0 0 1 1 1v2H7V4a1 1 0 0 1 1-1Z" />
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

function IconAlertBox() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 12 16-8-6 16-2.5-6.5L4 12Z" />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7h11v10H3z" />
      <path d="M14 10h4l3 3v4h-7v-7Z" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="17.5" cy="17.5" r="1.5" />
    </svg>
  );
}

function IconStockIn() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function HumanResourcesPortal() {
  const { user } = useAuthStore();
  const isManager = roleCanManageInventory.includes(user?.role);
  const canSubmitApproval = roleCanSubmitApproval.includes(user?.role);
  const canApprove = roleCanApprove.includes(user?.role);
  const canDeliver = roleCanDeliver.includes(user?.role);
  const canAcceptPurchasing = roleCanAcceptPurchasing.includes(user?.role);
  const isTeacher = user?.role === 'teacher';

  const [dashboard, setDashboard] = useState(null);
  const [purchaseAreas, setPurchaseAreas] = useState([]);
  const [activeAreaId, setActiveAreaId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_AREA_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [items, setItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [dispatchConsolidates, setDispatchConsolidates] = useState([]);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [requestItems, setRequestItems] = useState([]);
  const [stockForm, setStockForm] = useState(emptyStockForm);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [activeModal, setActiveModal] = useState(null);
  const [deliverMode, setDeliverMode] = useState('request');
  const [message, setMessage] = useState('');
  const [shellLoading, setShellLoading] = useState(true);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activePortalView, setActivePortalView] = useState('operations');
  const [materialSearch, setMaterialSearch] = useState('');
  const staffAnnouncementsUnreadQuery = useStaffAnnouncementUnreadCount(true);
  const staffAnnouncementsUnreadCount = Number(
    staffAnnouncementsUnreadQuery.data?.data?.unreadCount
    ?? staffAnnouncementsUnreadQuery.data?.unreadCount
    ?? 0
  );

  const activeArea = useMemo(
    () => purchaseAreas.find((area) => String(area.id) === String(activeAreaId)) || null,
    [purchaseAreas, activeAreaId]
  );
  const areaBudget = Number(activeArea?.budgetAmount ?? dashboard?.summary?.budgetAmount ?? 0);
  const areaSpent = Number(activeArea?.spentAmount ?? dashboard?.summary?.spentAmount ?? 0);
  const areaAvailable = Math.max(0, areaBudget - areaSpent);
  const requestEstimatedTotal = useMemo(
    () => requestItems.reduce((sum, entry) => sum + (Number(entry.quantity || 0) * Number(entry.unitCost || 0)), 0),
    [requestItems]
  );

  const lowStockItems = useMemo(() => items.filter((item) => item.lowStock), [items]);
  const activeItems = useMemo(() => items.filter((item) => item.status === 'active'), [items]);
  const filteredActiveItems = useMemo(() => {
    const query = String(materialSearch || '').trim().toLowerCase();
    const category = String(requestForm.needCategory || '').trim();
    return activeItems.filter((item) => {
      const matchesQuery = !query || String(item.name || '').toLowerCase().includes(query);
      const matchesCategory = !category || category === 'other' || String(item.category || '') === category;
      return matchesQuery && matchesCategory;
    });
  }, [activeItems, materialSearch, requestForm.needCategory]);
  const selectedRequestItem = activeItems.find((item) => String(item.id) === String(requestForm.itemId));
  const allowsCustomItems = requestForm.requestType === 'purchase' || requestForm.requestType === 'replenishment';
  const selectedRequestTypeHelp = requestTypeOptions.find((option) => option.value === requestForm.requestType)?.help || '';
  const approvedPendingDeliveries = useMemo(
    () => requests.filter((request) => request.status === 'approved'),
    [requests]
  );

  const isAcademiaArea = isAcademiaPurchaseArea(activeArea);
  const isGeneralArea = isGeneralPurchaseArea(activeArea);
  const isNursingArea = isNursingPurchaseArea(activeArea);

  const historyEntries = useMemo(() => {
    const byId = new Map();
    for (const request of requests) {
      if (request.status === 'consolidated') continue;
      byId.set(String(request.id), request);
    }
    if (isGeneralArea) {
      for (const request of dispatchConsolidates) {
        byId.set(String(request.id), request);
      }
    }
    const mapped = Array.from(byId.values()).map(mapRequestToHistoryEntry);
    mapped.sort((a, b) => {
      const aTime = a.sortAt ? new Date(a.sortAt).getTime() : 0;
      const bTime = b.sortAt ? new Date(b.sortAt).getTime() : 0;
      return bTime - aTime;
    });
    if (historyFilter === 'all') return mapped;
    return mapped.filter((entry) => entry.kind === historyFilter);
  }, [requests, historyFilter, isGeneralArea, dispatchConsolidates]);
  const showPlannerDispatchPanel = isManager && (isAcademiaArea || isGeneralArea);
  const plannerConsolidates = useMemo(() => {
    if (!showPlannerDispatchPanel) return [];
    const source = isAcademiaArea
      ? requests.filter((request) => isPlannerConsolidateRequest(request))
      : dispatchConsolidates;
    return [...source].sort((a, b) => {
      const aPending = a.status === 'pending_purchasing_review' ? 0 : 1;
      const bPending = b.status === 'pending_purchasing_review' ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      const aTime = new Date(a.submittedToPurchasingAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.submittedToPurchasingAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [requests, dispatchConsolidates, showPlannerDispatchPanel, isAcademiaArea]);
  const pendingPlannerConsolidates = useMemo(
    () => plannerConsolidates.filter((request) => request.status === 'pending_purchasing_review'),
    [plannerConsolidates]
  );

  const nursingIncomingRequests = useMemo(() => {
    if (!isNursingArea) return [];
    return requests
      .filter((request) => isNursingIncomingRequest(request))
      .sort((a, b) => {
        const pendingRank = (status) => (
          status === 'pending_purchasing_review' || status === 'pending_hr_review' || status === 'pending_approval'
            ? 0
            : status === 'approved'
              ? 1
              : 2
        );
        const rankDiff = pendingRank(a.status) - pendingRank(b.status);
        if (rankDiff !== 0) return rankDiff;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
  }, [requests, isNursingArea]);
  const pendingNursingRequests = useMemo(
    () => nursingIncomingRequests.filter((request) => (
      request.status === 'pending_purchasing_review'
      || request.status === 'pending_hr_review'
      || request.status === 'pending_approval'
    )),
    [nursingIncomingRequests]
  );

  const kpiCards = [
    {
      key: 'budget',
      label: 'Presupuesto',
      value: formatCop(areaBudget),
      meta: activeArea?.name || 'Área activa',
      tone: 'blue',
      icon: <IconFile />,
    },
    {
      key: 'spent',
      label: 'Usado',
      value: formatCop(areaSpent),
      meta: 'Compras aprobadas',
      tone: 'purple',
      icon: <IconClipboard />,
    },
    {
      key: 'available',
      label: 'Disponible',
      value: formatCop(areaAvailable),
      meta: areaBudget > 0 ? `${Math.min(100, Math.round((areaSpent / areaBudget) * 100))}% usado` : 'Sin tope definido',
      tone: 'green',
      icon: <IconCheck />,
    },
    {
      key: 'materials',
      label: 'Materiales',
      value: dashboard?.summary?.totalItems || items.length,
      meta: 'En esta área',
      tone: 'amber',
      icon: <IconBox />,
    },
    {
      key: 'low_stock',
      label: 'Stock bajo',
      value: dashboard?.summary?.lowStockCount || lowStockItems.length,
      meta: 'Elementos del área',
      tone: 'red',
      icon: <IconAlertBox />,
    },
  ];

  const closeModal = () => {
    setActiveModal(null);
    setDeliverMode('request');
    setStockForm(emptyStockForm);
  };

  const openModal = (modalKey) => {
    setMessage('');
    if (modalKey === 'create-request') {
      setRequestForm((current) => ({
        ...emptyRequestForm,
        requestType: isTeacher ? 'material' : current.requestType || 'purchase',
        serviceArea: isTeacher ? 'teaching' : resolveServiceAreaFromPurchaseArea(activeArea),
        needCategory: isTeacher ? 'classroom' : current.needCategory || 'other',
      }));
      setRequestItems([]);
      setMaterialSearch('');
    }
    if (modalKey === 'create-item') {
      setItemForm(emptyItemForm);
    }
    if (modalKey === 'add-stock' || modalKey === 'deliver') {
      setStockForm(emptyStockForm);
      setDeliverMode('request');
    }
    setActiveModal(modalKey);
  };

  const resolveActiveAreaId = (areas, preferredId = activeAreaId) => {
    if (!areas.length) return '';
    if (preferredId && areas.some((area) => String(area.id) === String(preferredId))) {
      return String(preferredId);
    }
    const general = areas.find((area) => area.key === 'general');
    return String(general?.id || areas[0].id);
  };

  const loadOverviewShell = async (areaIdOverride) => {
    const areasResponse = await getHrPurchaseAreas();
    const areas = (areasResponse.data?.areas || []).filter((area) => area.status !== 'archived');
    setPurchaseAreas(areas);

    const nextAreaId = resolveActiveAreaId(areas, areaIdOverride ?? activeAreaId);
    if (nextAreaId !== activeAreaId) {
      setActiveAreaId(nextAreaId);
    }
    if (nextAreaId) {
      setActivePortalView((current) => (
        isComergioAcademySection(current) ? current : areaNavKey(nextAreaId)
      ));
    }
    try {
      if (nextAreaId) localStorage.setItem(ACTIVE_AREA_STORAGE_KEY, nextAreaId);
    } catch {
      /* ignore */
    }

    const areaParams = nextAreaId ? { areaId: nextAreaId } : {};
    const [itemsResponse, dashboardResponse] = await Promise.all([
      getHrSupplyItems({ status: 'active', ...areaParams }),
      isManager ? getHrDashboard(areaParams) : Promise.resolve({ data: null }),
    ]);

    setItems(itemsResponse.data?.items || []);
    setDashboard(dashboardResponse.data || null);
    return { areaId: nextAreaId, areas };
  };

  const loadRequests = async (areaIdOverride, areasOverride) => {
    const areaId = areaIdOverride ?? activeAreaId;
    const areas = Array.isArray(areasOverride) && areasOverride.length
      ? areasOverride
      : purchaseAreas;
    const params = {
      ...(areaId ? { areaId } : {}),
    };
    const requestsResponse = await getHrSupplyRequests(params);
    const areaRequests = requestsResponse.data?.requests || [];
    setRequests(areaRequests);

    if (!isManager) {
      setDispatchConsolidates([]);
      return;
    }

    const academiaArea = areas.find((area) => isAcademiaPurchaseArea(area));
    const activeIsAcademia = academiaArea && String(academiaArea.id) === String(areaId || '');
    if (activeIsAcademia) {
      setDispatchConsolidates(areaRequests.filter((request) => isPlannerConsolidateRequest(request)));
      return;
    }

    if (academiaArea?.id) {
      try {
        const academiaResponse = await getHrSupplyRequests({ areaId: academiaArea.id });
        setDispatchConsolidates(
          (academiaResponse.data?.requests || []).filter((request) => isPlannerConsolidateRequest(request))
        );
      } catch {
        setDispatchConsolidates([]);
      }
    } else {
      setDispatchConsolidates([]);
    }
  };

  const loadData = async ({ refreshAll = true, areaId } = {}) => {
    if (refreshAll) {
      setShellLoading(true);
    } else {
      setBackgroundLoading(true);
    }

    try {
      let resolvedAreaId = areaId ?? activeAreaId;
      let areasForRequests = purchaseAreas;
      if (refreshAll) {
        const shell = await loadOverviewShell(areaId);
        resolvedAreaId = shell.areaId;
        areasForRequests = shell.areas;
      }
      await loadRequests(resolvedAreaId, areasForRequests);
    } catch (error) {
      const apiMessage = error?.response?.data?.message;
      const networkDown = !error?.response && (error?.code === 'ERR_NETWORK' || /network|failed to fetch|econnrefused/i.test(String(error?.message || '')));
      setMessage(
        apiMessage
          || (networkDown
            ? 'No hay conexión con el backend. Reinicia el servidor (npm run dev) e intenta de nuevo.'
            : 'No se pudo cargar recursos y gestion de compras.')
      );
    } finally {
      setShellLoading(false);
      setBackgroundLoading(false);
      setHasLoadedOnce(true);
    }
  };

  useEffect(() => {
    let cancelled = false;

    loadOverviewShell()
      .then((shell) => {
        if (cancelled) return;
        setShellLoading(false);
        setHasLoadedOnce(true);
        setBackgroundLoading(true);
        return loadRequests(shell.areaId, shell.areas);
      })
      .catch((error) => {
        if (cancelled) return;
        const apiMessage = error?.response?.data?.message;
        const networkDown = !error?.response && (error?.code === 'ERR_NETWORK' || /network|failed to fetch|econnrefused/i.test(String(error?.message || '')));
        setMessage(
          apiMessage
            || (networkDown
              ? 'No hay conexión con el backend. Reinicia el servidor (npm run dev) e intenta de nuevo.'
              : 'No se pudo cargar recursos y gestion de compras.')
        );
        setShellLoading(false);
      })
      .finally(() => {
        if (!cancelled) {
          setBackgroundLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const onSelectPurchaseArea = async (areaId) => {
    if (String(areaId) === String(activeAreaId)) {
      setActivePortalView(areaNavKey(areaId));
      return;
    }
    setActiveAreaId(areaId);
    setActivePortalView(areaNavKey(areaId));
    try {
      localStorage.setItem(ACTIVE_AREA_STORAGE_KEY, areaId);
    } catch {
      /* ignore */
    }
    setRequestItems([]);
    setRequestForm((current) => ({
      ...emptyRequestForm,
      requestType: current.requestType,
      serviceArea: resolveServiceAreaFromPurchaseArea(
        purchaseAreas.find((area) => String(area.id) === String(areaId))
      ),
    }));
    setMaterialSearch('');
    setHistoryFilter('all');
    closeModal();
    setBackgroundLoading(true);
    try {
      const shell = await loadOverviewShell(areaId);
      await loadRequests(shell.areaId, shell.areas);
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo cambiar de área.');
    } finally {
      setBackgroundLoading(false);
    }
  };

  const onNavigatePortal = (key) => {
    if (isComergioAcademySection(key)) {
      setActivePortalView(key);
      return;
    }
    const areaId = areaIdFromNavKey(key);
    if (areaId) {
      onSelectPurchaseArea(areaId);
      return;
    }
    setActivePortalView(key);
  };

  const onCreateItem = async (event) => {
    event.preventDefault();
    if (!itemForm.name.trim()) {
      setMessage('Escribe el nombre del material.');
      return;
    }
    if (!activeAreaId) {
      setMessage('Selecciona un área de compra antes de crear insumos.');
      return;
    }

    setSubmitting(true);
    try {
      await createHrSupplyItem({
        ...itemForm,
        areaId: activeAreaId,
        stock: Number(itemForm.stock || 0),
        minStock: Number(itemForm.minStock || 0),
        unitCost: Math.max(0, Number(itemForm.unitCost || 0)),
      });
      setItemForm(emptyItemForm);
      setMessage(`Material guardado en inventario de ${activeArea?.name || 'el área'}.`);
      closeModal();
      await loadData({ areaId: activeAreaId });
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo guardar el material.');
    } finally {
      setSubmitting(false);
    }
  };

  const onAdjustStockIn = async (event) => {
    event.preventDefault();
    if (!stockForm.itemId) {
      setMessage('Selecciona un material del inventario.');
      return;
    }
    const quantity = Math.max(1, Number(stockForm.quantity || 0));
    setSubmitting(true);
    try {
      await adjustHrSupplyItemStock(stockForm.itemId, {
        direction: 'in',
        quantity,
        notes: String(stockForm.notes || '').trim() || undefined,
      });
      setStockForm(emptyStockForm);
      setMessage('Inventario actualizado.');
      closeModal();
      await loadData({ areaId: activeAreaId });
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo agregar inventario.');
    } finally {
      setSubmitting(false);
    }
  };

  const onQuickHandout = async (event) => {
    event.preventDefault();
    if (!stockForm.itemId) {
      setMessage('Selecciona un material del inventario.');
      return;
    }
    if (!String(stockForm.receivedByName || '').trim()) {
      setMessage('Indica quién recibe el material.');
      return;
    }
    const quantity = Math.max(1, Number(stockForm.quantity || 0));
    setSubmitting(true);
    try {
      await adjustHrSupplyItemStock(stockForm.itemId, {
        direction: 'out',
        quantity,
        notes: String(stockForm.notes || '').trim() || undefined,
        receivedByName: String(stockForm.receivedByName || '').trim(),
      });
      setStockForm(emptyStockForm);
      setMessage('Entrega rápida registrada y stock actualizado.');
      closeModal();
      await loadData({ areaId: activeAreaId });
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo registrar la entrega.');
    } finally {
      setSubmitting(false);
    }
  };

  const onAddRequestItem = () => {
    const quantity = Math.max(1, Number(requestForm.quantity || 0));
    const selectedItem = items.find((item) => item.id === requestForm.itemId);
    const customName = String(requestForm.customName || materialSearch || '').trim();
    const unitCost = selectedItem
      ? Math.max(0, Number(selectedItem.unitCost || 0))
      : Math.max(0, Number(requestForm.unitCost || 0));

    if (!selectedItem && !(allowsCustomItems && customName)) {
      setMessage(allowsCustomItems
        ? 'Selecciona un material del catálogo o escribe el producto a comprar.'
        : 'Selecciona un material del inventario.');
      return;
    }

    const nextEntry = selectedItem
      ? {
        key: `catalog-${selectedItem.id}`,
        itemId: selectedItem.id,
        customName: '',
        name: selectedItem.name,
        unit: selectedItem.unit || requestForm.unit || 'unidad',
        unitCost,
        notes: String(requestForm.itemNotes || '').trim(),
        quantity,
      }
      : {
        key: `custom-${customName.toLowerCase()}`,
        itemId: '',
        customName,
        name: customName,
        unit: requestForm.unit || 'unidad',
        unitCost,
        notes: String(requestForm.itemNotes || '').trim(),
        quantity,
      };

    setRequestItems((current) => {
      const existing = current.find((entry) => entry.key === nextEntry.key);
      if (existing) {
        return current.map((entry) =>
          entry.key === nextEntry.key
            ? {
              ...entry,
              quantity: entry.quantity + quantity,
              notes: nextEntry.notes || entry.notes,
              unitCost: nextEntry.unitCost || entry.unitCost,
            }
            : entry
        );
      }
      return [...current, nextEntry];
    });
    setRequestForm((current) => ({
      ...current,
      itemId: '',
      customName: '',
      quantity: 1,
      unit: selectedItem?.unit || current.unit || 'unidad',
      unitCost: 0,
      itemNotes: '',
    }));
    setMaterialSearch('');
  };

  const onResetRequestForm = () => {
    setRequestForm({
      ...emptyRequestForm,
      serviceArea: isTeacher ? 'teaching' : resolveServiceAreaFromPurchaseArea(activeArea),
      needCategory: isTeacher ? 'classroom' : 'other',
      requestType: isTeacher ? 'material' : 'purchase',
    });
    setRequestItems([]);
    setMaterialSearch('');
    setMessage('');
  };

  const onCreateRequest = async (event) => {
    event.preventDefault();
    if (!requestItems.length) {
      setMessage('Agrega al menos un producto o material a la solicitud.');
      return;
    }
    if (!String(requestForm.purpose || '').trim()) {
      setMessage('Describe el motivo o justificación de la solicitud.');
      return;
    }
    if (!isTeacher && !activeAreaId) {
      setMessage('Selecciona un área de compra antes de crear la solicitud.');
      return;
    }

    setSubmitting(true);
    try {
      await createHrSupplyRequest({
        requestType: isTeacher ? 'material' : requestForm.requestType,
        serviceArea: isTeacher ? 'teaching' : resolveServiceAreaFromPurchaseArea(activeArea),
        needCategory: isTeacher ? 'classroom' : requestForm.needCategory,
        areaId: activeAreaId || undefined,
        requestedForArea: requestForm.requestedForArea,
        requestedForPerson: requestForm.requestedForPerson,
        purpose: requestForm.purpose,
        priority: requestForm.priority,
        neededByDate: requestForm.neededByDate || null,
        items: requestItems.map((entry) => ({
          itemId: entry.itemId || undefined,
          customName: entry.customName || undefined,
          quantity: entry.quantity,
          unit: entry.unit,
          unitCost: Math.max(0, Number(entry.unitCost || 0)),
          notes: entry.notes,
        })),
      });
      onResetRequestForm();
      setMessage(isTeacher ? 'Solicitud enviada a revisión.' : 'Solicitud enviada a gestión de compras.');
      closeModal();
      await loadData({ areaId: activeAreaId });
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo crear la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  const onApprove = async (request) => {
    setSubmitting(true);
    try {
      await approveHrSupplyRequest(request.id, {
        items: (request.items || []).map((entry) => ({ requestItemId: entry.id, itemId: entry.itemId, approvedQuantity: entry.quantity })),
      });
      setMessage('Solicitud aprobada.');
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo aprobar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitApproval = async (request) => {
    setSubmitting(true);
    try {
      await submitHrSupplyRequestForApproval(request.id, { reviewNotes: 'Revisada por recursos y gestion de compras' });
      setMessage('Solicitud enviada a rectoria o direccion para aprobacion.');
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo enviar la solicitud a aprobacion.');
    } finally {
      setSubmitting(false);
    }
  };

  const onReject = async (request) => {
    const rejectionReason = window.prompt('Motivo del rechazo');
    if (rejectionReason === null) return;

    setSubmitting(true);
    try {
      await rejectHrSupplyRequest(request.id, { rejectionReason });
      setMessage('Solicitud rechazada.');
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo rechazar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  };

  const onDeliver = async (request) => {
    const receivedByName = window.prompt('Nombre de quien recibe', request.requestedBy?.name || '');
    if (receivedByName === null) return;

    setSubmitting(true);
    try {
      await deliverHrSupplyRequest(request.id, {
        receivedByName,
        deliveryNotes: 'Entrega registrada desde RRHH',
        items: (request.items || []).map((entry) => ({
          requestItemId: entry.id,
          itemId: entry.itemId,
          deliveredQuantity: entry.approvedQuantity || entry.quantity,
        })),
      });
      setMessage('Entrega registrada y stock actualizado.');
      closeModal();
      await loadData();
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo registrar la entrega.');
    } finally {
      setSubmitting(false);
    }
  };

  const onAcceptPurchasing = async (request) => {
    setSubmitting(true);
    try {
      await acceptHrPurchasingRequest(request.id, {
        deliveryNotes: isPlannerConsolidateRequest(request)
          ? 'Despacho de materiales del planner consolidado confirmado por Recursos.'
          : request.requestType === 'purchase'
            ? 'Compra revisada y enviada a aprobación.'
            : 'Despacho confirmado por Recursos; stock descontado.',
      });
      setMessage(isPlannerConsolidateRequest(request)
        ? 'Despacho confirmado y stock descontado.'
        : request.requestType === 'purchase'
          ? 'Compra enviada a aprobación de rectoría o dirección.'
          : 'Despacho confirmado y stock descontado.');
      await loadData({ areaId: activeAreaId });
    } catch (error) {
      setMessage(error?.response?.data?.message || 'No se pudo confirmar el despacho.');
    } finally {
      setSubmitting(false);
    }
  };

  if (shellLoading && !hasLoadedOnce) {
    return <PortalBootSplash portal="recursos-humanos" />;
  }

  const schoolName = getSchoolDisplayName(user, 'Colegio');
  const portalLabel = isTeacher ? 'Materiales' : 'Recursos humanos';
  const operationsNavItems = [
    ...(purchaseAreas.length > 0
      ? purchaseAreas.map((area) => ({
        key: areaNavKey(area.id),
        label: area.name,
      }))
      : [{ key: 'operations', label: 'Operaciones' }]),
    {
      key: 'staff_announcements',
      label: (
        <>
          Comunicados internos
          <StaffAnnouncementsUnreadBadge count={staffAnnouncementsUnreadCount} />
        </>
      ),
    },
  ];
  const shellActiveKey = isOperationsPortalView(activePortalView) && activeAreaId
    ? areaNavKey(activeAreaId)
    : activePortalView;
  const showOperations = isOperationsPortalView(activePortalView);

  const renderRequestWorkflowActions = (request) => (
    <div className="hr-portal__request-actions">
      {canApprove && request.status === 'pending_approval' && (
        <>
          <button type="button" onClick={() => onApprove(request)} disabled={submitting}>Aprobar</button>
          <button type="button" className="danger" onClick={() => onReject(request)} disabled={submitting}>Rechazar</button>
        </>
      )}
      {canSubmitApproval && request.status === 'pending_hr_review' && (
        <button type="button" onClick={() => onSubmitApproval(request)} disabled={submitting}>Enviar a aprobación</button>
      )}
      {canAcceptPurchasing && request.status === 'pending_purchasing_review' && (
        <button type="button" onClick={() => onAcceptPurchasing(request)} disabled={submitting}>
          {request.requestType === 'purchase' ? 'Enviar compra a aprobación' : 'Confirmar despacho'}
        </button>
      )}
      {canDeliver && request.status === 'approved' && (
        <button type="button" onClick={() => onDeliver(request)} disabled={submitting}>
          {request.requestType === 'purchase' ? 'Registrar recepción de compra' : 'Registrar entrega'}
        </button>
      )}
    </div>
  );

  const renderRequestFormFields = () => (
    <form className="hr-portal__form" onSubmit={onCreateRequest}>
      {!isTeacher ? (
        <>
          <label>
            Tipo de solicitud
            <select
              value={requestForm.requestType}
              onChange={(event) => setRequestForm((current) => ({
                ...current,
                requestType: event.target.value,
                itemId: '',
                customName: '',
              }))}
            >
              {requestTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Categoría de necesidad
            <select value={requestForm.needCategory} onChange={(event) => setRequestForm((current) => ({ ...current, needCategory: event.target.value }))}>
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Prioridad
            <select value={requestForm.priority} onChange={(event) => setRequestForm((current) => ({ ...current, priority: event.target.value }))}>
              {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            Destino / zona
            <input
              value={requestForm.requestedForArea}
              onChange={(event) => setRequestForm((current) => ({ ...current, requestedForArea: event.target.value }))}
              placeholder="Baños, bodega, salones, portería..."
            />
          </label>
          <label>
            Responsable / destinatario
            <input
              value={requestForm.requestedForPerson}
              onChange={(event) => setRequestForm((current) => ({ ...current, requestedForPerson: event.target.value }))}
              placeholder="Nombre del encargado o área"
            />
          </label>
          <label>
            Fecha necesaria
            <input
              type="date"
              value={requestForm.neededByDate}
              onChange={(event) => setRequestForm((current) => ({ ...current, neededByDate: event.target.value }))}
            />
          </label>
          <p className="hr-portal__field-help hr-portal__field-wide">{selectedRequestTypeHelp}</p>
        </>
      ) : (
        <>
          <label>
            Área o curso
            <input value={requestForm.requestedForArea} onChange={(event) => setRequestForm((current) => ({ ...current, requestedForArea: event.target.value }))} placeholder="Primaria, grado 4, laboratorio" />
          </label>
          <label>
            Prioridad
            <select value={requestForm.priority} onChange={(event) => setRequestForm((current) => ({ ...current, priority: event.target.value }))}>
              {priorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </>
      )}

      <label className="hr-portal__field-wide">
        Motivo / justificación
        <textarea
          value={requestForm.purpose}
          onChange={(event) => setRequestForm((current) => ({ ...current, purpose: event.target.value }))}
          placeholder={isTeacher
            ? 'Actividad, clase, proyecto o motivo'
            : 'Ej: reponer jabón y bolsas para limpieza, cementar filtración del patio, comprar tornillos para mantenimiento...'}
        />
      </label>

      <div className="hr-portal__details">
        <p className="hr-portal__details-title">Productos o materiales</p>
        <div className={`hr-portal__request-picker${allowsCustomItems ? ' is-purchase' : ''}`}>
          <label className="hr-portal__picker-product">
            <span>{allowsCustomItems ? 'Producto' : 'Material'}</span>
            <input
              list="hr-material-options"
              value={materialSearch || selectedRequestItem?.name || requestForm.customName || ''}
              onChange={(event) => {
                const nextValue = event.target.value;
                setMaterialSearch(nextValue);
                const matched = activeItems.find((item) => String(item.name || '').toLowerCase() === nextValue.trim().toLowerCase());
                setRequestForm((current) => ({
                  ...current,
                  itemId: matched?.id || '',
                  customName: matched ? '' : nextValue,
                  unit: matched?.unit || current.unit || 'unidad',
                  unitCost: matched ? Number(matched.unitCost || 0) : current.unitCost,
                }));
              }}
              placeholder={allowsCustomItems ? 'Buscar en inventario o escribir producto nuevo...' : 'Buscar material del inventario...'}
            />
            <datalist id="hr-material-options">
              {filteredActiveItems.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.stock} {item.unit} · {formatCop(item.unitCost)} · {getCategoryLabel(item.category)}
                </option>
              ))}
            </datalist>
          </label>
          <label className="hr-portal__picker-qty">
            <span>Cantidad</span>
            <input type="number" min="1" value={requestForm.quantity} onChange={(event) => setRequestForm((current) => ({ ...current, quantity: event.target.value }))} placeholder="Cantidad" />
          </label>
          <label className="hr-portal__picker-unit">
            <span>Unidad</span>
            <select
              value={selectedRequestItem?.unit || requestForm.unit || 'unidad'}
              onChange={(event) => setRequestForm((current) => ({ ...current, unit: event.target.value }))}
              disabled={Boolean(selectedRequestItem)}
            >
              {[selectedRequestItem?.unit, ...unitOptions].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </label>
          {allowsCustomItems && !selectedRequestItem ? (
            <label className="hr-portal__picker-cost">
              <span>Costo unitario</span>
              <input
                type="number"
                min="0"
                step="100"
                value={requestForm.unitCost}
                onChange={(event) => setRequestForm((current) => ({ ...current, unitCost: event.target.value }))}
                placeholder="0"
              />
            </label>
          ) : null}
          <button className="hr-portal__add-item" type="button" onClick={onAddRequestItem}>
            <IconPlus />
            Agregar
          </button>
        </div>
        {allowsCustomItems ? (
          <label className="hr-portal__field-wide">
            Nota del producto (opcional)
            <input
              value={requestForm.itemNotes}
              onChange={(event) => setRequestForm((current) => ({ ...current, itemNotes: event.target.value }))}
              placeholder="Marca, referencia, medida, color..."
            />
          </label>
        ) : null}

        {requestItems.length > 0 ? (
          <>
            <div className="hr-portal__chips">
              {requestItems.map((entry) => (
                <button key={entry.key} type="button" onClick={() => setRequestItems((current) => current.filter((item) => item.key !== entry.key))}>
                  {entry.name} x{entry.quantity} {entry.unit}
                  {Number(entry.unitCost) > 0 ? ` · ${formatCop(entry.unitCost)}` : ''}
                  {entry.notes ? ` · ${entry.notes}` : ''}
                  {entry.itemId ? '' : ' · compra'}
                </button>
              ))}
            </div>
            <p className="hr-portal__request-total">
              Total estimado: <strong>{formatCop(requestEstimatedTotal)}</strong>
              {activeArea ? ` · Disponible área: ${formatCop(areaAvailable)}` : ''}
            </p>
          </>
        ) : (
          <p className="hr-portal__empty">Agrega jabón, bolsas, cemento, tornillos, papelería u otros productos según la necesidad.</p>
        )}
      </div>

      <div className="hr-portal__form-actions">
        <button className="hr-portal__btn hr-portal__btn--ghost" type="button" onClick={() => { onResetRequestForm(); closeModal(); }} disabled={submitting}>
          Cancelar
        </button>
        <button className="hr-portal__btn hr-portal__btn--green" type="submit" disabled={submitting || (!isTeacher && !activeAreaId)}>
          <IconSend />
          {submitting ? 'Guardando...' : 'Enviar solicitud'}
        </button>
      </div>
    </form>
  );

  const renderModal = () => {
    if (!activeModal) return null;

    const titles = {
      'create-item': 'Crear insumo',
      'add-stock': 'Agregar inventario',
      'create-request': isTeacher ? 'Pedir material' : 'Crear solicitud',
      deliver: 'Entregar material',
    };

    return (
      <div className="hr-portal__modal" role="dialog" aria-modal="true" aria-label={titles[activeModal]}>
        <button className="hr-portal__modal-backdrop" type="button" aria-label="Cerrar" onClick={closeModal} />
        <div className="hr-portal__modal-panel">
          <div className="hr-portal__modal-header">
            <h2>{titles[activeModal]}</h2>
            <button className="hr-portal__modal-close" type="button" aria-label="Cerrar" onClick={closeModal}>
              <IconClose />
            </button>
          </div>

          {activeModal === 'create-item' ? (
            <form className="hr-portal__form" onSubmit={onCreateItem}>
              <label>
                Nombre
                <input value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} placeholder="Cartulina, foamy, videobeam..." />
              </label>
              <label>
                Categoría
                <select value={itemForm.category} onChange={(event) => setItemForm((current) => ({ ...current, category: event.target.value }))}>
                  {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                Tipo
                <select value={itemForm.itemType} onChange={(event) => setItemForm((current) => ({ ...current, itemType: event.target.value }))}>
                  <option value="consumable">Consumible</option>
                  <option value="asset">Activo</option>
                </select>
              </label>
              <label>
                Unidad
                <select value={itemForm.unit} onChange={(event) => setItemForm((current) => ({ ...current, unit: event.target.value }))}>
                  {unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </label>
              <label>
                Stock
                <input type="number" min="0" value={itemForm.stock} onChange={(event) => setItemForm((current) => ({ ...current, stock: event.target.value }))} />
              </label>
              <label>
                Mínimo
                <input type="number" min="0" value={itemForm.minStock} onChange={(event) => setItemForm((current) => ({ ...current, minStock: event.target.value }))} />
              </label>
              <label>
                Costo unitario
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={itemForm.unitCost}
                  onChange={(event) => setItemForm((current) => ({ ...current, unitCost: event.target.value }))}
                  placeholder="0"
                />
              </label>
              <label>
                Ubicación
                <input value={itemForm.location} onChange={(event) => setItemForm((current) => ({ ...current, location: event.target.value }))} placeholder="Bodega, sala sistemas..." />
              </label>
              <label>
                Código / SKU
                <input value={itemForm.sku} onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))} placeholder="Opcional" />
              </label>
              <div className="hr-portal__form-actions">
                <button className="hr-portal__btn hr-portal__btn--ghost" type="button" onClick={closeModal} disabled={submitting}>Cancelar</button>
                <button className="hr-portal__btn hr-portal__btn--blue" type="submit" disabled={submitting || !activeAreaId}>
                  <IconPlus />
                  {submitting ? 'Guardando...' : 'Crear insumo'}
                </button>
              </div>
            </form>
          ) : null}

          {activeModal === 'add-stock' ? (
            <form className="hr-portal__form hr-portal__form--single" onSubmit={onAdjustStockIn}>
              <label>
                Material
                <select value={stockForm.itemId} onChange={(event) => setStockForm((current) => ({ ...current, itemId: event.target.value }))}>
                  <option value="">Selecciona un material</option>
                  {activeItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · stock {item.stock} {item.unit}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cantidad a ingresar
                <input type="number" min="1" value={stockForm.quantity} onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))} />
              </label>
              <label>
                Notas (opcional)
                <input value={stockForm.notes} onChange={(event) => setStockForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Compra, donación, ajuste..." />
              </label>
              <div className="hr-portal__form-actions">
                <button className="hr-portal__btn hr-portal__btn--ghost" type="button" onClick={closeModal} disabled={submitting}>Cancelar</button>
                <button className="hr-portal__btn hr-portal__btn--blue" type="submit" disabled={submitting || !activeItems.length}>
                  <IconStockIn />
                  {submitting ? 'Guardando...' : 'Agregar inventario'}
                </button>
              </div>
            </form>
          ) : null}

          {activeModal === 'create-request' ? renderRequestFormFields() : null}

          {activeModal === 'deliver' ? (
            <div className="hr-portal__deliver">
              <div className="hr-portal__segmented" role="tablist" aria-label="Modo de entrega">
                <button
                  type="button"
                  className={deliverMode === 'request' ? 'is-active' : ''}
                  onClick={() => setDeliverMode('request')}
                >
                  Solicitudes aprobadas
                </button>
                <button
                  type="button"
                  className={deliverMode === 'quick' ? 'is-active' : ''}
                  onClick={() => setDeliverMode('quick')}
                >
                  Entrega rápida
                </button>
              </div>

              {deliverMode === 'request' ? (
                <div className="hr-portal__deliver-list">
                  {approvedPendingDeliveries.length === 0 ? (
                    <p className="hr-portal__empty">No hay solicitudes aprobadas pendientes de entrega en esta área.</p>
                  ) : (
                    approvedPendingDeliveries.map((request) => (
                      <article key={request.id} className="hr-portal__history-card">
                        <div className="hr-portal__history-main">
                          <div>
                            <span className="hr-portal__kind-badge is-request">{statusLabels[request.status]}</span>
                            <h3>{requestTypeLabels[request.requestType] || 'Solicitud'}</h3>
                            <p>{getRequestItemsLabel(request)}</p>
                            <p className="hr-portal__request-context">
                              {[request.requestedForPerson, request.requestedForArea, request.requestedBy?.name].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <div className="hr-portal__request-meta">
                            <span>{formatDate(request.createdAt)}</span>
                          </div>
                        </div>
                        {canDeliver ? (
                          <div className="hr-portal__request-actions">
                            <button type="button" onClick={() => onDeliver(request)} disabled={submitting}>
                              {request.requestType === 'purchase' ? 'Registrar recepción' : 'Registrar entrega'}
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              ) : (
                <form className="hr-portal__form hr-portal__form--single" onSubmit={onQuickHandout}>
                  <label>
                    Material
                    <select value={stockForm.itemId} onChange={(event) => setStockForm((current) => ({ ...current, itemId: event.target.value }))}>
                      <option value="">Selecciona un material</option>
                      {activeItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · stock {item.stock} {item.unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cantidad
                    <input type="number" min="1" value={stockForm.quantity} onChange={(event) => setStockForm((current) => ({ ...current, quantity: event.target.value }))} />
                  </label>
                  <label>
                    Quien recibe
                    <input value={stockForm.receivedByName} onChange={(event) => setStockForm((current) => ({ ...current, receivedByName: event.target.value }))} placeholder="Nombre del receptor" />
                  </label>
                  <label>
                    Notas (opcional)
                    <input value={stockForm.notes} onChange={(event) => setStockForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Motivo o destino" />
                  </label>
                  <div className="hr-portal__form-actions">
                    <button className="hr-portal__btn hr-portal__btn--ghost" type="button" onClick={closeModal} disabled={submitting}>Cancelar</button>
                    <button className="hr-portal__btn hr-portal__btn--green" type="submit" disabled={submitting || !activeItems.length}>
                      <IconTruck />
                      {submitting ? 'Guardando...' : 'Entregar'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <StaffPortalShell
      activeKey={shellActiveKey}
      navItems={operationsNavItems}
      navLabel="Operaciones"
      onNavigate={onNavigatePortal}
      onRefresh={() => loadData()}
      portalLabel={portalLabel}
      refreshDisabled={shellLoading || backgroundLoading}
      refreshLabel={backgroundLoading ? 'Completando carga...' : 'Actualizar'}
      schoolName={schoolName}
      userName={user?.name || user?.username || 'Usuario'}
    >
      <div className="hr-portal">
        {message && <div className="hr-portal__notice">{message}</div>}

        {isComergioAcademySection(activePortalView) ? (
          <ComergioAcademyPanel
            activeKey={activePortalView}
            className="hr-portal__panel"
            onNavigate={setActivePortalView}
            showLandingCards={false}
          />
        ) : null}

        {activePortalView === 'staff_announcements' ? (
          <StaffAnnouncementsPanel
            className="hr-portal__panel"
            description="Envía y recibe mensajes internos del colegio. Selecciona a quién va dirigido cada comunicado."
            mode="manage"
            title="Comunicados internos"
          />
        ) : null}

        {showOperations ? (
          <>
            {!isTeacher && purchaseAreas.length === 0 ? (
              <section className="hr-portal__area-bar" aria-label="Áreas de compra">
                <div className="hr-portal__area-bar-copy">
                  <strong>Áreas de compra</strong>
                  <p className="hr-portal__area-empty">
                    No se cargaron las áreas. Pulsa Actualizar. Si el backend estaba reiniciando tras el upgrade a M10, espera unos segundos e inténtalo de nuevo.
                  </p>
                </div>
              </section>
            ) : null}

            {isManager && purchaseAreas.length > 0 ? (
              <section className="hr-portal__kpis" aria-label="Resumen del área de compra">
                {kpiCards.map((card) => (
                  <article className="hr-portal__kpi" key={card.key}>
                    <span className={`hr-portal__kpi-icon is-${card.tone}`} aria-hidden="true">{card.icon}</span>
                    <div className="hr-portal__kpi-copy">
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                      <small>{card.meta}</small>
                    </div>
                  </article>
                ))}
              </section>
            ) : null}

            {isTeacher ? (
              <section className="hr-portal__actions hr-portal__actions--teacher" aria-label="Acciones">
                <button type="button" className="hr-portal__action-btn is-green" onClick={() => openModal('create-request')}>
                  <span className="hr-portal__action-icon" aria-hidden="true"><IconSend /></span>
                  <span>Pedir material</span>
                </button>
              </section>
            ) : isManager ? (
              <section className="hr-portal__actions" aria-label="Acciones del área">
                <button type="button" className="hr-portal__action-btn is-blue" onClick={() => openModal('create-item')} disabled={!activeAreaId}>
                  <span className="hr-portal__action-icon" aria-hidden="true"><IconPlus /></span>
                  <span>Crear insumo</span>
                </button>
                <button type="button" className="hr-portal__action-btn is-amber" onClick={() => openModal('add-stock')} disabled={!activeAreaId}>
                  <span className="hr-portal__action-icon" aria-hidden="true"><IconStockIn /></span>
                  <span>Agregar inventario</span>
                </button>
                <button type="button" className="hr-portal__action-btn is-green" onClick={() => openModal('create-request')} disabled={!activeAreaId}>
                  <span className="hr-portal__action-icon" aria-hidden="true"><IconClipboard /></span>
                  <span>Crear solicitud</span>
                </button>
                <button type="button" className="hr-portal__action-btn is-purple" onClick={() => openModal('deliver')} disabled={!activeAreaId}>
                  <span className="hr-portal__action-icon" aria-hidden="true"><IconTruck /></span>
                  <span>Entregar material</span>
                </button>
              </section>
            ) : (
              <section className="hr-portal__actions hr-portal__actions--teacher" aria-label="Acciones">
                <button type="button" className="hr-portal__action-btn is-green" onClick={() => openModal('create-request')} disabled={!activeAreaId}>
                  <span className="hr-portal__action-icon" aria-hidden="true"><IconSend /></span>
                  <span>Crear solicitud</span>
                </button>
              </section>
            )}

            {isManager && showPlannerDispatchPanel ? (
              <section className="hr-portal__panel hr-portal__planners">
                <div className="hr-portal__panel-heading">
                  <div className="hr-portal__panel-heading-main">
                    <span className="hr-portal__panel-icon is-green" aria-hidden="true"><IconClipboard /></span>
                    <div>
                      <h2>Pendientes de despacho</h2>
                      <p>
                        Materiales consolidados desde Rectoría / coordinación para entregar desde inventario.
                        {pendingPlannerConsolidates.length
                          ? ` ${pendingPlannerConsolidates.length} pendiente(s).`
                          : ' No hay despachos pendientes.'}
                      </p>
                    </div>
                  </div>
                </div>

                {plannerConsolidates.length === 0 ? (
                  <p className="hr-portal__empty">
                    Cuando Rectoría consolide y envíe planners, aparecerán aquí con la tabla de materiales para confirmar el despacho.
                  </p>
                ) : (
                  <div className="hr-portal__planner-list">
                    {plannerConsolidates.map((request) => {
                      const materialRows = getConsolidateMaterialRows(request);
                      const pending = request.status === 'pending_purchasing_review';
                      return (
                        <article key={request.id} className={`hr-portal__planner-card${pending ? ' is-pending' : ''}`}>
                          <div className="hr-portal__planner-card-head">
                            <div>
                              <div className="hr-portal__history-badges">
                                <span className="hr-portal__kind-badge is-request">Consolidado</span>
                                <span className="hr-portal__badge">{statusLabels[request.status] || request.status}</span>
                              </div>
                              <h3>
                                {request.plannerCycle?.title
                                  || request.requestedForArea
                                  || `Consolidado de ${request.consolidatedFromRequestIds.length} planner(s)`}
                              </h3>
                              <p className="hr-portal__request-context">
                                {[
                                  `${request.consolidatedFromRequestIds.length} planner(s) docentes`,
                                  request.requestedBy?.name ? `Enviado por ${request.requestedBy.name}` : null,
                                  formatDate(request.submittedToPurchasingAt || request.createdAt),
                                ].filter(Boolean).join(' · ')}
                              </p>
                              {request.purpose ? <p className="hr-portal__request-purpose">{request.purpose}</p> : null}
                            </div>
                            {canAcceptPurchasing && pending ? (
                              <button
                                type="button"
                                className="hr-portal__btn hr-portal__btn--green"
                                disabled={submitting}
                                onClick={() => onAcceptPurchasing(request)}
                              >
                                <IconTruck />
                                Confirmar despacho
                              </button>
                            ) : null}
                          </div>

                          {materialRows.length === 0 ? (
                            <p className="hr-portal__empty">Este consolidado no tiene materiales.</p>
                          ) : (
                            <div className="hr-portal__inventory-table-wrap">
                              <table className="hr-portal__inventory-table hr-portal__planner-table">
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    <th>Material</th>
                                    <th>Cantidad</th>
                                    <th>Unidad</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {materialRows.map((row, index) => (
                                    <tr key={row.id}>
                                      <td className="is-muted">{index + 1}</td>
                                      <td><strong>{row.name}</strong></td>
                                      <td><strong>{row.quantity}</strong></td>
                                      <td>{row.unit}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}

            {isManager && isNursingArea ? (
              <section className="hr-portal__panel hr-portal__planners">
                <div className="hr-portal__panel-heading">
                  <div className="hr-portal__panel-heading-main">
                    <span className="hr-portal__panel-icon is-green" aria-hidden="true"><IconClipboard /></span>
                    <div>
                      <h2>Solicitudes de Enfermería</h2>
                      <p>
                        Pedidos de compra e insumos enviados desde el portal de Enfermería.
                        {pendingNursingRequests.length
                          ? ` ${pendingNursingRequests.length} pendiente(s) de gestión.`
                          : ' No hay solicitudes pendientes.'}
                      </p>
                    </div>
                  </div>
                </div>

                {nursingIncomingRequests.length === 0 ? (
                  <p className="hr-portal__empty">
                    Cuando Enfermería cree una solicitud de compra, aparecerá aquí para que Recursos la gestione.
                  </p>
                ) : (
                  <div className="hr-portal__planner-list">
                    {nursingIncomingRequests.map((request) => {
                      const materialRows = getConsolidateMaterialRows(request);
                      const pending = request.status === 'pending_purchasing_review'
                        || request.status === 'pending_hr_review'
                        || request.status === 'pending_approval';
                      return (
                        <article key={request.id} className={`hr-portal__planner-card${pending ? ' is-pending' : ''}`}>
                          <div className="hr-portal__planner-card-head">
                            <div>
                              <div className="hr-portal__history-badges">
                                <span className="hr-portal__kind-badge is-request">Enfermería</span>
                                <span className="hr-portal__badge">{statusLabels[request.status] || request.status}</span>
                              </div>
                              <h3>{requestTypeLabels[request.requestType] || 'Solicitud'}</h3>
                              <p className="hr-portal__request-context">
                                {[
                                  request.requestedBy?.name ? `Enviado por ${request.requestedBy.name}` : null,
                                  request.requestedForPerson || null,
                                  request.priority ? `Prioridad ${priorityOptions.find((option) => option.value === request.priority)?.label || request.priority}` : null,
                                  formatDate(request.createdAt),
                                ].filter(Boolean).join(' · ')}
                              </p>
                              {request.purpose ? <p className="hr-portal__request-purpose">{request.purpose}</p> : null}
                              {Number(request.estimatedTotal) > 0 ? (
                                <p className="hr-portal__request-total">
                                  Total estimado: <strong>{formatCop(request.estimatedTotal)}</strong>
                                </p>
                              ) : null}
                            </div>
                            {renderRequestWorkflowActions(request)}
                          </div>

                          {materialRows.length === 0 ? (
                            <p className="hr-portal__empty">Esta solicitud no tiene materiales.</p>
                          ) : (
                            <div className="hr-portal__inventory-table-wrap">
                              <table className="hr-portal__inventory-table hr-portal__planner-table">
                                <thead>
                                  <tr>
                                    <th>#</th>
                                    <th>Material</th>
                                    <th>Cantidad</th>
                                    <th>Unidad</th>
                                    <th>Costo</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {materialRows.map((row, index) => (
                                    <tr key={row.id}>
                                      <td className="is-muted">{index + 1}</td>
                                      <td><strong>{row.name}</strong></td>
                                      <td><strong>{row.quantity}</strong></td>
                                      <td>{row.unit}</td>
                                      <td>{row.unitCost > 0 ? formatCop(row.unitCost) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}

            {isManager ? (
              <section className="hr-portal__panel hr-portal__inventory">
                <div className="hr-portal__panel-heading">
                  <div className="hr-portal__panel-heading-main">
                    <span className="hr-portal__panel-icon is-blue" aria-hidden="true"><IconBox /></span>
                    <div>
                      <h2>Inventario {activeArea ? `· ${activeArea.name}` : 'institucional'}</h2>
                      <p>Catálogo completo, stock y costo unitario de esta área.</p>
                    </div>
                  </div>
                </div>

                {items.length === 0 ? (
                  <p className="hr-portal__inventory-empty">
                    {activeArea
                      ? `Todavía no hay materiales en el inventario de ${activeArea.name}.`
                      : 'Todavía no hay materiales en el inventario.'}
                  </p>
                ) : (
                  <div className="hr-portal__inventory-table-wrap">
                    <table className="hr-portal__inventory-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Nombre</th>
                          <th>Categoría</th>
                          <th>Tipo</th>
                          <th>Unidad</th>
                          <th>Stock</th>
                          <th>Mínimo</th>
                          <th>Costo</th>
                          <th>Ubicación</th>
                          <th>SKU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => (
                          <tr key={item.id} className={item.lowStock ? 'is-low' : ''}>
                            <td className="is-muted">{index + 1}</td>
                            <td><strong>{item.name}</strong></td>
                            <td>{getCategoryLabel(item.category)}</td>
                            <td>{item.itemType === 'asset' ? 'Activo' : 'Consumible'}</td>
                            <td>{item.unit}</td>
                            <td><strong>{item.stock}</strong></td>
                            <td>{item.minStock}</td>
                            <td>{formatCop(item.unitCost)}</td>
                            <td className="is-muted">{item.location || '—'}</td>
                            <td className="is-muted">{item.sku || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null}

            <section className="hr-portal__panel hr-portal__history">
              <div className="hr-portal__panel-heading">
                <div className="hr-portal__panel-heading-main">
                  <span className="hr-portal__panel-icon is-blue" aria-hidden="true"><IconClipboard /></span>
                  <div>
                    <h2>{isTeacher ? 'Mis solicitudes' : `Historial${activeArea ? ` · ${activeArea.name}` : ''}`}</h2>
                    <p>
                      {isTeacher
                        ? 'Seguimiento de tus pedidos de material.'
                        : 'Solicitudes, ingresos de inventario y entregas de material.'}
                    </p>
                  </div>
                </div>
                {!isTeacher ? (
                  <div className="hr-portal__filter-chips" role="tablist" aria-label="Filtrar historial">
                    {historyFilterOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={historyFilter === option.value ? 'is-active' : ''}
                        onClick={() => setHistoryFilter(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="hr-portal__history-list">
                {backgroundLoading ? (
                  <p className="hr-portal__empty">Cargando historial...</p>
                ) : historyEntries.length === 0 ? (
                  <p className="hr-portal__empty">
                    {isTeacher ? 'No hay solicitudes registradas.' : 'No hay movimientos registrados en esta área.'}
                  </p>
                ) : (
                  <div className="hr-portal__inventory-table-wrap hr-portal__history-table-wrap">
                    <table className="hr-portal__inventory-table hr-portal__history-table">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Tipo</th>
                          <th>Estado</th>
                          <th>Movimiento</th>
                          <th>Materiales</th>
                          <th>Contexto</th>
                          <th>Solicitante</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyEntries.map(({ request, kind, kindLabel, sortAt }) => (
                          <tr key={request.id} className={`status-${request.status}`}>
                            <td className="is-muted hr-portal__history-table__date">
                              {formatDate(sortAt || request.deliveredAt || request.updatedAt || request.createdAt)}
                            </td>
                            <td>
                              <span className={`hr-portal__kind-badge is-${kind === 'request' ? 'request' : kind === 'stock_in' ? 'stock' : 'delivery'}`}>
                                {kindLabel}
                              </span>
                            </td>
                            <td>
                              <span className="hr-portal__badge">{statusLabels[request.status] || request.status}</span>
                            </td>
                            <td>
                              <strong>{getHistoryMovementLabel(request)}</strong>
                              {request.purpose ? (
                                <div className="hr-portal__history-table__purpose">{request.purpose}</div>
                              ) : null}
                              {Number(request.estimatedTotal) > 0 ? (
                                <div className="hr-portal__request-estimate">Total: {formatCop(request.estimatedTotal)}</div>
                              ) : null}
                            </td>
                            <td>{renderHistoryMaterials(request)}</td>
                            <td className="hr-portal__history-table__context">
                              {[
                                request.area?.name,
                                getServiceAreaLabel(request.serviceArea),
                                getCategoryLabel(request.needCategory),
                                request.requestedForArea,
                                request.requestedForPerson,
                              ].filter(Boolean).join(' · ') || '—'}
                            </td>
                            <td className="is-muted">{request.requestedBy?.name || 'Usuario'}</td>
                            <td className="hr-portal__history-table__actions">
                              {renderRequestWorkflowActions(request)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {renderModal()}
          </>
        ) : null}
      </div>
    </StaffPortalShell>
  );
}

export default HumanResourcesPortal;
