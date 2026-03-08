const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Wallet = require('../models/wallet.model');
const Student = require('../models/student.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const WalletTransaction = require('../models/walletTransaction.model');
const WalletTopupRequest = require('../models/walletTopupRequest.model');
const {
  queueAutoDebitRechargeNotification,
  queueApprovalPendingNotificationForAdmins,
} = require('../services/notification.service');

const router = express.Router();

router.use(authMiddleware);

function getLowBalanceLevelForBalance(balance) {
  const value = Number(balance || 0);
  if (value < 10000) return 'lt10';
  if (value < 20000) return 'lt20';
  return 'none';
}

async function canAccessStudent(user, studentId) {
  if (user.role === 'admin' || user.role === 'vendor') {
    return true;
  }

  const link = await ParentStudentLink.findOne({
    schoolId: user.schoolId,
    parentId: user.userId,
    studentId,
    status: 'active',
  });

  return Boolean(link);
}

async function listStudentTransactions(req, res) {
  const { schoolId } = req.user;
  const { studentId } = req.query;

  if (!studentId) {
    return res.status(400).json({ message: 'studentId query param is required' });
  }

  const allowed = await canAccessStudent(req.user, studentId);
  if (!allowed) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const transactions = await WalletTransaction.find({ schoolId, studentId }).sort({ createdAt: -1 }).limit(200);
  return res.status(200).json(transactions);
}

async function getStudentBalance(req, res) {
  const { schoolId } = req.user;
  const { studentId } = req.query;

  if (!studentId) {
    return res.status(400).json({ message: 'studentId query param is required' });
  }

  const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null });
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const allowed = await canAccessStudent(req.user, studentId);
  if (!allowed) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  const wallet = await Wallet.findOne({ schoolId, studentId });
  if (!wallet) {
    return res.status(404).json({ message: 'Wallet not found' });
  }

  return res.status(200).json({
    studentId,
    balance: wallet.balance,
    wallet,
  });
}

