require('dotenv').config();

const { connectDB } = require('../src/config/db');
const PaymentTransaction = require('../src/models/paymentTransaction.model');

async function main() {
  const rawLimit = Number(process.argv[2] || 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;
  const referenceFilter = String(process.argv[3] || '').trim();

  await connectDB();

  const query = { method: 'epayco' };
  if (referenceFilter) {
    query.reference = referenceFilter;
  }

  const rows = await PaymentTransaction.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select([
      'reference',
      'status',
      'providerStatus',
      'providerTransactionId',
      'walletTransactionId',
      'amount',
      'failureReason',
      'approvedAt',
      'createdAt',
      'updatedAt',
      'callbackPayload',
      'providerResponse',
    ].join(' '))
    .lean();

  const output = rows.map((row) => ({
    reference: row.reference,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status,
    providerStatus: row.providerStatus,
    providerTransactionId: row.providerTransactionId || '',
    amount: Number(row.amount || 0),
    approvedAt: row.approvedAt || null,
    hasWalletCredit: Boolean(row.walletTransactionId),
    walletTransactionId: row.walletTransactionId ? String(row.walletTransactionId) : '',
    hasConfirmationPayload: Boolean(row.callbackPayload && Object.keys(row.callbackPayload).length),
    confirmationRefPayco: String(row.callbackPayload?.x_ref_payco || '').trim(),
    confirmationTransactionId: String(row.callbackPayload?.x_transaction_id || '').trim(),
    responseSources: Object.keys(row.providerResponse || {}),
    failureReason: row.failureReason || '',
  }));

  console.log(JSON.stringify(output, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });