function DismissibleNotice({ text, type = 'info', onClose, variant = 'banner' }) {
  if (!text) {
    return null;
  }

  if (variant === 'modal') {
    return (
      <div className="notice-modal-backdrop" role="presentation">
        <div
          aria-live="polite"
          className={`notice-modal notice-modal-${type}`}
          role="alertdialog"
        >
          <p>{text}</p>
          {typeof onClose === 'function' ? (
            <button aria-label="Cerrar anuncio" className="notice-modal__close" onClick={onClose} type="button">
              Entendido
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`notice-banner notice-${type}`} role="status">
      <span>{text}</span>
      {typeof onClose === 'function' ? (
        <button aria-label="Cerrar anuncio" className="notice-close" onClick={onClose} type="button">
          X
        </button>
      ) : null}
    </div>
  );
}

export default DismissibleNotice;