router.get('/transactions/list', async (req, res) => {
  try {
    return await listStudentTransactions(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    return await listStudentTransactions(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    return await listStudentTransactions(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/balance', async (req, res) => {
  try {
    return await getStudentBalance(req, res);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/recharges', roleMiddleware('vendor', 'admin'), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const { studentId, from, to } = req.query;

    const filter = {
      schoolId,
      type: 'recharge',
    };

    if (role === 'vendor') {
      filter.createdBy = userId;
    }

    if (studentId) {
      filter.studentId = studentId;
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        filter.createdAt.$gte = new Date(`${from}T00:00:00`);
      }
      if (to) {
        filter.createdAt.$lte = new Date(`${to}T23:59:59`);
      }
    }

    const transactions = await WalletTransaction.find(filter)
      .populate('studentId', 'name schoolCode')
      .populate('createdBy', 'name username')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json(transactions);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/recharges/:id/cancel', roleMiddleware('admin'), async (req, res) => {
  let session;
  try {
    const { schoolId, userId } = req.user;
    const transactionId = req.params.id;

    session = await mongoose.startSession();
    session.startTransaction();

    const rechargeTransaction = await WalletTransaction.findOne({
      _id: transactionId,
      schoolId,
      type: 'recharge',
    }).session(session);

    if (!rechargeTransaction) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Recharge transaction not found' });
    }

    if (rechargeTransaction.cancelledAt) {
      await session.abortTransaction();
      return res.status(409).json({ message: 'Recharge already cancelled' });
    }

    const rechargeAmount = Number(rechargeTransaction.amount || 0);
    if (rechargeAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Only positive recharge transactions can be cancelled' });
    }

    const wallet = await Wallet.findOne({ _id: rechargeTransaction.walletId, schoolId }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Wallet not found' });
    }

    if (wallet.balance < rechargeAmount) {
      await session.abortTransaction();
      return res.status(400).json({ message: 'Cannot cancel recharge: current wallet balance is insufficient' });
    }

    wallet.balance -= rechargeAmount;
    await wallet.save({ session });

    const [reversalTransaction] = await WalletTransaction.create(
      [
        {
          schoolId,
          studentId: rechargeTransaction.studentId,
          walletId: wallet._id,
          type: 'adjustment',
          amount: -Math.abs(rechargeAmount),
          method: rechargeTransaction.method,
          createdBy: userId,
          notes: `Recharge cancellation for transaction ${rechargeTransaction._id}`,
        },
      ],
      { session }
    );

    rechargeTransaction.cancelledAt = new Date();
    rechargeTransaction.cancelledBy = userId;
    rechargeTransaction.cancellationTransactionId = reversalTransaction._id;
    await rechargeTransaction.save({ session });

    await session.commitTransaction();

    return res.status(200).json({
      message: 'Recharge cancelled successfully',
      rechargeTransactionId: rechargeTransaction._id,
      cancellationTransactionId: reversalTransaction._id,
      amount: rechargeAmount,
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

router.post('/topup-requests', roleMiddleware('vendor', 'admin'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { studentId, amount, method = 'cash', storeId = null, requestDate, notes } = req.body;
    const allowedMethods = ['cash', 'qr', 'dataphone'];

    if (!studentId || !amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'studentId and positive amount are required' });
    }

    if (!allowedMethods.includes(method)) {
      return res.status(400).json({ message: 'method must be cash, qr or dataphone' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null, status: 'active' });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const request = await WalletTopupRequest.create({
      schoolId,
      storeId,
      studentId,
      amount: Number(amount),
      method,
      requestedBy: userId,
      notes,
      requestDate,
      status: 'pending',
    });

    try {
      const amountText = Number(request.amount || 0).toLocaleString('es-CO');
      await queueApprovalPendingNotificationForAdmins({
        schoolId,
        title: 'Nueva autorizacion pendiente',
        body: `Hay una solicitud de recarga pendiente por $${amountText}.`,
        payload: {
          type: 'approval.topup.pending',
          requestId: String(request._id),
          studentId: String(student._id),
          storeId: String(storeId || ''),
        },
      });
    } catch (notificationError) {
      console.warn(`[APPROVAL_PUSH_WARNING] topup request=${request._id} error=${notificationError.message}`);
    }

    return res.status(201).json(request);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/topup-requests', async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const { status = 'pending' } = req.query;

    const filter = { schoolId };
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (role === 'vendor') {
      filter.requestedBy = userId;
    }

    const requests = await WalletTopupRequest.find(filter)
      .populate('storeId', 'name')
      .populate('studentId', 'name schoolCode')
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

router.post('/topup-requests/:id/approve', roleMiddleware('admin'), async (req, res) => {
  let session;
  try {
    const { schoolId, userId } = req.user;
    session = await mongoose.startSession();
    session.startTransaction();

    const topupRequest = await WalletTopupRequest.findOne({ _id: req.params.id, schoolId, status: 'pending' }).session(session);

    if (!topupRequest) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Pending topup request not found' });
    }

    const wallet = await Wallet.findOne({ schoolId, studentId: topupRequest.studentId }).session(session);
    if (!wallet) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Wallet not found' });
    }

    wallet.balance += Number(topupRequest.amount);
    wallet.lowBalanceAlertLevel = getLowBalanceLevelForBalance(wallet.balance);
    await wallet.save({ session });

    await WalletTransaction.create(
      [
        {
          schoolId,
          studentId: topupRequest.studentId,
          walletId: wallet._id,
          type: 'recharge',
          amount: Number(topupRequest.amount),
          method: topupRequest.method || 'cash',
          createdBy: userId,
          notes: topupRequest.notes || 'Topup approved by admin',
        },
      ],
      { session }
    );

    topupRequest.status = 'approved';
    topupRequest.approvedBy = userId;
    topupRequest.approvedAt = new Date();
    await topupRequest.save({ session });

    await session.commitTransaction();

    if (wallet.autoDebitEnabled) {
      setImmediate(async () => {
        try {
          await queueAutoDebitRechargeNotification({
            schoolId,
            studentId: topupRequest.studentId,
            amount: Number(topupRequest.amount || 0),
            newBalance: Number(wallet.balance || 0),
            method: topupRequest.method || 'cash',
          });
        } catch (notificationError) {
          console.error(`[AUTO_RECHARGE_NOTIFICATION_FAILED] source=topup_request_approve requestId=${topupRequest._id} error=${notificationError.message}`);
        }
      });
    }

    return res.status(200).json(topupRequest);
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

router.post('/topup-requests/:id/reject', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const topupRequest = await WalletTopupRequest.findOne({ _id: req.params.id, schoolId, status: 'pending' });

    if (!topupRequest) {
      return res.status(404).json({ message: 'Pending topup request not found' });
    }

    topupRequest.status = 'rejected';
    topupRequest.rejectedBy = userId;
    topupRequest.rejectedAt = new Date();
    await topupRequest.save();

    return res.status(200).json(topupRequest);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/topup', roleMiddleware('admin', 'parent'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { studentId, amount, method = 'transfer', notes } = req.body;

    if (!studentId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'studentId and positive amount are required' });
    }

    const allowed = await canAccessStudent(req.user, studentId);
    if (!allowed) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const wallet = await Wallet.findOne({ schoolId, studentId });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    wallet.balance += Number(amount);
    wallet.lowBalanceAlertLevel = getLowBalanceLevelForBalance(wallet.balance);
    await wallet.save();

    await WalletTransaction.create({
      schoolId,
      studentId,
      walletId: wallet._id,
      type: 'recharge',
      amount: Number(amount),
      method,
      createdBy: userId,
      notes,
    });

    if (wallet.autoDebitEnabled) {
      setImmediate(async () => {
        try {
          await queueAutoDebitRechargeNotification({
            schoolId,
            studentId,
            amount: Number(amount || 0),
            newBalance: Number(wallet.balance || 0),
            method,
          });
        } catch (notificationError) {
          console.error(`[AUTO_RECHARGE_NOTIFICATION_FAILED] source=wallet_topup studentId=${studentId} error=${notificationError.message}`);
        }
      });
    }

    return res.status(200).json(wallet);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/pay', roleMiddleware('admin', 'vendor'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { studentId, amount, method = 'system', notes } = req.body;

    if (!studentId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'studentId and positive amount are required' });
    }

    const wallet = await Wallet.findOne({ schoolId, studentId });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    if (wallet.balance < Number(amount)) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    wallet.balance -= Number(amount);
    await wallet.save();

    await WalletTransaction.create({
      schoolId,
      studentId,
      walletId: wallet._id,
      type: 'adjustment',
      amount: -Math.abs(Number(amount)),
      method,
      createdBy: userId,
      notes,
    });

    return res.status(200).json(wallet);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/:studentId', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { studentId } = req.params;

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const allowed = await canAccessStudent(req.user, studentId);
    if (!allowed) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const wallet = await Wallet.findOne({ schoolId, studentId });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    return res.status(200).json(wallet);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/recharge', roleMiddleware('admin', 'parent'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { studentId, amount, method = 'transfer', notes } = req.body;

    if (!studentId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'studentId and positive amount are required' });
    }

    const allowed = await canAccessStudent(req.user, studentId);
    if (!allowed) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const wallet = await Wallet.findOne({ schoolId, studentId });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    wallet.balance += Number(amount);
    await wallet.save();

    await WalletTransaction.create({
      schoolId,
      studentId,
      walletId: wallet._id,
      type: 'recharge',
      amount: Number(amount),
      method,
      createdBy: userId,
      notes,
    });

    return res.status(200).json(wallet);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/debit', roleMiddleware('admin', 'vendor'), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { studentId, amount, method = 'system', notes } = req.body;

    if (!studentId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'studentId and positive amount are required' });
    }

    const wallet = await Wallet.findOne({ schoolId, studentId });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    if (wallet.balance < Number(amount)) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    wallet.balance -= Number(amount);
    await wallet.save();

    await WalletTransaction.create({
      schoolId,
      studentId,
      walletId: wallet._id,
      type: 'adjustment',
      amount: -Math.abs(Number(amount)),
      method,
      createdBy: userId,
      notes,
    });

    return res.status(200).json(wallet);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
