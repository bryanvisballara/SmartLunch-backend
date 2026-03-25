const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const ParentStudentLink = require('../models/parentStudentLink.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/walletTransaction.model');
const PaymentTransaction = require('../models/paymentTransaction.model');
const { createDaviplataPaymentOrder, mapProviderStatus } = require('../services/daviplata.service');
const {
  createBancolombiaPaymentOrder,
  mapProviderStatus: mapBancolombiaProviderStatus,
} = require('../services/bancolombia.service');
const {
  isBoldPaymentApiConfigured,
  getWebhookSecret: getBoldWebhookSecret,
  toInternalStatus: toBoldInternalStatus,
  createPaymentIntent,
  createPaymentAttempt,
  getPaymentAttemptStatus,
} = require('../services/bold.service');
const { queueAutoDebitRechargeNotification } = require('../services/notification.service');

const router = express.Router();
const boldWebhookFallbackRetryTimers = new Map();

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

function getBoldPaymentStatus(payload) {
  return String(
    payload?.status ||
      payload?.state ||
      payload?.type ||
      payload?.data?.status ||
      payload?.data?.state ||
      payload?.payload?.status ||
      'pending'
  ).trim();
}

function getBoldPaymentId(payload) {
  return String(
    payload?.id ||
      payload?.transactionId ||
      payload?.transaction_id ||
      payload?.subject ||
      payload?.data?.id ||
      payload?.data?.payment_id ||
      payload?.data?.transaction_id ||
      payload?.payload?.transaction_id ||
      ''
  ).trim();
}

function getBoldCheckoutUrl(payload, fallbackReference = '') {
  const directUrl = String(
    payload?.checkoutUrl ||
      payload?.checkout_url ||
      payload?.paymentUrl ||
      payload?.payment_url ||
      payload?.redirectUrl ||
      payload?.redirect_url ||
      payload?.url ||
      payload?.data?.checkoutUrl ||
      payload?.data?.checkout_url ||
      payload?.data?.paymentUrl ||
      payload?.data?.payment_url ||
      payload?.data?.redirectUrl ||
      payload?.data?.redirect_url ||
      payload?.data?.url ||
      ''
  ).trim();

  if (directUrl) {
    return directUrl;
  }

  const reference = String(
    payload?.reference_id ||
      payload?.reference ||
      payload?.metadata?.reference ||
      payload?.data?.reference_id ||
      payload?.data?.reference ||
      payload?.data?.metadata?.reference ||
      fallbackReference ||
      ''
  ).trim();
  const transactionId = String(
    payload?.transaction_id ||
      payload?.transactionId ||
      payload?.id ||
      payload?.data?.transaction_id ||
      payload?.data?.transactionId ||
      payload?.data?.id ||
      ''
  ).trim();
  const uuidToken = String(
    payload?.uuid_token ||
      payload?.uuidToken ||
      payload?.token ||
      payload?.data?.uuid_token ||
      payload?.data?.uuidToken ||
      payload?.data?.token ||
      ''
  ).trim();

  if (reference && transactionId && uuidToken) {
    return `https://checkout.bold.co/payment/${encodeURIComponent(reference)}/${encodeURIComponent(transactionId)}/${encodeURIComponent(uuidToken)}`;
  }

  return '';
}

function normalizeBoldRedirectMethod(redirectUrl, redirectMethod) {
  const normalizedUrl = String(redirectUrl || '').trim();
  const normalizedMethod = String(redirectMethod || '').trim().toUpperCase();

  if (!normalizedUrl) {
    return '';
  }

  if (normalizedUrl.startsWith('https://checkout.bold.co/payment/')) {
    return 'GET';
  }

  return normalizedMethod || 'GET';
}

function getBoldPaidAmount(payload) {
  const candidates = [
    payload?.amount?.total_amount,
    payload?.amount?.total,
    payload?.amount?.value,
    payload?.total,
    payload?.paidAmount,
    payload?.paid_amount,
    payload?.value,
    payload?.data?.amount?.total,
    payload?.data?.amount?.total_amount,
    payload?.data?.amount?.total,
    payload?.data?.amount?.value,
    payload?.data?.total,
    payload?.data?.paidAmount,
    payload?.data?.paid_amount,
    payload?.data?.value,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  return null;
}

function extractBoldReference(payload) {
  const candidates = [
    payload?.reference,
    payload?.reference_id,
    payload?.externalReference,
    payload?.external_reference,
    payload?.orderId,
    payload?.order_id,
    payload?.merchantReference,
    payload?.merchant_reference,
    payload?.metadata?.reference,
    payload?.metadata?.external_reference,
    payload?.metadata?.orderId,
    payload?.metadata?.order_id,
    payload?.data?.reference,
    payload?.data?.reference_id,
    payload?.data?.externalReference,
    payload?.data?.external_reference,
    payload?.data?.orderId,
    payload?.data?.order_id,
    payload?.data?.metadata?.reference,
    payload?.payload?.reference,
    payload?.payload?.reference_id,
    payload?.payload?.orderId,
    payload?.payload?.order_id,
    payload?.event?.data?.reference,
    payload?.event?.data?.external_reference,
    payload?.event?.data?.order_id,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) {
      return value;
    }
  }

  // Fallback for payloads that only embed the merchant order id as text.
  const payloadText = JSON.stringify(payload || {});
  const match = payloadText.match(/SL-\d{13,}-\d{6}/);
  if (match && match[0]) {
    return String(match[0]).trim();
  }

  return '';
}

