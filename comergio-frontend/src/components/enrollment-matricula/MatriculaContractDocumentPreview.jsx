import { useState } from 'react';
import MillenniumEnrollmentSignatureBlock from '../MillenniumEnrollmentSignatureBlock';
import MillenniumInstitutionSignatureBlock from '../MillenniumInstitutionSignatureBlock';
import MillenniumPagareDebtorsTable from '../MillenniumPagareDebtorsTable';
import {
  buildMillenniumEnrollmentContractContext,
  canUseOfficialEnrollmentContract,
  downloadMillenniumEnrollmentContractPdf,
  downloadMillenniumPagareContractPdf,
  getEnrollmentContractDocumentTitle,
  getPagareDebtorColumns,
  millenniumSchoolCrest,
  normalizeOfficialEnrollmentContractParams,
  parseEnrollmentContractSections,
  parsePagareDocumentSections,
  renderMillenniumEnrollmentContract,
  renderMillenniumPagareContract,
  splitContractParagraphs,
  usesOfficialEnrollmentContractTemplate,
} from '../../lib/millenniumEnrollmentContracts';

function MatriculaContractDocumentPreview({
  contractParams,
  schoolId,
  schoolName,
  variant = 'contract',
  onDocumentDownloaded,
  liveSignatureImage = '',
}) {
  const resolvedSchoolName = schoolName || contractParams?.schoolName || '';
  const resolvedSchoolId = schoolId || contractParams?.schoolId || '';
  const normalizedParams = contractParams
    ? normalizeOfficialEnrollmentContractParams({
      ...contractParams,
      schoolId: resolvedSchoolId,
      schoolName: resolvedSchoolName,
    })
    : null;
  const usesOfficialTemplate = usesOfficialEnrollmentContractTemplate({
    schoolId: resolvedSchoolId,
    schoolName: resolvedSchoolName,
  });
  const canPreviewOfficial = normalizedParams && canUseOfficialEnrollmentContract(normalizedParams);
  const context = canPreviewOfficial ? buildMillenniumEnrollmentContractContext(normalizedParams) : null;
  const contractDocumentTitle = normalizedParams
    ? getEnrollmentContractDocumentTitle(normalizedParams, context)
    : 'Contrato de matrícula 2026-2027';
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const title = variant === 'contract'
    ? 'Contrato oficial de matrícula'
    : 'Pagaré y carta de instrucciones';

  const onDownload = async () => {
    if (!normalizedParams || !usesOfficialTemplate || downloading) return;

    setDownloading(true);
    setDownloadError('');

    try {
      if (variant === 'contract') {
        await downloadMillenniumEnrollmentContractPdf(normalizedParams);
      } else {
        await downloadMillenniumPagareContractPdf(normalizedParams);
      }
      onDocumentDownloaded?.();
    } catch (error) {
      setDownloadError(error?.message || 'No se pudo abrir el PDF. Intenta de nuevo.');
    } finally {
      setDownloading(false);
    }
  };

  if (!contractParams) {
    return (
      <p className="matricula-flow-note">
        El documento se generará cuando el pago quede confirmado.
      </p>
    );
  }

  return (
    <div className="matricula-flow-document-review">
      <div className="matricula-flow-document-review__head">
        <div>
          <h3>{title}</h3>
          <p>
            {variant === 'contract'
              ? 'Descarga el PDF para revisarlo. La firma se habilitará después de la descarga.'
              : 'Descarga el PDF para revisarlo. La firma se habilitará después de la descarga.'}
          </p>
        </div>
        {usesOfficialTemplate ? (
          <button
            className="matricula-flow-document-review__download"
            disabled={downloading}
            onClick={onDownload}
            type="button"
          >
            {downloading ? 'Abriendo PDF...' : 'Descargar PDF'}
          </button>
        ) : null}
      </div>
      {downloadError ? (
        <p className="matricula-flow-note matricula-flow-note--error">{downloadError}</p>
      ) : null}

      {canPreviewOfficial && context ? (
        <div className={`matricula-flow-document-preview${variant === 'pagare' ? ' matricula-flow-document-preview--pagare' : ''}`}>
          {variant === 'contract' ? (
            <>
              <header className="matricula-flow-document-preview__header">
                <img alt="" src={millenniumSchoolCrest} />
                <strong>{contractDocumentTitle}</strong>
              </header>
              <div className="matricula-flow-document-preview__body">
                {parseEnrollmentContractSections(renderMillenniumEnrollmentContract(context, normalizedParams)).flatMap((section, sectionIndex) => {
                  if (section.type === 'contractors-table') {
                    const debtorColumns = getPagareDebtorColumns({
                      father: normalizedParams?.father || {},
                      mother: normalizedParams?.mother || {},
                    });
                    return [
                      <MillenniumPagareDebtorsTable
                        debtorOne={debtorColumns.debtorOne}
                        debtorTwo={debtorColumns.debtorTwo}
                        key={`contract-contractors-${sectionIndex}`}
                        primarySignatureImage={liveSignatureImage}
                      />,
                    ];
                  }

                  if (section.type === 'institution-signature-block') {
                    return [
                      <MillenniumInstitutionSignatureBlock key={`contract-institution-${sectionIndex}`} />,
                    ];
                  }

                  if (section.type === 'signature-block') {
                    return [
                      <MillenniumEnrollmentSignatureBlock
                        context={context}
                        key={`contract-signature-${sectionIndex}`}
                        parentSignatureImage={liveSignatureImage}
                      />,
                    ];
                  }

                  return splitContractParagraphs(section.content).map((paragraph, paragraphIndex) => (
                    <p key={`contract-${sectionIndex}-${paragraphIndex}`}>{paragraph}</p>
                  ));
                })}
              </div>
            </>
          ) : (
            <div className="matricula-flow-document-preview__body matricula-flow-document-preview__body--pagare">
              {parsePagareDocumentSections(renderMillenniumPagareContract(context)).flatMap((section, sectionIndex) => {
                if (section.type === 'debtors-table') {
                  const debtorColumns = getPagareDebtorColumns({
                    father: normalizedParams?.father || {},
                    mother: normalizedParams?.mother || {},
                  });
                  return [
                    <MillenniumPagareDebtorsTable
                      debtorOne={debtorColumns.debtorOne}
                      debtorTwo={debtorColumns.debtorTwo}
                      key={`pagare-table-${sectionIndex}`}
                      primarySignatureImage={liveSignatureImage}
                    />,
                  ];
                }

                return splitContractParagraphs(section.content).map((paragraph, paragraphIndex) => (
                  <p key={`pagare-${sectionIndex}-${paragraphIndex}`}>{paragraph}</p>
                ));
              })}
            </div>
          )}
        </div>
      ) : (
        <p className="matricula-flow-note matricula-flow-note--muted">
          Completa los datos del estudiante y del acudiente para generar el contrato oficial.
        </p>
      )}
    </div>
  );
}

export default MatriculaContractDocumentPreview;
