# Comergio Campus MVP Technical Plan

## Objetivo tecnico

Construir un MVP academico en paralelo al producto actual de Comergio, reutilizando el login existente pero sin alterar los flujos de cafeteria, parent portal actual, POS, wallet, cierres ni administracion vigente.

## Alcance del MVP

### Incluye

- experiencia visual nueva para Campus
- acceso desde el login actual mediante una ruta separada
- perfil Campus para padre, alumno y docente
- cursos
- materiales de estudio
- tareas
- notas basicas
- observaciones docentes para acudientes
- horario basico del alumno
- comunicados institucionales tipo feed
- simulador o estimador simple de nota
- lectura de consumo de cafeteria por alumno
- lectura basica de notas o novedades de enfermeria
- vista padre por hijo
- vista alumno
- vista docente
- entrada inicial para Gio Estudio

### No incluye

- cartera completa
- asistencia completa
- enfermeria operativa completa
- transporte
- rectoria
- coordinacion avanzada
- facturacion y contabilidad
- feed social avanzado con comentarios y reacciones
- analitica avanzada de rendimiento

## Restricciones tecnicas actuales

Hoy el sistema tiene dependencias fuertes sobre el campo `role` del usuario autenticado.

Impacta por lo menos en:

- redireccion post login
- proteccion de rutas frontend
- middleware de backend
- creacion y edicion de usuarios desde administracion

Por eso el MVP no debe arrancar expandiendo el enum actual con todos los nuevos actores.

## Estrategia tecnica recomendada

### 1. Mantener el role actual intacto al inicio

El `role` actual sigue gobernando la experiencia existente.

Ejemplo inicial sugerido:

- `parent` puede tener adicionalmente acceso a Campus padre.
- `admin` puede conservar administracion actual sin entrar todavia a Campus.
- no crear aun `teacher`, `student`, `finance`, `nurse` como roles duros del login.

### 2. Crear una capa nueva: CampusMembership

Esta capa define a que experiencia de Campus puede entrar un usuario.

Ejemplo de tipos iniciales:

- `campus_parent`
- `campus_teacher`
- `campus_student`

Esto permite que un usuario existente conserve su rol operativo actual y a la vez tenga acceso al nuevo mundo academico.

### 3. Usar feature flags

Campus debe poder activarse por:

- escuela
- usuario
- tipo de membresia

Eso permite hacer rollout controlado sin afectar clientes actuales.

## Nuevos modelos sugeridos

### CampusMembership

Campos sugeridos:

- `schoolId`
- `userId`
- `memberType`
- `status`
- `permissions`
- `metadata`

Uso:

- habilitar acceso a Campus
- definir experiencia inicial
- escalar permisos mas adelante

### TeacherProfile

Campos sugeridos:

- `schoolId`
- `userId`
- `displayName`
- `employeeCode`
- `areas`
- `status`

### StudentAccount

Campos sugeridos:

- `schoolId`
- `studentId`
- `userId`
- `status`

Uso:

- ligar un estudiante existente con una credencial de acceso propia si el colegio lo requiere

### AcademicPeriod

Campos sugeridos:

- `schoolId`
- `name`
- `year`
- `term`
- `startsAt`
- `endsAt`
- `status`

### Course

Campos sugeridos:

- `schoolId`
- `name`
- `subject`
- `grade`
- `section`
- `teacherProfileId`
- `academicPeriodId`
- `status`

### ClassSchedule

Campos sugeridos:

- `schoolId`
- `courseId`
- `weekday`
- `startsAt`
- `endsAt`
- `room`
- `status`

### CourseEnrollment

Campos sugeridos:

- `schoolId`
- `courseId`
- `studentId`
- `status`

### GradeEntry

Campos sugeridos:

- `schoolId`
- `courseId`
- `studentId`
- `title`
- `category`
- `score`
- `maxScore`
- `weight`
- `periodId`
- `publishedBy`
- `status`

### TeacherObservation

Campos sugeridos:

- `schoolId`
- `studentId`
- `courseId`
- `teacherProfileId`
- `visibility`
- `message`
- `createdForUserIds`
- `status`

### StudyMaterial

Campos sugeridos:

