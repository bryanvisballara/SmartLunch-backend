export const mockCampusContext = {
  enabled: true,
  reason: '',
  defaultPath: '/campus/parent',
  user: {
    userId: 'preview-user',
    schoolId: 'preview-school',
    role: 'parent',
    name: 'Vista Local Campus',
    username: 'preview-campus',
  },
  memberships: [
    {
      memberType: 'campus_parent',
      status: 'active',
      title: 'Campus Familia',
      launchPath: '/campus/parent',
      permissions: [],
      virtual: true,
    },
    {
      memberType: 'campus_student',
      status: 'active',
      title: 'Campus Alumno',
      launchPath: '/campus/student',
      permissions: [],
      virtual: true,
    },
    {
      memberType: 'campus_teacher',
      status: 'active',
      title: 'Campus Docente',
      launchPath: '/campus/teacher',
      permissions: [],
      virtual: true,
    },
    {
      memberType: 'campus_coordination',
      status: 'active',
      title: 'Campus Coordinación',
      launchPath: '/campus/coordination',
      permissions: [],
      virtual: true,
    },
  ],
  navigation: [
    {
      memberType: 'campus_parent',
      path: '/campus/parent',
      title: 'Campus Familia',
      description: 'Vista inicial para acudientes y padres de familia.',
      virtual: true,
    },
    {
      memberType: 'campus_student',
      path: '/campus/student',
      title: 'Campus Alumno',
      description: 'Vista inicial para estudiantes.',
      virtual: true,
    },
    {
      memberType: 'campus_teacher',
      path: '/campus/teacher',
      title: 'Campus Docente',
      description: 'Vista inicial para docentes.',
      virtual: true,
    },
    {
      memberType: 'campus_coordination',
      path: '/campus/coordination',
      title: 'Campus Coordinación',
      description: 'Vista inicial para coordinación académica.',
      virtual: true,
    },
  ],
};

export const mockCampusNavigation = {
  enabled: true,
  reason: '',
  defaultPath: '/campus/parent',
  navigation: mockCampusContext.navigation,
};

function buildPreviewTeacherWeeklySchedule(courses) {
  const weekdays = [
    { key: 1, label: 'Lunes', shortLabel: 'Lun' },
    { key: 2, label: 'Martes', shortLabel: 'Mar' },
    { key: 3, label: 'Miércoles', shortLabel: 'Mie' },
    { key: 4, label: 'Jueves', shortLabel: 'Jue' },
    { key: 5, label: 'Viernes', shortLabel: 'Vie' },
  ];
  const slotsByKey = new Map();

  (courses || []).forEach((course) => {
    (course.classSessions || []).forEach((session) => {
      const weekday = Number(session.weekday);
      if (weekday < 1 || weekday > 5) {
        return;
      }

      const slotKey = `${session.startTime}-${session.endTime}`;
      const currentSlot = slotsByKey.get(slotKey) || {
        key: slotKey,
        startTime: session.startTime,
        endTime: session.endTime,
        cells: { 1: [], 2: [], 3: [], 4: [], 5: [] },
      };

      currentSlot.cells[weekday].push({
        key: `${course.id}:${weekday}:${session.startTime}:${session.endTime}`,
        courseId: course.id,
        courseTitle: course.title,
        subject: course.subject,
        studentGradeKey: course.studentGradeKey,
        colorToken: course.colorToken,
        weekday,
        startTime: session.startTime,
        endTime: session.endTime,
        label: session.label || 'Bloque de clase',
      });

      slotsByKey.set(slotKey, currentSlot);
    });
  });

  const slots = Array.from(slotsByKey.values())
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
    .map((slot) => ({
      key: slot.key,
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: `${slot.startTime} - ${slot.endTime}`,
      days: weekdays.map((day) => ({
        weekday: day.key,
        items: (slot.cells[day.key] || []).sort((left, right) => left.courseTitle.localeCompare(right.courseTitle)),
      })),
    }));

  return {
    weekdays,
    slots,
    totalBlocks: (courses || []).reduce((total, course) => total + ((course.classSessions || []).length), 0),
    timeRange: {
      startTime: '07:30',
      endTime: '16:00',
      slotDurationMinutes: 60,
    },
  };
}

