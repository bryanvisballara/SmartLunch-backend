const jwt = require('jsonwebtoken');

const User = require('../models/user.model');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [, token] = header.split(' ');

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const activeUser = await User.findOne({
      _id: decoded.userId,
      status: 'active',
      deletedAt: null,
    }).select('schoolId role name');

    if (!activeUser) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = {
      ...decoded,
      userId: String(activeUser._id),
      schoolId: activeUser.schoolId,
      role: activeUser.role,
      name: activeUser.name,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = authMiddleware;
