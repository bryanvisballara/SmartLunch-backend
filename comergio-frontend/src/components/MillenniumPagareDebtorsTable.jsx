const DEBTOR_FIELDS = [
  { key: 'name', label: 'Nombre' },
  { key: 'doc', label: 'C.C' },
  { key: 'address', label: 'Dirección' },
  { key: 'phoneRes', label: 'Tel. Res.' },
  { key: 'phoneOffice', label: 'Tel. Of.' },
  { key: 'mobile', label: 'Celular' },
  { key: 'email', label: 'Correo electrónico' },
];

function DebtorColumn({ debtor = {}, signatureImage = '' }) {
  return (
    <table className="pagare-debtor-column">
      <tbody>
        {DEBTOR_FIELDS.map((field, index) => (
          <tr key={field.key}>
            <th scope="row">{field.label}</th>
            <td>{debtor[field.key] || ''}</td>
            {index === 0 ? (
              <td aria-label="Espacio para huella" className="pagare-debtor-huella" rowSpan={4} />
            ) : null}
          </tr>
        ))}
        <tr className="pagare-debtor-signature-row">
          <th scope="row">Firma</th>
          <td colSpan={2}>
            {signatureImage ? (
              <img
                alt="Firma del deudor"
                className="pagare-debtor-signature-image"
                src={signatureImage}
              />
            ) : null}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function MillenniumPagareDebtorsTable({
  debtorOne = {},
  debtorTwo = {},
  heading = '',
  primarySignatureImage = '',
}) {
  return (
    <div className="pagare-debtors-block">
      {heading ? <div className="pagare-debtors-heading">{heading}</div> : null}
      <div className="pagare-debtors-columns">
        <DebtorColumn debtor={debtorOne} signatureImage={primarySignatureImage} />
        <DebtorColumn debtor={debtorTwo} />
      </div>
    </div>
  );
}

export default MillenniumPagareDebtorsTable;
