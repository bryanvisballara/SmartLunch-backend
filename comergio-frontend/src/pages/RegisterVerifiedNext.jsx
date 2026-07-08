import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LOGIN_PATH } from '../lib/authNavigation';
import { completeRegister } from '../services/auth.service';
import colibriLogo from '../assets/colibrisinfondo.png';

function createStudentDraft() {
  return {
    firstName: '',
    lastName: '',
    grade: '',
  };
}

function RegisterField({ label, children }) {
  return (
    <label>
      <span>{label}</span>
      <div className="login-input-shell">{children}</div>
    </label>
  );
}

function RegisterVerifiedNext() {
  const navigate = useNavigate();
  const profile = useMemo(() => JSON.parse(localStorage.getItem('pendingRegistrationProfile') || 'null'), []);
  const [password, setPassword] = useState('');
  const [students, setStudents] = useState([createStudentDraft()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const onStudentChange = (index, field, value) => {
    setStudents((previous) => previous.map((student, studentIndex) => {
      if (studentIndex !== index) {
        return student;
      }

      return {
        ...student,
        [field]: value,
      };
    }));
  };

  const onAddStudent = () => {
    setStudents((previous) => [...previous, createStudentDraft()]);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setInfo('');

    if (!profile?.schoolId || !profile?.email) {
      setError('No encontramos una verificacion activa. Vuelve al registro.');
      return;
    }

    if (String(password || '').trim().length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres.');
      return;
    }

    const normalizedStudents = students.map((student) => ({
      firstName: String(student.firstName || '').trim(),
      lastName: String(student.lastName || '').trim(),
      grade: String(student.grade || '').trim(),
    }));

    if (normalizedStudents.some((student) => !student.firstName || !student.lastName || !student.grade)) {
      setError('Completa nombre, apellido y grado de cada alumno.');
      return;
    }

    setSaving(true);

    try {
      await completeRegister({
        schoolId: profile.schoolId,
        email: profile.email,
        password: String(password),
        students: normalizedStudents,
      });

      localStorage.removeItem('pendingRegistrationProfile');
      localStorage.setItem('lastParentUsername', profile.email);
      setShowSuccessModal(true);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo completar el registro.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-center login-page login-page-auth">
      <div className="login-auth-content">
        <section className="login-auth-hero" aria-label="Identidad de Comergio">
          <div className="login-auth-logo-wrap" aria-hidden="true">
            <img className="login-auth-colibri-image" src={colibriLogo} alt="" />
          </div>
          <h1 className="login-auth-brand-title">
            <span className="login-auth-brand-comer">Comer</span>
            <span className="login-auth-brand-gio login-auth-text-gradient">gio</span>
          </h1>
        </section>

        <form className="login-panel login-auth-card register-auth-card register-students-panel" onSubmit={onSubmit}>
          <div className="login-auth-card-head">
            <h2>Completa tu registro</h2>
            <p>
              Correo verificado: <strong>{profile?.email || 'no disponible'}</strong>
            </p>
          </div>

          <RegisterField label="Contrasena">
            <input
              autoComplete="new-password"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimo 6 caracteres"
              type="password"
              value={password}
            />
          </RegisterField>

          <div className="register-students-section">
            <h3>Alumnos</h3>
            {students.map((student, index) => (
              <div className="register-student-card" key={`student-${index + 1}`}>
                <p>Alumno {index + 1}</p>
                <RegisterField label="Nombre del alumno">
                  <input
                    onChange={(event) => onStudentChange(index, 'firstName', event.target.value)}
                    value={student.firstName}
                  />
                </RegisterField>
                <RegisterField label="Apellido">
                  <input
                    onChange={(event) => onStudentChange(index, 'lastName', event.target.value)}
                    value={student.lastName}
                  />
                </RegisterField>
                <RegisterField label="Grado que cursa">
                  <input
                    onChange={(event) => onStudentChange(index, 'grade', event.target.value)}
                    value={student.grade}
                  />
                </RegisterField>
              </div>
            ))}
            <button className="register-add-student-btn" onClick={onAddStudent} type="button">
              <span aria-hidden="true">+</span>
              Agregar otro alumno
            </button>
          </div>

          <DismissibleNotice text={error} type="error" onClose={() => setError('')} />
          <DismissibleNotice text={info} type="info" onClose={() => setInfo('')} />

          <button className="btn login-primary-btn" disabled={saving} type="submit">
            {saving ? 'Completando registro...' : 'Completar registro'}
          </button>

          <p className="login-register-cta">
            ¿Necesitas volver?{' '}
            <Link className="login-inline-link" to="/register">
              Regresar al inicio de registro
            </Link>
            .
          </p>
        </form>
        <div aria-hidden="true" className="login-auth-bottom-spacer" />
      </div>

      {showSuccessModal ? (
        <div className="register-verification-overlay" role="dialog" aria-modal="true" aria-label="Registro completado">
          <div className="register-verification-modal">
            <h3>Registro completado</h3>
            <p>Su registro se ha completado con exito, por favor, inicie sesion.</p>
            <div className="register-verification-actions">
              <button className="btn btn-primary" onClick={() => navigate(LOGIN_PATH)} type="button">
                Ir a iniciar sesion
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default RegisterVerifiedNext;
