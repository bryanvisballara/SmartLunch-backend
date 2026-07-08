import {
  formatMedicalProfileDateTime,
  getMedicalProfileSourceLabel,
} from '../lib/studentMedicalProfile';

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

        return (
          <article className="student-medical-profile-history__card" key={revisionId}>
            <header className="student-medical-profile-history__head">
              <div>
                <strong>{revision.changedBy?.name || 'Acudiente'}</strong>
                <span>{getMedicalProfileSourceLabel(revision.source)}</span>
              </div>
              <time dateTime={revision.createdAt || undefined}>{formatMedicalProfileDateTime(revision.createdAt)}</time>
            </header>

            {changedFields.length ? (
              <ul className="student-medical-profile-history__changes">
                {changedFields.map((field) => (
                  <li key={`${revisionId}-${field.key}`}>
                    <span>{field.label}</span>
                    <p>
                      <del>{field.previousValue || 'No registrado'}</del>
                      <strong>{field.nextValue || 'No registrado'}</strong>
                    </p>
                  </li>
                ))}
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
