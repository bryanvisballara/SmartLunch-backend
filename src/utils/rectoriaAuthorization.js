const bcrypt = require('bcryptjs');
const User = require('../models/user.model');

const RECTORIA_AUTHORIZER_ROLES = ['rectoria', 'direccion'];

async function ensureRectoriaAuthorization({ schoolId, password }) {
  const normalizedPassword = String(password || '').trim();
  if (!normalizedPassword) {
    return {
      ok: false,
      status: 400,
      message: 'Debes ingresar la clave de autorización de Rectoría.',
    };
  }

  const authorizers = await User.find({
    schoolId,
    role: { $in: RECTORIA_AUTHORIZER_ROLES },
    status: 'active',
    deletedAt: null,
  }).select('name username role passwordHash');

  for (const authorizer of authorizers) {
    if (!authorizer.passwordHash) {
      continue;
    }

    const passwordMatches = await bcrypt.compare(normalizedPassword, authorizer.passwordHash);
    if (passwordMatches) {
      return {
        ok: true,
        authorizedBy: {
          userId: authorizer._id,
          name: authorizer.name,
          username: authorizer.username,
          role: authorizer.role,
        },
      };
    }
  }

  return {
    ok: false,
    status: 401,
    message: 'La clave de autorización de Rectoría no es válida.',
  };
}

module.exports = {
  RECTORIA_AUTHORIZER_ROLES,
  ensureRectoriaAuthorization,
};