function buildPreviewSchedulePool() {
  const slots = [];

  for (const weekday of [1, 2, 3, 4, 5]) {
    for (let hour = 7; hour <= 14; hour += 1) {
      const startHour = hour;
      const startMinutes = hour === 7 ? 30 : 30;
      const endHour = startHour + 1;
      slots.push({
        weekday,
        startTime: `${String(startHour).padStart(2, '0')}:30`,
        endTime: `${String(endHour).padStart(2, '0')}:30`,
      });
    }
  }

  return slots;
}

const lauraAssignments = [
  {
    subject: 'Física',
    colorToken: '#355070',
    description: 'Física con enfoque en laboratorio, análisis de movimiento y resolución guiada de problemas.',
    classSessions: [
      { weekday: 1, startTime: '07:30', endTime: '08:30', label: 'Teoría' },
      { weekday: 3, startTime: '09:30', endTime: '10:30', label: 'Práctica' },
      { weekday: 4, startTime: '11:30', endTime: '12:30', label: 'Laboratorio' },
    ],
    gradeKeys: ['9A', '9B', '10A', '10B', '11A', '11B'],
  },
  {
    subject: 'Matemáticas',
    colorToken: '#2a6f97',
    description: 'Matemáticas con trabajo por competencias, ejercicios semanales y evaluaciones cortas.',
    classSessions: [
      { weekday: 1, startTime: '08:30', endTime: '09:30', label: 'Conceptos base' },
      { weekday: 2, startTime: '10:30', endTime: '11:30', label: 'Taller' },
      { weekday: 4, startTime: '07:30', endTime: '08:30', label: 'Refuerzo' },
    ],
    gradeKeys: ['6A', '6B', '7A', '7B', '8A', '8B'],
  },
];

const previewFirstNames = [
  'Sofía', 'Valentina', 'Samuel', 'Mateo', 'Isabella', 'Santiago', 'Mariana', 'Juan', 'Luciana', 'Daniel',
  'Antonella', 'Nicolás', 'Gabriela', 'Sebastián', 'Emilia', 'Manuel', 'Salomé', 'David', 'Sara', 'Jerónimo',
  'María', 'Felipe', 'Camila', 'Andrés', 'Juliana', 'Martín', 'Paula', 'Miguel', 'Laura', 'Tomás',
  'Manuela', 'Thiago', 'Catalina', 'Emmanuel', 'Victoria', 'Cristian', 'Daniela', 'Alejandro', 'Regina', 'Esteban',
];

const previewLastNames = [
  'Gómez', 'Rodríguez', 'Martínez', 'García', 'López', 'Torres', 'Ramírez', 'Castro', 'Morales', 'Herrera',
  'Rojas', 'Medina', 'Díaz', 'Suárez', 'Vargas', 'Fernández', 'Romero', 'Ortiz', 'Pineda', 'Cortés',
  'Restrepo', 'Navarro', 'Arias', 'Mendoza', 'Guerrero', 'Núñez', 'Santos', 'Valencia', 'Rivera', 'Acosta',
];

function previewHash(value) {
  return String(value || '').split('').reduce((accumulator, char) => ((accumulator * 31) + char.charCodeAt(0)) >>> 0, 11);
}

function buildPreviewStudentCount(gradeKey) {
  return 17 + (previewHash(gradeKey) % 9);
}

function buildPreviewStudentName(index) {
  const firstName = previewFirstNames[index % previewFirstNames.length];
  const lastName = previewLastNames[Math.floor(index / previewFirstNames.length) % previewLastNames.length];
  const secondLastName = previewLastNames[(index * 5) % previewLastNames.length];
  return `${firstName} ${lastName} ${secondLastName}`;
}

