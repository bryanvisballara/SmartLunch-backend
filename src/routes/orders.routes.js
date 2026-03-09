const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Student = require('../models/student.model');
const Product = require('../models/product.model');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/walletTransaction.model');
const Order = require('../models/order.model');
const DailyClosure = require('../models/dailyClosure.model');
const OrderCancellationRequest = require('../models/orderCancellationRequest.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const {
  queueOrderCreatedNotifications,
  queueLowBalanceAlertNotification,
  queueApprovalPendingNotificationForAdmins,
} = require('../services/notification.service');

const router = express.Router();

router.use(authMiddleware);

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

async function parentCanSeeStudent(user, studentId) {
  const link = await ParentStudentLink.findOne({
    schoolId: user.schoolId,
    parentId: user.userId,
    studentId,
    status: 'active',
  });

  return Boolean(link);
}

function resolveLowBalanceAlertTransition({ currentLevel = 'none', nextBalance = 0 }) {
  const normalizedCurrentLevel = ['none', 'lt20', 'lt10'].includes(String(currentLevel))
    ? String(currentLevel)
    : 'none';

  if (Number(nextBalance) < 10000) {
    const shouldNotify = normalizedCurrentLevel !== 'lt10';
    return {
      nextLevel: 'lt10',
      shouldNotify,
      threshold: 'lt10',
    };
  }

  if (Number(nextBalance) < 20000) {
    const shouldNotify = normalizedCurrentLevel === 'none';
    return {
      nextLevel: normalizedCurrentLevel === 'lt10' ? 'lt10' : 'lt20',
      shouldNotify,
      threshold: 'lt20',
    };
  }

  return {
    nextLevel: 'none',
    shouldNotify: false,
    threshold: null,
  };
}

