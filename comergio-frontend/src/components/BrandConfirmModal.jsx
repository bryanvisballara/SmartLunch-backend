import comergioLogo from '../assets/comergio.png';

function BrandConfirmModal({
  cancelLabel = 'Cancelar',
  confirmLabel = 'Eliminar',
  eyebrow = 'Confirmacion requerida',
  loading = false,
  message,
  onCancel,
  onConfirm,
  title,
}) {
  return (
    <div className="brand-confirm-modal__backdrop" role="presentation">
      <div aria-labelledby="brand-confirm-modal-title" aria-modal="true" className="brand-confirm-modal" role="dialog">
        <div className="brand-confirm-modal__brand">
          <span className="brand-confirm-modal__logo-wrap">
            <img alt="Comergio" src={comergioLogo} />
          </span>
          <span className="brand-confirm-modal__eyebrow">{eyebrow}</span>
        </div>
        <div className="brand-confirm-modal__body">
          <h2 id="brand-confirm-modal-title">{title}</h2>
          {message ? <p>{message}</p> : null}
        </div>
        <div className="brand-confirm-modal__actions">
          <button className="brand-confirm-modal__button brand-confirm-modal__button--cancel" disabled={loading} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className="brand-confirm-modal__button brand-confirm-modal__button--confirm" disabled={loading} onClick={onConfirm} type="button">
            {loading ? 'Eliminando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BrandConfirmModal;