function extractBoldProviderTransactionId(payload) {
  const candidates = [
    payload?.id,
    payload?.transactionId,
    payload?.transaction_id,
    payload?.transaction_id,
    payload?.subject,
    payload?.boldTransactionId,
    payload?.bold_transaction_id,
    payload?.data?.id,
    payload?.data?.payment_id,
    payload?.data?.transactionId,
    payload?.data?.transaction_id,
    payload?.payload?.id,
    payload?.payload?.transaction_id,
    payload?.payload?.transaction_id,
    payload?.event?.id,
    payload?.event?.data?.id,
    payload?.payment?.id,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) {
      return value;
    }
  }

  return '';
}

function extractBoldMerchantId(payload) {
  const candidates = [
    payload?.merchant_id,
    payload?.merchantId,
    payload?.data?.merchant_id,
    payload?.data?.merchantId,
    payload?.payload?.merchant_id,
    payload?.payload?.merchantId,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) {
      return value;
    }
  }

  return '';
}

function extractBoldWebhookSource(payload) {
  return String(payload?.source || payload?.data?.source || payload?.payload?.source || '').trim();
}

function extractBoldWebhookIntegration(payload) {
  return String(payload?.data?.integration || payload?.integration || payload?.payload?.integration || '').trim();
}

function getExpectedBoldMerchantId() {
  return String(process.env.BOLD_MERCHANT_ID || 'H4P5K8VKIL').trim();
}

function getExpectedBoldWebhookSource(label) {
  if (label === 'bold_bancolombia') {
    return '/payments/vnp/bancolombia';
  }

  if (label === 'bold_nequi') {
    return '/payments/nequi';
  }

  if (label === 'bold_pse') {
    return '/payments/pse/payments';
  }

  return '';
}

function getBoldPseBankConfig(paymentMethod = {}) {
  const requestedBankCode = String(paymentMethod?.bankCode || paymentMethod?.bank_code || '').trim();
  const requestedBankName = String(paymentMethod?.bankName || paymentMethod?.bank_name || '').trim();
  const configuredBankCode = String(process.env.BOLD_PSE_BANK_CODE || '').trim();
  const configuredBankName = String(process.env.BOLD_PSE_BANK_NAME || '').trim();

  return {
    bankCode: requestedBankCode || configuredBankCode || '1234',
    bankName: requestedBankName || configuredBankName || 'BOLD CF',
  };
}

function hasValidBoldPseBankConfig(bankConfig) {
  const bankCode = String(bankConfig?.bankCode || '').trim();
  const bankName = String(bankConfig?.bankName || '').trim();

  if (!bankCode || !bankName) {
    return false;
  }

  if (bankCode === '1234' && bankName.toUpperCase() === 'BOLD CF') {
    return false;
  }

  return true;
}

function extractBoldProviderStatus(payload) {
  const candidates = [
    payload?.status,
    payload?.state,
    payload?.type,
    payload?.transactionStatus,
    payload?.transaction_status,
    payload?.data?.status,
    payload?.data?.state,
    payload?.data?.type,
    payload?.payload?.status,
    payload?.event?.status,
    payload?.event?.data?.status,
    payload?.payment?.status,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) {
      return value;
    }
  }

  return 'pending';
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

function getFrontendBaseUrl() {
  return String(process.env.FRONTEND_URL || 'https://comergio.com').replace(/\/$/, '');
}

function buildBoldWalletReturnUrl({ studentId, reference }) {
  const url = new URL('/parent/recargas', `${getFrontendBaseUrl()}/`);
  if (studentId) {
    url.searchParams.set('studentId', String(studentId));
  }
  if (reference) {
    url.searchParams.set('paymentSource', 'bold');
    url.searchParams.set('paymentReference', String(reference));
  }
  return url.toString();
}

function isWebhookSource(source) {
  return String(source || '').toLowerCase().includes('webhook');
}

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '').trim();
}

function mapBoldDocumentType(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'CC') return 'CEDULA';
  if (normalized === 'TI') return 'TARJETA_DE_IDENTIDAD';
  if (normalized === 'CE') return 'CEDULA_DE_EXTRANJERIA';
  if (normalized === 'PP') return 'PASAPORTE';
  if (normalized === 'NIT') return 'NIT';
  return normalized || 'CEDULA';
}

