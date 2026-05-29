require('dotenv').config();

const mongoose = require('mongoose');
const {
  connectDB,
  getRegisteredModelNames,
  getSchoolConnection,
  resolveRegisteredModel,
  resolveSchoolDbName,
  runWithSchoolContext,
} = require('../config/db');

require('../models');

const DROP_TARGET_DATABASES = !process.argv.includes('--keep-existing=true');

async function migrateSchoolDatabases() {
  try {
    const sourceConnection = await connectDB();
    const sourceDb = sourceConnection.db;
    const modelNames = getRegisteredModelNames();
    const modelCollections = modelNames.map((modelName) => ({
      modelName,
      collectionName: resolveRegisteredModel(modelName).collection.collectionName,
    }));

    const schoolIds = (await sourceDb.collection('users').distinct('schoolId', {
      schoolId: { $type: 'string', $ne: '' },
    }))
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));

    const summary = [];

    for (const schoolId of schoolIds) {
      const targetConnection = getSchoolConnection(schoolId);
      const targetDb = targetConnection.db;
      const targetDbName = resolveSchoolDbName(schoolId);

      if (DROP_TARGET_DATABASES) {
        await targetDb.dropDatabase();
      }

      const collectionCounts = [];

      for (const { collectionName } of modelCollections) {
        const documents = await sourceDb.collection(collectionName).find({ schoolId }).toArray();
        if (!documents.length) {
          continue;
        }

        await targetDb.collection(collectionName).insertMany(documents, { ordered: false });
        collectionCounts.push({ collectionName, count: documents.length });
      }

      await runWithSchoolContext(schoolId, async () => {
        for (const modelName of modelNames) {
          const model = resolveRegisteredModel(modelName);
          await model.syncIndexes();
        }
      });

      summary.push({
        schoolId,
        dbName: targetDbName,
        collections: collectionCounts,
      });
    }

    console.log(JSON.stringify({
      sourceDatabase: sourceDb.databaseName,
      dropTargetDatabases: DROP_TARGET_DATABASES,
      schools: summary,
    }, null, 2));

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Failed to migrate school databases:', error.message);
    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  }
}

migrateSchoolDatabases();