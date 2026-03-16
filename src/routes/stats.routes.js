const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const Wallet = require('../models/wallet.model');
const FixedCost = require('../models/fixedCost.model');
const Student = require('../models/student.model');

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
      aiRecommendations,
      totalSubscribedStudents,
      totalAutoDebitActiveStudents,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
