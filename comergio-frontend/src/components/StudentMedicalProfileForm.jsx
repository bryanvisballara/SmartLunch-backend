import { createEmptyStudentMedicalProfileDraft } from '../lib/studentMedicalProfile';

function StudentMedicalProfileForm({
  bloodType = '',
  disabled = false,
  medicalProfile = createEmptyStudentMedicalProfileDraft(),
  onBloodTypeChange,
  onMedicalProfileChange,
  onMedicationAuthorizationChange,
}) {
  const medicationAuthorization = medicalProfile?.medicationAuthorization || createEmptyStudentMedicalProfileDraft().medicationAuthorization;

  return (
    <div className="student-medical-profile-form">
      <label className="student-medical-profile-form__field">
        Tipo de sangre
        <input
          disabled={disabled}
          onChange={(event) => onBloodTypeChange?.(event.target.value)}
          placeholder="Ej. O+, A-, AB+"
          value={bloodType}
        />
      </label>

      <label className="student-medical-profile-form__field">
        Alergias o sensibilidad conocida
        <textarea
          disabled={disabled}
          onChange={(event) => onMedicalProfileChange?.({ allergies: event.target.value })}
          placeholder="Escribe Ninguna si no aplica"
          required
          rows={3}
          value={medicalProfile.allergies || ''}
        />
      </label>

      <label className="student-medical-profile-form__field">
        Condiciones medicas
        <textarea
          disabled={disabled}
          onChange={(event) => onMedicalProfileChange?.({ chronicConditions: event.target.value })}
          placeholder="Asma, diabetes, convulsiones, cirugias, etc. Escribe Ninguna si no aplica"
          required
          rows={3}
          value={medicalProfile.chronicConditions || ''}
        />
      </label>

      <label className="student-medical-profile-form__field">
        Medicamentos actuales
        <textarea
          disabled={disabled}
          onChange={(event) => onMedicalProfileChange?.({ currentMedications: event.target.value })}
          placeholder="Medicamentos que toma actualmente. Escribe Ninguno si no aplica"
          required
          rows={3}
          value={medicalProfile.currentMedications || ''}
        />
      </label>

      <label className="student-medical-profile-form__field">
        Restricciones alimentarias
        <textarea
          disabled={disabled}
          onChange={(event) => onMedicalProfileChange?.({ dietaryRestrictions: event.target.value })}
          placeholder="Opcional"
          rows={3}
          value={medicalProfile.dietaryRestrictions || ''}
        />
      </label>

      <label className="student-medical-profile-form__field">
        EPS / seguro medico
        <input
          disabled={disabled}
          onChange={(event) => onMedicalProfileChange?.({ healthInsurance: event.target.value })}
          placeholder="Entidad o poliza"
          value={medicalProfile.healthInsurance || ''}
        />
      </label>

      <label className="student-medical-profile-form__field">
        Contacto medico de emergencia
        <input
          disabled={disabled}
          onChange={(event) => onMedicalProfileChange?.({ emergencyMedicalContactName: event.target.value })}
          placeholder="Nombre y parentesco"
          required
          value={medicalProfile.emergencyMedicalContactName || ''}
        />
      </label>

      <label className="student-medical-profile-form__field">
        Telefono contacto medico
        <input
          disabled={disabled}
          onChange={(event) => onMedicalProfileChange?.({ emergencyMedicalContactPhone: event.target.value })}
          placeholder="Numero de contacto"
          required
          value={medicalProfile.emergencyMedicalContactPhone || ''}
        />
      </label>

      <label className="student-medical-profile-form__field">
        Medico tratante
        <input
          disabled={disabled}
          onChange={(event) => onMedicalProfileChange?.({ physicianName: event.target.value })}
          placeholder="Opcional"
          value={medicalProfile.physicianName || ''}
        />
      </label>

      <label className="student-medical-profile-form__field">
        Telefono medico tratante
        <input
          disabled={disabled}
          onChange={(event) => onMedicalProfileChange?.({ physicianPhone: event.target.value })}
          placeholder="Opcional"
          value={medicalProfile.physicianPhone || ''}
        />
      </label>

      <label className="student-medical-profile-form__field">
        Autorizacion de medicamentos
        <select
          disabled={disabled}
          onChange={(event) => onMedicationAuthorizationChange?.({ status: event.target.value })}
          required
          value={medicationAuthorization.status || ''}
        >
          <option value="">Selecciona</option>
          <option value="authorized">Autorizo suministro de medicamentos</option>
          <option value="not_authorized">No autorizo suministro de medicamentos</option>
        </select>
      </label>

      <label className="student-medical-profile-form__field">
        Responsable que autoriza
        <input
          disabled={disabled}
          onChange={(event) => onMedicationAuthorizationChange?.({ authorizedBy: event.target.value })}
          placeholder="Nombre del acudiente"
          required
          value={medicationAuthorization.authorizedBy || ''}
        />
      </label>

      {medicationAuthorization.status === 'authorized' ? (
        <>
          <label className="student-medical-profile-form__field">
            Medicamentos autorizados
            <textarea
              disabled={disabled}
              onChange={(event) => onMedicationAuthorizationChange?.({ authorizedMedications: event.target.value })}
              placeholder="Medicamentos que la enfermeria puede suministrar"
              required
              rows={3}
              value={medicationAuthorization.authorizedMedications || ''}
            />
          </label>

          <label className="student-medical-profile-form__field">
            Instrucciones de suministro
            <textarea
              disabled={disabled}
              onChange={(event) => onMedicationAuthorizationChange?.({ instructions: event.target.value })}
              placeholder="Dosis, frecuencia, condiciones y restricciones"
              required
              rows={3}
              value={medicationAuthorization.instructions || ''}
            />
          </label>
        </>
      ) : null}

      <label className="student-medical-profile-form__field">
        Observaciones de autorizacion
        <textarea
          disabled={disabled}
          onChange={(event) => onMedicationAuthorizationChange?.({ notes: event.target.value })}
          placeholder="Notas para enfermeria"
          rows={3}
          value={medicationAuthorization.notes || ''}
        />
      </label>
    </div>
  );
}

export default StudentMedicalProfileForm;
