function DismissibleNotice({ text, type = 'info', onClose }) {
  if (!text) {
    return null;
  }

  return (
    <div className={`notice-banner notice-${type}`} role="status">
      <span>{text}</span>
      <button aria-label="Cerrar anuncio" className="notice-close" onClick={onClose} type="button">
        X
      </button>
    </div>
  );
}

export default DismissibleNotice;
