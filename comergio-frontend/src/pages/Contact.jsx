import { Link } from 'react-router-dom';
import { LOGIN_PATH } from '../lib/authNavigation';
import './Contact.css';

function Contact() {
  return (
    <div className="contact-page">
      <div className="contact-page__grid" aria-hidden="true" />
      <div className="contact-page__glow contact-page__glow--left" aria-hidden="true" />
      <div className="contact-page__glow contact-page__glow--right" aria-hidden="true" />

      <header className="contact-page__header">
        <Link className="contact-page__logo" to="/landing">
          <img alt="Comergio" src="/logonuevo.png" />
        </Link>

        <nav aria-label="Acciones principales" className="contact-page__nav">
          <Link className="contact-page__button contact-page__button--primary" to={LOGIN_PATH}>
            Iniciar sesión
          </Link>
          <Link className="contact-page__button" to="/landing">
            Inicio
          </Link>
        </nav>
      </header>

      <main className="contact-page__main">
        <section aria-labelledby="contact-title" className="contact-page__card">
          <span className="contact-page__eyebrow">Soporte</span>
          <h1 id="contact-title">Contacto</h1>
          <p className="contact-page__lead">
            Si necesitas ayuda con Comergio, contáctanos por cualquiera de estos canales:
          </p>

          <div className="contact-page__channels">
            <a className="contact-page__channel" href="mailto:contacto@comergio.com">
              <span className="contact-page__channel-label">Email</span>
              <span className="contact-page__channel-value">contacto@comergio.com</span>
            </a>

            <a
              className="contact-page__channel"
              href="https://wa.me/573016214860"
              rel="noreferrer"
              target="_blank"
            >
              <span className="contact-page__channel-label">WhatsApp</span>
              <span className="contact-page__channel-value">+57 301 621 4860</span>
            </a>

            <div className="contact-page__channel contact-page__channel--static">
              <span className="contact-page__channel-label">Horario</span>
              <span className="contact-page__channel-value">Lunes a viernes, 7:00 a.m. - 5:00 p.m.</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Contact;
