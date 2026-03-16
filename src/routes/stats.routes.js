const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const Wallet = require('../models/wallet.model');
const FixedCost = require('../models/fixedCost.model');
const Student = require('../models/student.model');
const WalletTransaction = require('../models/walletTransaction.model');
const Category = require('../models/category.model');
const Supplier = require('../models/supplier.model');

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware('admin'));

const orderAggregate = (pipeline) => Order.aggregate(pipeline).allowDiskUse(true);

const BOGOTA_UTC_OFFSET_MS = -5 * 60 * 60 * 1000;

function getBogotaShiftedDate(date = new Date()) {
  return new Date(date.getTime() + BOGOTA_UTC_OFFSET_MS);
}

function bogotaLocalToUtcDate(year, monthIndex, day, hour = 0, minute = 0, second = 0, millisecond = 0) {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, second, millisecond) - BOGOTA_UTC_OFFSET_MS);
}

function startOfDay(date) {
  const shifted = getBogotaShiftedDate(date);
  return bogotaLocalToUtcDate(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

function startOfWeek(date) {
  const shifted = getBogotaShiftedDate(date);
  const day = shifted.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;

  return bogotaLocalToUtcDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + diff
  );
}

function startOfMonth(date) {
  const shifted = getBogotaShiftedDate(date);
  return bogotaLocalToUtcDate(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
}

function endOfMonth(date) {
  const shifted = getBogotaShiftedDate(date);
  return bogotaLocalToUtcDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1);
}

function monthKeyFromDate(date) {
  const shifted = getBogotaShiftedDate(date);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function parseMonthKey(value) {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return null;
  }

  const [yearText, monthText] = normalized.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return {
    monthKey: normalized,
    start: bogotaLocalToUtcDate(year, month - 1, 1),
    end: bogotaLocalToUtcDate(year, month, 1),
  };
}

function getBogotaWeekKey(date) {
  const shifted = getBogotaShiftedDate(date);
  const day = shifted.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const weekStartShifted = new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + diff
  ));

  const year = weekStartShifted.getUTCFullYear();
  const month = String(weekStartShifted.getUTCMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(weekStartShifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

function buildAiRecommendations({
  topStudents,
  lowStockProducts,
  topProducts,
  hourlySales,
  productTrend,
}) {
  const recommendations = [];

  const safeTopStudents = Array.isArray(topStudents) ? topStudents : [];
  const safeLowStock = Array.isArray(lowStockProducts) ? lowStockProducts : [];
  const safeTopProducts = Array.isArray(topProducts) ? topProducts : [];
  const safeHourly = Array.isArray(hourlySales) ? hourlySales : [];
  const safeTrend = Array.isArray(productTrend) ? productTrend : [];

  if (safeHourly.length > 0) {
    const sortedByRevenue = [...safeHourly].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
    const bestHour = sortedByRevenue[0];
    const lowestHour = sortedByRevenue[sortedByRevenue.length - 1];

    recommendations.push({
      type: 'hour_peak',
      priority: 'high',
      title: 'Refuerza inventario en hora pico',
      detail: `Mayor demanda en franja ${String(bestHour.hour).padStart(2, '0')}:00 con ${Number(bestHour.orders || 0)} pedidos.`,
      action: 'Aumenta alistamiento y stock de productos mas vendidos antes de esa hora.',
    });

    if (lowestHour && Number(lowestHour.orders || 0) > 0 && Number(bestHour.orders || 0) >= Number(lowestHour.orders || 0) * 1.5) {
      recommendations.push({
        type: 'hour_valley',
        priority: 'medium',
        title: 'Activa promociones en horas valle',
        detail: `Menor movimiento en ${String(lowestHour.hour).padStart(2, '0')}:00 (${Number(lowestHour.orders || 0)} pedidos).`,
        action: 'Lanza combos o promociones puntuales para mover inventario en esa franja.',
      });
    }
  }

  if (safeTopStudents.length > 0) {
    const topStudent = safeTopStudents[0];
    recommendations.push({
      type: 'student_behavior',
      priority: 'medium',
      title: 'Monitorea alumnos de alto consumo',
      detail: `${topStudent.studentName || 'Alumno'} presenta gasto promedio diario de ${Math.round(Number(topStudent.averageDailySpent || 0)).toLocaleString('es-CO')} COP.`,
      action: 'Revisa topes diarios y comunica opciones de compra balanceadas con acudientes.',
    });
  }

  if (safeLowStock.length > 0) {
    const critical = safeLowStock
      .filter((item) => Number(item.stock || 0) <= Number(item.inventoryAlertStock || 0))
      .slice(0, 3)
      .map((item) => item.name)
      .filter(Boolean);

    recommendations.push({
      type: 'stock_risk',
      priority: 'high',
      title: 'Riesgo de quiebre en productos clave',
      detail: critical.length > 0
        ? `Productos criticos: ${critical.join(', ')}.`
        : `Hay ${safeLowStock.length} productos en alerta de stock.`,
      action: 'Incrementa pedido semanal de referencias criticas para evitar ruptura en hora pico.',
    });
  }

  const growthCandidates = safeTrend
    .filter((item) => Number(item.previousQty || 0) > 0 && Number(item.growthPercent || 0) >= 25)
    .sort((a, b) => Number(b.growthPercent || 0) - Number(a.growthPercent || 0));

  if (growthCandidates.length > 0) {
    const target = growthCandidates[0];
    recommendations.push({
      type: 'product_growth',
      priority: 'high',
      title: 'Aumenta pedido de producto en crecimiento',
      detail: `${target.productName || 'Producto'} crecio ${Number(target.growthPercent || 0).toFixed(1)}% vs semana anterior.`,
      action: 'Sube pedido de ese producto para la proxima semana y valida capacidad de produccion/compra.',
    });
  }

  const dropCandidates = safeTrend
    .filter((item) => Number(item.previousQty || 0) > 0 && Number(item.growthPercent || 0) <= -25)
    .sort((a, b) => Number(a.growthPercent || 0) - Number(b.growthPercent || 0));

  if (dropCandidates.length > 0) {
    const target = dropCandidates[0];
    recommendations.push({
      type: 'product_drop',
      priority: 'medium',
      title: 'Reduce pedido de baja rotacion',
      detail: `${target.productName || 'Producto'} cayo ${Math.abs(Number(target.growthPercent || 0)).toFixed(1)}% vs semana anterior.`,
      action: 'Reduce volumen del pedido y evalua reemplazo por productos con mayor rotacion.',
    });
  }

  if (recommendations.length === 0 && safeTopProducts.length > 0) {
    recommendations.push({
      type: 'general',
      priority: 'low',
      title: 'Mantener estrategia actual',
      detail: 'No se detectaron variaciones fuertes en el patron de venta reciente.',
      action: 'Mantener pedidos actuales y monitorear cambios durante la semana.',
    });
  }

  return recommendations.slice(0, 6);
}

async function getKpi(req, res) {
  try {
    const { schoolId } = req.user;
    const lowStockThreshold = Number(req.query.lowStockThreshold || 10);
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

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
        { $match: { schoolId, status: 'completed', createdAt: { $gte: monthStart, $lt: monthEnd } } },
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

async function getUtilityForPeriod(baseMatch, periodStart, periodEnd = null) {
  const createdAtMatch = periodEnd
    ? { $gte: periodStart, $lt: periodEnd }
    : { $gte: periodStart };

  const data = await orderAggregate([
    { $match: { ...baseMatch, createdAt: createdAtMatch } },
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
    const requestedMonth = parseMonthKey(req.query.month);
    const monthStart = requestedMonth?.start || startOfMonth(now);
    const monthEnd = requestedMonth?.end || endOfMonth(now);
    const currentMonthKey = requestedMonth?.monthKey || monthKeyFromDate(now);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const last7Start = new Date(startOfDay(now));
    last7Start.setUTCDate(last7Start.getUTCDate() - 6);
    const prev7Start = new Date(last7Start);
    prev7Start.setUTCDate(prev7Start.getUTCDate() - 7);

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
      $or: [
        { monthKey: currentMonthKey },
        {
          monthKey: { $exists: false },
          createdAt: { $gte: monthStart, $lt: monthEnd },
        },
      ],
    };

    if (storeFilter) {
      fixedCostFilter.$and = [{ $or: [{ storeId: null }, { storeId: storeFilter }] }];
    }

    const [
      salesToday,
      salesWeek,
      salesMonth,
      utilityToday,
      utilityWeek,
      utilityMonth,
      topStudentsRaw,
      topProductsRaw,
      profitabilityRaw,
      lowStockProducts,
      lowBalanceStudents,
      fixedCosts,
      activeProductsRaw,
      totalSubscribedStudents,
      totalAutoDebitActiveStudents,
      hourlySalesRaw,
      productWeeklyTrendRaw,
      accountingSalesRaw,
      topupsRaw,
    ] = await Promise.all([
      orderAggregate([
        { $match: { ...orderMatch, createdAt: { $gte: startOfDay(now) } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      orderAggregate([
        { $match: { ...orderMatch, createdAt: { $gte: startOfWeek(now) } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      orderAggregate([
        { $match: { ...orderMatch, createdAt: { $gte: monthStart, $lt: monthEnd } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      getUtilityForPeriod(orderMatch, startOfDay(now)),
      getUtilityForPeriod(orderMatch, startOfWeek(now)),
      getUtilityForPeriod(orderMatch, monthStart, monthEnd),
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
            _id: {
              studentId: '$studentId',
              day: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                },
              },
            },
            dailySpent: { $sum: '$total' },
          },
        },
        {
          $group: {
            _id: '$_id.studentId',
            totalSpent: { $sum: '$dailySpent' },
            daysWithOrders: { $sum: 1 },
          },
        },
        {
          $addFields: {
            averageDailySpent: {
              $cond: [
                { $gt: ['$daysWithOrders', 0] },
                { $divide: ['$totalSpent', '$daysWithOrders'] },
                0,
              ],
            },
          },
        },
        { $sort: { averageDailySpent: -1, totalSpent: -1 } },
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
            daysWithOrders: 1,
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
      Wallet.find({ schoolId, status: 'active', balance: { $lt: lowBalanceThreshold } })
        .populate('studentId', 'name schoolCode grade status')
        .setOptions({ allowDiskUse: true })
        .sort({ balance: 1 })
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
      Student.countDocuments({ schoolId, status: 'active', deletedAt: null }),
      Wallet.countDocuments({ schoolId, status: 'active', autoDebitEnabled: true }),
      orderAggregate([
        { $match: { ...orderMatch, createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: {
              hour: {
                $hour: {
                  date: '$createdAt',
                  timezone: 'America/Bogota',
                },
              },
            },
            orders: { $sum: 1 },
            revenue: { $sum: '$total' },
          },
        },
        {
          $project: {
            _id: 0,
            hour: '$_id.hour',
            orders: 1,
            revenue: 1,
          },
        },
        { $sort: { hour: 1 } },
      ]),
      orderAggregate([
        { $match: { ...orderMatch, createdAt: { $gte: prev7Start } } },
        { $unwind: '$items' },
        {
          $project: {
            productId: '$items.productId',
            quantity: '$items.quantity',
            period: {
              $cond: [{ $gte: ['$createdAt', last7Start] }, 'current', 'previous'],
            },
          },
        },
        {
          $group: {
            _id: { productId: '$productId', period: '$period' },
            qty: { $sum: '$quantity' },
          },
        },
        {
          $lookup: {
            from: 'products',
            localField: '_id.productId',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            productId: '$_id.productId',
            period: '$_id.period',
            qty: 1,
            productName: '$product.name',
          },
        },
      ]),
      orderAggregate([
        {
          $match: {
            ...orderMatch,
            paymentMethod: { $in: ['cash', 'transfer', 'qr'] },
            createdAt: { $gte: monthStart, $lt: monthEnd },
          },
        },
        {
          $project: {
            _id: 0,
            createdAt: 1,
            total: 1,
          },
        },
      ]),
      WalletTransaction.aggregate([
        {
          $match: {
            schoolId,
            type: 'recharge',
            cancelledAt: null,
            createdAt: { $gte: monthStart, $lt: monthEnd },
          },
        },
        {
          $project: {
            _id: 0,
            createdAt: 1,
            amount: 1,
          },
        },
      ]).allowDiskUse(true),
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

    const toProductKey = (name, fallbackId = '') => {
      const normalizedName = String(name || '').trim().toLowerCase();
      return normalizedName || String(fallbackId || '');
    };

    const mergeTopProductsByName = (items = []) => {
      const grouped = new Map();

      for (const item of items) {
        const key = toProductKey(item.productName, item.productId);
        if (!key) {
          continue;
        }

        const existing = grouped.get(key);
        if (!existing) {
          grouped.set(key, {
            productId: item.productId,
            productName: item.productName || 'Producto',
            quantity: Number(item.quantity || 0),
            revenue: Number(item.revenue || 0),
          });
          continue;
        }

        existing.quantity += Number(item.quantity || 0);
        existing.revenue += Number(item.revenue || 0);
      }

      return Array.from(grouped.values())
        .sort((a, b) => (b.quantity || 0) - (a.quantity || 0) || (b.revenue || 0) - (a.revenue || 0))
        .slice(0, 10);
    };

    const mergeProfitabilityByName = (catalogItems = [], soldItems = []) => {
      const grouped = new Map();

      for (const product of catalogItems) {
        const price = Number(product.price || 0);
        const cost = Number(product.cost || 0);
        const utilityValue = price - cost;
        const utilityPercent = cost > 0 ? (utilityValue / cost) * 100 : 0;
        const key = toProductKey(product.name, product._id);

        if (!key || grouped.has(key)) {
          continue;
        }

        grouped.set(key, {
          productId: product._id,
          productName: product.name || 'Producto',
          quantitySold: 0,
          revenue: 0,
          utilityValue,
          utilityPercent,
        });
      }

      for (const soldItem of soldItems) {
        const key = toProductKey(soldItem.productName, soldItem.productId);
        if (!key) {
          continue;
        }

        const current = grouped.get(key) || {
          productId: soldItem.productId,
          productName: soldItem.productName || 'Producto',
          quantitySold: 0,
          revenue: 0,
          utilityValue: 0,
          utilityPercent: 0,
        };

        current.quantitySold += Number(soldItem.quantitySold || 0);
        current.revenue += Number(soldItem.revenue || 0);
        current.utilityValue += Number(soldItem.utilityValue || 0);
        current.utilityPercent = Number(current.utilityPercent || 0);

        grouped.set(key, current);
      }

      return Array.from(grouped.values());
    };

    const mergeCatalogProfitabilityByName = (catalogItems = []) => {
      const grouped = new Map();

      for (const product of catalogItems) {
        const price = Number(product.price || 0);
        const cost = Number(product.cost || 0);
        const utilityValue = price - cost;
        const utilityPercent = cost > 0 ? (utilityValue / cost) * 100 : 0;
        const key = toProductKey(product.name, product._id);

        if (!key) {
          continue;
        }

        const existing = grouped.get(key);
        if (!existing) {
          grouped.set(key, {
            productId: product._id,
            productName: product.name || 'Producto',
            utilityValue,
            utilityPercent,
            revenue: 0,
            quantitySold: 0,
          });
          continue;
        }

        // Keep the best utility snapshot for duplicated product names across stores.
        if (utilityValue > Number(existing.utilityValue || 0)) {
          existing.utilityValue = utilityValue;
          existing.utilityPercent = utilityPercent;
          existing.productId = product._id;
        }
      }

      return Array.from(grouped.values());
    };

    const profitabilitySource = mergeProfitabilityByName(activeProductsRaw || [], profitabilityRaw || []);
    const catalogProfitabilitySource = mergeCatalogProfitabilityByName(activeProductsRaw || []);
    const topProducts = mergeTopProductsByName(topProductsRaw || []);

    const productTrendMap = new Map();
    for (const row of productWeeklyTrendRaw || []) {
      const key = String(row.productId || row.productName || '');
      if (!key) {
        continue;
      }

      if (!productTrendMap.has(key)) {
        productTrendMap.set(key, {
          productId: row.productId,
          productName: row.productName || 'Producto',
          currentQty: 0,
          previousQty: 0,
          growthPercent: 0,
        });
      }

      const item = productTrendMap.get(key);
      if (row.period === 'current') {
        item.currentQty += Number(row.qty || 0);
      } else {
        item.previousQty += Number(row.qty || 0);
      }
    }

    const productWeeklyTrend = Array.from(productTrendMap.values())
      .map((item) => ({
        ...item,
        growthPercent: Number(item.previousQty || 0) > 0
          ? ((Number(item.currentQty || 0) - Number(item.previousQty || 0)) / Number(item.previousQty || 0)) * 100
          : 0,
      }))
      .sort((a, b) => Number(b.growthPercent || 0) - Number(a.growthPercent || 0));

    const topProductsByPercent = [...catalogProfitabilitySource]
      .sort((a, b) => (b.utilityPercent || 0) - (a.utilityPercent || 0) || (b.utilityValue || 0) - (a.utilityValue || 0))
      .slice(0, 10);

    const topProductsByValue = [...catalogProfitabilitySource]
      .sort((a, b) => (b.utilityValue || 0) - (a.utilityValue || 0) || (b.revenue || 0) - (a.revenue || 0))
      .slice(0, 10);

    const leastProfitableProductsByPercent = [...catalogProfitabilitySource]
      .sort((a, b) => (a.utilityPercent || 0) - (b.utilityPercent || 0) || (a.utilityValue || 0) - (b.utilityValue || 0))
      .slice(0, 10);

    const fixedCostsOnly = fixedCosts.filter((item) => String(item.type || 'fixed') !== 'variable');
    const variableCostsOnly = fixedCosts.filter((item) => String(item.type || 'fixed') === 'variable');

    const weeklyAccountingMap = new Map();

    const ensureWeeklyRow = (weekKey) => {
      if (!weeklyAccountingMap.has(weekKey)) {
        weeklyAccountingMap.set(weekKey, {
          weekKey,
          fixedTotal: 0,
          variableTotal: 0,
          salesTotal: 0,
          topupsTotal: 0,
          utilityTotal: 0,
        });
      }

      return weeklyAccountingMap.get(weekKey);
    };

    const addWeeklyCost = (item, field) => {
      const baseDate = item?.weekStart || item?.createdAt;
      const parsedDate = baseDate ? new Date(baseDate) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        return;
      }

      const weekKey = getBogotaWeekKey(parsedDate);
      const row = ensureWeeklyRow(weekKey);
      row[field] += Number(item?.amount || 0);
    };

    for (const item of fixedCostsOnly) {
      addWeeklyCost(item, 'fixedTotal');
    }

    for (const item of variableCostsOnly) {
      addWeeklyCost(item, 'variableTotal');
    }

    for (const sale of accountingSalesRaw || []) {
      const parsedDate = sale?.createdAt ? new Date(sale.createdAt) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        continue;
      }

      const weekKey = getBogotaWeekKey(parsedDate);
      const row = ensureWeeklyRow(weekKey);
      row.salesTotal += Number(sale?.total || 0);
    }

    for (const topup of topupsRaw || []) {
      const parsedDate = topup?.createdAt ? new Date(topup.createdAt) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        continue;
      }

      const weekKey = getBogotaWeekKey(parsedDate);
      const row = ensureWeeklyRow(weekKey);
      row.topupsTotal += Number(topup?.amount || 0);
    }

    const weeklyAccountingSummary = Array.from(weeklyAccountingMap.values())
      .map((row) => ({
        ...row,
        utilityTotal: Number(row.salesTotal || 0) - Number(row.fixedTotal || 0) - Number(row.variableTotal || 0),
      }))
      .sort((a, b) => String(b.weekKey || '').localeCompare(String(a.weekKey || '')));

    const totalFixedCosts = fixedCostsOnly.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalVariableCosts = variableCostsOnly.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const salesMonthTotal = Number(salesMonth[0]?.total || 0);
    const utilityTheoreticalMonth = Number(utilityMonth || 0) - totalFixedCosts - totalVariableCosts;
    const utilityNetMonth = salesMonthTotal - totalFixedCosts - totalVariableCosts;
    const aiRecommendations = buildAiRecommendations({
      topStudents: topStudentsRaw,
      lowStockProducts,
      topProducts,
      hourlySales: hourlySalesRaw,
      productTrend: productWeeklyTrend,
    });

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
      topProducts,
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
      weeklyAccountingSummary,
      aiRecommendations,
      totalSubscribedStudents,
      totalAutoDebitActiveStudents,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/ai-insights', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const storeFilter = resolveStoreFilter(req.query.storeId);
    if (storeFilter === 'invalid') return res.status(400).json({ message: 'Invalid storeId' });

    const rawDays = Number(req.query.days || 30);
    const days = Number.isFinite(rawDays) && rawDays >= 7 && rawDays <= 90 ? rawDays : 30;
    const now = new Date();
    const analysisStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const dayStart = startOfDay(now);

    const last7Start = new Date(dayStart);
    last7Start.setUTCDate(last7Start.getUTCDate() - 6);

    const last14Start = new Date(last7Start);
    last14Start.setUTCDate(last14Start.getUTCDate() - 7);

    const prev7Start = new Date(last7Start);
    prev7Start.setUTCDate(prev7Start.getUTCDate() - 7);

    const orderMatch = { schoolId, status: 'completed' };
    if (storeFilter) orderMatch.storeId = storeFilter;

    const productFilter = { schoolId, status: 'active', deletedAt: null };
    if (storeFilter) productFilter.storeId = storeFilter;

    const [
      recentOrdersRaw,
      allProducts,
      allCategories,
      studentOrdersRaw,
      hourlySalesRaw,
      weekdaySalesRaw,
    ] = await Promise.all([
      Order.find({ ...orderMatch, createdAt: { $gte: analysisStart } })
        .select('items total studentId createdAt')
        .lean(),

      Product.find(productFilter)
        .select('_id name categoryId price cost stock inventoryAlertStock')
        .populate('categoryId', 'name')
        .lean(),

      Category.find({ schoolId, status: 'active', deletedAt: null })
        .select('_id name')
        .lean(),

      Order.aggregate([
        { $match: { ...orderMatch, studentId: { $ne: null }, createdAt: { $gte: analysisStart } } },
        { $group: { _id: { studentId: '$studentId', day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } }, dailySpent: { $sum: '$total' }, dailyOrders: { $sum: 1 } } },
        { $group: { _id: '$_id.studentId', totalSpent: { $sum: '$dailySpent' }, daysWithOrders: { $sum: 1 }, orderCount: { $sum: '$dailyOrders' } } },
        { $sort: { totalSpent: -1 } },
        { $limit: 15 },
        { $lookup: { from: 'students', localField: '_id', foreignField: '_id', as: 'student' } },
        { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, studentId: '$_id', studentName: '$student.name', schoolCode: '$student.schoolCode', grade: '$student.grade', totalSpent: 1, daysWithOrders: 1, orderCount: 1, avgDailySpent: { $cond: [{ $gt: ['$daysWithOrders', 0] }, { $divide: ['$totalSpent', '$daysWithOrders'] }, 0] } } },
      ]).allowDiskUse(true),

      Order.aggregate([
        { $match: { ...orderMatch, createdAt: { $gte: analysisStart } } },
        { $group: { _id: { $hour: { date: '$createdAt', timezone: 'America/Bogota' } }, orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
        { $project: { _id: 0, hour: '$_id', orders: 1, revenue: 1 } },
        { $sort: { hour: 1 } },
      ]).allowDiskUse(true),

      Order.aggregate([
        { $match: { ...orderMatch, createdAt: { $gte: analysisStart } } },
        { $group: { _id: { $dayOfWeek: { date: '$createdAt', timezone: 'America/Bogota' } }, orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
        { $project: { _id: 0, dayOfWeek: '$_id', orders: 1, revenue: 1 } },
        { $sort: { dayOfWeek: 1 } },
      ]).allowDiskUse(true),
    ]);

    // Product lookup map O(1)
    const productMap = new Map();
    for (const product of allProducts) {
      productMap.set(String(product._id), product);
    }

    const productCatMap = new Map();
    for (const product of allProducts) {
      const catId = String(product.categoryId?._id || product.categoryId || '');
      productCatMap.set(String(product._id), { catId, productName: product.name });
    }

    // --- VELOCITY & DEAD STOCK ---
    const productSalesMap = new Map();
    const productLastSaleMap = new Map();

    for (const order of recentOrdersRaw) {
      const orderDate = new Date(order.createdAt);
      for (const item of (order.items || [])) {
        const pid = String(item.productId || '');
        if (!pid) continue;
        if (!productSalesMap.has(pid)) {
          productSalesMap.set(pid, { qty7d: 0, qty14d: 0, qtyAnalysis: 0 });
        }
        const entry = productSalesMap.get(pid);
        const qty = Number(item.quantity || 0);
        if (orderDate >= last7Start) entry.qty7d += qty;
        if (orderDate >= last14Start) entry.qty14d += qty;
        entry.qtyAnalysis += qty;
        const current = productLastSaleMap.get(pid);
        if (!current || orderDate > current) {
          productLastSaleMap.set(pid, orderDate);
        }
      }
    }

    const velocityAlerts = [];
    const deadStock = [];

    for (const product of allProducts) {
      const pid = String(product._id);
      const sales = productSalesMap.get(pid) || { qty7d: 0, qty14d: 0, qtyAnalysis: 0 };
      const stock = Number(product.stock || 0);
      const categoryName = product.categoryId?.name || 'Sin categoria';

      const avgDailySales7d = sales.qty7d / 7;
      const avgDailySales14d = sales.qty14d / 14;
      const avgDailySales = Math.max(avgDailySales7d, avgDailySales14d);

      if (avgDailySales > 0) {
        const daysUntilStockout = stock / avgDailySales;
        let urgency = null;
        if (daysUntilStockout < 2) urgency = 'critical';
        else if (daysUntilStockout < 5) urgency = 'high';
        else if (daysUntilStockout < 10) urgency = 'medium';

        if (urgency) {
          velocityAlerts.push({
            productId: pid,
            productName: product.name,
            categoryName,
            currentStock: stock,
            avgDailySales7d: Math.round(avgDailySales7d * 10) / 10,
            avgDailySales14d: Math.round(avgDailySales14d * 10) / 10,
            daysUntilStockout: Math.round(daysUntilStockout * 10) / 10,
            recommendedOrderQty: Math.ceil(avgDailySales * 14),
            urgency,
          });
        }
      } else if (stock > Math.max(Number(product.inventoryAlertStock || 0) * 2, 20)) {
        const lastSale = productLastSaleMap.get(pid);
        const daysSinceLastSale = lastSale
          ? Math.floor((now - lastSale) / (1000 * 60 * 60 * 24))
          : days;
        if (daysSinceLastSale >= 14) {
          deadStock.push({
            productId: pid,
            productName: product.name,
            categoryName,
            currentStock: stock,
            daysSinceLastSale,
            lastSaleDate: lastSale ? lastSale.toISOString() : null,
          });
        }
      }
    }

    velocityAlerts.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
    deadStock.sort((a, b) => b.currentStock - a.currentStock);

    // --- CATEGORY INSIGHTS ---
    const categorySalesMap = new Map();
    for (const cat of allCategories) {
      categorySalesMap.set(String(cat._id), {
        categoryId: String(cat._id),
        categoryName: cat.name,
        totalRevenuePeriod: 0,
        totalUnitsPeriod: 0,
        productRevMap: new Map(),
      });
    }

    for (const order of recentOrdersRaw) {
      for (const item of (order.items || [])) {
        const pid = String(item.productId || '');
        const productInfo = productCatMap.get(pid);
        if (!productInfo) continue;
        const catEntry = categorySalesMap.get(productInfo.catId);
        if (!catEntry) continue;
        catEntry.totalRevenuePeriod += Number(item.subtotal || 0);
        catEntry.totalUnitsPeriod += Number(item.quantity || 0);
        const pName = productInfo.productName || item.nameSnapshot || 'Producto';
        catEntry.productRevMap.set(pName, (catEntry.productRevMap.get(pName) || 0) + Number(item.subtotal || 0));
      }
    }

    const catLowStockMap = new Map();
    const catProductCountMap = new Map();
    for (const product of allProducts) {
      const catId = String(product.categoryId?._id || product.categoryId || '');
      catProductCountMap.set(catId, (catProductCountMap.get(catId) || 0) + 1);
      if (Number(product.stock || 0) <= Number(product.inventoryAlertStock || 10)) {
        catLowStockMap.set(catId, (catLowStockMap.get(catId) || 0) + 1);
      }
    }

    function fmtCOP(value) {
      return `$${Math.round(Number(value || 0)).toLocaleString('es-CO')}`;
    }

    const categoryInsights = Array.from(categorySalesMap.values())
      .map((entry) => {
        let topProduct = '';
        let topProductRevenue = 0;
        for (const [pName, pRev] of entry.productRevMap) {
          if (pRev > topProductRevenue) { topProductRevenue = pRev; topProduct = pName; }
        }
        const catId = entry.categoryId;
        const lowStockCount = catLowStockMap.get(catId) || 0;
        const productCount = catProductCountMap.get(catId) || 0;
        let insight;
        let action;
        if (entry.totalRevenuePeriod === 0) {
          insight = 'Sin ventas en el periodo de analisis.';
          action = 'Verifica que los productos de esta categoria esten activos y visibles.';
        } else if (lowStockCount > 0 && productCount > 0 && lowStockCount >= productCount * 0.5) {
          insight = `Mas del 50% de los productos tienen stock bajo.`;
          action = topProduct
            ? `Refuerza inventario urgentemente. "${topProduct}" genera la mayor parte de ingresos.`
            : 'Refuerza el inventario de esta categoria.';
        } else if (topProduct) {
          insight = `"${topProduct}" es el producto estrella con ${fmtCOP(topProductRevenue)} en ingresos.`;
          action = 'Garantiza disponibilidad constante de este producto.';
        } else {
          insight = 'Categoria activa con ventas regulares.';
          action = 'Mantén el inventario y monitorea tendencias.';
        }
        return { categoryId: catId, categoryName: entry.categoryName, totalRevenuePeriod: Math.round(entry.totalRevenuePeriod), totalUnitsPeriod: entry.totalUnitsPeriod, topProduct: topProduct || null, productCount, lowStockCount, insight, action };
      })
      .filter((c) => c.productCount > 0)
      .sort((a, b) => b.totalRevenuePeriod - a.totalRevenuePeriod);

    // --- GRADE INSIGHTS ---
    const gradeMap = new Map();
    for (const student of studentOrdersRaw) {
      const grade = String(student.grade || 'Sin grado');
      if (!gradeMap.has(grade)) gradeMap.set(grade, { grade, totalRevenue: 0, studentCount: 0 });
      const entry = gradeMap.get(grade);
      entry.totalRevenue += Number(student.totalSpent || 0);
      entry.studentCount += 1;
    }

    const gradeInsights = Array.from(gradeMap.values())
      .map((entry) => ({ ...entry, avgSpentPerStudent: entry.studentCount > 0 ? Math.round(entry.totalRevenue / entry.studentCount) : 0 }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    // --- TIME INSIGHTS ---
    const DAY_NAMES_AI = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const hourlyBreakdown = hourlySalesRaw.map((h) => ({ hour: h.hour, orders: h.orders, revenue: h.revenue }));
    const activeHours = hourlyBreakdown.filter((h) => h.orders > 0);
    const peakHourData = activeHours.length > 0 ? [...activeHours].sort((a, b) => b.orders - a.orders)[0] : null;
    const valleyHourData = activeHours.length > 1 ? [...activeHours].sort((a, b) => a.orders - b.orders)[0] : null;

    const weekdayBreakdown = weekdaySalesRaw.map((d) => ({
      dayOfWeek: d.dayOfWeek,
      dayName: DAY_NAMES_AI[(d.dayOfWeek - 1) % 7],
      orders: d.orders,
      revenue: d.revenue,
    }));
    const activeDays = weekdayBreakdown.filter((d) => d.orders > 0);
    const peakDayData = activeDays.length > 0 ? [...activeDays].sort((a, b) => b.orders - a.orders)[0] : null;
    const slowDayData = activeDays.length > 1 ? [...activeDays].sort((a, b) => a.orders - b.orders)[0] : null;

    const timeInsights = {
      peakHour: peakHourData?.hour ?? null,
      peakHourOrders: peakHourData?.orders ?? 0,
      valleyHour: valleyHourData?.hour ?? null,
      valleyHourOrders: valleyHourData?.orders ?? 0,
      peakDay: peakDayData?.dayName ?? null,
      peakDayOrders: peakDayData?.orders ?? 0,
      slowDay: slowDayData?.dayName ?? null,
      slowDayOrders: slowDayData?.orders ?? 0,
      hourlyBreakdown,
      weekdayBreakdown,
    };

    // --- PRODUCT TRENDS (last 7d vs prior 7d) ---
    const trendProductMap = new Map();
    for (const order of recentOrdersRaw) {
      const orderDate = new Date(order.createdAt);
      const isCurrent = orderDate >= last7Start;
      const isPrevious = orderDate >= prev7Start && orderDate < last7Start;
      if (!isCurrent && !isPrevious) continue;
      for (const item of (order.items || [])) {
        const pid = String(item.productId || '');
        if (!pid) continue;
        if (!trendProductMap.has(pid)) {
          const product = productMap.get(pid);
          trendProductMap.set(pid, {
            productId: pid,
            productName: product?.name || item.nameSnapshot || 'Producto',
            categoryName: product?.categoryId?.name || 'Sin categoria',
            currentQty: 0,
            previousQty: 0,
          });
        }
        const entry = trendProductMap.get(pid);
        const qty = Number(item.quantity || 0);
        if (isCurrent) entry.currentQty += qty;
        else entry.previousQty += qty;
      }
    }

    const productTrend = Array.from(trendProductMap.values())
      .map((item) => {
        const growthPercent = Number(item.previousQty || 0) > 0
          ? ((Number(item.currentQty) - Number(item.previousQty)) / Number(item.previousQty)) * 100
          : 0;
        const trend = growthPercent >= 20 ? 'growing' : growthPercent <= -20 ? 'declining' : 'stable';
        return { ...item, growthPercent: Math.round(growthPercent * 10) / 10, trend };
      })
      .filter((item) => item.currentQty + item.previousQty > 0)
      .sort((a, b) => b.growthPercent - a.growthPercent);

    // --- MARGIN OPPORTUNITIES ---
    const productSalesRevMap = new Map();
    for (const order of recentOrdersRaw) {
      for (const item of (order.items || [])) {
        const pid = String(item.productId || '');
        if (!pid) continue;
        if (!productSalesRevMap.has(pid)) productSalesRevMap.set(pid, { unitsSold: 0, revenue: 0 });
        const entry = productSalesRevMap.get(pid);
        entry.unitsSold += Number(item.quantity || 0);
        entry.revenue += Number(item.subtotal || 0);
      }
    }

    const marginOpportunities = [];
    for (const product of allProducts) {
      const pid = String(product._id);
      const price = Number(product.price || 0);
      const cost = Number(product.cost || 0);
      if (price === 0) continue;
      const marginValue = price - cost;
      const marginPercent = (marginValue / price) * 100;
      const salesData = productSalesRevMap.get(pid) || { unitsSold: 0, revenue: 0 };
      const isLowMargin = marginPercent < 30;
      const isHighMargin = marginPercent >= 60;
      const sellsWell = salesData.unitsSold >= 20;
      const sellsPoorly = salesData.unitsSold < 5;
      if ((isLowMargin && sellsWell) || (isHighMargin && sellsPoorly && Number(product.stock || 0) > 0)) {
        let insight;
        let type;
        if (isLowMargin && sellsWell) {
          insight = `Margen bajo (${marginPercent.toFixed(0)}%) pero alta rotacion (${salesData.unitsSold} unds). Considera ajustar el precio de venta.`;
          type = 'price_increase';
        } else {
          insight = `Margen alto (${marginPercent.toFixed(0)}%) pero baja rotacion (${salesData.unitsSold} unds). Considera una promocion.`;
          type = 'promotion';
        }
        marginOpportunities.push({
          productId: pid,
          productName: product.name,
          categoryName: product.categoryId?.name || 'Sin categoria',
          price,
          cost,
          marginPercent: Math.round(marginPercent * 10) / 10,
          unitsSold: salesData.unitsSold,
          revenue: salesData.revenue,
          type,
          insight,
        });
      }
    }
    marginOpportunities.sort((a, b) => b.unitsSold - a.unitsSold);

    // --- STUDENT INSIGHTS ---
    const studentInsights = studentOrdersRaw.slice(0, 10).map((student) => {
      const avgDaily = Number(student.avgDailySpent || 0);
      const orderCount = Number(student.orderCount || 0);
      const totalSpent = Number(student.totalSpent || 0);
      let insightType;
      let insight;
      if (avgDaily > 15000) {
        insightType = 'top_spender';
        insight = `Gasto promedio diario de ${fmtCOP(avgDaily)} — alumno de alto consumo.`;
      } else if (orderCount >= 20) {
        insightType = 'high_frequency';
        insight = `Realizo ${orderCount} pedidos en el periodo — alta frecuencia de visita.`;
      } else {
        insightType = 'regular';
        insight = `Total gastado: ${fmtCOP(totalSpent)} en ${student.daysWithOrders} dias con compras.`;
      }
      return { ...student, insightType, insight };
    });

    const criticalAlerts = velocityAlerts.filter((a) => a.urgency === 'critical').length;
    const warnings = velocityAlerts.filter((a) => a.urgency !== 'critical').length + deadStock.length;
    const opportunities = marginOpportunities.length + categoryInsights.filter((c) => c.totalRevenuePeriod === 0).length;

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      analysisDays: days,
      summary: { criticalAlerts, warnings, opportunities, totalRecommendations: velocityAlerts.length + deadStock.length + marginOpportunities.length },
      velocityAlerts,
      deadStock: deadStock.slice(0, 10),
      categoryInsights,
      studentInsights,
      gradeInsights,
      timeInsights,
      productTrend: productTrend.slice(0, 20),
      marginOpportunities: marginOpportunities.slice(0, 10),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/ai-insights/ask', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const storeFilter = resolveStoreFilter(req.body?.storeId);
    if (storeFilter === 'invalid') {
      return res.status(400).json({ message: 'Invalid storeId' });
    }

    const question = String(req.body?.question || '').trim();
    if (!question) {
      return res.status(400).json({ message: 'question is required' });
    }

    const normalizeText = (value) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const normalizedQuestion = normalizeText(question);

    const now = new Date();
    const dayStart = startOfDay(now);
    const last7Start = new Date(dayStart);
    last7Start.setUTCDate(last7Start.getUTCDate() - 6);
    const last14Start = new Date(dayStart);
    last14Start.setUTCDate(last14Start.getUTCDate() - 13);

    const orderMatch = {
      schoolId,
      status: 'completed',
      createdAt: { $gte: last14Start },
    };
    if (storeFilter) {
      orderMatch.storeId = storeFilter;
    }

    const [suppliers, orders] = await Promise.all([
      Supplier.find({ schoolId, deletedAt: null, status: 'active' })
        .select('_id name productIds')
        .lean(),
      Order.find(orderMatch)
        .select('createdAt items')
        .lean(),
    ]);

    if (suppliers.length === 0) {
      return res.status(200).json({
        answer: 'No hay proveedores registrados. Crea proveedores y asocia productos para obtener recomendaciones de pedido.',
        supplier: null,
        recommendations: [],
      });
    }

    const supplierDemand = suppliers.map((supplier) => ({
      supplierId: String(supplier._id),
      supplierName: supplier.name || 'Proveedor',
      productIds: new Set((supplier.productIds || []).map((id) => String(id))),
      qty7d: 0,
      qty14d: 0,
      productQty7d: new Map(),
    }));

    for (const order of orders) {
      const orderDate = new Date(order.createdAt);
      const is7d = orderDate >= last7Start;
      const is14d = orderDate >= last14Start;
      if (!is14d) {
        continue;
      }

      for (const item of order.items || []) {
        const pid = String(item.productId || '');
        const qty = Number(item.quantity || 0);
        if (!pid || qty <= 0) {
          continue;
        }

        for (const supplier of supplierDemand) {
          if (!supplier.productIds.has(pid)) {
            continue;
          }

          supplier.qty14d += qty;
          if (is7d) {
            supplier.qty7d += qty;
            supplier.productQty7d.set(pid, (supplier.productQty7d.get(pid) || 0) + qty);
          }
        }
      }
    }

    const products = await Product.find({
      schoolId,
      status: 'active',
      deletedAt: null,
      _id: {
        $in: Array.from(
          new Set(
            supplierDemand.flatMap((supplier) => Array.from(supplier.productIds))
          )
        ),
      },
    })
      .select('_id name stock')
      .lean();

    const productNameMap = new Map(products.map((product) => [String(product._id), product.name || 'Producto']));
    const productStockMap = new Map(products.map((product) => [String(product._id), Number(product.stock || 0)]));

    const rankedSuppliers = supplierDemand
      .map((supplier) => {
        const avgDaily = Math.max(supplier.qty7d / 7, supplier.qty14d / 14);
        return {
          ...supplier,
          avgDaily,
        };
      })
      .sort((a, b) => b.avgDaily - a.avgDaily);

    const mentionedSupplier = rankedSuppliers.find((supplier) =>
      normalizedQuestion.includes(normalizeText(supplier.supplierName))
    );

    const targetSupplier = mentionedSupplier || rankedSuppliers[0];
    const topProductRows = Array.from(targetSupplier.productQty7d.entries())
      .map(([productId, qty7d]) => {
        const avgDaily = qty7d / 7;
        const suggestedTomorrow = Math.max(1, Math.ceil(avgDaily * 1.15));
        const currentStock = productStockMap.get(productId) || 0;
        return {
          productId,
          productName: productNameMap.get(productId) || 'Producto',
          qty7d,
          avgDaily: Math.round(avgDaily * 10) / 10,
          currentStock,
          suggestedTomorrow,
        };
      })
      .sort((a, b) => b.avgDaily - a.avgDaily)
      .slice(0, 8);

    const totalSuggestedTomorrow = topProductRows.reduce((sum, row) => sum + row.suggestedTomorrow, 0);

    const asksForTomorrowOrder =
      normalizedQuestion.includes('pedido') ||
      normalizedQuestion.includes('comprar') ||
      normalizedQuestion.includes('manana') ||
      normalizedQuestion.includes('mañana');

    let answer;
    if (asksForTomorrowOrder) {
      answer = `Para ${targetSupplier.supplierName}, te recomiendo pedir aproximadamente ${totalSuggestedTomorrow} unidades para mañana, priorizando los productos de mayor rotación en los últimos 7 días.`;
    } else {
      answer = `Según tus datos recientes, ${targetSupplier.supplierName} es el proveedor con mayor demanda estimada (${targetSupplier.avgDaily.toFixed(1)} und/día). Puedes pedirme un pedido sugerido para mañana.`;
    }

    return res.status(200).json({
      answer,
      supplier: {
        supplierId: targetSupplier.supplierId,
        supplierName: targetSupplier.supplierName,
        avgDailyUnits: Math.round(targetSupplier.avgDaily * 10) / 10,
        qty7d: targetSupplier.qty7d,
        qty14d: targetSupplier.qty14d,
      },
      recommendations: topProductRows,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
