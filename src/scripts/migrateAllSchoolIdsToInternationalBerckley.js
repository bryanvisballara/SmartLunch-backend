require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');

const TARGET_SCHOOL_ID = 'International Berckley School';
const LEGACY_SCHOOL_IDS = ['comergio-demo', 'Insternational Berckley School', 'International Berckley School'];

async function dedupeMeriendaOperations(db) {
  const collection = db.collection('meriendaoperations');
  const duplicates = await collection
    .aggregate([
      { $match: { schoolId: { $in: LEGACY_SCHOOL_IDS } } },
      {
        $group: {
          _id: { month: '$month' },
          ids: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  for (const item of duplicates) {
    const docs = await collection
      .find({ _id: { $in: item.ids } })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    if (docs.length <= 1) {
      continue;
    }

    const keeper = docs[0];
    const toDelete = docs.slice(1).map((doc) => doc._id);

    const mergedFixedCosts = docs.flatMap((doc) => (Array.isArray(doc.fixedCosts) ? doc.fixedCosts : []));
    const mergedVariableCosts = docs.flatMap((doc) => (Array.isArray(doc.variableCosts) ? doc.variableCosts : []));
    const subscriptionMonthlyCost = docs.reduce(
      (maxValue, doc) => Math.max(maxValue, Number(doc.subscriptionMonthlyCost || 0)),
      0
    );

    await collection.updateOne(
      { _id: keeper._id },
      {
        $set: {
          schoolId: TARGET_SCHOOL_ID,
          fixedCosts: mergedFixedCosts,
          variableCosts: mergedVariableCosts,
          subscriptionMonthlyCost,
        },
      }
    );

    if (toDelete.length > 0) {
      await collection.deleteMany({ _id: { $in: toDelete } });
    }
  }
}

async function migrateAllSchoolIds() {
  await connectDB();

  const db = mongoose.connection.db;

  await dedupeMeriendaOperations(db);

  const collections = await db.listCollections().toArray();
  const summary = [];

  for (const collectionMeta of collections) {
    const collection = db.collection(collectionMeta.name);
    const hasSchoolIdDocs = await collection.findOne({ schoolId: { $exists: true } }, { projection: { _id: 1 } });

    if (!hasSchoolIdDocs) {
      continue;
    }

    const beforeDistinct = await collection.distinct('schoolId', { schoolId: { $exists: true } });

    try {
      const result = await collection.updateMany(
        { schoolId: { $in: LEGACY_SCHOOL_IDS } },
        { $set: { schoolId: TARGET_SCHOOL_ID } }
      );

      const afterDistinct = await collection.distinct('schoolId', { schoolId: { $exists: true } });

      summary.push({
        collection: collectionMeta.name,
        matched: result.matchedCount,
        modified: result.modifiedCount,
        beforeDistinct,
        afterDistinct,
      });
    } catch (error) {
      summary.push({
        collection: collectionMeta.name,
        matched: 0,
        modified: 0,
        beforeDistinct,
        afterDistinct: beforeDistinct,
        error: error.message,
      });
    }
  }

  summary.sort((a, b) => a.collection.localeCompare(b.collection));

  console.log('[MIGRATION_SUMMARY]');
  for (const row of summary) {
    console.log(
      `${row.collection} | matched=${row.matched} | modified=${row.modified} | before=${JSON.stringify(row.beforeDistinct)} | after=${JSON.stringify(row.afterDistinct)}${row.error ? ` | error=${row.error}` : ''}`
    );
  }

  await mongoose.connection.close();
}

migrateAllSchoolIds().catch(async (error) => {
  console.error('Global schoolId migration failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
