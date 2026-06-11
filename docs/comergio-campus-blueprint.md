# Comergio Campus Blueprint

## Objetivo

Convertir Comergio en una plataforma escolar integral sin romper el producto actual de cafeterias.

La estrategia inicial no es reemplazar Comergio actual, sino montar un segundo producto dentro del mismo ecosistema:

- Comergio Cafeteria: lo actual.
- Comergio Campus: experiencia academica y administrativa nueva.

Ambos comparten autenticacion, escuela, usuarios base y futura integracion de datos, pero al principio deben vivir separados en experiencia, navegacion y permisos.

## Principios de implementacion

1. No tocar los flujos productivos actuales de cafeteria.
2. Reutilizar el mismo login.
3. Crear una experiencia visual completamente distinta para Campus.
4. Construir por modulos desacoplados.
5. Empezar con un MVP pequeno y validable.
6. Unificar despues de validar, no antes.

## Vision de producto

Comergio debe evolucionar a una super app escolar donde cada actor entra a una experiencia distinta segun su contexto, pero dentro de la misma cuenta institucional.

### Actores objetivo

- Padre o acudiente
- Alumno
- Docente
- Coordinacion academica
- Rectoria
- Enfermeria
- Rutas escolares
- Cartera
- Administracion institucional
- Comunicados / secretaria academica.

### Vista futura por actor

#### Padre o acudiente

- Notas por alumno
- Tareas pendientes
- Material de estudio
- Gio Estudio por hijo
- Cafeteria y billetera escolar
- Pago de pensiones
- Pago de matriculas
- Estado de cuenta
- Facturas
- Comunicados del colegio (tipo red social con scroll down, este sera digamos el homepage)
- Enfermeria
- Transporte escolar

#### Alumno

- Horario
- Tareas
- Materiales por materia
- Notas
- simulador de notas
- Asistencia
- Gio Estudio
- Comunicados
- Cafeteria

#### Docente

- Cursos
- Estudiantes por curso
- Carga de material
- Creacion de tareas
- Registro de notas
- Observaciones
- Estadisticas de aprendizaje
- Panel de preguntas frecuentes generadas por Gio Estudio

#### Coordinacion y rectoria

- Indicadores por curso
- Indicadores por docente
- Riesgo academico
- Asistencia
- Consolidado institucional
- Alertas tempranas

#### Cartera

- Cobros por alumno
- Cobros por acudiente
- Facturacion
- Estado de cuenta
- Pensiones
- Matriculas
- Recaudo
- Seguimiento de mora
- Reportes contables

#### Enfermeria

- Eventos de salud
- Medicacion autorizada
- Alertas medicas
- Incidentes
- Contacto de acudientes
- epicrisis o historial medico

#### Rutas escolares

- rol de conductor
- Asignacion de ruta
- Paradas (cuando llegue a una parada, que notifique al siguiente en ruta que va en camino)
- Responsable del transporte
- Seguimiento operativo
- Novedades

## Estrategia de arquitectura funcional

### Regla principal

No expandir de inmediato el rol de autenticacion actual con todos los nuevos actores.

Primero debe existir una capa nueva de perfiles y permisos de Campus. Eso evita romper el sistema actual, donde el rol esta acoplado a redireccion, middleware y administracion.

### Modelo recomendado

#### Capa 1: Identidad

Usuario autenticado comun.

- username
- password
- schoolId
- datos basicos

Esta capa es la que ya existe.

#### Capa 2: Membresias y perfiles de Campus

Nueva capa para controlar a que experiencia puede entrar un usuario dentro del mundo academico.

Ejemplos:

- un usuario puede ser padre
- un usuario puede ser docente
- un usuario puede ser coordinador
- un usuario puede tener multiples perfiles si la institucion lo necesita

Esto evita que todo dependa de un solo campo `role`.

#### Capa 3: Entidades academicas

- Alumno
- Curso
- Grupo
- Materia
- Periodo academico
- Inscripcion
- Tarea
- Material
- Nota
- Asistencia
- Observacion

#### Capa 4: Modulos institucionales

- Cartera
- Enfermeria
- Transporte
- Comunicados
- Analitica institucional

