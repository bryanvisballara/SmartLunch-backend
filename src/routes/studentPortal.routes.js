const express = require('express');
const mongoose = require('mongoose');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const User = require('../models/user.model');
const Student = require('../models/student.model');
const AcademicStructure = require('../models/academicStructure.model');
const AcademicCalendarAssignment = require('../models/academicCalendarAssignment.model');
const CampusCourse = require('../models/campusCourse.model');
const CampusPost = require('../models/campusPost.model');
const CampusPostSubmission = require('../models/campusPostSubmission.model');
const CampusGradeEntry = require('../models/campusGradeEntry.model');
const CampusAttendanceSession = require('../models/campusAttendanceSession.model');
const CampusDisciplineObservation = require('../models/campusDisciplineObservation.model');
const {
  loadGlobalColibriLeaderboard,
  submitColibriGameScoreForUser,
} = require('../services/colibriGame.service');
const {
  buildStudentCommunityFeedQuery,
  ensureStudentCohortMembership,
} = require('../services/communityFeed.service');
const PsychologyCase = require('../models/psychologyCase.model');
const AcademicCommunication = require('../models/academicCommunication.model');
const Wallet = require('../models/wallet.model');
const { resolveStudentDisplayGrade } = require('../utils/studentDisplayGrade');
const { runWithSchoolContext } = require('../config/db');
const {
  MAX_CAMPUS_MATERIAL_FILES,
  uploadCampusMaterialsMiddleware,
  processStoredCampusMaterialFiles,
} = require('../utils/campusMaterialUpload');
const parentRoutes = require('./parent.routes');

const router = express.Router();
const H = parentRoutes.academicPortalHelpers || {};

const STUDENT_PORTAL_FEATURES = {
  home: true,
  finance: false,
  academic: true,
  cafeteria: true,
  nursing: true,
  wellbeing: true,
  coexistence: true,
  transport: true,
  games: true,
};

function serializeStudentFeedItem(item = {}, currentUserId = '') {
  const likes = Array.isArray(item.likes) ? item.likes : [];
  const comments = Array.isArray(item.comments) ? item.comments : [];

  return {
    _id: item._id,
    title: H.normalizeText(item.title),
    body: H.normalizeText(item.body),
    sentAt: item.sentAt || item.createdAt || null,
    authorName: H.normalizeText(item.authorName) || 'Comunicado institucional',
    authorPhotoUrl: item.authorPhotoUrl || '',
    media: Array.isArray(item.media) ? item.media : [],
    likesCount: likes.length,
    likedByMe: likes.some((like) => String(like.userId || '') === String(currentUserId || '')),
    commentsCount: comments.length,
    audienceType: item.audienceType || 'general',
    cohortKey: item.cohortKey || '',
    academicYear: item.academicYear || '',
    publisherRole: item.publisherRole || '',
    gradeTargets: Array.isArray(item.gradeTargets) ? item.gradeTargets : [],
    courseTargets: Array.isArray(item.courseTargets) ? item.courseTargets : [],
    recipientStudentIds: Array.isArray(item.recipientStudentIds) ? item.recipientStudentIds : [],
  };
}

function serializeStudentPsychologyCase(item = {}) {
  return {
    _id: item._id,
    studentId: item.studentId,
    caseType: item.caseType || '',
    status: item.status || '',
    priority: item.priority || '',
    summary: H.normalizeText(item.summary),
    updatedAt: item.updatedAt || null,
  };
}

function serializeStudentCoexistenceObservation(item = {}) {
  return {
    _id: item._id,
    studentId: item.studentId,
    category: H.normalizeText(item.category),
    status: item.status || '',
    summary: H.normalizeText(item.summary || item.description),
    submittedAt: item.submittedAt || item.createdAt || null,
  };
}

router.use(authMiddleware);
router.use(roleMiddleware('student', 'admin'));

async function resolveStudentForPortal(req) {
  const { schoolId, role, userId } = req.user;
  const requestedStudentId = role === 'admin' ? req.query?.studentId : '';

  if (requestedStudentId && mongoose.Types.ObjectId.isValid(String(requestedStudentId))) {
    return Student.findOne({
      _id: requestedStudentId,
      schoolId,
      deletedAt: null,
      status: 'active',
    }).lean();
  }

  const user = await User.findOne({
    _id: userId,
    schoolId,
    role: 'student',
    status: 'active',
    deletedAt: null,
  })
    .select('linkedStudentId')
    .lean();

  if (!user?.linkedStudentId) {
    return null;
  }

  return Student.findOne({
    _id: user.linkedStudentId,
    schoolId,
    deletedAt: null,
    status: 'active',
  });
}

