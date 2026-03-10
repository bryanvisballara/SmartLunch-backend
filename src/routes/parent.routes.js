const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/walletTransaction.model');
const Order = require('../models/order.model');
const MeriendaSubscription = require('../models/meriendaSubscription.model');
const MeriendaSchedule = require('../models/meriendaSchedule.model');
const MeriendaOperation = require('../models/meriendaOperation.model');
const MeriendaIntakeRecord = require('../models/meriendaIntakeRecord.model');
const User = require('../models/user.model');
const Category = require('../models/category.model');
const Product = require('../models/product.model');
const ParentPaymentMethod = require('../models/parentPaymentMethod.model');
const {
  isMercadoPagoConfigured,
  findOrCreateCustomer,
  createCardToken,
  createCustomerCard,
  deleteCustomerCard,
} = require('../services/mercadopago.service');
const { DEFAULT_TTL_SECONDS, getMenuCache, setMenuCache } = require('../services/menuCache.service');
const { deriveThumbUrlFromImageUrl, normalizeStoredImageUrl } = require('../utils/imageUpload');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('parent', 'admin'));

function toObjectId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    return null;
  }
  return new mongoose.Types.ObjectId(String(id));
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfCurrentWeek() {
  const now = new Date();
  const dayIndex = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayIndex);
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function currentYearMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function normalizeFoodRestrictionReason(value) {
  const normalized = String(value || '').trim();
  if (normalized === 'Religion') {
    return 'Religión';
  }
  return ['Alergia', 'Intolerancia', 'Dieta especial', 'Religión'].includes(normalized) ? normalized : '';
}

function detectCardBrand(cardDigits) {
  const value = String(cardDigits || '');
  if (/^4\d{12,18}$/.test(value)) return 'visa';
  if (/^(5[1-5]\d{14}|2[2-7]\d{14})$/.test(value)) return 'mastercard';
  if (/^3[47]\d{13}$/.test(value)) return 'amex';
  if (/^6(?:011|5\d{2}|4[4-9]\d|22(?:1[2-9]|[2-8]\d|9[01])|9\d{2})\d{12}$/.test(value)) return 'discover';
  return 'unknown';
}

