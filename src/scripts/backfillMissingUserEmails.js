require('dotenv').config();

const mongoose = require('mongoose');

const { connectDB } = require('../config/db');
const User = require('../models/user.model');

function buildEmailLocalPart(user = {}) {
  const usernamePart = String(user.username || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '.');

  const fallbackPart = String(user._id || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

  const base = usernamePart || fallbackPart || 'usuario.legacy';
  return base.replace(/^\.+|\.+$/g, '').slice(0, 48) || 'usuario.legacy';
}

async function buildUniquePlaceholderEmail(user, usedEmails) {
  const base = buildEmailLocalPart(user);
  let suffix = 0;

  while (true) {
    const localPart = suffix === 0 ? `legacy+${base}` : `legacy+${base}.${suffix}`;
    const candidate = `${localPart}@example.com`;

    if (usedEmails.has(candidate)) {
      suffix += 1;
      continue;
    }

    const existingUser = await User.exists({ email: candidate, _id: { $ne: user._id } });
    if (existingUser) {
      suffix += 1;
      continue;
    }

    usedEmails.add(candidate);
    return candidate;
  }
}

async function backfillMissingUserEmails() {
  await connectDB();

  const users = await User.find({
    $or: [
      { email: { $exists: false } },
      { email: null },
      { email: '' },
    ],
  })
    .select('_id username email role schoolId')
    .lean();

  if (users.length === 0) {
    console.log('No users require email backfill.');
    await mongoose.disconnect();
    return;
  }

  const usedEmails = new Set();
  let updatedCount = 0;

  for (const user of users) {
    const placeholderEmail = await buildUniquePlaceholderEmail(user, usedEmails);

    const result = await User.updateOne(
      {
        _id: user._id,
        $or: [
          { email: { $exists: false } },
          { email: null },
          { email: '' },
        ],
      },
      {
        $set: { email: placeholderEmail },
      }
    );

    if (result.modifiedCount > 0) {
      updatedCount += 1;
      console.log(`Updated ${user._id} (${user.role || 'user'}) -> ${placeholderEmail}`);
    }
  }

  console.log(`Email backfill completed. Updated ${updatedCount} of ${users.length} users.`);
  await mongoose.disconnect();
}

backfillMissingUserEmails().catch(async (error) => {
  console.error('Email backfill failed:', error.message);
  await mongoose.disconnect();
  process.exit(1);
});