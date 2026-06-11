const express = require('express');
const bcrypt = require('bcryptjs');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { deleteSchoolTenant, listTenantSchoolContexts, runWithSchoolContext } = require('../config/db');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const SuperAdminSchoolSettings = require('../models/superAdminSchoolSettings.model');
const { getSchoolDisplayName, updateSchoolDisplayName } = require('../utils/schoolDisplayName');

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

function serializeRectoriaUser(user) {
  if (!user) {
    return null;
  }

  return {
    _id: user._id,
    schoolId: user.schoolId,
    name: user.name,
    username: user.username,
    email: user.email || '',
    phone: user.phone || '',
    role: user.role,
    status: user.status,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

async function findTenantContext(schoolId) {
  const tenantContexts = await listTenantSchoolContexts();
  return tenantContexts.find((context) => context.schoolId === schoolId) || null;
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

    const nextSchoolName = req.body?.schoolName !== undefined
      ? normalizeText(req.body.schoolName)
      : null;

    await runWithSchoolContext(targetSchoolId, async () => {
      await SuperAdminSchoolSettings.findOneAndUpdate(
        { schoolId: targetSchoolId },
        { $set: updates },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      if (nextSchoolName !== null) {
        await updateSchoolDisplayName(targetSchoolId, nextSchoolName);
      }
    });

    const school = await getSchoolSummary(tenantContext);
    return res.status(200).json({ school });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ message: error.message });
  }
});

router.get('/schools/:schoolId/rectoria', async (req, res) => {
  try {
    const targetSchoolId = normalizeText(req.params.schoolId);
    const tenantContext = await findTenantContext(targetSchoolId);

    if (!tenantContext) {
      return res.status(404).json({ message: 'Colegio no encontrado' });
    }

    const user = await runWithSchoolContext(targetSchoolId, async () => (
      User.findOne({
        schoolId: targetSchoolId,
        role: 'rectoria',
        deletedAt: null,
      })
        .select('_id schoolId name username email phone role status createdAt updatedAt')
        .sort({ createdAt: 1 })
        .lean()
    ));

    return res.status(200).json({ user: serializeRectoriaUser(user) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/schools/:schoolId/rectoria', async (req, res) => {
  try {
    const targetSchoolId = normalizeText(req.params.schoolId);
    const tenantContext = await findTenantContext(targetSchoolId);

    if (!tenantContext) {
      return res.status(404).json({ message: 'Colegio no encontrado' });
    }

    const normalizedUsername = normalizeText(req.body?.username).toLowerCase();
    const password = String(req.body?.password || '');
    const name = normalizeText(req.body?.name);
    const email = normalizeText(req.body?.email).toLowerCase();

    if (!normalizedUsername) {
      return res.status(400).json({ message: 'El nombre de usuario es obligatorio.' });
    }

    const result = await runWithSchoolContext(targetSchoolId, async () => {
      const existingRectoria = await User.findOne({
        schoolId: targetSchoolId,
        role: 'rectoria',
        deletedAt: null,
      }).select('_id username name email phone role status schoolId passwordHash');

      const usernameOwner = await User.findOne({
        username: normalizedUsername,
        deletedAt: null,
      }).select('_id schoolId role username');

      if (usernameOwner) {
        const isSameRectoria = existingRectoria && String(usernameOwner._id) === String(existingRectoria._id);
        const isSameSchoolDifferentRole = String(usernameOwner.schoolId) === targetSchoolId && usernameOwner.role !== 'rectoria';
        const isDifferentSchool = String(usernameOwner.schoolId) !== targetSchoolId;

        if (isDifferentSchool || isSameSchoolDifferentRole || (existingRectoria && !isSameRectoria)) {
          const conflictError = new Error('El nombre de usuario ya está registrado.');
          conflictError.statusCode = 409;
          throw conflictError;
        }
      }

      if (existingRectoria) {
        if (password && password.length < 8) {
          const validationError = new Error('La contraseña debe tener al menos 8 caracteres.');
          validationError.statusCode = 400;
          throw validationError;
        }

        existingRectoria.username = normalizedUsername;
        if (password) {
          existingRectoria.passwordHash = await bcrypt.hash(password, 10);
        }
        existingRectoria.name = name || existingRectoria.name;
        existingRectoria.email = email || existingRectoria.email || '';
        existingRectoria.status = 'active';
        existingRectoria.deletedAt = null;
        await existingRectoria.save();
        return { user: existingRectoria, isUpdate: true };
      }

      if (!password || password.length < 8) {
        const validationError = new Error('La contraseña debe tener al menos 8 caracteres.');
        validationError.statusCode = 400;
        throw validationError;
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const createdUser = await User.create({
        schoolId: targetSchoolId,
        name: name || 'Usuario de rectoría',
        username: normalizedUsername,
        email,
        passwordHash,
        role: 'rectoria',
        status: 'active',
        deletedAt: null,
      });

      return { user: createdUser, isUpdate: false };
    });

    return res.status(result.isUpdate ? 200 : 201).json({
      message: result.isUpdate ? 'Usuario de rectoría actualizado.' : 'Usuario de rectoría creado.',
      user: serializeRectoriaUser(result.user),
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ message: error.message });
  }
});

router.delete('/schools/:schoolId', async (req, res) => {
  try {
    const targetSchoolId = normalizeText(req.params.schoolId);
    const deletionResult = await deleteSchoolTenant(targetSchoolId);
    return res.status(200).json({
      message: 'Colegio eliminado permanentemente.',
      ...deletionResult,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ message: error.message });
  }
});

module.exports = router;