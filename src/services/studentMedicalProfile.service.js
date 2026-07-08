const StudentMedicalProfileRevision = require('../models/studentMedicalProfileRevision.model');

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeStudentMedicalProfile(value = {}) {
  const rawProfile = value && typeof value === 'object' ? value : {};
  const rawAuthorization = rawProfile.medicationAuthorization && typeof rawProfile.medicationAuthorization === 'object'
    ? rawProfile.medicationAuthorization
    : {};
  const rawStatus = normalizeText(rawAuthorization.status || rawProfile.medicationAuthorizationStatus).toLowerCase();
  const status = ['authorized', 'not_authorized'].includes(rawStatus) ? rawStatus : '';

  return {
    allergies: normalizeText(rawProfile.allergies),
    chronicConditions: normalizeText(rawProfile.chronicConditions),
    currentMedications: normalizeText(rawProfile.currentMedications),
    dietaryRestrictions: normalizeText(rawProfile.dietaryRestrictions),
    healthInsurance: normalizeText(rawProfile.healthInsurance),
    emergencyMedicalContactName: normalizeText(rawProfile.emergencyMedicalContactName),
    emergencyMedicalContactPhone: normalizeText(rawProfile.emergencyMedicalContactPhone),
    physicianName: normalizeText(rawProfile.physicianName),
    physicianPhone: normalizeText(rawProfile.physicianPhone),
    medicationAuthorization: {
      status,
      authorizedBy: normalizeText(rawAuthorization.authorizedBy || rawProfile.medicationAuthorizationResponsible),
      authorizedMedications: normalizeText(rawAuthorization.authorizedMedications || rawProfile.authorizedMedications),
      instructions: normalizeText(rawAuthorization.instructions || rawProfile.medicationInstructions),
      notes: normalizeText(rawAuthorization.notes || rawProfile.medicationAuthorizationNotes),
      authorizationDate: rawAuthorization.authorizationDate ? new Date(rawAuthorization.authorizationDate) : new Date(),
    },
    completedAt: new Date(),
  };
}

function getStudentMedicalProfileErrors(profile, studentLabel = '') {
  const errors = [];
  const prefix = studentLabel ? `${studentLabel}: ` : '';

  if (!profile.allergies) errors.push(`${prefix}registra alergias o escribe Ninguna.`);
  if (!profile.chronicConditions) errors.push(`${prefix}registra condiciones medicas o escribe Ninguna.`);
  if (!profile.currentMedications) errors.push(`${prefix}registra medicamentos actuales o escribe Ninguno.`);
  if (!profile.emergencyMedicalContactName) errors.push(`${prefix}registra contacto medico de emergencia.`);
  if (!profile.emergencyMedicalContactPhone) errors.push(`${prefix}registra telefono del contacto medico.`);
  if (!profile.medicationAuthorization.status) errors.push(`${prefix}selecciona la autorizacion de medicamentos.`);
  if (!profile.medicationAuthorization.authorizedBy) errors.push(`${prefix}registra quien firma la autorizacion de medicamentos.`);
  if (profile.medicationAuthorization.status === 'authorized' && !profile.medicationAuthorization.authorizedMedications) {
    errors.push(`${prefix}registra los medicamentos autorizados.`);
  }
  if (profile.medicationAuthorization.status === 'authorized' && !profile.medicationAuthorization.instructions) {
    errors.push(`${prefix}registra las instrucciones de medicamentos autorizados.`);
  }

  return errors;
}

function serializeStudentMedicalProfile(profile = {}) {
  const medicationAuthorization = profile?.medicationAuthorization || {};

  return {
    allergies: normalizeText(profile?.allergies),
    chronicConditions: normalizeText(profile?.chronicConditions),
    currentMedications: normalizeText(profile?.currentMedications),
    dietaryRestrictions: normalizeText(profile?.dietaryRestrictions),
    healthInsurance: normalizeText(profile?.healthInsurance),
    emergencyMedicalContactName: normalizeText(profile?.emergencyMedicalContactName),
    emergencyMedicalContactPhone: normalizeText(profile?.emergencyMedicalContactPhone),
    physicianName: normalizeText(profile?.physicianName),
    physicianPhone: normalizeText(profile?.physicianPhone),
    medicationAuthorization: {
      status: normalizeText(medicationAuthorization.status),
      authorizedBy: normalizeText(medicationAuthorization.authorizedBy),
      authorizedMedications: normalizeText(medicationAuthorization.authorizedMedications),
      instructions: normalizeText(medicationAuthorization.instructions),
      notes: normalizeText(medicationAuthorization.notes),
      authorizationDate: medicationAuthorization.authorizationDate || null,
    },
    completedAt: profile?.completedAt || null,
  };
}

const MEDICAL_PROFILE_FIELD_DEFINITIONS = [
  { key: 'allergies', label: 'Alergias o sensibilidad conocida' },
  { key: 'chronicConditions', label: 'Condiciones medicas' },
  { key: 'currentMedications', label: 'Medicamentos actuales' },
  { key: 'dietaryRestrictions', label: 'Restricciones alimentarias' },
  { key: 'healthInsurance', label: 'EPS / seguro medico' },
  { key: 'emergencyMedicalContactName', label: 'Contacto medico de emergencia' },
  { key: 'emergencyMedicalContactPhone', label: 'Telefono contacto medico' },
  { key: 'physicianName', label: 'Medico tratante' },
  { key: 'physicianPhone', label: 'Telefono medico tratante' },
  { key: 'medicationAuthorization.status', label: 'Autorizacion de medicamentos' },
  { key: 'medicationAuthorization.authorizedBy', label: 'Responsable que autoriza' },
  { key: 'medicationAuthorization.authorizedMedications', label: 'Medicamentos autorizados' },
  { key: 'medicationAuthorization.instructions', label: 'Instrucciones de suministro' },
  { key: 'medicationAuthorization.notes', label: 'Observaciones de autorizacion' },
];

