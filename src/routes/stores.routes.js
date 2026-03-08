const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const Store = require('../models/store.model');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const stores = await Store.find({ schoolId, deletedAt: null, status: 'active' })
      .select('_id name location status')
      .sort({ name: 1 })
      .lean();

    return res.status(200).json(stores);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;