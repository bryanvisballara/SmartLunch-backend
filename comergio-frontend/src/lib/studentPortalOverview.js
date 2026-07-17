export function mapStudentPortalOverviewToParentOverview(data = {}, user = {}) {
  const student = data?.student || {};
  const academic = data?.academic || {};
  const studentId = String(student._id || student.id || '').trim();
  const childRecord = studentId ? {
    _id: studentId,
    id: studentId,
    name: student.name || 'Alumno',
    grade: student.grade || '',
    course: student.course || '',
    displayGrade: student.displayGrade || '',
    schoolCode: student.schoolCode || '',
    cohortHistory: Array.isArray(student.cohortHistory) ? student.cohortHistory : [],
    isRealParentChild: true,
    walletBalance: Number(data?.walletBalance || 0),
  } : null;

  return {
    parent: {
      _id: String(user?.id || ''),
      name: student.name || user?.name || 'Alumno',
      username: user?.username || '',
    },
    children: childRecord ? [childRecord] : [],
    selectedStudentId: studentId || null,
    selectedStudent: childRecord,
    academicSchedule: academic.schedule || null,
    academicGrades: Array.isArray(academic.gradebook) ? academic.gradebook : [],
    academicRanking: academic.ranking || null,
    academicPerformanceLevel: academic.performanceLevel || null,
    academicGradingScale: academic.gradingScale || null,
    academicUpcomingAssignments: Array.isArray(academic.upcomingAssignments) ? academic.upcomingAssignments : [],
    academicContent: [],
    psychologyCases: Array.isArray(data?.psychologyCases) ? data.psychologyCases : [],
    coexistenceObservations: Array.isArray(data?.coexistenceObservations) ? data.coexistenceObservations : [],
    parentAppFeatures: {
      home: true,
      finance: false,
      academic: true,
      cafeteria: true,
      games: true,
      nursing: true,
      wellbeing: true,
      coexistence: true,
      transport: true,
      ...(data?.parentAppFeatures || {}),
    },
  };
}
