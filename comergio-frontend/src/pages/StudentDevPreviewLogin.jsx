import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ColibriBootSplash } from '../components/ColibriBootSplash';
import useAuthStore from '../store/auth.store';
import { previewStudentDevLogin } from '../services/auth.service';

function StudentDevPreviewLogin({
  schoolId = 'comergio_demo_kns8p',
  studentName = 'oliver visbal',
  redirectPath = '/student',
}) {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  useEffect(() => {
    let cancelled = false;

    previewStudentDevLogin({ schoolId, studentName })
      .then((response) => {
        if (cancelled) return;
        const payload = response.data || {};
        setAuth(payload);
        localStorage.setItem('selectedSchoolId', schoolId);
        navigate(redirectPath, { replace: true });
      })
      .catch(() => {
        if (!cancelled) {
          navigate('/', { replace: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, redirectPath, schoolId, setAuth, studentName]);

  return (
    <ColibriBootSplash
      ariaLabel="Abriendo portal del alumno"
      eyebrow="Vista previa local"
      indeterminate
      message={`Iniciando sesión de ${studentName} en Comergio Demo...`}
      title="Portal del alumno"
    />
  );
}

export default StudentDevPreviewLogin;
