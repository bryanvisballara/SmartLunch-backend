function MillenniumEnrollmentSignatureBlock({ context = {} }) {
  return (
    <div className="enrollment-signature-block">
      <div className="enrollment-signature-block__column">
        <strong>{context.FINANCIAL_RESPONSIBLE_NAME_UPPER || '________________'}</strong>
        <span>
          {context.FINANCIAL_RESPONSIBLE_DOC_TYPE || 'CC'}
          .
          {' '}
          {context.FINANCIAL_RESPONSIBLE_DOC_NUMBER || '____________'}
          {' '}
          de
          {' '}
          {context.FINANCIAL_RESPONSIBLE_DOC_CITY || '____________'}
        </span>
        <div aria-hidden="true" className="enrollment-signature-block__line" />
        <small>Firma responsable económico</small>
      </div>
      <div className="enrollment-signature-block__column">
        <strong>LUISA FERNANDA BENNEDETTI LARA</strong>
        <span>CC. 1.045.734.045 de Barranquilla</span>
        <span>Representante Legal</span>
        <span>MILLENNIUM SCHOOL</span>
        <div aria-hidden="true" className="enrollment-signature-block__line" />
        <small>Firma institución</small>
      </div>
    </div>
  );
}

export default MillenniumEnrollmentSignatureBlock;