function buildBoldBillingAddress(input = {}, phone = '') {
  const raw = input && typeof input === 'object' ? input : {};

  return {
    street1: String(raw.street1 || 'Calle 1 # 1 - 01').trim(),
    street2: String(raw.street2 || '').trim() || undefined,
    city: String(raw.city || 'Bogota').trim(),
    zip_code: String(raw.zipCode || raw.zip_code || '110111').trim(),
    province: String(raw.province || 'Bogota DC').trim(),
    country: String(raw.country || 'CO').trim().toUpperCase(),
    phone: normalizePhoneNumber(raw.phone || phone),
  };
}

function verifyBoldWebhookSignature(rawBodyBuffer, incomingSignature) {
  const expectedSignature = extractBoldSignatureDigest(incomingSignature);
  if (!expectedSignature) {
    return false;
  }

  const secret = getBoldWebhookSecret();
  const crypto = require('crypto');
  const rawBodyText = Buffer.isBuffer(rawBodyBuffer)
    ? rawBodyBuffer.toString('utf8')
    : String(rawBodyBuffer || '');

  const candidatePayloads = [
    rawBodyText,
    Buffer.from(rawBodyText, 'utf8').toString('base64'),
  ].filter(Boolean);

  for (const payload of candidatePayloads) {
    const computedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (computedSignature.length === expectedSignature.length) {
      try {
        if (crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(expectedSignature))) {
          return true;
        }
      } catch (error) {
        return false;
      }
    }
  }

  return false;
}

function extractBoldSignatureDigest(incomingSignature) {
  const signature = String(incomingSignature || '').trim();
  if (!signature) {
    return '';
  }

  const exactHexMatch = signature.match(/^[a-f0-9]{64}$/i);
  if (exactHexMatch) {
    return exactHexMatch[0].toLowerCase();
  }

  const labeledMatch = signature.match(/(?:sha256=|v1=|signature=)([a-f0-9]{64})/i);
  if (labeledMatch?.[1]) {
    return labeledMatch[1].toLowerCase();
  }

  const anyHexMatch = signature.match(/[a-f0-9]{64}/i);
  return String(anyHexMatch?.[0] || '').toLowerCase();
}

async function reconcileBoldWebhookByProviderLookup({ providerTransactionId, reference, payload, source }) {
  if (!reference || !isBoldPaymentApiConfigured()) {
    return null;
  }

  try {
    const searchConditions = [];
    if (providerTransactionId) {
      searchConditions.push({ providerTransactionId });
    }
    if (reference) {
      searchConditions.push({ reference });
    }

    if (!searchConditions.length) {
      return null;
    }

    const paymentRecord = await PaymentTransaction.findOne({
      method: { $in: ['bold_auto_debit', 'bold'] },
      $or: searchConditions,
    });

    if (!paymentRecord) {
      console.warn('[BOLD_WEBHOOK_FALLBACK_PAYMENT_NOT_FOUND]', {
        providerTransactionId,
        reference,
      });
      return { received: true, ignored: true, reason: 'Payment record not found' };
    }

    const providerPayload = await getPaymentAttemptStatus(reference);
    const result = await reconcileBoldPaymentRecord(paymentRecord, providerPayload, { source });

    console.info('[BOLD_WEBHOOK_FALLBACK_RECONCILED]', {
      reference,
      providerTransactionId,
      providerStatus: extractBoldProviderStatus(providerPayload),
    });

    return {
      ...result,
      verifiedViaStatusQuery: true,
      webhookSignatureAccepted: false,
      webhookType: extractBoldWebhookSource(payload) || 'unknown',
    };
  } catch (error) {
    console.warn('[BOLD_WEBHOOK_FALLBACK_FAILED]', {
      reference,
      providerTransactionId,
      status: Number(error?.status) || null,
      message: error.message,
    });
    return {
      received: true,
      ignored: true,
      verifiedViaStatusQuery: false,
      retryRecommended: Number(error?.status) === 404,
      reason: error.message,
    };
  }
}

function getBoldWebhookRetryKey(reference, providerTransactionId) {
  return `${String(reference || '').trim()}::${String(providerTransactionId || '').trim()}`;
}

function clearBoldWebhookFallbackRetry(reference, providerTransactionId) {
  const retryKey = getBoldWebhookRetryKey(reference, providerTransactionId);
  const existingTimer = boldWebhookFallbackRetryTimers.get(retryKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
    boldWebhookFallbackRetryTimers.delete(retryKey);
  }
}

