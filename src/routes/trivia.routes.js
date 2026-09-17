const express = require('express');

const authMiddleware = require('../middleware/authMiddleware');
const CampusCourse = require('../models/campusCourse.model');
const triviaService = require('../services/trivia.service');

const router = express.Router();

router.use(authMiddleware);

function sendError(res, error) {
  const status = Number(error?.status || 500);
  return res.status(status >= 400 && status < 600 ? status : 500).json({
    message: error?.message || 'No se pudo completar la acción en Trivia.',
  });
}

async function requireTeacher(req, res, next) {
  try {
    const role = String(req.user?.role || '').trim();
    if (role === 'teacher') {
      return next();
    }
    const assigned = await CampusCourse.exists({
      schoolId: req.user?.schoolId,
      teacherUserId: req.user?.userId,
      courseType: 'subject',
      status: 'active',
    });
    if (!assigned) {
      return res.status(403).json({ message: 'Trivia Docente no está habilitado para este usuario.' });
    }
    return next();
  } catch (error) {
    return sendError(res, error);
  }
}

function requireStudent(req, res, next) {
  if (!['student', 'admin'].includes(String(req.user?.role || ''))) {
    return res.status(403).json({ message: 'Solo los alumnos pueden jugar Comergio Trivia.' });
  }
  return next();
}

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  return next();
}

function teacherContext(req) {
  return {
    schoolId: req.user.schoolId,
    teacherUserId: req.user.userId,
  };
}

function studentContext(req) {
  return {
    schoolId: req.user.schoolId,
    userId: req.user.userId,
    linkedStudentId: req.user.linkedStudentId,
    requestedStudentId: req.user.role === 'admin'
      ? (req.body?.studentId || req.query?.studentId || '')
      : '',
  };
}

