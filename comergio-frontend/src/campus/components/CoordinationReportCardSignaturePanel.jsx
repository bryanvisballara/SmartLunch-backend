import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DismissibleNotice from '../../components/DismissibleNotice';
import {
  getCampusCoordinationGeneralReportCards,
  getCampusCoordinationMyReportCardSignature,
  getCampusCoordinationReportCardSignaturesOverview,
  saveCampusCoordinationGeneralReportCardSignature,
  saveCampusCoordinationMyReportCardSignature,
} from '../services/campus.service';
import useAuthStore from '../../store/auth.store';
import ReportCardSignaturePad from './ReportCardSignaturePad';
import '../campus.css';

export default function CoordinationReportCardSignaturePanel({ className = '' }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const userRole = String(user?.role || '');
  const isCoordinationUser = userRole === 'coordination';
  const isInstitutionalViewer = ['admin', 'rectoria', 'direccion'].includes(userRole);
  const [notice, setNotice] = useState({ type: 'info', text: '' });
  const [coordinationReportPeriodKey, setCoordinationReportPeriodKey] = useState('');
  const [coordinationSignatureDrafts, setCoordinationSignatureDrafts] = useState({});
  const [activeCoordinationReportId, setActiveCoordinationReportId] = useState('');
  const [institutionalSignatureDraft, setInstitutionalSignatureDraft] = useState('');

  const generalReportCardsQuery = useQuery({
    queryKey: ['campus', 'coordination', 'general-report-cards', coordinationReportPeriodKey],
    queryFn: () => getCampusCoordinationGeneralReportCards(
      coordinationReportPeriodKey ? { academicPeriodKey: coordinationReportPeriodKey } : {},
    ),
    retry: false,
    staleTime: 20_000,
    enabled: isCoordinationUser,
  });

  const overviewQuery = useQuery({
    queryKey: ['campus', 'coordination', 'report-card-signatures', 'overview'],
    queryFn: getCampusCoordinationReportCardSignaturesOverview,
    retry: false,
    staleTime: 20_000,
  });

  const institutionalSignatureQuery = useQuery({
    queryKey: ['campus', 'coordination', 'me', 'report-card-signature'],
    queryFn: getCampusCoordinationMyReportCardSignature,
    retry: false,
    staleTime: 20_000,
    enabled: isCoordinationUser,
  });

  const levelLabel = institutionalSignatureQuery.data?.levelLabel
    || institutionalSignatureQuery.data?.coordinationScope
    || 'tu nivel educativo';

  const saveInstitutionalSignatureMutation = useMutation({
    mutationFn: (signatureDataUrl) => saveCampusCoordinationMyReportCardSignature({ signatureDataUrl }),
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'coordination', 'me', 'report-card-signature'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'coordination', 'report-card-signatures', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'coordination', 'general-report-cards'] });
      setNotice({ type: 'success', text: payload?.message || 'Firma institucional guardada.' });
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo guardar tu firma institucional.' });
    },
  });

  const saveCoordinatorSignatureMutation = useMutation({
    mutationFn: ({ reportId, signatureDataUrl }) => saveCampusCoordinationGeneralReportCardSignature(reportId, { signatureDataUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'coordination', 'general-report-cards'] });
      setNotice({ type: 'success', text: 'Firma de coordinación guardada.' });
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo guardar la firma.' });
    },
  });

  const publishedGeneralReports = Array.isArray(generalReportCardsQuery.data?.reports)
    ? generalReportCardsQuery.data.reports
    : [];

  const generalReportPeriodOptions = useMemo(() => {
    const periods = new Map();
    publishedGeneralReports.forEach((report) => {
      const key = String(report.academicPeriodKey || '').trim();
      if (!key || periods.has(key)) return;
      periods.set(key, report.academicPeriodName || key);
    });
    return Array.from(periods.entries()).map(([key, name]) => ({ key, name }));
  }, [publishedGeneralReports]);

  useEffect(() => {
    if (!generalReportPeriodOptions.length) return;
    if (!coordinationReportPeriodKey || !generalReportPeriodOptions.some((period) => period.key === coordinationReportPeriodKey)) {
      setCoordinationReportPeriodKey(generalReportPeriodOptions[0].key);
    }
  }, [coordinationReportPeriodKey, generalReportPeriodOptions]);

  const filteredGeneralReports = useMemo(() => (
    coordinationReportPeriodKey
      ? publishedGeneralReports.filter((report) => report.academicPeriodKey === coordinationReportPeriodKey)
      : publishedGeneralReports
  ), [coordinationReportPeriodKey, publishedGeneralReports]);

  useEffect(() => {
    if (institutionalSignatureQuery.isLoading) return;
    setInstitutionalSignatureDraft(institutionalSignatureQuery.data?.signatureDataUrl || '');
  }, [institutionalSignatureQuery.data?.signatureDataUrl, institutionalSignatureQuery.isLoading]);

  const onSaveInstitutionalSignature = async () => {
    if (!institutionalSignatureDraft) {
      setNotice({ type: 'error', text: 'Dibuja tu firma antes de guardar.' });
      return;
    }
    await saveInstitutionalSignatureMutation.mutateAsync(institutionalSignatureDraft);
  };

  const onSaveCoordinatorSignature = async (reportId) => {
    const signatureDataUrl = coordinationSignatureDrafts[reportId]
      || filteredGeneralReports.find((report) => report.id === reportId)?.coordinatorSignatureDataUrl
      || '';
    if (!signatureDataUrl) {
      setNotice({ type: 'error', text: 'Dibuja tu firma antes de guardar.' });
      return;
    }
    await saveCoordinatorSignatureMutation.mutateAsync({ reportId, signatureDataUrl });
  };

  const rootClassName = ['campus-coordination__grid-panel', 'campus-teacher__panel-surface', 'campus-coordination__report-signatures', className]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={rootClassName}>
      {notice.text ? (
        <DismissibleNotice onClose={() => setNotice({ type: 'info', text: '' })} text={notice.text} type={notice.type} />
      ) : null}

      <div className="campus-teacher__panel-head">
        <div>
          <span className="campus-panel__kicker">Boletín general</span>
          <h2>Firmas por nivel educativo</h2>
        </div>
        <p className="campus-panel__meta">
          Cada coordinador (preescolar, primaria, secundaria) guarda su firma una vez.
          En cada boletín se usa la firma del nivel donde está el estudiante.
        </p>
      </div>

      {overviewQuery.isLoading ? (
        <p className="campus-panel__meta">Cargando niveles...</p>
      ) : null}

      {(overviewQuery.data?.levels || []).length ? (
        <div className="campus-coordination__report-signature-list campus-coordination__level-signature-overview">
          {overviewQuery.data.levels.map((level) => (
            <div className="campus-coordination__report-signature-card" key={level.levelKey}>
              <div>
                <strong>{level.levelLabel}</strong>
                <span>{level.coordinatorName || 'Sin coordinador asignado'}</span>
                <small>
                  {level.signatureDataUrl ? 'Firma registrada' : 'Pendiente: el coordinador debe firmar en su portal'}
                </small>
              </div>
              {level.signatureDataUrl ? (
                <div className="campus-coordination__report-signature-done">
                  <img alt="" src={level.signatureDataUrl} />
                  <p>{level.coordinatorName || 'Coordinación'}</p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {isCoordinationUser ? (
        <>
          <div className="campus-teacher__panel-head campus-coordination__subsection-head">
            <div>
              <h2>Mi firma · {levelLabel}</h2>
            </div>
            <p className="campus-panel__meta">
              Esta firma se imprimirá en los boletines generales de {levelLabel} (PDF e impresión).
            </p>
          </div>

          {institutionalSignatureQuery.isLoading ? (
            <p className="campus-panel__meta">Cargando firma guardada...</p>
          ) : (
            <>
              {institutionalSignatureQuery.data?.signatureDataUrl && !saveInstitutionalSignatureMutation.isPending ? (
                <div className="campus-coordination__report-signature-done">
                  <img alt="" src={institutionalSignatureQuery.data.signatureDataUrl} />
                  <p>{institutionalSignatureQuery.data.signerName || 'Coordinación'}</p>
                </div>
              ) : null}
              <ReportCardSignaturePad
                ariaLabel={`Firma de coordinación de ${levelLabel}`}
                disabled={saveInstitutionalSignatureMutation.isPending}
                onChange={setInstitutionalSignatureDraft}
                value={institutionalSignatureDraft}
              />
              <button
                className="campus-coordination__save-button"
                disabled={saveInstitutionalSignatureMutation.isPending || !institutionalSignatureDraft}
                onClick={onSaveInstitutionalSignature}
                type="button"
              >
                {saveInstitutionalSignatureMutation.isPending ? 'Guardando...' : `Guardar firma de ${levelLabel}`}
              </button>
            </>
          )}
        </>
      ) : null}

      {isInstitutionalViewer && !isCoordinationUser ? (
        <p className="campus-panel__meta">
          Cada coordinador de nivel ingresa con su usuario y guarda su firma en Configuración institucional → Firma en boletines.
        </p>
      ) : null}

      {isCoordinationUser ? (
      <>
      <div className="campus-teacher__panel-head campus-coordination__subsection-head">
        <div>
          <h2>Firmas por curso (opcional)</h2>
        </div>
        <p className="campus-panel__meta">
          Solo si necesitas una firma distinta en un boletín puntual. Si ya guardaste la firma institucional, no es obligatorio.
        </p>
      </div>

      {generalReportPeriodOptions.length ? (
        <label className="campus-coordination__field">
          <span>Periodo</span>
          <select
            onChange={(event) => setCoordinationReportPeriodKey(event.target.value)}
            value={coordinationReportPeriodKey}
          >
            {generalReportPeriodOptions.map((period) => (
              <option key={period.key} value={period.key}>{period.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      {generalReportCardsQuery.isLoading ? (
        <p className="campus-panel__meta">Cargando boletines publicados...</p>
      ) : null}

      {!generalReportCardsQuery.isLoading && !filteredGeneralReports.length ? (
        <p className="campus-panel__meta">No hay boletines generales publicados en tu alcance para este periodo.</p>
      ) : null}

      <div className="campus-coordination__report-signature-list">
        {filteredGeneralReports.map((report) => {
          const isSigned = Boolean(report.coordinatorSignatureDataUrl);
          const draftSignature = Object.prototype.hasOwnProperty.call(coordinationSignatureDrafts, report.id)
            ? coordinationSignatureDrafts[report.id]
            : (report.coordinatorSignatureDataUrl || '');
          const isActive = activeCoordinationReportId === report.id;
          return (
            <div className="campus-coordination__report-signature-card" key={report.id}>
              <div>
                <strong>{report.sectionLabel || report.sourceCourseKey}</strong>
                <span>{report.academicPeriodName || report.academicPeriodKey}</span>
                <small>Director de grupo: {report.headroomSignerName || report.headroomTeacherName || '—'}</small>
              </div>
              {isSigned && !isActive ? (
                <div className="campus-coordination__report-signature-done">
                  <img alt="" src={report.coordinatorSignatureDataUrl} />
                  <p>{report.coordinatorSignerName || 'Coordinación'}</p>
                  <button
                    className="campus-teacher__ghost-btn campus-teacher__action-btn--compact"
                    onClick={() => setActiveCoordinationReportId(report.id)}
                    type="button"
                  >
                    Volver a firmar
                  </button>
                </div>
              ) : (
                <>
                  <ReportCardSignaturePad
                    ariaLabel={`Firma de coordinación para ${report.sectionLabel || report.sourceCourseKey}`}
                    disabled={saveCoordinatorSignatureMutation.isPending}
                    onChange={(value) => setCoordinationSignatureDrafts((current) => ({ ...current, [report.id]: value }))}
                    value={draftSignature}
                  />
                  <button
                    className="campus-coordination__save-button"
                    disabled={saveCoordinatorSignatureMutation.isPending || !draftSignature}
                    onClick={() => onSaveCoordinatorSignature(report.id)}
                    type="button"
                  >
                    {saveCoordinatorSignatureMutation.isPending ? 'Guardando...' : 'Guardar firma de coordinación'}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      </>
      ) : null}
    </article>
  );
}
