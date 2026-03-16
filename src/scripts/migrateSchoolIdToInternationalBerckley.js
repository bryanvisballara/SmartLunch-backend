require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/user.model');

const OLD_SCHOOL_ID = 'comergio-demo';
const NEW_SCHOOL_ID = 'International Berckley School';

async function run() {
  await connectDB();

  const result = await User.updateMany(
    { schoolId: OLD_SCHOOL_ID, deletedAt: null },
    { $set: { schoolId: NEW_SCHOOL_ID } }
  );

  console.log(
    `SchoolId migration completed. Matched: ${result.matchedCount}, Updated: ${result.modifiedCount}`
  );

  await mongoose.connection.close();
}

run().catch(async (error) => {
  console.error('SchoolId migration failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
