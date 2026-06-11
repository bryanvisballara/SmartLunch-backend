function StudyCampusHome() {
  return (
    <section className="campus-page">
      <div className="campus-panel campus-panel--intro">
        <span className="campus-panel__kicker">Gio Estudio</span>
        <h2>Asistente academico guiado por material autorizado</h2>
        <p>
          Este modulo queda preparado como entrada independiente. La siguiente fase conectara cursos,
          materiales y sesiones de estudio citadas desde el backend de Campus.
        </p>
      </div>

      <div className="campus-grid campus-grid--three">
        <article className="campus-panel">
          <h3>Entradas</h3>
          <ul className="campus-list">
            <li>PDFs y guias</li>
            <li>Presentaciones</li>
            <li>Enlaces aprobados</li>
            <li>Tareas del docente</li>
          </ul>
        </article>

        <article className="campus-panel">
          <h3>Salidas</h3>
          <ul className="campus-list">
            <li>Resumenes</li>
            <li>Flashcards</li>
            <li>Mini quiz</li>
            <li>Explicaciones por nivel</li>
          </ul>
        </article>

        <article className="campus-panel campus-panel--accent">
          <h3>Regla clave</h3>
          <p>
            Nada de chat libre. Gio Estudio debe responder sobre contenido habilitado y con trazabilidad.
          </p>
        </article>
      </div>
    </section>
  );
}

export default StudyCampusHome;