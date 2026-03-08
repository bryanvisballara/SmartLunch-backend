const jwt = require('jsonwebtoken');

function signAccessToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      schoolId: user.schoolId,
      role: user.role,
      name: user.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

module.exports = { signAccessToken };
