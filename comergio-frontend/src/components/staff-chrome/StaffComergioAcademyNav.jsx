import { COMERGIO_ACADEMY_CHILDREN, COMERGIO_ACADEMY_PARENT } from '../comergio-academy/academyNav';
import { AcademyNotificationBadge } from '../comergio-academy/AcademyNotificationBadge';
import { useComergioAcademyNotificationCounts } from '../comergio-academy/useComergioAcademyNotificationCounts';
import './StaffComergioAcademyNav.css';

function AcademyNavIcon({ tone }) {
  const common = {
    fill: 'none',
    viewBox: '0 0 24 24',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  };

  if (tone === 'conecta') {
    return (
      <svg {...common}>
        <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.41a5 5 0 0 0 7.07 7.07L14 18.07" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    );
  }

  if (tone === 'informa') {
    return (
      <svg {...common}>
        <path d="M12 8v5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        <circle cx="12" cy="16.5" r="0.9" fill="currentColor" />
        <path d="M5 10.5 12 4l7 6.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M4 19h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="M7 17V9.5L12 7l5 2.5V17" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M10 17v-4h4v4" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

export default function StaffComergioAcademyNav({
  activeKey = '',
  onSelect,
  counts: countsProp,
}) {
  const liveCounts = useComergioAcademyNotificationCounts(!countsProp);
  const counts = countsProp || liveCounts;

  const badgeFor = (key) => {
    if (key === 'conecta') return Number(counts.conecta || 0);
    if (key === 'informa') return Number(counts.informa || 0);
    return 0;
  };

  return (
    <div className="academy-rail">
      <p className="academy-rail__label">{COMERGIO_ACADEMY_PARENT.label}</p>
      <ul className="academy-rail__list">
        {COMERGIO_ACADEMY_CHILDREN.map((child) => {
          const isActive = activeKey === child.key
            || (child.key === 'video_tutoriales' && activeKey === COMERGIO_ACADEMY_PARENT.key);
          const count = badgeFor(child.key);
          return (
            <li className="academy-rail__item" key={child.key}>
              <button
                className={`academy-rail__btn tone-${child.tone}${isActive ? ' is-active' : ''}`}
                onClick={() => onSelect?.(child.key)}
                type="button"
              >
                <span className="academy-rail__btn-icon">
                  <AcademyNavIcon tone={child.tone} />
                </span>
                <span className="academy-rail__btn-label">
                  {child.label}
                  {count > 0 ? <AcademyNotificationBadge count={count} /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
