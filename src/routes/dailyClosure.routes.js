const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const DailyClosure = require('../models/dailyClosure.model');
const Order = require('../models/order.model');

const router = express.Router();

router.use(authMiddleware);

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

async function getPreviousClosure({ schoolId, storeObjectId, vendorObjectId, dateKey }) {
  return DailyClosure.findOne({
    schoolId,
    storeId: storeObjectId,
    vendorId: vendorObjectId,
    date: { $lt: dateKey },
  })
    .sort({ date: -1, createdAt: -1 })
    .lean();
}

router.get('/summary', roleMiddleware('vendor', 'admin'), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const { storeId, date } = req.query;

    if (!storeId) {
      return res.status(400).json({ message: 'storeId is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({ message: 'Invalid storeId' });
    }

    const targetDate = date ? new Date(date) : new Date();
    const from = startOfDay(targetDate);
    const to = endOfDay(targetDate);

    const match = {
      schoolId,
      storeId: new mongoose.Types.ObjectId(storeId),
      status: 'completed',
      createdAt: { $gte: from, $lt: to },
    };

    if (role === 'vendor') {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Invalid vendor userId in token' });
      }
      match.vendorId = new mongoose.Types.ObjectId(userId);
    }

    const totals = await Order.aggregate([
      { $match: match },
      { $group: { _id: '$paymentMethod', total: { $sum: '$total' } } },
    ]);

    const byMethod = {
      cash: 0,
      dataphone: 0,
      qr: 0,
      system: 0,
      transfer: 0,
    };

    for (const item of totals) {
      byMethod[item._id] = Number(item.total || 0);
    }

    const dateKey = from.toISOString().slice(0, 10);
    const closureFilter = {
      schoolId,
      storeId: new mongoose.Types.ObjectId(storeId),
      date: dateKey,
    };
    if (role === 'vendor') {
      closureFilter.vendorId = new mongoose.Types.ObjectId(userId);
    }

    const existing = await DailyClosure.findOne(closureFilter).lean();
    const previous = role === 'vendor'
      ? await getPreviousClosure({
          schoolId,
          storeObjectId: new mongoose.Types.ObjectId(storeId),
          vendorObjectId: new mongoose.Types.ObjectId(userId),
          dateKey,
        })
      : null;

    const baseInitial = Number(existing?.baseInitial ?? previous?.baseFinal ?? 0);
    const baseFinal = Number(existing?.baseFinal || 0);
    const countedCash = Number(existing?.countedCash || 0);
    const cashAccordingSystem = Number(byMethod.cash);
    const totalSales = Number(byMethod.cash + byMethod.dataphone + byMethod.qr + byMethod.system + byMethod.transfer);
    const expectedCash = cashAccordingSystem + baseInitial - baseFinal;
    const balanceReferenceCash = cashAccordingSystem + baseInitial;
    const deficit = countedCash - balanceReferenceCash;
    const totalCashSaved = countedCash - baseFinal;

    return res.status(200).json({
      storeId,
      date: dateKey,
      ingresosEfectivo: byMethod.cash,
      ingresosDatafono: byMethod.dataphone,
      ingresosQr: byMethod.qr,
      ingresosSistema: byMethod.system,
      ingresosTransfer: byMethod.transfer,
      totalIngresos: totalSales,
      totalSoloEfectivoSistema: cashAccordingSystem,
      expectedCash,
      totalSoloEfectivoReal: countedCash,
      baseInicial: baseInitial,
      baseFinal,
      totalEfectivoGuardado: totalCashSaved,
      deficit,
      notes: existing?.notes || '',
      isClosed: Boolean(existing),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/', roleMiddleware('vendor', 'admin'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const {
      storeId,
      date,
      systemCash = 0,
      systemQr = 0,
      systemTransfer = 0,
      systemDataphone = 0,
      systemWallet = 0,
      baseFinal = 0,
      countedCash = 0,
      notes,
    } = req.body;

    if (!storeId || !date) {
      return res.status(400).json({ message: 'storeId and date are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(storeId)) {
      return res.status(400).json({ message: 'Invalid storeId' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid vendor userId in token' });
    }

    const targetDate = new Date(date);
    if (Number.isNaN(targetDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date' });
    }
    const dateKey = targetDate.toISOString().slice(0, 10);

    const storeObjectId = new mongoose.Types.ObjectId(storeId);
    const vendorObjectId = new mongoose.Types.ObjectId(userId);

    const alreadyClosed = await DailyClosure.findOne({
      schoolId,
      storeId: storeObjectId,
      vendorId: vendorObjectId,
      date: dateKey,
    }).lean();

    if (alreadyClosed) {
      return res.status(409).json({ message: 'El cierre de hoy ya fue ejecutado' });
    }

    const previous = await getPreviousClosure({
      schoolId,
      storeObjectId,
      vendorObjectId,
      dateKey,
    });

    const carriedBaseInitial = Number(previous?.baseFinal || 0);
    const totalSales = Number(systemCash) + Number(systemQr) + Number(systemTransfer) + Number(systemDataphone) + Number(systemWallet);
    const cashAccordingSystem = Number(systemCash);
    const expectedCash = cashAccordingSystem + carriedBaseInitial - Number(baseFinal);
    const balanceReferenceCash = cashAccordingSystem + carriedBaseInitial;
    const cashDifference = Number(countedCash) - balanceReferenceCash;
    const totalCashSaved = Number(countedCash) - Number(baseFinal);

    const closure = await DailyClosure.create({
      schoolId,
      storeId: storeObjectId,
      vendorId: vendorObjectId,
      date: dateKey,
      systemCash,
      systemQr,
      systemTransfer,
      systemDataphone,
      systemWallet,
      totalSales,
      cashAccordingSystem,
      baseInitial: carriedBaseInitial,
      baseFinal,
      countedCash,
      totalCashSaved,
      cashDifference,
      notes,
    });

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

    const closures = await DailyClosure.find(filter)
      .populate('storeId', 'name')
      .populate('vendorId', 'name username')
      .sort({ date: -1, createdAt: -1 })
      .limit(200);

    return res.status(200).json(closures);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
