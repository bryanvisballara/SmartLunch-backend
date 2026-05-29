const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { listTenantSchoolContexts, runWithSchoolContext } = require('../config/db');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const AcademicStructure = require('../models/academicStructure.model');
const SchoolCreationSnapshot = require('../models/schoolCreationSnapshot.model');
const SuperAdminSchoolSettings = require('../models/superAdminSchoolSettings.model');

const router = express.Router();

const DEFAULT_PARENT_FEATURES = {
  home: true,
  finance: true,
  academic: true,
  cafeteria: true,
  nursing: true,
  wellbeing: true,
  coexistence: true,
  transport: true,
};

const FEATURE_KEYS = Object.keys(DEFAULT_PARENT_FEATURES);
const SUBSCRIPTION_STATUSES = new Set(['subscribed', 'trial', 'paused', 'disabled']);

router.use(authMiddleware);
router.use(roleMiddleware('super_admin'));

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeParentFeatures(rawFeatures = {}) {
  return FEATURE_KEYS.reduce((features, key) => {
    features[key] = rawFeatures[key] === undefined ? DEFAULT_PARENT_FEATURES[key] : Boolean(rawFeatures[key]);
    return features;
  }, {});
}

function normalizePricePerStudent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return 0;
  }

  return Math.round(numericValue);
}

function serializeSettings(settings = {}) {
  return {
    subscriptionStatus: SUBSCRIPTION_STATUSES.has(settings.subscriptionStatus) ? settings.subscriptionStatus : 'subscribed',
    pricePerStudent: normalizePricePerStudent(settings.pricePerStudent),
    parentFeatures: normalizeParentFeatures(settings.parentFeatures || {}),
    notes: normalizeText(settings.notes),
    updatedAt: settings.updatedAt || null,
  };
}

function humanizeSchoolId(value) {
  return normalizeText(value)
    .replace(/[_-][a-z0-9]{5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function getSchoolDisplayName(schoolId) {
  const [snapshot, academicStructure] = await Promise.all([
    SchoolCreationSnapshot.findOne({ schoolId }).sort({ completedAt: -1, updatedAt: -1 }).select('schoolName').lean(),
    AcademicStructure.findOne({ schoolId }).select('schoolName').lean(),
  ]);

  return normalizeText(snapshot?.schoolName || academicStructure?.schoolName) || humanizeSchoolId(schoolId) || schoolId;
}

async function getSchoolSummary(tenantContext) {
  return runWithSchoolContext(tenantContext.schoolId, async () => {
    const [schoolName, activeStudents, inactiveStudents, parentUsers, settings] = await Promise.all([
      getSchoolDisplayName(tenantContext.schoolId),
      Student.countDocuments({ schoolId: tenantContext.schoolId, status: 'active', deletedAt: null }),
      Student.countDocuments({ schoolId: tenantContext.schoolId, status: 'inactive', deletedAt: null }),
      User.countDocuments({ schoolId: tenantContext.schoolId, role: 'parent', status: 'active', deletedAt: null }),
      SuperAdminSchoolSettings.findOne({ schoolId: tenantContext.schoolId }).lean(),
    ]);
    const serializedSettings = serializeSettings(settings || { schoolId: tenantContext.schoolId });

    return {
      schoolId: tenantContext.schoolId,
      dbName: tenantContext.dbName,
      schoolName,
      activeStudents,
      inactiveStudents,
      parentUsers,
      settings: serializedSettings,
      monthlyCharge: activeStudents * serializedSettings.pricePerStudent,
    };
  });
}

router.get('/summary', async (_req, res) => {
  try {
    const tenantContexts = await listTenantSchoolContexts();
    const schools = await Promise.all(tenantContexts.map(getSchoolSummary));
    const sortedSchools = schools.sort((left, right) => left.schoolName.localeCompare(right.schoolName, 'es', { sensitivity: 'base' }));
    const totals = sortedSchools.reduce((accumulator, school) => {
      accumulator.totalSchools += 1;
      accumulator.subscribedSchools += school.settings.subscriptionStatus === 'subscribed' ? 1 : 0;
      accumulator.activeStudents += school.activeStudents;
      accumulator.parentUsers += school.parentUsers;
      accumulator.projectedMonthlyBilling += school.monthlyCharge;
      return accumulator;
    }, {
      totalSchools: 0,
      subscribedSchools: 0,
      activeStudents: 0,
      parentUsers: 0,
      projectedMonthlyBilling: 0,
    });

    return res.status(200).json({ totals, schools: sortedSchools });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/schools/:schoolId/settings', async (req, res) => {
  try {
    const targetSchoolId = normalizeText(req.params.schoolId);
    const tenantContexts = await listTenantSchoolContexts();
    const tenantContext = tenantContexts.find((context) => context.schoolId === targetSchoolId);

    if (!tenantContext) {
      return res.status(404).json({ message: 'Colegio no encontrado' });
    }

    const subscriptionStatus = SUBSCRIPTION_STATUSES.has(req.body?.subscriptionStatus)
      ? req.body.subscriptionStatus
      : 'subscribed';
    const updates = {
      schoolId: targetSchoolId,
      subscriptionStatus,
      pricePerStudent: normalizePricePerStudent(req.body?.pricePerStudent),
      parentFeatures: normalizeParentFeatures(req.body?.parentFeatures || {}),
      notes: normalizeText(req.body?.notes),
      updatedBy: normalizeText(req.user?.username || req.user?.name),
    };

    await runWithSchoolContext(targetSchoolId, async () => {
      await SuperAdminSchoolSettings.findOneAndUpdate(
        { schoolId: targetSchoolId },
        { $set: updates },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    });

    const school = await getSchoolSummary(tenantContext);
    return res.status(200).json({ school });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;