const jwt = require('jsonwebtoken');

const { runWithSchoolContext } = require('../config/db');
const { findActiveUserForAuth } = require('../utils/authUserResolver');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [, token] = header.split(' ');

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const activeUser = await findActiveUserForAuth({
      userId: decoded.userId,
      schoolId: decoded.schoolId,
    });

    if (!activeUser) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.user = {
      ...decoded,
      userId: String(activeUser._id),
      schoolId: activeUser.schoolId,
      role: activeUser.role,
      name: activeUser.name,
      username: String(activeUser.username || '').trim().toLowerCase(),
      coordinationScope: String(activeUser.coordinationScope || '').trim(),
      linkedStudentId: activeUser.linkedStudentId ? String(activeUser.linkedStudentId) : '',
    };

    return runWithSchoolContext(activeUser.schoolId, next);
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = authMiddleware;
