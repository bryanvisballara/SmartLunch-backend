const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const campusGradingSubcomponentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    weight: { type: Number, required: true, min: 0, max: 100 },
    date: { type: String, trim: true, default: '' },
    topic: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const campusGradingComponentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    weight: { type: Number, required: true, min: 0, max: 100 },
    order: { type: Number, default: 0 },
    subcomponents: { type: [campusGradingSubcomponentSchema], default: [] },
  },
  { _id: false }
);

const campusAcademicPeriodSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    weight: { type: Number, required: true, min: 0, max: 100 },
    order: { type: Number, default: 0 },
    startDate: { type: String, trim: true, default: '' },
    endDate: { type: String, trim: true, default: '' },
    gradingComponents: { type: [campusGradingComponentSchema], default: [] },
  },
  { _id: false }
);

const campusClassSessionSchema = new mongoose.Schema(
  {
    weekday: { type: Number, required: true, min: 0, max: 6 },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    label: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const campusAcademicContentTopicSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const campusAcademicContentPeriodSchema = new mongoose.Schema(
  {
    periodKey: { type: String, required: true, trim: true },
    periodName: { type: String, required: true, trim: true },
    startDate: { type: String, trim: true, default: '' },
    endDate: { type: String, trim: true, default: '' },
    topics: { type: [campusAcademicContentTopicSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

function defaultGradingComponents() {
  return [
    { key: 'tasks', name: 'Tareas', weight: 20, order: 10, subcomponents: [] },
    { key: 'notebook', name: 'Cuaderno', weight: 10, order: 20, subcomponents: [] },
    { key: 'quizzes', name: 'Quices', weight: 25, order: 30, subcomponents: [] },
    { key: 'final_exam', name: 'Examen final', weight: 45, order: 40, subcomponents: [] },
  ];
}

function defaultAcademicPeriods() {
  return [
    {
      key: 'period_1',
      name: 'Periodo 1',
      weight: 100,
      order: 10,
      gradingComponents: defaultGradingComponents(),
    },
  ];
}

const campusCourseSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    teacherUserId: { type: String, required: true, index: true },
    assignedByUserId: { type: String, trim: true, default: '' },
    courseType: { type: String, enum: ['subject', 'guidance_routine'], default: 'subject', index: true },
    sourceCourseKey: { type: String, trim: true, default: '', index: true },
    title: { type: String, required: true, trim: true },
    subject: { type: String, trim: true, default: '' },
    gradeLevel: { type: String, trim: true, default: '' },
    section: { type: String, trim: true, default: '' },
    studentGradeKey: { type: String, required: true, trim: true, index: true },
    description: { type: String, trim: true, default: '' },
    colorToken: { type: String, trim: true, default: '#2a6f97' },
    classSessions: { type: [campusClassSessionSchema], default: [] },
    gradingComponents: { type: [campusGradingComponentSchema], default: defaultGradingComponents },
    academicPeriods: { type: [campusAcademicPeriodSchema], default: defaultAcademicPeriods },
    academicContent: { type: [campusAcademicContentPeriodSchema], default: [] },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true }
);

campusCourseSchema.index({ schoolId: 1, teacherUserId: 1, status: 1 });
campusCourseSchema.index({ schoolId: 1, teacherUserId: 1, title: 1 });
campusCourseSchema.index({ schoolId: 1, studentGradeKey: 1, status: 1 });
campusCourseSchema.index({ schoolId: 1, courseType: 1, sourceCourseKey: 1, status: 1 });

module.exports = registerSchoolScopedModel('CampusCourse', campusCourseSchema);