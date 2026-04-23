import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sendRegisterEmailCode, verifyRegisterEmailCode } from '../services/auth.service';
import DismissibleNotice from '../components/DismissibleNotice';
import { DEFAULT_SCHOOL_ID, SCHOOL_OPTIONS } from '../lib/schools';
import smartLogo from '../assets/comergio.png';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || ''));
}

function Register() {
  const navigate = useNavigate();
  const [schoolId, setSchoolId] = useState(() => localStorage.getItem('selectedSchoolId') || DEFAULT_SCHOOL_ID);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [showVerificationPopup, setShowVerificationPopup] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (resendCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setResendCountdown((previous) => (previous > 0 ? previous - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [resendCountdown]);

  const sendCodeRequest = async () => {
    await sendRegisterEmailCode({
      schoolId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      documentNumber: documentNumber.trim(),
      email: normalizeEmail(email),
    });
  };

  const onSendCode = async (event) => {
    event.preventDefault();
    setInfo('');
    setError('');

    if (!schoolId) {
      setError('Selecciona un colegio para continuar.');
      return;
    }

    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !documentNumber.trim() || !email.trim()) {
      setError('Completa todos los campos obligatorios.');
      return;
    }

    if (String(documentNumber || '').replace(/\D/g, '').trim().length < 5) {
      setError('Ingresa un documento valido.');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Ingresa un correo electronico valido.');
      return;
    }

    setSendingCode(true);

    try {
      await sendCodeRequest();

      setInfo('Te enviamos un codigo de verificacion a tu correo electronico.');
      setShowVerificationPopup(true);
      setCode('');
      setResendCountdown(60);
      localStorage.setItem('selectedSchoolId', schoolId);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo enviar el codigo de verificacion.');
    } finally {
      setSendingCode(false);
    }
  };

  const onResendCode = async () => {
    if (resendCountdown > 0 || sendingCode) {
      return;
    }

    setSendingCode(true);
    setError('');

    try {
      await sendCodeRequest();
      setInfo('Enviamos un nuevo codigo de verificacion.');
      setResendCountdown(60);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'No se pudo reenviar el codigo.');
    } finally {
      setSendingCode(false);
    }
  };

  const onVerifyCode = async () => {
    setError('');
    setInfo('');

    if (!/^\d{6}$/.test(String(code || '').trim())) {
      setError('El codigo de verificacion debe tener 6 digitos.');
      return;
    }

    setVerifyingCode(true);

    try {
      const response = await verifyRegisterEmailCode({
        schoolId,
        email: normalizeEmail(email),
        code: String(code || '').trim(),
      });

      localStorage.setItem('pendingRegistrationProfile', JSON.stringify(response.data?.registrationProfile || {}));
      localStorage.setItem('selectedSchoolId', schoolId);
      localStorage.setItem('lastParentUsername', normalizeEmail(email));
      setShowVerificationPopup(false);
      navigate('/register/next-step');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'El codigo no coincide.');
    } finally {
      setVerifyingCode(false);
    }
  };

  return (
    <div className="page-center login-page login-page-auth">
      <form className="panel login-panel" onSubmit={onSendCode}>
        <img className="register-smartlogo" src={smartLogo} alt="Comergio" />
        <h2>Crea tu cuenta</h2>
        <label>
          Colegio
          <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">Selecciona tu colegio</option>
            {SCHOOL_OPTIONS.map((school) => (
              <option key={school.id} value={school.id}>
                {school.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nombre
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label>
          Apellido
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label>
          Numero de telefono
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          Documento
          <input
            inputMode="numeric"
            value={documentNumber}
            onChange={(e) => setDocumentNumber(e.target.value)}
          />
        </label>
        <label>
          Correo electronico (nombre de usuario)
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        <DismissibleNotice text={error} type="error" onClose={() => setError('')} />
        <DismissibleNotice text={info} type="info" onClose={() => setInfo('')} />

        <button className="btn btn-primary" disabled={sendingCode || verifyingCode} type="submit">
          {sendingCode ? 'Enviando codigo...' : 'Verificar correo electronico'}
        </button>

        <p className="login-register-cta">
          ¿Ya tienes cuenta?{' '}
          <Link className="login-inline-link" to="/login">
            Inicia sesión
          </Link>
          .
        </p>
      </form>

      {showVerificationPopup ? (
        <div className="register-verification-overlay" role="dialog" aria-modal="true" aria-label="Verifica tu correo electronico">
          <div className="register-verification-modal">
            <h3>Verifica tu correo electronico</h3>
            <p>Digita el codigo de verificacion de 6 digitos que enviamos a {normalizeEmail(email)}.</p>
            <input
              inputMode="numeric"
              maxLength={6}
              placeholder="Codigo de 6 digitos"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <button
              className="register-resend-btn"
              disabled={resendCountdown > 0 || sendingCode}
              onClick={onResendCode}
              type="button"
            >
              {resendCountdown > 0 ? `Reenviar codigo en ${resendCountdown}s` : 'Reenviar codigo'}
            </button>
            <div className="register-verification-actions">
              <button className="btn" onClick={() => setShowVerificationPopup(false)} type="button">
                Cerrar
              </button>
              <button className="btn btn-primary" disabled={verifyingCode} onClick={onVerifyCode} type="button">
                {verifyingCode ? 'Verificando...' : 'Confirmar codigo'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Register;
