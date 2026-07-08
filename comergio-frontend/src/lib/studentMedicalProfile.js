export function createEmptyStudentMedicalProfileDraft() {
  return {
    allergies: '',
    chronicConditions: '',
    currentMedications: '',
    dietaryRestrictions: '',
    healthInsurance: '',
    emergencyMedicalContactName: '',
    emergencyMedicalContactPhone: '',
    physicianName: '',
    physicianPhone: '',
    medicationAuthorization: {
      status: '',
      authorizedBy: '',
      authorizedMedications: '',
      instructions: '',
      notes: '',
    },
  };
}

export function mapMedicalProfileToDraft(profile = {}) {
  const medicationAuthorization = profile?.medicationAuthorization || {};

  return {
    allergies: profile?.allergies || '',
    chronicConditions: profile?.chronicConditions || '',
    currentMedications: profile?.currentMedications || '',
    dietaryRestrictions: profile?.dietaryRestrictions || '',
    healthInsurance: profile?.healthInsurance || '',
    emergencyMedicalContactName: profile?.emergencyMedicalContactName || '',
    emergencyMedicalContactPhone: profile?.emergencyMedicalContactPhone || '',
    physicianName: profile?.physicianName || '',
    physicianPhone: profile?.physicianPhone || '',
    medicationAuthorization: {
      status: medicationAuthorization.status || '',
      authorizedBy: medicationAuthorization.authorizedBy || '',
      authorizedMedications: medicationAuthorization.authorizedMedications || '',
      instructions: medicationAuthorization.instructions || '',
      notes: medicationAuthorization.notes || '',
    },
  };
}

export function getMedicationAuthorizationLabel(value) {
  if (value === 'authorized') {
    return 'Autorizado';
  }
  if (value === 'not_authorized') {
    return 'No autorizado';
  }
  return 'No registrado';
}

export function getMedicalProfileSourceLabel(source = '') {
  if (source === 'parent') {
    return 'Acudiente';
  }
  if (source === 'academic_secretary') {
    return 'Secretaria academica';
  }
  if (source === 'nursing') {
    return 'Enfermeria';
  }
  if (source === 'admin') {
    return 'Administracion';
  }
  return 'Actualizacion';
}

export function formatMedicalProfileDateTime(value) {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
