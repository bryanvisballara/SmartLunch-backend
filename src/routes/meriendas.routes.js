const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const MeriendaSubscription = require('../models/meriendaSubscription.model');
const MeriendaFailedPayment = require('../models/meriendaFailedPayment.model');
const MeriendaSnack = require('../models/meriendaSnack.model');
const MeriendaSchedule = require('../models/meriendaSchedule.model');
const MeriendaOperation = require('../models/meriendaOperation.model');
const MeriendaIntakeRecord = require('../models/meriendaIntakeRecord.model');
const MeriendaWaitlist = require('../models/meriendaWaitlist.model');
const { queueTutorCommentNotification } = require('../services/notification.service');
const { normalizeStoredImageUrl, validateIncomingImageUrl } = require('../utils/imageUpload');

const router = express.Router();

router.use(authMiddleware);

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const isValidMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
const isValidDate = (value) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(String(value || ''));

const currentIsoDate = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const normalizeAteStatus = (value) => {
  const normalized = String(value || 'pending').trim();
  if (['ate', 'not_ate', 'pending'].includes(normalized)) {
    return normalized;
  }
  return 'pending';
};

const normalizeScheduleDays = (daysInput) => {
  if (Array.isArray(daysInput)) {
    return daysInput
      .map((item) => ({
        day: Number(item.day),
        firstSnackId: item.firstSnackId || null,
        secondSnackId: item.secondSnackId || null,
      }))
      .filter((item) => Number.isInteger(item.day) && item.day >= 1 && item.day <= 31);
  }

  if (daysInput && typeof daysInput === 'object') {
    return Object.entries(daysInput)
      .map(([day, value]) => ({
        day: Number(day),
        firstSnackId: value?.firstSnackId || null,
        secondSnackId: value?.secondSnackId || null,
      }))
      .filter((item) => Number.isInteger(item.day) && item.day >= 1 && item.day <= 31);
  }

  return [];
};

const normalizeStatus = (value) => {
  const normalized = String(value || '').trim();
  return ['pending_contact', 'contacted', 'resolved'].includes(normalized) ? normalized : 'pending_contact';
};

const sanitizeSnackImage = (value) => normalizeStoredImageUrl(value);

const sanitizeSnackDoc = (snack) => {
  if (!snack) {
    return snack;
  }

  return {
    ...snack,
    imageUrl: sanitizeSnackImage(snack.imageUrl),
  };
};

const sanitizeScheduleDoc = (schedule) => {
  if (!schedule || !Array.isArray(schedule.days)) {
    return schedule;
  }

  return {
    ...schedule,
    days: schedule.days.map((day) => ({
      ...day,
      firstSnackId: day.firstSnackId
        ? {
            ...day.firstSnackId,
            imageUrl: sanitizeSnackImage(day.firstSnackId.imageUrl),
          }
        : day.firstSnackId,
      secondSnackId: day.secondSnackId
        ? {
            ...day.secondSnackId,
            imageUrl: sanitizeSnackImage(day.secondSnackId.imageUrl),
          }
        : day.secondSnackId,
    })),
  };
};

const normalizeFoodRestrictionsInput = (payload = {}) => {
  // Backward compatibility: if old field is still sent, use it as fallback.
  const raw = Object.prototype.hasOwnProperty.call(payload, 'childFoodRestrictions')
    ? payload.childFoodRestrictions
    : payload.childAllergies;
  return String(raw || '').trim();
};

const normalizeFoodRestrictionReason = (value) => {
  const normalized = String(value || '').trim();
  if (normalized === 'Religion') {
    return 'Religión';
  }
  return ['Alergia', 'Intolerancia', 'Dieta especial', 'Religión'].includes(normalized) ? normalized : '';
};

const withFoodRestrictionsAlias = (subscription) => {
  if (!subscription) {
    return subscription;
  }

  const source = subscription.toObject ? subscription.toObject() : subscription;
  const childFoodRestrictions =
    String(source.childFoodRestrictions || '').trim() || String(source.childAllergies || '').trim();
  const childFoodRestrictionReason = normalizeFoodRestrictionReason(source.childFoodRestrictionReason);

  return {
    ...source,
    childFoodRestrictions,
    childFoodRestrictionReason,
  };
};

const sumCosts = (items = []) => {
  return (items || []).reduce((sum, item) => sum + Number(item?.amount || 0), 0);
};

