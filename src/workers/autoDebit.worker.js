const ParentStudentLink = require('../models/parentStudentLink.model');
const ParentPaymentMethod = require('../models/parentPaymentMethod.model');
const Wallet = require('../models/wallet.model');
const PaymentTransaction = require('../models/paymentTransaction.model');
const User = require('../models/user.model');
const {
  isMercadoPagoConfigured,
  createAuthorizedPayment: createMercadoPagoAuthorizedPayment,
  createPayment: createMercadoPagoPayment,
  createCardTokenFromCustomerCard: createMercadoPagoCardTokenFromCustomerCard,
  getPreapproval: getMercadoPagoPreapproval,
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

  const mercadopagoConfigured = isMercadoPagoConfigured();
  if (!mercadopagoConfigured) {
    return;
  }

  inProgress = true;

  try {
    const wallets = await Wallet.find({
      autoDebitEnabled: true,
      status: 'active',
      autoDebitAmount: { $gt: 0 },
      autoDebitLimit: { $gt: 0 },
      $or: [
        { autoDebitPaymentMethodId: { $ne: null } },
        { autoDebitAgreementId: { $ne: '' }, autoDebitAgreementStatus: 'authorized' },
      ],
    })
      .select('_id schoolId studentId balance autoDebitLimit autoDebitAmount autoDebitPaymentMethodId autoDebitAgreementId autoDebitAgreementStatus autoDebitLastChargeAt autoDebitRetryAt autoDebitRetryCount autoDebitMonthlyLimit autoDebitMonthlyUsed autoDebitMonthlyPeriod')
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
        $or: [
          { autoDebitPaymentMethodId: { $ne: null } },
          { autoDebitAgreementId: { $ne: '' }, autoDebitAgreementStatus: 'authorized' },
        ],
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
        .select('_id schoolId studentId autoDebitAmount autoDebitPaymentMethodId autoDebitAgreementId autoDebitAgreementStatus autoDebitRetryCount autoDebitMonthlyLimit autoDebitMonthlyUsed autoDebitMonthlyPeriod')
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

      const autoDebitAgreementId = String(lockedWallet.autoDebitAgreementId || '').trim();
      const autoDebitAgreementStatus = String(lockedWallet.autoDebitAgreementStatus || '').trim().toLowerCase();
      const isMercadoPagoAgreement = Boolean(autoDebitAgreementId) && autoDebitAgreementStatus === 'authorized';

      let verifiedCard = null;
      if (paymentMethodIdFromWallet) {
        verifiedCard = await ParentPaymentMethod.findOne({
          _id: paymentMethodIdFromWallet,
          schoolId,
          parentUserId: parentId,
          provider: 'mercadopago',
          type: 'card',
          status: 'active',
          deletedAt: null,
          verificationStatus: 'verified',
        })
          .select('_id providerCustomerId providerCardId providerPaymentMethodId providerDeviceId')
          .lean();
      }

      const hasTokenizedCard = Boolean(
        verifiedCard?._id
        && String(verifiedCard?.providerCustomerId || '').trim()
        && String(verifiedCard?.providerCardId || '').trim()
      );

      if ((!hasTokenizedCard && !isMercadoPagoAgreement) || !mercadopagoConfigured) {
        await Wallet.updateOne(
          { _id: lockedWallet._id },
          { $set: { autoDebitInProgress: false, autoDebitLockAt: null } }
        );
        continue;
      }

      const paymentMethod = 'mercadopago_auto_debit';
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
        paymentMethodId: hasTokenizedCard ? verifiedCard._id : null,
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

        if (hasTokenizedCard) {
          const cardRefId = Number(String(verifiedCard.providerCardId || '').trim());
          const paymentMethodProviderId = String(verifiedCard.providerPaymentMethodId || '').trim();
          const providerCustomerId = String(verifiedCard.providerCustomerId || '').trim();

          if (!Number.isFinite(cardRefId) || cardRefId <= 0 || !providerCustomerId) {
            throw new Error('Tarjeta tokenizada inválida para cobro automático');
          }

          const generatedCardToken = await createMercadoPagoCardTokenFromCustomerCard({
            customerId: providerCustomerId,
            cardId: cardRefId,
          });
          const oneClickToken = String(generatedCardToken?.id || '').trim();
          if (!oneClickToken) {
            throw new Error('No fue posible generar token para la tarjeta guardada');
          }

          providerPayment = await createMercadoPagoPayment({
            amount,
            token: oneClickToken,
            paymentMethodId: paymentMethodProviderId || undefined,
            paymentMethodReferenceId: undefined,
            customerId: providerCustomerId,
            payerEmail: parentEmail || undefined,
            externalReference: String(studentId),
            description: 'Recarga automatica Comergio',
            idempotencyKey,
            deviceId: String(verifiedCard.providerDeviceId || '').trim() || undefined,
          });
        } else {
          try {
            providerPayment = await createMercadoPagoAuthorizedPayment({
              preapprovalId: autoDebitAgreementId,
              amount,
              externalReference: String(studentId),
              description: 'Recarga automatica Comergio',
              idempotencyKey,
            });
          } catch (providerError) {
            const isResourceNotFound = Number(providerError?.status || 0) === 404
              || String(providerError?.providerPayload?.error || '').toLowerCase() === 'resource not found';

            if (!isResourceNotFound) {
              throw providerError;
            }

            // Compatibility fallback: some MP accounts do not expose /authorized_payments.
            const agreement = await getMercadoPagoPreapproval(autoDebitAgreementId);
            const payerId = String(agreement?.payer_id || agreement?.payer?.id || '').trim();
            const payerEmail = String(agreement?.payer_email || agreement?.payer?.email || parentEmail || '').trim().toLowerCase();
            const cardId = Number(agreement?.card_id || agreement?.card?.id || 0);
            const paymentMethodId = String(
              agreement?.payment_method_id
              || agreement?.auto_recurring?.payment_method_id
              || agreement?.card?.payment_method_id
              || ''
            ).trim();

            try {
              providerPayment = await createMercadoPagoPayment({
                amount,
                paymentMethodId: paymentMethodId || undefined,
                paymentMethodReferenceId: Number.isFinite(cardId) && cardId > 0 ? cardId : undefined,
                preapprovalId: autoDebitAgreementId,
                customerId: payerId || undefined,
                payerEmail: payerEmail || undefined,
                externalReference: String(studentId),
                description: 'Recarga automatica Comergio',
                idempotencyKey,
              });
            } catch (paymentError) {
              const customerNotFound = String(paymentError?.message || '').toLowerCase().includes('customer not found')
                || Number(paymentError?.providerPayload?.cause?.[0]?.code || 0) === 2002;

              if (!customerNotFound || !payerEmail) {
                throw paymentError;
              }

              providerPayment = await createMercadoPagoPayment({
                amount,
                paymentMethodId: paymentMethodId || undefined,
                paymentMethodReferenceId: Number.isFinite(cardId) && cardId > 0 ? cardId : undefined,
                preapprovalId: autoDebitAgreementId,
                customerId: undefined,
                payerEmail,
                externalReference: String(studentId),
                description: 'Recarga automatica Comergio',
                idempotencyKey,
              });
            }
          }
        }

        paymentRecord.providerTransactionId = String(providerPayment?.id || providerPayment?.transaction_id || '').trim();
        paymentRecord.providerStatus = String(providerPayment?.status || providerPayment?.state || 'pending').trim();
        paymentRecord.status = toMercadoPagoInternalStatus(paymentRecord.providerStatus);
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
        paymentRecord.failureReason = providerError?.message || 'No fue posible crear el pago en Mercado Pago';
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