function buildPreviewSchoolCode(subject, gradeKey, index) {
  const subjectCode = subject === 'Física' ? 'FIS' : 'MAT';
  return `LM-${subjectCode}-${gradeKey}-${String(index + 1).padStart(2, '0')}`;
}

function buildPreviewAcademicPeriods(subject) {
  const componentBlueprints = subject === 'Física'
    ? [
      { baseKey: 'workshop', name: 'Taller', weight: 35, order: 10 },
      { baseKey: 'quiz', name: 'Quiz', weight: 25, order: 20 },
      { baseKey: 'lab_or_exam', name: 'Laboratorio / evaluacion', weight: 40, order: 30 },
    ]
    : [
      { baseKey: 'workshop', name: 'Taller', weight: 35, order: 10 },
      { baseKey: 'quiz', name: 'Quiz', weight: 25, order: 20 },
      { baseKey: 'exam', name: 'Evaluacion', weight: 40, order: 30 },
    ];

  return [
    { key: 'period_1', name: 'Periodo 1', weight: 30, order: 10 },
    { key: 'period_2', name: 'Periodo 2', weight: 30, order: 20 },
    { key: 'period_3', name: 'Periodo 3', weight: 40, order: 30 },
  ].map((period) => ({
    ...period,
    gradingComponents: componentBlueprints.map((component) => ({
      key: `${period.key}_${component.baseKey}`,
      name: component.name,
      weight: component.weight,
      order: component.order,
    })),
  }));
}

function buildPreviewScore(seed) {
  const base = 2.4 + ((previewHash(seed) % 25) / 10);
  return Number(Math.min(5, base).toFixed(1));
}

function buildPreviewIsoDate(dayOffset) {
  return new Date(Date.UTC(2026, 2, 20 + dayOffset, 10, 0, 0, 0)).toISOString();
}

