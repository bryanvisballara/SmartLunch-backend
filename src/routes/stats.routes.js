const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Order = require('../models/order.model');
const Product = require('../models/product.model');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('admin'));

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date) {
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const d = new Date(date);
  d.setDate(date.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

async function getKpi(req, res) {
  try {
    const { schoolId } = req.user;
    const lowStockThreshold = Number(req.query.lowStockThreshold || 10);
    const now = new Date();

    const [salesToday, salesWeek, salesMonth] = await Promise.all([
      Order.aggregate([
        { $match: { schoolId, status: 'completed', createdAt: { $gte: startOfDay(now) } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { schoolId, status: 'completed', createdAt: { $gte: startOfWeek(now) } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Order.aggregate([
        { $match: { schoolId, status: 'completed', createdAt: { $gte: startOfMonth(now) } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
    ]);

    const lowStockProducts = await Product.countDocuments({
      schoolId,
      status: 'active',
      deletedAt: null,
      stock: { $lte: lowStockThreshold },
    });

    return res.status(200).json({
      salesToday: salesToday[0]?.total || 0,
      salesWeek: salesWeek[0]?.total || 0,
      salesMonth: salesMonth[0]?.total || 0,
      lowStockProducts,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

router.get(['/kpi', '/'], getKpi);

module.exports = router;
