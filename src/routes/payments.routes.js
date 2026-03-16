const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/walletTransaction.model');
const PaymentTransaction = require('../models/paymentTransaction.model');
const { createDaviplataPaymentOrder, mapProviderStatus } = require('../services/daviplata.service');
const {
  createBancolombiaPaymentOrder,
  mapProviderStatus: mapBancolombiaProviderStatus,
} = require('../services/bancolombia.service');
const { getPaymentById, toInternalStatus: toMercadoPagoInternalStatus, isMercadoPagoConfigured } = require('../services/mercadopago.service');
const { queueAutoDebitRechargeNotification } = require('../services/notification.service');

const router = express.Router();

function toObjectId(id) {
  if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
    return null;
  }

  return new mongoose.Types.ObjectId(String(id));
}

function toInternalStatus(providerStatus) {
  if (providerStatus === 'APPROVED') return 'approved';
  if (providerStatus === 'REJECTED' || providerStatus === 'DECLINED') return 'rejected';
  if (providerStatus === 'FAILED' || providerStatus === 'ERROR') return 'failed';
  return 'pending';
}

function buildReference() {
  const random = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
  return `SL-${Date.now()}-${random}`;
}

function verifyMercadoPagoWebhookSignature({ secret, signatureHeader, requestId, dataId }) {
  const normalizedSecret = String(secret || '').trim();
  if (!normalizedSecret) {
    return true;
  }

  const rawSignature = String(signatureHeader || '').trim();
  if (!rawSignature) {
    return false;
  }

  const parts = rawSignature.split(',').reduce((acc, part) => {
    const [key, value] = String(part || '').split('=');
    if (key && value) {
      acc[String(key).trim()] = String(value).trim();
    }
    return acc;
  }, {});

  const ts = String(parts.ts || '').trim();
  const v1 = String(parts.v1 || '').trim().toLowerCase();
  if (!ts || !v1 || !dataId || !requestId) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', normalizedSecret)
    .update(manifest)
    .digest('hex')
    .toLowerCase();

  return expected === v1;
}

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function resolveRetryDelayMs(nextRetryCount) {
  if (nextRetryCount <= 1) return 0;
  if (nextRetryCount === 2) return 10 * 60_000;
  if (nextRetryCount === 3) return 60 * 60_000;
  return 12 * 60 * 60_000;
}

async function releaseWalletAutoDebitWithRetry({ schoolId, studentId }) {
  const wallet = await Wallet.findOne({ schoolId, studentId }).select('_id autoDebitRetryCount').lean();
  if (!wallet?._id) {
    return;
  }

  const nextRetryCount = Number(wallet.autoDebitRetryCount || 0) + 1;
  const retryAt = new Date(Date.now() + Math.max(0, resolveRetryDelayMs(nextRetryCount)));

  await Wallet.updateOne(
    { _id: wallet._id },
    {
      $set: {
        autoDebitInProgress: false,
        autoDebitLockAt: null,
        autoDebitRetryCount: nextRetryCount,
        autoDebitRetryAt: retryAt,
      },
    }
  );
}

function getCallbackUrl(req) {
  const explicit = String(process.env.DAVIPLATA_CALLBACK_URL || '').trim();
  if (explicit) {
    return explicit;
  }

  return `${req.protocol}://${req.get('host')}/payments/daviplata/callback`;
}

function getBancolombiaCallbackUrl(req) {
  const explicit = String(process.env.BANCOLOMBIA_CALLBACK_URL || '').trim();
  if (explicit) {
    return explicit;
  }

  return `${req.protocol}://${req.get('host')}/payments/bancolombia/callback`;
}

function getBancolombiaRedirectUrl(req) {
  const explicit = String(process.env.BANCOLOMBIA_REDIRECT_URL || '').trim();
  if (explicit) {
    return explicit;
  }

  return `${req.protocol}://${req.get('host')}/payments/bancolombia/oauth/callback`;
}

function getLowBalanceLevelForBalance(balance) {
  const value = Number(balance || 0);
  if (value < 10000) return 'lt10';
  if (value < 20000) return 'lt20';
  return 'none';
}

