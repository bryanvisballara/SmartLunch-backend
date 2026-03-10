const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const Product = require('../src/models/product.model');
const Category = require('../src/models/category.model');
const MeriendaSnack = require('../src/models/meriendaSnack.model');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI no esta definido en .env');
    process.exit(1);
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || undefined,
  });

  const re = /^data:image\//i;

  const [productsImage, productsThumb, categoriesImage, categoriesThumb, snacksImage] = await Promise.all([
    Product.updateMany({ imageUrl: re }, { $set: { imageUrl: '' } }),
    Product.updateMany({ thumbUrl: re }, { $set: { thumbUrl: '' } }),
    Category.updateMany({ imageUrl: re }, { $set: { imageUrl: '' } }),
    Category.updateMany({ thumbUrl: re }, { $set: { thumbUrl: '' } }),
    MeriendaSnack.updateMany({ imageUrl: re }, { $set: { imageUrl: '' } }),
  ]);

  console.log(
    JSON.stringify(
      {
        productsImageModified: productsImage.modifiedCount,
        productsThumbModified: productsThumb.modifiedCount,
        categoriesImageModified: categoriesImage.modifiedCount,
        categoriesThumbModified: categoriesThumb.modifiedCount,
        snacksImageModified: snacksImage.modifiedCount,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error.message || error);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect errors
  }
  process.exit(1);
});
