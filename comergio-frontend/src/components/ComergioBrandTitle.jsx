export function ComergioBrandTitle({ className = '', size = 'header' }) {
  return (
    <p
      aria-label="Comergio"
      className={`comergio-brand-title comergio-brand-title--${size}${className ? ` ${className}` : ''}`}
    >
      <span className="comergio-brand-title__comer">Comer</span>
      <span className="comergio-brand-title__gio">gio</span>
    </p>
  );
}
