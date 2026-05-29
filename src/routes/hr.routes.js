const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const HrPlannerCycle = require('../models/hrPlannerCycle.model');
const HrSupplyItem = require('../models/hrSupplyItem.model');
const HrSupplyRequest = require('../models/hrSupplyRequest.model');
const User = require('../models/user.model');
const { queueNotificationsForParents } = require('../services/notification.service');

const router = express.Router();

router.use(authMiddleware);

const hrManagerRoles = ['human_resources', 'admin', 'rectoria', 'direccion'];
const coordinationRoles = ['coordination', 'admin', 'rectoria', 'direccion'];
const requesterRoles = ['teacher', 'human_resources', 'coordination', 'admin', 'rectoria', 'direccion'];
const approvalRoles = ['rectoria', 'direccion', 'admin'];
const deliveryRoles = ['human_resources', 'admin'];
const categories = ['stationery', 'classroom', 'sports', 'technology', 'laboratory', 'music', 'maintenance', 'other'];
const itemTypes = ['consumable', 'asset'];
const priorities = ['low', 'medium', 'high', 'urgent'];
const statuses = ['pending_coordination_review', 'consolidated', 'pending_hr_review', 'pending_purchasing_review', 'pending_approval', 'approved', 'rejected', 'delivered', 'partially_delivered', 'cancelled'];
const requestTypes = ['material', 'replenishment'];

function normalizeText(value) {
  return String(value || '').trim();
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

function serializeItem(item) {
  if (!item) {
    return null;
  }

  return {
    id: String(item._id),
    name: normalizeText(item.name),
    category: normalizeText(item.category) || 'other',
    itemType: normalizeText(item.itemType) || 'consumable',
    unit: normalizeText(item.unit) || 'unidad',
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
      return {
        date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
        title: normalizeText(entry?.title),
        description: normalizeText(entry?.description),
      };
    })
    .filter((entry) => entry.date && entry.title);
}

