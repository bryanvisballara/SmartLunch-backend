const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const DeviceToken = require('../models/deviceToken.model');
const Notification = require('../models/notification.model');

const router = express.Router();

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

    const deviceToken = await DeviceToken.findOneAndUpdate(
      { token },
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

router.get('/', roleMiddleware('parent', 'admin'), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const { parentId } = req.query;

    const filter = { schoolId };

    if (role === 'parent') {
      filter.parentId = userId;
    }

    if (role === 'admin' && parentId) {
      filter.parentId = parentId;
    }

    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
    return res.status(200).json(notifications);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
