const MAX_REPORT_SIGNATURE_CHARS = 600_000;

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeReportSignatureDataUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^data:image\/png;base64,/i.test(raw)) return '';
  if (raw.length > MAX_REPORT_SIGNATURE_CHARS) return '';
  return raw;
}

function buildAcademicLookupMaps(academicStructure) {
  const subjectsByKey = new Map();
  (Array.isArray(academicStructure?.subjects) ? academicStructure.subjects : []).forEach((subject) => {
    const key = normalizeText(subject?.key);
    if (key) subjectsByKey.set(key, normalizeText(subject?.label) || key);
  });
  const gradesByKey = new Map();
  (Array.isArray(academicStructure?.grades) ? academicStructure.grades : []).forEach((grade) => {
    const key = normalizeText(grade?.key);
    if (key) gradesByKey.set(key, grade);
  });
  return { subjectsByKey, gradesByKey };
}

function normalizeHeadroomSubjectSlug(subject = '', subjectKey = '') {
  return normalizeText(subjectKey || subject)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function scoreHeadroomSubjectCourseForDedupe(course, reportsByCourseId) {
  const report = reportsByCourseId.get(String(course._id || course.id || ''));
  const status = normalizeText(report?.status);
  if (status === 'submitted') return 100;
  if (status === 'partial') return 60;
  if (status === 'draft') return 10;
  return 0;
}

function dedupeHeadroomSubjectCourses(courses = [], reportsByCourseId = new Map()) {
  const groups = new Map();
  courses.forEach((course) => {
    const sectionKey = normalizeText(course.sourceCourseKey).toUpperCase();
    const gradeKey = normalizeText(course.studentGradeKey);
    const slug = normalizeHeadroomSubjectSlug(course.subject, course.subjectKey);
    if (!slug) return;
    const groupKey = `${sectionKey}::${gradeKey}::${slug}`;
    const score = scoreHeadroomSubjectCourseForDedupe(course, reportsByCourseId);
    const current = groups.get(groupKey);
    if (
      !current
      || score > current.score
      || (score === current.score && String(course._id) < String(current.course._id))
    ) {
      groups.set(groupKey, { course, score });
    }
  });
  return Array.from(groups.values())
    .map((entry) => entry.course)
    .sort((left, right) => (
      normalizeText(left.subject).localeCompare(normalizeText(right.subject), 'es')
      || String(left._id).localeCompare(String(right._id))
    ));
}

function dedupeStudentSubjectLines(subjectLines = []) {
  const bySlug = new Map();
  subjectLines.forEach((line) => {
    const slug = normalizeHeadroomSubjectSlug(line.subject, line.subjectKey);
    if (!slug) return;
    const current = bySlug.get(slug);
    if (!current) {
      bySlug.set(slug, line);
      return;
    }
    const currentScore = Number.isFinite(Number(current.periodAverage)) ? 1 : 0;
    const nextScore = Number.isFinite(Number(line.periodAverage)) ? 1 : 0;
    if (nextScore > currentScore) {
      bySlug.set(slug, line);
      return;
    }
    if (nextScore === currentScore && String(line.subjectReportId || '') > String(current.subjectReportId || '')) {
      bySlug.set(slug, line);
    }
  });
  return Array.from(bySlug.values()).sort((left, right) => left.subject.localeCompare(right.subject, 'es'));
}

function listHeadroomSubjectAssignmentsForSection(academicStructure, gradeKey, sectionKey) {
  const normalizedGradeKey = normalizeText(gradeKey);
  const normalizedSectionKey = normalizeText(sectionKey).toUpperCase();
  if (!normalizedGradeKey || !academicStructure) return [];

  const { gradesByKey, subjectsByKey } = buildAcademicLookupMaps(academicStructure);
  const grade = gradesByKey.get(normalizedGradeKey) || null;
  const sectionCourseKeys = (Array.isArray(grade?.courses) ? grade.courses : [])
    .map((course) => normalizeText(course?.key).toUpperCase())
    .filter(Boolean);
  if (normalizedSectionKey) {
    sectionCourseKeys.push(normalizedSectionKey);
  }
  const uniqueSectionKeys = [...new Set(sectionCourseKeys)];

  const assignments = [];
  (Array.isArray(academicStructure.gradeSchedules) ? academicStructure.gradeSchedules : []).forEach((gradeSchedule) => {
    if (normalizeText(gradeSchedule?.gradeKey) !== normalizedGradeKey) return;
    const scheduleCourseKey = normalizeText(gradeSchedule?.courseKey).toUpperCase();
    const courseKeysForLoad = scheduleCourseKey
      ? [scheduleCourseKey]
      : uniqueSectionKeys;

    const pushAssignment = ({ subjectKey, teacherUserId = '' }) => {
      const normalizedSubjectKey = normalizeText(subjectKey);
      if (!normalizedSubjectKey) return;
      const subjectLabel = subjectsByKey.get(normalizedSubjectKey) || normalizedSubjectKey;
      assignments.push({
        slug: normalizeHeadroomSubjectSlug(subjectLabel, normalizedSubjectKey),
        subjectKey: normalizedSubjectKey,
        subjectLabel,
        teacherUserId: normalizeText(teacherUserId),
      });
    };

    (Array.isArray(gradeSchedule?.subjectLoads) ? gradeSchedule.subjectLoads : []).forEach((load) => {
      const subjectKey = normalizeText(load?.subjectKey);
      const teacherUserId = normalizeText(load?.teacherUserId);
      if (!subjectKey) return;
      courseKeysForLoad.forEach((targetCourseKey) => {
        if (normalizedSectionKey && targetCourseKey !== normalizedSectionKey) return;
        pushAssignment({ subjectKey, teacherUserId });
      });
    });

    (Array.isArray(gradeSchedule?.weeklySchedule) ? gradeSchedule.weeklySchedule : []).forEach((entry) => {
      const subjectKey = normalizeText(entry?.subjectKey);
      if (!subjectKey) return;
      courseKeysForLoad.forEach((targetCourseKey) => {
        if (normalizedSectionKey && targetCourseKey !== normalizedSectionKey) return;
        pushAssignment({ subjectKey, teacherUserId: entry?.teacherUserId });
      });
    });
  });

  return assignments;
}

function listExpectedHeadroomSubjectsForSection(academicStructure, gradeKey, sectionKey) {
  const bySlug = new Map();
  listHeadroomSubjectAssignmentsForSection(academicStructure, gradeKey, sectionKey).forEach((assignment) => {
    if (!assignment.slug || bySlug.has(assignment.slug)) return;
    bySlug.set(assignment.slug, {
      slug: assignment.slug,
      subjectKey: assignment.subjectKey,
      subjectLabel: assignment.subjectLabel,
    });
  });
  return Array.from(bySlug.values()).sort((left, right) => (
    left.subjectLabel.localeCompare(right.subjectLabel, 'es')
  ));
}

function mergePreschoolTemplateSubjectsIntoExpected(expectedSubjects = [], blocks = []) {
  const bySlug = new Map(
    (Array.isArray(expectedSubjects) ? expectedSubjects : []).map((item) => [item.slug, item]),
  );

  (Array.isArray(blocks) ? blocks : []).forEach((block) => {
    (Array.isArray(block?.indicators) ? block.indicators : []).forEach((indicator) => {
      const subjectLabel = normalizeText(indicator?.subjectLabel || indicator?.subjectKey);
      const subjectKey = normalizeText(indicator?.subjectKey);
      const slug = normalizeHeadroomSubjectSlug(subjectLabel, subjectKey);
      if (!slug || bySlug.has(slug)) return;
      bySlug.set(slug, {
        slug,
        subjectKey,
        subjectLabel: subjectLabel || subjectKey,
      });
    });
  });

  return Array.from(bySlug.values()).sort((left, right) => (
    left.subjectLabel.localeCompare(right.subjectLabel, 'es')
  ));
}

function isPreschoolSpecialtySubjectSlug(slug = '') {
  const normalized = normalizeText(slug);
  if (!normalized) return false;
  return /(musica|danza|deporte|edfisica|educacionfisica|artes)/.test(normalized);
}

function enrichHeadroomSubjectChecklist({
  subjectChecklist = [],
  expectedSubjects = [],
  subjectCourses = [],
  reportsByCourseId = new Map(),
  serializeSubjectReportCard = () => null,
  countVisibleReportStudents = () => [],
}) {
  const bySlug = new Map();
  subjectChecklist.forEach((item) => {
    const slug = normalizeHeadroomSubjectSlug(item.subject);
    if (slug) bySlug.set(slug, item);
  });

  expectedSubjects.forEach((expected) => {
    if (!expected?.slug || bySlug.has(expected.slug)) return;
    const matchingCourse = subjectCourses.find(
      (course) => normalizeHeadroomSubjectSlug(course.subject, course.subjectKey) === expected.slug
    );
    const report = matchingCourse
      ? reportsByCourseId.get(String(matchingCourse._id))
      : null;
    const reportStatus = normalizeText(report?.status);
    bySlug.set(expected.slug, {
      campusCourseId: matchingCourse ? String(matchingCourse._id) : '',
      subject: normalizeText(expected.subjectLabel) || expected.slug,
      teacherUserId: matchingCourse ? String(matchingCourse.teacherUserId || '') : '',
      report: report ? serializeSubjectReportCard(report) : null,
      submitted: reportStatus === 'submitted',
      partial: reportStatus === 'partial',
      includedStudentCount: report ? countVisibleReportStudents(report).length : 0,
      rosterStudentCount: Array.isArray(report?.students) ? report.students.length : 0,
      missingCampusCourse: !matchingCourse,
    });
  });

  return Array.from(bySlug.values()).sort((left, right) => (
    normalizeText(left.subject).localeCompare(normalizeText(right.subject), 'es')
  ));
}

function mapPreschoolBlocksBySubjectSlug(blocks = [], subjectChecklist = []) {
  const bySlug = new Map();
  const teacherSubjectSlugs = new Map();
  subjectChecklist.forEach((item) => {
    const slug = normalizeHeadroomSubjectSlug(item?.subject);
    const teacherUserId = String(item?.teacherUserId || '');
    if (!slug || !teacherUserId) return;
    if (!teacherSubjectSlugs.has(teacherUserId)) teacherSubjectSlugs.set(teacherUserId, new Set());
    teacherSubjectSlugs.get(teacherUserId).add(slug);
  });

  blocks.forEach((block) => {
    const slugs = new Set();
    (Array.isArray(block?.indicators) ? block.indicators : []).forEach((indicator) => {
      const slug = normalizeHeadroomSubjectSlug(indicator.subjectLabel, indicator.subjectKey);
      if (slug) slugs.add(slug);
    });
    if (!slugs.size) {
      const teacherUserId = String(block?.teacherUserId || '');
      const teacherSlugs = teacherSubjectSlugs.get(teacherUserId);
      if (teacherSlugs) teacherSlugs.forEach((slug) => slugs.add(slug));
    }
    if (!slugs.size) return;
    slugs.forEach((slug) => {
      if (!bySlug.has(slug)) bySlug.set(slug, []);
      bySlug.get(slug).push(block);
    });
  });
  return bySlug;
}

function isPreschoolBulletinFullyGradedForAllStudents(preschoolBulletin = null) {
  const blocks = Array.isArray(preschoolBulletin?.blocks) ? preschoolBulletin.blocks : [];
  const students = Array.isArray(preschoolBulletin?.students) ? preschoolBulletin.students : [];
  const entries = Array.isArray(preschoolBulletin?.entries) ? preschoolBulletin.entries : [];
  if (!blocks.length || !students.length) return false;
  return blocks.every((block) => isPreschoolBlockFullyGraded(block, students, entries));
}

function isPreschoolBlockFullyGraded(block, students = [], entries = []) {
  const indicatorIds = (Array.isArray(block?.indicators) ? block.indicators : [])
    .map((indicator) => normalizeText(indicator?.id))
    .filter(Boolean);
  if (!indicatorIds.length || !students.length) return false;
  return students.every((student) => (
    indicatorIds.every((indicatorId) => (
      entries.some((entry) => (
        String(entry.studentId) === String(student.id)
        && normalizeText(entry.indicatorId) === indicatorId
        && normalizeText(entry.performanceKey)
      ))
    ))
  ));
}

function applyPreschoolStatusToHeadroomSubjectChecklist(subjectChecklist = [], preschoolBulletin = null) {
  if (!preschoolBulletin?.blocks?.length) return subjectChecklist;
  const blocksBySubjectSlug = mapPreschoolBlocksBySubjectSlug(preschoolBulletin.blocks, subjectChecklist);
  const students = Array.isArray(preschoolBulletin.students) ? preschoolBulletin.students : [];
  const entries = Array.isArray(preschoolBulletin.entries) ? preschoolBulletin.entries : [];

  return subjectChecklist.map((item) => {
    const slug = normalizeHeadroomSubjectSlug(item.subject);
    const relatedBlocks = blocksBySubjectSlug.get(slug);
    if (!relatedBlocks?.length) return item;

    const submitted = relatedBlocks.every((block) => block.submitted === true);
    if (submitted) {
      return { ...item, submitted: true, partial: false, preschoolTracked: true, preschoolDraftReady: false };
    }

    const fullyGraded = relatedBlocks.every((block) => isPreschoolBlockFullyGraded(block, students, entries));
    if (fullyGraded) {
      return {
        ...item,
        submitted: false,
        partial: true,
        preschoolTracked: true,
        preschoolDraftReady: true,
      };
    }

    const relatedIndicatorIds = new Set(
      relatedBlocks.flatMap((block) => (
        (block.indicators || []).map((indicator) => normalizeText(indicator.id)).filter(Boolean)
      ))
    );
    const started = entries.some((entry) => (
      relatedIndicatorIds.has(normalizeText(entry.indicatorId)) && normalizeText(entry.performanceKey)
    ));
    if (started) {
      return { ...item, submitted: false, partial: true, preschoolTracked: true, preschoolDraftReady: false };
    }

    return { ...item, submitted: false, partial: false, preschoolTracked: true, preschoolDraftReady: false };
  });
}

module.exports = {
  normalizeReportSignatureDataUrl,
  normalizeHeadroomSubjectSlug,
  dedupeHeadroomSubjectCourses,
  dedupeStudentSubjectLines,
  listHeadroomSubjectAssignmentsForSection,
  listExpectedHeadroomSubjectsForSection,
  mergePreschoolTemplateSubjectsIntoExpected,
  isPreschoolSpecialtySubjectSlug,
  enrichHeadroomSubjectChecklist,
  applyPreschoolStatusToHeadroomSubjectChecklist,
  isPreschoolBulletinFullyGradedForAllStudents,
};
