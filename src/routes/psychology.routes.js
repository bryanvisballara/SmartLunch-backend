const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const ParentStudentLink = require('../models/parentStudentLink.model');
const PsychologyCase = require('../models/psychologyCase.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const { queueNotificationsForParents } = require('../services/notification.service');

const router = express.Router();

router.use(authMiddleware);

const psychologyStaffRoles = ['psychology', 'admin', 'rectoria', 'direccion'];
const institutionalViewerRoles = ['teacher', 'coordination', 'admin', 'rectoria', 'direccion', 'psychology'];
const caseTypes = ['bullying', 'anxiety', 'grief', 'low_performance', 'aggression', 'coexistence', 'abuse_concern', 'family', 'substance_use', 'vocational', 'other'];
const priorities = ['low', 'medium', 'high', 'urgent'];
const statuses = ['open', 'follow_up', 'escalated', 'closed'];
const visibilities = ['private', 'institutional', 'family', 'shared_all'];
const audienceValues = ['teachers', 'coordination', 'leadership', 'parents'];

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function normalizeText(value) {
  return String(value || '').trim();
}

function escapeRegex(value) {
  return normalizeText(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstName(name) {
  return normalizeText(name).split(/\s+/)[0] || 'El estudiante';
}

function safeEnum(value, allowedValues, fallback) {
  const normalized = normalizeText(value);
  return allowedValues.includes(normalized) ? normalized : fallback;
}

function buildSectionLabelFromCourseToken(grade, courseToken) {
  const normalizedGrade = String(grade || '').replace(/\s+/g, '');
  const normalizedToken = String(courseToken || '').replace(/\s+/g, '');

  if (!normalizedGrade || !normalizedToken) {
    return '';
  }

  if (/^\d+$/.test(normalizedToken)) {
    const index = Number(normalizedToken);
    if (index >= 1 && index <= 26) {
      return `${normalizedGrade}${String.fromCharCode(64 + index)}`;
    }
  }

  if (/^[a-z]$/i.test(normalizedToken)) {
    return `${normalizedGrade}${normalizedToken.toUpperCase()}`;
  }

  if (/^\d+[a-z]$/i.test(normalizedToken)) {
    return normalizedToken.toUpperCase();
  }

  return normalizedToken;
}

function buildStudentDisplayGrade(student = {}) {
  const grade = normalizeText(student.grade);
  const course = normalizeText(student.course);
  const fallback = grade || course || '';

  if (!course) {
    return fallback;
  }

  const courseParts = course.split(':').map((part) => part.trim()).filter(Boolean);
  const gradeFromCourse = courseParts.length >= 2 ? courseParts[1] : '';
  const courseToken = courseParts.length >= 3 ? courseParts.slice(2).join(':') : course;
  const sectionLabel = buildSectionLabelFromCourseToken(grade || gradeFromCourse, courseToken);

  if (sectionLabel) {
    return sectionLabel;
  }

  return course.includes(':') ? fallback : course;
}

function normalizeAudienceList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map(normalizeText).filter((item) => audienceValues.includes(item)))];
}

function defaultAudiencesForVisibility(visibility) {
  if (visibility === 'family') {
    return ['parents'];
  }
  if (visibility === 'institutional') {
    return ['teachers', 'coordination', 'leadership'];
  }
  if (visibility === 'shared_all') {
    return ['teachers', 'coordination', 'leadership', 'parents'];
  }
  return [];
}

function serializeStudent(student) {
  if (!student) {
    return null;
  }

  return {
    id: String(student._id),
    name: normalizeText(student.name),
    schoolCode: normalizeText(student.schoolCode),
    grade: normalizeText(student.grade),
    course: normalizeText(student.course),
    displayGrade: buildStudentDisplayGrade(student),
    documentNumber: normalizeText(student.documentNumber),
    birthDate: student.birthDate || null,
    bloodType: normalizeText(student.bloodType),
    imageUrl: normalizeText(student.imageUrl),
    thumbUrl: normalizeText(student.thumbUrl),
  };
}

function serializeUser(user) {
  if (!user?._id) {
    return null;
  }

  return {
    id: String(user._id),
    name: normalizeText(user.name),
    username: normalizeText(user.username),
    role: normalizeText(user.role),
  };
}

function serializeNote(note) {
  if (!note) {
    return null;
  }

  const rawNote = typeof note.toObject === 'function' ? note.toObject() : note;
  return {
    id: String(rawNote._id),
    visibility: normalizeText(rawNote.visibility) || 'private',
    content: normalizeText(rawNote.content),
    recommendations: normalizeText(rawNote.recommendations),
    notifyAudiences: Array.isArray(rawNote.notifyAudiences) ? rawNote.notifyAudiences.filter(Boolean) : [],
    createdBy: rawNote.createdByUserId?._id ? serializeUser(rawNote.createdByUserId) : null,
    createdAt: rawNote.createdAt,
  };
}

