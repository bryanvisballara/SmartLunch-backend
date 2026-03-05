const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Wallet = require('../models/wallet.model');
const Student = require('../models/student.model');
const ParentStudentLink = require('../models/parentStudentLink.model');
const WalletTransaction = require('../models/walletTransaction.model');

const router = express.Router();

router.use(authMiddleware);

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
