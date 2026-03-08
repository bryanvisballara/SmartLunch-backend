require('dotenv').config();

const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const PaymentTransaction = require('../models/paymentTransaction.model');

async function migratePaymentTransactionIndexes() {
  await connectDB();

  const collection = PaymentTransaction.collection;
  const indexes = await collection.indexes();
  const providerIndex = indexes.find((index) => index.name === 'providerTransactionId_1');

  if (providerIndex) {
    await collection.dropIndex('providerTransactionId_1');
    console.log('Dropped existing index: providerTransactionId_1');
  }

  const cleanupResult = await collection.updateMany(
    {
      $or: [{ providerTransactionId: null }, { providerTransactionId: '' }],
    },
    {
      $unset: { providerTransactionId: '' },
    }
  );

  console.log(`Unset providerTransactionId in ${cleanupResult.modifiedCount || 0} documents`);

  await collection.createIndex(
    { providerTransactionId: 1 },
    {
      name: 'providerTransactionId_1',
      unique: true,
      partialFilterExpression: {
        providerTransactionId: { $type: 'string' },
      },
    }
  );

  console.log('Created new partial unique index: providerTransactionId_1');

  await mongoose.connection.close();
}

migratePaymentTransactionIndexes().catch(async (error) => {
  console.error('PaymentTransaction index migration failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
