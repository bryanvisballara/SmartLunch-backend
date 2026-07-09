const AcademicStructure = require('../models/academicStructure.model');
const CampusCourse = require('../models/campusCourse.model');
const CampusDisciplineObservation = require('../models/campusDisciplineObservation.model');
const CampusPost = require('../models/campusPost.model');
const NursingVisit = require('../models/nursingVisit.model');
const PsychologyCase = require('../models/psychologyCase.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const { getFeeGradeAliases } = require('../utils/feeGradeMatching');
const {
  resolveGradeCourses,
  resolveStudentCourseLabel,
  studentHasAssignedCourseInGrade,
} = require('../utils/academicGradeCourses');

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

function studentMatchesGradeKey(studentGrade = '', gradeKey = '') {
  const studentAliases = new Set(getFeeGradeAliases(studentGrade));
  const gradeAliases = getFeeGradeAliases(gradeKey);
  return gradeAliases.some((alias) => studentAliases.has(alias));
}

function courseMatchesGradeKey(course = {}, gradeKey = '') {
  const courseAliases = new Set([
    ...getFeeGradeAliases(course.studentGradeKey),
    ...getFeeGradeAliases(course.gradeLevel),
    ...getFeeGradeAliases(course.section),
  ]);
  const gradeAliases = getFeeGradeAliases(gradeKey);
  return gradeAliases.some((alias) => courseAliases.has(alias));
}

async function resolveCoordinationScopeContext(schoolId, coordinationScope = '') {
  const normalizedScope = normalizeScopeMatch(coordinationScope);
  const academicStructure = await AcademicStructure.findOne({ schoolId }).lean();
  const levels = Array.isArray(academicStructure?.levels) ? academicStructure.levels : [];
  const grades = Array.isArray(academicStructure?.grades) ? academicStructure.grades : [];
  const subjects = Array.isArray(academicStructure?.subjects) ? academicStructure.subjects : [];

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
  const scopedGrades = grades
    .filter((grade) => levelKeys.has(normalizeText(grade?.levelKey)))
    .map((grade) => ({
      key: normalizeText(grade?.key),
      label: normalizeText(grade?.label || grade?.key),
      levelKey: normalizeText(grade?.levelKey),
      courses: Array.isArray(grade?.courses) ? grade.courses : [],
    }))
    .filter((grade) => grade.key);

  return {
    academicStructure,
    scope: {
      key: normalizeText(matchedLevels[0]?.key || coordinationScope),
      label: normalizeText(matchedLevels[0]?.label || coordinationScope),
      coordinationScope: normalizeText(coordinationScope),
      levelKeys: [...levelKeys],
      gradeKeys: scopedGrades.map((grade) => grade.key),
    },
    scopedGrades,
    subjects,
  };
}

function resolveSubjectsForGrade(subjects = [], gradeKey = '') {
  return subjects.filter((subject) => {
    const gradeKeys = Array.isArray(subject?.gradeKeys) ? subject.gradeKeys : [];
    return gradeKeys.some((key) => studentMatchesGradeKey(key, gradeKey) || normalizeText(key) === normalizeText(gradeKey));
  });
}

function slugifyAcademicStructureKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function normalizeAcademicScheduleMatch(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function subjectKeysEquivalent(left = '', right = '') {
  const leftSlug = slugifyAcademicStructureKey(left);
  const rightSlug = slugifyAcademicStructureKey(right);
  if (leftSlug && rightSlug && leftSlug === rightSlug) return true;
  return normalizeAcademicScheduleMatch(left) === normalizeAcademicScheduleMatch(right);
}

function resolveScopedSubject(subjectRef = '', scopedSubjects = []) {
  const normalizedRef = normalizeText(subjectRef);
  if (!normalizedRef) return null;
  return scopedSubjects.find((subject) => (
    subjectKeysEquivalent(subject?.key, normalizedRef)
    || subjectKeysEquivalent(subject?.label, normalizedRef)
  )) || null;
}

function gradeAssignmentApplies(assignmentGradeKeys = [], gradeKey = '') {
  const keys = Array.isArray(assignmentGradeKeys) ? assignmentGradeKeys : [];
  if (keys.length === 0) return true;
  return keys.some((key) => studentMatchesGradeKey(key, gradeKey) || normalizeText(key) === normalizeText(gradeKey));
}

function scopedGradeMatches(gradeKey = '', scopedGrades = []) {
  return scopedGrades.some((grade) => (
    normalizeText(grade?.key) === normalizeText(gradeKey)
    || studentMatchesGradeKey(grade?.key, gradeKey)
    || studentMatchesGradeKey(gradeKey, grade?.key)
  ));
}

function buildAcademicTeacherAssignmentIndex({
  academicStructure,
  scopedGrades = [],
  scopedSubjects = [],
  users = [],
}) {
  const teachersBySubjectKey = new Map();
  const teacherLoadById = new Map();
  const assignmentCountBySubjectKey = new Map();
  const assignmentKeys = new Set();

  const registerAssignment = (subjectRef, teacherUserId, gradeKey = '') => {
    const teacherId = normalizeText(teacherUserId);
    if (!teacherId || teacherId === 'null' || teacherId === 'undefined') return;

    const subject = resolveScopedSubject(subjectRef, scopedSubjects);
    if (!subject) return;

    const subjectKey = slugifyAcademicStructureKey(subject.key || subject.label);
    const subjectLabel = normalizeText(subject.label || subject.key);
    const normalizedGradeKey = normalizeText(gradeKey);
    const assignmentKey = `${subjectKey}::${teacherId}::${normalizedGradeKey || 'general'}`;
    if (assignmentKeys.has(assignmentKey)) return;
    assignmentKeys.add(assignmentKey);

    const subjectTeachers = teachersBySubjectKey.get(subjectKey) || new Set();
    subjectTeachers.add(teacherId);
    teachersBySubjectKey.set(subjectKey, subjectTeachers);

    assignmentCountBySubjectKey.set(
      subjectKey,
      Number(assignmentCountBySubjectKey.get(subjectKey) || 0) + 1,
    );

    const teacherLoad = teacherLoadById.get(teacherId) || {
      teacherUserId: teacherId,
      subjects: new Set(),
      grades: new Set(),
      assignmentCount: 0,
    };
    teacherLoad.subjects.add(subjectLabel);
    if (normalizedGradeKey) teacherLoad.grades.add(normalizedGradeKey);
    teacherLoad.assignmentCount += 1;
    teacherLoadById.set(teacherId, teacherLoad);
  };

  (Array.isArray(academicStructure?.gradeSchedules) ? academicStructure.gradeSchedules : []).forEach((schedule) => {
    const scheduleGradeKey = normalizeText(schedule?.gradeKey);
    if (!scopedGradeMatches(scheduleGradeKey, scopedGrades)) return;

    const matchingGradeKey = scopedGrades.find((grade) => (
      normalizeText(grade.key) === scheduleGradeKey
      || studentMatchesGradeKey(grade.key, scheduleGradeKey)
    ))?.key || scheduleGradeKey;

    (Array.isArray(schedule?.subjectLoads) ? schedule.subjectLoads : []).forEach((load) => {
      registerAssignment(load?.subjectKey, load?.teacherUserId, matchingGradeKey);
    });

    (Array.isArray(schedule?.weeklySchedule) ? schedule.weeklySchedule : []).forEach((entry) => {
      if (normalizeText(entry?.entryType || 'class') === 'break') return;
      registerAssignment(entry?.subjectKey, entry?.teacherUserId, matchingGradeKey);
    });
  });

  (Array.isArray(academicStructure?.subjectLoadTemplates) ? academicStructure.subjectLoadTemplates : []).forEach((template) => {
    scopedGrades.forEach((grade) => {
      if (!gradeAssignmentApplies(template?.gradeKeys, grade.key)) return;
      registerAssignment(template?.subjectKey, template?.teacherUserId, grade.key);
    });
  });

  (Array.isArray(academicStructure?.teachingAvailability) ? academicStructure.teachingAvailability : []).forEach((item) => {
    scopedGrades.forEach((grade) => {
      if (!gradeAssignmentApplies(item?.gradeKeys, grade.key)) return;
      registerAssignment(item?.subjectKey, item?.teacherUserId, grade.key);
    });
  });

  (Array.isArray(users) ? users : [])
    .filter((user) => normalizeText(user?.role) === 'teacher')
    .forEach((teacher) => {
      (Array.isArray(teacher?.assignedSubjects) ? teacher.assignedSubjects : []).forEach((assignedSubject) => {
        const subject = scopedSubjects.find((item) => (
          subjectKeysEquivalent(item?.key, assignedSubject)
          || subjectKeysEquivalent(item?.label, assignedSubject)
        ));
        if (!subject) return;

        scopedGrades.forEach((grade) => {
          if (!resolveSubjectsForGrade([subject], grade.key).length) return;
          registerAssignment(subject.key || subject.label, teacher._id, grade.key);
        });
      });
    });

  return {
    teachersBySubjectKey,
    teacherLoadById,
    assignmentCountBySubjectKey,
  };
}

function resolveTeachersForSubject({
  subject,
  gradeKey = '',
  teachersBySubjectKey,
  courseDetails = [],
  userNameById = {},
}) {
  const subjectKey = slugifyAcademicStructureKey(subject?.key || subject?.label);
  const teacherIds = new Set(teachersBySubjectKey.get(subjectKey) || []);
  const teacherNames = new Set();

  teacherIds.forEach((teacherId) => {
    const teacherName = userNameById[teacherId];
    if (teacherName) teacherNames.add(teacherName);
  });

  courseDetails
    .filter((course) => {
      const sameSubject = subjectKeysEquivalent(course.subject, subject?.label)
        || subjectKeysEquivalent(course.subject, subject?.key);
      if (!sameSubject) return false;
      if (!gradeKey) return true;
      return courseMatchesGradeKey(course, gradeKey);
    })
    .forEach((course) => {
      if (course.teacherName && course.teacherName !== 'Docente sin asignar') {
        teacherNames.add(course.teacherName);
      }
    });

  return [...teacherNames];
}

function buildSubjectStudentScores(subjectCourses = []) {
  const byStudent = new Map();

  subjectCourses.forEach((course) => {
    (Array.isArray(course.stats?.evaluatedStudents) ? course.stats.evaluatedStudents : []).forEach((student) => {
      const studentId = normalizeText(student?.studentId);
      if (!studentId || !Number.isFinite(Number(student.finalScore))) return;

      const current = byStudent.get(studentId) || {
        studentId,
        name: normalizeText(student.name) || 'Alumno',
        schoolCode: normalizeText(student.schoolCode),
        course: normalizeText(student.course),
        scores: [],
      };
      current.scores.push(Number(student.finalScore));
      if (!current.name || current.name === 'Alumno') current.name = normalizeText(student.name) || current.name;
      if (!current.schoolCode) current.schoolCode = normalizeText(student.schoolCode);
      if (!current.course) current.course = normalizeText(student.course);
      byStudent.set(studentId, current);
    });
  });

  return [...byStudent.values()]
    .map((student) => ({
      studentId: student.studentId,
      name: student.name,
      schoolCode: student.schoolCode,
      course: student.course,
      averageScore: student.scores.length > 0
        ? Number((student.scores.reduce((sum, score) => sum + score, 0) / student.scores.length).toFixed(2))
        : null,
    }))
    .sort((left, right) => {
      const leftScore = Number.isFinite(Number(left.averageScore)) ? Number(left.averageScore) : -1;
      const rightScore = Number.isFinite(Number(right.averageScore)) ? Number(right.averageScore) : -1;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return left.name.localeCompare(right.name, 'es', { sensitivity: 'base' });
    });
}

function buildStudentScoreSummary(evaluatedStudents = [], passingScore = 70) {
  const ranked = [...evaluatedStudents]
    .filter((student) => Number.isFinite(Number(student.finalScore)))
    .sort((left, right) => Number(right.finalScore) - Number(left.finalScore));

  return {
    topStudents: ranked.slice(0, 5),
    lowStudents: [...ranked].reverse().slice(0, 5),
    atRiskStudents: ranked.filter((student) => Number(student.finalScore) < passingScore).slice(0, 8),
    averageScore: ranked.length > 0
      ? Number((ranked.reduce((sum, student) => sum + Number(student.finalScore || 0), 0) / ranked.length).toFixed(2))
      : null,
  };
}

async function buildCoordinationDashboard({
  schoolId,
  coordinationScope = '',
  buildCourseCardStats,
  buildTeacherCourseDetail,
  loadCampusGradingContext,
  resolveCampusGradingScaleForCourse,
  serializeCourse,
  getCourseAcademicPeriods,
}) {
  const { scope, scopedGrades, subjects, academicStructure } = await resolveCoordinationScopeContext(schoolId, coordinationScope);
  const gradeKeys = scope.gradeKeys;

  const [students, campusCourses, posts, disciplineObservations, nursingVisits, wellbeingCases, users, gradingContext] = await Promise.all([
    Student.find({ schoolId, deletedAt: null, status: 'active' }).select('name schoolCode grade course').lean(),
    CampusCourse.find({ schoolId, status: { $ne: 'archived' } }).lean(),
    CampusPost.find({ schoolId }).select('courseId type status title').lean(),
    CampusDisciplineObservation.find({ schoolId }).sort({ submittedAt: -1 }).limit(40).lean(),
    NursingVisit.find({ schoolId }).sort({ attendedAt: -1 }).limit(40).lean(),
    PsychologyCase.find({ schoolId }).sort({ updatedAt: -1 }).limit(40).lean(),
    User.find({ schoolId, status: 'active', deletedAt: null }).select('name username role assignedSubjects').lean(),
    loadCampusGradingContext(schoolId),
  ]);

  const userNameById = Object.fromEntries(users.map((user) => [String(user._id), normalizeText(user.name) || normalizeText(user.username)]));

  const scopedStudents = students.filter((student) => (
    gradeKeys.some((gradeKey) => studentMatchesGradeKey(student.grade, gradeKey))
  ));
  const scopedStudentIds = new Set(scopedStudents.map((student) => String(student._id)));

  const scopedCampusCourses = campusCourses.filter((course) => (
    gradeKeys.some((gradeKey) => courseMatchesGradeKey(course, gradeKey))
  ));

  const postsByCourseId = new Map();
  posts.forEach((post) => {
    const courseId = String(post.courseId || '');
    if (!courseId) return;
    const bucket = postsByCourseId.get(courseId) || [];
    bucket.push(post);
    postsByCourseId.set(courseId, bucket);
  });

  const courseDetails = await Promise.all(scopedCampusCourses.map(async (course) => {
    const courseGradingScale = resolveCampusGradingScaleForCourse(gradingContext, course);
    const courseDetail = await buildTeacherCourseDetail({
      schoolId,
      teacherUserId: normalizeText(course.teacherUserId),
      course,
      gradingScale: courseGradingScale,
    });
    const stats = buildCourseCardStats({
      courseDetail,
      posts: postsByCourseId.get(String(course._id)) || [],
      gradingScale: courseGradingScale,
      academicPeriods: typeof getCourseAcademicPeriods === 'function' ? getCourseAcademicPeriods(course) : [],
    });
    return {
      ...serializeCourse(course, { gradingScale: courseGradingScale }),
      stats,
      teacherName: userNameById[String(course.teacherUserId)] || 'Docente sin asignar',
    };
  }));

  const scopedSubjects = subjects.filter((subject) => {
    const subjectGradeKeys = Array.isArray(subject?.gradeKeys) ? subject.gradeKeys : [];
    return subjectGradeKeys.some((gradeKey) => gradeKeys.some((scopedKey) => (
      studentMatchesGradeKey(gradeKey, scopedKey) || normalizeText(gradeKey) === normalizeText(scopedKey)
    )));
  });

  const uniqueSubjectKeys = new Set(scopedSubjects.map((subject) => normalizeText(subject?.key)).filter(Boolean));

  const academicTeacherAssignments = buildAcademicTeacherAssignmentIndex({
    academicStructure,
    scopedGrades,
    scopedSubjects,
    users,
  });

  const teacherSubjectMap = new Map();
  courseDetails.forEach((course) => {
    const teacherId = String(course.teacherUserId || 'sin-docente');
    if (!normalizeText(course.teacherUserId)) return;
    const current = teacherSubjectMap.get(teacherId) || {
      teacherUserId: teacherId,
      teacherName: course.teacherName || 'Docente sin asignar',
      subjects: new Set(),
      coursesCount: 0,
      grades: new Set(),
    };
    current.subjects.add(normalizeText(course.subject));
    current.grades.add(normalizeText(course.studentGradeKey || course.gradeKey));
    current.coursesCount += 1;
    teacherSubjectMap.set(teacherId, current);
  });

  academicTeacherAssignments.teacherLoadById.forEach((teacherLoad, teacherId) => {
    const current = teacherSubjectMap.get(teacherId) || {
      teacherUserId: teacherId,
      teacherName: userNameById[teacherId] || 'Docente sin asignar',
      subjects: new Set(),
      coursesCount: 0,
      grades: new Set(),
    };
    teacherLoad.subjects.forEach((subject) => current.subjects.add(subject));
    teacherLoad.grades.forEach((grade) => current.grades.add(grade));
    current.coursesCount = Math.max(current.coursesCount, teacherLoad.assignmentCount);
    if (!current.teacherName || current.teacherName === 'Docente sin asignar') {
      current.teacherName = userNameById[teacherId] || current.teacherName;
    }
    teacherSubjectMap.set(teacherId, current);
  });

  const defaultPassingScore = Number(gradingContext?.defaultScale?.passingScore || 70);
  const allEvaluatedStudents = courseDetails.flatMap((course) => (
    Array.isArray(course.stats?.evaluatedStudents) ? course.stats.evaluatedStudents.map((student) => ({
      ...student,
      subject: course.subject,
      courseLabel: course.title || course.label,
      teacherName: course.teacherName,
    })) : []
  ));
  const performance = buildStudentScoreSummary(allEvaluatedStudents, defaultPassingScore);

  const grades = scopedGrades.map((grade) => {
    const gradeStudents = scopedStudents.filter((student) => studentMatchesGradeKey(student.grade, grade.key));
    const gradeCourses = courseDetails.filter((course) => courseMatchesGradeKey(course, grade.key));
    const gradeSubjects = resolveSubjectsForGrade(subjects, grade.key);
    const structureCourses = resolveGradeCourses(grade).map((course) => ({
      key: normalizeText(course.key),
      label: normalizeText(course.label || course.key),
      section: normalizeText(course.section),
      isImplicit: Boolean(course.isImplicit),
      headroomTeacherUserId: normalizeText(course.headroomTeacherUserId),
      headroomTeacherName: userNameById[normalizeText(course.headroomTeacherUserId)] || '',
    }));
    const evaluatedStudents = gradeCourses.flatMap((course) => course.stats?.evaluatedStudents || []);
    const gradePerformance = buildStudentScoreSummary(evaluatedStudents, defaultPassingScore);

    return {
      key: grade.key,
      label: grade.label,
      studentCount: gradeStudents.length,
      assignedStudentCount: gradeStudents.filter((student) => studentHasAssignedCourseInGrade(student, grade)).length,
      pendingStudentCount: gradeStudents.filter((student) => !studentHasAssignedCourseInGrade(student, grade)).length,
      students: gradeStudents.map((student) => ({
        id: String(student._id),
        name: normalizeText(student.name) || 'Alumno',
        schoolCode: normalizeText(student.schoolCode),
        course: resolveStudentCourseLabel(student, grade) || 'Sin curso',
      })),
      structureCourses,
      campusCourses: gradeCourses.map((course) => ({
        id: course.id,
        title: course.title,
        subject: course.subject,
        section: course.section,
        teacherUserId: course.teacherUserId,
        teacherName: course.teacherName,
        studentCount: course.stats?.studentCount || 0,
        averageScore: course.stats?.averageScore,
        atRiskCount: course.stats?.atRiskCount || 0,
        pendingGradingCount: course.stats?.pendingGradingCount || 0,
        gradingCoverageRate: course.stats?.gradingCoverageRate,
      })),
      subjects: gradeSubjects.map((subject) => {
        const subjectCourses = gradeCourses.filter((course) => subjectKeysEquivalent(course.subject, subject.label || subject.key));
        const teachers = resolveTeachersForSubject({
          subject,
          gradeKey: grade.key,
          teachersBySubjectKey: academicTeacherAssignments.teachersBySubjectKey,
          courseDetails: gradeCourses,
          userNameById,
        });
        const subjectStudents = buildSubjectStudentScores(subjectCourses);
        return {
          key: normalizeText(subject.key),
          label: normalizeText(subject.label || subject.key),
          teachers,
          courseCount: Math.max(subjectCourses.length, teachers.length > 0 ? 1 : 0),
          studentCount: subjectStudents.length,
          students: subjectStudents,
          averageScore: subjectCourses.length > 0
            ? Number((subjectCourses
              .filter((course) => Number.isFinite(Number(course.stats?.averageScore)))
              .reduce((sum, course) => sum + Number(course.stats.averageScore), 0)
              / Math.max(1, subjectCourses.filter((course) => Number.isFinite(Number(course.stats?.averageScore))).length)).toFixed(2))
            : null,
        };
      }),
      averageScore: gradePerformance.averageScore,
      topStudents: gradePerformance.topStudents,
      lowStudents: gradePerformance.lowStudents,
      atRiskStudents: gradePerformance.atRiskStudents,
    };
  });

  const scopedDiscipline = disciplineObservations
    .filter((item) => scopedStudentIds.has(String(item.studentId)) || gradeKeys.some((gradeKey) => studentMatchesGradeKey(item.studentGradeKey || item.studentGrade, gradeKey)))
    .slice(0, 12)
    .map((item) => ({
      id: String(item._id),
      studentName: normalizeText(item.studentName),
      studentGrade: normalizeText(item.studentGrade),
      studentCourse: normalizeText(item.studentCourse),
      teacherName: normalizeText(item.teacherName),
      subject: normalizeText(item.subject),
      observation: normalizeText(item.observation),
      status: normalizeText(item.status),
      submittedAt: item.submittedAt || item.createdAt,
    }));

  const scopedNursing = nursingVisits
    .filter((item) => scopedStudentIds.has(String(item.studentId)))
    .slice(0, 12)
    .map((item) => {
      const student = scopedStudents.find((entry) => String(entry._id) === String(item.studentId));
      return {
        id: String(item._id),
        studentName: normalizeText(student?.name),
        studentGrade: normalizeText(student?.grade),
        symptoms: normalizeText(item.symptoms),
        treatment: normalizeText(item.treatment),
        disposition: normalizeText(item.disposition),
        attendedAt: item.attendedAt || item.createdAt,
      };
    });

  const scopedWellbeing = wellbeingCases
    .filter((item) => scopedStudentIds.has(String(item.studentId)))
    .slice(0, 12)
    .map((item) => {
      const student = scopedStudents.find((entry) => String(entry._id) === String(item.studentId));
      const coordinationNotes = (Array.isArray(item.notes) ? item.notes : [])
        .filter((note) => Array.isArray(note.notifyAudiences) && note.notifyAudiences.includes('coordination'))
        .length;
      return {
        id: String(item._id),
        studentName: normalizeText(student?.name),
        studentGrade: normalizeText(student?.grade),
        title: normalizeText(item.title),
        caseType: normalizeText(item.caseType),
        priority: normalizeText(item.priority),
        status: normalizeText(item.status),
        summary: normalizeText(item.summary),
        coordinationNotesCount: coordinationNotes,
        updatedAt: item.updatedAt,
      };
    });

  return {
    scope,
    summary: {
      studentCount: scopedStudents.length,
      assignedStudentCount: scopedStudents.filter((student) => {
        const grade = scopedGrades.find((entry) => studentMatchesGradeKey(student.grade, entry.key));
        return grade ? studentHasAssignedCourseInGrade(student, grade) : false;
      }).length,
      pendingCourseAssignmentCount: scopedStudents.filter((student) => {
        const grade = scopedGrades.find((entry) => studentMatchesGradeKey(student.grade, entry.key));
        return grade ? !studentHasAssignedCourseInGrade(student, grade) : false;
      }).length,
      gradeCount: grades.length,
      structureCourseCount: grades.reduce((sum, grade) => sum + grade.structureCourses.length, 0),
      campusCourseCount: courseDetails.length,
      subjectCount: uniqueSubjectKeys.size,
      teacherCount: [...teacherSubjectMap.values()].filter((teacher) => (
        normalizeText(teacher.teacherUserId) && teacher.teacherUserId !== 'sin-docente'
      )).length,
      disciplineCount: scopedDiscipline.length,
      nursingCount: scopedNursing.length,
      wellbeingCount: scopedWellbeing.length,
      averageScore: performance.averageScore,
      atRiskStudentCount: performance.atRiskStudents.length,
    },
    grades,
    subjectsOverview: scopedSubjects.map((subject) => {
      const subjectKey = slugifyAcademicStructureKey(subject.key || subject.label);
      const campusCourseCount = courseDetails.filter((course) => (
        subjectKeysEquivalent(course.subject, subject.label || subject.key)
      )).length;
      const academicAssignmentCount = Number(academicTeacherAssignments.assignmentCountBySubjectKey.get(subjectKey) || 0);
      const teachers = resolveTeachersForSubject({
        subject,
        teachersBySubjectKey: academicTeacherAssignments.teachersBySubjectKey,
        courseDetails,
        userNameById,
      });

      return {
        key: normalizeText(subject.key),
        label: normalizeText(subject.label || subject.key),
        gradeKeys: Array.isArray(subject.gradeKeys) ? subject.gradeKeys.filter((gradeKey) => (
          gradeKeys.some((scopedKey) => studentMatchesGradeKey(gradeKey, scopedKey) || normalizeText(gradeKey) === normalizeText(scopedKey))
        )) : [],
        teachers,
        courseCount: Math.max(campusCourseCount, academicAssignmentCount),
      };
    }),
    teachers: [...teacherSubjectMap.values()]
      .filter((teacher) => normalizeText(teacher.teacherUserId) && teacher.teacherUserId !== 'sin-docente')
      .map((teacher) => ({
      teacherUserId: teacher.teacherUserId,
      teacherName: teacher.teacherName,
      subjects: [...teacher.subjects].filter(Boolean),
      coursesCount: teacher.coursesCount,
      grades: [...teacher.grades].filter(Boolean),
    })),
    performance: {
      passingScore: defaultPassingScore,
      averageScore: performance.averageScore,
      topStudents: performance.topStudents,
      lowStudents: performance.lowStudents,
      atRiskStudents: performance.atRiskStudents,
    },
    discipline: {
      total: scopedDiscipline.length,
      items: scopedDiscipline,
    },
    nursing: {
      total: scopedNursing.length,
      items: scopedNursing,
    },
    wellbeing: {
      total: scopedWellbeing.length,
      items: scopedWellbeing,
    },
    academicStructureConfigured: Boolean(academicStructure),
  };
}

module.exports = {
  buildCoordinationDashboard,
  resolveCoordinationScopeContext,
};
