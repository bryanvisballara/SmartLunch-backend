import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DismissibleNotice from '../../components/DismissibleNotice';
import {
  deleteCampusCoordinationMyReportCardSignature,
  getCampusCoordinationMyReportCardSignature,
  getCampusCoordinationReportCardSignaturesOverview,
  saveCampusCoordinationMyReportCardSignature,
} from '../services/campus.service';
import useAuthStore from '../../store/auth.store';
import ReportCardSignaturePad from './ReportCardSignaturePad';
import '../campus.css';

function formatScopeLabel(scope) {
  const raw = String(scope || '').trim();
  if (!raw) return 'tu nivel';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function CoordinationReportCardSignaturePanel({ className = '' }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const userRole = String(user?.role || '');
  const isCoordinationUser = userRole === 'coordination';
  const isInstitutionalViewer = ['admin', 'rectoria', 'direccion'].includes(userRole);
  const [notice, setNotice] = useState({ type: 'info', text: '' });
  const [institutionalSignatureDraft, setInstitutionalSignatureDraft] = useState('');
  const [isEditingInstitutionalSignature, setIsEditingInstitutionalSignature] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ['campus', 'coordination', 'report-card-signatures', 'overview'],
    queryFn: getCampusCoordinationReportCardSignaturesOverview,
    retry: false,
    staleTime: 20_000,
    enabled: isInstitutionalViewer,
  });

  const institutionalSignatureQuery = useQuery({
    queryKey: ['campus', 'coordination', 'me', 'report-card-signature'],
    queryFn: getCampusCoordinationMyReportCardSignature,
    retry: false,
    staleTime: 20_000,
    enabled: isCoordinationUser,
  });

  const levelLabel = institutionalSignatureQuery.data?.levelLabel
    || formatScopeLabel(institutionalSignatureQuery.data?.coordinationScope)
    || formatScopeLabel(user?.coordinationScope);

  const savedInstitutionalSignature = institutionalSignatureQuery.data?.signatureDataUrl || '';
  const showInstitutionalEditor = isEditingInstitutionalSignature || !savedInstitutionalSignature;

  const saveInstitutionalSignatureMutation = useMutation({
    mutationFn: (signatureDataUrl) => saveCampusCoordinationMyReportCardSignature({ signatureDataUrl }),
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'coordination', 'me', 'report-card-signature'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'coordination', 'report-card-signatures', 'overview'] });
      setIsEditingInstitutionalSignature(false);
      setNotice({ type: 'success', text: payload?.message || 'Firma guardada.' });
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo guardar tu firma.' });
    },
  });

  const deleteInstitutionalSignatureMutation = useMutation({
    mutationFn: deleteCampusCoordinationMyReportCardSignature,
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['campus', 'coordination', 'me', 'report-card-signature'] });
      queryClient.invalidateQueries({ queryKey: ['campus', 'coordination', 'report-card-signatures', 'overview'] });
      setInstitutionalSignatureDraft('');
      setIsEditingInstitutionalSignature(false);
      setNotice({ type: 'success', text: payload?.message || 'Firma eliminada.' });
    },
    onError: (error) => {
      setNotice({ type: 'error', text: error?.response?.data?.message || 'No se pudo eliminar tu firma.' });
    },
  });

  useEffect(() => {
    if (institutionalSignatureQuery.isLoading || isEditingInstitutionalSignature) return;
    setInstitutionalSignatureDraft(institutionalSignatureQuery.data?.signatureDataUrl || '');
  }, [
    institutionalSignatureQuery.data?.signatureDataUrl,
    institutionalSignatureQuery.isLoading,
    isEditingInstitutionalSignature,
  ]);

  const onSaveInstitutionalSignature = async () => {
    if (!institutionalSignatureDraft) {
      setNotice({ type: 'error', text: 'Dibuja tu firma antes de guardar.' });
      return;
    }
    await saveInstitutionalSignatureMutation.mutateAsync(institutionalSignatureDraft);
  };

  const rootClassName = [
    'campus-coordination__grid-panel',
    'campus-teacher__panel-surface',
    'campus-coordination__report-signatures',
    'campus-coordination__report-signatures--compact',
    className,
  ].filter(Boolean).join(' ');

  return (
    <article className={rootClassName}>
      {notice.text ? (
        <DismissibleNotice onClose={() => setNotice({ type: 'info', text: '' })} text={notice.text} type={notice.type} />
      ) : null}

      {isInstitutionalViewer ? (
        <>
          <div className="campus-teacher__panel-head">
            <div>
              <span className="campus-panel__kicker">Boletín general</span>
              <h2>Firmas por nivel educativo</h2>
            </div>
            <p className="campus-panel__meta">
              Cada coordinador guarda su firma con su usuario. En el boletín se usa la del nivel del estudiante.
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
                    <small>{level.signatureDataUrl ? 'Firma registrada' : 'Pendiente de firma'}</small>
                  </div>
                  {level.signatureDataUrl ? (
                    <div className="campus-coordination__report-signature-done">
                      <img alt="" src={level.signatureDataUrl} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {isCoordinationUser ? (
        <>
          <div className="campus-teacher__panel-head">
            <div>
              <span className="campus-panel__kicker">Boletín general</span>
              <h2>Firma de coordinación · {levelLabel}</h2>
            </div>
            <p className="campus-panel__meta">
              Aparece al pie de los boletines generales de {levelLabel}.
            </p>
          </div>

          {institutionalSignatureQuery.isLoading ? (
            <p className="campus-panel__meta">Cargando...</p>
          ) : savedInstitutionalSignature && !showInstitutionalEditor ? (
            <div className="campus-coordination__report-signature-done">
              <img alt="" src={savedInstitutionalSignature} />
              <p>{institutionalSignatureQuery.data?.signerName || 'Coordinación'}</p>
              <div className="campus-coordination__signature-actions">
                <button
                  className="campus-teacher__ghost-btn campus-teacher__action-btn--compact"
                  onClick={() => {
                    setIsEditingInstitutionalSignature(true);
                    setInstitutionalSignatureDraft(savedInstitutionalSignature);
                  }}
                  type="button"
                >
                  Cambiar firma
                </button>
                <button
                  className="campus-teacher__ghost-btn campus-teacher__action-btn--compact"
                  disabled={deleteInstitutionalSignatureMutation.isPending}
                  onClick={() => deleteInstitutionalSignatureMutation.mutate()}
                  type="button"
                >
                  {deleteInstitutionalSignatureMutation.isPending ? 'Eliminando...' : 'Eliminar firma'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <ReportCardSignaturePad
                ariaLabel={`Firma de coordinación de ${levelLabel}`}
                disabled={saveInstitutionalSignatureMutation.isPending || deleteInstitutionalSignatureMutation.isPending}
                onChange={setInstitutionalSignatureDraft}
                value={institutionalSignatureDraft}
              />
              <div className="campus-coordination__signature-actions">
                <button
                  className="campus-coordination__save-button"
                  disabled={saveInstitutionalSignatureMutation.isPending || !institutionalSignatureDraft}
                  onClick={onSaveInstitutionalSignature}
                  type="button"
                >
                  {saveInstitutionalSignatureMutation.isPending ? 'Guardando...' : 'Guardar firma'}
                </button>
                {savedInstitutionalSignature ? (
                  <button
                    className="campus-teacher__ghost-btn campus-teacher__action-btn--compact"
                    onClick={() => {
                      setIsEditingInstitutionalSignature(false);
                      setInstitutionalSignatureDraft(savedInstitutionalSignature);
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
            </>
          )}
        </>
      ) : null}
    </article>
  );
}
