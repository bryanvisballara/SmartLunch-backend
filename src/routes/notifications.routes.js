const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const DeviceToken = require('../models/deviceToken.model');
const Notification = require('../models/notification.model');
const { queueCafeteriaPromoNotifications } = require('../services/notification.service');

const router = express.Router();

const notificationInboxRoles = [
  'parent',
  'student',
  'admin',
  'teacher',
  'psychology',
  'nursing',
  'academic_secretary',
  'admissions',
  'coordination',
  'billing',
  'rectoria',
  'direccion',
];

// Academy unread is tracked by Conecta/Informa cursors and merged in the UI badge.
// Keep these out of the generic unread-count to avoid double-counting.
const ACADEMY_NOTIFICATION_TYPES = ['informa.post', 'conecta.case'];
const academyNotificationTypeFilter = {
  $nor: ACADEMY_NOTIFICATION_TYPES.map((type) => ({ 'payload.type': type })),
};

let deviceTokenIndexMigrationPromise = null;

async function ensureDeviceTokenIndexes() {
  if (!deviceTokenIndexMigrationPromise) {
    deviceTokenIndexMigrationPromise = (async () => {
      try {
        const indexes = await DeviceToken.collection.indexes();
        const legacyTokenIndex = indexes.find((index) => index.name === 'token_1' && index.unique === true);
        if (legacyTokenIndex) {
          await DeviceToken.collection.dropIndex('token_1');
          console.info('[DEVICE_TOKEN_INDEX] dropped legacy unique token_1 index');
        }
      } catch (error) {
        if (error?.codeName !== 'IndexNotFound') {
          console.warn(`[DEVICE_TOKEN_INDEX_MIGRATION_FAILED] ${error.message}`);
        }
      }

      try {
        await DeviceToken.collection.createIndex({ schoolId: 1, userId: 1, token: 1 }, { unique: true, name: 'schoolId_1_userId_1_token_1' });
      } catch (error) {
        console.warn(`[DEVICE_TOKEN_INDEX_CREATE_FAILED] ${error.message}`);
      }
    })();
  }

  return deviceTokenIndexMigrationPromise;
}

router.use(authMiddleware);

router.post('/device-tokens', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { platform, token } = req.body;

    if (!platform || !token) {
      return res.status(400).json({ message: 'platform and token are required' });
    }

    if (!['web', 'ios', 'android'].includes(platform)) {
      return res.status(400).json({ message: 'Invalid platform' });
    }

    await ensureDeviceTokenIndexes();

    const deviceToken = await DeviceToken.findOneAndUpdate(
      { schoolId, userId, token },
      {
        schoolId,
        userId,
        platform,
        token,
        lastSeenAt: new Date(),
        status: 'active',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json(deviceToken);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/device-tokens/revoke', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'token is required' });
    }

    const updated = await DeviceToken.findOneAndUpdate(
      { token, schoolId, userId },
      { status: 'revoked', lastSeenAt: new Date() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Device token not found' });
    }

    return res.status(200).json(updated);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/admin/promo', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    const studentId = String(req.body?.studentId || '').trim();

    if (!title || !body) {
      return res.status(400).json({ message: 'El título y el mensaje son obligatorios.' });
    }

    if (studentId && !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'studentId is invalid' });
    }

    const result = await queueCafeteriaPromoNotifications({
      schoolId,
      title,
      body,
      studentId: studentId || null,
    });

    if (!result.notificationsCreated) {
      return res.status(400).json({
        message: result.reason || 'No hay acudientes para enviar la promoción.',
        result,
      });
    }

    return res.status(201).json({
      message: result.queued
        ? `Promoción encolada para ${result.parentsTargeted} acudiente(s).`
        : `Promoción enviada a ${result.parentsTargeted} acudiente(s).`,
      result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
});

router.get('/audit', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const {
      studentId,
      parentId,
      type,
      status,
      from,
      to,
      q,
      page = 1,
      limit = 50,
    } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.min(200, Math.max(1, Number(limit) || 50));

    const filter = { schoolId };

    if (studentId) {
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ message: 'studentId is invalid' });
      }
      filter.studentId = studentId;
    }

    if (parentId) {
      if (!mongoose.Types.ObjectId.isValid(parentId)) {
        return res.status(400).json({ message: 'parentId is invalid' });
      }
      filter.parentId = parentId;
    }

    if (status) {
      filter.status = status;
    }

    if (type) {
      filter['payload.type'] = type;
    }

    const createdAtRange = {};
    if (from) {
      const fromDate = new Date(`${from}T00:00:00.000Z`);
      if (Number.isNaN(fromDate.getTime())) {
        return res.status(400).json({ message: 'from date is invalid' });
      }
      createdAtRange.$gte = fromDate;
    }
    if (to) {
      const toDate = new Date(`${to}T23:59:59.999Z`);
      if (Number.isNaN(toDate.getTime())) {
        return res.status(400).json({ message: 'to date is invalid' });
      }
      createdAtRange.$lte = toDate;
    }
    if (Object.keys(createdAtRange).length > 0) {
      filter.createdAt = createdAtRange;
    }

    if (q) {
      const textFilter = {
        $or: [
          { title: { $regex: q, $options: 'i' } },
          { body: { $regex: q, $options: 'i' } },
          { lastError: { $regex: q, $options: 'i' } },
        ],
      };
      filter.$and = filter.$and || [];
      filter.$and.push(textFilter);
    }

    const [items, total] = await Promise.all([
      Notification.find(filter)
        .populate('studentId', 'name schoolCode grade')
        .populate('parentId', 'name username')
        .sort({ createdAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber),
      Notification.countDocuments(filter),
    ]);

    return res.status(200).json({
      items,
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNumber)),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/unread-count', roleMiddleware(...notificationInboxRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const count = await Notification.countDocuments({
      schoolId,
      parentId: userId,
      dismissedAt: null,
      readAt: null,
      ...academyNotificationTypeFilter,
    });
    return res.status(200).json({ count, unreadCount: count });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/dismiss', roleMiddleware(...notificationInboxRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ message: 'id is invalid' });
    }

    const updated = await Notification.findOneAndUpdate(
      { _id: id, schoolId, parentId: userId, dismissedAt: null },
      { $set: { dismissedAt: new Date(), readAt: new Date() } },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    const unreadCount = await Notification.countDocuments({
      schoolId,
      parentId: userId,
      dismissedAt: null,
      readAt: null,
    });

    return res.status(200).json({ notification: updated, unreadCount });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/read-all', roleMiddleware(...notificationInboxRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const now = new Date();
    await Notification.updateMany(
      { schoolId, parentId: userId, dismissedAt: null, readAt: null },
      { $set: { readAt: now } },
    );
    return res.status(200).json({ unreadCount: 0 });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/', roleMiddleware(...notificationInboxRoles), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const { parentId } = req.query;

    const filter = {
      schoolId,
      dismissedAt: null,
    };

    if (role === 'admin' && parentId) {
      filter.parentId = parentId;
    } else if (role === 'admin' && !parentId) {
      // Admin without parent filter keeps previous audit-oriented listing.
      delete filter.dismissedAt;
    } else {
      filter.parentId = userId;
    }

    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
    const unreadCount = role === 'admin' && !parentId
      ? 0
      : await Notification.countDocuments({
        schoolId,
        parentId: filter.parentId || userId,
        dismissedAt: null,
        readAt: null,
      });

    return res.status(200).json({
      items: notifications,
      unreadCount,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
