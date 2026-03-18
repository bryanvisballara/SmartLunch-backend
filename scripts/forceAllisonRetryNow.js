require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    const db = mongoose.connection.db;

    await db.collection('wallets').updateOne(
      { _id: new mongoose.Types.ObjectId('69add8f9de20181b7a591b40') },
      {
        $set: {
          autoDebitRetryAt: new Date(Date.now() - 2000),
          autoDebitInProgress: false,
          autoDebitLockAt: null,
        },
      }
    );

    console.log('retryAt forced to now for Allison');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
