require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');

// Load all model definitions so Mongoose can create collections and indexes.
require('../models');

async function initCollections() {
  try {
    await connectDB();

    const modelNames = mongoose.modelNames();

    for (const modelName of modelNames) {
      const model = mongoose.model(modelName);
      await model.createCollection();
      await model.syncIndexes();
      console.log(`Initialized: ${model.collection.collectionName}`);
    }

    console.log('All collections and indexes were initialized successfully.');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize collections:', error.message);
    await mongoose.connection.close();
    process.exit(1);
  }
}

initCollections();
