require('dotenv').config();
const { connectDB } = require('../src/config/db');
const User = require('../src/models/user.model');

(async () => {
  await connectDB();
  const user = await User.findOne({ username: 'bryan.visbal' });
  if (!user) {
    console.log('User bryan.visbal NOT found. Searching similar...');
    const similar = await User.find({ username: /bryan/i }).lean();
    console.log('Similar:', similar.map(u => ({ username: u.username, role: u.role, email: u.email })));
    process.exit(1);
  }
  console.log('Current state:', { username: user.username, role: user.role, email: user.email, schoolId: user.schoolId });

  if (user.role !== 'admin') {
    user.role = 'admin';
    await user.save();
    console.log('Role updated to admin successfully.');
  } else {
    console.log('Role is already admin — no change needed.');
  }
  process.exit(0);
})();