router.post('/', roleMiddleware('vendor', 'admin'), async (req, res) => {
  let session;
  try {
    const { schoolId, userId } = req.user;
    const { studentId, storeId, paymentMethod, items, guestSale = false } = req.body;
    const isGuestSale = Boolean(guestSale);

    if (!storeId || !paymentMethod || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'storeId, paymentMethod and items are required' });
    }

    if (!isGuestSale && !studentId) {
      return res.status(400).json({ message: 'studentId is required for student sales' });
    }

    if (isGuestSale && paymentMethod === 'system') {
      return res.status(400).json({ message: 'Guest sales cannot use system payment method' });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    let student = null;
    if (!isGuestSale) {
      student = await Student.findOne({ _id: studentId, schoolId, status: 'active', deletedAt: null }).session(session);
      if (!student) {
        await session.abortTransaction();
        return res.status(404).json({ message: 'Student not found' });
      }
    }

    const productIds = items.map((item) => item.productId);
    const products = await Product.find({ _id: { $in: productIds }, schoolId, storeId, status: 'active', deletedAt: null }).session(session);

    if (products.length !== productIds.length) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'One or more products are invalid for this store' });
    }

    let totalSpentToday = 0;
    if (student) {
      const now = new Date();
      const dailySpent = await Order.aggregate([
        {
          $match: {
            schoolId,
            studentId: student._id,
            status: 'completed',
            createdAt: { $gte: startOfDay(now), $lt: endOfDay(now) },
          },
        },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]).session(session);

      totalSpentToday = dailySpent[0]?.total || 0;
    }

    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const product = products.find((p) => String(p._id) === String(item.productId));
      if (!product) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Invalid product ${item.productId}` });
      }

      if (student && student.blockedProducts.some((id) => String(id) === String(product._id))) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Product blocked: ${product.name}` });
      }

      if (student && student.blockedCategories.some((id) => String(id) === String(product.categoryId))) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Category blocked for product: ${product.name}` });
      }

      const quantity = Number(item.quantity || 0);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Invalid quantity for product: ${product.name}` });
      }

      if (product.stock < quantity) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Insufficient stock: ${product.name}` });
      }

      const subtotal = quantity * product.price;
      total += subtotal;

      orderItems.push({
        productId: product._id,
        nameSnapshot: product.name,
        unitPriceSnapshot: product.price,
        quantity,
        subtotal,
      });
    }

    if (student && student.dailyLimit > 0 && totalSpentToday + total > student.dailyLimit) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Daily spending limit exceeded' });
    }

    let wallet = null;
    let lowBalanceTransition = null;
    if (paymentMethod === 'system') {
      wallet = await Wallet.findOne({ schoolId, studentId }).session(session);
      if (!wallet) {
        await session.abortTransaction();
        return res.status(404).json({ message: 'Wallet not found' });
      }

      if (wallet.balance < total) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'Insufficient wallet balance' });
      }

      const currentLevel = wallet.lowBalanceAlertLevel || 'none';
      const nextBalance = Number(wallet.balance) - Number(total);
      lowBalanceTransition = resolveLowBalanceAlertTransition({
        currentLevel,
        nextBalance,
      });
    }

    for (const item of orderItems) {
      await Product.updateOne({ _id: item.productId }, { $inc: { stock: -item.quantity } }, { session });
    }

    const [order] = await Order.create(
      [
        {
          schoolId,
          studentId: student?._id || null,
          guestSale: isGuestSale,
          storeId,
          vendorId: userId,
          paymentMethod,
          items: orderItems,
          total,
          status: 'completed',
        },
      ],
      { session }
    );

    if (paymentMethod === 'system' && wallet) {
      wallet.balance -= total;
      wallet.lowBalanceAlertLevel = lowBalanceTransition?.nextLevel || wallet.lowBalanceAlertLevel || 'none';
      await wallet.save({ session });

      await WalletTransaction.create(
        [
          {
            schoolId,
            studentId,
            walletId: wallet._id,
            type: 'purchase',
            amount: -Math.abs(total),
            method: 'system',
            orderId: order._id,
            createdBy: userId,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();

    // Push notifications are queued outside the HTTP request path.
    if (student) {
      setImmediate(async () => {
        try {
          const result = await queueOrderCreatedNotifications({ schoolId, student, order });
          console.info(
            `[ORDER_NOTIFICATION_QUEUED] orderId=${order._id} notifications=${result.notificationsCreated} tokens=${result.tokensFound} queued=${result.queued} queuedCount=${result.queuedCount} queueReason=${result.queueReason || 'none'}`
          );
        } catch (notificationError) {
          console.error(`[ORDER_NOTIFICATION_FAILED] orderId=${order._id} error=${notificationError.message}`);
        }
      });

      if (paymentMethod === 'system' && wallet && lowBalanceTransition?.shouldNotify && lowBalanceTransition.threshold) {
        setImmediate(async () => {
          try {
            const balanceResult = await queueLowBalanceAlertNotification({
              schoolId,
              student,
              balance: wallet.balance,
              threshold: lowBalanceTransition.threshold,
            });
            console.info(
              `[LOW_BALANCE_NOTIFICATION_QUEUED] orderId=${order._id} threshold=${lowBalanceTransition.threshold} notifications=${balanceResult.notificationsCreated} tokens=${balanceResult.tokensFound} queued=${balanceResult.queued} queuedCount=${balanceResult.queuedCount}`
            );
          } catch (balanceNotificationError) {
            console.error(
              `[LOW_BALANCE_NOTIFICATION_FAILED] orderId=${order._id} threshold=${lowBalanceTransition.threshold} error=${balanceNotificationError.message}`
            );
          }
        });
      }
    }

    console.info(
      `[ORDER_CREATED] studentId=${student ? studentId : 'guest'} vendorId=${userId} storeId=${storeId} paymentMethod=${paymentMethod} total=${total}`
    );

    return res.status(201).json(order);
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    return res.status(500).json({ message: error.message });
  } finally {
    if (session) {
      session.endSession();
    }
  }
});

router.get('/', async (req, res) => {
  try {
    const { schoolId, role } = req.user;
    const {
      studentId,
      from,
      to,
      status,
      includeCancelled,
    } = req.query;

    const filter = { schoolId };

    // Default behavior keeps cancelled orders out of operational sales history.
    if (status) {
      filter.status = status;
    } else if (String(includeCancelled).toLowerCase() !== 'true') {
      filter.status = 'completed';
    }

    if (studentId) {
      filter.studentId = studentId;
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        filter.createdAt.$gte = new Date(from);
      }
      if (to) {
        filter.createdAt.$lte = new Date(to);
      }
    }

    if (role === 'parent') {
      const links = await ParentStudentLink.find({ schoolId, parentId: req.user.userId, status: 'active' }).select('studentId');
      filter.studentId = { $in: links.map((link) => link.studentId) };
    }

    const orders = await Order.find(filter)
      .populate('studentId', 'name schoolCode')
      .populate('storeId', 'name')
      .sort({ createdAt: -1 })
      .limit(300);
    return res.status(200).json(orders);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/cancel-request', roleMiddleware('vendor', 'admin'), async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const { orderId, reason } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: 'orderId is required' });
    }

    const order = await Order.findOne({ _id: orderId, schoolId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'completed') {
      return res.status(400).json({ message: 'Only completed orders can be requested for cancellation' });
    }

    if (role === 'vendor') {
      const now = new Date();
      const dateKey = startOfDay(now).toISOString().slice(0, 10);
      const dayClosure = await DailyClosure.findOne({
        schoolId,
        storeId: order.storeId,
        vendorId: userId,
        date: dateKey,
      }).lean();

      if (dayClosure) {
        return res.status(409).json({ message: 'El dia ya fue cerrado. No se pueden solicitar anulaciones.' });
      }
    }

    const existingPending = await OrderCancellationRequest.findOne({ orderId, schoolId, status: 'pending' });
    if (existingPending) {
      return res.status(409).json({ message: 'This order already has a pending cancellation request' });
    }

    const request = await OrderCancellationRequest.create({
      schoolId,
      orderId,
      storeId: order.storeId,
      requestedBy: userId,
      reason,
      status: 'pending',
    });

    try {
      const total = Number(order.total || 0).toLocaleString('es-CO');
      await queueApprovalPendingNotificationForAdmins({
        schoolId,
        title: 'Nueva autorizacion pendiente',
        body: `Hay una solicitud de anulacion pendiente por $${total}.`,
        payload: {
          type: 'approval.cancellation.pending',
          requestId: String(request._id),
          orderId: String(order._id),
          storeId: String(order.storeId || ''),
        },
      });
    } catch (notificationError) {
      console.warn(`[APPROVAL_PUSH_WARNING] cancellation request=${request._id} error=${notificationError.message}`);
    }

    return res.status(201).json(request);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/cancel-requests/list', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const { status = 'pending' } = req.query;

    const filter = { schoolId };
    if (status) {
      filter.status = status;
    }
    if (role === 'vendor') {
      filter.requestedBy = userId;
    }

    const requests = await OrderCancellationRequest.find(filter)
      .populate({
        path: 'orderId',
        select: 'studentId total paymentMethod status createdAt',
        populate: { path: 'studentId', select: 'name schoolCode' },
      })
      .populate('storeId', 'name')
      .populate('requestedBy', 'name username')
      .populate('approvedBy', 'name username')
      .populate('rejectedBy', 'name username')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.status(200).json(requests);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/cancel-requests/:id/approve', roleMiddleware('admin'), async (req, res) => {
  let session;
  try {
    const { schoolId, userId } = req.user;
    const requestId = req.params.id;

    session = await mongoose.startSession();
    session.startTransaction();

    const cancelRequest = await OrderCancellationRequest.findOne({ _id: requestId, schoolId, status: 'pending' }).session(session);
    if (!cancelRequest) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Pending cancellation request not found' });
    }

    const order = await Order.findOne({ _id: cancelRequest.orderId, schoolId }).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'completed') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Order is already cancelled' });
    }

    order.status = 'cancelled';
    await order.save({ session });

    for (const item of order.items) {
      await Product.updateOne({ _id: item.productId, schoolId, storeId: order.storeId }, { $inc: { stock: item.quantity } }, { session });
    }

    if (order.paymentMethod === 'system') {
      const wallet = await Wallet.findOne({ schoolId, studentId: order.studentId }).session(session);
      if (!wallet) {
        await session.abortTransaction();
        return res.status(404).json({ message: 'Wallet not found for refund' });
      }

      wallet.balance += order.total;
      await wallet.save({ session });

      await WalletTransaction.create(
        [
          {
            schoolId,
            studentId: order.studentId,
            walletId: wallet._id,
            type: 'refund',
            amount: Math.abs(order.total),
            method: 'system',
            orderId: order._id,
            createdBy: userId,
            notes: 'Order cancellation approved by admin',
          },
        ],
        { session }
      );
    }

    cancelRequest.status = 'approved';
    cancelRequest.approvedBy = userId;
    cancelRequest.approvedAt = new Date();
    await cancelRequest.save({ session });

    await session.commitTransaction();

    return res.status(200).json({
      message: 'Order cancellation approved',
      orderId: order._id,
      cancellationRequestId: cancelRequest._id,
      paymentMethod: order.paymentMethod,
      refunded: order.paymentMethod === 'system',
    });
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    return res.status(500).json({ message: error.message });
  } finally {
    if (session) {
      session.endSession();
    }
  }
});

router.post('/cancel-requests/:id/reject', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const requestId = req.params.id;

    const cancelRequest = await OrderCancellationRequest.findOne({ _id: requestId, schoolId, status: 'pending' });
    if (!cancelRequest) {
      return res.status(404).json({ message: 'Pending cancellation request not found' });
    }

    cancelRequest.status = 'rejected';
    cancelRequest.rejectedBy = userId;
    cancelRequest.rejectedAt = new Date();
    await cancelRequest.save();

    return res.status(200).json(cancelRequest);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/:id/cancel', roleMiddleware('admin'), async (req, res) => {
  let session;
  try {
    const { schoolId, userId } = req.user;
    const orderId = req.params.id;

    session = await mongoose.startSession();
    session.startTransaction();

    const order = await Order.findOne({ _id: orderId, schoolId }).session(session);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Order not found' });
    }

    if (order.status !== 'completed') {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Order is already cancelled' });
    }

    order.status = 'cancelled';
    await order.save({ session });

    for (const item of order.items) {
      await Product.updateOne({ _id: item.productId, schoolId, storeId: order.storeId }, { $inc: { stock: item.quantity } }, { session });
    }

    if (order.paymentMethod === 'system') {
      const wallet = await Wallet.findOne({ schoolId, studentId: order.studentId }).session(session);
      if (!wallet) {
        await session.abortTransaction();
        return res.status(404).json({ message: 'Wallet not found for refund' });
      }

      wallet.balance += order.total;
      await wallet.save({ session });

      await WalletTransaction.create(
        [
          {
            schoolId,
            studentId: order.studentId,
            walletId: wallet._id,
            type: 'refund',
            amount: Math.abs(order.total),
            method: 'system',
            orderId: order._id,
            createdBy: userId,
            notes: 'Order cancellation from admin sales history',
          },
        ],
        { session }
      );
    }

    await OrderCancellationRequest.create(
      [
        {
          schoolId,
          orderId: order._id,
          storeId: order.storeId,
          requestedBy: userId,
          reason: 'Anulacion directa desde historial admin',
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return res.status(200).json({
      message: 'Order cancelled successfully',
      orderId: order._id,
      refunded: order.paymentMethod === 'system',
    });
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    return res.status(500).json({ message: error.message });
  } finally {
    if (session) {
      session.endSession();
    }
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { schoolId, role } = req.user;

    const order = await Order.findOne({ _id: req.params.id, schoolId });
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (role === 'parent') {
      const allowed = await parentCanSeeStudent(req.user, order.studentId);
      if (!allowed) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    return res.status(200).json(order);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
