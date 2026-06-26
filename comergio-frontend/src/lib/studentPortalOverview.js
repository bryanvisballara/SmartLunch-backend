export function mapStudentPortalOverviewToParentOverview(data = {}, user = {}) {
  const student = data?.student || {};
  const academic = data?.academic || {};
  const studentId = String(student._id || student.id || '').trim();

  return {
    parent: {
      _id: String(user?.id || ''),
      name: student.name || user?.name || 'Alumno',
      username: user?.username || '',
    },
    children: studentId ? [{
      _id: studentId,
      id: studentId,
      name: student.name || 'Alumno',
      grade: student.grade || '',
      course: student.course || '',
      displayGrade: student.displayGrade || '',
      schoolCode: student.schoolCode || '',
    }] : [],
    selectedStudentId: studentId || null,
    selectedStudent: studentId ? {
      _id: studentId,
      id: studentId,
      name: student.name || 'Alumno',
      grade: student.grade || '',
      course: student.course || '',
      displayGrade: student.displayGrade || '',
      schoolCode: student.schoolCode || '',
    } : null,
    academicSchedule: academic.schedule || null,
    academicGrades: Array.isArray(academic.gradebook) ? academic.gradebook : [],
    academicRanking: academic.ranking || null,
    academicPerformanceLevel: academic.performanceLevel || null,
    academicGradingScale: academic.gradingScale || null,
    academicUpcomingAssignments: Array.isArray(academic.upcomingAssignments) ? academic.upcomingAssignments : [],
    academicContent: [],
    parentAppFeatures: {
      home: false,
      finance: false,
      academic: true,
      cafeteria: false,
      nursing: false,
      wellbeing: false,
      coexistence: false,
      transport: false,
    },
  };
}
