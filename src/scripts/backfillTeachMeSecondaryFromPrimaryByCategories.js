require('dotenv').config();

const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const Product = require('../models/product.model');
const Store = require('../models/store.model');
const Category = require('../models/category.model');

const PRIMARY_STORE_NAME = 'TeachMe Primaria';
const SECONDARY_STORE_NAME = 'TeachMe Secundaria';
const TARGET_CATEGORY_NAMES = ['dulces', 'helados', 'galletas'];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function productKey(product) {
  return `${normalizeText(product?.name)}|${String(product?.categoryId || '')}`;
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
    throw new Error('No se encontraron TeachMe Primaria y TeachMe Secundaria.');
  }

  if (String(primaryStore.schoolId) !== String(secondaryStore.schoolId)) {
    throw new Error('Primaria y Secundaria pertenecen a colegios distintos.');
  }

  const schoolId = String(primaryStore.schoolId);

  const categories = await Category.find({
    schoolId,
    deletedAt: null,
    name: { $in: TARGET_CATEGORY_NAMES.map((name) => new RegExp(`^${name}$`, 'i')) },
  })
    .select('_id name')
    .lean();

  if (categories.length === 0) {
    throw new Error('No se encontraron categorias dulces/helados/galletas en el colegio objetivo.');
  }

  const categoryIds = categories.map((category) => String(category._id));

  const primaryProducts = await Product.find({
    schoolId,
    storeId: primaryStore._id,
    categoryId: { $in: categoryIds },
    deletedAt: null,
  })
    .select('schoolId name categoryId price cost inventoryAlertStock imageUrl shortDescription tags status')
    .lean();

  const secondaryProducts = await Product.find({
    schoolId,
    storeId: secondaryStore._id,
    categoryId: { $in: categoryIds },
    deletedAt: null,
  })
    .select('name categoryId')
    .lean();

  const existingSecondaryKeys = new Set(secondaryProducts.map((product) => productKey(product)));

  const docsToInsert = [];
  for (const sourceProduct of primaryProducts) {
    const key = productKey(sourceProduct);
    if (existingSecondaryKeys.has(key)) {
      continue;
    }

    docsToInsert.push({
      schoolId,
      name: sourceProduct.name,
      categoryId: sourceProduct.categoryId,
      storeId: secondaryStore._id,
      price: Number(sourceProduct.price || 0),
      cost: Number(sourceProduct.cost || 0),
      stock: 0,
      inventoryAlertStock: Number(sourceProduct.inventoryAlertStock ?? 10),
      imageUrl: String(sourceProduct.imageUrl || ''),
      shortDescription: String(sourceProduct.shortDescription || ''),
      tags: Array.isArray(sourceProduct.tags) ? sourceProduct.tags : [],
      status: sourceProduct.status || 'active',
      deletedAt: null,
    });

    existingSecondaryKeys.add(key);
  }

  let inserted = 0;
  if (docsToInsert.length > 0) {
    const insertedDocs = await Product.insertMany(docsToInsert);
    inserted = insertedDocs.length;
  }

  console.log(`schoolId=${schoolId}`);
  console.log(`primaryStore=${PRIMARY_STORE_NAME}`);
  console.log(`secondaryStore=${SECONDARY_STORE_NAME}`);
  console.log(`categories=${categories.map((item) => item.name).join(', ')}`);
  console.log(`primaryProductsInScope=${primaryProducts.length}`);
  console.log(`secondaryProductsInScope=${secondaryProducts.length}`);
  console.log(`createdInSecondary=${inserted}`);

  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Backfill failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
