const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const HrPlannerCycle = require('../models/hrPlannerCycle.model');
const HrPurchaseArea = require('../models/hrPurchaseArea.model');
const HrSupplyItem = require('../models/hrSupplyItem.model');
const HrSupplyRequest = require('../models/hrSupplyRequest.model');
const User = require('../models/user.model');
const { queueNotificationsForParents } = require('../services/notification.service');
const { publishPlannerAsStaffAnnouncement } = require('../services/staffAnnouncement.service');

const router = express.Router();

router.use(authMiddleware);

const hrManagerRoles = ['human_resources', 'admin', 'rectoria', 'direccion'];
const coordinationRoles = ['coordination', 'admin', 'rectoria', 'direccion'];
const nursingSupplyRoles = ['nursing'];
const requesterRoles = ['teacher', 'human_resources', 'coordination', 'admin', 'rectoria', 'direccion', ...nursingSupplyRoles];
const itemWriteRoles = [...hrManagerRoles, ...nursingSupplyRoles];
const approvalRoles = ['rectoria', 'direccion', 'admin'];
const deliveryRoles = ['human_resources', 'admin'];
const categories = ['stationery', 'classroom', 'sports', 'technology', 'laboratory', 'music', 'maintenance', 'cleaning', 'construction', 'furniture', 'cafeteria', 'nursing', 'security', 'admin', 'other'];
const itemTypes = ['consumable', 'asset'];
const priorities = ['low', 'medium', 'high', 'urgent'];
const statuses = ['pending_coordination_review', 'consolidated', 'pending_hr_review', 'pending_purchasing_review', 'pending_approval', 'approved', 'rejected', 'delivered', 'partially_delivered', 'cancelled'];
const requestTypes = ['material', 'purchase', 'replenishment'];
const serviceAreas = ['teaching', 'cleaning', 'maintenance', 'administration', 'cafeteria', 'nursing', 'sports', 'technology', 'security', 'general'];
const areaManagerRoles = ['rectoria', 'direccion', 'admin'];

const DEFAULT_PURCHASE_AREAS = [
  { key: 'cleaning', name: 'Limpieza', order: 10 },
  { key: 'maintenance', name: 'Mantenimiento', order: 20 },
  { key: 'teaching', name: 'Academia', order: 30 },
  { key: 'administration', name: 'Administración', order: 40 },
  { key: 'cafeteria', name: 'Cafetería', order: 50 },
  { key: 'nursing', name: 'Enfermería', order: 60 },
  { key: 'sports', name: 'Deportes', order: 70 },
  { key: 'technology', name: 'Tecnología', order: 80 },
  { key: 'security', name: 'Seguridad', order: 90 },
  { key: 'general', name: 'General', order: 100 },
];

const LEGACY_AREA_KEY_ALIASES = {
  academia: 'teaching',
  limpieza: 'cleaning',
  mantenimiento: 'maintenance',
  administracion: 'administration',
};

function supplyItemQuery(filter = {}) {
  return {
    ...filter,
    hrEntity: { $ne: 'purchase_area' },
  };
}

function isCollectionLimitError(error) {
  return /already using \d+ collections of \d+/i.test(String(error?.message || error || ''));
}

function isNursingSupplyRole(role) {
  return nursingSupplyRoles.includes(normalizeText(role));
}

async function resolveAreaByKey(schoolId, key, { createdByUserId = null } = {}) {
  const areas = await ensurePurchaseAreas(schoolId, { createdByUserId });
  return areas.find((area) => normalizeText(area.key) === normalizeText(key) && area.status === 'active') || null;
}

async function resolveNursingPurchaseArea(schoolId, { createdByUserId = null } = {}) {
  return resolveAreaByKey(schoolId, 'nursing', { createdByUserId });
}

function normalizeText(value) {
  return String(value || '').trim();
}

/** Calendar dates from <input type="date"> (YYYY-MM-DD) must not use Date(string) UTC midnight. */
function parsePlannerCalendarDate(value) {
  const raw = normalizeText(value);
  if (!raw) {
    return null;
  }

  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    // Noon UTC keeps the calendar day stable in Colombia (UTC-5) and similar zones.
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 12, 0, 0, 0));
}

function assertPlannerDateRange(startDate, endDate) {
  if (startDate && endDate && endDate.getTime() < startDate.getTime()) {
    const error = new Error('La fecha "Hasta" debe ser igual o posterior a la fecha "Desde".');
    error.statusCode = 400;
    throw error;
  }
}