function scheduleBoldWebhookFallbackRetry({ providerTransactionId, reference, payload, source, attempt = 1 }) {
  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference || !isBoldPaymentApiConfigured()) {
    return;
  }

  const maxAttempts = 4;
  if (attempt > maxAttempts) {
    console.warn('[BOLD_WEBHOOK_FALLBACK_RETRY_EXHAUSTED]', {
      reference: normalizedReference,
      providerTransactionId,
    });
    clearBoldWebhookFallbackRetry(normalizedReference, providerTransactionId);
    return;
  }

  const delayMs = [5000, 15000, 30000, 120000][attempt - 1] || 120000;
  const retryKey = getBoldWebhookRetryKey(normalizedReference, providerTransactionId);

  clearBoldWebhookFallbackRetry(normalizedReference, providerTransactionId);

  const timer = setTimeout(async () => {
    try {
      const result = await reconcileBoldWebhookByProviderLookup({
        providerTransactionId,
        reference: normalizedReference,
        payload,
        source: `${source}_retry_${attempt}`,
      });

      if (result?.verifiedViaStatusQuery) {
        console.info('[BOLD_WEBHOOK_FALLBACK_RETRY_RECONCILED]', {
          reference: normalizedReference,
          providerTransactionId,
          attempt,
        });
        clearBoldWebhookFallbackRetry(normalizedReference, providerTransactionId);
        return;
      }

      if (result?.retryRecommended) {
        scheduleBoldWebhookFallbackRetry({
          providerTransactionId,
          reference: normalizedReference,
          payload,
          source,
          attempt: attempt + 1,
        });
        return;
      }

      clearBoldWebhookFallbackRetry(normalizedReference, providerTransactionId);
    } catch (error) {
      console.error('[BOLD_WEBHOOK_FALLBACK_RETRY_FAILED]', {
        reference: normalizedReference,
        providerTransactionId,
        attempt,
        message: error.message,
      });
      scheduleBoldWebhookFallbackRetry({
        providerTransactionId,
        reference: normalizedReference,
        payload,
        source,
        attempt: attempt + 1,
      });
    }
  }, delayMs);

  boldWebhookFallbackRetryTimers.set(retryKey, timer);

  console.info('[BOLD_WEBHOOK_FALLBACK_RETRY_SCHEDULED]', {
    reference: normalizedReference,
    providerTransactionId,
    attempt,
    delayMs,
  });
}

async function reconcileBoldPaymentRecord(paymentRecord, providerPayload, { source = 'status_sync' } = {}) {
  let session;

  try {
    const providerTransactionId = extractBoldProviderTransactionId(providerPayload) || paymentRecord.providerTransactionId || '';
    const providerStatus = extractBoldProviderStatus(providerPayload);
    const internalStatus = toBoldInternalStatus(providerStatus);
    const paidAmount = getBoldPaidAmount(providerPayload);

    if (internalStatus !== 'approved') {
      paymentRecord.providerTransactionId = providerTransactionId || paymentRecord.providerTransactionId;
      paymentRecord.providerStatus = providerStatus;
      paymentRecord.status = internalStatus;
      paymentRecord.failureReason = internalStatus === 'pending' ? null : `Provider status ${providerStatus}`;
      paymentRecord.providerResponse = {
        ...(paymentRecord.providerResponse || {}),
        [source]: providerPayload,
        paidAmount: paidAmount || undefined,
      };
      if (isWebhookSource(source)) {
        paymentRecord.callbackPayload = providerPayload;
      }
      await paymentRecord.save();

      if (internalStatus !== 'pending' && paymentRecord.method === 'bold_auto_debit') {
        await releaseWalletAutoDebitWithRetry({
          schoolId: paymentRecord.schoolId,
          studentId: paymentRecord.studentId,
        });
      }

      return {
        received: true,
        credited: false,
        status: internalStatus,
        rechargeAmount: Number(paymentRecord.amount || 0),
        paidAmount: paidAmount || undefined,
      };
    }

    if (paymentRecord.walletTransactionId) {
      return { received: true, credited: true, alreadyProcessed: true, status: 'approved' };
    }

    session = await mongoose.startSession();
    session.startTransaction();

    const lockedPayment = await PaymentTransaction.findById(paymentRecord._id).session(session);
    if (!lockedPayment) {
      await session.abortTransaction();
      return { received: true, credited: false, status: 'failed', message: 'Payment transaction not found' };
    }

    if (lockedPayment.walletTransactionId) {
      await session.commitTransaction();
      return { received: true, credited: true, alreadyProcessed: true, status: 'approved' };
    }

    const wallet = await Wallet.findOne({
      schoolId: lockedPayment.schoolId,
      studentId: lockedPayment.studentId,
    }).session(session);

    if (!wallet) {
      await session.abortTransaction();
      return { received: true, credited: false, status: 'failed', message: 'Wallet not found' };
    }

    const approvedAmount = Number(lockedPayment.amount || 0);
    const isAutoDebitPayment = lockedPayment.method === 'bold_auto_debit';

    if (isAutoDebitPayment) {
      const period = currentYearMonth();
      if (String(wallet.autoDebitMonthlyPeriod || '') !== period) {
        wallet.autoDebitMonthlyPeriod = period;
        wallet.autoDebitMonthlyUsed = 0;
      }

      wallet.autoDebitMonthlyUsed = Number(wallet.autoDebitMonthlyUsed || 0) + approvedAmount;
      wallet.autoDebitInProgress = false;
      wallet.autoDebitLockAt = null;
      wallet.autoDebitLastChargeAt = new Date();
      wallet.autoDebitRetryAt = null;
      wallet.autoDebitRetryCount = 0;
    }

    wallet.balance += approvedAmount;
    wallet.lowBalanceAlertLevel = getLowBalanceLevelForBalance(wallet.balance);
    await wallet.save({ session });

    const [walletTopup] = await WalletTransaction.create(
      [
        {
          schoolId: lockedPayment.schoolId,
          studentId: lockedPayment.studentId,
          walletId: wallet._id,
          type: 'recharge',
          amount: approvedAmount,
          method: 'bold',
          createdBy: lockedPayment.parentId,
          notes: isAutoDebitPayment
            ? `Recarga automatica aprobada por Bold (${providerTransactionId || lockedPayment.reference})`
            : `Recarga aprobada por Bold (${providerTransactionId || lockedPayment.reference})`,
        },
      ],
      { session }
    );

    lockedPayment.providerTransactionId = providerTransactionId || lockedPayment.providerTransactionId;
    lockedPayment.providerStatus = providerStatus;
    lockedPayment.status = 'approved';
    lockedPayment.failureReason = null;
    lockedPayment.walletTransactionId = walletTopup._id;
    lockedPayment.approvedAt = new Date();
    lockedPayment.providerResponse = {
      ...(lockedPayment.providerResponse || {}),
      [source]: providerPayload,
      paidAmount: paidAmount || undefined,
    };
    if (isWebhookSource(source)) {
      lockedPayment.callbackPayload = providerPayload;
    }
    await lockedPayment.save({ session });

    await session.commitTransaction();

    setImmediate(async () => {
      try {
        await queueAutoDebitRechargeNotification({
          schoolId: lockedPayment.schoolId,
          studentId: lockedPayment.studentId,
          amount: approvedAmount,
          newBalance: Number(wallet.balance || 0),
          method: 'bold',
        });
      } catch (notificationError) {
        console.error(`[RECHARGE_NOTIFICATION_FAILED] source=${source} paymentId=${lockedPayment._id} error=${notificationError.message}`);
      }
    });

    return {
      received: true,
      credited: true,
      status: 'approved',
      rechargeAmount: approvedAmount,
      paidAmount: paidAmount || undefined,
    };
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }
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
        console.error(`[RECHARGE_NOTIFICATION_FAILED] source=daviplata_callback paymentId=${lockedPayment._id} error=${notificationError.message}`);
      }
    });

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
        console.error(`[RECHARGE_NOTIFICATION_FAILED] source=bancolombia_callback paymentId=${lockedPayment._id} error=${notificationError.message}`);
      }
    });

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

