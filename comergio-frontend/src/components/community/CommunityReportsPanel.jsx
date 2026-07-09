import { useEffect, useMemo, useState } from 'react';
import { getCommunityReports, updateCommunityReportStatus } from '../../services/communityReport.service';
import TeEscuchamosLabel from './TeEscuchamosLabel';

const reportTypeOptions = [
  { value: '', label: 'Todos los tipos' },
  { value: 'bullying', label: 'Bullying' },
  { value: 'depression', label: 'Depresión' },
  { value: 'teacher_complaint', label: 'Docente' },
  { value: 'school_recommendation', label: 'Recomendación' },
];

const statusOptions = [
  { value: '', label: 'Todos los estados' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'reviewed', label: 'Revisados' },
  { value: 'archived', label: 'Archivados' },
];

function formatDateTime(value) {
  if (!value) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusLabel(value) {
  if (value === 'reviewed') return 'Revisado';
  if (value === 'archived') return 'Archivado';
  return 'Pendiente';
}

export default function CommunityReportsPanel({ className = '' }) {
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState({ pending: 0, reviewed: 0, archived: 0 });
  const [statusFilter, setStatusFilter] = useState('pending');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');
  const [error, setError] = useState('');

  const loadReports = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await getCommunityReports({
        status: statusFilter || undefined,
        reportType: typeFilter || undefined,
        limit: 100,
      });
      setReports(Array.isArray(response.data?.reports) ? response.data.reports : []);
      setSummary(response.data?.summary || { pending: 0, reviewed: 0, archived: 0 });
    } catch (requestError) {
      setReports([]);
      setError(requestError?.response?.data?.message || 'No se pudieron cargar los reportes comunitarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [statusFilter, typeFilter]);

  const kpis = useMemo(() => ([
    { key: 'pending', label: 'Pendientes', value: summary.pending || 0 },
    { key: 'reviewed', label: 'Revisados', value: summary.reviewed || 0 },
    { key: 'archived', label: 'Archivados', value: summary.archived || 0 },
  ]), [summary]);

  const onUpdateStatus = async (reportId, status) => {
    setUpdatingId(reportId);
    setError('');

    try {
      await updateCommunityReportStatus(reportId, status);
      await loadReports();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo actualizar el reporte.');
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <section className={`community-reports-panel${className ? ` ${className}` : ''}`}>
      <header className="community-reports-panel__hero">
        <div>
          <TeEscuchamosLabel className="community-reports-panel__kicker" />
          <h2>Reportes de acudientes y alumnos</h2>
          <p>Bullying, depresión, reportes de docentes y recomendaciones enviadas desde la app móvil.</p>
        </div>
      </header>

      <div className="community-reports-panel__kpis">
        {kpis.map((item) => (
          <article key={item.key}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="community-reports-panel__filters">
        <label>
          Estado
          <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            {statusOptions.map((option) => <option key={option.value || 'all-status'} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Tipo
          <select onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
            {reportTypeOptions.map((option) => <option key={option.value || 'all-types'} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {error ? <p className="community-reports-panel__error">{error}</p> : null}
      {loading ? <p className="community-reports-panel__empty">Cargando reportes...</p> : null}

      {!loading && reports.length === 0 ? (
        <p className="community-reports-panel__empty">No hay reportes con los filtros seleccionados.</p>
      ) : null}

      <div className="community-reports-panel__list">
        {reports.map((report) => (
          <article className={`community-reports-panel__card is-${report.status}`} key={report.id}>
            <div className="community-reports-panel__card-head">
              <div>
                <span>{report.reportTypeLabel}</span>
                <strong>{report.reporterLabel}</strong>
              </div>
              <small>{formatDateTime(report.submittedAt)}</small>
            </div>

            {report.anonymousPreferenceNote ? (
              <p className="community-reports-panel__meta community-reports-panel__meta--warn">{report.anonymousPreferenceNote}</p>
            ) : null}
            {report.studentName ? <p className="community-reports-panel__meta">Alumno vinculado: {report.studentName}</p> : null}
            {report.teacherName ? <p className="community-reports-panel__meta">Docente reportado: {report.teacherName}</p> : null}
            <p className="community-reports-panel__message">{report.message}</p>

            <footer className="community-reports-panel__card-foot">
              <span className={`community-reports-panel__status is-${report.status}`}>{statusLabel(report.status)}</span>
              <div className="community-reports-panel__actions">
                {report.status !== 'reviewed' ? (
                  <button disabled={updatingId === report.id} onClick={() => onUpdateStatus(report.id, 'reviewed')} type="button">
                    Marcar revisado
                  </button>
                ) : null}
                {report.status !== 'archived' ? (
                  <button disabled={updatingId === report.id} onClick={() => onUpdateStatus(report.id, 'archived')} type="button">
                    Archivar
                  </button>
                ) : null}
                {report.status !== 'pending' ? (
                  <button disabled={updatingId === report.id} onClick={() => onUpdateStatus(report.id, 'pending')} type="button">
                    Reabrir
                  </button>
                ) : null}
              </div>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
