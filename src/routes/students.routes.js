const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const Student = require('../models/student.model');
const Wallet = require('../models/wallet.model');
const ParentStudentLink = require('../models/parentStudentLink.model');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { role, schoolId, userId } = req.user;

    if (role === 'parent') {
      const links = await ParentStudentLink.find({ parentId: userId, schoolId, status: 'active' }).select('studentId');
      const studentIds = links.map((link) => link.studentId);
      const students = await Student.find({ _id: { $in: studentIds }, status: 'active', deletedAt: null }).sort({ name: 1 });
      return res.status(200).json(students);
    }

    const students = await Student.find({ schoolId, deletedAt: null }).sort({ createdAt: -1 });
    return res.status(200).json(students);
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

    const student = await Student.findOne({ _id: id, schoolId, deletedAt: null });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (role === 'parent') {
      const link = await ParentStudentLink.findOne({ parentId: userId, studentId: id, schoolId, status: 'active' });
      if (!link) {
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
