import ParentShellHeader from '../components/ParentShellHeader';

function Privacy() {
  return (
    <div className="legal-with-parent-header">
      <ParentShellHeader hideSubtitle />

      <div className="page-grid single legal-page">
        <section className="panel legal-panel">
          <h2>Privacy Policy</h2>
          <p>
            En Comergio protegemos los datos personales de estudiantes, padres y operadores. Usamos
            la información exclusivamente para la operación de la plataforma, seguridad de cuentas,
            trazabilidad de pagos y mejoras del servicio.
          </p>
          <p>
            Nunca vendemos información personal a terceros. Solo compartimos datos cuando es
            estrictamente necesario para procesar pagos, enviar notificaciones o cumplir obligaciones
            legales aplicables.
          </p>
          <p>
            Si necesitas actualizar o eliminar datos de tu cuenta, puedes solicitarlo por los canales
            oficiales de soporte.
          </p>
        </section>
      </div>
    </div>
  );
}

export default Privacy;