async function handleBoldWebhook(req, res) {
  try {
    console.info('[BOLD_WEBHOOK_RECEIVED]', {
      path: req.originalUrl,
      method: req.method,
      signatureHeaders: Object.keys(req.headers || {}).filter((key) => key.toLowerCase().includes('signature')),
      bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body).slice(0, 20) : [],
    });

    const incomingSignature = String(
      req.headers['x-bold-signature'] ||
      req.headers['x-signature'] ||
      req.headers['x-signature-hmac-sha256'] ||
      ''
    ).trim();

    const providerTransactionId = extractBoldProviderTransactionId(req.body);
    const reference = extractBoldReference(req.body);
    const providerStatus = extractBoldProviderStatus(req.body);
    const isSignatureValid = verifyBoldWebhookSignature(
      req.rawBody || Buffer.from(JSON.stringify(req.body || {})),
      incomingSignature
    );

    if (!isSignatureValid) {
      console.warn('[BOLD_WEBHOOK_SIGNATURE_MISMATCH]', {
        hasIncomingSignature: Boolean(incomingSignature),
        signatureHeaders: Object.keys(req.headers || {}).filter((key) => key.toLowerCase().includes('signature')),
        bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body).slice(0, 12) : [],
        providerTransactionId,
        reference,
      });

      const fallbackResult = await reconcileBoldWebhookByProviderLookup({
        providerTransactionId,
        reference,
        payload: req.body,
        source: 'webhook_status_fallback',
      });

      if (fallbackResult?.retryRecommended) {
        scheduleBoldWebhookFallbackRetry({
          providerTransactionId,
          reference,
          payload: req.body,
          source: 'webhook_status_fallback',
        });
      }

      return res.status(200).json(fallbackResult || { received: true, ignored: true, reason: 'invalid signature' });
    }

    console.info('[BOLD_WEBHOOK_PARSED_IDENTIFIERS]', {
      providerTransactionId,
      reference,
      providerStatus,
      paidAmount: getBoldPaidAmount(req.body),
    });

    if (!providerTransactionId && !reference) {
      console.warn('[BOLD_WEBHOOK_IGNORED_MISSING_IDENTIFIERS]');
      return res.status(200).json({ received: true, ignored: true, reason: 'missing identifiers' });
    }

    const searchConditions = [];
    if (providerTransactionId) {
      searchConditions.push({ providerTransactionId });
    }
    if (reference) {
      searchConditions.push({ reference });
    }

    const paymentRecord = await PaymentTransaction.findOne({
      method: { $in: ['bold_auto_debit', 'bold'] },
      $or: searchConditions,
    });

    if (!paymentRecord) {
      console.warn('[BOLD_WEBHOOK_PAYMENT_NOT_FOUND]', {
        providerTransactionId,
        reference,
      });
      return res.status(200).json({ received: true, ignored: true, reason: 'Payment record not found' });
    }
    const result = await reconcileBoldPaymentRecord(paymentRecord, req.body, { source: 'webhook' });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

