const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Store = require('../models/store.model');
const User = require('../models/user.model');
const { publishComanderaChange } = require('../utils/comanderaHub');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const stores = await Store.find({ schoolId, deletedAt: null, status: 'active' })
      .select('_id name location status comanderaEnabled')
      .sort({ name: 1 })
      .lean();

    return res.status(200).json(stores);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/:id/comandera', roleMiddleware('vendor', 'admin'), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const store = await Store.findOne({ _id: req.params.id, schoolId, deletedAt: null });
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    if (role === 'vendor') {
      const user = await User.findById(userId).select('assignedStoreId');
      if (String(user?.assignedStoreId || '') !== String(store._id)) {
        return res.status(403).json({ message: 'You can only update your assigned store' });
      }
    }

    store.comanderaEnabled = Boolean(req.body?.enabled);
    await store.save();
    publishComanderaChange(schoolId, store._id);

    return res.status(200).json({
      _id: store._id,
      name: store.name,
      location: store.location,
      status: store.status,
      comanderaEnabled: Boolean(store.comanderaEnabled),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;