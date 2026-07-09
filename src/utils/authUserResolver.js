const {
  findOneAcrossTenantSchoolDbs,
  runInControlDb,
  runWithSchoolContext,
} = require('../config/db');
const User = require('../models/user.model');

const ACTIVE_USER_SELECT = 'schoolId role name username coordinationScope linkedStudentId authSessions';

function normalizeSchoolId(value) {
  return String(value || '').trim();
}

function resolveAuthSchoolIdCandidates(schoolId = '') {
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  if (!normalizedSchoolId) {
    return [];
  }

  const aliasMap = {
    'comergio-demo': ['comergio_demo_kns8p', 'comergio-demo', 'comergio_demo'],
    comergio_demo: ['comergio_demo_kns8p', 'comergio_demo', 'comergio-demo'],
    comergio_demo_kns8p: ['comergio_demo_kns8p', 'comergio-demo', 'comergio_demo'],
  };

  const aliases = aliasMap[normalizedSchoolId.toLowerCase()] || [normalizedSchoolId];
  return [...new Set(aliases.map(normalizeSchoolId).filter(Boolean))];
}

async function findActiveUserForAuth({ userId, schoolId }) {
  const baseFilter = {
    _id: userId,
    status: 'active',
    deletedAt: null,
  };
  const normalizedSchoolId = normalizeSchoolId(schoolId);
  const schoolIdCandidates = resolveAuthSchoolIdCandidates(normalizedSchoolId);
  const schoolIdsToTry = [...new Set([...schoolIdCandidates, normalizedSchoolId].filter(Boolean))];

  for (const candidateSchoolId of schoolIdsToTry) {
    const user = await runWithSchoolContext(candidateSchoolId, () => User.findOne({
      ...baseFilter,
      schoolId: candidateSchoolId,
    }).select(ACTIVE_USER_SELECT));

    if (user) {
      return user;
    }

    if (normalizedSchoolId && normalizedSchoolId !== candidateSchoolId) {
      const userWithStoredSchoolId = await runWithSchoolContext(candidateSchoolId, () => User.findOne({
        ...baseFilter,
        schoolId: normalizedSchoolId,
      }).select(ACTIVE_USER_SELECT));

      if (userWithStoredSchoolId) {
        return userWithStoredSchoolId;
      }
    }
  }

  const controlUser = await runInControlDb(() => User.findOne({
    ...baseFilter,
    schoolId: normalizedSchoolId,
  }).select(ACTIVE_USER_SELECT));

  if (controlUser) {
    return controlUser;
  }

  const locatedUser = await findOneAcrossTenantSchoolDbs(() => User.findOne({
    ...baseFilter,
    schoolId: normalizedSchoolId,
  }).select(ACTIVE_USER_SELECT));

  if (locatedUser?.doc) {
    return locatedUser.doc;
  }

  const locatedById = await findOneAcrossTenantSchoolDbs(() => User.findOne(baseFilter).select(ACTIVE_USER_SELECT));
  return locatedById?.doc || null;
}

module.exports = {
  ACTIVE_USER_SELECT,
  findActiveUserForAuth,
  resolveAuthSchoolIdCandidates,
};
