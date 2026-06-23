import MillenniumEnrollmentSignatureBlock from '../MillenniumEnrollmentSignatureBlock';
import MillenniumPagareDebtorsTable from '../MillenniumPagareDebtorsTable';
import {
  buildMillenniumEnrollmentContractContext,
  canUseOfficialEnrollmentContract,
  downloadMillenniumEnrollmentContractPdf,
  downloadMillenniumPagareContractPdf,
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

  const title = variant === 'contract'
    ? 'Contrato oficial de matrícula'
    : 'Pagaré y carta de instrucciones';

  const onDownload = () => {
    if (!normalizedParams || !usesOfficialTemplate) return;

    if (variant === 'contract') {
      downloadMillenniumEnrollmentContractPdf(normalizedParams);
    } else {
      downloadMillenniumPagareContractPdf(normalizedParams);
    }
    onDocumentDownloaded?.();
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
          <button className="matricula-flow-document-review__download" onClick={onDownload} type="button">
            Descargar PDF
          </button>
        ) : null}
      </div>

      {canPreviewOfficial && context ? (
        <div className={`matricula-flow-document-preview${variant === 'pagare' ? ' matricula-flow-document-preview--pagare' : ''}`}>
          {variant === 'contract' ? (
            <>
              <header className="matricula-flow-document-preview__header">
                <img alt="" src={millenniumSchoolCrest} />
                <strong>Contrato de matrícula 2026-2027</strong>
              </header>
              <div className="matricula-flow-document-preview__body">
                {parseEnrollmentContractSections(renderMillenniumEnrollmentContract(context)).flatMap((section, sectionIndex) => {
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
