import { useEffect, useMemo, useState } from 'react';
import BrandConfirmModal from '../BrandConfirmModal';
import {
  deleteInstitutionalDirectoryParent,
  deleteInstitutionalDirectoryStudent,
  getInstitutionalDirectory,
  updateInstitutionalDirectoryParent,
  updateInstitutionalDirectoryStudent,
} from '../../services/academicSecretary.service';
import './InstitutionalDirectoryPanel.css';

function splitName(fullName = '', firstName = '', lastName = '') {
  if (String(firstName || '').trim() || String(lastName || '').trim()) {
    return { firstName: String(firstName || '').trim(), lastName: String(lastName || '').trim() };
  }
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] || '', lastName: '' };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function formatGradeCourse(item, getGradeLabel, getCourseLabel) {
  const gradeLabel = getGradeLabel(item?.grade) || item?.grade || 'Sin grado';
  const courseLabel = getCourseLabel(item?.course, item?.grade) || item?.course || '';
  return courseLabel ? `${gradeLabel} · ${courseLabel}` : gradeLabel;
}

function emptyStudentDraft() {
  return {
    firstName: '',
    lastName: '',
    grade: '',
    course: '',
    username: '',
    password: '',
  };
}

function emptyParentDraft() {
  return {
    firstName: '',
    lastName: '',
    username: '',
    password: '',
    studentIds: [],
  };
}

