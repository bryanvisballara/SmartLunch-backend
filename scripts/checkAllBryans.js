require('dotenv').config();
const { connectDB } = require('../src/config/db');
const User = require('../src/models/user.model');

(async () => {
  await connectDB();
  const users = await User.find({ username: /bryan/i }).lean();
  console.log('All bryan users count:', users.length);
  console.log(JSON.stringify(users.map(u => ({
    _id: u._id,
    username: u.username,
    role: u.role,
    email: u.email,
    schoolId: u.schoolId,
    status: u.status,
  })), null, 2));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
