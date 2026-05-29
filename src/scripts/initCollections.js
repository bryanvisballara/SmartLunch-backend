require('dotenv').config();

const { connectDB, getRegisteredModelNames, resolveRegisteredModel, runWithSchoolContext } = require('../config/db');

// Load all model definitions so Mongoose can create collections and indexes.
require('../models');

async function initCollections() {
  try {
    await connectDB();

    const modelNames = getRegisteredModelNames();

    for (const modelName of modelNames) {
      await runWithSchoolContext('', async () => {
        const model = resolveRegisteredModel(modelName);
        await model.createCollection();
        await model.syncIndexes();
        console.log(`Initialized: ${model.collection.collectionName}`);
      });
    }

    console.log('All collections and indexes were initialized successfully.');
    await require('mongoose').connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize collections:', error.message);
    await require('mongoose').connection.close();
    process.exit(1);
  }
}

initCollections();