function handleBoldAsyncWebhookAck(req, res, { label }) {
  res.status(200).json({ received: true });

  setImmediate(async () => {
    try {
      const incomingSignature = String(
        req.headers['x-bold-signature'] ||
        req.headers['x-signature'] ||
        req.headers['x-signature-hmac-sha256'] ||
        ''
      ).trim();

      const providerTransactionId = extractBoldProviderTransactionId(req.body);
      const reference = extractBoldReference(req.body);
      const providerStatus = extractBoldProviderStatus(req.body);
      const isSignatureValid = verifyBoldWebhookSignature(
        req.rawBody || Buffer.from(JSON.stringify(req.body || {})),
        incomingSignature
      );

      if (incomingSignature && !isSignatureValid) {
        console.warn(`[${label.toUpperCase()}_SIGNATURE_MISMATCH]`, {
          hasIncomingSignature: true,
          bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body).slice(0, 12) : [],
          providerTransactionId,
          reference,
        });

        const fallbackResult = await reconcileBoldWebhookByProviderLookup({
          providerTransactionId,
          reference,
          payload: req.body,
          source: `${label}_status_fallback`,
        });

        if (fallbackResult?.retryRecommended) {
          scheduleBoldWebhookFallbackRetry({
            providerTransactionId,
            reference,
            payload: req.body,
            source: `${label}_status_fallback`,
          });
        }

        return;
      }

      const merchantId = extractBoldMerchantId(req.body);
      const webhookSource = extractBoldWebhookSource(req.body);
      const integration = extractBoldWebhookIntegration(req.body);
      const expectedMerchantId = getExpectedBoldMerchantId();
      const expectedSource = getExpectedBoldWebhookSource(label);

      if (expectedMerchantId && merchantId && merchantId !== expectedMerchantId) {
        console.warn(`[${label.toUpperCase()}_IGNORED_UNEXPECTED_MERCHANT]`, {
          merchantId,
          expectedMerchantId,
          providerTransactionId,
          reference,
        });
        return;
      }

      if (expectedSource && webhookSource && webhookSource !== expectedSource) {
        console.warn(`[${label.toUpperCase()}_IGNORED_UNEXPECTED_SOURCE]`, {
          webhookSource,
          expectedSource,
          providerTransactionId,
          reference,
        });
        return;
      }

      console.info(`[${label.toUpperCase()}_WEBHOOK_PARSED]`, {
        merchantId,
        webhookSource,
        integration,
        providerTransactionId,
        reference,
        providerStatus,
      });

      if (!providerTransactionId && !reference) {
        console.warn(`[${label.toUpperCase()}_IGNORED_MISSING_IDENTIFIERS]`);
        return;
      }

      const searchConditions = [];
      if (providerTransactionId) {
        searchConditions.push({ providerTransactionId });
      }
      if (reference) {
        searchConditions.push({ reference });
      }

      const paymentRecord = await PaymentTransaction.findOne({
        method: { $in: ['bold_auto_debit', 'bold'] },
        $or: searchConditions,
      });

      if (!paymentRecord) {
        console.warn(`[${label.toUpperCase()}_PAYMENT_NOT_FOUND]`, {
          providerTransactionId,
          reference,
          providerStatus,
        });
        return;
      }

      await reconcileBoldPaymentRecord(paymentRecord, req.body, { source: `${label}_webhook` });
    } catch (error) {
      console.error(`[${label.toUpperCase()}_PROCESSING_FAILED]`, {
        message: error.message,
      });
    }
  });
}

router.post('/bold', handleBoldWebhook);
router.post('/bold/webhook', handleBoldWebhook);
router.post('/bold/callback', handleBoldWebhook);
router.post('/nequi', (req, res) => handleBoldAsyncWebhookAck(req, res, { label: 'bold_nequi' }));
router.post('/nequi/webhook', (req, res) => handleBoldAsyncWebhookAck(req, res, { label: 'bold_nequi' }));
router.post('/pse/payments', (req, res) => handleBoldAsyncWebhookAck(req, res, { label: 'bold_pse' }));
router.post('/pse/payments/webhook', (req, res) => handleBoldAsyncWebhookAck(req, res, { label: 'bold_pse' }));
router.post('/vnp/bancolombia', (req, res) => handleBoldAsyncWebhookAck(req, res, { label: 'bold_bancolombia' }));
router.post('/vnp/bancolombia/webhook', (req, res) => handleBoldAsyncWebhookAck(req, res, { label: 'bold_bancolombia' }));

