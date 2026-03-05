const express = require('express');

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