function buildPreviewTeacherWorkspace() {
  const courses = [];
  const recentPosts = [];
  const courseDetails = {};
  let globalStudentIndex = 0;
  const schedulePool = buildPreviewSchedulePool();
  let scheduleCursor = 0;

  lauraAssignments.forEach((assignment, assignmentIndex) => {
    assignment.gradeKeys.forEach((gradeKey, gradeIndex) => {
      const gradeLevel = String(gradeKey).replace(/[^0-9]+/g, '');
      const section = String(gradeKey).replace(/^[0-9]+/g, '');
      const courseId = `preview-course-${assignment.subject.toLowerCase()}-${gradeKey.toLowerCase()}`;
      const academicPeriods = buildPreviewAcademicPeriods(assignment.subject);
      const assignedClassSessions = assignment.classSessions.map((session) => {
        const assignedSlot = schedulePool[scheduleCursor % schedulePool.length];
        scheduleCursor += 1;
        return {
          weekday: assignedSlot.weekday,
          startTime: assignedSlot.startTime,
          endTime: assignedSlot.endTime,
          label: session.label,
        };
      });
      const course = {
        id: courseId,
        title: `${assignment.subject} ${gradeKey}`,
        subject: assignment.subject,
        gradeLevel,
        section,
        studentGradeKey: gradeKey,
        description: `${assignment.description} Grupo ${gradeKey}.`,
        colorToken: assignment.colorToken,
        classSessions: assignedClassSessions,
        academicPeriods,
        gradingComponents: academicPeriods[0].gradingComponents,
        status: 'active',
        createdAt: buildPreviewIsoDate(assignmentIndex + gradeIndex),
        updatedAt: buildPreviewIsoDate(assignmentIndex + gradeIndex + 4),
      };

      const studentCount = buildPreviewStudentCount(gradeKey);
      const students = Array.from({ length: studentCount }, (_, studentIndex) => {
        const studentId = `${courseId}-student-${studentIndex + 1}`;
        const scores = academicPeriods.flatMap((period) => period.gradingComponents.map((component) => ({
          periodKey: period.key,
          componentKey: component.key,
          componentName: component.name,
          weight: component.weight,
          score: buildPreviewScore(`${studentId}:${component.key}`),
          feedback: `${component.name} registrada para ${buildPreviewStudentName(globalStudentIndex + studentIndex)}.`,
          gradedAt: buildPreviewIsoDate(assignmentIndex + gradeIndex + 5),
        })));
        const finalScore = Number((scores.reduce((total, score) => total + score.score, 0) / scores.length).toFixed(2));

        return {
          studentId,
          name: buildPreviewStudentName(globalStudentIndex + studentIndex),
          schoolCode: buildPreviewSchoolCode(assignment.subject, gradeKey, studentIndex),
          grade: gradeKey,
          finalScore,
          scores,
        };
      });

      globalStudentIndex += studentCount;
      courses.push(course);
      courseDetails[courseId] = {
        course,
        students,
      };

      recentPosts.push(
        {
          id: `${courseId}-post-task`,
          courseId,
          courseTitle: course.title,
          type: 'Tarea',
          title: `Taller base ${assignment.subject} ${gradeKey}`,
          body: `Actividad principal de ${assignment.subject.toLowerCase()} para el grupo ${gradeKey}.`,
          deliveryMode: 'date',
          dueAt: buildPreviewIsoDate(10 + gradeIndex),
          scheduledClassDate: null,
          scheduledClassSession: null,
          attachments: [],
          status: 'published',
          publishedAt: buildPreviewIsoDate(6 + gradeIndex),
          createdAt: buildPreviewIsoDate(6 + gradeIndex),
          updatedAt: buildPreviewIsoDate(6 + gradeIndex),
        },
        {
          id: `${courseId}-post-material`,
          courseId,
          courseTitle: course.title,
          type: 'Material',
          title: `Material de apoyo ${assignment.subject} ${gradeKey}`,
          body: `Guia introductoria y material de repaso para ${assignment.subject.toLowerCase()} en ${gradeKey}.`,
          deliveryMode: 'class',
          dueAt: null,
          scheduledClassDate: buildPreviewIsoDate(8 + gradeIndex),
          scheduledClassSession: assignedClassSessions[0],
          attachments: [
            {
              sourceType: 'link',
              kind: 'link',
              title: 'Material de repaso',
              url: 'https://example.com/material-campus',
              fileName: '',
              mimeType: 'text/uri-list',
              sizeBytes: 0,
              extension: '',
              storage: 'external',
            },
          ],
          status: 'published',
          publishedAt: buildPreviewIsoDate(7 + gradeIndex),
          createdAt: buildPreviewIsoDate(7 + gradeIndex),
          updatedAt: buildPreviewIsoDate(7 + gradeIndex),
        }
      );
    });
  });

  return {
    teacher: {
      userId: 'preview-teacher',
      name: 'Profe Laura Medina',
      username: 'laura.medina',
    },
    summary: {
      totalCourses: courses.length,
      activeCourses: courses.length,
      publishedPosts: recentPosts.filter((post) => post.status === 'published').length,
      activeAssignments: recentPosts.filter((post) => post.type !== 'Material' && post.status !== 'archived').length,
    },
    courses,
    weeklySchedule: buildPreviewTeacherWeeklySchedule(courses),
    recentPosts,
    courseDetails,
  };
}

export const mockTeacherWorkspace = buildPreviewTeacherWorkspace();

export const mockCoordinationWorkspace = {
  teachers: [
    {
      userId: mockTeacherWorkspace.teacher.userId,
      name: mockTeacherWorkspace.teacher.name,
      username: mockTeacherWorkspace.teacher.username,
      role: 'admin',
    },
  ],
  courses: mockTeacherWorkspace.courses.map((course) => ({
    ...course,
    teacherUserId: mockTeacherWorkspace.teacher.userId,
    teacherName: mockTeacherWorkspace.teacher.name,
  })),
};