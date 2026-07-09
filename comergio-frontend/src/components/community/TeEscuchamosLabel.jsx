export function TeEscuchamosHeartIcon({ className = '' }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path
        d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export default function TeEscuchamosLabel({ className = '', as: Tag = 'span' }) {
  return (
    <Tag className={`te-escuchamos-label${className ? ` ${className}` : ''}`}>
      <span>Te escuchamos</span>
      <TeEscuchamosHeartIcon className="te-escuchamos-label__icon" />
    </Tag>
  );
}