## Separacion inicial de experiencias

### Comergio Cafeteria

Se mantiene como esta hoy.

### Comergio Campus

Nuevo shell, nuevo menu, nuevas rutas y nueva interfaz.

Propuesta de rutas futuras:

- `/campus`
- `/campus/parent`
- `/campus/student`
- `/campus/teacher`
- `/campus/coordination`
- `/campus/finance`
- `/campus/nursing`
- `/campus/transport`
- `/campus/study`

La entrada a estas rutas debe decidirse despues del login, pero sin modificar el comportamiento actual de cafeteria hasta que Campus este listo.

## MVP recomendado

El primer MVP no debe abarcar todos los modulos. Debe resolver el nucleo academico.

### Actores del MVP

- Docente
- Alumno
- Padre o acudiente

### Capacidades del MVP

#### Docente

- Crear cursos o grupos
- Subir material de estudio
- Crear tareas
- Publicar fechas de entrega
- Registrar notas basicas
- observaciones a los papas del alumno

#### Alumno

- Ver cursos (asignados por los profesores)
- Ver materiales (asignados por los profesores)
- Ver tareas
- Ver fechas de entrega
- Estudiar con Gio Estudio
- Ver notas
- Simulador o estimador de notas (ejemplo cuanto necesitan sacar en el examen final)
- Ver comunicados del colegio tipo red social
- Ver horarios de clase
- ver consumo de cafeteria

#### Padre o acudiente

- Ver resumen por hijo
- Ver tareas pendientes
- Ver materiales publicados
- Ver notas basicas
- ver notas de enfermeria
- ver comunicados del colegio tipo red social
- ver consumo de cafeteria y controlar todo de ela cafeteria (comergio actual)

### Lo que queda fuera del MVP

- Facturacion completa
- Contabilidad avanzada
- Enfermeria completa
- Transporte operativo en tiempo real
- Analitica institucional profunda
- Flujos complejos de aprobacion academica

## Gio Estudio

## Propuesta de valor

Gio Estudio no debe ser un chat generico. Debe ser un asistente academico guiado por contenido validado por el docente.

### Entradas de Gio Estudio

- PDFs
- Guias
- Presentaciones
- Tareas
- Enlaces aprobados
- Apuntes del docente
- Resumenes institucionales

### Funciones iniciales de Gio Estudio

1. Resumir el material por tema.
2. Explicar un concepto en lenguaje mas simple.
3. Crear preguntas de practica.
4. Crear tarjetas de estudio.
5. Generar mini quiz.
6. Preparar al alumno para examen.
7. Responder usando solamente material autorizado.

### Reglas de producto para Gio Estudio

1. Responder con citas o referencias al material origen.
2. No inventar contenido fuera de fuentes aprobadas.
3. Ajustar dificultad por grado o curso.
4. Permitir al docente activar o desactivar materiales.
5. Mostrar trazabilidad de que contenido usa el alumno.

### Paneles derivados

#### Para docente

- Temas mas consultados
- Preguntas frecuentes
- Temas con mayor confusion
- Material mas usado

#### Para padre

- Tiempo estimado de estudio
- Temas estudiados por hijo
- Tareas cercanas a vencimiento

#### Para coordinacion en fase posterior

- Cursos con mayor volumen de dudas
- Temas con mas bajo rendimiento
- Participacion por curso

## Modulos futuros despues del MVP

### Modulo Academico

- Cursos
- Materias
- Tareas
- Notas
- Asistencia
- Observaciones

### Modulo de Comunicacion

- Comunicados institucionales
- Mensajes entre colegio y acudientes
- Recordatorios de tareas
- Alertas de rendimiento

### Modulo de Cartera

- Conceptos de cobro
- Matriculas
- Pensiones
- Otros cargos
- Descuentos
- Facturas
- Estado de cuenta
- Recaudos
- Mora y seguimiento

### Modulo de Enfermeria

- Ficha medica del alumno
- Incidentes
- Medicamentos autorizados
- Llamados al acudiente
- Historial basico

### Modulo de Transporte

- Ruta asignada
- Conductor o responsable
- Paradas
- Novedades
- Confirmaciones operativas