function serializeRequest(request) {
  if (!request) {
    return null;
  }

  return {
    id: String(request._id),
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
      }))
      : [],
    consolidatedFromRequestIds: Array.isArray(request.consolidatedFromRequestIds) ? request.consolidatedFromRequestIds.map((id) => String(id)) : [],
    consolidatedRequestId: String(request.consolidatedRequestId?._id || request.consolidatedRequestId || ''),
    requestedForArea: normalizeText(request.requestedForArea),
    purpose: normalizeText(request.purpose),
    neededByDate: request.neededByDate || null,
    status: normalizeText(request.status) || 'pending_approval',
    priority: normalizeText(request.priority) || 'medium',
    items: Array.isArray(request.items)
      ? request.items.map((entry) => ({
        id: String(entry._id),
        itemId: String(entry.itemId?._id || entry.itemId || ''),
        item: entry.itemId?._id ? serializeItem(entry.itemId) : null,
        customName: normalizeText(entry.customName),
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
    .populate('requestedByUserId', 'name username role')
    .populate('plannerCycleId', 'title startDate endDate submissionDeadline instructions status')
    .populate('approvedByUserId', 'name username role')
    .populate('rejectedByUserId', 'name username role')
    .populate('deliveredByUserId', 'name username role')
    .populate('items.itemId', 'name category itemType unit sku stock minStock location status notes');
}

async function populateRequestDocument(request) {
  await request.populate([
    { path: 'requestedByUserId', select: 'name username role' },
    { path: 'plannerCycleId', select: 'title startDate endDate submissionDeadline instructions status' },
    { path: 'approvedByUserId', select: 'name username role' },
    { path: 'rejectedByUserId', select: 'name username role' },
    { path: 'deliveredByUserId', select: 'name username role' },
    { path: 'items.itemId', select: 'name category itemType unit sku stock minStock location status notes' },
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
        { _id: itemId, schoolId: request.schoolId, stock: { $gte: deliveredQuantity } },
        { $inc: { stock: -deliveredQuantity } },
        { new: true }
      );

      if (!updatedItem) {
        throw new Error(`Stock insuficiente para ${requestItem.itemId?.name || 'material solicitado'}`);
      }
    }

    if (deliveredQuantity > 0 && request.requestType === 'replenishment') {
      await HrSupplyItem.updateOne({ _id: itemId, schoolId: request.schoolId }, { $inc: { stock: deliveredQuantity } });
    }
  }
}

router.get('/dashboard', roleMiddleware(hrManagerRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const [items, pendingHrReviewCount, pendingApprovalCount, approvedCount, lowStockCount, recentRequests] = await Promise.all([
      HrSupplyItem.find({ schoolId, status: 'active' }).sort({ name: 1 }).lean(),
      HrSupplyRequest.countDocuments({ schoolId, status: 'pending_hr_review' }),
      HrSupplyRequest.countDocuments({ schoolId, status: 'pending_approval' }),
      HrSupplyRequest.countDocuments({ schoolId, status: 'approved' }),
      HrSupplyItem.countDocuments({ schoolId, status: 'active', $expr: { $lte: ['$stock', '$minStock'] } }),
      populateRequest(HrSupplyRequest.find({ schoolId }).sort({ updatedAt: -1 }).limit(8).lean()),
    ]);

    return res.status(200).json({
      summary: {
        totalItems: items.length,
        pendingCount: pendingHrReviewCount + pendingApprovalCount,
        pendingHrReviewCount,
        pendingApprovalCount,
        approvedCount,
        lowStockCount,
        assetCount: items.filter((item) => item.itemType === 'asset').length,
      },
      recentRequests: recentRequests.map(serializeRequest),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/items', roleMiddleware(requesterRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const q = normalizeText(req.query.q);
    const filter = { schoolId };

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
    const { schoolId, userId } = req.user;
    const title = normalizeText(req.body.title);
    const submissionDeadline = normalizeText(req.body.submissionDeadline);
    const parsedDeadline = submissionDeadline ? new Date(submissionDeadline) : null;

    if (!title || !parsedDeadline || Number.isNaN(parsedDeadline.getTime())) {
      return res.status(400).json({ message: 'title and submissionDeadline are required' });
    }

    const startDate = normalizeText(req.body.startDate) ? new Date(req.body.startDate) : null;
    const endDate = normalizeText(req.body.endDate) ? new Date(req.body.endDate) : null;
    const cycle = await HrPlannerCycle.create({
      schoolId,
      title,
      startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
      endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
      submissionDeadline: parsedDeadline,
      instructions: normalizeText(req.body.instructions),
      status: safeEnum(req.body.status, ['active', 'closed'], 'active'),
      createdByUserId: userId,
    });

    return res.status(201).json({ cycle: serializePlannerCycle(cycle) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/items', roleMiddleware(hrManagerRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const name = normalizeText(req.body.name);

    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }

    const item = await HrSupplyItem.findOneAndUpdate(
      { schoolId, name },
      {
        schoolId,
        name,
        category: safeEnum(req.body.category, categories, 'other'),
        itemType: safeEnum(req.body.itemType, itemTypes, 'consumable'),
        unit: normalizeText(req.body.unit) || 'unidad',
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

router.patch('/items/:id', roleMiddleware(hrManagerRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid item id' });
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

    const item = await HrSupplyItem.findOneAndUpdate({ _id: id, schoolId }, updates, { new: true });
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    return res.status(200).json({ item: serializeItem(item) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/requests', roleMiddleware(requesterRoles), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const filter = { schoolId };

    if (req.query.status) filter.status = safeEnum(req.query.status, statuses, 'pending_approval');
    if (req.query.requestType) filter.requestType = safeEnum(req.query.requestType, requestTypes, 'material');
    if (req.query.plannerCycleId && isValidObjectId(req.query.plannerCycleId)) filter.plannerCycleId = req.query.plannerCycleId;
    if (role === 'teacher') filter.requestedByUserId = userId;

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
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];

    if (!rawItems.length) {
      return res.status(400).json({ message: 'items are required' });
    }

    if (requestType === 'replenishment' && !hrManagerRoles.includes(role)) {
      return res.status(403).json({ message: 'Only HR can request replenishment' });
    }

    const items = rawItems
      .map((entry) => ({
        itemId: normalizeText(entry.itemId),
        customName: normalizeText(entry.customName || entry.name),
        quantity: Math.max(1, Number(entry.quantity || 0)),
      }))
      .filter((entry) => (isValidObjectId(entry.itemId) || entry.customName) && entry.quantity > 0)
      .map((entry) => ({
        itemId: isValidObjectId(entry.itemId) ? entry.itemId : null,
        customName: isValidObjectId(entry.itemId) ? '' : entry.customName,
        quantity: entry.quantity,
      }));

    if (!items.length) {
      return res.status(400).json({ message: 'valid items are required' });
    }

    const catalogItemIds = items.map((entry) => entry.itemId).filter(Boolean);
    const existingItemsCount = catalogItemIds.length
      ? await HrSupplyItem.countDocuments({ schoolId, _id: { $in: catalogItemIds }, status: 'active' })
      : 0;
    if (existingItemsCount !== catalogItemIds.length) {
      return res.status(400).json({ message: 'Some items are invalid or inactive' });
    }

    const neededByDate = normalizeText(req.body.neededByDate);
    const parsedNeededByDate = neededByDate ? new Date(neededByDate) : null;

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
      if (!plannerActivities.length) {
        return res.status(400).json({ message: 'Registra al menos una actividad del planner.' });
      }
    }

    const initialStatus = role === 'teacher' && requestType === 'material' ? 'pending_coordination_review' : 'pending_purchasing_review';

    const request = await HrSupplyRequest.create({
      schoolId,
      requestType,
      requestedByUserId: userId,
      plannerCycleId: plannerCycle?._id || null,
      plannerActivities,
      requestedForArea: normalizeText(req.body.requestedForArea),
      purpose: normalizeText(req.body.purpose),
      neededByDate: parsedNeededByDate && !Number.isNaN(parsedNeededByDate.getTime()) ? parsedNeededByDate : null,
      priority: safeEnum(req.body.priority, priorities, 'medium'),
      items,
      status: initialStatus,
    });

    await request.populate('requestedByUserId', 'name username role');
    await request.populate('items.itemId', 'name category itemType unit sku stock minStock location status notes');

    if (initialStatus === 'pending_coordination_review') {
      await notifyCoordination({
        schoolId,
        title: 'Planner docente para revisar',
        body: `${request.requestedByUserId?.name || 'Un docente'} envio planner y ${items.length} requerimiento(s).`,
        payload: { type: 'hr.planner.coordination_review', requestId: String(request._id), requestType, url: '/campus/coordination' },
      }).catch((error) => console.warn(`[HR_NOTIFY_WARNING] request=${request._id} error=${error.message}`));
    } else {
      await notifyHumanResources({
        schoolId,
        title: requestType === 'replenishment' ? 'Solicitud de reposicion' : 'Solicitud de materiales pendiente',
        body: `${request.requestedByUserId?.name || 'Un usuario'} solicito ${items.length} material(es).`,
        payload: { type: 'hr.supply_request.purchasing_review', requestId: String(request._id), requestType, url: '/recursos-humanos' },
      }).catch((error) => console.warn(`[HR_NOTIFY_WARNING] request=${request._id} error=${error.message}`));
    }

    return res.status(201).json({ request: serializeRequest(request) });
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
        const previous = aggregatedItemsByKey.get(key) || { itemId: itemId || null, customName: itemId ? '' : customName, quantity: 0 };
        previous.quantity += Number(item.quantity || 0);
        aggregatedItemsByKey.set(key, previous);
      }
    }

    const items = Array.from(aggregatedItemsByKey.values()).filter((item) => item.quantity > 0);
    if (!items.length) {
      return res.status(400).json({ message: 'Los planners seleccionados no tienen requerimientos validos.' });
    }

    const cycleIds = Array.from(new Set(sourceRequests.map((request) => String(request.plannerCycleId?._id || request.plannerCycleId || '')).filter(Boolean)));
    const teachers = sourceRequests.map((request) => request.requestedByUserId?.name || 'Docente').filter(Boolean);
    const consolidatedRequest = await HrSupplyRequest.create({
      schoolId,
      requestType: 'material',
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
      const requestItemKey = itemId || String(requestItem._id || '');
      requestItem.approvedQuantity = approvedByItemId.has(requestItemKey)
        ? Math.min(Number(requestItem.quantity || 0), Number(approvedByItemId.get(requestItemKey) || 0))
        : Number(requestItem.quantity || 0);
    }

    request.status = 'approved';
    request.approvedByUserId = userId;
    request.approvedAt = new Date();
    await request.save();
    await populateRequestDocument(request);

    await notifyUser({
      schoolId,
      userId: request.requestedByUserId?._id || request.requestedByUserId,
      title: 'Solicitud de materiales aprobada',
      body: 'Tu solicitud fue aprobada y queda pendiente de entrega por RRHH.',
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
