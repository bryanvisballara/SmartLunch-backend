import {
  formatMedicalProfileDateTime,
  getMedicalProfileSourceLabel,
  getMedicationAuthorizationLabel,
} from '../lib/studentMedicalProfile';

function isBlankHistoryValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'no registrado' || normalized === 'no-registrado';
}

function formatHistoryFieldValue(field = {}) {
  const rawValue = String(field.nextValue || '').trim();
  if (field.key === 'medicationAuthorization.status') {
    return getMedicationAuthorizationLabel(rawValue);
  }
  return rawValue || 'No registrado';
}

function isEnrollmentLikeRevision(revision = {}) {
  const source = String(revision.source || '').trim().toLowerCase();
  if (source === 'enrollment' || source === 'matricula') {
    return true;
  }

  const changedFields = Array.isArray(revision.changedFields) ? revision.changedFields : [];
  return changedFields.length > 0
    && changedFields.every((field) => isBlankHistoryValue(field.previousValue));
}

function StudentMedicalProfileHistory({
  emptyMessage = 'Aun no hay cambios registrados en la ficha medica.',
  revisions = [],
}) {
  if (!revisions.length) {
    return <p className="student-medical-profile-history__empty">{emptyMessage}</p>;
  }

  return (
    <div className="student-medical-profile-history">
      {revisions.map((revision) => {
        const revisionId = String(revision.id || revision._id || revision.createdAt || 'revision');
        const changedFields = Array.isArray(revision.changedFields) ? revision.changedFields : [];
        const showAsSnapshot = isEnrollmentLikeRevision(revision);

        return (
          <article
            className={`student-medical-profile-history__card${showAsSnapshot ? ' is-snapshot' : ''}`}
            key={revisionId}
          >
            <header className="student-medical-profile-history__head">
              <div>
                <strong>{revision.changedBy?.name || 'Acudiente'}</strong>
                <span>{getMedicalProfileSourceLabel(revision.source)}</span>
              </div>
              <time dateTime={revision.createdAt || undefined}>{formatMedicalProfileDateTime(revision.createdAt)}</time>
            </header>

            {changedFields.length ? (
              <ul className={`student-medical-profile-history__changes${showAsSnapshot ? ' is-grid' : ''}`}>
                {changedFields.map((field) => {
                  const nextValue = formatHistoryFieldValue(field);
                  const previousValue = String(field.previousValue || '').trim() || 'No registrado';
                  const showPrevious = !showAsSnapshot && !isBlankHistoryValue(previousValue) && previousValue !== nextValue;

                  return (
                    <li key={`${revisionId}-${field.key}`}>
                      <span>{field.label}</span>
                      <p>
                        {showPrevious ? <del>{previousValue}</del> : null}
                        <strong>{nextValue}</strong>
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="student-medical-profile-history__empty">Actualizacion registrada sin detalle de campos.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export default StudentMedicalProfileHistory;