function getNestedMedicalProfileValue(profile = {}, key = '') {
  if (key.startsWith('medicationAuthorization.')) {
    const nestedKey = key.split('.')[1];
    return normalizeText(profile?.medicationAuthorization?.[nestedKey]);
  }

  return normalizeText(profile?.[key]);
}

function buildMedicalProfileChangeSet({
  previousBloodType = '',
  nextBloodType = '',
  previousMedicalProfile = {},
  nextMedicalProfile = {},
} = {}) {
  const changedFields = [];

  if (normalizeText(previousBloodType) !== normalizeText(nextBloodType)) {
    changedFields.push({
      key: 'bloodType',
      label: 'Tipo de sangre',
      previousValue: normalizeText(previousBloodType) || 'No registrado',
      nextValue: normalizeText(nextBloodType) || 'No registrado',
    });
  }

  for (const field of MEDICAL_PROFILE_FIELD_DEFINITIONS) {
    const previousValue = getNestedMedicalProfileValue(previousMedicalProfile, field.key);
    const nextValue = getNestedMedicalProfileValue(nextMedicalProfile, field.key);

    if (previousValue !== nextValue) {
      changedFields.push({
        key: field.key,
        label: field.label,
        previousValue: previousValue || 'No registrado',
        nextValue: nextValue || 'No registrado',
      });
    }
  }

  return changedFields;
}

function serializeMedicalProfileRevision(revision = {}) {
  const rawRevision = typeof revision?.toObject === 'function' ? revision.toObject() : revision;

  return {
    id: String(rawRevision._id || ''),
    studentId: String(rawRevision.studentId || ''),
    changedBy: {
      id: String(rawRevision.changedByUserId || ''),
      name: normalizeText(rawRevision.changedByName),
      role: normalizeText(rawRevision.changedByRole),
    },
    source: normalizeText(rawRevision.source) || 'parent',
    changedFields: Array.isArray(rawRevision.changedFields)
      ? rawRevision.changedFields.map((field) => ({
        key: normalizeText(field.key),
        label: normalizeText(field.label),
        previousValue: normalizeText(field.previousValue),
        nextValue: normalizeText(field.nextValue),
      }))
      : [],
    previousBloodType: normalizeText(rawRevision.previousBloodType),
    nextBloodType: normalizeText(rawRevision.nextBloodType),
    previousMedicalProfile: serializeStudentMedicalProfile(rawRevision.previousMedicalProfile),
    nextMedicalProfile: serializeStudentMedicalProfile(rawRevision.nextMedicalProfile),
    createdAt: rawRevision.createdAt || null,
  };
}

async function listStudentMedicalProfileRevisions({ schoolId, studentId, limit = 50 } = {}) {
  const revisions = await StudentMedicalProfileRevision.find({ schoolId, studentId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 50, 1), 100))
    .lean();

  return revisions.map(serializeMedicalProfileRevision);
}

async function applyStudentMedicalProfileUpdate({
  schoolId,
  student,
  bloodType,
  medicalProfile,
  actor = {},
  source = 'parent',
}) {
  const previousBloodType = normalizeText(student?.bloodType);
  const previousMedicalProfile = serializeStudentMedicalProfile(student?.medicalProfile);
  const nextBloodType = bloodType === undefined ? previousBloodType : normalizeText(bloodType);
  const nextMedicalProfile = normalizeStudentMedicalProfile(medicalProfile);
  const validationErrors = getStudentMedicalProfileErrors(nextMedicalProfile, normalizeText(student?.name));

  if (validationErrors.length) {
    const error = new Error(validationErrors.join(' '));
    error.statusCode = 400;
    throw error;
  }

  const changedFields = buildMedicalProfileChangeSet({
    previousBloodType,
    nextBloodType,
    previousMedicalProfile,
    nextMedicalProfile,
  });

  if (!changedFields.length) {
    return {
      changed: false,
      bloodType: nextBloodType,
      medicalProfile: nextMedicalProfile,
      revision: null,
    };
  }

  const revision = await StudentMedicalProfileRevision.create({
    schoolId,
    studentId: student._id,
    changedByUserId: actor.userId,
    changedByName: normalizeText(actor.name),
    changedByRole: normalizeText(actor.role),
    source,
    previousBloodType,
    nextBloodType,
    previousMedicalProfile,
    nextMedicalProfile,
    changedFields,
  });

  student.bloodType = nextBloodType;
  student.medicalProfile = nextMedicalProfile;
  await student.save();

  return {
    changed: true,
    bloodType: nextBloodType,
    medicalProfile: nextMedicalProfile,
    revision: serializeMedicalProfileRevision(revision),
  };
}

module.exports = {
  normalizeText,
  normalizeStudentMedicalProfile,
  getStudentMedicalProfileErrors,
  serializeStudentMedicalProfile,
  buildMedicalProfileChangeSet,
  serializeMedicalProfileRevision,
  listStudentMedicalProfileRevisions,
  applyStudentMedicalProfileUpdate,
};
