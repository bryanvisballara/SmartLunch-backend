const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const medicationAuthorizationSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['authorized', 'not_authorized', ''], default: '' },
    authorizedBy: { type: String, trim: true, default: '' },
    authorizedMedications: { type: String, trim: true, default: '' },
    instructions: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    authorizationDate: { type: Date, default: null },
  },
  { _id: false }
);

const studentMedicalProfileSchema = new mongoose.Schema(
  {
    allergies: { type: String, trim: true, default: '' },
    chronicConditions: { type: String, trim: true, default: '' },
    currentMedications: { type: String, trim: true, default: '' },
    dietaryRestrictions: { type: String, trim: true, default: '' },
    healthInsurance: { type: String, trim: true, default: '' },
    emergencyMedicalContactName: { type: String, trim: true, default: '' },
    emergencyMedicalContactPhone: { type: String, trim: true, default: '' },
    physicianName: { type: String, trim: true, default: '' },
    physicianPhone: { type: String, trim: true, default: '' },
    medicationAuthorization: { type: medicationAuthorizationSchema, default: () => ({}) },
    completedAt: { type: Date, default: null },
  },
  { _id: false }
);

const studentSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    schoolCode: { type: String, trim: true },
    grade: { type: String, trim: true },
    course: { type: String, trim: true, default: '' },
    gender: { type: String, enum: ['female', 'male', 'other', ''], default: '' },
    documentType: { type: String, enum: ['CC', 'TI', 'CE', 'PP', 'NIT', ''], default: '' },
    documentNumber: { type: String, trim: true, default: '' },
    birthDate: { type: Date, default: null },
    entryDate: { type: Date, default: null },
    bloodType: { type: String, trim: true, default: '' },
    medicalProfile: { type: studentMedicalProfileSchema, default: () => ({}) },
    birthPlace: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    imageUrl: { type: String, trim: true, default: '' },
    thumbUrl: { type: String, trim: true, default: '' },
    dailyLimit: { type: Number, default: 0 },
    blockedProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    blockedCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

studentSchema.index({ schoolId: 1, status: 1 });
studentSchema.index({ schoolId: 1, name: 1 });
studentSchema.index({ schoolId: 1, grade: 1, course: 1, status: 1 });

module.exports = registerSchoolScopedModel('Student', studentSchema);