async function resolveStudentDocumentForPortal(req) {
  const student = await resolveStudentForPortal(req);
  if (!student) {
    return null;
  }

  const studentDoc = student.save
    ? student
    : await Student.findOne({ _id: student._id, schoolId: req.user.schoolId, deletedAt: null, status: 'active' });

  if (!studentDoc) {
    return null;
  }

  await ensureStudentCohortMembership(studentDoc, req.user.schoolId);
  return studentDoc;
}

router.get('/portal/overview', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const student = await resolveStudentDocumentForPortal(req);

    if (!student) {
      return res.status(404).json({ message: 'No se encontró el perfil del alumno vinculado a esta cuenta.' });
    }

    const studentObjectId = H.toObjectId(student._id);
    const {
      gradeValues,
      courseValues,
      courseTitleValues,
    } = H.buildParentStudentAcademicMatchValues(student);

    const [academicGradeCourses, academicGradeEntryRefs, academicStructure, psychologyCases, coexistenceObservations, wallet] = await Promise.all([
      gradeValues.length
        ? CampusCourse.find({
          schoolId,
          status: 'active',
          studentGradeKey: { $in: gradeValues },
        })
          .select('title subject gradeLevel section studentGradeKey teacherUserId gradingComponents academicPeriods')
          .sort({ title: 1 })
          .lean()
        : Promise.resolve([]),
      CampusGradeEntry.find({ schoolId, studentId: studentObjectId })
        .select('courseId')
        .lean(),
      AcademicStructure.findOne({ schoolId }).lean(),
      PsychologyCase.find({
        schoolId,
        studentId: student._id,
        status: { $in: ['open', 'follow_up', 'escalated'] },
      })
        .sort({ updatedAt: -1 })
        .limit(50)
        .lean(),
      CampusDisciplineObservation.find({
        schoolId,
        studentId: student._id,
        status: { $in: ['submitted', 'reviewed'] },
      })
        .sort({ submittedAt: -1, createdAt: -1 })
        .limit(100)
        .lean(),
      Wallet.findOne({ schoolId, studentId: student._id }).lean(),
    ]);

    const academicGradeCourseIds = new Set((academicGradeCourses || []).map((course) => String(course._id)));
    const gradeEntryCourseIds = Array.from(new Set((academicGradeEntryRefs || [])
      .map((entry) => String(entry.courseId || ''))
      .filter((courseId) => courseId && !academicGradeCourseIds.has(courseId))));
    const academicGradeEntryCourses = gradeEntryCourseIds.length
      ? await CampusCourse.find({
        schoolId,
        status: { $in: ['active', 'archived'] },
        _id: { $in: gradeEntryCourseIds },
      })
        .select('title subject gradeLevel section studentGradeKey teacherUserId gradingComponents academicPeriods status')
        .sort({ title: 1 })
        .lean()
      : [];
    const gradeEntryCourseIdSet = new Set((academicGradeEntryRefs || [])
      .map((entry) => String(entry.courseId || ''))
      .filter(Boolean));
    const parentGradebookCourses = H.buildParentGradebookCoursesFromStructure({
      academicStructure,
      gradeValues,
      courseValues,
      courseTitleValues,
      courses: [...academicGradeCourses, ...academicGradeEntryCourses],
      gradeEntryCourseIds: gradeEntryCourseIdSet,
    });
    const schedule = await H.buildParentAcademicScheduleFromStructure({
      academicStructure,
      gradeValues,
      courseValues,
      courseTitleValues,
    });
    const gradingScale = H.resolveParentGradingScaleForGrade(academicStructure, gradeValues);
    const gradebook = await H.buildParentAcademicGradebook({
      schoolId,
      studentId: studentObjectId,
      courses: parentGradebookCourses,
      gradingScale,
    });
    const gradedSubjects = gradebook.filter((subject) => subject.finalAverage !== null && subject.finalAverage !== undefined);
    const overallAverage = gradedSubjects.length
      ? Math.round(gradedSubjects.reduce((sum, subject) => sum + Number(subject.finalAverage || 0), 0) / gradedSubjects.length)
      : null;
    const ranking = await H.buildParentAcademicRanking({
      schoolId,
      selectedStudentId: studentObjectId,
      selectedStudentGrade: student.grade || '',
      selectedStudentCourse: student.course || '',
      courses: parentGradebookCourses,
      currentAverage: overallAverage,
      gradingScale,
    });
    const upcomingAssignments = typeof H.buildParentUpcomingAssignments === 'function'
      ? await H.buildParentUpcomingAssignments({
        schoolId,
        courses: parentGradebookCourses,
        gradebook,
        gradeValues,
        courseValues,
        courseTitleValues,
      })
      : [];

    return res.status(200).json({
      student: {
        _id: student._id,
        name: student.name,
        grade: student.grade || '',
        course: student.course || '',
        displayGrade: resolveStudentDisplayGrade(student, academicStructure),
        schoolCode: student.schoolCode || '',
        cohortHistory: Array.isArray(student.cohortHistory) ? student.cohortHistory : [],
      },
      parentAppFeatures: STUDENT_PORTAL_FEATURES,
      psychologyCases: psychologyCases.map(serializeStudentPsychologyCase),
      coexistenceObservations: coexistenceObservations.map(serializeStudentCoexistenceObservation),
      walletBalance: Number(wallet?.balance || 0),
      academic: {
        gradebook,
        schedule,
        ranking,
        overallAverage,
        gradingScale,
        upcomingAssignments,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/academic-feed', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const student = await resolveStudentDocumentForPortal(req);

    if (!student) {
      return res.status(404).json({ message: 'No se encontró el perfil del alumno vinculado a esta cuenta.' });
    }

    const feedQuery = buildStudentCommunityFeedQuery({
      schoolId,
      userId,
      student,
    });
    const feed = await AcademicCommunication.find(feedQuery)
      .sort({ sentAt: -1, createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json(feed.map((item) => serializeStudentFeedItem(item, userId)));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/academic-calendar', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const student = await resolveStudentForPortal(req);

    if (!student) {
      return res.status(404).json({ message: 'No se encontró el perfil del alumno vinculado a esta cuenta.' });
    }

    const {
      gradeValues,
      courseValues,
      courseTitleValues,
    } = H.buildParentStudentAcademicMatchValues(student);
    const { monthStart, monthEnd, monthKey } = H.getMonthRange(req.query.month);
    const assignmentQuery = {
      schoolId,
      status: 'published',
      scheduledAt: { $gte: monthStart, $lt: monthEnd },
      $or: [
        { scope: 'all_school' },
        ...(gradeValues.length ? [{ scope: 'grades', targetGradeKeys: { $in: gradeValues } }] : []),
      ],
    };

    const [academicStructure, academicGradeCourses] = await Promise.all([
      AcademicStructure.findOne({ schoolId }).lean(),
      gradeValues.length
        ? CampusCourse.find({
          schoolId,
          status: 'active',
          studentGradeKey: { $in: gradeValues },
        })
          .select('title subject gradeLevel section studentGradeKey teacherUserId gradingComponents academicPeriods')
          .sort({ title: 1 })
          .lean()
        : Promise.resolve([]),
    ]);

    const parentGradebookCourses = H.buildParentGradebookCoursesFromStructure({
      academicStructure,
      gradeValues,
      courseValues,
      courseTitleValues,
      courses: academicGradeCourses,
      gradeEntryCourseIds: new Set(),
    });
    const courseIds = await H.resolveParentUpcomingAssignmentCourseIds({
      schoolId,
      courses: parentGradebookCourses,
      gradeValues,
      courseValues,
      courseTitleValues,
    });

    if (!courseIds.length) {
      const assignments = await AcademicCalendarAssignment.find(assignmentQuery)
        .sort({ scheduledAt: 1, createdAt: 1 })
        .lean();

      return res.status(200).json({
        student: { _id: student._id, name: student.name, grade: student.grade, course: student.course },
        month: monthKey,
        items: assignments.map(H.serializeParentAcademicCalendarAssignment).filter((item) => item.id && item.date),
      });
    }

    const [posts, assignments] = await Promise.all([
      CampusPost.find({
        schoolId,
        courseId: { $in: courseIds },
        status: 'published',
        $or: [
          { dueAt: { $gte: monthStart, $lt: monthEnd } },
          { scheduledClassDate: { $gte: monthStart, $lt: monthEnd } },
          { dueAt: null, scheduledClassDate: null, publishedAt: { $gte: monthStart, $lt: monthEnd } },
        ],
      })
        .populate('courseId', 'title subject section studentGradeKey')
        .sort({ dueAt: 1, scheduledClassDate: 1, publishedAt: 1, createdAt: 1 })
        .lean(),
      AcademicCalendarAssignment.find(assignmentQuery)
        .sort({ scheduledAt: 1, createdAt: 1 })
        .lean(),
    ]);

    return res.status(200).json({
      student: { _id: student._id, name: student.name, grade: student.grade, course: student.course },
      month: monthKey,
      items: [
        ...posts
          .filter((post) => H.isParentEvaluativePostType(post.type))
          .map(H.serializeParentAcademicCalendarPost),
        ...assignments.map(H.serializeParentAcademicCalendarAssignment),
      ].filter((item) => item.id && item.date).sort((left, right) => new Date(left.date) - new Date(right.date)),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/academic-attendance', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const student = await resolveStudentForPortal(req);

    if (!student) {
      return res.status(404).json({ message: 'No se encontró el perfil del alumno vinculado a esta cuenta.' });
    }

    const studentId = student._id;
    const statusLabels = {
      present: 'Presente',
      late: 'Llegada tarde',
      absent: 'Ausente',
      excused: 'Excusado',
    };
    const typeLabels = {
      guidance_routine: 'Llegada al colegio',
      subject_class: 'Asistencia a clase',
    };

    const serializeAttendanceRecord = (session) => {
      const record = (Array.isArray(session.records) ? session.records : [])
        .find((item) => String(item.studentId || '') === String(studentId));
      const status = ['present', 'late', 'absent', 'excused'].includes(String(record?.status || ''))
        ? String(record.status)
        : 'present';
      const date = H.normalizeText(session.date);

      return {
        id: String(session._id),
        date,
        dateLabel: date,
        attendanceType: H.normalizeText(session.attendanceType),
        attendanceTypeLabel: typeLabels[H.normalizeText(session.attendanceType)] || 'Asistencia',
        courseTitle: H.normalizeText(session.courseTitleSnapshot),
        subject: H.normalizeText(session.subjectSnapshot),
        status,
        statusLabel: statusLabels[status],
        note: H.normalizeText(record?.notes),
        classSessionKey: H.normalizeText(session.classSessionKey),
        recordedAt: record?.recordedAt || null,
        submittedAt: session.submittedAt || null,
      };
    };

    const requestedAttendanceType = H.normalizeText(req.query.attendanceType);
    if (requestedAttendanceType === 'guidance_routine') {
      const requestedPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(10, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
      const query = { schoolId, attendanceType: 'guidance_routine', 'records.studentId': studentId };
      const totalRecords = await CampusAttendanceSession.countDocuments(query);
      const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const sessions = await CampusAttendanceSession.find(query)
        .sort({ date: -1, updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean();

      return res.status(200).json({
        student: { _id: student._id, name: student.name, grade: student.grade, course: student.course },
        attendanceType: 'guidance_routine',
        page,
        totalPages,
        totalRecords,
        records: sessions.map(serializeAttendanceRecord),
      });
    }

    const requestedPage = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(10, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const query = { schoolId, attendanceType: 'subject_class', 'records.studentId': studentId };
    const totalRecords = await CampusAttendanceSession.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const sessions = await CampusAttendanceSession.find(query)
      .sort({ date: -1, updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();

    return res.status(200).json({
      student: { _id: student._id, name: student.name, grade: student.grade, course: student.course },
      attendanceType: 'subject_class',
      page,
      totalPages,
      totalRecords,
      records: sessions.map(serializeAttendanceRecord),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/colibri-game/leaderboard', async (_req, res) => {
  try {
    const entries = await loadGlobalColibriLeaderboard(50);

    return res.status(200).json({ entries });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo cargar el ranking' });
  }
});

router.post('/portal/colibri-game/scores', async (req, res) => {
  try {
    const { schoolId, userId, name: userName } = req.user;
    const result = await submitColibriGameScoreForUser({
      schoolId,
      userId,
      userName,
      score: req.body?.score,
    });

    return res.status(result.statusCode).json({
      message: 'Score saved',
      entry: result.entry,
    });
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500;
    return res.status(statusCode).json({ message: error.message || 'No se pudo guardar el puntaje' });
  }
});

function normalizeStudentPortalText(value) {
  return String(value || '').trim();
}

function parseStudentSubmissionLinks(rawLinks) {
  let input = rawLinks;
  if (typeof rawLinks === 'string') {
    try {
      input = JSON.parse(rawLinks);
    } catch (_error) {
      input = [];
    }
  }

  const links = Array.isArray(input) ? input : [];
  const normalized = [];

  for (const link of links) {
    const url = normalizeStudentPortalText(link?.url);
    const title = normalizeStudentPortalText(link?.title) || url;
    if (!url) continue;
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, message: 'Cada enlace debe empezar por http:// o https://.' };
    }
    normalized.push({
      sourceType: 'link',
      kind: 'link',
      title: title.slice(0, 120),
      url,
      fileName: '',
      mimeType: 'text/uri-list',
      sizeBytes: 0,
      extension: '',
      storage: 'external',
    });
  }

  return { ok: true, links: normalized.slice(0, 12) };
}

function serializeStudentSubmission(submission = null) {
  if (!submission) {
    return null;
  }

  return {
    id: String(submission._id || submission.id || ''),
    note: normalizeStudentPortalText(submission.note),
    status: normalizeStudentPortalText(submission.status) || 'submitted',
    submittedAt: submission.submittedAt || submission.createdAt || null,
    attachments: Array.isArray(submission.attachments)
      ? submission.attachments.map((attachment) => ({
        sourceType: normalizeStudentPortalText(attachment.sourceType) || 'file',
        kind: normalizeStudentPortalText(attachment.kind) || 'file',
        title: normalizeStudentPortalText(attachment.title),
        url: normalizeStudentPortalText(attachment.url),
        fileName: normalizeStudentPortalText(attachment.fileName),
        mimeType: normalizeStudentPortalText(attachment.mimeType),
        sizeBytes: Number(attachment.sizeBytes || 0),
        extension: normalizeStudentPortalText(attachment.extension),
        storage: normalizeStudentPortalText(attachment.storage),
      }))
      : [],
  };
}

async function resolveStudentAssignmentCourseIds(schoolId, student) {
  const {
    gradeValues,
    courseValues,
    courseTitleValues,
  } = H.buildParentStudentAcademicMatchValues(student);

  const academicGradeCourses = gradeValues.length
    ? await CampusCourse.find({
      schoolId,
      status: 'active',
      studentGradeKey: { $in: gradeValues },
    })
      .select('title subject gradeLevel section studentGradeKey teacherUserId gradingComponents academicPeriods')
      .sort({ title: 1 })
      .lean()
    : [];

  const academicStructure = await AcademicStructure.findOne({ schoolId }).lean();
  const parentGradebookCourses = H.buildParentGradebookCoursesFromStructure({
    academicStructure,
    gradeValues,
    courseValues,
    courseTitleValues,
    courses: academicGradeCourses,
    gradeEntryCourseIds: new Set(),
  });

  return H.resolveParentUpcomingAssignmentCourseIds({
    schoolId,
    courses: parentGradebookCourses,
    gradeValues,
    courseValues,
    courseTitleValues,
  });
}

router.get('/portal/assignments', async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const student = await resolveStudentForPortal(req);

    if (!student) {
      return res.status(404).json({ message: 'No se encontró el perfil del alumno vinculado a esta cuenta.' });
    }

    const courseIds = await resolveStudentAssignmentCourseIds(schoolId, student);
    if (!courseIds.length) {
      return res.status(200).json({ assignments: [] });
    }

    const posts = await CampusPost.find({
      schoolId,
      courseId: { $in: courseIds },
      status: 'published',
    })
      .populate('courseId', 'title subject section studentGradeKey')
      .sort({ scheduledClassDate: 1, dueAt: 1, publishedAt: -1, createdAt: -1 })
      .lean();

    const evaluativePosts = posts.filter((post) => H.isParentEvaluativePostType(post.type));
    const postIds = evaluativePosts.map((post) => post._id);
    const submissions = postIds.length
      ? await CampusPostSubmission.find({
        schoolId,
        studentId: student._id,
        postId: { $in: postIds },
      }).lean()
      : [];
    const submissionByPostId = new Map(
      submissions.map((submission) => [String(submission.postId), submission])
    );

    return res.status(200).json({
      assignments: evaluativePosts.map((post) => {
        const serialized = H.serializeParentAcademicCalendarPost(post);
        const submission = submissionByPostId.get(String(post._id));
        return {
          ...serialized,
          body: normalizeStudentPortalText(post.body),
          allowStudentSubmission: Boolean(post.allowStudentSubmission),
          submission: serializeStudentSubmission(submission),
          hasSubmission: Boolean(submission),
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.get('/portal/assignments/:id', async (req, res) => {
  try {
    const { schoolId } = req.user;
    const { id } = req.params;
    const student = await resolveStudentForPortal(req);

    if (!student) {
      return res.status(404).json({ message: 'No se encontró el perfil del alumno vinculado a esta cuenta.' });
    }

    if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
      return res.status(400).json({ message: 'Invalid assignment id' });
    }

    const courseIds = await resolveStudentAssignmentCourseIds(schoolId, student);
    const post = await CampusPost.findOne({
      _id: id,
      schoolId,
      status: 'published',
      courseId: { $in: courseIds },
    })
      .populate('courseId', 'title subject section studentGradeKey')
      .lean();

    if (!post || !H.isParentEvaluativePostType(post.type)) {
      return res.status(404).json({ message: 'Asignación no encontrada.' });
    }

    const submission = await CampusPostSubmission.findOne({
      schoolId,
      postId: post._id,
      studentId: student._id,
    }).lean();

    const serialized = H.serializeParentAcademicCalendarPost(post);

    return res.status(200).json({
      assignment: {
        ...serialized,
        body: normalizeStudentPortalText(post.body),
        allowStudentSubmission: Boolean(post.allowStudentSubmission),
        submission: serializeStudentSubmission(submission),
        hasSubmission: Boolean(submission),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post('/portal/assignments/:id/submissions', uploadCampusMaterialsMiddleware.array('files', MAX_CAMPUS_MATERIAL_FILES), async (req, res) => {
  try {
    const { schoolId, userId } = req.user;
    const { id } = req.params;
    const student = await resolveStudentForPortal(req);

    if (!student) {
      return res.status(404).json({ message: 'No se encontró el perfil del alumno vinculado a esta cuenta.' });
    }

    if (!mongoose.Types.ObjectId.isValid(String(id || ''))) {
      return res.status(400).json({ message: 'Invalid assignment id' });
    }

    return await runWithSchoolContext(schoolId, async () => {
      const courseIds = await resolveStudentAssignmentCourseIds(schoolId, student);
      const post = await CampusPost.findOne({
        _id: id,
        schoolId,
        status: 'published',
        courseId: { $in: courseIds },
      });

      if (!post || !H.isParentEvaluativePostType(post.type)) {
        return res.status(404).json({ message: 'Asignación no encontrada.' });
      }

      if (!post.allowStudentSubmission) {
        return res.status(403).json({ message: 'El docente no habilitó entregas para esta asignación.' });
      }

      const linksResult = parseStudentSubmissionLinks(req.body.materialLinks);
      if (!linksResult.ok) {
        return res.status(400).json({ message: linksResult.message });
      }

      const uploadedAttachments = await processStoredCampusMaterialFiles(req.files, {
        folder: 'campus-student-submissions',
      });
      const attachments = [...linksResult.links, ...uploadedAttachments];
      const note = normalizeStudentPortalText(req.body.note);

      if (!attachments.length && !note) {
        return res.status(400).json({ message: 'Agrega un archivo, un enlace o una nota para entregar.' });
      }

      const submission = await CampusPostSubmission.findOneAndUpdate(
        {
          schoolId,
          postId: post._id,
          studentId: student._id,
        },
        {
          $set: {
            schoolId,
            postId: post._id,
            courseId: post.courseId,
            studentId: student._id,
            studentUserId: String(userId || ''),
            note,
            attachments,
            status: 'submitted',
            submittedAt: new Date(),
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      return res.status(200).json({
        message: 'Entrega guardada.',
        submission: serializeStudentSubmission(submission),
      });
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
