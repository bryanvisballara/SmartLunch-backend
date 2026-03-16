import { NavLink } from 'react-router-dom';

function AppFooter() {
  return (
    <footer className="app-footer" aria-label="Footer legal y contacto">
      <div className="app-footer-links">
        <NavLink to="/privacy">Privacy Policy</NavLink>
        <span aria-hidden="true">·</span>
        <NavLink to="/contact">Contact</NavLink>
      </div>
    </footer>
  );
}

export default AppFooter;
