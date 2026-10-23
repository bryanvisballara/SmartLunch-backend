import { useEffect, useState } from 'react';
import { getParentStudentBulletins } from '../../services/parent.service';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function PerformancePill({ label }) {
  if (!label) return <em>Sin calificar</em>;
  const compact = label.toLowerCase();
  const tone = compact.includes('(ip)') || compact.includes('iniciando')
    ? 'ip'
    : compact.includes('(ep)') || compact.includes('en proceso')
      ? 'ep'
      : 'ia';
  return <strong className={`campus-parent-bulletin__pill is-${tone}`}>{label}</strong>;
}

function BulletinSheet({ bulletin, schoolName, student }) {
  return (
    <article className="campus-parent-bulletin__sheet">
      <header>
        <p>{schoolName || 'Colegio'}</p>
        <h3>{bulletin.kind === 'preschool' ? 'Boletín de preescolar' : 'Boletín de periodo'}</h3>
        <span>{bulletin.periodName} · {bulletin.gradeLabel}</span>
      </header>
      <dl>
        <div>
          <dt>Estudiante</dt>
          <dd>{student?.name || 'Estudiante'}</dd>
        </div>
        <div>
          <dt>Código</dt>
          <dd>{student?.schoolCode || '—'}</dd>
        </div>
        <div>
          <dt>Generado</dt>
          <dd>{formatDate(bulletin.generatedAt) || '—'}</dd>
        </div>
      </dl>

      {bulletin.kind === 'preschool' ? (
        (bulletin.blocks || []).map((block) => (
          <section key={block.id}>
            <h4>{block.kind === 'topic' ? 'Tópico' : 'Dimensión'}: {block.name}</h4>
            {block.teacherName ? <p>Docente: {block.teacherName}</p> : null}
            {block.dimensionComment ? <p>Comentario general: {block.dimensionComment}</p> : null}
            <ul>
              {(block.indicators || []).map((indicator) => (
                <li key={indicator.id}>
                  <div>
                    <strong>{indicator.text}</strong>
                    {indicator.observation ? <span>{indicator.observation}</span> : null}
                  </div>
                  <PerformancePill label={indicator.performanceLabel} />
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <>
          <section>
            <h4>Asignaturas</h4>
            <ul>
              {(bulletin.subjects || []).map((subject) => (
                <li key={`${subject.subject}-${subject.teacherName}`}>
                  <div>
                    <strong>{subject.subject}</strong>
                    <span>
                      {subject.teacherName ? `${subject.teacherName}. ` : ''}
                      {subject.observation || 'Sin comentario'}
                    </span>
                  </div>
                  <strong className="campus-parent-bulletin__score">
                    {subject.periodAverage === null || subject.periodAverage === undefined ? '—' : subject.periodAverage}
                  </strong>
                </li>
              ))}
            </ul>
          </section>
          <section className="campus-parent-bulletin__summary">
            <p>Promedio del periodo: <strong>{bulletin.overallAverage ?? '—'}</strong></p>
            {bulletin.headroomObservation ? <p>Director de grupo: {bulletin.headroomObservation}</p> : null}
            {bulletin.coexistenceLabel || bulletin.coexistenceObservation ? (
              <p>
                Convivencia: {bulletin.coexistenceLabel || '—'}
                {bulletin.coexistenceObservation ? `. ${bulletin.coexistenceObservation}` : ''}
              </p>
            ) : null}
          </section>
        </>
      )}
    </article>
  );
}

export default function ParentBulletinsPanel({ studentId, studentName }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    getParentStudentBulletins(studentId)
      .then((response) => {
        if (!cancelled) setPayload(response.data);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError?.response?.data?.message || 'No se pudieron cargar los boletines.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) return <p className="campus-panel__meta">Cargando boletines...</p>;
  if (error) return <p className="campus-parent-bulletin__locked">{error}</p>;
  if (!payload?.carteraClear) {
    return (
      <section className="campus-parent-bulletin__locked">
        <h3>Boletines</h3>
        <p>{payload?.message || 'Los boletines se habilitan cuando la cartera está al día.'}</p>
      </section>
    );
  }
  if (!payload.bulletins?.length) {
    return (
      <section className="campus-parent-bulletin__locked">
        <h3>Boletines</h3>
        <p>Todavía no hay un boletín generado para {studentName || 'este estudiante'}.</p>
      </section>
    );
  }

  return (
    <section className="campus-parent-bulletin">
      <header>
        <h3>Boletines</h3>
        <p>Disponibles porque la cartera de {studentName || 'este estudiante'} está al día.</p>
      </header>
      {payload.bulletins.map((bulletin) => (
        <BulletinSheet
          bulletin={bulletin}
          key={bulletin.id}
          schoolName={payload.schoolName}
          student={payload.student}
        />
      ))}
    </section>
  );
}
