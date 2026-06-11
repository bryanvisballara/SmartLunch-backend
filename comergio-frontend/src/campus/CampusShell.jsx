import { NavLink, Outlet, useLocation } from 'react-router-dom';

function CampusShell({ campusContext, navigation, routeBase = '/campus' }) {
  const location = useLocation();
  const userName = campusContext?.user?.name || campusContext?.user?.username || 'Usuario';
  const badges = campusContext?.memberships || [];
  const normalizedPathname = location.pathname !== '/' ? location.pathname.replace(/\/+$/, '') : '/';
  const isParentAppRoute = normalizedPathname === `${routeBase}/parent`;
  const isSchoolRouteAppRoute = normalizedPathname === `${routeBase}/route`;

  if (isParentAppRoute || isSchoolRouteAppRoute) {
    return (
      <div className={`campus-shell ${isParentAppRoute ? 'campus-shell--parent-app' : 'campus-shell--route-app'}`}>
        <div className={`campus-shell__content ${isParentAppRoute ? 'campus-shell__content--parent-app' : 'campus-shell__content--route-app'}`}>
          <Outlet />
        </div>
      </div>
    );
  }

  return (
    <div className="campus-shell">
      <header className="campus-shell__hero">
        <div className="campus-shell__hero-copy">
          <span className="campus-shell__eyebrow">Comergio Campus Pilot</span>
          <h1>Nuevo espacio academico sobre el mismo login</h1>
          <p>
            Campus vive en paralelo a Comergio Cafeteria. Este piloto abre la nueva experiencia
            sin modificar los flujos operativos que ya existen.
          </p>
        </div>
        <div className="campus-shell__profile-card">
          <span className="campus-shell__profile-label">Sesion activa</span>
          <strong>{userName}</strong>
          <span>{campusContext?.user?.schoolId || 'Colegio no definido'}</span>
          <div className="campus-shell__badges">
            {badges.map((membership) => (
              <span className="campus-shell__badge" key={membership.memberType}>
                {membership.title}
              </span>
            ))}
          </div>
        </div>
      </header>

      <nav aria-label="Campus navigation" className="campus-shell__nav">
        <NavLink className={({ isActive }) => `campus-shell__nav-link${isActive ? ' is-active' : ''}`} end to={routeBase}>
          Inicio
        </NavLink>
        {navigation.map((item) => (
          <NavLink
            className={({ isActive }) => `campus-shell__nav-link${isActive ? ' is-active' : ''}`}
            key={item.path}
            to={item.path}
          >
            {item.title}
          </NavLink>
        ))}
        <NavLink className={({ isActive }) => `campus-shell__nav-link${isActive ? ' is-active' : ''}`} to={`${routeBase}/study`}>
          Gio Estudio
        </NavLink>
      </nav>

      <div className="campus-shell__content">
        <Outlet />
      </div>
    </div>
  );
}

export default CampusShell;