function parseExpiry(expiryInput) {
  const value = String(expiryInput || '').trim();
  const matched = value.match(/^(\d{2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!matched) {
    return null;
  }

  const month = Number(matched[1]);
  const rawYear = Number(matched[2]);
  const year = matched[2].length === 2 ? 2000 + rawYear : rawYear;

  if (!Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return null;
  }

  return { month, year };
}

const CARD_VERIFICATION_WINDOW_HOURS = 24;
const CARD_VERIFICATION_MAX_ATTEMPTS = 5;

function buildCardVerificationChallenge() {
  return Math.floor(Math.random() * 900) + 100;
}

function getCardVerificationExpirationDate() {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CARD_VERIFICATION_WINDOW_HOURS);
  return expiresAt;
}

function serializeCard(card) {
  return {
    _id: card._id,
    token: card.token,
    brand: card.brand || 'unknown',
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
    holderFirstName: card.holderFirstName,
    holderLastName: card.holderLastName,
    holderDocType: card.holderDocType,
    holderDocument: card.holderDocument,
    verificationStatus: card.verificationStatus || 'pending',
    verificationExpiresAt: card.verificationExpiresAt || null,
    verifiedAt: card.verifiedAt || null,
    status: card.status,
    createdAt: card.createdAt,
  };
}

async function sumOrdersForRange({ schoolId, studentObjectId, fromDate }) {
  const result = await Order.aggregate([
    {
      $match: {
        schoolId,
        studentId: studentObjectId,
        status: 'completed',
        createdAt: { $gte: fromDate },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$total' },
      },
    },
  ]);

  return Number(result?.[0]?.total || 0);
}

router.get('/portal/overview', async (req, res) => {
  try {
    const { schoolId, role, userId, name, username } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    const parentUser = await User.findOne({ _id: parentUserId, schoolId, role: 'parent', deletedAt: null })
      .select('name username')
      .lean();
    const parentName = parentUser?.name || name || username || 'Padre';
    const parentUsername = parentUser?.username || username || '';

    const links = await ParentStudentLink.find({
      schoolId,
      parentId: parentUserId,
      status: 'active',
    })
      .select('studentId')
      .lean();

    const studentIds = links.map((link) => String(link.studentId));

    if (studentIds.length === 0) {
      return res.status(200).json({
        parent: {
          _id: String(parentUserId),
          name: parentName,
          username: parentUsername,
        },
        children: [],
        selectedStudentId: null,
        selectedStudent: null,
        spending: {
          day: 0,
          week: 0,
          month: 0,
        },
        recentTopups: [],
        recentOrders: [],
      });
    }

    const requestedStudentId = String(req.query.studentId || '');
    const selectedStudentId = studentIds.includes(requestedStudentId) ? requestedStudentId : studentIds[0];
    const selectedStudentObjectId = toObjectId(selectedStudentId);

    if (!selectedStudentObjectId) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    const [students, wallets, meriendaSubscriptions] = await Promise.all([
      Student.find({
        schoolId,
        _id: { $in: studentIds },
        deletedAt: null,
      })
        .populate('blockedProducts', 'name')
        .populate('blockedCategories', 'name')
        .sort({ name: 1 })
        .lean(),
      Wallet.find({
        schoolId,
        studentId: { $in: studentIds },
      }).lean(),
      MeriendaSubscription.find({
        schoolId,
        parentUserId,
        status: 'active',
      })
        .select('childName paymentStatus currentPeriodMonth parentRecommendations childAllergies')
        .lean(),
    ]);

    const walletByStudentId = wallets.reduce((acc, wallet) => {
      acc[String(wallet.studentId)] = wallet;
      return acc;
    }, {});

    const meriendaByChildName = meriendaSubscriptions.reduce((acc, subscription) => {
      const key = String(subscription.childName || '').trim().toLowerCase();
      if (key && !acc[key]) {
        acc[key] = subscription;
      }
      return acc;
    }, {});

    const children = students.map((student) => {
      const wallet = walletByStudentId[String(student._id)] || null;
      const subKey = String(student.name || '').trim().toLowerCase();
      const merienda = meriendaByChildName[subKey] || null;

      return {
        _id: student._id,
        name: student.name,
        schoolCode: student.schoolCode || '',
        grade: student.grade || '',
        dailyLimit: Number(student.dailyLimit || 0),
        blockedProductsCount: Array.isArray(student.blockedProducts) ? student.blockedProducts.length : 0,
        blockedCategoriesCount: Array.isArray(student.blockedCategories) ? student.blockedCategories.length : 0,
        blockedProducts: Array.isArray(student.blockedProducts)
          ? student.blockedProducts.map((item) => ({ _id: item._id, name: item.name || '' }))
          : [],
        blockedCategories: Array.isArray(student.blockedCategories)
          ? student.blockedCategories.map((item) => ({ _id: item._id, name: item.name || '' }))
          : [],
        wallet: {
          balance: Number(wallet?.balance || 0),
          autoDebitEnabled: Boolean(wallet?.autoDebitEnabled),
          autoDebitLimit: Number(wallet?.autoDebitLimit || 0),
          autoDebitAmount: Number(wallet?.autoDebitAmount || 0),
          autoDebitPaymentMethodId: wallet?.autoDebitPaymentMethodId || null,
          autoDebitInProgress: Boolean(wallet?.autoDebitInProgress),
          autoDebitLockAt: wallet?.autoDebitLockAt || null,
          autoDebitLastAttempt: wallet?.autoDebitLastAttempt || null,
          autoDebitLastChargeAt: wallet?.autoDebitLastChargeAt || null,
          autoDebitRetryAt: wallet?.autoDebitRetryAt || null,
          autoDebitRetryCount: Number(wallet?.autoDebitRetryCount || 0),
          autoDebitMonthlyLimit: Number(wallet?.autoDebitMonthlyLimit || 0),
          autoDebitMonthlyUsed: Number(wallet?.autoDebitMonthlyUsed || 0),
          autoDebitMonthlyPeriod: String(wallet?.autoDebitMonthlyPeriod || ''),
        },
        merienda: merienda
          ? {
              active: true,
              paymentStatus: Boolean(merienda.paymentStatus),
              currentPeriodMonth: merienda.currentPeriodMonth || '',
              parentRecommendations: merienda.parentRecommendations || '',
              childFoodRestrictions: merienda.childAllergies || '',
            }
          : {
              active: false,
              paymentStatus: false,
              currentPeriodMonth: '',
              parentRecommendations: '',
              childFoodRestrictions: '',
            },
      };
    });

    const selectedStudent = children.find((child) => String(child._id) === selectedStudentId) || null;

    const [day, week, month, recentTopups, recentOrders] = await Promise.all([
      sumOrdersForRange({ schoolId, studentObjectId: selectedStudentObjectId, fromDate: startOfToday() }),
      sumOrdersForRange({ schoolId, studentObjectId: selectedStudentObjectId, fromDate: startOfCurrentWeek() }),
      sumOrdersForRange({ schoolId, studentObjectId: selectedStudentObjectId, fromDate: startOfCurrentMonth() }),
      WalletTransaction.find({
        schoolId,
        type: 'recharge',
        cancelledAt: null,
        studentId: { $in: studentIds },
      })
        .populate('createdBy', 'name username role')
        .populate('studentId', 'name schoolCode')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Order.find({
        schoolId,
        studentId: selectedStudentObjectId,
        status: 'completed',
      })
        .populate('storeId', 'name')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    return res.status(200).json({
      parent: {
        _id: String(parentUserId),
        name: parentName,
        username: parentUsername,
      },
      children,
      selectedStudentId,
      selectedStudent,
      spending: {
        day,
        week,
        month,
      },
      recentTopups: recentTopups.map((topup) => ({
        _id: topup._id,
        amount: Number(topup.amount || 0),
        method: topup.method || 'cash',
        createdAt: topup.createdAt,
        createdBy: topup.createdBy
          ? {
              _id: topup.createdBy._id,
              name: topup.createdBy.name || '',
              username: topup.createdBy.username || '',
              role: topup.createdBy.role || '',
            }
          : null,
        student: topup.studentId
          ? {
              _id: topup.studentId._id,
              name: topup.studentId.name || '',
              schoolCode: topup.studentId.schoolCode || '',
            }
          : null,
      })),
      recentOrders: recentOrders.map((order) => ({
        _id: order._id,
        total: Number(order.total || 0),
        paymentMethod: order.paymentMethod || 'system',
        createdAt: order.createdAt,
        itemsCount: Array.isArray(order.items)
          ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
          : 0,
        storeName: order.storeId?.name || 'Tienda',
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/categories', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const cacheKey = `${schoolId}:parent-categories`;
    const cachedPayload = await getMenuCache(cacheKey);
    if (cachedPayload) {
      res.setHeader('X-Menu-Cache', 'HIT');
      return res.status(200).json(cachedPayload);
    }

    const categories = await Category.find({
      schoolId,
      deletedAt: null,
      status: 'active',
    })
      .select('_id name imageUrl thumbUrl')
      .sort({ name: 1 })
      .lean();

    const normalizedCategories = categories.map((category) => ({
      _id: category._id,
      name: category.name || 'Sin nombre',
      imageUrl: category.imageUrl || '',
      thumbUrl: normalizeStoredImageUrl(category.thumbUrl) || deriveThumbUrlFromImageUrl(category.imageUrl),
    }));

    await setMenuCache(cacheKey, normalizedCategories, DEFAULT_TTL_SECONDS);
    res.setHeader('X-Menu-Cache', 'MISS');
    return res.status(200).json(normalizedCategories);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/orders-history', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.query.studentId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const links = await ParentStudentLink.find({
      schoolId,
      parentId: parentUserId,
      status: 'active',
    })
      .select('studentId')
      .lean();

    const allowedStudentIds = links.map((link) => String(link.studentId));
    if (!allowedStudentIds.includes(String(studentId))) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const filter = {
      schoolId,
      studentId,
    };

    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();

    if (from || to) {
      filter.createdAt = {};

      if (from) {
        const fromDate = new Date(from);
        if (Number.isNaN(fromDate.getTime())) {
          return res.status(400).json({ message: 'Invalid from date' });
        }
        fromDate.setHours(0, 0, 0, 0);
        filter.createdAt.$gte = fromDate;
      }

      if (to) {
        const toDate = new Date(to);
        if (Number.isNaN(toDate.getTime())) {
          return res.status(400).json({ message: 'Invalid to date' });
        }
        toDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = toDate;
      }
    }

    const orders = await Order.find(filter)
      .populate('storeId', 'name')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json({
      studentId: String(studentId),
      orders: orders.map((order) => ({
        _id: order._id,
        total: Number(order.total || 0),
        status: order.status || 'completed',
        paymentMethod: order.paymentMethod || 'system',
        createdAt: order.createdAt,
        itemsCount: Array.isArray(order.items)
          ? order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
          : 0,
        storeName: order.storeId?.name || 'Tienda',
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/meriendas', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.query.studentId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    }).lean();

    if (!link) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const month = String(req.query.month || currentYearMonth()).trim();

    const [subscription, operation, schedule] = await Promise.all([
      MeriendaSubscription.findOne({ schoolId, parentUserId, childName: String(student.name || '').trim() })
        .sort({ createdAt: -1 })
        .lean(),
      MeriendaOperation.findOne({ schoolId, month }).lean(),
      MeriendaSchedule.findOne({ schoolId, month })
        .populate('days.firstSnackId', 'title type imageUrl description')
        .populate('days.secondSnackId', 'title type imageUrl description')
        .lean(),
    ]);

    let latestOperatorComment = null;
    if (subscription?._id) {
      const latestRecord = await MeriendaIntakeRecord.findOne({ schoolId, subscriptionId: subscription._id })
        .sort({ date: -1, updatedAt: -1 })
        .lean();

      if (latestRecord && String(latestRecord.observations || '').trim()) {
        latestOperatorComment = {
          text: String(latestRecord.observations || '').trim(),
          date: latestRecord.date || '',
          handledByName: latestRecord.handledByName || '',
        };
      }
    }

    return res.status(200).json({
      month,
      student: {
        _id: student._id,
        name: student.name || '',
        grade: student.grade || '',
        schoolCode: student.schoolCode || '',
      },
      subscriptionCost: Number(operation?.subscriptionMonthlyCost || 0),
      schedule: {
        month,
        days: Array.isArray(schedule?.days)
          ? schedule.days
              .slice()
              .sort((a, b) => Number(a.day || 0) - Number(b.day || 0))
              .map((item) => ({
                day: Number(item.day || 0),
                firstSnack: item.firstSnackId
                  ? {
                      _id: item.firstSnackId._id,
                      title: item.firstSnackId.title || '',
                      type: item.firstSnackId.type || '',
                      imageUrl: item.firstSnackId.imageUrl || '',
                      thumbUrl: deriveThumbUrlFromImageUrl(item.firstSnackId.imageUrl),
                      description: item.firstSnackId.description || '',
                    }
                  : null,
                secondSnack: item.secondSnackId
                  ? {
                      _id: item.secondSnackId._id,
                      title: item.secondSnackId.title || '',
                      type: item.secondSnackId.type || '',
                      imageUrl: item.secondSnackId.imageUrl || '',
                      thumbUrl: deriveThumbUrlFromImageUrl(item.secondSnackId.imageUrl),
                      description: item.secondSnackId.description || '',
                    }
                  : null,
              }))
          : [],
      },
      subscription: subscription
        ? {
            _id: subscription._id,
            active: Boolean(subscription.status === 'active' && subscription.paymentStatus),
            paymentStatus: Boolean(subscription.paymentStatus),
            currentPeriodMonth: subscription.currentPeriodMonth || '',
            childFoodRestrictions: subscription.childAllergies || '',
            childFoodRestrictionReason: normalizeFoodRestrictionReason(subscription.childFoodRestrictionReason),
            parentComments: subscription.parentRecommendations || '',
            operatorComments: latestOperatorComment,
          }
        : {
            _id: null,
            active: false,
            paymentStatus: false,
            currentPeriodMonth: '',
            childFoodRestrictions: '',
            childFoodRestrictionReason: '',
            parentComments: '',
            operatorComments: null,
          },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/meriendas/subscribe', async (req, res) => {
  try {
    const { schoolId, role, userId, name, username } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.body.studentId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    }).lean();

    if (!link) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const targetMonth = String(req.body.targetMonth || currentYearMonth()).trim();
    const childFoodRestrictions = String(req.body.childFoodRestrictions || '').trim();
    const childFoodRestrictionReason = normalizeFoodRestrictionReason(req.body.childFoodRestrictionReason);

    const subscription = await MeriendaSubscription.findOneAndUpdate(
      { schoolId, parentUserId, childName: String(student.name || '').trim() },
      {
        schoolId,
        parentUserId,
        parentName: String(name || '').trim(),
        parentUsername: String(username || '').trim(),
        childName: String(student.name || '').trim(),
        childGrade: String(student.grade || '').trim(),
        childDocument: String(student.schoolCode || '').trim(),
        childAllergies: childFoodRestrictions,
        childFoodRestrictionReason,
        paymentStatus: true,
        currentPeriodMonth: targetMonth,
        status: 'active',
        startedAt: new Date(),
        endedAt: null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      subscription: {
        _id: subscription._id,
        active: Boolean(subscription.status === 'active' && subscription.paymentStatus),
        paymentStatus: Boolean(subscription.paymentStatus),
        currentPeriodMonth: subscription.currentPeriodMonth || '',
        childFoodRestrictions: subscription.childAllergies || '',
        childFoodRestrictionReason: normalizeFoodRestrictionReason(subscription.childFoodRestrictionReason),
        parentComments: subscription.parentRecommendations || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/portal/meriendas/subscription/:id', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const subscriptionId = toObjectId(req.params.id);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!subscriptionId) {
      return res.status(400).json({ message: 'Invalid subscription id' });
    }

    const subscription = await MeriendaSubscription.findOne({
      _id: subscriptionId,
      schoolId,
      parentUserId,
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'childFoodRestrictions')) {
      subscription.childAllergies = String(req.body.childFoodRestrictions || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'childFoodRestrictionReason')) {
      subscription.childFoodRestrictionReason = normalizeFoodRestrictionReason(req.body.childFoodRestrictionReason);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'parentComments')) {
      subscription.parentRecommendations = String(req.body.parentComments || '').trim();
    }

    await subscription.save();

    return res.status(200).json({
      subscription: {
        _id: subscription._id,
        active: Boolean(subscription.status === 'active' && subscription.paymentStatus),
        paymentStatus: Boolean(subscription.paymentStatus),
        currentPeriodMonth: subscription.currentPeriodMonth || '',
        childFoodRestrictions: subscription.childAllergies || '',
        childFoodRestrictionReason: normalizeFoodRestrictionReason(subscription.childFoodRestrictionReason),
        parentComments: subscription.parentRecommendations || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/portal/meriendas/subscription/:id', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const subscriptionId = toObjectId(req.params.id);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!subscriptionId) {
      return res.status(400).json({ message: 'Invalid subscription id' });
    }

    const subscription = await MeriendaSubscription.findOne({
      _id: subscriptionId,
      schoolId,
      parentUserId,
    });

    if (!subscription) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    subscription.status = 'inactive';
    subscription.paymentStatus = false;
    subscription.endedAt = new Date();
    await subscription.save();

    return res.status(200).json({
      subscription: {
        _id: subscription._id,
        active: false,
        paymentStatus: false,
        currentPeriodMonth: subscription.currentPeriodMonth || '',
        childFoodRestrictions: subscription.childAllergies || '',
        childFoodRestrictionReason: normalizeFoodRestrictionReason(subscription.childFoodRestrictionReason),
        parentComments: subscription.parentRecommendations || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/payment-methods/cards', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    const cards = await ParentPaymentMethod.find({
      schoolId,
      parentUserId,
      type: 'card',
      status: 'active',
      deletedAt: null,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      cards: cards.map((card) => serializeCard(card)),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/payment-methods/cards', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    const parentUser = await User.findOne({ _id: parentUserId, schoolId, role: 'parent', deletedAt: null })
      .select('_id name email username')
      .lean();
    if (!parentUser) {
      return res.status(404).json({ message: 'Parent user not found' });
    }

    const incomingCardToken = String(req.body?.cardToken || '').trim();
    const incomingDeviceId = String(req.body?.deviceId || '').trim();
    const cardNumber = String(req.body?.cardNumber || '').replace(/\D/g, '');
    const expiry = parseExpiry(req.body?.cardExpiry);
    const cvv = String(req.body?.cardCvv || '').replace(/\D/g, '');
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const docType = String(req.body?.documentType || '').trim().toUpperCase();
    const document = String(req.body?.documentNumber || '').replace(/\D/g, '');

    if (firstName.length < 2 || lastName.length < 2) {
      return res.status(400).json({ message: 'Card holder firstName and lastName are required' });
    }
    if (!['CC', 'TI', 'CE', 'NIT', 'PP'].includes(docType)) {
      return res.status(400).json({ message: 'Invalid documentType' });
    }
    if (document.length < 5) {
      return res.status(400).json({ message: 'documentNumber is required' });
    }

    if (!incomingCardToken) {
      if (cardNumber.length < 13 || cardNumber.length > 19) {
        return res.status(400).json({ message: 'cardNumber must contain 13 to 19 digits' });
      }
      if (!expiry) {
        return res.status(400).json({ message: 'cardExpiry must have MM/YY format' });
      }
      if (cvv.length < 3 || cvv.length > 4) {
        return res.status(400).json({ message: 'cardCvv must contain 3 or 4 digits' });
      }
    }

    const fallbackBrand = cardNumber ? detectCardBrand(cardNumber) : 'unknown';
    const fallbackLast4 = cardNumber ? cardNumber.slice(-4) : '0000';

    const mercadopagoConfigured = isMercadoPagoConfigured();
    if (incomingCardToken && !mercadopagoConfigured) {
      return res.status(503).json({
        message: 'Mercado Pago no está configurado en el backend. No se puede registrar la tarjeta con tokenización.',
      });
    }

    let paymentMethod;
    if (mercadopagoConfigured) {
      const parentEmail = String(parentUser?.email || '').trim().toLowerCase() || `${String(parentUserId)}@smartlunch.local`;
      const customer = await findOrCreateCustomer({
        email: parentEmail,
        firstName,
        lastName,
        externalReference: `${schoolId}:${String(parentUserId)}`,
      });

      const customerId = String(customer?.id || customer?._id || '').trim();
      if (!customerId) {
        return res.status(502).json({ message: 'No fue posible crear el cliente en Mercado Pago.' });
      }

      const cardTokenId = incomingCardToken
        ? incomingCardToken
        : String(
          (
            await createCardToken({
              cardNumber,
              expirationMonth: expiry.month,
              expirationYear: expiry.year,
              securityCode: cvv,
              cardholder: {
                name: `${firstName} ${lastName}`.trim(),
                identification: {
                  type: docType,
                  number: document,
                },
              },
            })
          )?.id || ''
        ).trim();

      if (!cardTokenId) {
        return res.status(400).json({ message: 'No se pudo tokenizar la tarjeta.' });
      }

      const customerCard = await createCustomerCard({
        customerId,
        cardToken: cardTokenId,
      });

      const providerCardId = String(customerCard?.id || '').trim();
      if (!providerCardId) {
        return res.status(502).json({ message: 'No fue posible guardar la tarjeta en Mercado Pago.' });
      }

      const existingProviderCard = await ParentPaymentMethod.findOne({
        schoolId,
        parentUserId,
        provider: 'mercadopago',
        providerCardId,
        deletedAt: null,
      })
        .select('_id')
        .lean();

      if (existingProviderCard) {
        return res.status(409).json({ message: 'Esta tarjeta ya se encuentra registrada.' });
      }

      const cardFingerprint = String(customerCard?.fingerprint || customerCard?.first_six_digits || providerCardId);
      const fingerprint = crypto
        .createHash('sha256')
        .update(`${schoolId}|${String(parentUserId)}|mp|${cardFingerprint}`)
        .digest('hex');

      paymentMethod = await ParentPaymentMethod.create({
        schoolId,
        parentUserId,
        type: 'card',
        provider: 'mercadopago',
        token: `mp_${customerId}_${providerCardId}`,
        providerCustomerId: customerId,
        providerCardId,
        providerPaymentMethodId: String(customerCard?.payment_method?.id || '').trim(),
        providerDeviceId: incomingDeviceId,
        fingerprint,
        brand: String(customerCard?.payment_method?.name || fallbackBrand || 'unknown').toLowerCase(),
        last4: String(customerCard?.last_four_digits || fallbackLast4),
        expMonth: Number(customerCard?.expiration_month || expiry?.month || 1),
        expYear: Number(customerCard?.expiration_year || expiry?.year || 2099),
        holderFirstName: firstName,
        holderLastName: lastName,
        holderDocType: docType,
        holderDocument: document,
        verificationStatus: 'verified',
        verificationAmount: null,
        verificationAttemptCount: 0,
        verificationLastRequestedAt: null,
        verificationExpiresAt: null,
        verifiedAt: new Date(),
      });
    } else {
      const allowInternalFallback = String(process.env.ALLOW_INTERNAL_CARD_FALLBACK || '').toLowerCase() === 'true';
      if (!allowInternalFallback) {
        return res.status(503).json({
          message: 'Registro manual de tarjetas deshabilitado. Configura Mercado Pago para continuar.',
        });
      }

      // Fallback path for controlled environments only.
      const fingerprint = crypto
        .createHash('sha256')
        .update(`${schoolId}|${String(parentUserId)}|${cardNumber}|${expiry.month}|${expiry.year}|${docType}|${document}`)
        .digest('hex');

      const existing = await ParentPaymentMethod.findOne({
        schoolId,
        parentUserId,
        fingerprint,
        deletedAt: null,
      })
        .select('_id')
        .lean();

      if (existing) {
        return res.status(409).json({ message: 'Esta tarjeta ya se encuentra registrada.' });
      }

      paymentMethod = await ParentPaymentMethod.create({
        schoolId,
        parentUserId,
        type: 'card',
        provider: 'internal',
        token: `pm_${crypto.randomBytes(18).toString('hex')}`,
        fingerprint,
        brand: fallbackBrand,
        last4: fallbackLast4,
        expMonth: expiry.month,
        expYear: expiry.year,
        holderFirstName: firstName,
        holderLastName: lastName,
        holderDocType: docType,
        holderDocument: document,
        verificationStatus: 'pending',
        verificationAmount: buildCardVerificationChallenge(),
        verificationAttemptCount: 0,
        verificationLastRequestedAt: new Date(),
        verificationExpiresAt: getCardVerificationExpirationDate(),
      });
    }

    return res.status(201).json({
      paymentMethod: {
        ...serializeCard(paymentMethod),
        type: paymentMethod.type,
        provider: paymentMethod.provider,
      },
      verificationRequired: paymentMethod.verificationStatus !== 'verified',
      verificationWindowHours: CARD_VERIFICATION_WINDOW_HOURS,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Esta tarjeta ya se encuentra registrada.' });
    }
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/payment-methods/cards/:cardId/verification/request', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const cardId = toObjectId(req.params.cardId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!cardId) {
      return res.status(400).json({ message: 'Invalid card id' });
    }

    const card = await ParentPaymentMethod.findOne({
      _id: cardId,
      schoolId,
      parentUserId,
      type: 'card',
      status: 'active',
      deletedAt: null,
    });

    if (!card) {
      return res.status(404).json({ message: 'Tarjeta no encontrada.' });
    }

    if (card.verificationStatus === 'verified') {
      return res.status(200).json({
        card: serializeCard(card),
        verificationRequired: false,
      });
    }

    card.verificationStatus = 'pending';
    card.verificationAmount = buildCardVerificationChallenge();
    card.verificationAttemptCount = 0;
    card.verificationLastRequestedAt = new Date();
    card.verificationExpiresAt = getCardVerificationExpirationDate();
    card.verifiedAt = null;
    await card.save();

    return res.status(200).json({
      card: serializeCard(card),
      verificationRequired: true,
      verificationWindowHours: CARD_VERIFICATION_WINDOW_HOURS,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/payment-methods/cards/:cardId/verification/confirm', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const cardId = toObjectId(req.params.cardId);
    const amount = Number(req.body?.amount);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!cardId) {
      return res.status(400).json({ message: 'Invalid card id' });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'El monto de verificación no es válido.' });
    }

    const card = await ParentPaymentMethod.findOne({
      _id: cardId,
      schoolId,
      parentUserId,
      type: 'card',
      status: 'active',
      deletedAt: null,
    });

    if (!card) {
      return res.status(404).json({ message: 'Tarjeta no encontrada.' });
    }

    if (card.verificationStatus === 'verified') {
      return res.status(200).json({
        verified: true,
        card: serializeCard(card),
      });
    }

    if (!card.verificationAmount || !card.verificationExpiresAt) {
      return res.status(409).json({ message: 'La tarjeta no tiene una verificación pendiente activa.' });
    }

    if (new Date(card.verificationExpiresAt).getTime() < Date.now()) {
      card.verificationStatus = 'failed';
      await card.save();
      return res.status(400).json({
        message: 'La verificación expiró. Solicita una nueva verificación para continuar.',
        code: 'CARD_VERIFICATION_EXPIRED',
      });
    }

    if (card.verificationAttemptCount >= CARD_VERIFICATION_MAX_ATTEMPTS) {
      card.verificationStatus = 'failed';
      await card.save();
      return res.status(400).json({
        message: 'Se alcanzó el máximo de intentos. Solicita una nueva verificación.',
        code: 'CARD_VERIFICATION_ATTEMPTS_EXCEEDED',
      });
    }

    if (Number(card.verificationAmount) !== Math.round(amount)) {
      card.verificationAttemptCount = Number(card.verificationAttemptCount || 0) + 1;
      if (card.verificationAttemptCount >= CARD_VERIFICATION_MAX_ATTEMPTS) {
        card.verificationStatus = 'failed';
      }
      await card.save();
      return res.status(400).json({
        message: 'El valor ingresado no coincide con el cobro de verificación.',
        attemptsRemaining: Math.max(CARD_VERIFICATION_MAX_ATTEMPTS - Number(card.verificationAttemptCount || 0), 0),
        code: 'CARD_VERIFICATION_MISMATCH',
      });
    }

    card.verificationStatus = 'verified';
    card.verificationAttemptCount = 0;
    card.verificationAmount = null;
    card.verifiedAt = new Date();
    await card.save();

    return res.status(200).json({
      verified: true,
      card: serializeCard(card),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/portal/payment-methods/cards/:cardId', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const cardId = toObjectId(req.params.cardId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!cardId) {
      return res.status(400).json({ message: 'Invalid card id' });
    }

    const card = await ParentPaymentMethod.findOne({
      _id: cardId,
      schoolId,
      parentUserId,
      type: 'card',
      deletedAt: null,
    });

    if (!card) {
      return res.status(404).json({ message: 'Tarjeta no encontrada.' });
    }

    if (
      card.provider === 'mercadopago' &&
      card.providerCustomerId &&
      card.providerCardId &&
      isMercadoPagoConfigured()
    ) {
      try {
        await deleteCustomerCard({
          customerId: card.providerCustomerId,
          cardId: card.providerCardId,
        });
      } catch (providerError) {
        return res.status(502).json({
          message: providerError?.message || 'No fue posible eliminar la tarjeta en Mercado Pago.',
        });
      }
    }

    card.status = 'inactive';
    card.deletedAt = new Date();
    await card.save();

    return res.status(200).json({ message: 'Tarjeta eliminada correctamente.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/portal/students/:studentId/auto-debit', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.params.studentId);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    }).lean();

    if (!link) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const wallet = await Wallet.findOne({ schoolId, studentId });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    const enabled = Boolean(req.body?.enabled);
    if (!enabled) {
      wallet.autoDebitEnabled = false;
      wallet.autoDebitLimit = 0;
      wallet.autoDebitAmount = 0;
      wallet.autoDebitPaymentMethodId = null;
      wallet.autoDebitInProgress = false;
      wallet.autoDebitLockAt = null;
      wallet.autoDebitLastAttempt = null;
      wallet.autoDebitLastChargeAt = null;
      wallet.autoDebitRetryAt = null;
      wallet.autoDebitRetryCount = 0;
      wallet.autoDebitMonthlyUsed = 0;
      wallet.autoDebitMonthlyPeriod = '';
      await wallet.save();

      return res.status(200).json({
        student: {
          _id: studentId,
          wallet: {
            autoDebitEnabled: false,
            autoDebitLimit: 0,
            autoDebitAmount: 0,
            autoDebitPaymentMethodId: null,
            autoDebitInProgress: false,
            autoDebitLockAt: null,
            autoDebitLastAttempt: null,
            autoDebitLastChargeAt: null,
            autoDebitRetryAt: null,
            autoDebitRetryCount: 0,
            autoDebitMonthlyLimit: Number(wallet.autoDebitMonthlyLimit || 0),
            autoDebitMonthlyUsed: 0,
            autoDebitMonthlyPeriod: '',
          },
        },
      });
    }

    const autoDebitLimit = Number(req.body?.autoDebitLimit);
    const autoDebitAmount = Number(req.body?.autoDebitAmount);
    const requestedMonthlyLimit = Number(req.body?.autoDebitMonthlyLimit);
    const defaultMonthlyLimit = Number(process.env.AUTO_DEBIT_DEFAULT_MONTHLY_LIMIT || 1000000);
    const autoDebitMonthlyLimit = Number.isFinite(requestedMonthlyLimit) && requestedMonthlyLimit > 0
      ? requestedMonthlyLimit
      : (Number.isFinite(defaultMonthlyLimit) && defaultMonthlyLimit > 0 ? defaultMonthlyLimit : 1000000);
    const paymentMethodId = toObjectId(req.body?.paymentMethodId);

    if (!Number.isFinite(autoDebitLimit) || autoDebitLimit < 20000) {
      return res.status(400).json({ message: 'autoDebitLimit must be at least 20000' });
    }

    if (!Number.isFinite(autoDebitAmount) || autoDebitAmount < 30000) {
      return res.status(400).json({ message: 'autoDebitAmount must be at least 30000' });
    }

    if (!paymentMethodId) {
      return res.status(400).json({ message: 'paymentMethodId is required' });
    }

    const paymentMethod = await ParentPaymentMethod.findOne({
      _id: paymentMethodId,
      schoolId,
      parentUserId,
      type: 'card',
      provider: 'mercadopago',
      status: 'active',
      deletedAt: null,
      verificationStatus: 'verified',
    })
      .select('_id')
      .lean();

    if (!paymentMethod) {
      return res.status(404).json({ message: 'Tarjeta verificada no encontrada.' });
    }

    wallet.autoDebitEnabled = true;
    wallet.autoDebitLimit = autoDebitLimit;
    wallet.autoDebitAmount = autoDebitAmount;
    wallet.autoDebitMonthlyLimit = autoDebitMonthlyLimit;
    wallet.autoDebitPaymentMethodId = paymentMethodId;
    wallet.autoDebitInProgress = false;
    wallet.autoDebitLockAt = null;
    wallet.autoDebitRetryAt = null;
    wallet.autoDebitRetryCount = 0;
    await wallet.save();

    return res.status(200).json({
      student: {
        _id: studentId,
        wallet: {
          autoDebitEnabled: true,
          autoDebitLimit,
          autoDebitAmount,
          autoDebitMonthlyLimit,
          autoDebitPaymentMethodId: paymentMethodId,
          autoDebitInProgress: false,
          autoDebitLockAt: null,
          autoDebitRetryAt: null,
          autoDebitRetryCount: 0,
          autoDebitMonthlyUsed: Number(wallet.autoDebitMonthlyUsed || 0),
          autoDebitMonthlyPeriod: String(wallet.autoDebitMonthlyPeriod || ''),
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/portal/students/:studentId/blocks', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.params.studentId);
    const { type, targetId, blocked } = req.body;

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    if (!['category', 'product'].includes(String(type || ''))) {
      return res.status(400).json({ message: 'type must be category or product' });
    }

    const targetObjectId = toObjectId(targetId);
    if (!targetObjectId) {
      return res.status(400).json({ message: 'Invalid targetId' });
    }

    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    }).lean();

    if (!link) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const student = await Student.findOne({
      _id: studentId,
      schoolId,
      deletedAt: null,
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const shouldBlock = Boolean(blocked);

    if (String(type) === 'category') {
      const category = await Category.findOne({ _id: targetObjectId, schoolId, deletedAt: null }).lean();
      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }

      const current = Array.isArray(student.blockedCategories) ? student.blockedCategories.map((id) => String(id)) : [];
      if (shouldBlock) {
        if (!current.includes(String(targetObjectId))) {
          student.blockedCategories.push(targetObjectId);
        }
      } else {
        student.blockedCategories = student.blockedCategories.filter((id) => String(id) !== String(targetObjectId));
      }
    }

    if (String(type) === 'product') {
      const product = await Product.findOne({ _id: targetObjectId, schoolId, deletedAt: null }).lean();
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const current = Array.isArray(student.blockedProducts) ? student.blockedProducts.map((id) => String(id)) : [];
      if (shouldBlock) {
        if (!current.includes(String(targetObjectId))) {
          student.blockedProducts.push(targetObjectId);
        }
      } else {
        student.blockedProducts = student.blockedProducts.filter((id) => String(id) !== String(targetObjectId));
      }
    }

    await student.save();

    const updated = await Student.findOne({ _id: studentId, schoolId, deletedAt: null })
      .populate('blockedProducts', 'name')
      .populate('blockedCategories', 'name')
      .lean();

    return res.status(200).json({
      student: {
        _id: updated._id,
        blockedProducts: Array.isArray(updated.blockedProducts)
          ? updated.blockedProducts.map((item) => ({ _id: item._id, name: item.name || '' }))
          : [],
        blockedCategories: Array.isArray(updated.blockedCategories)
          ? updated.blockedCategories.map((item) => ({ _id: item._id, name: item.name || '' }))
          : [],
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/portal/students/:studentId/daily-limit', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const requestedParentUserId = role === 'admin' ? req.body.parentUserId || req.query.parentUserId : userId;
    const parentUserId = toObjectId(requestedParentUserId);
    const studentId = toObjectId(req.params.studentId);
    const parsedLimit = Number(req.body?.dailyLimit);

    if (!parentUserId) {
      return res.status(400).json({ message: 'Invalid parent user id' });
    }

    if (!studentId) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    if (!Number.isFinite(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({ message: 'dailyLimit must be a number greater than or equal to 0' });
    }

    const link = await ParentStudentLink.findOne({
      schoolId,
      parentId: parentUserId,
      studentId,
      status: 'active',
    }).lean();

    if (!link) {
      return res.status(403).json({ message: 'Forbidden studentId' });
    }

    const student = await Student.findOneAndUpdate(
      {
        _id: studentId,
        schoolId,
        deletedAt: null,
      },
      {
        dailyLimit: Math.round(parsedLimit),
      },
      {
        new: true,
      }
    ).lean();

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.status(200).json({
      student: {
        _id: student._id,
        dailyLimit: Number(student.dailyLimit || 0),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
