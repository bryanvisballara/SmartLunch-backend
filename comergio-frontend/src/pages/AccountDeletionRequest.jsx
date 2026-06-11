import ParentShellHeader from '../components/ParentShellHeader';

function AccountDeletionRequest() {
  return (
    <div className="legal-with-parent-header">
      <ParentShellHeader hideSubtitle />

      <div className="page-grid single legal-page">
        <section className="panel legal-panel">
          <h2>Solicitud de eliminación de cuenta</h2>
          <p>
            Los usuarios de Comergio pueden solicitar la eliminación de su cuenta y de los datos asociados directamente desde la app.
          </p>
          <p>
            Ruta en la app: Portal de acudiente {'>'} menú de perfil {'>'} Eliminar cuenta.
          </p>
          <p>
            El proceso solicita la contraseña actual para confirmar la identidad del titular y ejecutar la eliminación.
          </p>
          <p>
            Si no puedes ingresar a la app, también puedes pedir la eliminación escribiendo a <strong>contacto@comergio.com</strong> o por WhatsApp al <strong>+57 3007265868</strong>.
          </p>
          <p>
            Al procesar la solicitud, Comergio desactiva el acceso de la cuenta y elimina o inhabilita la información operativa asociada, salvo los datos que deban conservarse temporalmente por obligaciones legales, contables o de trazabilidad de pagos.
          </p>
        </section>
      </div>
    </div>
  );
}

export default AccountDeletionRequest;