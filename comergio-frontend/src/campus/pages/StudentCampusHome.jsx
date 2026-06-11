function StudentCampusHome() {
  return (
    <section className="campus-page">
      <div className="campus-panel campus-panel--intro">
        <span className="campus-panel__kicker">Campus Alumno</span>
        <h2>Vista inicial para estudio, horario y seguimiento</h2>
        <p>
          Esta experiencia quedo reservada para cursos inscritos, tareas, notas, simulador de nota,
          horario, comunicados y acceso directo a Gio Estudio.
        </p>
      </div>

      <div className="campus-grid campus-grid--two">
        <article className="campus-panel">
          <h3>Base del MVP</h3>
          <ul className="campus-list">
            <li>Cursos asignados por docente</li>
            <li>Materiales y tareas por curso</li>
            <li>Notas basicas publicadas</li>
            <li>Horario semanal</li>
            <li>Feed institucional</li>
          </ul>
        </article>

        <article className="campus-panel">
          <h3>Herramientas de estudio</h3>
          <ul className="campus-list">
            <li>Resumen de material</li>
            <li>Preguntas de practica</li>
            <li>Quiz guiado</li>
            <li>Explicaciones simplificadas</li>
            <li>Estimador de nota final</li>
          </ul>
        </article>
      </div>
    </section>
  );
}

export default StudentCampusHome;