router.get('/teacher/questions', requireTeacher, async (req, res) => {
  try {
    const questions = await triviaService.listTeacherQuestions({
      ...teacherContext(req),
      courseId: req.query.courseId,
      subjectKey: req.query.subjectKey,
      gradeKey: req.query.gradeKey,
      status: req.query.status,
    });
    return res.json({ questions });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/teacher/options', requireTeacher, async (req, res) => {
  try {
    const options = await triviaService.listTeacherOptions(teacherContext(req));
    return res.json({ options, assignments: options });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/teacher/questions', requireTeacher, async (req, res) => {
  try {
    const question = await triviaService.createTeacherQuestion({
      ...teacherContext(req),
      body: req.body || {},
    });
    return res.status(201).json({ question });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put('/teacher/questions/:questionId', requireTeacher, async (req, res) => {
  try {
    const question = await triviaService.updateTeacherQuestion({
      ...teacherContext(req),
      questionId: req.params.questionId,
      body: req.body || {},
    });
    return res.json({ question });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete('/teacher/questions/:questionId', requireTeacher, async (req, res) => {
  try {
    return res.json(await triviaService.deleteTeacherQuestion({
      ...teacherContext(req),
      questionId: req.params.questionId,
    }));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/student/profile', requireStudent, async (req, res) => {
  try {
    const profile = await triviaService.getProfile({
      ...studentContext(req),
      scope: req.query.scope,
    });
    return res.json({ profile });
  } catch (error) {
    return sendError(res, error);
  }
});

router.patch('/student/profile', requireStudent, async (req, res) => {
  try {
    const profile = await triviaService.updateProfile({
      ...studentContext(req),
      scope: req.body?.scope,
      displayName: req.body?.displayName,
      avatarUrl: req.body?.avatarUrl,
      ageBand: req.body?.ageBand,
      ageBand: req.body?.ageBand,
    });
    return res.json({ profile });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/student/candidates', requireStudent, async (req, res) => {
  try {
    const result = await triviaService.joinCandidateQueue({
      ...studentContext(req),
      scope: req.body?.scope,
      mode: req.body?.mode,
      subjectKey: req.body?.subjectKey,
      gradeKey: req.body?.gradeKey,
    });
    return res.status(201).json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/student/candidates', requireStudent, async (req, res) => {
  try {
    return res.json(await triviaService.getCandidateStatus({
      ...studentContext(req),
      scope: req.query?.scope,
    }));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/student/subjects', requireStudent, async (req, res) => {
  try {
    return res.json(await triviaService.listStudentRouletteOptions({
      ...studentContext(req),
      scope: req.query?.scope,
    }));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/student/eligible', requireStudent, async (req, res) => {
  try {
    const candidates = await triviaService.listEligibleCandidates({
      ...studentContext(req),
      scope: req.query?.scope,
      limit: req.query?.limit,
    });
    return res.json({ candidates });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete('/student/candidates', requireStudent, async (req, res) => {
  try {
    return res.json(await triviaService.cancelCandidate({
      ...studentContext(req),
      scope: req.body?.scope || req.query?.scope,
    }));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/student/invitations', requireStudent, async (req, res) => {
  try {
    const invitations = await triviaService.listInvitations({
      ...studentContext(req),
      scope: req.query.scope,
    });
    return res.json({ invitations });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/student/invitations', requireStudent, async (req, res) => {
  try {
    const invitation = await triviaService.createInvitation({
      ...studentContext(req),
      scope: req.body?.scope,
      mode: req.body?.mode,
      invitees: req.body?.invitees,
      subjectKey: req.body?.subjectKey,
      gradeKey: req.body?.gradeKey,
      rouletteCategories: req.body?.rouletteCategories,
    });
    return res.status(201).json({ invitation });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/student/invitations/:invitationId/respond', requireStudent, async (req, res) => {
  try {
    const result = await triviaService.respondInvitation({
      ...studentContext(req),
      scope: req.body?.scope,
      invitationId: req.params.invitationId,
      accept: req.body?.accept === true,
    });
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/student/matches', requireStudent, async (req, res) => {
  try {
    const matches = await triviaService.listMatches({
      ...studentContext(req),
      scope: req.query.scope,
    });
    return res.json({ matches });
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/student/matches/:matchId', requireStudent, async (req, res) => {
  try {
    const match = await triviaService.getMatch({
      ...studentContext(req),
      scope: req.query.scope,
      matchId: req.params.matchId,
    });
    return res.json({ match });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/student/matches/:matchId/spin', requireStudent, async (req, res) => {
  try {
    const match = await triviaService.spin({
      ...studentContext(req),
      scope: req.body?.scope,
      matchId: req.params.matchId,
      turnToken: req.body?.turnToken,
      version: req.body?.version,
    });
    return res.json({ match });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/student/matches/:matchId/answer', requireStudent, async (req, res) => {
  try {
    const result = await triviaService.answer({
      ...studentContext(req),
      scope: req.body?.scope,
      matchId: req.params.matchId,
      turnToken: req.body?.turnToken,
      version: req.body?.version,
      answerKey: req.body?.answerKey,
      questionId: req.body?.questionId,
    });
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/student/matches/:matchId/abandon', requireStudent, async (req, res) => {
  try {
    const match = await triviaService.abandonMatch({
      ...studentContext(req),
      scope: req.body?.scope,
      matchId: req.params.matchId,
    });
    return res.json({ match });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/student/global-questions/:questionId/report', requireStudent, async (req, res) => {
  try {
    return res.status(201).json(await triviaService.reportGlobalQuestion({
      ...studentContext(req),
      questionId: req.params.questionId,
      reason: req.body?.reason,
    }));
  } catch (error) {
    return sendError(res, error);
  }
});

router.put('/student/global-profiles/block', requireStudent, async (req, res) => {
  try {
    return res.json(await triviaService.blockGlobalProfile({
      ...studentContext(req),
      targetSchoolId: req.body?.schoolId,
      targetStudentId: req.body?.studentId,
      blocked: req.body?.blocked !== false,
    }));
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/student/global-profiles/report', requireStudent, async (req, res) => {
  try {
    return res.status(201).json(await triviaService.reportGlobalProfile({
      ...studentContext(req),
      targetSchoolId: req.body?.schoolId,
      targetStudentId: req.body?.studentId,
      reason: req.body?.reason,
      details: req.body?.details,
    }));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/super-admin/questions', requireSuperAdmin, async (req, res) => {
  try {
    return res.json({
      questions: await triviaService.listGlobalQuestions({
        status: req.query.status,
        category: req.query.category,
        ageBand: req.query.ageBand,
        difficulty: req.query.difficulty,
        moderationStatus: req.query.moderationStatus,
      }),
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/super-admin/questions', requireSuperAdmin, async (req, res) => {
  try {
    const question = await triviaService.createGlobalQuestion({
      userId: req.user.userId,
      body: req.body || {},
    });
    return res.status(201).json({ question });
  } catch (error) {
    return sendError(res, error);
  }
});

router.put('/super-admin/questions/:questionId', requireSuperAdmin, async (req, res) => {
  try {
    const question = await triviaService.updateGlobalQuestion({
      questionId: req.params.questionId,
      body: req.body || {},
    });
    return res.json({ question });
  } catch (error) {
    return sendError(res, error);
  }
});

router.delete('/super-admin/questions/:questionId', requireSuperAdmin, async (req, res) => {
  try {
    return res.json(await triviaService.deleteGlobalQuestion({
      questionId: req.params.questionId,
    }));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/super-admin/reports', requireSuperAdmin, async (_req, res) => {
  try {
    return res.json({ reports: await triviaService.listGlobalReports() });
  } catch (error) {
    return sendError(res, error);
  }
});

router.patch('/super-admin/reports/:reportId', requireSuperAdmin, async (req, res) => {
  try {
    return res.json(await triviaService.moderateGlobalReport({
      userId: req.user.userId,
      reportId: req.params.reportId,
      status: req.body?.status,
      resolutionNote: req.body?.resolutionNote,
      hideQuestion: req.body?.hideQuestion === true,
    }));
  } catch (error) {
    return sendError(res, error);
  }
});

router.get('/super-admin/safety-reports', requireSuperAdmin, async (req, res) => {
  try {
    return res.json({
      reports: await triviaService.listSafetyReports({ status: req.query?.status }),
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.patch('/super-admin/safety-reports/:reportId', requireSuperAdmin, async (req, res) => {
  try {
    return res.json(await triviaService.moderateSafetyReport({
      userId: req.user.userId,
      reportId: req.params.reportId,
      status: req.body?.status,
      note: req.body?.note,
      action: req.body?.action,
    }));
  } catch (error) {
    return sendError(res, error);
  }
});

module.exports = router;
