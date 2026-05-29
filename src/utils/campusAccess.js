const CampusMembership = require('../models/campusMembership.model');

const MEMBER_TYPE_CONFIG = {
  campus_parent: {
    path: '/campus/parent',
    title: 'Campus Familia',
    description: 'Vista inicial para acudientes y padres de familia.',
    order: 10,
  },
  campus_student: {
    path: '/campus/student',
    title: 'Campus Alumno',
    description: 'Vista inicial para estudiantes.',
    order: 20,
  },
  campus_teacher: {
    path: '/campus/teacher',
    title: 'Campus Docente',
    description: 'Vista inicial para docentes.',
    order: 30,
  },
  campus_coordination: {
    path: '/campus/coordination',
    title: 'Campus Coordinacion',
    description: 'Vista inicial para coordinacion academica.',
    order: 40,
  },
  campus_school_route: {
    path: '/campus/route',
    title: 'Ruta escolar',
    description: 'Portal operativo para conductores y comunicaciones de recogida.',
    order: 50,
  },
};

function parseCsv(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function toBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizeMembershipRecord(record) {
  const config = MEMBER_TYPE_CONFIG[record.memberType] || {};
  const launchPath = String(record?.metadata?.launchPath || '').trim() || config.path || '/campus';
  const title = String(record?.metadata?.title || '').trim() || config.title || record.memberType;

  return {
    memberType: record.memberType,
    status: record.status,
    title,
    launchPath,
    permissions: Array.isArray(record.permissions) ? record.permissions.filter(Boolean) : [],
    virtual: false,
  };
}

function buildFallbackMemberships(user) {
  const memberships = [];

  if (toBoolean(process.env.CAMPUS_ALLOW_PARENT_FALLBACK) && String(user?.role || '') === 'parent') {
    memberships.push({
      memberType: 'campus_parent',
      status: 'active',
      permissions: [],
      metadata: {
        title: 'Campus Familia',
        launchPath: '/campus/parent',
      },
      virtual: true,
    });
  }

  if (String(user?.role || '') === 'school_route') {
    memberships.push({
      memberType: 'campus_school_route',
      status: 'active',
      permissions: [],
      metadata: {
        title: 'Ruta escolar',
        launchPath: '/campus/route',
      },
      virtual: true,
    });
  }

  return memberships;
}

function normalizeVirtualMembership(record) {
  return {
    memberType: record.memberType,
    status: record.status,
    title: String(record?.metadata?.title || '').trim() || MEMBER_TYPE_CONFIG[record.memberType]?.title || record.memberType,
    launchPath: String(record?.metadata?.launchPath || '').trim() || MEMBER_TYPE_CONFIG[record.memberType]?.path || '/campus',
    permissions: Array.isArray(record.permissions) ? record.permissions.filter(Boolean) : [],
    virtual: true,
  };
}

function buildNavigation(memberships) {
  return memberships
    .filter((membership) => MEMBER_TYPE_CONFIG[membership.memberType])
    .sort((left, right) => {
      const leftOrder = MEMBER_TYPE_CONFIG[left.memberType]?.order || 999;
      const rightOrder = MEMBER_TYPE_CONFIG[right.memberType]?.order || 999;
      return leftOrder - rightOrder;
    })
    .map((membership) => ({
      memberType: membership.memberType,
      path: membership.launchPath,
      title: membership.title,
      description: MEMBER_TYPE_CONFIG[membership.memberType]?.description || '',
      virtual: Boolean(membership.virtual),
    }));
}

function resolveFeatureFlags(user) {
  const enabledSchoolIds = parseCsv(process.env.CAMPUS_ENABLED_SCHOOL_IDS);
  const enabledUserIds = parseCsv(process.env.CAMPUS_ENABLED_USER_IDS);
  const enabledUsernames = parseCsv(process.env.CAMPUS_ENABLED_USERNAMES).map((value) => value.toLowerCase());
  const enabledRoles = parseCsv(process.env.CAMPUS_ENABLED_ROLES).map((value) => value.toLowerCase());

  const currentUserId = String(user?.userId || '').trim();
  const currentUsername = String(user?.username || '').trim().toLowerCase();
  const currentSchoolId = String(user?.schoolId || '').trim();
  const currentRole = String(user?.role || '').trim().toLowerCase();

  return {
    globalEnabled: toBoolean(process.env.CAMPUS_ENABLED),
    enabledBySchool: enabledSchoolIds.includes(currentSchoolId),
    enabledByUserId: enabledUserIds.includes(currentUserId),
    enabledByUsername: enabledUsernames.includes(currentUsername),
    enabledByRole: enabledRoles.includes(currentRole),
  };
}

function resolveDisabledReason({ featureEnabled, memberships }) {
  if (!featureEnabled) {
    return 'feature_not_enabled';
  }

  if (!memberships.length) {
    return 'no_memberships';
  }

  return '';
}

async function getCampusAccessContext(user) {
  const storedMemberships = await CampusMembership.find({
    schoolId: String(user?.schoolId || '').trim(),
    userId: String(user?.userId || '').trim(),
    status: 'active',
  })
    .select('memberType status permissions metadata')
    .lean();

  const normalizedStoredMemberships = storedMemberships.map(normalizeMembershipRecord);
  const fallbackMemberships = buildFallbackMemberships(user).map(normalizeVirtualMembership);
  const memberships = [...normalizedStoredMemberships];

  for (const fallbackMembership of fallbackMemberships) {
    if (!memberships.some((membership) => membership.memberType === fallbackMembership.memberType)) {
      memberships.push(fallbackMembership);
    }
  }

  const featureFlags = resolveFeatureFlags(user);
  const roleEnabledByDefault = String(user?.role || '') === 'school_route';
  const featureEnabled =
    featureFlags.globalEnabled ||
    featureFlags.enabledBySchool ||
    featureFlags.enabledByUserId ||
    featureFlags.enabledByUsername ||
    featureFlags.enabledByRole ||
    roleEnabledByDefault;

  const navigation = featureEnabled ? buildNavigation(memberships) : [];
  const defaultPath = navigation[0]?.path || '/campus';

  return {
    enabled: featureEnabled && memberships.length > 0,
    reason: resolveDisabledReason({ featureEnabled, memberships }),
    user: {
      userId: String(user?.userId || '').trim(),
      schoolId: String(user?.schoolId || '').trim(),
      role: String(user?.role || '').trim(),
      name: String(user?.name || '').trim(),
      username: String(user?.username || '').trim(),
    },
    featureFlags,
    memberships,
    navigation,
    defaultPath,
  };
}

module.exports = {
  getCampusAccessContext,
};