function escapeRegex(value) {
  return normalizeText(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function safeEnum(value, allowedValues, fallback) {
  const normalized = normalizeText(value);
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function serializeUser(user) {
  if (!user?._id) {
    return null;
  }

  return {
    id: String(user._id),
    name: normalizeText(user.name),
    username: normalizeText(user.username),
    role: normalizeText(user.role),
  };
}

function slugifyAreaKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'area';
}

function serializePurchaseArea(area) {
  if (!area) return null;
  const budgetAmount = Math.max(0, Number(area.budgetAmount || 0));
  const spentAmount = Math.max(0, Number(area.spentAmount || 0));
  return {
    id: String(area._id),
    name: normalizeText(area.name),
    key: normalizeText(area.key),
    budgetAmount,
    spentAmount,
    availableAmount: Math.max(0, budgetAmount - spentAmount),
    status: normalizeText(area.status) || 'active',
    order: Number(area.order || 0),
    createdAt: area.createdAt,
    updatedAt: area.updatedAt,
  };
}

async function ensurePurchaseAreas(schoolId, { createdByUserId = null } = {}) {
  // Migrate areas that were temporarily stored inside hrsupplyitems (Atlas Free/Flex 500-cap workaround).
  try {
    const embeddedAreas = await HrSupplyItem.collection.find({ schoolId, hrEntity: 'purchase_area' }).toArray();
    if (embeddedAreas.length) {
      for (const area of embeddedAreas) {
        const payload = {
          _id: area._id,
          schoolId: area.schoolId,
          name: area.name,
          key: area.key,
          budgetAmount: Math.max(0, Number(area.budgetAmount || 0)),
          spentAmount: Math.max(0, Number(area.spentAmount || 0)),
          status: area.status === 'archived' ? 'archived' : 'active',
          order: Number(area.order || 100),
          createdByUserId: area.createdByUserId || null,
          createdAt: area.createdAt,
          updatedAt: area.updatedAt || new Date(),
        };
        await HrPurchaseArea.collection.updateOne(
          { _id: area._id },
          { $set: payload },
          { upsert: true }
        );
      }
      await HrSupplyItem.collection.deleteMany({ schoolId, hrEntity: 'purchase_area' });
    }
  } catch (error) {
    if (!isCollectionLimitError(error)) {
      console.warn(`[HR_AREAS_MIGRATE_WARNING] school=${schoolId} error=${error.message}`);
    }
  }

  let existing = [];
  try {
    existing = await HrPurchaseArea.find({ schoolId }).sort({ order: 1, name: 1 }).lean();
  } catch (error) {
    if (isCollectionLimitError(error)) {
      throw new Error(
        'MongoDB alcanzó el límite de colecciones del clúster. Con Atlas M10+ este límite duro ya no aplica; verifica que el upgrade terminó.'
      );
    }
    throw error;
  }

  const existingKeys = new Set(existing.map((area) => normalizeText(area.key)));

  // Keep legacy seeded keys (academia, limpieza, …) and only add missing modern keys.
  const toCreate = DEFAULT_PURCHASE_AREAS.filter((area) => {
    if (existingKeys.has(area.key)) return false;
    const legacyUsers = Object.entries(LEGACY_AREA_KEY_ALIASES)
      .filter(([, modernKey]) => modernKey === area.key)
      .map(([legacyKey]) => legacyKey);
    return !legacyUsers.some((legacyKey) => existingKeys.has(legacyKey));
  });

  if (toCreate.length) {
    try {
      await HrPurchaseArea.insertMany(toCreate.map((area) => ({
        schoolId,
        key: area.key,
        name: area.name,
        order: area.order,
        budgetAmount: 0,
        spentAmount: 0,
        status: 'active',
        createdByUserId: createdByUserId || null,
      })));
    } catch (error) {
      if (isCollectionLimitError(error)) {
        if (existing.length) return existing;
        throw new Error(
          'No se pudieron crear las áreas de compra por límite de colecciones. Confirma que el cluster ya está en M10.'
        );
      }
      if (error?.code !== 11000) throw error;
    }
  }

  const areas = await HrPurchaseArea.find({ schoolId }).sort({ order: 1, name: 1 });
  const generalArea = areas.find((area) => area.key === 'general') || areas[0];
  const academiaArea = areas.find((area) => area.key === 'teaching' || area.key === 'academia') || generalArea;

  if (academiaArea) {
    // Planners / consolidations belong to Academia so they appear in that HR tab.
    await HrSupplyRequest.updateMany(
      {
        schoolId,
        consolidatedFromRequestIds: { $exists: true, $ne: [] },
      },
      { $set: { areaId: academiaArea._id, serviceArea: 'teaching', needCategory: 'classroom' } }
    );
    await HrSupplyRequest.updateMany(
      {
        schoolId,
        plannerCycleId: { $ne: null },
        $or: [{ areaId: null }, { areaId: { $exists: false } }],
      },
      { $set: { areaId: academiaArea._id, serviceArea: 'teaching' } }
    );
  }

  if (generalArea) {
    await HrSupplyItem.updateMany(
      supplyItemQuery({ schoolId, $or: [{ areaId: null }, { areaId: { $exists: false } }] }),
      { $set: { areaId: generalArea._id, unitCost: 0 } }
    );
    await HrSupplyRequest.updateMany(
      { schoolId, $or: [{ areaId: null }, { areaId: { $exists: false } }] },
      { $set: { areaId: generalArea._id } }
    );
  }

  return areas;
}

function resolveServiceAreaFromPurchaseArea(area) {
  const key = normalizeText(area?.key);
  const modernKey = LEGACY_AREA_KEY_ALIASES[key] || key;
  return serviceAreas.includes(modernKey) ? modernKey : 'general';
}

function serializeItem(item) {
  if (!item) {
    return null;
  }

  return {
    id: String(item._id),
    areaId: String(item.areaId?._id || item.areaId || ''),
    name: normalizeText(item.name),
    category: normalizeText(item.category) || 'other',
    itemType: normalizeText(item.itemType) || 'consumable',
    unit: normalizeText(item.unit) || 'unidad',
    unitCost: Math.max(0, Number(item.unitCost || 0)),
    sku: normalizeText(item.sku),
    stock: Number(item.stock || 0),
    minStock: Number(item.minStock || 0),
    location: normalizeText(item.location),
    status: normalizeText(item.status) || 'active',
    notes: normalizeText(item.notes),
    lowStock: Number(item.stock || 0) <= Number(item.minStock || 0),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function serializePlannerCycle(cycle) {
  if (!cycle) {
    return null;
  }

  return {
    id: String(cycle._id),
    title: normalizeText(cycle.title),
    startDate: cycle.startDate || null,
    endDate: cycle.endDate || null,
    submissionDeadline: cycle.submissionDeadline || null,
    instructions: normalizeText(cycle.instructions),
    status: normalizeText(cycle.status) || 'active',
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
  };
}

function normalizePlannerActivities(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => {
      const dateValue = normalizeText(entry?.date);
      const parsedDate = dateValue ? new Date(dateValue) : null;
      const quantity = Math.max(0, Number(entry?.quantity || 0));
      return {
        date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
        title: normalizeText(entry?.title),
        description: normalizeText(entry?.description),
        subject: normalizeText(entry?.subject),
        grade: normalizeText(entry?.grade),
        courseLabel: normalizeText(entry?.courseLabel || entry?.course),
        materialName: normalizeText(entry?.materialName || entry?.material),
        quantity: Number.isFinite(quantity) ? quantity : 0,
        purpose: normalizeText(entry?.purpose),
      };
    })
    .filter((entry) => entry.date && entry.title);
}

function isPlannerDeadlineOpen(cycle) {
  if (!cycle?.submissionDeadline) {
    return true;
  }
  const deadline = new Date(cycle.submissionDeadline);
  if (Number.isNaN(deadline.getTime())) {
    return true;
  }
  const endOfDeadlineDay = new Date(Date.UTC(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth(),
    deadline.getUTCDate(),
    23,
    59,
    59,
    999,
  ));
  return Date.now() <= endOfDeadlineDay.getTime();
}

function buildRequestItemsFromPayload(rawItems = [], plannerActivities = [], noMaterialsNeeded = false) {
  if (noMaterialsNeeded) {
    return [];
  }

  const fromPayload = (Array.isArray(rawItems) ? rawItems : [])
    .map((entry) => {
      const quantity = Math.max(1, Number(entry.quantity || 0));
      const unitCost = Math.max(0, Number(entry.unitCost || 0));
      return {
        itemId: isValidObjectId(entry.itemId) ? entry.itemId : null,
        customName: isValidObjectId(entry.itemId) ? '' : normalizeText(entry.customName || entry.materialName || entry.name),
        unit: normalizeText(entry.unit),
        notes: normalizeText(entry.notes),
        unitCost,
        lineTotal: quantity * unitCost,
        quantity,
      };
    })
    .filter((entry) => entry.quantity > 0 && (entry.itemId || entry.customName));

  if (fromPayload.length) {
    return fromPayload;
  }

  const aggregated = new Map();
  plannerActivities.forEach((activity) => {
    const materialName = normalizeText(activity.materialName);
    const quantity = Math.max(1, Number(activity.quantity || 0));
    if (!materialName || quantity <= 0) {
      return;
    }
    const key = materialName.toLowerCase();
    const current = aggregated.get(key) || { itemId: null, customName: materialName, unit: '', notes: '', unitCost: 0, lineTotal: 0, quantity: 0 };
    current.quantity += quantity;
    current.lineTotal = current.quantity * current.unitCost;
    aggregated.set(key, current);
  });

  return Array.from(aggregated.values());
}

function serializeRequest(request) {
  if (!request) {
    return null;
  }

  return {
    id: String(request._id),
    areaId: String(request.areaId?._id || request.areaId || ''),
    area: request.areaId?._id ? serializePurchaseArea(request.areaId) : null,
    requestType: normalizeText(request.requestType) || 'material',
    requestedBy: request.requestedByUserId?._id ? serializeUser(request.requestedByUserId) : null,
    plannerCycle: request.plannerCycleId?._id ? serializePlannerCycle(request.plannerCycleId) : null,
    plannerCycleId: String(request.plannerCycleId?._id || request.plannerCycleId || ''),
    plannerActivities: Array.isArray(request.plannerActivities)
      ? request.plannerActivities.map((activity) => ({
        id: String(activity._id || ''),
        date: activity.date || null,
        title: normalizeText(activity.title),
        description: normalizeText(activity.description),
        subject: normalizeText(activity.subject),
        grade: normalizeText(activity.grade),
        courseLabel: normalizeText(activity.courseLabel),
        materialName: normalizeText(activity.materialName),
        quantity: Number(activity.quantity || 0),
        purpose: normalizeText(activity.purpose),
      }))
      : [],
    noMaterialsNeeded: Boolean(request.noMaterialsNeeded),
    consolidatedFromRequestIds: Array.isArray(request.consolidatedFromRequestIds) ? request.consolidatedFromRequestIds.map((id) => String(id)) : [],
    consolidatedRequestId: String(request.consolidatedRequestId?._id || request.consolidatedRequestId || ''),
    serviceArea: normalizeText(request.serviceArea) || 'general',
    needCategory: normalizeText(request.needCategory) || 'other',
    requestedForArea: normalizeText(request.requestedForArea),
    requestedForPerson: normalizeText(request.requestedForPerson),
    purpose: normalizeText(request.purpose),
    neededByDate: request.neededByDate || null,
    estimatedTotal: Math.max(0, Number(request.estimatedTotal || 0)),
    approvedTotal: Math.max(0, Number(request.approvedTotal || 0)),
    budgetCharged: Boolean(request.budgetCharged),
    budgetChargedAt: request.budgetChargedAt || null,
    status: normalizeText(request.status) || 'pending_approval',
    priority: normalizeText(request.priority) || 'medium',
    items: Array.isArray(request.items)
      ? request.items.map((entry) => ({
        id: String(entry._id),
        itemId: String(entry.itemId?._id || entry.itemId || ''),
        item: entry.itemId?._id ? serializeItem(entry.itemId) : null,
        customName: normalizeText(entry.customName),
        unit: normalizeText(entry.unit) || normalizeText(entry.itemId?.unit) || 'unidad',
        notes: normalizeText(entry.notes),
        unitCost: Math.max(0, Number(entry.unitCost || entry.itemId?.unitCost || 0)),
        lineTotal: Math.max(0, Number(entry.lineTotal || (Number(entry.quantity || 0) * Number(entry.unitCost || entry.itemId?.unitCost || 0)))),
        quantity: Number(entry.quantity || 0),
        approvedQuantity: Number(entry.approvedQuantity || 0),
        deliveredQuantity: Number(entry.deliveredQuantity || 0),
      }))
      : [],
    approvedBy: request.approvedByUserId?._id ? serializeUser(request.approvedByUserId) : null,
    approvedAt: request.approvedAt || null,
    rejectedBy: request.rejectedByUserId?._id ? serializeUser(request.rejectedByUserId) : null,
    rejectedAt: request.rejectedAt || null,
    rejectionReason: normalizeText(request.rejectionReason),
    deliveredBy: request.deliveredByUserId?._id ? serializeUser(request.deliveredByUserId) : null,
    deliveredAt: request.deliveredAt || null,
    deliveryNotes: normalizeText(request.deliveryNotes),
    receivedByName: normalizeText(request.receivedByName),
    evidenceUrl: normalizeText(request.evidenceUrl),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

async function populateRequest(query) {
  return query
    .populate('areaId', 'name key budgetAmount spentAmount status order')
    .populate('requestedByUserId', 'name username role')
    .populate('plannerCycleId', 'title startDate endDate submissionDeadline instructions status')
    .populate('approvedByUserId', 'name username role')
    .populate('rejectedByUserId', 'name username role')
    .populate('deliveredByUserId', 'name username role')
    .populate('items.itemId', 'name category itemType unit unitCost sku stock minStock location status notes areaId');
}

async function populateRequestDocument(request) {
  await request.populate([
    { path: 'areaId', select: 'name key budgetAmount spentAmount status order' },
    { path: 'requestedByUserId', select: 'name username role' },
    { path: 'plannerCycleId', select: 'title startDate endDate submissionDeadline instructions status' },
    { path: 'approvedByUserId', select: 'name username role' },
    { path: 'rejectedByUserId', select: 'name username role' },
    { path: 'deliveredByUserId', select: 'name username role' },
    { path: 'items.itemId', select: 'name category itemType unit unitCost sku stock minStock location status notes areaId' },
  ]);
  return request;
}

async function notifyLeadership({ schoolId, title, body, payload }) {
  const leaders = await User.find({
    schoolId,
    role: { $in: ['rectoria', 'direccion', 'admin'] },
    status: 'active',
    deletedAt: null,
  }).select('_id').lean();
  const leaderIds = leaders.map((leader) => leader._id).filter(Boolean);

  if (!leaderIds.length) {
    return null;
  }

  return queueNotificationsForParents({ schoolId, parentIds: leaderIds, title, body, payload });
}

async function notifyHumanResources({ schoolId, title, body, payload }) {
  const hrUsers = await User.find({
    schoolId,
    role: { $in: ['human_resources', 'admin'] },
    status: 'active',
    deletedAt: null,
  }).select('_id').lean();
  const hrUserIds = hrUsers.map((user) => user._id).filter(Boolean);

  if (!hrUserIds.length) {
    return null;
  }

  return queueNotificationsForParents({ schoolId, parentIds: hrUserIds, title, body, payload });
}

async function notifyCoordination({ schoolId, title, body, payload }) {
  const users = await User.find({
    schoolId,
    role: { $in: ['coordination', 'admin', 'rectoria', 'direccion'] },
    status: 'active',
    deletedAt: null,
  }).select('_id').lean();
  const userIds = users.map((user) => user._id).filter(Boolean);

  if (!userIds.length) {
    return null;
  }

  return queueNotificationsForParents({ schoolId, parentIds: userIds, title, body, payload });
}

async function notifyUser({ schoolId, userId, title, body, payload }) {
  if (!userId) {
    return null;
  }

  return queueNotificationsForParents({ schoolId, parentIds: [userId], title, body, payload });
}

async function applyDeliveredStock({ request, deliveredItems }) {
  const deliveredByItemId = new Map(deliveredItems.map((entry) => [String(entry.requestItemId || entry.id || entry.itemId || ''), Number(entry.deliveredQuantity || 0)]));

  for (const requestItem of request.items) {
    const itemId = String(requestItem.itemId?._id || requestItem.itemId || '');
    const requestItemKey = itemId || String(requestItem._id || '');
    const deliveredQuantity = Math.min(Number(requestItem.approvedQuantity || requestItem.quantity || 0), Math.max(0, Number(deliveredByItemId.get(requestItemKey) || 0)));
    requestItem.deliveredQuantity = deliveredQuantity;

    if (!itemId) {
      continue;
    }

    if (deliveredQuantity > 0 && request.requestType === 'material') {
      const updatedItem = await HrSupplyItem.findOneAndUpdate(
        supplyItemQuery({ _id: itemId, schoolId: request.schoolId, stock: { $gte: deliveredQuantity } }),
        { $inc: { stock: -deliveredQuantity } },
        { new: true }
      );

      if (!updatedItem) {
        throw new Error(`Stock insuficiente para ${requestItem.itemId?.name || 'material solicitado'}`);
      }
    }

    if (deliveredQuantity > 0 && (request.requestType === 'replenishment' || request.requestType === 'purchase')) {
      await HrSupplyItem.updateOne(
        supplyItemQuery({ _id: itemId, schoolId: request.schoolId }),
        { $inc: { stock: deliveredQuantity } }
      );
    }
  }
}

router.get('/dashboard', roleMiddleware(hrManagerRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    await ensurePurchaseAreas(schoolId, { createdByUserId: req.user.userId });
    const areaId = isValidObjectId(req.query.areaId) ? req.query.areaId : null;
    const itemFilter = supplyItemQuery({ schoolId, status: 'active' });
    const requestFilter = { schoolId };
    if (areaId) {
      itemFilter.areaId = areaId;
      requestFilter.areaId = areaId;
    }

    const [items, pendingHrReviewCount, pendingApprovalCount, approvedCount, lowStockCount, recentRequests, areas] = await Promise.all([
      HrSupplyItem.find(itemFilter).sort({ name: 1 }).lean(),
      HrSupplyRequest.countDocuments({ ...requestFilter, status: 'pending_hr_review' }),
      HrSupplyRequest.countDocuments({ ...requestFilter, status: 'pending_approval' }),
      HrSupplyRequest.countDocuments({ ...requestFilter, status: 'approved' }),
      HrSupplyItem.countDocuments({ ...itemFilter, $expr: { $lte: ['$stock', '$minStock'] } }),
      populateRequest(HrSupplyRequest.find(requestFilter).sort({ updatedAt: -1 }).limit(8).lean()),
      HrPurchaseArea.find({ schoolId, status: 'active' }).sort({ order: 1, name: 1 }).lean(),
    ]);

    const selectedArea = areaId
      ? areas.find((area) => String(area._id) === String(areaId))
      : null;

    return res.status(200).json({
      summary: {
        totalItems: items.length,
        pendingCount: pendingHrReviewCount + pendingApprovalCount,
        pendingHrReviewCount,
        pendingApprovalCount,
        approvedCount,
        lowStockCount,
        assetCount: items.filter((item) => item.itemType === 'asset').length,
        budgetAmount: selectedArea ? Number(selectedArea.budgetAmount || 0) : areas.reduce((sum, area) => sum + Number(area.budgetAmount || 0), 0),
        spentAmount: selectedArea ? Number(selectedArea.spentAmount || 0) : areas.reduce((sum, area) => sum + Number(area.spentAmount || 0), 0),
      },
      areas: areas.map(serializePurchaseArea),
      selectedArea: serializePurchaseArea(selectedArea),
      recentRequests: recentRequests.map(serializeRequest),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/purchase-areas', roleMiddleware([...hrManagerRoles, 'coordination', 'teacher', ...nursingSupplyRoles]), async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const areas = await ensurePurchaseAreas(schoolId, { createdByUserId: userId });
    const includeArchived = String(req.query.includeArchived || '') === 'true';
    let filtered = includeArchived ? areas : areas.filter((area) => area.status === 'active');
    if (isNursingSupplyRole(role)) {
      filtered = filtered.filter((area) => normalizeText(area.key) === 'nursing');
    }
    return res.status(200).json({ areas: filtered.map(serializePurchaseArea) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/purchase-areas', roleMiddleware(areaManagerRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    await ensurePurchaseAreas(schoolId, { createdByUserId: userId });
    const name = normalizeText(req.body.name);
    if (!name) {
      return res.status(400).json({ message: 'El nombre del área es obligatorio.' });
    }

    const key = slugifyAreaKey(req.body.key || name);
    const existing = await HrPurchaseArea.findOne({ schoolId, key }).lean();
    if (existing) {
      return res.status(409).json({ message: 'Ya existe un área con ese identificador.' });
    }

    const area = await HrPurchaseArea.create({
      schoolId,
      name,
      key,
      budgetAmount: Math.max(0, Number(req.body.budgetAmount || 0)),
      spentAmount: 0,
      status: 'active',
      order: Number(req.body.order || ((await HrPurchaseArea.countDocuments({ schoolId })) + 1) * 10),
      createdByUserId: userId,
    });

    return res.status(201).json({ area: serializePurchaseArea(area) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Ya existe un área con ese identificador.' });
    }
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/purchase-areas/:id', roleMiddleware(areaManagerRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Área inválida.' });
    }

    const area = await HrPurchaseArea.findOne({ _id: id, schoolId });
    if (!area) {
      return res.status(404).json({ message: 'Área no encontrada.' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
      const name = normalizeText(req.body.name);
      if (!name) return res.status(400).json({ message: 'El nombre del área es obligatorio.' });
      area.name = name;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'budgetAmount')) {
      area.budgetAmount = Math.max(0, Number(req.body.budgetAmount || 0));
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'order')) {
      area.order = Number(req.body.order || area.order || 0);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      area.status = safeEnum(req.body.status, ['active', 'archived'], area.status);
    }

    await area.save();
    return res.status(200).json({ area: serializePurchaseArea(area) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/items', roleMiddleware(requesterRoles), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    await ensurePurchaseAreas(schoolId, { createdByUserId: userId });
    const q = normalizeText(req.query.q);
    const filter = supplyItemQuery({ schoolId });

    if (isNursingSupplyRole(role)) {
      const nursingArea = await resolveNursingPurchaseArea(schoolId, { createdByUserId: userId });
      if (!nursingArea) {
        return res.status(404).json({ message: 'Área de Enfermería no configurada.' });
      }
      filter.areaId = nursingArea._id;
    } else if (req.query.areaId) {
      if (!isValidObjectId(req.query.areaId)) {
        return res.status(400).json({ message: 'Área inválida.' });
      }
      filter.areaId = req.query.areaId;
    }
    if (req.query.status) {
      filter.status = safeEnum(req.query.status, ['active', 'inactive'], 'active');
    }
    if (req.query.category) {
      filter.category = safeEnum(req.query.category, categories, 'other');
    }
    if (q) {
      const regex = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: regex }, { sku: regex }, { location: regex }];
    }

    const items = await HrSupplyItem.find(filter).sort({ stock: 1, name: 1 }).limit(200).lean();
    return res.status(200).json({ items: items.map(serializeItem) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/planner-cycles', roleMiddleware(requesterRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const filter = { schoolId };
    if (req.query.status) filter.status = safeEnum(req.query.status, ['active', 'closed'], 'active');
    const cycles = await HrPlannerCycle.find(filter).sort({ submissionDeadline: -1, createdAt: -1 }).limit(50).lean();
    return res.status(200).json({ cycles: cycles.map(serializePlannerCycle) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/planner-cycles', roleMiddleware(coordinationRoles), async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const title = normalizeText(req.body.title);
    const parsedDeadline = parsePlannerCalendarDate(req.body.submissionDeadline);

    if (!title || !parsedDeadline) {
      return res.status(400).json({ message: 'title and submissionDeadline are required' });
    }

    const startDate = parsePlannerCalendarDate(req.body.startDate);
    const endDate = parsePlannerCalendarDate(req.body.endDate);
    assertPlannerDateRange(startDate, endDate);
    const cycle = await HrPlannerCycle.create({
      schoolId,
      title,
      startDate,
      endDate,
      submissionDeadline: parsedDeadline,
      instructions: normalizeText(req.body.instructions),
      status: safeEnum(req.body.status, ['active', 'closed'], 'active'),
      createdByUserId: userId,
    });

    let staffAnnouncement = null;
    const publishAsAnnouncement = req.body.publishAsAnnouncement === true
      || req.body.publishAsAnnouncement === 'true'
      || req.body.publishAsAnnouncement === 1
      || req.body.publishAsAnnouncement === '1';

    if (publishAsAnnouncement) {
      const sender = await User.findOne({ _id: userId, schoolId }).select('name username role').lean();
      staffAnnouncement = await publishPlannerAsStaffAnnouncement({
        schoolId,
        senderUserId: userId,
        senderName: normalizeText(sender?.name) || normalizeText(sender?.username) || 'Equipo directivo',
        senderRole: normalizeText(sender?.role) || normalizeText(role),
        cycle,
      });
    }

    return res.status(201).json({
      cycle: serializePlannerCycle(cycle),
      staffAnnouncementId: staffAnnouncement ? String(staffAnnouncement._id) : null,
    });
  } catch (error) {
    if (error?.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/planner-cycles/:cycleId', roleMiddleware(coordinationRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { cycleId } = req.params;

    if (!isValidObjectId(cycleId)) {
      return res.status(400).json({ message: 'Planner inválido.' });
    }

    const title = normalizeText(req.body.title);
    const parsedDeadline = parsePlannerCalendarDate(req.body.submissionDeadline);
    if (!title || !parsedDeadline) {
      return res.status(400).json({ message: 'Título y fecha límite son requeridos.' });
    }

    const startDate = parsePlannerCalendarDate(req.body.startDate);
    const endDate = parsePlannerCalendarDate(req.body.endDate);
    assertPlannerDateRange(startDate, endDate);
    const cycle = await HrPlannerCycle.findOneAndUpdate(
      { _id: cycleId, schoolId },
      {
        $set: {
          title,
          startDate,
          endDate,
          submissionDeadline: parsedDeadline,
          instructions: normalizeText(req.body.instructions),
          status: safeEnum(req.body.status, ['active', 'closed'], 'active'),
        },
      },
      { new: true, runValidators: true }
    );

    if (!cycle) {
      return res.status(404).json({ message: 'Planner no encontrado.' });
    }

    return res.status(200).json({ cycle: serializePlannerCycle(cycle) });
  } catch (error) {
    if (error?.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/planner-cycles/:cycleId', roleMiddleware(coordinationRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { cycleId } = req.params;

    if (!isValidObjectId(cycleId)) {
      return res.status(400).json({ message: 'Planner inválido.' });
    }

    const hasResponses = await HrSupplyRequest.exists({ schoolId, plannerCycleId: cycleId });
    if (hasResponses) {
      return res.status(409).json({
        message: 'No puedes eliminar este planner porque ya tiene respuestas de docentes. Puedes editarlo o cerrarlo.',
      });
    }

    const deletedCycle = await HrPlannerCycle.findOneAndDelete({ _id: cycleId, schoolId });
    if (!deletedCycle) {
      return res.status(404).json({ message: 'Planner no encontrado.' });
    }

    return res.status(200).json({ message: 'Planner eliminado.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/items', roleMiddleware(itemWriteRoles), async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    await ensurePurchaseAreas(schoolId, { createdByUserId: userId });
    const name = normalizeText(req.body.name);
    let areaId = normalizeText(req.body.areaId);

    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }

    if (isNursingSupplyRole(role)) {
      const nursingArea = await resolveNursingPurchaseArea(schoolId, { createdByUserId: userId });
      if (!nursingArea) {
        return res.status(404).json({ message: 'Área de Enfermería no configurada.' });
      }
      areaId = String(nursingArea._id);
    }

    if (!isValidObjectId(areaId)) {
      return res.status(400).json({ message: 'Debes seleccionar un área de compra.' });
    }

    const area = await HrPurchaseArea.findOne({ _id: areaId, schoolId, status: 'active' }).lean();
    if (!area) {
      return res.status(404).json({ message: 'Área de compra no encontrada.' });
    }

    const item = await HrSupplyItem.findOneAndUpdate(
      supplyItemQuery({ schoolId, areaId, name }),
      {
        schoolId,
        areaId,
        name,
        category: safeEnum(req.body.category, categories, isNursingSupplyRole(role) ? 'nursing' : 'other'),
        itemType: safeEnum(req.body.itemType, itemTypes, 'consumable'),
        unit: normalizeText(req.body.unit) || 'unidad',
        unitCost: Math.max(0, Number(req.body.unitCost || 0)),
        sku: normalizeText(req.body.sku),
        stock: Math.max(0, Number(req.body.stock || 0)),
        minStock: Math.max(0, Number(req.body.minStock || 0)),
        location: normalizeText(req.body.location),
        notes: normalizeText(req.body.notes),
        status: safeEnum(req.body.status, ['active', 'inactive'], 'active'),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({ item: serializeItem(item) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'Item already exists' });
    }
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/items/:id', roleMiddleware(itemWriteRoles), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid item id' });
    }

    const existing = await HrSupplyItem.findOne(supplyItemQuery({ _id: id, schoolId })).lean();
    if (!existing) {
      return res.status(404).json({ message: 'Item not found' });
    }

    if (isNursingSupplyRole(role)) {
      const nursingArea = await resolveNursingPurchaseArea(schoolId, { createdByUserId: userId });
      if (!nursingArea || String(existing.areaId || '') !== String(nursingArea._id)) {
        return res.status(403).json({ message: 'Solo puedes editar insumos del área de Enfermería.' });
      }
    }

    const updates = {};
    for (const field of ['name', 'unit', 'sku', 'location', 'notes']) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = normalizeText(req.body[field]);
      }
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'category')) updates.category = safeEnum(req.body.category, categories, 'other');
    if (Object.prototype.hasOwnProperty.call(req.body, 'itemType')) updates.itemType = safeEnum(req.body.itemType, itemTypes, 'consumable');
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) updates.status = safeEnum(req.body.status, ['active', 'inactive'], 'active');
    if (Object.prototype.hasOwnProperty.call(req.body, 'stock')) updates.stock = Math.max(0, Number(req.body.stock || 0));
    if (Object.prototype.hasOwnProperty.call(req.body, 'minStock')) updates.minStock = Math.max(0, Number(req.body.minStock || 0));
    if (Object.prototype.hasOwnProperty.call(req.body, 'unitCost')) updates.unitCost = Math.max(0, Number(req.body.unitCost || 0));
    if (Object.prototype.hasOwnProperty.call(req.body, 'areaId')) {
      if (isNursingSupplyRole(role)) {
        return res.status(403).json({ message: 'No puedes mover insumos fuera del área de Enfermería.' });
      }
      if (!isValidObjectId(req.body.areaId)) {
        return res.status(400).json({ message: 'Área inválida.' });
      }
      const area = await HrPurchaseArea.findOne({ _id: req.body.areaId, schoolId, status: 'active' }).lean();
      if (!area) {
        return res.status(404).json({ message: 'Área de compra no encontrada.' });
      }
      updates.areaId = req.body.areaId;
    }

    const item = await HrSupplyItem.findOneAndUpdate(supplyItemQuery({ _id: id, schoolId }), updates, { new: true });
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    return res.status(200).json({ item: serializeItem(item) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/items/:id/adjust-stock', roleMiddleware(itemWriteRoles), async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const { id } = req.params;
    const direction = safeEnum(req.body.direction, ['in', 'out'], '');
    const quantity = Math.max(1, Math.floor(Number(req.body.quantity || 0)));
    const notes = normalizeText(req.body.notes);
    const receivedByName = normalizeText(req.body.receivedByName);

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Insumo inválido.' });
    }
    if (!direction) {
      return res.status(400).json({ message: 'Indica si es ingreso (in) o entrega (out).' });
    }
    if (!quantity) {
      return res.status(400).json({ message: 'La cantidad debe ser mayor a 0.' });
    }

    const item = await HrSupplyItem.findOne(supplyItemQuery({ _id: id, schoolId, status: 'active' }));
    if (!item) {
      return res.status(404).json({ message: 'Insumo no encontrado.' });
    }

    if (isNursingSupplyRole(role)) {
      const nursingArea = await resolveNursingPurchaseArea(schoolId, { createdByUserId: userId });
      if (!nursingArea || String(item.areaId || '') !== String(nursingArea._id)) {
        return res.status(403).json({ message: 'Solo puedes ajustar inventario del área de Enfermería.' });
      }
    }

    if (direction === 'out' && Number(item.stock || 0) < quantity) {
      return res.status(400).json({
        message: `Stock insuficiente. Disponible: ${Number(item.stock || 0)} ${item.unit || 'unidad'}.`,
      });
    }

    item.stock = direction === 'in'
      ? Number(item.stock || 0) + quantity
      : Number(item.stock || 0) - quantity;
    await item.save();

    const unitCost = Math.max(0, Number(item.unitCost || 0));
    const lineTotal = quantity * unitCost;
    const requestType = direction === 'in' ? 'replenishment' : 'material';
    const purpose = notes
      || (direction === 'in'
        ? `Ingreso manual de inventario: ${item.name}`
        : `Entrega de material: ${item.name}`);

    const request = await HrSupplyRequest.create({
      schoolId,
      areaId: item.areaId || null,
      requestType,
      requestedByUserId: userId,
      serviceArea: isNursingSupplyRole(role) ? 'nursing' : 'general',
      needCategory: item.category || 'other',
      requestedForPerson: receivedByName,
      purpose,
      priority: 'medium',
      estimatedTotal: lineTotal,
      approvedTotal: lineTotal,
      budgetCharged: false,
      status: 'delivered',
      items: [{
        itemId: item._id,
        quantity,
        approvedQuantity: quantity,
        deliveredQuantity: quantity,
        unit: item.unit || 'unidad',
        unitCost,
        lineTotal,
        notes,
      }],
      approvedByUserId: userId,
      approvedAt: new Date(),
      deliveredByUserId: userId,
      deliveredAt: new Date(),
      deliveryNotes: purpose,
      receivedByName: receivedByName || '',
    });

    await populateRequest(request);
    return res.status(201).json({
      item: serializeItem(item),
      request: serializeRequest(request),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/requests', roleMiddleware(requesterRoles), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    await ensurePurchaseAreas(schoolId, { createdByUserId: userId });
    const filter = { schoolId };

    if (req.query.status) filter.status = safeEnum(req.query.status, statuses, 'pending_approval');
    if (req.query.requestType) filter.requestType = safeEnum(req.query.requestType, requestTypes, 'material');
    if (req.query.plannerCycleId && isValidObjectId(req.query.plannerCycleId)) filter.plannerCycleId = req.query.plannerCycleId;
    if (req.query.areaId && isValidObjectId(req.query.areaId)) filter.areaId = req.query.areaId;
    if (role === 'teacher') filter.requestedByUserId = userId;

    if (isNursingSupplyRole(role)) {
      const nursingArea = await resolveNursingPurchaseArea(schoolId, { createdByUserId: userId });
      if (!nursingArea) {
        return res.status(404).json({ message: 'Área de Enfermería no configurada.' });
      }
      filter.areaId = nursingArea._id;
    }

    const requests = await populateRequest(HrSupplyRequest.find(filter).sort({ updatedAt: -1 }).limit(100).lean());
    return res.status(200).json({ requests: requests.map(serializeRequest) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/coordination/planner-requests', roleMiddleware(coordinationRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const filter = { schoolId, requestType: 'material' };
    if (req.query.status) filter.status = safeEnum(req.query.status, statuses, 'pending_coordination_review');
    if (req.query.plannerCycleId && isValidObjectId(req.query.plannerCycleId)) filter.plannerCycleId = req.query.plannerCycleId;
    const requests = await populateRequest(HrSupplyRequest.find(filter).sort({ updatedAt: -1 }).limit(200).lean());
    return res.status(200).json({ requests: requests.map(serializeRequest) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/requests', roleMiddleware(requesterRoles), async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const requestType = safeEnum(req.body.requestType, requestTypes, 'material');
    const noMaterialsNeeded = Boolean(req.body.noMaterialsNeeded);
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    const serviceArea = safeEnum(req.body.serviceArea, serviceAreas, 'general');
    const needCategory = safeEnum(req.body.needCategory, categories, 'other');

    if (
      (requestType === 'replenishment' || requestType === 'purchase')
      && !hrManagerRoles.includes(role)
      && role !== 'coordination'
      && !isNursingSupplyRole(role)
    ) {
      return res.status(403).json({ message: 'Solo recursos, coordinación, enfermería o dirección pueden crear este tipo de solicitud.' });
    }

    const plannerCycleId = normalizeText(req.body.plannerCycleId);
    const plannerActivities = normalizePlannerActivities(req.body.plannerActivities);
    let plannerCycle = null;

    if (role === 'teacher' && requestType === 'material') {
      if (!isValidObjectId(plannerCycleId)) {
        return res.status(400).json({ message: 'Selecciona el planner definido por coordinacion.' });
      }
      plannerCycle = await HrPlannerCycle.findOne({ _id: plannerCycleId, schoolId, status: 'active' }).lean();
      if (!plannerCycle) {
        return res.status(400).json({ message: 'El planner seleccionado no esta activo.' });
      }
      if (!isPlannerDeadlineOpen(plannerCycle)) {
        return res.status(400).json({ message: 'La fecha limite del planner ya vencio. No puedes enviar ni editar.' });
      }
      if (!noMaterialsNeeded && !plannerActivities.length) {
        return res.status(400).json({ message: 'Registra al menos una actividad del planner.' });
      }

      const existingPending = await HrSupplyRequest.findOne({
        schoolId,
        requestType: 'material',
        plannerCycleId: plannerCycle._id,
        requestedByUserId: userId,
        status: 'pending_coordination_review',
      }).lean();
      if (existingPending) {
        return res.status(409).json({
          message: 'Ya enviaste este planner. Usa la edicion del card verde para modificarlo antes de la fecha limite.',
          requestId: String(existingPending._id),
        });
      }
    } else if (!rawItems.length && !noMaterialsNeeded) {
      return res.status(400).json({ message: 'Agrega al menos un producto o material a la solicitud.' });
    }

    const areas = await ensurePurchaseAreas(schoolId, { createdByUserId: userId });
    const generalArea = areas.find((area) => area.key === 'general') || areas[0];
    const academiaArea = areas.find((area) => area.key === 'teaching' || area.key === 'academia') || generalArea;
    const nursingArea = areas.find((area) => area.key === 'nursing') || null;
    let areaId = isValidObjectId(req.body.areaId) ? req.body.areaId : null;
    if (isNursingSupplyRole(role)) {
      if (!nursingArea) {
        return res.status(404).json({ message: 'Área de Enfermería no configurada.' });
      }
      areaId = String(nursingArea._id);
    } else if (role === 'teacher' && requestType === 'material' && academiaArea) {
      areaId = String(academiaArea._id);
    } else if (!areaId && generalArea) {
      areaId = String(generalArea._id);
    }

    if (role !== 'teacher' || requestType !== 'material') {
      if (!isValidObjectId(areaId)) {
        return res.status(400).json({ message: 'Debes seleccionar un área de compra.' });
      }
      const area = areas.find((entry) => String(entry._id) === String(areaId) && entry.status === 'active');
      if (!area) {
        return res.status(404).json({ message: 'Área de compra no encontrada.' });
      }
    } else if (academiaArea || generalArea) {
      areaId = String((academiaArea || generalArea)._id);
    }

    let items = buildRequestItemsFromPayload(rawItems, plannerActivities, noMaterialsNeeded);

    if (!noMaterialsNeeded && !items.length) {
      return res.status(400).json({ message: 'Agrega productos válidos a la solicitud.' });
    }

    if (requestType === 'material' && items.some((entry) => !entry.itemId)) {
      return res.status(400).json({ message: 'Las entregas desde inventario deben usar materiales del catálogo.' });
    }

    const catalogItemIds = items.map((entry) => entry.itemId).filter(Boolean);
    const catalogItems = catalogItemIds.length
      ? await HrSupplyItem.find(supplyItemQuery({ schoolId, _id: { $in: catalogItemIds }, status: 'active' })).lean()
      : [];
    if (catalogItems.length !== catalogItemIds.length) {
      return res.status(400).json({ message: 'Some items are invalid or inactive' });
    }

    const catalogById = new Map(catalogItems.map((item) => [String(item._id), item]));
    if (areaId) {
      const outsideArea = catalogItems.some((item) => String(item.areaId || '') !== String(areaId));
      if (outsideArea) {
        return res.status(400).json({ message: 'Todos los insumos deben pertenecer al área seleccionada.' });
      }
    }

    items = items.map((entry) => {
      const catalogItem = entry.itemId ? catalogById.get(String(entry.itemId)) : null;
      const unitCost = Math.max(0, Number(entry.unitCost || catalogItem?.unitCost || 0));
      const quantity = Math.max(1, Number(entry.quantity || 0));
      return {
        ...entry,
        unit: entry.unit || catalogItem?.unit || 'unidad',
        unitCost,
        lineTotal: quantity * unitCost,
      };
    });
    const estimatedTotal = items.reduce((sum, entry) => sum + Number(entry.lineTotal || 0), 0);

    const neededByDate = normalizeText(req.body.neededByDate);
    const parsedNeededByDate = neededByDate ? new Date(neededByDate) : null;
    const initialStatus = role === 'teacher' && requestType === 'material' ? 'pending_coordination_review' : 'pending_purchasing_review';
    const purpose = noMaterialsNeeded
      ? (normalizeText(req.body.purpose) || 'No necesito material para este periodo.')
      : normalizeText(req.body.purpose);
    const resolvedServiceArea = role === 'teacher'
      ? 'teaching'
      : (isNursingSupplyRole(role) ? 'nursing' : serviceArea);
    const resolvedNeedCategory = role === 'teacher'
      ? 'classroom'
      : (isNursingSupplyRole(role) ? safeEnum(needCategory, categories, 'nursing') : needCategory);

    const request = await HrSupplyRequest.create({
      schoolId,
      areaId: areaId || null,
      requestType,
      requestedByUserId: userId,
      plannerCycleId: plannerCycle?._id || null,
      plannerActivities: noMaterialsNeeded ? [] : plannerActivities,
      noMaterialsNeeded,
      serviceArea: resolvedServiceArea,
      needCategory: resolvedNeedCategory,
      requestedForArea: normalizeText(req.body.requestedForArea) || (isNursingSupplyRole(role) ? 'Enfermería' : ''),
      requestedForPerson: normalizeText(req.body.requestedForPerson),
      purpose,
      neededByDate: parsedNeededByDate && !Number.isNaN(parsedNeededByDate.getTime()) ? parsedNeededByDate : null,
      estimatedTotal,
      approvedTotal: 0,
      budgetCharged: false,
      priority: safeEnum(req.body.priority, priorities, 'medium'),
      items,
      status: initialStatus,
    });

    await populateRequestDocument(request);

    if (initialStatus === 'pending_coordination_review') {
      await notifyCoordination({
        schoolId,
        title: 'Planner docente para revisar',
        body: noMaterialsNeeded
          ? `${request.requestedByUserId?.name || 'Un docente'} marco que no necesita material en este periodo.`
          : `${request.requestedByUserId?.name || 'Un docente'} envio planner y ${items.length} requerimiento(s).`,
        payload: { type: 'hr.planner.coordination_review', requestId: String(request._id), requestType, url: '/campus/coordination' },
      }).catch((error) => console.warn(`[HR_NOTIFY_WARNING] request=${request._id} error=${error.message}`));
    } else {
      const requestTypeLabel = requestType === 'purchase'
        ? 'compra'
        : (requestType === 'replenishment' ? 'reposición' : 'materiales');
      const areaLabel = isNursingSupplyRole(role) ? 'Enfermería' : resolvedServiceArea;
      await notifyHumanResources({
        schoolId,
        title: `Solicitud de ${requestTypeLabel}${isNursingSupplyRole(role) ? ' · Enfermería' : ''}`,
        body: `${request.requestedByUserId?.name || 'Un usuario'} solicito ${items.length} ítem(s) para ${areaLabel}.`,
        payload: { type: 'hr.supply_request.purchasing_review', requestId: String(request._id), requestType, url: '/recursos-humanos' },
      }).catch((error) => console.warn(`[HR_NOTIFY_WARNING] request=${request._id} error=${error.message}`));
    }

    return res.status(201).json({ request: serializeRequest(request) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/requests/:id', roleMiddleware(['teacher']), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Solicitud invalida.' });
    }

    const request = await HrSupplyRequest.findOne({
      _id: id,
      schoolId,
      requestType: 'material',
      requestedByUserId: userId,
    });

    if (!request) {
      return res.status(404).json({ message: 'Solicitud no encontrada.' });
    }

    if (request.status !== 'pending_coordination_review') {
      return res.status(409).json({ message: 'Solo puedes editar el planner mientras esta en revision de coordinacion.' });
    }

    const plannerCycle = request.plannerCycleId
      ? await HrPlannerCycle.findOne({ _id: request.plannerCycleId, schoolId }).lean()
      : null;
    if (!isPlannerDeadlineOpen(plannerCycle)) {
      return res.status(400).json({ message: 'La fecha limite del planner ya vencio. No puedes editar.' });
    }

    const noMaterialsNeeded = Boolean(req.body.noMaterialsNeeded);
    const plannerActivities = normalizePlannerActivities(req.body.plannerActivities);
    if (!noMaterialsNeeded && !plannerActivities.length) {
      return res.status(400).json({ message: 'Registra al menos una actividad del planner.' });
    }

    const items = buildRequestItemsFromPayload(req.body.items, plannerActivities, noMaterialsNeeded);
    if (!noMaterialsNeeded && !items.length) {
      return res.status(400).json({ message: 'Agrega al menos un material o marca que no necesitas material.' });
    }

    const catalogItemIds = items.map((entry) => entry.itemId).filter(Boolean);
    const existingItemsCount = catalogItemIds.length
      ? await HrSupplyItem.countDocuments(supplyItemQuery({ schoolId, _id: { $in: catalogItemIds }, status: 'active' }))
      : 0;
    if (existingItemsCount !== catalogItemIds.length) {
      return res.status(400).json({ message: 'Some items are invalid or inactive' });
    }

    request.noMaterialsNeeded = noMaterialsNeeded;
    request.plannerActivities = noMaterialsNeeded ? [] : plannerActivities;
    request.items = items;
    request.requestedForArea = normalizeText(req.body.requestedForArea) || request.requestedForArea;
    request.purpose = noMaterialsNeeded
      ? (normalizeText(req.body.purpose) || 'No necesito material para este periodo.')
      : normalizeText(req.body.purpose);
    await request.save();

    await request.populate('requestedByUserId', 'name username role');
    await request.populate('items.itemId', 'name category itemType unit sku stock minStock location status notes');
    await request.populate('plannerCycleId', 'title startDate endDate submissionDeadline instructions status');

    return res.status(200).json({ request: serializeRequest(request) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/coordination/consolidate', roleMiddleware(coordinationRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const requestIds = Array.from(new Set((Array.isArray(req.body.requestIds) ? req.body.requestIds : []).map((id) => normalizeText(id)).filter(isValidObjectId)));

    if (!requestIds.length) {
      return res.status(400).json({ message: 'Selecciona al menos un planner docente.' });
    }

    const sourceRequests = await populateRequest(HrSupplyRequest.find({
      _id: { $in: requestIds },
      schoolId,
      requestType: 'material',
      status: 'pending_coordination_review',
    }));

    if (sourceRequests.length !== requestIds.length) {
      return res.status(400).json({ message: 'Algunos planners no estan disponibles para consolidar.' });
    }

    const aggregatedItemsByKey = new Map();
    for (const request of sourceRequests) {
      for (const item of request.items || []) {
        const itemId = String(item.itemId?._id || item.itemId || '');
        const customName = normalizeText(item.customName);
        const key = itemId || `custom:${customName.toLowerCase()}`;
        if (!key || key === 'custom:') continue;
        const previous = aggregatedItemsByKey.get(key) || {
          itemId: itemId || null,
          customName: itemId ? '' : customName,
          unit: normalizeText(item.unit) || normalizeText(item.itemId?.unit) || 'unidad',
          quantity: 0,
        };
        previous.quantity += Number(item.quantity || 0);
        if (!previous.unit) previous.unit = normalizeText(item.unit) || 'unidad';
        aggregatedItemsByKey.set(key, previous);
      }
    }

    const items = Array.from(aggregatedItemsByKey.values()).filter((item) => item.quantity > 0);
    if (!items.length) {
      return res.status(400).json({ message: 'Los planners seleccionados no tienen requerimientos validos.' });
    }

    const areas = await ensurePurchaseAreas(schoolId, { createdByUserId: userId });
    const academiaArea = areas.find((area) => area.key === 'teaching' || area.key === 'academia')
      || areas.find((area) => area.key === 'general')
      || areas[0];

    const cycleIds = Array.from(new Set(sourceRequests.map((request) => String(request.plannerCycleId?._id || request.plannerCycleId || '')).filter(Boolean)));
    const teachers = sourceRequests.map((request) => request.requestedByUserId?.name || 'Docente').filter(Boolean);
    const consolidatedRequest = await HrSupplyRequest.create({
      schoolId,
      areaId: academiaArea?._id || null,
      requestType: 'material',
      serviceArea: 'teaching',
      needCategory: 'classroom',
      requestedByUserId: userId,
      plannerCycleId: cycleIds.length === 1 ? cycleIds[0] : null,
      consolidatedFromRequestIds: sourceRequests.map((request) => request._id),
      requestedForArea: normalizeText(req.body.requestedForArea) || `Consolidado de ${sourceRequests.length} planner(s)`,
      purpose: normalizeText(req.body.reviewNotes) || `Consolidado de requerimientos docentes: ${teachers.join(', ')}`,
      priority: safeEnum(req.body.priority, priorities, 'medium'),
      items,
      status: 'pending_purchasing_review',
      submittedToPurchasingByUserId: userId,
      submittedToPurchasingAt: new Date(),
    });

    await HrSupplyRequest.updateMany(
      { _id: { $in: sourceRequests.map((request) => request._id) }, schoolId },
      { status: 'consolidated', consolidatedRequestId: consolidatedRequest._id }
    );

    await populateRequestDocument(consolidatedRequest);
    await notifyHumanResources({
      schoolId,
      title: 'Solicitud consolidada de planners',
      body: `Coordinacion envio ${items.length} requerimiento(s) consolidados a gestion de compras.`,
      payload: { type: 'hr.planner.consolidated', requestId: String(consolidatedRequest._id), url: '/recursos-humanos' },
    }).catch((error) => console.warn(`[HR_NOTIFY_WARNING] consolidate=${consolidatedRequest._id} error=${error.message}`));

    return res.status(201).json({ request: serializeRequest(consolidatedRequest) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/requests/:id/purchasing-accept', roleMiddleware(deliveryRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id' });
    }

    const request = await populateRequest(HrSupplyRequest.findOne({ _id: id, schoolId, status: 'pending_purchasing_review' }));
    if (!request) {
      return res.status(404).json({ message: 'Purchasing request not found' });
    }

    if (request.requestType === 'purchase') {
      request.status = 'pending_approval';
      request.deliveryNotes = normalizeText(req.body.deliveryNotes) || 'Compra revisada por gestión de compras y enviada a aprobación.';
      await request.save();
      await populateRequestDocument(request);

      await notifyLeadership({
        schoolId,
        title: 'Compra pendiente de aprobación',
        body: `Gestión de compras envió a aprobación una solicitud de compra (${(request.items || []).length} ítem(s)).`,
        payload: { type: 'hr.supply_request.pending', requestId: String(request._id), url: '/recursos-humanos' },
      }).catch((error) => console.warn(`[HR_NOTIFY_WARNING] purchase_accept=${request._id} error=${error.message}`));

      return res.status(200).json({ request: serializeRequest(request) });
    }

    const deliveredItems = (request.items || []).map((entry) => ({
      requestItemId: String(entry._id || ''),
      itemId: String(entry.itemId?._id || entry.itemId || ''),
      deliveredQuantity: Number(entry.quantity || 0),
    }));
    for (const item of request.items || []) {
      item.approvedQuantity = Number(item.quantity || 0);
    }
    await applyDeliveredStock({ request, deliveredItems });

    request.status = 'delivered';
    request.approvedByUserId = userId;
    request.approvedAt = new Date();
    request.deliveredByUserId = userId;
    request.deliveredAt = new Date();
    request.deliveryNotes = normalizeText(req.body.deliveryNotes) || 'Aceptada por gestion de compras y descontada de inventario.';
    await request.save();
    await populateRequestDocument(request);

    return res.status(200).json({ request: serializeRequest(request) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/requests/:id/submit-approval', roleMiddleware(deliveryRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id' });
    }

    const request = await populateRequest(HrSupplyRequest.findOne({ _id: id, schoolId, status: 'pending_hr_review' }));
    if (!request) {
      return res.status(404).json({ message: 'HR review request not found' });
    }

    request.status = 'pending_approval';
    request.deliveryNotes = normalizeText(req.body.reviewNotes) || request.deliveryNotes;
    await request.save();
    await populateRequestDocument(request);

    await notifyLeadership({
      schoolId,
      title: 'Solicitud de materiales pendiente de aprobacion',
      body: `RRHH envio a aprobacion la solicitud de ${request.requestedByUserId?.name || 'un docente'}.`,
      payload: { type: 'hr.supply_request.pending', requestId: String(request._id), reviewedBy: String(userId || ''), url: '/recursos-humanos' },
    }).catch((error) => console.warn(`[HR_NOTIFY_WARNING] submit=${request._id} error=${error.message}`));

    await notifyUser({
      schoolId,
      userId: request.requestedByUserId?._id || request.requestedByUserId,
      title: 'Solicitud enviada a aprobacion',
      body: 'RRHH reviso tu solicitud y la envio a rectoria o direccion.',
      payload: { type: 'hr.supply_request.submitted', requestId: String(request._id), url: '/campus/teacher' },
    }).catch((error) => console.warn(`[HR_NOTIFY_WARNING] submit_teacher=${request._id} error=${error.message}`));

    return res.status(200).json({ request: serializeRequest(request) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/requests/:id/approve', roleMiddleware(approvalRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id' });
    }

    const request = await populateRequest(HrSupplyRequest.findOne({ _id: id, schoolId, status: 'pending_approval' }));
    if (!request) {
      return res.status(404).json({ message: 'Pending request not found' });
    }

    const approvals = Array.isArray(req.body.items) ? req.body.items : [];
    const approvedByItemId = new Map(approvals.map((entry) => [String(entry.requestItemId || entry.id || entry.itemId || ''), Math.max(0, Number(entry.approvedQuantity || 0))]));

    for (const requestItem of request.items) {
      const itemId = String(requestItem.itemId?._id || requestItem.itemId || '');
      const requestItemKey = String(requestItem._id || '') || itemId;
      requestItem.approvedQuantity = approvedByItemId.has(String(requestItem._id || ''))
        ? Math.min(Number(requestItem.quantity || 0), Number(approvedByItemId.get(String(requestItem._id || '')) || 0))
        : (approvedByItemId.has(requestItemKey)
          ? Math.min(Number(requestItem.quantity || 0), Number(approvedByItemId.get(requestItemKey) || 0))
          : Number(requestItem.quantity || 0));
      const unitCost = Math.max(0, Number(requestItem.unitCost || requestItem.itemId?.unitCost || 0));
      requestItem.unitCost = unitCost;
      requestItem.lineTotal = Number(requestItem.approvedQuantity || 0) * unitCost;
    }

    const approvedTotal = (request.items || []).reduce((sum, entry) => (
      sum + (Number(entry.approvedQuantity || 0) * Math.max(0, Number(entry.unitCost || 0)))
    ), 0);

    if (request.requestType === 'purchase' && request.areaId && !request.budgetCharged) {
      const area = await HrPurchaseArea.findOne({ _id: request.areaId._id || request.areaId, schoolId });
      if (!area) {
        return res.status(404).json({ message: 'Área de compra no encontrada.' });
      }
      const budgetAmount = Math.max(0, Number(area.budgetAmount || 0));
      const spentAmount = Math.max(0, Number(area.spentAmount || 0));
      if (budgetAmount > 0 && (spentAmount + approvedTotal) > budgetAmount) {
        return res.status(400).json({
          message: `El área ${area.name} no tiene presupuesto suficiente. Disponible: $${Math.max(0, budgetAmount - spentAmount).toLocaleString('es-CO')}.`,
        });
      }
      area.spentAmount = spentAmount + approvedTotal;
      await area.save();
      request.budgetCharged = true;
      request.budgetChargedAt = new Date();
    }

    request.approvedTotal = approvedTotal;
    request.estimatedTotal = Math.max(Number(request.estimatedTotal || 0), approvedTotal);
    request.status = 'approved';
    request.approvedByUserId = userId;
    request.approvedAt = new Date();
    await request.save();
    await populateRequestDocument(request);

    await notifyUser({
      schoolId,
      userId: request.requestedByUserId?._id || request.requestedByUserId,
      title: request.requestType === 'purchase' ? 'Compra aprobada' : 'Solicitud de materiales aprobada',
      body: request.requestType === 'purchase'
        ? 'La compra fue aprobada y el presupuesto del área quedó actualizado. Pendiente recepción en recursos.'
        : 'Tu solicitud fue aprobada y queda pendiente de entrega por RRHH.',
      payload: { type: 'hr.supply_request.approved', requestId: String(request._id), url: '/recursos-humanos' },
    }).catch((error) => console.warn(`[HR_NOTIFY_WARNING] approved=${request._id} error=${error.message}`));

    return res.status(200).json({ request: serializeRequest(request) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/requests/:id/reject', roleMiddleware(approvalRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id' });
    }

    const request = await HrSupplyRequest.findOne({ _id: id, schoolId, status: 'pending_approval' });
    if (!request) {
      return res.status(404).json({ message: 'Pending request not found' });
    }

    request.status = 'rejected';
    request.rejectedByUserId = userId;
    request.rejectedAt = new Date();
    request.rejectionReason = normalizeText(req.body.rejectionReason);
    await request.save();
    await populateRequestDocument(request);

    await notifyUser({
      schoolId,
      userId: request.requestedByUserId?._id || request.requestedByUserId,
      title: 'Solicitud de materiales rechazada',
      body: request.rejectionReason || 'Tu solicitud fue revisada y no fue aprobada.',
      payload: { type: 'hr.supply_request.rejected', requestId: String(request._id), url: '/recursos-humanos' },
    }).catch((error) => console.warn(`[HR_NOTIFY_WARNING] rejected=${request._id} error=${error.message}`));

    return res.status(200).json({ request: serializeRequest(request) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/requests/:id/deliver', roleMiddleware(deliveryRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid request id' });
    }

    const request = await populateRequest(HrSupplyRequest.findOne({ _id: id, schoolId, status: 'approved' }));
    if (!request) {
      return res.status(404).json({ message: 'Approved request not found' });
    }

    const deliveredItems = Array.isArray(req.body.items) && req.body.items.length
      ? req.body.items
      : request.items.map((entry) => ({ itemId: String(entry.itemId?._id || entry.itemId), deliveredQuantity: Number(entry.approvedQuantity || entry.quantity || 0) }));

    await applyDeliveredStock({ request, deliveredItems });

    const totalApproved = request.items.reduce((total, entry) => total + Number(entry.approvedQuantity || entry.quantity || 0), 0);
    const totalDelivered = request.items.reduce((total, entry) => total + Number(entry.deliveredQuantity || 0), 0);

    request.status = totalDelivered >= totalApproved ? 'delivered' : 'partially_delivered';
    request.deliveredByUserId = userId;
    request.deliveredAt = new Date();
    request.deliveryNotes = normalizeText(req.body.deliveryNotes);
    request.receivedByName = normalizeText(req.body.receivedByName);
    request.evidenceUrl = normalizeText(req.body.evidenceUrl);
    await request.save();
    await populateRequestDocument(request);

    await notifyUser({
      schoolId,
      userId: request.requestedByUserId?._id || request.requestedByUserId,
      title: 'Materiales entregados por RRHH',
      body: `Tu solicitud fue marcada como ${request.status === 'delivered' ? 'entregada' : 'parcialmente entregada'}.`,
      payload: { type: 'hr.supply_request.delivered', requestId: String(request._id), url: '/recursos-humanos' },
    }).catch((error) => console.warn(`[HR_NOTIFY_WARNING] delivered=${request._id} error=${error.message}`));

    return res.status(200).json({ request: serializeRequest(request) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