function serializeCase(item, { publicView = false } = {}) {
  const rawCase = typeof item?.toObject === 'function' ? item.toObject() : item;
  if (!rawCase) {
    return null;
  }

  const notes = Array.isArray(rawCase.notes)
    ? rawCase.notes
        .filter((note) => !publicView || ['institutional', 'family', 'shared_all'].includes(normalizeText(note.visibility)))
        .map(serializeNote)
        .filter(Boolean)
    : [];

  return {
    id: String(rawCase._id),
    studentId: String(rawCase.studentId?._id || rawCase.studentId || ''),
    student: rawCase.studentId?._id ? serializeStudent(rawCase.studentId) : null,
    openedBy: rawCase.openedByUserId?._id ? serializeUser(rawCase.openedByUserId) : null,
    assignedTo: rawCase.assignedToUserId?._id ? serializeUser(rawCase.assignedToUserId) : null,
    title: normalizeText(rawCase.title),
    caseType: normalizeText(rawCase.caseType) || 'other',
    priority: normalizeText(rawCase.priority) || 'medium',
    status: normalizeText(rawCase.status) || 'open',
    summary: publicView ? '' : normalizeText(rawCase.summary),
    nextAction: publicView ? '' : normalizeText(rawCase.nextAction),
    nextActionAt: rawCase.nextActionAt || null,
    closedAt: rawCase.closedAt || null,
    notes,
    createdAt: rawCase.createdAt,
    updatedAt: rawCase.updatedAt,
  };
}

async function findParentIds({ schoolId, studentId }) {
  const links = await ParentStudentLink.find({ schoolId, studentId, status: 'active' }).select('parentId').lean();
  return links.map((link) => link.parentId).filter(Boolean);
}

async function findInstitutionalUserIds({ schoolId, audiences }) {
  const roles = new Set();
  if (audiences.includes('teachers')) {
    roles.add('teacher');
  }
  if (audiences.includes('coordination')) {
    roles.add('coordination');
  }
  if (audiences.includes('leadership')) {
    roles.add('rectoria');
    roles.add('direccion');
    roles.add('admin');
  }

  if (roles.size === 0) {
    return [];
  }

  const users = await User.find({ schoolId, role: { $in: [...roles] }, status: 'active', deletedAt: null }).select('_id').lean();
  return users.map((user) => user._id).filter(Boolean);
}

async function notifyCaseAudiences({ schoolId, student, psychologyCase, note, audiences }) {
  const notificationJobs = [];
  const childName = firstName(student?.name);
  const title = `Seguimiento psicologico: ${childName}`;
  const body = note.recommendations
    ? `${note.content}. Recomendacion: ${note.recommendations}`
    : note.content;
  const payload = {
    type: 'psychology.case_note',
    psychologyCaseId: String(psychologyCase._id),
    studentId: String(student._id),
    visibility: note.visibility,
    url: audiences.includes('parents') ? '/parent' : '/psicologia',
  };

  if (audiences.includes('parents')) {
    const parentIds = await findParentIds({ schoolId, studentId: student._id });
    if (parentIds.length) {
      notificationJobs.push(queueNotificationsForParents({ schoolId, parentIds, studentId: student._id, title, body, payload }));
    }
  }

  const staffUserIds = await findInstitutionalUserIds({ schoolId, audiences });
  if (staffUserIds.length) {
    notificationJobs.push(queueNotificationsForParents({
      schoolId,
      parentIds: staffUserIds,
      studentId: student._id,
      title,
      body,
      payload: { ...payload, audience: 'institutional' },
    }));
  }

  const results = await Promise.allSettled(notificationJobs);
  return results.reduce((acc, result) => {
    if (result.status === 'fulfilled') {
      acc.notificationsCreated += Number(result.value?.notificationsCreated || 0);
      acc.tokensFound += Number(result.value?.tokensFound || 0);
      acc.directDelivered += Number(result.value?.directDelivered || 0);
      acc.directFailed += Number(result.value?.directFailed || 0);
    } else {
      acc.errors.push(result.reason?.message || 'Notification failed');
    }
    return acc;
  }, { notificationsCreated: 0, tokensFound: 0, directDelivered: 0, directFailed: 0, errors: [] });
}

