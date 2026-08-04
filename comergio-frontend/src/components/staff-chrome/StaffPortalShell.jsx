import colibriLogo from '../../assets/colibrisinfondo.png';
import { isComergioAcademySection } from '../comergio-academy/academyNav';
import StaffComergioAcademyNav from './StaffComergioAcademyNav';
import StaffTeacherTopbar from './StaffTeacherTopbar';
import './StaffTeacherChrome.css';

export default function StaffPortalShell({
  schoolName = 'Colegio',
  portalLabel = 'Staff',
  userName = 'Usuario',
  onLogout,
  onRefresh,
  refreshDisabled = false,
  refreshLabel = 'Actualizar portal',
  navLabel = 'Menú',
  navItems = [],
  activeKey = '',
  onNavigate,
  children,
}) {
  return (
    <section className="staff-teacher-chrome__frame staff-portal-shell">
      <aside className="staff-teacher-chrome__rail" aria-label={`Navegación de ${portalLabel}`}>
        <div className="staff-teacher-chrome__rail-brand">
          <div className="staff-teacher-chrome__rail-brand-copy">
            <img alt="Comergio" className="staff-teacher-chrome__rail-brand-logo" src={colibriLogo} />
            <div>
              <strong>Comergio</strong>
              <span>Conectamos tu colegio</span>
            </div>
          </div>
        </div>

        <nav className="staff-teacher-chrome__rail-nav">
          <div className="staff-teacher-chrome__rail-group">
            <p className="staff-teacher-chrome__rail-group-label">{navLabel}</p>
            <div className="staff-teacher-chrome__nav-list">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  className={`staff-teacher-chrome__nav-item${activeKey === item.key ? ' is-active' : ''}`}
                  onClick={() => onNavigate?.(item.key)}
                  type="button"
                >
                  <span className="staff-teacher-chrome__nav-item-label">
                    {item.label}
                    {item.badge || null}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <StaffComergioAcademyNav
            activeKey={isComergioAcademySection(activeKey) ? activeKey : ''}
            onSelect={onNavigate}
          />
        </nav>

        <div className="staff-teacher-chrome__rail-school">
          <div className="staff-teacher-chrome__rail-school-main">
            <span className="staff-teacher-chrome__rail-school-icon" aria-hidden="true">
              <svg fill="none" viewBox="0 0 24 24">
                <path d="M12 3 4.5 6.5v4.2c0 4.6 3.1 8.8 7.5 10.3 4.4-1.5 7.5-5.7 7.5-10.3V6.5L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
                <path d="M9.5 12.2 11 13.7l3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
              </svg>
            </span>
            <div>
              <strong>{schoolName}</strong>
              <span>{portalLabel}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="staff-teacher-chrome__main">
        <StaffTeacherTopbar
          helperText={schoolName}
          onLogout={onLogout}
          onRefresh={onRefresh}
          portalKicker={portalLabel}
          refreshDisabled={refreshDisabled}
          refreshLabel={refreshLabel}
          userName={userName}
        />
        <div className="staff-teacher-chrome__workspace">
          {children}
        </div>
      </div>
    </section>
  );
}