export default function InstitutionalDirectoryPanel({
  courseOptionsByGrade = {},
  getCourseLabel = (value) => String(value || '').trim(),
  getGradeLabel = (value) => String(value || '').trim(),
  gradeOptions = [],
  kind = 'students',
  onCountsChange,
}) {
  const isStudents = kind === 'students';
  const [students, setStudents] = useState([]);
  const [parents, setParents] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editModal, setEditModal] = useState({ open: false, item: null, draft: emptyStudentDraft(), error: '' });
  const [deleteModal, setDeleteModal] = useState({ open: false, item: null });
  const [childQuery, setChildQuery] = useState('');

  const loadDirectory = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await getInstitutionalDirectory();
      const nextStudents = Array.isArray(response.data?.students) ? response.data.students : [];
      const nextParents = Array.isArray(response.data?.parents) ? response.data.parents : [];
      setStudents(nextStudents);
      setParents(nextParents);
      onCountsChange?.({ students: nextStudents.length, parents: nextParents.length });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo cargar el directorio institucional.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory();
  }, []);

  useEffect(() => {
    setQuery('');
    setEditModal({ open: false, item: null, draft: isStudents ? emptyStudentDraft() : emptyParentDraft(), error: '' });
    setDeleteModal({ open: false, item: null });
  }, [kind]);

  const rows = useMemo(() => {
    const source = isStudents ? students : parents;
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return source;
    }
    return source.filter((item) => {
      const haystack = [
        item.fullName,
        item.firstName,
        item.lastName,
        item.username,
        item.grade,
        item.course,
        ...(Array.isArray(item.children) ? item.children.map((child) => child.name) : []),
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [isStudents, parents, query, students]);

  const openEdit = (item) => {
    if (isStudents) {
      setEditModal({
        open: true,
        item,
        error: '',
        draft: {
          firstName: item.firstName || '',
          lastName: item.lastName || '',
          grade: item.grade || '',
          course: item.course || '',
          username: item.username || '',
          password: item.password || '',
        },
      });
      return;
    }

    setChildQuery('');
    setEditModal({
      open: true,
      item,
      error: '',
      draft: {
        firstName: item.firstName || splitName(item.fullName).firstName,
        lastName: item.lastName || splitName(item.fullName).lastName,
        username: item.username || '',
        password: item.password || '',
        studentIds: (item.children || []).map((child) => String(child.id)),
      },
    });
  };

  const closeEdit = () => {
    if (busy) return;
    setEditModal({ open: false, item: null, draft: isStudents ? emptyStudentDraft() : emptyParentDraft(), error: '' });
  };

  const onDraftChange = (field, value) => {
    setEditModal((previous) => {
      const nextDraft = { ...previous.draft, [field]: value };
      if (field === 'grade' && nextDraft.course) {
        const allowed = (courseOptionsByGrade[value] || []).map((course) => String(course.value || course.key || ''));
        if (!allowed.includes(String(nextDraft.course))) {
          nextDraft.course = allowed[0] || '';
        }
      }
      return { ...previous, draft: nextDraft, error: '' };
    });
  };

  const toggleChild = (studentId) => {
    setEditModal((previous) => {
      const selected = new Set(previous.draft.studentIds || []);
      if (selected.has(studentId)) {
        selected.delete(studentId);
      } else {
        selected.add(studentId);
      }
      return { ...previous, draft: { ...previous.draft, studentIds: Array.from(selected) }, error: '' };
    });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    const itemId = String(editModal.item?.id || '');
    if (!itemId) return;

    const firstName = String(editModal.draft.firstName || '').trim();
    const lastName = String(editModal.draft.lastName || '').trim();
    const username = String(editModal.draft.username || '').trim().toLowerCase();
    const password = String(editModal.draft.password || '');

    if (!firstName || !lastName) {
      setEditModal((previous) => ({ ...previous, error: 'Escribe el nombre y el apellido.' }));
      return;
    }
    if (!username) {
      setEditModal((previous) => ({ ...previous, error: 'Escribe el usuario de acceso.' }));
      return;
    }
    if (password && password.length < 6) {
      setEditModal((previous) => ({ ...previous, error: 'La contraseña debe tener al menos 6 caracteres.' }));
      return;
    }

    setBusy(true);
    try {
      const payload = {
        firstName,
        lastName,
        username,
      };
      if (password && password !== String(editModal.item?.password || '')) {
        payload.password = password;
      }

      if (isStudents) {
        await updateInstitutionalDirectoryStudent(itemId, {
          ...payload,
          grade: editModal.draft.grade,
          course: editModal.draft.course,
        });
      } else {
        await updateInstitutionalDirectoryParent(itemId, {
          ...payload,
          studentIds: editModal.draft.studentIds,
        });
      }
      await loadDirectory();
      setEditModal({ open: false, item: null, draft: isStudents ? emptyStudentDraft() : emptyParentDraft(), error: '' });
    } catch (requestError) {
      setEditModal((previous) => ({
        ...previous,
        error: requestError?.response?.data?.message || 'No se pudieron guardar los cambios.',
      }));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const itemId = String(deleteModal.item?.id || '');
    if (!itemId) return;
    setBusy(true);
    try {
      if (isStudents) {
        await deleteInstitutionalDirectoryStudent(itemId);
      } else {
        await deleteInstitutionalDirectoryParent(itemId);
      }
      await loadDirectory();
      setDeleteModal({ open: false, item: null });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo eliminar el registro.');
      setDeleteModal({ open: false, item: null });
    } finally {
      setBusy(false);
    }
  };

  const gradeSelectOptions = gradeOptions.map((grade) => ({
    value: grade.value || grade.key,
    label: grade.label || grade.value || grade.key,
  })).filter((grade) => grade.value);

  const courseSelectOptions = (courseOptionsByGrade[editModal.draft.grade] || []).map((course) => ({
    value: course.value || course.key,
    label: course.label || course.value || course.key,
  })).filter((course) => course.value);

  const childPickerRows = useMemo(() => {
    const needle = childQuery.trim().toLowerCase();
    return students.filter((student) => {
      if (!needle) return true;
      return `${student.fullName} ${student.grade} ${student.course}`.toLowerCase().includes(needle);
    });
  }, [childQuery, students]);

  return (
    <section className="panel rectoria-panel rectoria-directory-panel">
      <div className="rectoria-directory-panel__head">
        <div>
          <h3>{isStudents ? 'Alumnos' : 'Acudientes'}</h3>
          <p>
            {isStudents
              ? 'Consulta, edita o elimina las cuentas de acceso de los alumnos del colegio.'
              : 'Consulta, edita o elimina las cuentas de los acudientes y sus hijos relacionados.'}
          </p>
        </div>
        <strong>{rows.length}</strong>
      </div>

      <label className="rectoria-directory-search">
        Buscar
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder={isStudents ? 'Nombre, grado, usuario...' : 'Nombre, hijo, usuario...'}
          value={query}
        />
      </label>

      {error ? <p className="rectoria-directory-error">{error}</p> : null}

      <div className="rectoria-directory-table-wrap">
        {loading ? (
          <p className="rectoria-directory-empty">Cargando directorio...</p>
        ) : rows.length === 0 ? (
          <p className="rectoria-directory-empty">
            {query ? 'No hay coincidencias para esa búsqueda.' : `Todavía no hay ${isStudents ? 'alumnos' : 'acudientes'} para mostrar.`}
          </p>
        ) : (
          <table className="rectoria-directory-table">
            <thead>
              <tr>
                <th>Nombre y apellido</th>
                <th>{isStudents ? 'Grado y curso' : 'Hijos relacionados'}</th>
                <th>{isStudents ? 'Usuario del alumno' : 'Usuario de acudiente'}</th>
                <th>{isStudents ? 'Contraseña del alumno' : 'Contraseña de acudiente'}</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.fullName || `${item.firstName} ${item.lastName}`.trim() || 'Sin nombre'}</strong>
                  </td>
                  <td>
                    {isStudents
                      ? formatGradeCourse(item, getGradeLabel, getCourseLabel)
                      : ((item.children || []).map((child) => child.name).filter(Boolean).join(', ') || 'Sin hijos relacionados')}
                  </td>
                  <td><code>{item.username || 'Sin usuario'}</code></td>
                  <td><code>{item.password || 'Sin contraseña'}</code></td>
                  <td>
                    <div className="rectoria-directory-actions">
                      <button className="rectoria-user-action-btn is-edit" onClick={() => openEdit(item)} type="button">
                        Editar
                      </button>
                      <button className="rectoria-user-action-btn is-remove" onClick={() => setDeleteModal({ open: true, item })} type="button">
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editModal.open ? (
        <div className="rectoria-modal-overlay" role="dialog" aria-modal="true" aria-label={isStudents ? 'Editar alumno' : 'Editar acudiente'}>
          <div className="rectoria-modal-card rectoria-directory-modal">
            <div className="rectoria-modal-head">
              <div>
                <span className="rectoria-modal-eyebrow">Cuerpo institucional</span>
                <h3>{isStudents ? 'Editar alumno' : 'Editar acudiente'}</h3>
                <p>Actualiza los datos visibles y las credenciales de acceso.</p>
              </div>
              <button className="rectoria-modal-close" disabled={busy} onClick={closeEdit} type="button">Cerrar</button>
            </div>
            <form className="rectoria-modal-form" onSubmit={saveEdit}>
              {editModal.error ? <p className="rectoria-modal-error">{editModal.error}</p> : null}
              <div className="rectoria-directory-modal-grid">
                <label>
                  Nombre
                  <input
                    onChange={(event) => onDraftChange('firstName', event.target.value)}
                    required
                    value={editModal.draft.firstName}
                  />
                </label>
                <label>
                  Apellido
                  <input
                    onChange={(event) => onDraftChange('lastName', event.target.value)}
                    required
                    value={editModal.draft.lastName}
                  />
                </label>
                {isStudents ? (
                  <>
                    <label>
                      Grado
                      <select
                        onChange={(event) => onDraftChange('grade', event.target.value)}
                        value={editModal.draft.grade}
                      >
                        <option value="">Selecciona grado</option>
                        {gradeSelectOptions.map((grade) => (
                          <option key={grade.value} value={grade.value}>{grade.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Curso
                      <select
                        onChange={(event) => onDraftChange('course', event.target.value)}
                        value={editModal.draft.course}
                      >
                        <option value="">Selecciona curso</option>
                        {courseSelectOptions.map((course) => (
                          <option key={course.value} value={course.value}>{course.label}</option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
                <label>
                  Usuario
                  <input
                    autoComplete="username"
                    onChange={(event) => onDraftChange('username', event.target.value)}
                    required
                    value={editModal.draft.username}
                  />
                </label>
                <label>
                  Contraseña
                  <input
                    autoComplete="new-password"
                    onChange={(event) => onDraftChange('password', event.target.value)}
                    placeholder="Dejar igual para conservarla"
                    value={editModal.draft.password}
                  />
                </label>
              </div>

              {!isStudents ? (
                <div className="rectoria-directory-children">
                  <strong>Hijos relacionados</strong>
                  <input
                    onChange={(event) => setChildQuery(event.target.value)}
                    placeholder="Buscar alumno..."
                    value={childQuery}
                  />
                  <div className="rectoria-directory-children-list">
                    {childPickerRows.map((student) => {
                      const studentId = String(student.id);
                      const checked = (editModal.draft.studentIds || []).includes(studentId);
                      return (
                        <label key={studentId}>
                          <input
                            checked={checked}
                            onChange={() => toggleChild(studentId)}
                            type="checkbox"
                          />
                          <span>
                            {student.fullName}
                            <small>{formatGradeCourse(student, getGradeLabel, getCourseLabel)}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="rectoria-modal-actions">
                <button className="btn" disabled={busy} onClick={closeEdit} type="button">Cancelar</button>
                <button className="btn btn-primary" disabled={busy} type="submit">
                  {busy ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteModal.open ? (
        <BrandConfirmModal
          confirmLabel="Eliminar"
          eyebrow="Cuerpo institucional"
          loading={busy}
          message={isStudents
            ? 'Se desactivará la cuenta del alumno y dejará de aparecer en este directorio.'
            : 'Se desactivará la cuenta del acudiente. Los alumnos relacionados se conservan.'}
          onCancel={() => { if (!busy) setDeleteModal({ open: false, item: null }); }}
          onConfirm={confirmDelete}
          title={`¿Eliminar a ${deleteModal.item?.fullName || 'este registro'}?`}
        />
      ) : null}
    </section>
  );
}