router.get('/students', roleMiddleware(psychologyStaffRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const q = normalizeText(req.query.q);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter = { schoolId, status: 'active', deletedAt: null };

    if (q) {
      const regex = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: regex }, { schoolCode: regex }, { documentNumber: regex }, { grade: regex }, { course: regex }];
    }

    const students = await Student.find(filter)
      .select('name schoolCode grade course documentNumber birthDate bloodType imageUrl thumbUrl')
      .sort(q ? { name: 1 } : { updatedAt: -1, name: 1 })
      .limit(limit)
      .lean();

    return res.status(200).json({ students: students.map(serializeStudent) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/dashboard', roleMiddleware(psychologyStaffRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const openStatuses = ['open', 'follow_up', 'escalated'];
    const now = new Date();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));

    const [urgentCount, activeCount, newThisWeekCount, followUpDueCount, recentCases, typeStats, priorityStats] = await Promise.all([
      PsychologyCase.countDocuments({ schoolId, status: { $in: openStatuses }, priority: 'urgent' }),
      PsychologyCase.countDocuments({ schoolId, status: { $in: openStatuses } }),
      PsychologyCase.countDocuments({ schoolId, createdAt: { $gte: startOfWeek } }),
      PsychologyCase.countDocuments({ schoolId, status: { $in: openStatuses }, nextActionAt: { $lte: now } }),
      PsychologyCase.find({ schoolId })
        .populate('studentId', 'name schoolCode grade course imageUrl thumbUrl')
        .populate('openedByUserId', 'name username role')
        .sort({ updatedAt: -1 })
        .limit(8)
        .lean(),
      PsychologyCase.aggregate([
        { $match: { schoolId } },
        { $group: { _id: '$caseType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      PsychologyCase.aggregate([
        { $match: { schoolId, status: { $in: openStatuses } } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
    ]);

    return res.status(200).json({
      summary: { urgentCount, activeCount, newThisWeekCount, followUpDueCount },
      recentCases: recentCases.map((item) => serializeCase(item)),
      typeStats,
      priorityStats,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/students/:studentId/profile', roleMiddleware(psychologyStaffRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { studentId } = req.params;

    if (!isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'Invalid student id' });
    }

    const [student, cases, parentLinks] = await Promise.all([
      Student.findOne({ _id: studentId, schoolId, deletedAt: null }).select('name schoolCode grade course documentNumber birthDate bloodType imageUrl thumbUrl').lean(),
      PsychologyCase.find({ schoolId, studentId })
        .populate('studentId', 'name schoolCode grade course imageUrl thumbUrl')
        .populate('openedByUserId', 'name username role')
        .populate('assignedToUserId', 'name username role')
        .populate('notes.createdByUserId', 'name username role')
        .sort({ updatedAt: -1 })
        .limit(30)
        .lean(),
      ParentStudentLink.find({ schoolId, studentId, status: 'active' }).populate('parentId', 'name username phone email').lean(),
    ]);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    return res.status(200).json({
      student: serializeStudent(student),
      guardians: parentLinks.map((link) => ({
        id: String(link.parentId?._id || ''),
        name: normalizeText(link.parentId?.name),
        username: normalizeText(link.parentId?.username),
        relationship: normalizeText(link.relationship) || 'Acudiente',
        isPrimaryContact: Boolean(link.isPrimaryContact),
      })),
      cases: cases.map((item) => serializeCase(item)),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/cases', roleMiddleware(psychologyStaffRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const studentId = normalizeText(req.body.studentId);
    const title = normalizeText(req.body.title);
    const summary = normalizeText(req.body.summary);
    const initialNote = normalizeText(req.body.initialNote || summary);
    const visibility = safeEnum(req.body.visibility, visibilities, 'family');
    const notifyAudiences = normalizeAudienceList(req.body.notifyAudiences).length
      ? normalizeAudienceList(req.body.notifyAudiences)
      : defaultAudiencesForVisibility(visibility);

    if (!isValidObjectId(studentId)) {
      return res.status(400).json({ message: 'studentId is invalid' });
    }
    if (!title || !summary) {
      return res.status(400).json({ message: 'title and summary are required' });
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null }).select('name schoolCode grade course').lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const psychologyCase = await PsychologyCase.create({
      schoolId,
      studentId,
      openedByUserId: userId,
      assignedToUserId: userId,
      title,
      summary,
      caseType: safeEnum(req.body.caseType, caseTypes, 'other'),
      priority: safeEnum(req.body.priority, priorities, 'medium'),
      status: safeEnum(req.body.status, statuses, 'open'),
      nextAction: normalizeText(req.body.nextAction),
      nextActionAt: req.body.nextActionAt ? new Date(req.body.nextActionAt) : null,
      notes: initialNote
        ? [{ visibility, content: initialNote, recommendations: normalizeText(req.body.recommendations), notifyAudiences, createdByUserId: userId }]
        : [],
    });

    let notificationResult = null;
    if (initialNote && notifyAudiences.length) {
      notificationResult = await notifyCaseAudiences({
        schoolId,
        student,
        psychologyCase,
        note: psychologyCase.notes[0],
        audiences: notifyAudiences,
      });
    }

    await psychologyCase.populate('studentId', 'name schoolCode grade course imageUrl thumbUrl');
    await psychologyCase.populate('openedByUserId', 'name username role');
    await psychologyCase.populate('assignedToUserId', 'name username role');
    await psychologyCase.populate('notes.createdByUserId', 'name username role');

    return res.status(201).json({ case: serializeCase(psychologyCase), notificationResult });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/cases/:caseId/notes', roleMiddleware(psychologyStaffRoles), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { caseId } = req.params;
    const content = normalizeText(req.body.content);
    const visibility = safeEnum(req.body.visibility, visibilities, 'private');
    const notifyAudiences = normalizeAudienceList(req.body.notifyAudiences).length
      ? normalizeAudienceList(req.body.notifyAudiences)
      : defaultAudiencesForVisibility(visibility);

    if (!isValidObjectId(caseId)) {
      return res.status(400).json({ message: 'Invalid case id' });
    }
    if (!content) {
      return res.status(400).json({ message: 'content is required' });
    }

    const psychologyCase = await PsychologyCase.findOne({ _id: caseId, schoolId });
    if (!psychologyCase) {
      return res.status(404).json({ message: 'Case not found' });
    }

    psychologyCase.notes.push({
      visibility,
      content,
      recommendations: normalizeText(req.body.recommendations),
      notifyAudiences,
      createdByUserId: userId,
    });

    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      psychologyCase.status = safeEnum(req.body.status, statuses, psychologyCase.status);
      psychologyCase.closedAt = psychologyCase.status === 'closed' ? new Date() : null;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'priority')) {
      psychologyCase.priority = safeEnum(req.body.priority, priorities, psychologyCase.priority);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'nextAction')) {
      psychologyCase.nextAction = normalizeText(req.body.nextAction);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'nextActionAt')) {
      psychologyCase.nextActionAt = req.body.nextActionAt ? new Date(req.body.nextActionAt) : null;
    }

    await psychologyCase.save();
    const note = psychologyCase.notes[psychologyCase.notes.length - 1];
    const student = await Student.findOne({ _id: psychologyCase.studentId, schoolId, deletedAt: null }).select('name schoolCode grade course').lean();
    const notificationResult = student && notifyAudiences.length
      ? await notifyCaseAudiences({ schoolId, student, psychologyCase, note, audiences: notifyAudiences })
      : null;

    await psychologyCase.populate('studentId', 'name schoolCode grade course imageUrl thumbUrl');
    await psychologyCase.populate('openedByUserId', 'name username role');
    await psychologyCase.populate('assignedToUserId', 'name username role');
    await psychologyCase.populate('notes.createdByUserId', 'name username role');

    return res.status(200).json({ case: serializeCase(psychologyCase), note: serializeNote(note), notificationResult });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/institutional/feed', roleMiddleware(institutionalViewerRoles), async (req, res) => {
  try {
    const { schoolId } = req.user;
    const cases = await PsychologyCase.find({ schoolId, 'notes.visibility': { $in: ['institutional', 'shared_all'] } })
      .populate('studentId', 'name schoolCode grade course')
      .populate('openedByUserId', 'name username role')
      .populate('notes.createdByUserId', 'name username role')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({ cases: cases.map((item) => serializeCase(item, { publicView: true })) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/parent/records', roleMiddleware('parent', 'admin'), async (req, res) => {
  try {
    const { schoolId, role, userId } = req.user;
    const parentId = role === 'admin' && req.query.parentId ? req.query.parentId : userId;
    const links = await ParentStudentLink.find({ schoolId, parentId, status: 'active' }).select('studentId').lean();
    const studentIds = links.map((link) => String(link.studentId));

    if (!studentIds.length) {
      return res.status(200).json({ cases: [] });
    }

    const cases = await PsychologyCase.find({
      schoolId,
      studentId: { $in: studentIds },
      status: { $in: ['open', 'follow_up', 'escalated'] },
    })
      .populate('openedByUserId', 'name username role')
      .populate('notes.createdByUserId', 'name username role')
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    const parentCases = cases.map((item) => {
      const serialized = serializeCase(item, { publicView: true });
      return {
        ...serialized,
        notes: serialized.notes.filter((note) => ['family', 'shared_all'].includes(note.visibility)),
      };
    });

    return res.status(200).json({ cases: parentCases });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
