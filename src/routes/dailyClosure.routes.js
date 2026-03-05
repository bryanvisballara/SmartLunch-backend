const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const DailyClosure = require('../models/dailyClosure.model');

const router = express.Router();

router.use(authMiddleware);

router.post('/', roleMiddleware('vendor', 'admin'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const {
      storeId,
      date,
      systemCash = 0,
      systemTransfer = 0,
      systemDataphone = 0,
      systemWallet = 0,
      baseInitial = 0,
      baseFinal = 0,
      countedCash = 0,
      notes,
    } = req.body;

    if (!storeId || !date) {
      return res.status(400).json({ message: 'storeId and date are required' });
    }

    const expectedCash = Number(systemCash) + Number(baseInitial);
    const cashDifference = Number(countedCash) - expectedCash;

    const closure = await DailyClosure.findOneAndUpdate(
      { schoolId, storeId, vendorId: userId, date },
      {
        schoolId,
        storeId,
        vendorId: userId,
        date,
        systemCash,
        systemTransfer,
        systemDataphone,
        systemWallet,
        baseInitial,
        baseFinal,
        countedCash,
        cashDifference,
        notes,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json(closure);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/', roleMiddleware('admin', 'vendor'), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const { storeId, date, vendorId } = req.query;

    const filter = { schoolId };

    if (storeId) {
      filter.storeId = storeId;
    }

    if (date) {
      filter.date = date;
    }

    if (role === 'vendor') {
      filter.vendorId = userId;
    }

    if (role === 'admin' && vendorId) {
      filter.vendorId = vendorId;
    }

    const closures = await DailyClosure.find(filter).sort({ date: -1, createdAt: -1 });

    return res.status(200).json(closures);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