- `schoolId`
- `courseId`
- `title`
- `description`
- `sourceType`
- `sourceUrl`
- `uploadedBy`
- `visibility`
- `status`

### CampusAnnouncement

Campos sugeridos:

- `schoolId`
- `title`
- `body`
- `audience`
- `publishedBy`
- `publishedAt`
- `status`

### Assignment

Campos sugeridos:

- `schoolId`
- `courseId`
- `title`
- `instructions`
- `dueAt`
- `publishedBy`
- `status`

### NursingNoteSnapshot

Campos sugeridos:

- `schoolId`
- `studentId`
- `sourceRecordId`
- `summary`
- `eventDate`
- `visibility`

Uso:

- exponer en Campus un resumen controlado sin construir todavia el modulo completo de enfermeria

## Primeros endpoints sugeridos

### Campus access

- `GET /api/campus/me`
- `GET /api/campus/navigation`

### Teacher

- `GET /api/campus/teacher/courses`
- `POST /api/campus/teacher/courses`
- `GET /api/campus/teacher/materials`
- `POST /api/campus/teacher/materials`
- `GET /api/campus/teacher/assignments`
- `POST /api/campus/teacher/assignments`
- `GET /api/campus/teacher/grades`
- `POST /api/campus/teacher/grades`
- `GET /api/campus/teacher/observations`
- `POST /api/campus/teacher/observations`

### Student

- `GET /api/campus/student/home`
- `GET /api/campus/student/courses`
- `GET /api/campus/student/materials`
- `GET /api/campus/student/assignments`
- `GET /api/campus/student/grades`
- `GET /api/campus/student/grade-simulator`
- `GET /api/campus/student/schedule`
- `GET /api/campus/student/announcements`
- `GET /api/campus/student/cafeteria-summary`
- `GET /api/campus/student/nursing-notes`

### Parent

- `GET /api/campus/parent/children`
- `GET /api/campus/parent/children/:studentId/summary`
- `GET /api/campus/parent/children/:studentId/materials`
- `GET /api/campus/parent/children/:studentId/assignments`
- `GET /api/campus/parent/children/:studentId/grades`
- `GET /api/campus/parent/children/:studentId/observations`
- `GET /api/campus/parent/children/:studentId/nursing-notes`
- `GET /api/campus/parent/children/:studentId/cafeteria-summary`
- `GET /api/campus/parent/announcements`

### Announcements

- `GET /api/campus/announcements`

### Schedule

- `GET /api/campus/schedule/me`

### Gio Estudio

- `POST /api/campus/study/sessions`
- `POST /api/campus/study/query`
- `GET /api/campus/study/materials/:materialId/summary`
- `GET /api/campus/study/materials/:materialId/quiz`

## Estrategia frontend

### Principio

Campus no entra dentro del layout actual de cafeteria. Debe tener shell propio.

### Nuevas areas sugeridas

- `comergio-frontend/src/campus/`
- `comergio-frontend/src/campus/pages/`
- `comergio-frontend/src/campus/components/`
- `comergio-frontend/src/campus/services/`
- `comergio-frontend/src/campus/store/`

### Nuevas rutas sugeridas

- `/campus`
- `/campus/parent`
- `/campus/parent/student/:studentId`
- `/campus/student`
- `/campus/student/grades`
- `/campus/student/schedule`
- `/campus/student/announcements`
- `/campus/teacher`
- `/campus/teacher/course/:courseId`
- `/campus/teacher/observations`
- `/campus/study`

### Vistas base sugeridas

- feed institucional para alumno y padre
- agenda o horario semanal del alumno
- vista de notas del alumno
- simulador basico de nota final
- bloque de consumo de cafeteria como integracion de lectura
- bloque de enfermeria como integracion de lectura

### Shells sugeridos

- `CampusShell`
- `ParentCampusHome`
- `StudentCampusHome`
- `TeacherCampusHome`

### Regla de UI

No reutilizar Navbar actual como contenedor principal de Campus. Se pueden reutilizar utilidades o servicios, pero la experiencia debe sentirse como producto nuevo.

## Estrategia de acceso post login

### Opcion recomendada para MVP

No cambiar de inmediato la redireccion base actual por rol.

En su lugar:

