require('dotenv').config();

const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const MeriendaSubscription = require('../models/meriendaSubscription.model');

async function migrateMeriendasIndexes() {
  await connectDB();

  const collection = MeriendaSubscription.collection;
  const indexes = await collection.indexes();
  const staleIndex = indexes.find((index) => index.name === 'schoolId_1_studentId_1');

  if (staleIndex) {
    await collection.dropIndex('schoolId_1_studentId_1');
    console.log('Dropped stale index: schoolId_1_studentId_1');
  } else {
    console.log('No stale index found: schoolId_1_studentId_1');
  }

  // Ensure schema-defined indexes are present after cleanup.
  await MeriendaSubscription.syncIndexes();
  console.log('MeriendaSubscription indexes are synchronized.');

  await mongoose.connection.close();
}

migrateMeriendasIndexes().catch(async (error) => {
  console.error('Meriendas index migration failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
