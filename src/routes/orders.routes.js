const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Student = require('../models/student.model');
const Product = require('../models/product.model');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/walletTransaction.model');
const Order = require('../models/order.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const { queueOrderCreatedNotifications } = require('../services/notification.service');

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

router.post('/', roleMiddleware('vendor', 'admin'), async (req, res) => {
  let session;
  try {
    const { schoolId, userId } = req.user;
    const { studentId, storeId, paymentMethod, items } = req.body;

    if (!studentId || !storeId || !paymentMethod || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'studentId, storeId, paymentMethod and items are required' });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const student = await Student.findOne({ _id: studentId, schoolId, status: 'active', deletedAt: null }).session(session);
    if (!student) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Student not found' });
    }

    const productIds = items.map((item) => item.productId);
    const products = await Product.find({ _id: { $in: productIds }, schoolId, storeId, status: 'active', deletedAt: null }).session(session);

    if (products.length !== productIds.length) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'One or more products are invalid for this store' });
    }

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

    const totalSpentToday = dailySpent[0]?.total || 0;

    let total = 0;
    const orderItems = [];

    for (const item of items) {
      const product = products.find((p) => String(p._id) === String(item.productId));
      if (!product) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Invalid product ${item.productId}` });
      }

      if (student.blockedProducts.some((id) => String(id) === String(product._id))) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Product blocked: ${product.name}` });
      }

      if (student.blockedCategories.some((id) => String(id) === String(product.categoryId))) {
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

    if (student.dailyLimit > 0 && totalSpentToday + total > student.dailyLimit) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Daily spending limit exceeded' });
    }

    let wallet = null;
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
    }

    for (const item of orderItems) {
      await Product.updateOne({ _id: item.productId }, { $inc: { stock: -item.quantity } }, { session });
    }

    const [order] = await Order.create(
      [
        {
          schoolId,
          studentId,
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

    console.info(
      `[ORDER_CREATED] studentId=${studentId} vendorId=${userId} storeId=${storeId} paymentMethod=${paymentMethod} total=${total}`
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
    const { studentId, from, to } = req.query;

    const filter = { schoolId };

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

    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(300);
    return res.status(200).json(orders);
  } catch (error) {
    return res.status(500).json({ message: error.message });
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