1. El usuario entra por login normal.
2. Si tiene membresia Campus habilitada, puede acceder desde un entry point nuevo.
3. Ese entry point puede ser:
   - un boton en la experiencia padre futura
   - una ruta profunda controlada
   - una redireccion por feature flag para usuarios piloto

### Regla adicional para el MVP

La redireccion automatica post login solo debe activarse para usuarios piloto con feature flag explicita. Para el resto, el login debe seguir entrando al flujo actual sin cambios.

### Beneficio

Se evita alterar el comportamiento estable de login mientras Campus madura.

## Gio Estudio MVP tecnico

### Version 1

Gio Estudio no necesita arrancar con RAG complejo de toda la institucion.

Puede empezar sobre materiales estructurados por curso.

### Flujo sugerido

1. Docente sube material.
2. Sistema normaliza y registra metadatos.
3. Se genera resumen por material.
4. Se generan preguntas y quiz.
5. Alumno consulta sobre un material puntual.

### Salidas iniciales

- resumen corto
- resumen extendido
- preguntas de practica
- flashcards
- quiz de 5 preguntas
- explicacion simplificada

### Reglas de seguridad academica

- responder solo sobre material habilitado
- registrar que curso origino la consulta
- asociar actividad al alumno y material
- evitar respuestas libres fuera del contexto del curso

## Orden exacto de desarrollo

### Bloque 1: Fundacion Campus

1. crear modelos base de Campus
2. crear middleware o helpers de acceso Campus
3. crear endpoints `campus/me` y `campus/navigation`
4. crear shell frontend de Campus
5. dejar feature flag desactivado por defecto

### Bloque 2: Vista docente

1. crear Course
2. crear StudyMaterial
3. crear Assignment
4. crear GradeEntry
5. crear TeacherObservation
6. construir dashboard docente
7. permitir publicar material, tareas, notas y observaciones

### Bloque 3: Vista alumno

1. listar cursos inscritos
2. listar materiales por curso
3. listar tareas por curso
4. listar notas basicas
5. listar horario
6. listar comunicados
7. agregar estimador de nota
8. exponer consumo de cafeteria como lectura
9. agregar acceso a Gio Estudio

### Bloque 4: Vista padre

1. listar hijos
2. resumen por hijo
3. tareas pendientes por hijo
4. materiales recientes por hijo
5. notas por hijo
6. observaciones del docente
7. feed de comunicados
8. resumen de consumo de cafeteria por hijo
9. resumen basico de enfermeria por hijo

### Bloque 5: Gio Estudio MVP

1. resumenes por material
2. preguntas de practica
3. quiz
4. panel de estudio del alumno

## Criterios de exito del MVP

### Producto

- un docente puede publicar contenido sin apoyo tecnico
- un alumno puede estudiar con ese contenido
- un padre puede revisar avance basico por hijo
- el alumno puede consultar horario, notas y comunicados
- el padre puede ver observaciones, consumo de cafeteria y novedades basicas de enfermeria

### Tecnico

- no se rompe el flujo actual de cafeteria
- login actual sigue funcionando igual
- Campus puede activarse y desactivarse por piloto
- backend nuevo queda modular y aislado

## Riesgos principales

### Riesgo 1

Intentar usar el campo `role` actual para todo.

Mitigacion:

- usar CampusMembership desde el inicio

### Riesgo 2

Querer abrir demasiados modulos en la primera fase.

Mitigacion:

- limitar MVP a docente, alumno y padre

### Riesgo 3

Hacer Gio Estudio como chat libre sin fuentes.

Mitigacion:

- restringir respuestas a materiales publicados por docente

### Riesgo 4

Mezclar visualmente Campus con cafeteria demasiado pronto.

Mitigacion:

- shell separado y rutas separadas

## Primer entregable de desarrollo recomendado

El primer sprint tecnico debe producir solamente esto:

- modelo `CampusMembership`
- endpoints `GET /api/campus/me` y `GET /api/campus/navigation`
- shell frontend de Campus
- pagina placeholder para padre, alumno y docente
- feature flag para piloto

Si ese sprint queda estable, en el siguiente se construyen cursos, materiales, tareas, notas basicas y las integraciones de lectura de comunicados, cafeteria y enfermeria.