router.use(authMiddleware);
router.use(roleMiddleware('parent', 'admin'));

router.get('/bold/recharge-status', async (req, res) => {
  try {
    const { schoolId, userId, role } = req.user;
    const reference = String(req.query?.reference || '').trim();

    if (!reference) {
      return res.status(400).json({ message: 'reference is required' });
    }

    const paymentQuery = {
      schoolId,
      method: 'bold',
      reference,
    };

    if (role !== 'admin') {
      paymentQuery.parentId = userId;
    }

    let payment = await PaymentTransaction.findOne(paymentQuery);

    if (!payment) {
      return res.status(404).json({ message: 'Payment transaction not found' });
    }

    if (payment.method === 'bold' && payment.status === 'pending' && isBoldPaymentApiConfigured()) {
      try {
        const providerPayload = await getPaymentAttemptStatus(reference);
        await reconcileBoldPaymentRecord(payment, providerPayload, { source: 'status_query' });
        payment = await PaymentTransaction.findById(payment._id);
      } catch (providerError) {
        if (Number(providerError?.status) !== 404) {
          console.warn('[BOLD_STATUS_SYNC_FAILED]', {
            reference,
            message: providerError.message,
          });
        }
      }
    }

    const wallet = await Wallet.findOne({
      schoolId,
      studentId: payment.studentId,
    })
      .select('balance')
      .lean();

    return res.status(200).json({
      reference: payment.reference,
      status: payment.status,
      providerStatus: payment.providerStatus,
      rechargeAmount: Number(payment.amount || 0),
      studentId: String(payment.studentId || ''),
      approvedAt: payment.approvedAt || null,
      walletBalance: Number(wallet?.balance || 0),
      walletTransactionId: payment.walletTransactionId ? String(payment.walletTransactionId) : '',
      failureReason: payment.failureReason || '',
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/bold/recharge', async (req, res) => {
  try {
    if (!isBoldPaymentApiConfigured()) {
      return res.status(503).json({ message: 'Bold no esta configurado en el backend.' });
    }

    const { schoolId, userId } = req.user;
    const {
      studentId,
      amount,
      description = 'Recarga Comergio',
      payer = {},
      paymentMethod = {},
      deviceFingerprint = {},
    } = req.body || {};

    const studentObjectId = toObjectId(studentId);
    if (!studentObjectId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const numericAmount = Math.round(Number(amount));
    if (!Number.isFinite(numericAmount) || numericAmount < 20000) {
      return res.status(400).json({ message: 'Amount must be at least 20000 COP' });
    }

    const allowed = await canAccessStudent(req.user, studentObjectId);
    if (!allowed) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const student = await Student.findOne({ _id: studentObjectId, schoolId, deletedAt: null, status: 'active' }).select('_id');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const wallet = await Wallet.findOne({ schoolId, studentId: studentObjectId });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }

    const parentUser = await User.findOne({
      _id: userId,
      schoolId,
      deletedAt: null,
      status: 'active',
    }).select('name email phone');

    if (!parentUser) {
      return res.status(404).json({ message: 'Parent user not found' });
    }

    const feeAmount = Math.round(numericAmount * 0.015);
    const totalToPay = numericAmount + feeAmount;

    const payerName = String(payer?.name || paymentMethod?.cardholderName || parentUser.name || '').trim();
    const payerEmail = String(payer?.email || parentUser.email || '').trim().toLowerCase();
    const payerPhone = normalizePhoneNumber(payer?.phone || parentUser.phone || '');
    const payerDocumentType = mapBoldDocumentType(payer?.documentType);
    const payerDocumentNumber = String(payer?.documentNumber || '').replace(/\D/g, '').trim();
    const requestedPaymentMethodName = String(paymentMethod?.name || 'CREDIT_CARD').trim().toUpperCase();
    const cardNumber = String(paymentMethod?.cardNumber || '').replace(/\D/g, '').trim();
    const expirationMonth = String(paymentMethod?.expirationMonth || '').replace(/\D/g, '').slice(0, 2);
    const expirationYear = String(paymentMethod?.expirationYear || '').replace(/\D/g, '').slice(-4);
    const installments = Math.max(1, Number(paymentMethod?.installments || 1));
    const cvc = String(paymentMethod?.cvc || '').replace(/\D/g, '').slice(0, 4);
    const supportsCardDetails = requestedPaymentMethodName === 'CREDIT_CARD';
    const pseBankConfig = requestedPaymentMethodName === 'PSE' ? getBoldPseBankConfig(paymentMethod) : null;

    if (!['CREDIT_CARD', 'NEQUI', 'BOTON_BANCOLOMBIA', 'PSE'].includes(requestedPaymentMethodName)) {
      return res.status(400).json({ message: 'Metodo de pago Bold no soportado.' });
    }

    if (!payerName || !payerEmail || payerPhone.length < 7 || !payerDocumentNumber) {
      return res.status(400).json({
        message: 'Faltan datos del titular para procesar el pago con Bold. Verifica nombre, correo, telefono y documento.',
      });
    }

    if (
      supportsCardDetails &&
      (cardNumber.length < 13 || cardNumber.length > 19 || expirationMonth.length !== 2 || expirationYear.length !== 4 || cvc.length < 3)
    ) {
      return res.status(400).json({ message: 'Los datos de la tarjeta no son validos.' });
    }

    if (requestedPaymentMethodName === 'PSE' && !hasValidBoldPseBankConfig(pseBankConfig)) {
      return res.status(400).json({
        message: 'Debes configurar un banco PSE valido antes de continuar. Define BOLD_PSE_BANK_CODE y BOLD_PSE_BANK_NAME en el backend o envia un banco permitido por Bold desde el formulario.',
      });
    }

    const reference = buildReference();
    const payment = await PaymentTransaction.create({
      schoolId,
      studentId: studentObjectId,
      parentId: userId,
      amount: numericAmount,
      method: 'bold',
      documentType: '',
      documentNumber: '',
      reference,
      status: 'pending',
      providerStatus: 'PENDING',
      description: String(description || 'Recarga Comergio').trim(),
    });

    try {
      const callbackUrl = buildBoldWalletReturnUrl({
        studentId: String(studentObjectId),
        reference,
      });

      const metadata = {
        reference,
        student_id: String(studentObjectId),
        source: 'comergio_wallet_topup',
      };

      const paymentIntent = await createPaymentIntent({
        referenceId: reference,
        amount: {
          currency: 'COP',
          total_amount: totalToPay,
        },
        description: payment.description,
        callbackUrl,
        metadata,
        customer: {
          name: payerName,
          phone: payerPhone,
          email: payerEmail,
        },
      });

      payment.providerResponse = {
        rechargeAmount: numericAmount,
        feeAmount,
        totalToPay,
        paymentIntent,
      };
      await payment.save();

      const paymentAttempt = await createPaymentAttempt({
        referenceId: reference,
        metadata,
        payer: {
          person_type: 'NATURAL_PERSON',
          name: payerName,
          phone: payerPhone,
          email: payerEmail,
          document_type: payerDocumentType,
          document_number: payerDocumentNumber,
          ...(['BOTON_BANCOLOMBIA', 'PSE'].includes(requestedPaymentMethodName)
            ? {
                billing_address: buildBoldBillingAddress(payer?.billingAddress || payer?.billing_address, payerPhone),
              }
            : {}),
        },
        paymentMethod: supportsCardDetails
          ? {
              name: 'CREDIT_CARD',
              card_number: cardNumber,
              cardholder_name: String(paymentMethod?.cardholderName || payerName).trim(),
              expiration_month: expirationMonth,
              expiration_year: expirationYear,
              installments,
              cvc,
            }
          : {
              name: requestedPaymentMethodName,
              ...(requestedPaymentMethodName === 'PSE'
                ? {
                    bank_code: pseBankConfig?.bankCode,
                    bank_name: pseBankConfig?.bankName,
                  }
                : {}),
            },
        deviceFingerprint,
      });

      const redirectUrl = getBoldCheckoutUrl(paymentAttempt, reference) || String(paymentAttempt?.next_actions?.redirect_url || '').trim();
      const providerRedirectMethod = String(
        paymentAttempt?.next_actions?.redirect_method || paymentAttempt?.redirect_method || ''
      ).trim();
      const redirectMethod = normalizeBoldRedirectMethod(redirectUrl, providerRedirectMethod);

      payment.providerTransactionId = extractBoldProviderTransactionId(paymentAttempt) || payment.providerTransactionId;
      payment.providerStatus = extractBoldProviderStatus(paymentAttempt) || 'RUNNING';
      payment.providerResponse = {
        rechargeAmount: numericAmount,
        feeAmount,
        totalToPay,
        paymentMethod: requestedPaymentMethodName,
        paymentIntent,
        paymentAttempt,
      };
      await payment.save();

      return res.status(200).json({
        paymentId: payment._id,
        reference,
        rechargeAmount: numericAmount,
        feeAmount,
        totalToPay,
        paymentMethod: requestedPaymentMethodName,
        status: extractBoldProviderStatus(paymentAttempt) || 'RUNNING',
        transactionId: extractBoldProviderTransactionId(paymentAttempt),
        redirectUrl,
        redirectMethod,
        callbackUrl,
      });
    } catch (providerError) {
      payment.status = 'failed';
      payment.providerStatus = 'ERROR';
      payment.failureReason = providerError.message;
      payment.providerResponse = {
        ...(payment.providerResponse || {}),
        rechargeAmount: numericAmount,
        feeAmount,
        totalToPay,
        error: {
          endpoint: providerError.providerEndpoint || '',
          ...(providerError.providerPayload || { message: providerError.message }),
        },
      };
      await payment.save();
      return res.status(Number(providerError?.status) || 500).json({ message: providerError.message });
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

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
