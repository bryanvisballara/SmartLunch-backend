function CampusLanding({ campusContext, navigation }) {
  return (
    <section className="campus-page">
      <div className="campus-panel campus-panel--intro">
        <span className="campus-panel__kicker">Estado del piloto</span>
        <h2>Fundacion de Campus lista para crecer por modulos</h2>
        <p>
          Este primer sprint deja aislado el acceso, las rutas y el shell del nuevo producto.
          Lo siguiente es habilitar cursos, materiales, tareas y vistas iniciales por actor.
        </p>
      </div>

      <div className="campus-grid campus-grid--three">
        <article className="campus-panel">
          <span className="campus-panel__kicker">Usuario</span>
          <h3>{campusContext?.user?.name || 'Usuario actual'}</h3>
          <p>
            Rol operativo actual: <strong>{campusContext?.user?.role || 'sin rol'}</strong>
          </p>
        </article>

        <article className="campus-panel">
          <span className="campus-panel__kicker">Membresias</span>
          <h3>{campusContext?.memberships?.length || 0} activas</h3>
          <p>
            Campus corre por membresias separadas para no depender del rol duro del sistema actual.
          </p>
        </article>

        <article className="campus-panel">
          <span className="campus-panel__kicker">Siguiente paso</span>
          <h3>Construir el nucleo academico</h3>
          <p>
            Cursos, materiales, tareas y Gio Estudio sobre contenido controlado por el docente.
          </p>
        </article>
      </div>

      <div className="campus-grid campus-grid--three">
        {navigation.map((item) => (
          <article className="campus-panel" key={item.path}>
            <span className="campus-panel__kicker">Ruta habilitada</span>
            <h3>{item.title}</h3>
            <p>{item.description || 'Acceso inicial del piloto Campus.'}</p>
            <p className="campus-panel__meta">{item.path}</p>
          </article>
        ))}

        <article className="campus-panel campus-panel--accent">
          <span className="campus-panel__kicker">Gio Estudio</span>
          <h3>Punto de entrada separado</h3>
          <p>
            El asistente academico quedo reservado como modulo propio para trabajar solo con
            materiales aprobados por el colegio.
          </p>
        </article>
      </div>
    </section>
  );
}

export default CampusLanding;