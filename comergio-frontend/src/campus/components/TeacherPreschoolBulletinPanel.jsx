import { useEffect, useState } from 'react';
import { getTeacherPreschoolBulletinWorkspace } from '../../services/preschoolBulletin.service';
import HeadroomPreschoolBulletinView from './HeadroomPreschoolBulletinView';

export default function TeacherPreschoolBulletinPanel({ onNotice }) {
  const [workspace, setWorkspace] = useState(null);
  const [gradeKey, setGradeKey] = useState('');
  const [periodKey, setPeriodKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTeacherPreschoolBulletinWorkspace({
      gradeKey: gradeKey || undefined,
      periodKey: periodKey || undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setWorkspace(data);
        const nextGradeKey = data?.assignment?.gradeKey || '';
        const nextPeriodKey = periodKey || data?.periodKey || data?.periods?.[0]?.key || '';
        if (!gradeKey && nextGradeKey) setGradeKey(nextGradeKey);
        if (!periodKey && nextPeriodKey) setPeriodKey(nextPeriodKey);
      })
      .catch((error) => {
        if (!cancelled) onNotice?.({ type: 'error', text: error?.response?.data?.message || 'No se pudo cargar el boletín de preescolar.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gradeKey, periodKey, reloadKey]);

  if (loading && !workspace) {
    return <p className="campus-panel__meta">Cargando boletín de preescolar...</p>;
  }

  if (!workspace?.assignments?.length) {
    return <p className="campus-panel__meta">Todavía no tienes indicadores de preescolar asignados. Aparecen cuando rectoría, dirección o coordinación publican el modelo de tu grado.</p>;
  }

  const periodName = (workspace.periods || []).find((period) => period.key === periodKey)?.name || '';

  return (
    <article className="campus-teacher__embedded-panel">
      <header className="campus-teacher__classroom-head">
        <div>
          <span className="campus-panel__kicker">Preescolar</span>
          <h2>Calificaciones del boletín</h2>
          <p>Elige el grado, el periodo y luego el estudiante para calificar cada indicador.</p>
        </div>
      </header>

      <div className="campus-teacher__report-card-toolbar">
        <label>
          Grado
          <select value={gradeKey} onChange={(event) => setGradeKey(event.target.value)}>
            {(workspace.assignments || []).map((item) => (
              <option key={item.gradeKey} value={item.gradeKey}>{item.gradeLabel}</option>
            ))}
          </select>
        </label>
        <label>
          Periodo
          <select value={periodKey} onChange={(event) => setPeriodKey(event.target.value)}>
            {(workspace.periods || []).map((period) => (
              <option key={period.key} value={period.key}>{period.name}</option>
            ))}
          </select>
        </label>
        <span>{workspace.report?.status === 'submitted' ? 'Generado' : 'Borrador'}</span>
      </div>

      {workspace.assignment ? (
        <HeadroomPreschoolBulletinView
          bulletin={{
            gradeKey: workspace.assignment.gradeKey,
            gradeLabel: workspace.assignment.gradeLabel,
            academicPeriodKey: periodKey,
            academicPeriodLabel: periodName,
            blocks: workspace.assignment.blocks || [],
            students: workspace.students || [],
            entries: workspace.report?.entries || [],
            performanceLevels: workspace.performanceLevels || [],
          }}
          onNotice={onNotice}
          onSaved={() => setReloadKey((current) => current + 1)}
        />
      ) : (
        <p className="campus-panel__meta">Este periodo todavía no tiene indicadores asignados.</p>
      )}
    </article>
  );
}
