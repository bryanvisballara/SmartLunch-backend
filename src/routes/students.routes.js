const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const AcademicStructure = require('../models/academicStructure.model');
const Student = require('../models/student.model');
const Wallet = require('../models/wallet.model');
const ParentStudentLink = require('../models/parentStudentLink.model');

const router = express.Router();

router.use(authMiddleware);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeScopeMatch(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeGradeKey(value) {
  const normalized = normalizeText(value);
  const numericMatch = normalized.match(/(\d{1,2})/);
  return numericMatch ? numericMatch[1] : normalized;
}

async function resolveCoordinationGradeKeys(schoolId, coordinationScope = '') {
  const normalizedScope = normalizeScopeMatch(coordinationScope);
  if (!normalizedScope) {
    return new Set();
  }

  const academicStructure = await AcademicStructure.findOne({ schoolId }).select('levels grades').lean();
  const levels = Array.isArray(academicStructure?.levels) ? academicStructure.levels : [];
  const exactMatches = levels.filter((level) => {
    const levelKey = normalizeScopeMatch(level?.key);
    const levelLabel = normalizeScopeMatch(level?.label);
    return normalizedScope === levelKey || normalizedScope === levelLabel;
  });
  const matchedLevels = exactMatches.length > 0
    ? exactMatches
    : levels.filter((level) => {
      const levelKey = normalizeScopeMatch(level?.key);
      const levelLabel = normalizeScopeMatch(level?.label);
      return levelKey.includes(normalizedScope)
        || levelLabel.includes(normalizedScope)
        || normalizedScope.includes(levelKey)
        || normalizedScope.includes(levelLabel);
    });
  const levelKeys = new Set(matchedLevels.map((level) => normalizeText(level?.key)).filter(Boolean));

  if (levelKeys.size === 0) {
    return new Set();
  }

  return new Set((Array.isArray(academicStructure?.grades) ? academicStructure.grades : [])
    .filter((grade) => levelKeys.has(normalizeText(grade?.levelKey)))
    .map((grade) => normalizeGradeKey(grade?.key || grade?.label))
    .filter(Boolean));
}

router.get('/', async (req, res) => {
  try {
    const { role, schoolId, userId } = req.user;

    const attachWalletBalances = async (students) => {
      const normalizedStudents = Array.isArray(students) ? students : [];
      if (normalizedStudents.length === 0) {
        return [];
      }

      const studentIds = normalizedStudents.map((student) => student._id);
      const wallets = await Wallet.find({ schoolId, studentId: { $in: studentIds } })
        .select('studentId balance')
        .lean();

      const walletBalanceByStudentId = wallets.reduce((acc, wallet) => {
        acc[String(wallet.studentId)] = Number(wallet.balance || 0);
        return acc;
      }, {});

      return normalizedStudents.map((student) => {
        const rawStudent = typeof student.toObject === 'function' ? student.toObject() : student;
        return {
          ...rawStudent,
          walletBalance: Number(walletBalanceByStudentId[String(student._id)] || 0),
        };
      });
    };

    if (role === 'parent') {
      const links = await ParentStudentLink.find({ parentId: userId, schoolId, status: 'active' }).select('studentId');
      const studentIds = links.map((link) => link.studentId);
      const students = await Student.find({ _id: { $in: studentIds }, status: 'active', deletedAt: null }).sort({ name: 1 });
      const studentsWithBalance = await attachWalletBalances(students);
      return res.status(200).json(studentsWithBalance);
    }

    const filter = { schoolId, deletedAt: null };
    if (role === 'coordination') {
      const gradeKeys = await resolveCoordinationGradeKeys(schoolId, req.user.coordinationScope);
      filter.grade = { $in: Array.from(gradeKeys) };
    }

    const students = await Student.find(filter).sort({ createdAt: -1 });
    const studentsWithBalance = await attachWalletBalances(students);
    return res.status(200).json(studentsWithBalance);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { role, schoolId, userId } = req.user;
    const q = String(req.query.q || '').trim();

    if (!q) {
      return res.status(200).json([]);
    }

    const regex = new RegExp(q, 'i');
    const filter = {
      schoolId,
      status: 'active',
      deletedAt: null,
      $or: [{ name: regex }, { schoolCode: regex }],
    };

    if (role === 'parent') {
      const links = await ParentStudentLink.find({ parentId: userId, schoolId, status: 'active' }).select('studentId');
      filter._id = { $in: links.map((link) => link.studentId) };
    } else if (role === 'coordination') {
      const gradeKeys = await resolveCoordinationGradeKeys(schoolId, req.user.coordinationScope);
      filter.grade = { $in: Array.from(gradeKeys) };
    }

    const students = await Student.find(filter).select('name schoolCode grade dailyLimit status').sort({ name: 1 }).limit(10);
    return res.status(200).json(students);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { role, schoolId, userId } = req.user;
    const { id } = req.params;

    const student = await Student.findOne({ _id: id, schoolId, deletedAt: null })
      .populate('blockedProducts', 'name')
      .populate('blockedCategories', 'name');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (role === 'parent') {
      const link = await ParentStudentLink.findOne({ parentId: userId, studentId: id, schoolId, status: 'active' });
      if (!link) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    } else if (role === 'coordination') {
      const gradeKeys = await resolveCoordinationGradeKeys(schoolId, req.user.coordinationScope);
      if (!gradeKeys.has(normalizeGradeKey(student.grade))) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    return res.status(200).json(student);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const {
      name,
      schoolCode,
      grade,
      dailyLimit = 0,
      blockedProducts = [],
      blockedCategories = [],
      parentId,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }

    const student = await Student.create({
      schoolId,
      name,
      schoolCode,
      grade,
      dailyLimit,
      blockedProducts,
      blockedCategories,
    });

    await Wallet.create({
      schoolId,
      studentId: student._id,
      balance: 0,
    });

    if (parentId) {
      await ParentStudentLink.findOneAndUpdate(
        { schoolId, parentId, studentId: student._id },
        { schoolId, parentId, studentId: student._id, status: 'active' },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    return res.status(201).json(student);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.patch('/:id', roleMiddleware('admin'), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const allowed = [
      'name',
      'schoolCode',
      'grade',
      'dailyLimit',
      'blockedProducts',
      'blockedCategories',
      'status',
    ];

    const payload = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        payload[key] = req.body[key];
      }
    }

    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, schoolId, deletedAt: null },
      payload,
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.status(200).json(student);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
