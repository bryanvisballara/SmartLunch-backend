require('dotenv').config();

const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const Product = require('../models/product.model');
const Store = require('../models/store.model');

const SCHOOL_ID = 'International Berckley School';

async function run() {
  await connectDB();

  const stores = await Store.find({ schoolId: SCHOOL_ID, deletedAt: null })
    .select('_id')
    .lean();
  const storeIds = stores.map((item) => String(item._id));

  if (storeIds.length === 0) {
    throw new Error('No stores found for the target school');
  }

  const sourceProducts = await Product.find({
    schoolId: SCHOOL_ID,
    deletedAt: null,
    stock: 0,
  }).lean();

  const groups = new Map();
  for (const product of sourceProducts) {
    const key = `${String(product.name || '').trim().toLowerCase()}|${String(product.categoryId)}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(product);
  }

  let createdProducts = 0;
  let updatedGroups = 0;

  for (const products of groups.values()) {
    const existingStoreIds = new Set(products.map((item) => String(item.storeId)));
    const missingStoreIds = storeIds.filter((id) => !existingStoreIds.has(id));

    if (missingStoreIds.length === 0) {
      continue;
    }

    const template = products.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
    const docs = missingStoreIds.map((storeId) => ({
      schoolId: template.schoolId,
      name: template.name,
      categoryId: template.categoryId,
      storeId,
      price: Number(template.price || 0),
      cost: Number(template.cost || 0),
      stock: 0,
      inventoryAlertStock: Number(template.inventoryAlertStock ?? 10),
      imageUrl: String(template.imageUrl || ''),
      shortDescription: String(template.shortDescription || ''),
      tags: Array.isArray(template.tags) ? template.tags : [],
      status: template.status || 'active',
      deletedAt: null,
    }));

    if (docs.length > 0) {
      await Product.insertMany(docs);
      createdProducts += docs.length;
      updatedGroups += 1;
    }
  }

  console.log(`Backfill completed. Groups updated: ${updatedGroups}, Products created: ${createdProducts}`);
  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Backfill failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
