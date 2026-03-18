const ParentStudentLink = require('../models/parentStudentLink.model');
const ParentPaymentMethod = require('../models/parentPaymentMethod.model');
const Wallet = require('../models/wallet.model');
const WalletTransaction = require('../models/walletTransaction.model');
const PaymentTransaction = require('../models/paymentTransaction.model');
const User = require('../models/user.model');
const {
  isEpaycoConfigured,
  chargeCustomer: chargeEpaycoCustomer,
  toInternalStatus: toEpaycoInternalStatus,
} = require('../services/epayco.service');

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

  inProgress = true;

  if (!isEpaycoConfigured()) {
    inProgress = false;
    return;
  }

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
      const parentUser = await User.findById(parentId).select('email').lean();
      const parentEmail = String(parentUser?.email || '').trim().toLowerCase();
      const paymentMethodIdFromWallet = lockedWallet?.autoDebitPaymentMethodId || null;

      let verifiedCard = null;
      if (paymentMethodIdFromWallet) {
        verifiedCard = await ParentPaymentMethod.findOne({
          _id: paymentMethodIdFromWallet,
          schoolId,
          parentUserId: parentId,
          provider: 'epayco',
          type: 'card',
          status: 'active',
          deletedAt: null,
          verificationStatus: 'verified',
        })
          .select('_id provider providerCustomerId providerCardId providerPaymentMethodId providerDeviceId holderFirstName holderLastName holderDocType holderDocument')
          .lean();
      }

      const hasEpaycoCard = Boolean(
        verifiedCard?._id
        && verifiedCard.provider === 'epayco'
        && String(verifiedCard?.providerCustomerId || '').trim()
        && String(verifiedCard?.providerCardId || '').trim()
      );

      if (!hasEpaycoCard) {
        await Wallet.updateOne(
          { _id: lockedWallet._id },
          { $set: { autoDebitInProgress: false, autoDebitLockAt: null } }
        );
        continue;
      }

      const paymentMethod = 'epayco_auto_debit';
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
        paymentMethodId: verifiedCard?._id || null,
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
        const idempotencyKey = `autodebit-${String(lockedWallet._id)}-${reference}`;
        let providerPayment;
        let chargeStatus;

        // ── ePayco path (primary) ──────────────────────────────────────────
        if (hasEpaycoCard) {
          const epaycoCustomerId = String(verifiedCard.providerCustomerId || '').trim();
          const epaycoCardToken = String(verifiedCard.providerCardId || '').trim();

          if (!epaycoCustomerId || !epaycoCardToken) {
            throw new Error('Tarjeta ePayco inválida para cobro automático');
          }

          providerPayment = await chargeEpaycoCustomer({
            customerId: epaycoCustomerId,
            customerToken: epaycoCardToken,
            docType: String(verifiedCard.holderDocType || 'CC').trim(),
            docNumber: String(verifiedCard.holderDocument || '').replace(/\D/g, ''),
            firstName: String(verifiedCard.holderFirstName || '').trim(),
            lastName: String(verifiedCard.holderLastName || '').trim(),
            email: parentEmail || 'pagos@comergio.co',
            city: 'Bogota',
            address: 'Colombia',
            phone: '3000000000',
            cellPhone: '3000000000',
            description: 'Recarga automatica Comergio',
            amount,
            idempotencyKey,
          });

          // ePayco response fields
          paymentRecord.providerTransactionId = String(
            providerPayment?.x_ref_payco
            || providerPayment?.ref_payco
            || providerPayment?.x_transaction_id
            || providerPayment?.transaction?.data?.ref_payco
            || providerPayment?.transaction?.data?.recibo
            || ''
          ).trim();

          const epaycoState = String(
            providerPayment?.x_transaction_state
            || providerPayment?.x_response
            || providerPayment?.transaction?.data?.estado
            || providerPayment?.transaction?.data?.respuesta
            || ''
          ).trim();

          const epaycoReason = String(
            providerPayment?.x_response_reason_text
            || providerPayment?.transaction?.data?.respuesta
            || providerPayment?.transaction?.data?.cc_network_response?.message
            || providerPayment?.transaction?.data?.cod_error
            || epaycoState
            || 'ePayco error'
          ).trim();

          paymentRecord.providerStatus = epaycoState;
          chargeStatus = toEpaycoInternalStatus(epaycoState);
          paymentRecord.status = chargeStatus;
          paymentRecord.failureReason = (chargeStatus === 'failed' || chargeStatus === 'rejected')
            ? epaycoReason
            : null;
          paymentRecord.providerResponse = providerPayment;
          await paymentRecord.save();

          // ePayco charges are synchronous — credit the wallet immediately if approved
          if (chargeStatus === 'approved') {
            const walletForCredit = await Wallet.findOne({ _id: lockedWallet._id });
            if (walletForCredit && !paymentRecord.walletTransactionId) {
              const periodForCredit = currentYearMonth();
              if (String(walletForCredit.autoDebitMonthlyPeriod || '') !== periodForCredit) {
                walletForCredit.autoDebitMonthlyPeriod = periodForCredit;
                walletForCredit.autoDebitMonthlyUsed = 0;
              }
              walletForCredit.balance += amount;
              walletForCredit.autoDebitMonthlyUsed = Number(walletForCredit.autoDebitMonthlyUsed || 0) + amount;
              walletForCredit.autoDebitInProgress = false;
              walletForCredit.autoDebitLockAt = null;
              walletForCredit.autoDebitLastChargeAt = new Date();
              walletForCredit.autoDebitRetryAt = null;
              walletForCredit.autoDebitRetryCount = 0;
              await walletForCredit.save();

              const [topupTx] = await WalletTransaction.create([{
                schoolId,
                studentId,
                walletId: walletForCredit._id,
                type: 'recharge',
                amount,
                method: 'epayco',
                createdBy: parentId,
                notes: `Recarga automatica aprobada por ePayco (${paymentRecord.providerTransactionId || reference})`,
              }]);

              paymentRecord.walletTransactionId = topupTx._id;
              paymentRecord.approvedAt = new Date();
              await paymentRecord.save();
            }
          }

        }

        if (paymentRecord.status !== 'pending') {
          await scheduleRetry({
            walletId: lockedWallet._id,
            currentRetryCount: Number(lockedWallet?.autoDebitRetryCount || 0),
          });
        }
      } catch (providerError) {
        paymentRecord.status = 'failed';
        paymentRecord.providerStatus = 'error';
        paymentRecord.failureReason = providerError?.message || 'No fue posible crear el cobro automatico';
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
