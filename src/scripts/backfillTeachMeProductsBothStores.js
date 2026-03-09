require('dotenv').config();

const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const Product = require('../models/product.model');
const Store = require('../models/store.model');

const PRIMARY_STORE_NAME = 'TeachMe Primaria';
const SECONDARY_STORE_NAME = 'TeachMe Secundaria';

function productKey(product) {
  return `${String(product?.name || '').trim().toLowerCase()}|${String(product?.categoryId || '')}`;
}

async function run() {
  await connectDB();

  const stores = await Store.find({
    name: { $in: [PRIMARY_STORE_NAME, SECONDARY_STORE_NAME] },
    deletedAt: null,
  })
    .select('_id name schoolId')
    .lean();

  const primaryStore = stores.find((store) => String(store.name) === PRIMARY_STORE_NAME);
  const secondaryStore = stores.find((store) => String(store.name) === SECONDARY_STORE_NAME);

  if (!primaryStore || !secondaryStore) {
    throw new Error('No se encontraron ambas tiendas TeachMe Primaria/Secundaria.');
  }

  if (String(primaryStore.schoolId) !== String(secondaryStore.schoolId)) {
    throw new Error('Las tiendas TeachMe pertenecen a colegios distintos.');
  }

  const schoolId = String(primaryStore.schoolId);
  const targetStoreIds = [String(primaryStore._id), String(secondaryStore._id)];

  const products = await Product.find({
    schoolId,
    deletedAt: null,
  })
    .select('schoolId name categoryId storeId price cost inventoryAlertStock imageUrl shortDescription tags status deletedAt')
    .lean();

  const groups = new Map();
  for (const product of products) {
    const key = productKey(product);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(product);
  }

  const docsToInsert = [];
  let groupsChecked = 0;
  let groupsWithMissing = 0;

  for (const list of groups.values()) {
    groupsChecked += 1;

    const existingByStoreId = new Set(list.map((item) => String(item.storeId)));
    const missingStoreIds = targetStoreIds.filter((storeId) => !existingByStoreId.has(storeId));

    if (missingStoreIds.length === 0) {
      continue;
    }

    groupsWithMissing += 1;

    // Prefer using a template already in one of the TeachMe stores.
    const template =
      list.find((item) => targetStoreIds.includes(String(item.storeId))) ||
      list.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))[0];

    for (const storeId of missingStoreIds) {
      docsToInsert.push({
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
      });
    }
  }

  let inserted = 0;
  if (docsToInsert.length > 0) {
    const insertedDocs = await Product.insertMany(docsToInsert);
    inserted = insertedDocs.length;
  }

  console.log(`schoolId=${schoolId}`);
  console.log(`stores=${PRIMARY_STORE_NAME} | ${SECONDARY_STORE_NAME}`);
  console.log(`groupsChecked=${groupsChecked}`);
  console.log(`groupsWithMissing=${groupsWithMissing}`);
  console.log(`productsCreated=${inserted}`);

  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Backfill failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
