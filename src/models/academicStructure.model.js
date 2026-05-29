const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const academicStructureCourseSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    section: { type: String, trim: true, default: '' },
    headroomTeacherUserId: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { _id: false }
);

const academicStructureGradeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    levelKey: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    courses: { type: [academicStructureCourseSchema], default: [] },
  },
  { _id: false }
);

const academicStructureLevelSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { _id: false }
);

const academicStructureSubjectSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['principal', 'secundaria'], default: 'principal' },
    gradeKeys: { type: [String], default: [] },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { _id: false }
);

const academicStructurePeriodSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    weight: { type: Number, required: true, min: 0, max: 100 },
    order: { type: Number, default: 0 },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { _id: false }
);

const academicStructurePerformanceLevelSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    minScore: { type: Number, min: 0, max: 100, required: true },
    maxScore: { type: Number, min: 0, max: 100, required: true },
    color: { type: String, trim: true, default: '' },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const academicStructureGradingScaleSchema = new mongoose.Schema(
  {
    minScore: { type: Number, min: 0, max: 100, default: 0 },
    maxScore: { type: Number, min: 1, max: 100, default: 100 },
    passingScore: { type: Number, min: 0, max: 100, default: 70 },
    performanceLevels: { type: [academicStructurePerformanceLevelSchema], default: [] },
  },
  { _id: false }
);

const academicStructureLevelGradingScaleSchema = new mongoose.Schema(
  {
    levelKey: { type: String, required: true, trim: true },
    minScore: { type: Number, min: 0, max: 100, default: 0 },
    maxScore: { type: Number, min: 1, max: 100, default: 100 },
    passingScore: { type: Number, min: 0, max: 100, default: 70 },
    performanceLevels: { type: [academicStructurePerformanceLevelSchema], default: [] },
  },
  { _id: false }
);

const academicStructureScheduleBlockSchema = new mongoose.Schema(
  {
    block: { type: Number, required: true, min: 1, max: 48 },
    durationMinutes: { type: Number, required: true, min: 15, max: 180 },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const academicStructureScheduleGroupSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    name: { type: String, trim: true, default: '' },
    weekdays: { type: [Number], default: [] },
    gradeKeys: { type: [String], default: [] },
    dayStartTime: { type: String, trim: true, default: '07:00' },
    blocks: { type: [academicStructureScheduleBlockSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const academicStructureScheduleSettingsSchema = new mongoose.Schema(
  {
    groups: { type: [academicStructureScheduleGroupSchema], default: [] },
  },
  { _id: false }
);

const academicStructureTeachingAvailabilityWindowSchema = new mongoose.Schema(
  {
    weekday: { type: Number, required: true, min: 1, max: 6 },
    startTime: { type: String, trim: true, default: '07:00' },
    endTime: { type: String, trim: true, default: '12:00' },
  },
  { _id: false }
);

const academicStructureTeachingAvailabilitySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    subjectKey: { type: String, required: true, trim: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gradeKeys: { type: [String], default: [] },
    windows: { type: [academicStructureTeachingAvailabilityWindowSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const academicStructureSubjectLoadTemplateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    subjectKey: { type: String, required: true, trim: true },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    weeklyHours: { type: Number, min: 0, max: 40, default: 0 },
    gradeKeys: { type: [String], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const academicStructureGradeSubjectLoadSchema = new mongoose.Schema(
  {
    subjectKey: { type: String, required: true, trim: true },
    weeklyHours: { type: Number, min: 0, max: 40, default: 0 },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const academicStructureGradeScheduleEntrySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    weekday: { type: Number, required: true, min: 1, max: 6 },
    block: { type: Number, required: true, min: 1, max: 48 },
    startTime: { type: String, trim: true, default: '' },
    endTime: { type: String, trim: true, default: '' },
    entryType: { type: String, enum: ['class', 'break'], default: 'class' },
    subjectKey: { type: String, trim: true, default: '' },
    breakKey: { type: String, trim: true, default: '' },
    breakLabel: { type: String, trim: true, default: '' },
    teacherUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const academicStructureScheduleBreakSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true },
    weekday: { type: Number, required: true, min: 1, max: 6 },
    startTime: { type: String, trim: true, default: '' },
    endTime: { type: String, trim: true, default: '' },
    gradeKeys: { type: [String], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const academicStructureGradeScheduleSchema = new mongoose.Schema(
  {
    gradeKey: { type: String, required: true, trim: true },
    courseKey: { type: String, trim: true, default: '' },
    subjectLoads: { type: [academicStructureGradeSubjectLoadSchema], default: [] },
    weeklySchedule: { type: [academicStructureGradeScheduleEntrySchema], default: [] },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

function defaultAcademicPeriods() {
  return [
    {
      key: 'period_1',
      name: 'Periodo 1',
      weight: 100,
      order: 10,
      startDate: null,
      endDate: null,
    },
  ];
}

const academicStructureSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, unique: true, index: true },
    schoolName: { type: String, trim: true, default: '' },
    academicYear: { type: String, trim: true, default: '' },
    levels: { type: [academicStructureLevelSchema], default: [] },
    subjects: { type: [academicStructureSubjectSchema], default: [] },
    grades: { type: [academicStructureGradeSchema], default: [] },
    scheduleSettings: { type: academicStructureScheduleSettingsSchema, default: () => ({ groups: [] }) },
    scheduleBreaks: { type: [academicStructureScheduleBreakSchema], default: [] },
    teachingAvailability: { type: [academicStructureTeachingAvailabilitySchema], default: [] },
    subjectLoadTemplates: { type: [academicStructureSubjectLoadTemplateSchema], default: [] },
    gradeSchedules: { type: [academicStructureGradeScheduleSchema], default: [] },
    academicPeriods: { type: [academicStructurePeriodSchema], default: defaultAcademicPeriods },
    gradingScale: {
      type: academicStructureGradingScaleSchema,
      default: () => ({
        minScore: 0,
        maxScore: 100,
        passingScore: 70,
        performanceLevels: [
          { key: 'deficiente', label: 'Deficiente', minScore: 0, maxScore: 59, color: '#ef4444', order: 10 },
          { key: 'insuficiente', label: 'Insuficiente', minScore: 60, maxScore: 69, color: '#f97316', order: 20 },
          { key: 'aceptable', label: 'Aceptable', minScore: 70, maxScore: 79, color: '#eab308', order: 30 },
          { key: 'bueno', label: 'Bueno', minScore: 80, maxScore: 89, color: '#65a30d', order: 40 },
          { key: 'sobresaliente', label: 'Sobresaliente', minScore: 90, maxScore: 95, color: '#15803d', order: 50 },
          { key: 'excelente', label: 'Excelente', minScore: 96, maxScore: 100, color: '#166534', order: 60 },
        ],
      }),
    },
    gradingScalesByLevel: { type: [academicStructureLevelGradingScaleSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = registerSchoolScopedModel('AcademicStructure', academicStructureSchema);