### Modulo de Analitica

- Riesgo academico
- Rendimiento por grupo
- Rendimiento por docente
- Asistencia por periodo
- Indicadores de recaudo

## Modelo conceptual recomendado

### Nuevas entidades a crear en fase inicial

- CampusMembership
- TeacherProfile
- StudentAccount
- Course
- CourseSection
- CourseEnrollment
- StudyMaterial
- Assignment
- GradeEntry
- AcademicPeriod

### Relaciones clave

- Un usuario puede tener una o varias membresias Campus.
- Un alumno puede estar ligado a un usuario alumno.
- Un padre puede estar ligado a uno o varios alumnos.
- Un docente puede dictar varios cursos.
- Un curso puede tener muchos materiales y tareas.
- Gio Estudio consume materiales asociados a curso, tema o tarea.

## Permisos iniciales

### Padre

- Solo lectura sobre sus hijos.
- No puede editar notas, tareas ni materiales.

### Alumno

- Lectura de sus cursos, tareas, materiales y resultados.
- Uso de Gio Estudio sobre contenido habilitado.

### Docente

- Crear y editar materiales.
- Crear y editar tareas.
- Registrar notas del curso asignado.

### Coordinacion futura

- Lectura transversal.
- Analitica.
- Intervencion academica segun permisos.

## Roadmap recomendado

### Fase 0: Blueprint y base de producto

Objetivo: alinear vision, alcance y estructura.

Entregables:

- mapa de actores
- mapa de modulos
- permisos iniciales
- arquitectura de experiencias
- alcance del MVP

### Fase 1: Campus paralelo

Objetivo: crear la nueva experiencia sin tocar cafeteria.

Entregables:

- nuevo shell visual de Campus
- nuevas rutas Campus
- selector o redireccion controlada despues del login
- feature flag para habilitar Campus por escuela o usuario

### Fase 2: MVP academico

Objetivo: conectar docente, alumno y padre.

Entregables:

- cursos
- materiales
- tareas
- vista del padre por hijo
- vista del alumno
- vista del docente

### Fase 3: Gio Estudio MVP

Objetivo: estudio asistido sobre contenido del docente.

Entregables:

- resumenes
- preguntas de practica
- quiz
- chat con contenido citado

### Fase 4: Seguimiento academico

Objetivo: consolidar el valor institucional.

Entregables:

- notas
- asistencia
- observaciones
- tablero de coordinacion

### Fase 5: Cartera

Objetivo: integrar el flujo financiero escolar.

Entregables:

- conceptos de cobro
- facturacion
- estado de cuenta
- recaudo

### Fase 6: Enfermeria y transporte

Objetivo: cerrar ecosistema escolar.

Entregables:

- eventos de enfermeria
- historial basico
- rutas
- novedades operativas

## Recomendacion de arranque

El mejor inicio no es construir todas las vistas ni agregar todos los roles.

El mejor inicio es este:

1. Crear Campus como producto paralelo.
2. Definir perfiles Campus sin depender del `role` actual.
3. Construir MVP con docente, alumno y padre.
4. Lanzar Gio Estudio sobre materiales del docente.
5. Validar uso real antes de abrir cartera, enfermeria y transporte.

## Primer alcance sugerido de desarrollo

Si se empieza ya, el primer bloque tecnico debe incluir solamente:

- shell visual de Campus
- modelo de membresias Campus
- cursos
- materiales
- tareas
- dashboard de padre
- dashboard de alumno
- dashboard de docente
- punto de entrada para Gio Estudio

## Decisiones que deben mantenerse firmes

1. No fusionar de entrada Campus con cafeteria.
2. No meter todos los actores como roles duros del login al comienzo.
3. No arrancar por cartera como MVP.
4. No construir Gio Estudio como chat libre sin fuentes.
5. No alterar el parent portal actual hasta validar la nueva experiencia.

## Siguiente paso recomendado

Despues de este blueprint, el siguiente documento debe ser un plan tecnico de implementacion del MVP Campus con:

- modelos nuevos
- endpoints nuevos
- rutas frontend nuevas
- feature flags
- estrategia de redireccion post login
- orden exacto de desarrollo