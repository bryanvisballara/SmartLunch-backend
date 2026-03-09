const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const Wallet = require('../models/wallet.model');
const FixedCost = require('../models/fixedCost.model');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('admin'));

const orderAggregate = (pipeline) => Order.aggregate(pipeline).allowDiskUse(true);

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
      orderAggregate([
        { $match: { schoolId, status: 'completed', createdAt: { $gte: startOfDay(now) } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      orderAggregate([
        { $match: { schoolId, status: 'completed', createdAt: { $gte: startOfWeek(now) } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      orderAggregate([
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

function resolveStoreFilter(storeIdRaw) {
  const normalized = String(storeIdRaw || '').trim();
  if (!normalized || normalized === 'all') {
    return null;
  }
  if (!mongoose.Types.ObjectId.isValid(normalized)) {
    return 'invalid';
  }
  return new mongoose.Types.ObjectId(normalized);
}

async function getUtilityForPeriod(baseMatch, periodStart) {
  const data = await orderAggregate([
    { $match: { ...baseMatch, createdAt: { $gte: periodStart } } },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.productId',
        foreignField: '_id',
        as: 'product',
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$items.subtotal' },
        costTotal: {
          $sum: {
            $multiply: ['$items.quantity', { $ifNull: ['$product.cost', 0] }],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        utility: { $subtract: ['$revenue', '$costTotal'] },
      },
    },
  ]);

  return data[0]?.utility || 0;
}

router.get(['/kpi', '/'], getKpi);

router.get('/admin-home', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const storeFilter = resolveStoreFilter(req.query.storeId);
    if (storeFilter === 'invalid') {
      return res.status(400).json({ message: 'Invalid storeId' });
    }

    const lowStockThreshold = Number(req.query.lowStockThreshold || 10);
    const lowBalanceThreshold = Number(req.query.lowBalanceThreshold || 20000);
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const orderMatch = {
      schoolId,
      status: 'completed',
    };

    if (storeFilter) {
      orderMatch.storeId = storeFilter;
    }

    const inventoryFilter = {
      schoolId,
      status: 'active',
      deletedAt: null,
    };

    if (storeFilter) {
      inventoryFilter.storeId = storeFilter;
    }

    const fixedCostFilter = {
      schoolId,
      status: 'active',
      deletedAt: null,
    };

    if (storeFilter) {
      fixedCostFilter.$or = [{ storeId: null }, { storeId: storeFilter }];
    }

    const [salesToday, salesWeek, salesMonth, utilityToday, utilityWeek, utilityMonth, topStudentsRaw, topProductsRaw, profitabilityRaw, lowStockProducts, lowBalanceStudents, fixedCosts, activeProductsRaw] = await Promise.all([
      orderAggregate([
        { $match: { ...orderMatch, createdAt: { $gte: startOfDay(now) } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      orderAggregate([
        { $match: { ...orderMatch, createdAt: { $gte: startOfWeek(now) } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      orderAggregate([
        { $match: { ...orderMatch, createdAt: { $gte: startOfMonth(now) } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      getUtilityForPeriod(orderMatch, startOfDay(now)),
      getUtilityForPeriod(orderMatch, startOfWeek(now)),
      getUtilityForPeriod(orderMatch, startOfMonth(now)),
      orderAggregate([
        {
          $match: {
            ...orderMatch,
            studentId: { $ne: null },
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: '$studentId',
            totalSpent: { $sum: '$total' },
          },
        },
        {
          $addFields: {
            averageDailySpent: { $divide: ['$totalSpent', 30] },
          },
        },
        { $sort: { totalSpent: -1 } },
        { $limit: 8 },
        {
          $lookup: {
            from: 'students',
            localField: '_id',
            foreignField: '_id',
            as: 'student',
          },
        },
        { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            studentId: '$_id',
            studentName: '$student.name',
            schoolCode: '$student.schoolCode',
            totalSpent: 1,
            averageDailySpent: 1,
          },
        },
      ]),
      orderAggregate([
        { $match: { ...orderMatch, createdAt: { $gte: thirtyDaysAgo } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.subtotal' },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            productId: '$_id',
            productName: '$product.name',
            quantity: 1,
            revenue: 1,
          },
        },
      ]),
      orderAggregate([
        { $match: { ...orderMatch, createdAt: { $gte: thirtyDaysAgo } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            quantitySold: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.subtotal' },
          },
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            unitCost: { $ifNull: ['$product.cost', 0] },
          },
        },
        {
          $addFields: {
            utilityValue: {
              $subtract: ['$revenue', { $multiply: ['$quantitySold', '$unitCost'] }],
            },
          },
        },
        {
          $addFields: {
            utilityPercent: {
              $cond: [{ $gt: ['$revenue', 0] }, { $multiply: [{ $divide: ['$utilityValue', '$revenue'] }, 100] }, 0],
            },
          },
        },
        {
          $project: {
            _id: 0,
            productId: '$_id',
            productName: '$product.name',
            quantitySold: 1,
            revenue: 1,
            utilityValue: 1,
            utilityPercent: 1,
          },
        },
      ]),
      Product.find({
        ...inventoryFilter,
        $expr: {
          $lte: ['$stock', { $ifNull: ['$inventoryAlertStock', lowStockThreshold] }],
        },
      })
        .select('_id name stock inventoryAlertStock storeId categoryId')
        .populate('storeId', 'name')
        .setOptions({ allowDiskUse: true })
        .sort({ stock: 1, name: 1 })
        .limit(20)
        .lean(),
      Wallet.find({ schoolId, status: 'active', balance: { $lte: lowBalanceThreshold } })
        .populate('studentId', 'name schoolCode grade status')
        .setOptions({ allowDiskUse: true })
        .sort({ balance: 1 })
        .limit(20)
        .lean(),
      FixedCost.find(fixedCostFilter)
        .populate('storeId', 'name')
        .sort({ createdAt: -1 })
        .lean(),
      Product.find(inventoryFilter)
        .select('_id name price cost')
        .setOptions({ allowDiskUse: true })
        .sort({ name: 1 })
        .lean(),
    ]);

    const normalizedBalances = lowBalanceStudents
      .filter((item) => item.studentId)
      .map((wallet) => ({
        walletId: wallet._id,
        studentId: wallet.studentId._id,
        studentName: wallet.studentId.name,
        schoolCode: wallet.studentId.schoolCode,
        grade: wallet.studentId.grade,
        balance: wallet.balance,
      }));

    const catalogProfitability = (activeProductsRaw || []).map((product) => {
      const price = Number(product.price || 0);
      const cost = Number(product.cost || 0);
      const utilityValue = price - cost;
      const utilityPercent = price > 0 ? (utilityValue / price) * 100 : 0;

      return {
        productId: product._id,
        productName: product.name,
        quantitySold: 0,
        revenue: 0,
        utilityValue,
        utilityPercent,
      };
    });

    const profitabilitySource = profitabilityRaw.length > 0 ? profitabilityRaw : catalogProfitability;

    const topProductsByPercent = [...profitabilitySource]
      .sort((a, b) => (b.utilityPercent || 0) - (a.utilityPercent || 0) || (b.utilityValue || 0) - (a.utilityValue || 0))
      .slice(0, 10);

    const topProductsByValue = [...profitabilitySource]
      .sort((a, b) => (b.utilityValue || 0) - (a.utilityValue || 0) || (b.revenue || 0) - (a.revenue || 0))
      .slice(0, 10);

    const leastProfitableProductsByPercent = [...profitabilitySource]
      .sort((a, b) => (a.utilityPercent || 0) - (b.utilityPercent || 0) || (a.utilityValue || 0) - (b.utilityValue || 0))
      .slice(0, 10);

    const fixedCostsOnly = fixedCosts.filter((item) => String(item.type || 'fixed') !== 'variable');
    const variableCostsOnly = fixedCosts.filter((item) => String(item.type || 'fixed') === 'variable');

    const totalFixedCosts = fixedCostsOnly.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalVariableCosts = variableCostsOnly.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const salesMonthTotal = Number(salesMonth[0]?.total || 0);
    const utilityTheoreticalMonth = Number(utilityMonth || 0) - totalFixedCosts - totalVariableCosts;
    const utilityNetMonth = salesMonthTotal - totalFixedCosts - totalVariableCosts;

    return res.status(200).json({
      salesToday: salesToday[0]?.total || 0,
      salesWeek: salesWeek[0]?.total || 0,
      salesMonth: salesMonth[0]?.total || 0,
      utilityToday,
      utilityWeek,
      utilityMonth,
      utilityTheoreticalMonth,
      lowStockCount: lowStockProducts.length,
      lowBalanceCount: normalizedBalances.length,
      topStudents: topStudentsRaw,
      topProducts: topProductsRaw,
      topProductsByPercent,
      topProductsByValue,
      leastProfitableProductsByPercent,
      lowStockProducts,
      lowBalanceStudents: normalizedBalances,
      fixedCosts: fixedCostsOnly,
      variableCosts: variableCostsOnly,
      totalFixedCosts,
      totalVariableCosts,
      utilityNetMonth,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
