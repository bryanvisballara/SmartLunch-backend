require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Product = require('../models/product.model');
const Store = require('../models/store.model');

async function run() {
  await connectDB();

  const schoolId = 'International Berckley School';
  const stores = await Store.find({ schoolId, deletedAt: null }).select('_id name').lean();
  const storeIds = stores.map((item) => String(item._id));

  const products = await Product.find({
    schoolId,
    deletedAt: null,
    status: 'active',
    stock: 0,
  })
    .select('name categoryId storeId')
    .lean();

  const groups = new Map();
  for (const product of products) {
    const key = `${String(product.name || '').trim().toLowerCase()}|${String(product.categoryId)}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(product);
  }

  let fullCoverage = 0;
  let missingCoverage = 0;
  let sampleComplete = null;
  let sampleMissing = null;

  for (const [key, list] of groups.entries()) {
    const existingStoreIds = new Set(list.map((item) => String(item.storeId)));
    const missingStoreIds = storeIds.filter((id) => !existingStoreIds.has(id));

    if (missingStoreIds.length === 0) {
      fullCoverage += 1;
      if (!sampleComplete) {
        sampleComplete = {
          key,
          replicatedCount: list.length,
        };
      }
    } else {
      missingCoverage += 1;
      if (!sampleMissing) {
        sampleMissing = {
          key,
          replicatedCount: list.length,
          missingStoreIds,
        };
      }
    }
  }

  console.log(`stores: ${stores.map((item) => item.name).join(' | ')}`);
  console.log(`groupsFullCoverage: ${fullCoverage}`);
  console.log(`groupsMissingCoverage: ${missingCoverage}`);
  if (sampleComplete) {
    console.log(`sampleComplete: ${JSON.stringify(sampleComplete)}`);
  }
  if (sampleMissing) {
    console.log(`sampleMissing: ${JSON.stringify(sampleMissing)}`);
  }

  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Verification failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
