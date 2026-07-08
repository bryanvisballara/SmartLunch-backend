require('dotenv').config();

const crypto = require('crypto');
const mongoose = require('mongoose');

const { connectDB, runWithSchoolContext } = require('../src/config/db');
require('../src/models');

const SOURCE_SCHOOL_ID = 'International Berckley School';
const TARGET_SCHOOL_ID = 'comergio_demo_kns8p';
const TARGET_STORE_NAMES = ['TeachMe Primaria', 'TeachMe Secundaria'];

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function buildSharedProductIdMap(sourceProducts) {
  const map = new Map();
  for (const product of sourceProducts) {
    const sharedProductId = String(product.sharedProductId || '').trim();
    if (!sharedProductId) {
      continue;
    }
    if (!map.has(sharedProductId)) {
      map.set(sharedProductId, crypto.randomUUID());
    }
  }
  return map;
}

async function loadSourceData() {
  return runWithSchoolContext(SOURCE_SCHOOL_ID, async () => {
    const Store = require('../src/models/store.model');
    const Category = require('../src/models/category.model');
    const Product = require('../src/models/product.model');

    const stores = await Store.find({
      schoolId: SOURCE_SCHOOL_ID,
      name: { $in: TARGET_STORE_NAMES },
      deletedAt: null,
    }).lean();

    const categories = await Category.find({
      schoolId: SOURCE_SCHOOL_ID,
      deletedAt: null,
    }).sort({ name: 1 }).lean();

    const storeIds = stores.map((store) => store._id);
    const products = await Product.find({
      schoolId: SOURCE_SCHOOL_ID,
      storeId: { $in: storeIds },
      deletedAt: null,
    }).lean();

    return { stores, categories, products };
  });
}

async function copyToTarget({ stores, categories, products }) {
  return runWithSchoolContext(TARGET_SCHOOL_ID, async () => {
    const Store = require('../src/models/store.model');
    const Category = require('../src/models/category.model');
    const Product = require('../src/models/product.model');

    const existingStores = await Store.find({
      schoolId: TARGET_SCHOOL_ID,
      name: { $in: TARGET_STORE_NAMES },
    }).lean();
    const existingStoreIds = existingStores.map((store) => store._id);

    if (existingStoreIds.length > 0) {
      await Product.deleteMany({
        schoolId: TARGET_SCHOOL_ID,
        storeId: { $in: existingStoreIds },
      });
      await Store.deleteMany({
        schoolId: TARGET_SCHOOL_ID,
        _id: { $in: existingStoreIds },
      });
    }

    await Category.deleteMany({ schoolId: TARGET_SCHOOL_ID });
    await Product.deleteMany({ schoolId: TARGET_SCHOOL_ID, storeId: { $nin: existingStoreIds } });

    const categoryIdBySourceId = new Map();
    const createdCategories = [];

    for (const category of categories) {
      const created = await Category.create({
        schoolId: TARGET_SCHOOL_ID,
        name: category.name,
        imageUrl: String(category.imageUrl || ''),
        thumbUrl: String(category.thumbUrl || ''),
        status: category.status || 'active',
        deletedAt: null,
      });
      categoryIdBySourceId.set(String(category._id), created._id);
      createdCategories.push(created);
    }

    const storeIdBySourceId = new Map();
    const createdStores = [];

    for (const store of stores) {
      const created = await Store.create({
        schoolId: TARGET_SCHOOL_ID,
        name: store.name,
        location: String(store.location || ''),
        status: store.status || 'active',
        deletedAt: null,
      });
      storeIdBySourceId.set(String(store._id), created._id);
      createdStores.push(created);
    }

    const sharedProductIdMap = buildSharedProductIdMap(products);
    const productDocs = products.map((product) => {
      const mappedCategoryId = categoryIdBySourceId.get(String(product.categoryId));
      const mappedStoreId = storeIdBySourceId.get(String(product.storeId));
      const sourceSharedProductId = String(product.sharedProductId || '').trim();

      if (!mappedCategoryId || !mappedStoreId) {
        throw new Error(`No se pudo mapear producto ${product.name}`);
      }

      return {
        schoolId: TARGET_SCHOOL_ID,
        sharedProductId: sourceSharedProductId
          ? sharedProductIdMap.get(sourceSharedProductId)
          : '',
        name: product.name,
        categoryId: mappedCategoryId,
        storeId: mappedStoreId,
        price: Number(product.price || 0),
        cost: Number(product.cost || 0),
        stock: Number(product.stock || 0),
        inventoryAlertStock: Number(product.inventoryAlertStock ?? 10),
        imageUrl: String(product.imageUrl || ''),
        thumbUrl: String(product.thumbUrl || ''),
        shortDescription: String(product.shortDescription || ''),
        tags: Array.isArray(product.tags) ? product.tags : [],
        status: product.status || 'active',
        deletedAt: null,
      };
    });

    const insertedProducts = await Product.insertMany(productDocs);

    return {
      categories: createdCategories.length,
      stores: createdStores.length,
      products: insertedProducts.length,
      storeNames: createdStores.map((store) => store.name),
      categoryNames: createdCategories.map((category) => category.name),
    };
  });
}

async function run() {
  await connectDB();

  const source = await loadSourceData();

  if (source.stores.length !== TARGET_STORE_NAMES.length) {
    throw new Error(`Se esperaban ${TARGET_STORE_NAMES.length} tiendas en origen, encontradas ${source.stores.length}.`);
  }

  if (source.categories.length === 0) {
    throw new Error('No hay categorias en International Berckley School.');
  }

  if (source.products.length === 0) {
    throw new Error('No hay productos en las tiendas TeachMe del colegio origen.');
  }

  const result = await copyToTarget(source);

  console.log(`Origen: ${SOURCE_SCHOOL_ID}`);
  console.log(`Destino: ${TARGET_SCHOOL_ID}`);
  console.log(`Categorias copiadas: ${result.categories}`);
  console.log(`Tiendas copiadas: ${result.stores} (${result.storeNames.join(', ')})`);
  console.log(`Productos copiados: ${result.products}`);
  console.log(`Categorias: ${result.categoryNames.join(', ')}`);

  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('Copy failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
