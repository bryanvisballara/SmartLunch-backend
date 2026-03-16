import ParentShellHeader from '../components/ParentShellHeader';

function Contact() {
  return (
    <div className="legal-with-parent-header">
      <ParentShellHeader hideSubtitle />

      <div className="page-grid single legal-page">
        <section className="panel legal-panel">
          <h2>Contact</h2>
          <p>Si necesitas ayuda con Comergio, contáctanos por cualquiera de estos canales:</p>
          <p><strong>Email:</strong> contacto@comergio.com</p>
          <p><strong>WhatsApp:</strong> +57 3007265868</p>
          <p><strong>Horario:</strong> Lunes a viernes, 7:00 a.m. - 5:00 p.m.</p>
        </section>
      </div>
    </div>
  );
}

export default Contact;