async function canAccessStudent(user, studentId) {
  if (user.role === 'admin') {
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

router.get('/daviplata/oauth/callback', async (req, res) => {
  return res.status(200).json({
    ok: true,
    message: 'Daviplata OAuth callback received',
    query: req.query || {},
  });
});

router.post('/daviplata/callback', async (req, res) => {
  let session;

  try {
    const expectedSignature = String(process.env.DAVIPLATA_WEBHOOK_SECRET || '').trim();
    if (expectedSignature) {
      const incomingSignature = String(req.headers['x-daviplata-signature'] || '').trim();
      if (incomingSignature !== expectedSignature) {
        return res.status(401).json({ message: 'Invalid webhook signature' });
      }
    }

    const providerTransactionId = String(req.body?.transactionId || '').trim();
    const reference = String(req.body?.reference || '').trim();
    const providerStatus = mapProviderStatus(req.body?.status);

    if (!providerTransactionId && !reference) {
      return res.status(400).json({ message: 'transactionId or reference is required' });
    }

    const searchConditions = [];
    if (providerTransactionId) {
      searchConditions.push({ providerTransactionId });
    }
    if (reference) {
      searchConditions.push({ reference });
    }

    const payment = await PaymentTransaction.findOne({ $or: searchConditions });
    if (!payment) {
      return res.status(404).json({ message: 'Payment transaction not found' });
    }

    const internalStatus = toInternalStatus(providerStatus);

    if (internalStatus !== 'approved') {
      payment.status = internalStatus;
      payment.providerStatus = providerStatus;
      payment.callbackPayload = req.body;
      payment.failureReason = internalStatus === 'pending' ? null : `Provider status ${providerStatus}`;
      await payment.save();

      return res.status(200).json({ received: true, credited: false, status: payment.status });
    }

    if (payment.walletTransactionId) {
      return res.status(200).json({ received: true, credited: true, alreadyProcessed: true });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const lockedPayment = await PaymentTransaction.findById(payment._id).session(session);
    if (!lockedPayment) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Payment transaction not found' });
    }

    if (lockedPayment.walletTransactionId) {
      await session.commitTransaction();
      return res.status(200).json({ received: true, credited: true, alreadyProcessed: true });
    }

    const wallet = await Wallet.findOne({
      schoolId: lockedPayment.schoolId,
      studentId: lockedPayment.studentId,
    }).session(session);

    if (!wallet) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Wallet not found' });
    }

    wallet.balance += Number(lockedPayment.amount || 0);
    wallet.lowBalanceAlertLevel = getLowBalanceLevelForBalance(wallet.balance);
    await wallet.save({ session });

    const [walletTopup] = await WalletTransaction.create(
      [
        {
          schoolId: lockedPayment.schoolId,
          studentId: lockedPayment.studentId,
          walletId: wallet._id,
          type: 'recharge',
          amount: Number(lockedPayment.amount || 0),
          method: 'daviplata',
          createdBy: lockedPayment.parentId,
          notes: `Recarga aprobada por DaviPlata (${providerTransactionId || lockedPayment.reference})`,
        },
      ],
      { session }
    );

    lockedPayment.status = 'approved';
    lockedPayment.providerStatus = providerStatus;
    lockedPayment.callbackPayload = req.body;
    lockedPayment.walletTransactionId = walletTopup._id;
    lockedPayment.approvedAt = new Date();
    lockedPayment.failureReason = null;
    await lockedPayment.save({ session });

    await session.commitTransaction();

    if (wallet.autoDebitEnabled) {
      setImmediate(async () => {
        try {
          await queueAutoDebitRechargeNotification({
            schoolId: lockedPayment.schoolId,
            studentId: lockedPayment.studentId,
            amount: Number(lockedPayment.amount || 0),
            newBalance: Number(wallet.balance || 0),
            method: 'daviplata',
          });
        } catch (notificationError) {
          console.error(`[AUTO_RECHARGE_NOTIFICATION_FAILED] source=daviplata_callback paymentId=${lockedPayment._id} error=${notificationError.message}`);
        }
      });
    }

    return res.status(200).json({ received: true, credited: true, status: 'approved' });
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

router.get('/bancolombia/oauth/callback', async (req, res) => {
  return res.status(200).json({
    ok: true,
    message: 'Bancolombia OAuth callback received',
    query: req.query || {},
  });
});

router.post('/bancolombia/callback', async (req, res) => {
  let session;

  try {
    const expectedSignature = String(process.env.BANCOLOMBIA_WEBHOOK_SECRET || '').trim();
    if (expectedSignature) {
      const incomingSignature = String(req.headers['x-bancolombia-signature'] || '').trim();
      if (incomingSignature !== expectedSignature) {
        return res.status(401).json({ message: 'Invalid webhook signature' });
      }
    }

    const providerTransactionId = String(req.body?.transactionId || req.body?.id || '').trim();
    const reference = String(req.body?.reference || req.body?.externalReference || '').trim();
    const providerStatus = mapBancolombiaProviderStatus(req.body?.status);

    if (!providerTransactionId && !reference) {
      return res.status(400).json({ message: 'transactionId or reference is required' });
    }

    const searchConditions = [];
    if (providerTransactionId) {
      searchConditions.push({ providerTransactionId });
    }
    if (reference) {
      searchConditions.push({ reference });
    }

    const payment = await PaymentTransaction.findOne({
      method: 'bancolombia',
      $or: searchConditions,
    });
    if (!payment) {
      return res.status(404).json({ message: 'Payment transaction not found' });
    }

    const internalStatus = toInternalStatus(providerStatus);

    if (internalStatus !== 'approved') {
      payment.status = internalStatus;
      payment.providerStatus = providerStatus;
      payment.callbackPayload = req.body;
      payment.failureReason = internalStatus === 'pending' ? null : `Provider status ${providerStatus}`;
      await payment.save();

      return res.status(200).json({ received: true, credited: false, status: payment.status });
    }

    if (payment.walletTransactionId) {
      return res.status(200).json({ received: true, credited: true, alreadyProcessed: true });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const lockedPayment = await PaymentTransaction.findById(payment._id).session(session);
    if (!lockedPayment) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Payment transaction not found' });
    }

    if (lockedPayment.walletTransactionId) {
      await session.commitTransaction();
      return res.status(200).json({ received: true, credited: true, alreadyProcessed: true });
    }

    const wallet = await Wallet.findOne({
      schoolId: lockedPayment.schoolId,
      studentId: lockedPayment.studentId,
    }).session(session);

    if (!wallet) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Wallet not found' });
    }

    wallet.balance += Number(lockedPayment.amount || 0);
    wallet.lowBalanceAlertLevel = getLowBalanceLevelForBalance(wallet.balance);
    await wallet.save({ session });

    const [walletTopup] = await WalletTransaction.create(
      [
        {
          schoolId: lockedPayment.schoolId,
          studentId: lockedPayment.studentId,
          walletId: wallet._id,
          type: 'recharge',
          amount: Number(lockedPayment.amount || 0),
          method: 'bancolombia',
          createdBy: lockedPayment.parentId,
          notes: `Recarga aprobada por Bancolombia (${providerTransactionId || lockedPayment.reference})`,
        },
      ],
      { session }
    );

    lockedPayment.providerStatus = providerStatus;
    lockedPayment.callbackPayload = req.body;
    lockedPayment.walletTransactionId = walletTopup._id;
    lockedPayment.approvedAt = new Date();
    lockedPayment.failureReason = null;
    lockedPayment.status = 'approved';
    await lockedPayment.save({ session });

    await session.commitTransaction();

    if (wallet.autoDebitEnabled) {
      setImmediate(async () => {
        try {
          await queueAutoDebitRechargeNotification({
            schoolId: lockedPayment.schoolId,
            studentId: lockedPayment.studentId,
            amount: Number(lockedPayment.amount || 0),
            newBalance: Number(wallet.balance || 0),
            method: 'bancolombia',
          });
        } catch (notificationError) {
          console.error(`[AUTO_RECHARGE_NOTIFICATION_FAILED] source=bancolombia_callback paymentId=${lockedPayment._id} error=${notificationError.message}`);
        }
      });
    }

    return res.status(200).json({ received: true, credited: true, status: 'approved' });
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

router.post('/mercadopago', async (req, res) => {
  let session;

  try {
    if (!isMercadoPagoConfigured()) {
      return res.status(200).json({ received: true, ignored: true, reason: 'Mercado Pago not configured' });
    }

    const eventType = String(req.body?.type || req.query?.type || '').trim().toLowerCase();
    const paymentId = String(req.body?.data?.id || req.query?.['data.id'] || '').trim();

    const webhookSecret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();
    if (webhookSecret) {
      const validSignature = verifyMercadoPagoWebhookSignature({
        secret: webhookSecret,
        signatureHeader: req.headers['x-signature'],
        requestId: req.headers['x-request-id'],
        dataId: paymentId,
      });

      if (!validSignature) {
        return res.status(401).json({ message: 'Invalid Mercado Pago webhook signature' });
      }
    }

    if (eventType !== 'payment' || !paymentId) {
      return res.status(200).json({ received: true, ignored: true });
    }

    const payment = await getPaymentById(paymentId);
    const providerStatus = String(payment?.status || 'pending').trim();
    const internalStatus = toMercadoPagoInternalStatus(providerStatus);
    const reference = String(payment?.external_reference || '').trim();

    const byProviderId = { providerTransactionId: paymentId };
    const byReference = reference ? { reference } : null;
    const paymentRecord = await PaymentTransaction.findOne(
      byReference ? { $or: [byProviderId, byReference] } : byProviderId
    );

    if (!paymentRecord) {
      return res.status(200).json({ received: true, ignored: true, reason: 'Payment record not found' });
    }

    if (internalStatus !== 'approved') {
      paymentRecord.providerTransactionId = paymentId;
      paymentRecord.providerStatus = providerStatus;
      paymentRecord.status = internalStatus;
      paymentRecord.callbackPayload = req.body;
      paymentRecord.providerResponse = payment;
      paymentRecord.failureReason = internalStatus === 'pending' ? null : String(payment?.status_detail || providerStatus);
      await paymentRecord.save();

      if (internalStatus !== 'pending') {
        await releaseWalletAutoDebitWithRetry({
          schoolId: paymentRecord.schoolId,
          studentId: paymentRecord.studentId,
        });
      }

      return res.status(200).json({ received: true, credited: false, status: internalStatus });
    }

    if (paymentRecord.walletTransactionId) {
      return res.status(200).json({ received: true, credited: true, alreadyProcessed: true });
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const lockedPayment = await PaymentTransaction.findById(paymentRecord._id).session(session);
    if (!lockedPayment) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Payment transaction not found' });
    }

    if (lockedPayment.walletTransactionId) {
      await session.commitTransaction();
      return res.status(200).json({ received: true, credited: true, alreadyProcessed: true });
    }

    const wallet = await Wallet.findOne({
      schoolId: lockedPayment.schoolId,
      studentId: lockedPayment.studentId,
    }).session(session);

    if (!wallet) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Wallet not found' });
    }

    const approvedAmount = Number(lockedPayment.amount || 0);
    const period = currentYearMonth();
    if (String(wallet.autoDebitMonthlyPeriod || '') !== period) {
      wallet.autoDebitMonthlyPeriod = period;
      wallet.autoDebitMonthlyUsed = 0;
    }

    wallet.balance += approvedAmount;
    wallet.autoDebitMonthlyUsed = Number(wallet.autoDebitMonthlyUsed || 0) + approvedAmount;
    wallet.autoDebitInProgress = false;
    wallet.autoDebitLockAt = null;
    wallet.autoDebitLastChargeAt = new Date();
    wallet.autoDebitRetryAt = null;
    wallet.autoDebitRetryCount = 0;
    wallet.lowBalanceAlertLevel = getLowBalanceLevelForBalance(wallet.balance);
    await wallet.save({ session });

    const [walletTopup] = await WalletTransaction.create(
      [
        {
          schoolId: lockedPayment.schoolId,
          studentId: lockedPayment.studentId,
          walletId: wallet._id,
          type: 'recharge',
          amount: Number(lockedPayment.amount || 0),
          method: 'mercadopago',
          createdBy: lockedPayment.parentId,
          notes: `Recarga automatica aprobada por Mercado Pago (${paymentId})`,
        },
      ],
      { session }
    );

    lockedPayment.providerTransactionId = paymentId;
    lockedPayment.providerStatus = providerStatus;
    lockedPayment.status = 'approved';
    lockedPayment.callbackPayload = req.body;
    lockedPayment.providerResponse = payment;
    lockedPayment.walletTransactionId = walletTopup._id;
    lockedPayment.approvedAt = new Date();
    lockedPayment.failureReason = null;
    await lockedPayment.save({ session });

    await session.commitTransaction();

    if (wallet.autoDebitEnabled) {
      setImmediate(async () => {
        try {
          await queueAutoDebitRechargeNotification({
            schoolId: lockedPayment.schoolId,
            studentId: lockedPayment.studentId,
            amount: Number(lockedPayment.amount || 0),
            newBalance: Number(wallet.balance || 0),
            method: 'mercadopago',
          });
        } catch (notificationError) {
          console.error(`[AUTO_RECHARGE_NOTIFICATION_FAILED] source=mercadopago_webhook paymentId=${lockedPayment._id} error=${notificationError.message}`);
        }
      });
    }

    return res.status(200).json({ received: true, credited: true, status: 'approved' });
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

router.use(authMiddleware);
router.use(roleMiddleware('parent', 'admin'));

router.post('/daviplata', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { studentId, amount, documentType, documentNumber, description = 'Recarga Comergio' } = req.body;

    const studentObjectId = toObjectId(studentId);
    if (!studentObjectId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 50000 || numericAmount > 150000) {
      return res.status(400).json({ message: 'Amount must be between 50000 and 150000' });
    }

    const normalizedDocType = String(documentType || '').trim().toUpperCase();
    const normalizedDocNumber = String(documentNumber || '').trim();

    if (!['CC', 'TI', 'CE', 'PP', 'NIT'].includes(normalizedDocType)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }

    if (!/^\d{5,20}$/.test(normalizedDocNumber)) {
      return res.status(400).json({ message: 'Invalid document number' });
    }

    const allowed = await canAccessStudent(req.user, studentObjectId);
    if (!allowed) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const student = await Student.findOne({ _id: studentObjectId, schoolId, deletedAt: null, status: 'active' }).select('_id');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const wallet = await Wallet.findOne({ schoolId, studentId: studentObjectId }).select('_id');
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    const reference = buildReference();
    const callbackUrl = getCallbackUrl(req);

    const payment = await PaymentTransaction.create({
      schoolId,
      studentId: studentObjectId,
      parentId: userId,
      amount: numericAmount,
      method: 'daviplata',
      documentType: normalizedDocType,
      documentNumber: normalizedDocNumber,
      reference,
      status: 'pending',
      providerStatus: 'PENDING',
      description: String(description || 'Recarga Comergio').trim(),
    });

    try {
      const providerOrder = await createDaviplataPaymentOrder({
        amount: numericAmount,
        documentType: normalizedDocType,
        documentNumber: normalizedDocNumber,
        description: payment.description,
        reference,
        callbackUrl,
      });

      payment.providerTransactionId = providerOrder.transactionId || undefined;
      payment.providerStatus = providerOrder.status;
      payment.providerResponse = providerOrder.raw;
      payment.status = toInternalStatus(providerOrder.status);
      await payment.save();

      return res.status(201).json({
        paymentId: payment._id,
        reference,
        transactionId: payment.providerTransactionId,
        status: payment.providerStatus,
        message: 'Solicitud de pago enviada a DaviPlata. El usuario debe aprobar en su celular.',
      });
    } catch (providerError) {
      payment.status = 'failed';
      payment.providerStatus = 'ERROR';
      payment.failureReason = providerError.message;
      payment.providerResponse = providerError.providerPayload || null;
      await payment.save();

      return res.status(502).json({
        message: providerError.message || 'No fue posible crear la orden en DaviPlata',
        paymentId: payment._id,
        reference,
      });
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/bancolombia', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { studentId, amount, description = 'Recarga Comergio' } = req.body;

    const studentObjectId = toObjectId(studentId);
    if (!studentObjectId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 50000 || numericAmount > 150000) {
      return res.status(400).json({ message: 'Amount must be between 50000 and 150000' });
    }

    const allowed = await canAccessStudent(req.user, studentObjectId);
    if (!allowed) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const student = await Student.findOne({ _id: studentObjectId, schoolId, deletedAt: null, status: 'active' }).select('_id');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const wallet = await Wallet.findOne({ schoolId, studentId: studentObjectId }).select('_id');
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    const reference = buildReference();
    const callbackUrl = getBancolombiaCallbackUrl(req);
    const redirectUrl = getBancolombiaRedirectUrl(req);

    const payment = await PaymentTransaction.create({
      schoolId,
      studentId: studentObjectId,
      parentId: userId,
      amount: numericAmount,
      method: 'bancolombia',
      documentType: '',
      documentNumber: '',
      reference,
      status: 'pending',
      providerStatus: 'PENDING',
      description: String(description || 'Recarga Comergio').trim(),
    });

    try {
      const providerOrder = await createBancolombiaPaymentOrder({
        amount: numericAmount,
        reference,
        description: payment.description,
        callbackUrl,
        redirectUrl,
      });

      payment.providerTransactionId = providerOrder.transactionId || undefined;
      payment.providerStatus = providerOrder.status;
      payment.providerResponse = providerOrder.raw;
      payment.status = toInternalStatus(providerOrder.status);
      await payment.save();

      return res.status(201).json({
        paymentId: payment._id,
        reference,
        transactionId: payment.providerTransactionId,
        status: payment.providerStatus,
        redirectUrl: providerOrder.redirectUrl,
        message: 'Solicitud de pago enviada a Bancolombia. Redirige al usuario para completar la recarga.',
      });
    } catch (providerError) {
      payment.status = 'failed';
      payment.providerStatus = 'ERROR';
      payment.failureReason = providerError.message;
      payment.providerResponse = providerError.providerPayload || null;
      await payment.save();

      return res.status(502).json({
        message: providerError.message || 'No fue posible crear la orden en Bancolombia',
        paymentId: payment._id,
        reference,
      });
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