const getOrCreateOperationDoc = async (schoolId, month) => {
  return MeriendaOperation.findOneAndUpdate(
    { schoolId, month },
    { $setOnInsert: { schoolId, month, subscriptionMonthlyCost: 0, fixedCosts: [], variableCosts: [] } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

const buildOperationMetrics = async (schoolId, month, operationDoc = null) => {
  const operation = operationDoc || (await getOrCreateOperationDoc(schoolId, month));
  const subscribedStudents = await MeriendaSubscription.countDocuments({
    schoolId,
    status: 'active',
    paymentStatus: true,
    currentPeriodMonth: month,
  });

  const subscriptionMonthlyCost = Number(operation.subscriptionMonthlyCost || 0);
  const monthlyIncome = Number(subscribedStudents || 0) * subscriptionMonthlyCost;
  const fixedCostsTotal = sumCosts(operation.fixedCosts);
  const variableCostsTotal = sumCosts(operation.variableCosts);
  const monthlyUtility = monthlyIncome - fixedCostsTotal - variableCostsTotal;

  return {
    month,
    subscriptionMonthlyCost,
    subscribedStudents: Number(subscribedStudents || 0),
    monthlyIncome,
    fixedCostsTotal,
    variableCostsTotal,
    monthlyUtility,
    fixedCosts: operation.fixedCosts || [],
    variableCosts: operation.variableCosts || [],
    updatedAt: operation.updatedAt,
  };
};

const registerFailedPayment = async ({
  schoolId,
  subscriptionId = null,
  parentUserId = null,
  parentName = '',
  parentUsername = '',
  childName = '',
  childGrade = '',
  amount = 0,
  targetMonth = '',
  reason = 'Pago de suscripcion rechazado',
}) => {
  return MeriendaFailedPayment.create({
    schoolId,
    subscriptionId,
    parentUserId,
    parentName: String(parentName || '').trim(),
    parentUsername: String(parentUsername || '').trim(),
    childName: String(childName || '').trim(),
    childGrade: String(childGrade || '').trim(),
    amount: Number(amount || 0),
    targetMonth: String(targetMonth || '').trim(),
    reason: String(reason || '').trim(),
    status: 'pending_contact',
    failedAt: new Date(),
  });
};

// Parent flow: subscription checkout event.
router.post('/subscription-events', roleMiddleware('parent', 'admin'), async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const {
      childName,
      childGrade = '',
      childDocument = '',
      amount = 0,
      targetMonth = '',
      paymentStatus = false,
      paymentReference = '',
      parentRecommendations = '',
      childAllergies = '',
      childFoodRestrictionReason = '',
      reason = 'Pago rechazado',
    } = req.body;

    const childFoodRestrictions = normalizeFoodRestrictionsInput(req.body);

    if (!String(childName || '').trim()) {
      return res.status(400).json({ message: 'childName is required' });
    }

    if (!isValidMonth(targetMonth)) {
      return res.status(400).json({ message: 'targetMonth must be YYYY-MM' });
    }

    const subscription = await MeriendaSubscription.findOneAndUpdate(
      {
        schoolId,
        parentUserId: userId,
        childName: String(childName).trim(),
      },
      {
        schoolId,
        parentUserId: userId,
        parentName: String(name || '').trim(),
        parentUsername: String(req.user.username || '').trim(),
        childName: String(childName).trim(),
        childGrade: String(childGrade || '').trim(),
        childDocument: String(childDocument || '').trim(),
        parentRecommendations: String(parentRecommendations || '').trim(),
        childAllergies: childFoodRestrictions || String(childAllergies || '').trim(),
        childFoodRestrictionReason: normalizeFoodRestrictionReason(childFoodRestrictionReason),
        paymentStatus: Boolean(paymentStatus),
        currentPeriodMonth: targetMonth,
        paymentReference: String(paymentReference || '').trim(),
        lastPaymentAt: Boolean(paymentStatus) ? new Date() : null,
        status: Boolean(paymentStatus) ? 'active' : 'inactive',
        endedAt: Boolean(paymentStatus) ? null : new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (!Boolean(paymentStatus)) {
      await registerFailedPayment({
        schoolId,
        subscriptionId: subscription?._id || null,
        parentUserId: userId,
        parentName: String(name || '').trim(),
        parentUsername: String(req.user.username || '').trim(),
        childName,
        childGrade,
        amount,
        targetMonth,
        reason,
      });
    }

    return res.status(200).json(withFoodRestrictionsAlias(subscription));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Parent flow: renewal event for next month.
router.post('/renewal-events', roleMiddleware('parent', 'admin'), async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const {
      subscriptionId,
      amount = 0,
      targetMonth,
      paymentStatus = false,
      paymentReference = '',
      parentRecommendations,
      childAllergies,
      childFoodRestrictionReason,
      reason = 'Pago de renovacion rechazado',
    } = req.body;

    const childFoodRestrictions = normalizeFoodRestrictionsInput(req.body);

    if (!isValidObjectId(subscriptionId)) {
      return res.status(400).json({ message: 'Invalid subscriptionId' });
    }

    if (!isValidMonth(targetMonth)) {
      return res.status(400).json({ message: 'targetMonth must be YYYY-MM' });
    }

    const subscription = await MeriendaSubscription.findOne({ _id: subscriptionId, schoolId, parentUserId: userId });
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    subscription.currentPeriodMonth = targetMonth;
    subscription.paymentReference = String(paymentReference || '').trim();
    subscription.paymentStatus = Boolean(paymentStatus);
    subscription.status = Boolean(paymentStatus) ? 'active' : 'inactive';
    subscription.lastPaymentAt = Boolean(paymentStatus) ? new Date() : subscription.lastPaymentAt;
    subscription.endedAt = Boolean(paymentStatus) ? null : new Date();
    subscription.parentName = String(name || '').trim();
    subscription.parentUsername = String(req.user.username || subscription.parentUsername || '').trim();

    if (Object.prototype.hasOwnProperty.call(req.body, 'parentRecommendations')) {
      subscription.parentRecommendations = String(parentRecommendations || '').trim();
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, 'childFoodRestrictions') ||
      Object.prototype.hasOwnProperty.call(req.body, 'childAllergies')
    ) {
      subscription.childAllergies = childFoodRestrictions || String(childAllergies || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'childFoodRestrictionReason')) {
      subscription.childFoodRestrictionReason = normalizeFoodRestrictionReason(childFoodRestrictionReason);
    }

    await subscription.save();

    if (!Boolean(paymentStatus)) {
      await registerFailedPayment({
        schoolId,
        subscriptionId: subscription._id,
        parentUserId: userId,
        parentName: String(name || '').trim(),
        parentUsername: String(req.user.username || '').trim(),
        childName: subscription.childName,
        childGrade: subscription.childGrade,
        amount,
        targetMonth,
        reason,
      });
    }

    return res.status(200).json(withFoodRestrictionsAlias(subscription));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Admin views: subscriptions are read-only and only paymentStatus=true.
router.get('/subscriptions', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const subscriptions = await MeriendaSubscription.find({
      schoolId,
      status: 'active',
      paymentStatus: true,
    })
      .sort({ childName: 1, createdAt: -1 })
      .lean();

    return res.status(200).json(subscriptions.map((subscription) => withFoodRestrictionsAlias(subscription)));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/subscriptions/:id/preferences', roleMiddleware('parent', 'admin'), async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const { id } = req.params;
    const { parentRecommendations, childAllergies, childFoodRestrictionReason } = req.body;
    const childFoodRestrictions = normalizeFoodRestrictionsInput(req.body);

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid subscription id' });
    }

    const subscription = await MeriendaSubscription.findOne({ _id: id, schoolId });
    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    if (role === 'parent' && String(subscription.parentUserId) !== String(userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'parentRecommendations')) {
      subscription.parentRecommendations = String(parentRecommendations || '').trim();
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, 'childFoodRestrictions') ||
      Object.prototype.hasOwnProperty.call(req.body, 'childAllergies')
    ) {
      subscription.childAllergies = childFoodRestrictions || String(childAllergies || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'childFoodRestrictionReason')) {
      subscription.childFoodRestrictionReason = normalizeFoodRestrictionReason(childFoodRestrictionReason);
    }

    await subscription.save();
    return res.status(200).json(withFoodRestrictionsAlias(subscription));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/operator/subscriptions', roleMiddleware('admin', 'merienda_operator'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const date = isValidDate(req.query.date) ? String(req.query.date) : currentIsoDate();
    const month = String(date).slice(0, 7);
    const query = String(req.query.q || '').trim();

    const subscriptionFilter = {
      schoolId,
      status: 'active',
      paymentStatus: true,
      currentPeriodMonth: month,
    };

    if (query) {
      const rx = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      subscriptionFilter.$or = [
        { childName: rx },
        { childGrade: rx },
        { childDocument: rx },
        { parentName: rx },
        { parentUsername: rx },
      ];
    }

    const subscriptions = await MeriendaSubscription.find(subscriptionFilter)
      .sort({ childName: 1, createdAt: -1 })
      .lean();

    const subscriptionIds = subscriptions.map((item) => item._id);
    const records = await MeriendaIntakeRecord.find({
      schoolId,
      date,
      subscriptionId: { $in: subscriptionIds },
    }).lean();

    const recordBySubscriptionId = records.reduce((acc, item) => {
      acc[String(item.subscriptionId)] = item;
      return acc;
    }, {});

    const data = subscriptions.map((subscription) => {
      const record = recordBySubscriptionId[String(subscription._id)] || null;
      return {
        ...withFoodRestrictionsAlias(subscription),
        intake: {
          ateStatus: record?.ateStatus || 'pending',
          observations: record?.observations || '',
          updatedAt: record?.updatedAt || null,
          handledByName: record?.handledByName || '',
        },
      };
    });

    return res.status(200).json({ date, month, subscriptions: data });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/operator/intake/:subscriptionId', roleMiddleware('admin', 'merienda_operator'), async (req, res) => {
  try {
    const { schoolId, userId, name } = req.user;
    const { subscriptionId } = req.params;
    const rawDate = String(req.body.date || currentIsoDate());
    const { observations = '' } = req.body;
    const ateStatus = normalizeAteStatus(req.body.ateStatus);

    if (!isValidObjectId(subscriptionId)) {
      return res.status(400).json({ message: 'Invalid subscriptionId' });
    }

    if (!isValidDate(rawDate)) {
      return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    }

    const month = rawDate.slice(0, 7);
    const subscription = await MeriendaSubscription.findOne({
      _id: subscriptionId,
      schoolId,
      status: 'active',
      paymentStatus: true,
      currentPeriodMonth: month,
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscribed student not found for selected month' });
    }

    const existingRecord = await MeriendaIntakeRecord.findOne({ schoolId, subscriptionId, date: rawDate }).lean();
    const previousComment = String(existingRecord?.observations || '').trim();
    const nextComment = String(observations || '').trim();

    const record = await MeriendaIntakeRecord.findOneAndUpdate(
      { schoolId, subscriptionId, date: rawDate },
      {
        schoolId,
        subscriptionId,
        month,
        date: rawDate,
        ateStatus,
        observations: String(observations || '').trim(),
        handledByUserId: userId,
        handledByName: String(name || '').trim(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (nextComment && nextComment !== previousComment) {
      setImmediate(async () => {
        try {
          await queueTutorCommentNotification({
            schoolId,
            parentId: subscription.parentUserId,
            studentId: null,
            childName: subscription.childName,
            tutorName: String(name || '').trim(),
            observations: nextComment,
            date: rawDate,
          });
        } catch (notificationError) {
          console.error(`[MERIENDAS_TUTOR_COMMENT_NOTIFICATION_FAILED] subscriptionId=${subscriptionId} date=${rawDate} error=${notificationError.message}`);
        }
      });
    }

    return res.status(200).json(record);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/operator/intake-history', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const from = isValidDate(req.query.from) ? String(req.query.from) : '';
    const to = isValidDate(req.query.to) ? String(req.query.to) : '';
    const query = String(req.query.q || '').trim().toLowerCase();

    const filter = { schoolId };
    if (from || to) {
      filter.date = {};
      if (from) {
        filter.date.$gte = from;
      }
      if (to) {
        filter.date.$lte = to;
      }
    }

    const records = await MeriendaIntakeRecord.find(filter)
      .sort({ date: -1, updatedAt: -1 })
      .limit(1000)
      .lean();

    const subscriptionIds = [...new Set(records.map((item) => String(item.subscriptionId)).filter(Boolean))];
    const subscriptions = await MeriendaSubscription.find({
      schoolId,
      _id: { $in: subscriptionIds },
    }).lean();

    const subscriptionById = subscriptions.reduce((acc, item) => {
      acc[String(item._id)] = withFoodRestrictionsAlias(item);
      return acc;
    }, {});

    const mapped = records.map((record) => {
      const subscription = subscriptionById[String(record.subscriptionId)] || null;
      return {
        _id: record._id,
        date: record.date,
        month: record.month,
        ateStatus: record.ateStatus || 'pending',
        observations: record.observations || '',
        handledByName: record.handledByName || '',
        updatedAt: record.updatedAt,
        followUpDone: Boolean(record.updatedAt),
        subscription: subscription
          ? {
              _id: subscription._id,
              childName: subscription.childName || '',
              childGrade: subscription.childGrade || '',
              parentName: subscription.parentName || '',
              parentUsername: subscription.parentUsername || '',
              parentRecommendations: subscription.parentRecommendations || '',
              childFoodRestrictions:
                subscription.childFoodRestrictions || subscription.childAllergies || '',
            }
          : null,
      };
    });

    const filtered = query
      ? mapped.filter((item) => {
          const haystack = [
            item.subscription?.childName,
            item.subscription?.parentName,
            item.subscription?.parentUsername,
            item.subscription?.parentRecommendations,
            item.subscription?.childFoodRestrictions,
            item.observations,
            item.handledByName,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(query);
        })
      : mapped;

    return res.status(200).json({
      from,
      to,
      total: filtered.length,
      records: filtered,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/failed-payments', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const failedPayments = await MeriendaFailedPayment.find({ schoolId })
      .sort({ failedAt: -1, createdAt: -1 })
      .lean();

    return res.status(200).json(failedPayments);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/failed-payments/:id', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid failed payment id' });
    }

    const failedPayment = await MeriendaFailedPayment.findOne({ _id: id, schoolId });
    if (!failedPayment) {
      return res.status(404).json({ message: 'Failed payment not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      failedPayment.status = normalizeStatus(req.body.status);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'reason')) {
      failedPayment.reason = String(req.body.reason || '').trim();
    }

    await failedPayment.save();
    return res.status(200).json(failedPayment);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/operations/:month', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { month } = req.params;

    if (!isValidMonth(month)) {
      return res.status(400).json({ message: 'month must be YYYY-MM' });
    }

    const metrics = await buildOperationMetrics(schoolId, month);
    return res.status(200).json(metrics);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/operations/:month/subscription-cost', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { month } = req.params;
    const { amount } = req.body;

    if (!isValidMonth(month)) {
      return res.status(400).json({ message: 'month must be YYYY-MM' });
    }

    if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ message: 'amount must be a number >= 0' });
    }

    const operation = await getOrCreateOperationDoc(schoolId, month);
    operation.subscriptionMonthlyCost = Number(amount || 0);
    await operation.save();

    const metrics = await buildOperationMetrics(schoolId, month, operation);
    return res.status(200).json(metrics);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/operations/:month/fixed-costs', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { month } = req.params;
    const { name, amount } = req.body;

    if (!isValidMonth(month)) {
      return res.status(400).json({ message: 'month must be YYYY-MM' });
    }

    if (!String(name || '').trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ message: 'amount must be a number >= 0' });
    }

    const operation = await getOrCreateOperationDoc(schoolId, month);
    operation.fixedCosts.push({ name: String(name).trim(), amount: Number(amount || 0), createdAt: new Date() });
    await operation.save();

    const metrics = await buildOperationMetrics(schoolId, month, operation);
    return res.status(201).json(metrics);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/operations/:month/variable-costs', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { month } = req.params;
    const { name, amount } = req.body;

    if (!isValidMonth(month)) {
      return res.status(400).json({ message: 'month must be YYYY-MM' });
    }

    if (!String(name || '').trim()) {
      return res.status(400).json({ message: 'name is required' });
    }

    if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ message: 'amount must be a number >= 0' });
    }

    const operation = await getOrCreateOperationDoc(schoolId, month);
    operation.variableCosts.push({ name: String(name).trim(), amount: Number(amount || 0), createdAt: new Date() });
    await operation.save();

    const metrics = await buildOperationMetrics(schoolId, month, operation);
    return res.status(201).json(metrics);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/operations/:month/fixed-costs/:costId', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { month, costId } = req.params;

    if (!isValidMonth(month)) {
      return res.status(400).json({ message: 'month must be YYYY-MM' });
    }

    if (!isValidObjectId(costId)) {
      return res.status(400).json({ message: 'Invalid cost id' });
    }

    const operation = await getOrCreateOperationDoc(schoolId, month);
    const fixedCostItem = operation.fixedCosts.id(costId);
    if (!fixedCostItem) {
      return res.status(404).json({ message: 'Fixed cost not found' });
    }

    fixedCostItem.deleteOne();

    await operation.save();
    const metrics = await buildOperationMetrics(schoolId, month, operation);
    return res.status(200).json(metrics);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/operations/:month/variable-costs/:costId', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { month, costId } = req.params;

    if (!isValidMonth(month)) {
      return res.status(400).json({ message: 'month must be YYYY-MM' });
    }

    if (!isValidObjectId(costId)) {
      return res.status(400).json({ message: 'Invalid cost id' });
    }

    const operation = await getOrCreateOperationDoc(schoolId, month);
    const variableCostItem = operation.variableCosts.id(costId);
    if (!variableCostItem) {
      return res.status(404).json({ message: 'Variable cost not found' });
    }

    variableCostItem.deleteOne();

    await operation.save();
    const metrics = await buildOperationMetrics(schoolId, month, operation);
    return res.status(200).json(metrics);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/operations-history', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const operations = await MeriendaOperation.find({ schoolId }).sort({ month: -1 }).lean();

    const history = await Promise.all(
      operations.map((operation) => buildOperationMetrics(schoolId, operation.month, operation))
    );

    return res.status(200).json(history);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/snacks', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const snacks = await MeriendaSnack.find({ schoolId, status: 'active' }).sort({ type: 1 }).lean();
    return res.status(200).json(snacks.map(sanitizeSnackDoc));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/snacks', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { type, title, description = '', imageUrl = '' } = req.body;

    if (!['first', 'second', 'drink'].includes(String(type))) {
      return res.status(400).json({ message: 'Invalid snack type' });
    }

    if (!String(title || '').trim()) {
      return res.status(400).json({ message: 'title is required' });
    }

    const snack = await MeriendaSnack.findOneAndUpdate(
      { schoolId, type: String(type) },
      {
        schoolId,
        type: String(type),
        title: String(title).trim(),
        description: String(description || '').trim(),
        imageUrl: validateIncomingImageUrl(imageUrl),
        status: 'active',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json(sanitizeSnackDoc(snack.toObject()));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/snacks/:id', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { id } = req.params;
    const { title, description, imageUrl, status } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid snack id' });
    }

    const snack = await MeriendaSnack.findOne({ _id: id, schoolId });
    if (!snack) {
      return res.status(404).json({ message: 'Snack not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
      if (!String(title || '').trim()) {
        return res.status(400).json({ message: 'title is required' });
      }
      snack.title = String(title).trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
      snack.description = String(description || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'imageUrl')) {
      snack.imageUrl = validateIncomingImageUrl(imageUrl);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      snack.status = ['active', 'inactive'].includes(String(status)) ? String(status) : 'active';
    }

    await snack.save();
    return res.status(200).json(sanitizeSnackDoc(snack.toObject()));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/schedule', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { month } = req.query;

    if (!isValidMonth(month)) {
      return res.status(400).json({ message: 'month must be YYYY-MM' });
    }

    const schedule = await MeriendaSchedule.findOne({ schoolId, month })
      .populate('days.firstSnackId', 'title type imageUrl')
      .populate('days.secondSnackId', 'title type imageUrl')
      .lean();

    return res.status(200).json(sanitizeScheduleDoc(schedule) || { schoolId, month, days: [] });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/schedule/:month', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { month } = req.params;
    const { days } = req.body;

    if (!isValidMonth(month)) {
      return res.status(400).json({ message: 'month must be YYYY-MM' });
    }

    const normalizedDays = normalizeScheduleDays(days).map((item) => ({
      day: item.day,
      firstSnackId: isValidObjectId(item.firstSnackId) ? item.firstSnackId : null,
      secondSnackId: isValidObjectId(item.secondSnackId) ? item.secondSnackId : null,
    }));

    const schedule = await MeriendaSchedule.findOneAndUpdate(
      { schoolId, month },
      { schoolId, month, days: normalizedDays },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .populate('days.firstSnackId', 'title type imageUrl')
      .populate('days.secondSnackId', 'title type imageUrl');

    return res.status(200).json(sanitizeScheduleDoc(schedule.toObject()));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Admin: get meriendas waitlist
router.get('/waitlist', roleMiddleware(['admin']), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const entries = await MeriendaWaitlist.find({ schoolId }).sort({ createdAt: -1 }).lean();
    return res.status(200).json(entries);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
