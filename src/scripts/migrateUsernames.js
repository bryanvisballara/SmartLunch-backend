require('dotenv').config();

const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const User = require('../models/user.model');

function slugifyUsername(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
}

async function getUniqueUsername(base, used) {
  const safeBase = slugifyUsername(base) || 'user';
  let candidate = safeBase;
  let counter = 1;

  // Keep trying with numeric suffix until we find a free username.
  while (used.has(candidate) || (await User.exists({ username: candidate }))) {
    counter += 1;
    candidate = `${safeBase}${counter}`.slice(0, 28);
  }

  used.add(candidate);
  return candidate;
}

async function migrateUsernames() {
  await connectDB();

  const users = await User.find({
    $or: [{ username: { $exists: false } }, { username: null }, { username: '' }],
  })
    .select('_id name email username')
    .lean();

  if (users.length === 0) {
    console.log('No users require username migration.');
    await mongoose.connection.close();
    return;
  }

  const used = new Set();

  for (const user of users) {
    const emailBase = String(user.email || '').split('@')[0];
    const base = emailBase || user.name || 'user';
    const username = await getUniqueUsername(base, used);

    await User.updateOne({ _id: user._id }, { $set: { username } });
    console.log(`Migrated user ${user._id} -> ${username}`);
  }

  console.log(`Username migration completed for ${users.length} users.`);
  await mongoose.connection.close();
}

migrateUsernames().catch(async (error) => {
  console.error('Username migration failed:', error.message);
  await mongoose.connection.close();
  process.exit(1);
});
