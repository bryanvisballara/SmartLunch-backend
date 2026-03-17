const ParentStudentLink = require('../models/parentStudentLink.model');
const ParentPaymentMethod = require('../models/parentPaymentMethod.model');
const Wallet = require('../models/wallet.model');
const PaymentTransaction = require('../models/paymentTransaction.model');
const {
  isBoldConfigured,
  createCardPayment,
  toInternalStatus,
} = require('../services/bold.service');
const {
  isMercadoPagoConfigured,
  getCustomerCard,
  createPayment: createMercadoPagoPayment,
  toInternalStatus: toMercadoPagoInternalStatus,
} = require('../services/mercadopago.service');

const POLL_INTERVAL_MS = Number(process.env.AUTO_DEBIT_POLL_MS || 60_000);
const AUTO_DEBIT_COOLDOWN_MS = Number(process.env.AUTO_DEBIT_COOLDOWN_MS || 5 * 60_000);
const AUTO_DEBIT_LOCK_TIMEOUT_MS = Number(process.env.AUTO_DEBIT_LOCK_TIMEOUT_MS || 10 * 60_000);

let intervalRef = null;
let inProgress = false;

function buildReference() {
  const random = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
  return `SL-AD-${Date.now()}-${random}`;
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

async function scheduleRetry({ walletId, currentRetryCount }) {
  const nextRetryCount = Number(currentRetryCount || 0) + 1;
  const retryDelayMs = resolveRetryDelayMs(nextRetryCount);
  const retryAt = new Date(Date.now() + Math.max(0, retryDelayMs));

  await Wallet.updateOne(
    { _id: walletId },
    {
      $set: {
        autoDebitInProgress: false,
        autoDebitLockAt: null,
        autoDebitRetryAt: retryAt,
        autoDebitRetryCount: nextRetryCount,
      },
    }
  );
}

async function runAutoDebitCycle() {
  if (inProgress) {
    return;
  }

  const boldConfigured = isBoldConfigured();
  const mercadopagoConfigured = isMercadoPagoConfigured();
  if (!boldConfigured && !mercadopagoConfigured) {
    return;
  }

  inProgress = true;

  try {
    const wallets = await Wallet.find({
      autoDebitEnabled: true,
      status: 'active',
      autoDebitAmount: { $gt: 0 },
      autoDebitLimit: { $gt: 0 },
      autoDebitPaymentMethodId: { $ne: null },
    })
      .select('_id schoolId studentId balance autoDebitLimit autoDebitAmount autoDebitPaymentMethodId autoDebitLastChargeAt autoDebitRetryAt autoDebitRetryCount autoDebitMonthlyLimit autoDebitMonthlyUsed autoDebitMonthlyPeriod')
      .lean();

    for (const wallet of wallets) {
      const currentBalance = Number(wallet?.balance || 0);
      const threshold = Number(wallet?.autoDebitLimit || 0);
      if (currentBalance >= threshold) {
        continue;
      }

      const retryAtMs = wallet?.autoDebitRetryAt ? new Date(wallet.autoDebitRetryAt).getTime() : 0;
      if (retryAtMs && retryAtMs > Date.now()) {
        continue;
      }

      const lastChargeAtMs = wallet?.autoDebitLastChargeAt ? new Date(wallet.autoDebitLastChargeAt).getTime() : 0;
      if (lastChargeAtMs && Date.now() - lastChargeAtMs < AUTO_DEBIT_COOLDOWN_MS) {
        continue;
      }

      const lockFilter = {
        _id: wallet._id,
        autoDebitEnabled: true,
        status: 'active',
        autoDebitAmount: { $gt: 0 },
        autoDebitLimit: { $gt: 0 },
        autoDebitPaymentMethodId: { $ne: null },
      };

      // Enforce balance-threshold and cooldown atomically to prevent parallel charges.
      lockFilter.$expr = {
        $lt: ['$balance', '$autoDebitLimit'],
      };
      lockFilter.$or = [
        {
          autoDebitInProgress: { $ne: true },
          $or: [
            { autoDebitLastChargeAt: null },
            { autoDebitLastChargeAt: { $lte: new Date(Date.now() - AUTO_DEBIT_COOLDOWN_MS) } },
          ],
        },
        {
          autoDebitInProgress: true,
          autoDebitLockAt: { $lte: new Date(Date.now() - AUTO_DEBIT_LOCK_TIMEOUT_MS) },
        },
      ];

      lockFilter.$and = [
        {
          $or: [
            { autoDebitRetryAt: null },
            { autoDebitRetryAt: { $lte: new Date() } },
          ],
        },
      ];

      const lockedWallet = await Wallet.findOneAndUpdate(
        lockFilter,
        {
          $set: {
            autoDebitInProgress: true,
            autoDebitLockAt: new Date(),
            autoDebitLastAttempt: new Date(),
          },
        },
        {
          new: true,
        }
      )
        .select('_id schoolId studentId autoDebitAmount autoDebitPaymentMethodId autoDebitRetryCount autoDebitMonthlyLimit autoDebitMonthlyUsed autoDebitMonthlyPeriod')
        .lean();

      if (!lockedWallet) {
        continue;
      }

      const studentId = lockedWallet.studentId;
      const schoolId = lockedWallet.schoolId;
      const amount = Number(lockedWallet?.autoDebitAmount || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        await Wallet.updateOne(
          { _id: lockedWallet._id },
          { $set: { autoDebitInProgress: false, autoDebitLockAt: null } }
        );
        continue;
      }

      const period = currentYearMonth();
      let monthlyUsed = Number(lockedWallet?.autoDebitMonthlyUsed || 0);
      if (String(lockedWallet?.autoDebitMonthlyPeriod || '') !== period) {
        monthlyUsed = 0;
        await Wallet.updateOne(
          { _id: lockedWallet._id },
          { $set: { autoDebitMonthlyUsed: 0, autoDebitMonthlyPeriod: period } }
        );
      }

      const monthlyLimit = Number(lockedWallet?.autoDebitMonthlyLimit || 0);
      if (monthlyLimit > 0 && monthlyUsed + amount > monthlyLimit) {
        await Wallet.updateOne(
          { _id: lockedWallet._id },
          { $set: { autoDebitInProgress: false, autoDebitLockAt: null } }
        );
        continue;
      }

      const link = await ParentStudentLink.findOne({
        schoolId,
        studentId,
        status: 'active',
      })
        .select('parentId')
        .lean();

      if (!link?.parentId) {
        continue;
      }

      const parentId = link.parentId;

      const card = await ParentPaymentMethod.findOne({
        _id: lockedWallet.autoDebitPaymentMethodId,
        schoolId,
        parentUserId: parentId,
        type: 'card',
        status: 'active',
        deletedAt: null,
        verificationStatus: 'verified',
      })
        .select('_id provider providerCustomerId providerCardId providerPaymentMethodId providerDeviceId')
        .lean();

      if (!card) {
        await Wallet.updateOne(
          { _id: lockedWallet._id },
          { $set: { autoDebitInProgress: false, autoDebitLockAt: null } }
        );
        continue;
      }

      const provider = String(card.provider || '').trim().toLowerCase();
      const isBoldCard = provider === 'bold' && Boolean(String(card.providerCardId || '').trim());
      const isMercadoPagoCard = provider === 'mercadopago' && Boolean(String(card.providerCardId || '').trim()) && Boolean(String(card.providerCustomerId || '').trim()) && Boolean(String(card.providerPaymentMethodId || '').trim());

      if ((!isBoldCard && !isMercadoPagoCard) || (isBoldCard && !boldConfigured) || (isMercadoPagoCard && !mercadopagoConfigured)) {
        await Wallet.updateOne(
          { _id: lockedWallet._id },
          { $set: { autoDebitInProgress: false, autoDebitLockAt: null } }
        );
        continue;
      }

      const paymentMethod = isMercadoPagoCard ? 'mercadopago_auto_debit' : 'bold_auto_debit';
      const hasPending = await PaymentTransaction.exists({
        schoolId,
        studentId,
        method: paymentMethod,
        status: 'pending',
      });

      if (hasPending) {
        await Wallet.updateOne(
          { _id: lockedWallet._id },
          { $set: { autoDebitInProgress: false, autoDebitLockAt: null } }
        );
        continue;
      }

      const reference = buildReference();
      const paymentRecord = await PaymentTransaction.create({
        schoolId,
        studentId,
        parentId,
        paymentMethodId: card._id,
        amount,
        method: paymentMethod,
        documentType: '',
        documentNumber: '',
        reference,
        status: 'pending',
        providerStatus: 'pending',
        description: `Recarga automatica Comergio - alumno ${String(studentId)}`,
      });

      try {
        let providerPayment;
        if (isMercadoPagoCard) {
          const providerCard = await getCustomerCard({
            customerId: card.providerCustomerId,
            cardId: card.providerCardId,
          });

          const paymentMethodId = String(
            providerCard?.payment_method?.id || card.providerPaymentMethodId || ''
          ).trim();
          const issuerId = String(providerCard?.issuer?.id || '').trim();

          if (!paymentMethodId || !issuerId) {
            throw new Error('No fue posible identificar emisor o medio de pago de la tarjeta guardada en Mercado Pago');
          }

          providerPayment = await createMercadoPagoPayment({
            amount,
            paymentMethodId,
            paymentMethodReferenceId: card.providerCardId,
            customerId: card.providerCustomerId,
            issuerId,
            deviceId: card.providerDeviceId,
            externalReference: String(studentId),
            description: 'Recarga automatica Comergio',
            idempotencyKey: `autodebit-${String(lockedWallet._id)}-${reference}`,
          });
        } else {
          providerPayment = await createCardPayment({
            amount,
            paymentMethodToken: card.providerCardId,
            customerId: card.providerCustomerId,
            externalReference: String(studentId),
            description: 'Recarga automatica Comergio',
            idempotencyKey: `autodebit-${String(lockedWallet._id)}-${reference}`,
          });
        }

        paymentRecord.providerTransactionId = String(providerPayment?.id || providerPayment?.transaction_id || '').trim();
        paymentRecord.providerStatus = String(providerPayment?.status || providerPayment?.state || 'pending').trim();
        paymentRecord.status = isMercadoPagoCard
          ? toMercadoPagoInternalStatus(paymentRecord.providerStatus)
          : toInternalStatus(paymentRecord.providerStatus);
        paymentRecord.providerResponse = providerPayment;
        paymentRecord.failureReason = paymentRecord.status === 'failed' || paymentRecord.status === 'rejected'
          ? String(providerPayment?.status_detail || paymentRecord.providerStatus || 'Provider error')
          : null;
        await paymentRecord.save();

        if (paymentRecord.status !== 'pending') {
          await scheduleRetry({
            walletId: lockedWallet._id,
            currentRetryCount: Number(lockedWallet?.autoDebitRetryCount || 0),
          });
        }
      } catch (providerError) {
        paymentRecord.status = 'failed';
        paymentRecord.providerStatus = 'error';
        paymentRecord.failureReason = providerError?.message || (isMercadoPagoCard
          ? 'No fue posible crear el pago en Mercado Pago'
          : 'No fue posible crear el pago en Bold');
        paymentRecord.providerResponse = providerError?.providerPayload || null;
        await paymentRecord.save();

        await scheduleRetry({
          walletId: lockedWallet._id,
          currentRetryCount: Number(lockedWallet?.autoDebitRetryCount || 0),
        });
      }
    }
  } finally {
    inProgress = false;
  }
}

function startAutoDebitWorker() {
  if (String(process.env.AUTO_DEBIT_WORKER_ENABLED || 'true').toLowerCase() === 'false') {
    console.info('Auto-debit worker disabled by AUTO_DEBIT_WORKER_ENABLED=false');
    return;
  }

  if (intervalRef) {
    return;
  }

  intervalRef = setInterval(() => {
    runAutoDebitCycle().catch((error) => {
      console.error(`[AUTO_DEBIT_WORKER_ERROR] ${error.message}`);
    });
  }, Math.max(10_000, POLL_INTERVAL_MS));

  runAutoDebitCycle().catch((error) => {
    console.error(`[AUTO_DEBIT_WORKER_BOOTSTRAP_ERROR] ${error.message}`);
  });

  console.info(`Auto-debit worker started. Poll interval: ${Math.max(10_000, POLL_INTERVAL_MS)}ms`);
}

module.exports = {
  startAutoDebitWorker,
  runAutoDebitCycle,
};
