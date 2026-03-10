import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import {
  getBiometricLoginOptions,
  getBiometricRegistrationOptions,
  login,
  me,
  resetForgotPassword,
  sendForgotPasswordCode,
  verifyForgotPasswordCode,
  verifyBiometricLogin,
  verifyBiometricRegistration,
} from '../services/auth.service';
import useAuthStore from '../store/auth.store';
import loginLogo from '../assets/loginlogo.png';
import smartLogo from '../assets/smartlogo.png';
import DismissibleNotice from '../components/DismissibleNotice';
import { ensureParentPushNotifications } from '../lib/pushNotifications';
import { DEFAULT_SCHOOL_ID, SCHOOL_OPTIONS } from '../lib/schools';

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function canUseBiometricAuth() {
  return typeof window !== 'undefined' && window.isSecureContext && typeof window.PublicKeyCredential !== 'undefined';
}

function InputAdornment({ kind }) {
  if (kind === 'school') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 3 2 8l10 5 10-5-10-5Zm-6 8.8V15c0 2.7 2.7 4 6 4s6-1.3 6-4v-3.2l-6 3-6-3Z" fill="currentColor" />
      </svg>
    );
  }

  if (kind === 'password') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M17 10h-1V8a4 4 0 1 0-8 0v2H7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2Zm-6 0V8a2 2 0 1 1 4 0v2h-4Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z" fill="currentColor" />
    </svg>
  );
}

function Login() {
    const setupParentPushIfPossible = async () => {
      try {
        await ensureParentPushNotifications();
      } catch {
        // Push setup failures should not block login flow.
      }
    };

  const navigate = useNavigate();
  const { token, user, setAuth, setUser } = useAuthStore();
  const [selectedSchoolId, setSelectedSchoolId] = useState(() => localStorage.getItem('selectedSchoolId') || DEFAULT_SCHOOL_ID);
  const [username, setUsername] = useState(() => localStorage.getItem('lastParentUsername') || 'admin');
  const [password, setPassword] = useState('123456');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotPasswordPopup, setShowForgotPasswordPopup] = useState(false);
  const [forgotStep, setForgotStep] = useState('request');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotResetToken, setForgotResetToken] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotInfo, setForgotInfo] = useState('');
  const [forgotResendCountdown, setForgotResendCountdown] = useState(0);
  useEffect(() => {
    if (forgotResendCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setForgotResendCountdown((previous) => (previous > 0 ? previous - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [forgotResendCountdown]);

  const navigateByRole = useCallback((role) => {
    if (role === 'vendor') {
      navigate('/daily-closure');
      return;
    }

    if (role === 'merienda_operator') {
      navigate('/meriendas/operator');
      return;
    }

    if (role === 'parent') {
      navigate('/parent');
      return;
    }

    if (role === 'admin') {
      navigate('/admin');
      return;
    }

    navigate('/pos');
  }, [navigate]);

  const maybePromptEnableBiometric = async (authResponse, normalizedUsername) => {
    const role = authResponse?.user?.role;
    const biometricEnabled = Boolean(authResponse?.user?.biometricEnabled);

    if (role !== 'parent' || biometricEnabled || !canUseBiometricAuth()) {
      return;
    }

    const shouldEnable = window.confirm(
      '¿Deseas habilitar Face ID/huella para el próximo inicio de sesión en este dispositivo?'
    );

    if (!shouldEnable) {
      return;
    }

    try {
      const optionsResponse = await getBiometricRegistrationOptions();
      const registrationResponse = await startRegistration({ optionsJSON: optionsResponse.data });
      await verifyBiometricRegistration({ registrationResponse });
      window.alert('Face ID/huella habilitado correctamente para próximos inicios de sesión.');
      setAuth({
        ...authResponse,
        user: {
          ...authResponse.user,
          biometricEnabled: true,
        },
      });
      localStorage.setItem('lastParentUsername', normalizedUsername);
    } catch (requestError) {
      const message =
        requestError?.response?.data?.message ||
        requestError?.message ||
        'No se pudo habilitar Face ID/huella en este dispositivo.';
      setError(message);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    if (user?.role) {
      if (user.role === 'parent') {
        setupParentPushIfPossible();
      }
      navigateByRole(user.role);
      return;
    }

    let cancelled = false;

    const hydrateAndRedirect = async () => {
      try {
        const response = await me();
        if (cancelled) {
          return;
        }

        const profile = response.data;
        const hydratedUser = {
          id: profile._id,
          schoolId: profile.schoolId,
          name: profile.name,
          username: profile.username,
          role: profile.role,
          biometricEnabled: Boolean(profile.biometricEnabled),
          assignedStore: profile.assignedStore || null,
        };

        setUser(hydratedUser);
        if (hydratedUser.role === 'parent') {
          setupParentPushIfPossible();
        }
        navigateByRole(hydratedUser.role);
      } catch {
        // If token is invalid, user stays on login page and can authenticate again.
      }
    };

    hydrateAndRedirect();

    return () => {
      cancelled = true;
    };
  }, [token, user?.role, navigateByRole, setUser]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!selectedSchoolId) {
      setError('Selecciona un colegio para continuar.');
      return;
    }

    setLoading(true);

    try {
      const response = await login({ username, password, schoolId: selectedSchoolId });
      const authResponse = response.data;
      const normalizedUsername = normalizeUsername(username);
      setAuth(authResponse);
      localStorage.setItem('selectedSchoolId', selectedSchoolId);

      if (authResponse?.user?.role === 'parent') {
        localStorage.setItem('lastParentUsername', normalizedUsername);
        await maybePromptEnableBiometric(authResponse, normalizedUsername);
        setupParentPushIfPossible();
      }

      navigateByRole(authResponse?.user?.role);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          'No se pudo iniciar sesión. Revisa backend o credenciales.'
      );
    } finally {
      setLoading(false);
    }
  };

  const onBiometricLogin = async () => {
    setError('');
    setBiometricLoading(true);

    try {
      if (!canUseBiometricAuth()) {
        throw new Error('Este dispositivo o navegador no soporta autenticación biométrica web.');
      }

      const normalizedUsername = normalizeUsername(username) || normalizeUsername(localStorage.getItem('lastParentUsername'));
      if (!normalizedUsername) {
        throw new Error('Ingresa tu usuario para continuar con Face ID/huella.');
      }

      if (!selectedSchoolId) {
        throw new Error('Selecciona un colegio para continuar con Face ID/huella.');
      }

      const optionsResponse = await getBiometricLoginOptions({
        username: normalizedUsername,
        schoolId: selectedSchoolId,
      });
      const authenticationResponse = await startAuthentication({ optionsJSON: optionsResponse.data });
      const verifyResponse = await verifyBiometricLogin({
        username: normalizedUsername,
        schoolId: selectedSchoolId,
        authenticationResponse,
      });

      setAuth(verifyResponse.data);
      localStorage.setItem('lastParentUsername', normalizedUsername);
      localStorage.setItem('selectedSchoolId', selectedSchoolId);
      if (verifyResponse.data?.user?.role === 'parent') {
        setupParentPushIfPossible();
      }
      navigateByRole(verifyResponse.data?.user?.role);
    } catch (requestError) {
      const message =
        requestError?.response?.data?.message ||
        requestError?.message ||
        'No se pudo iniciar sesión con Face ID/huella.';
      setError(message);
    } finally {
      setBiometricLoading(false);
    }
  };

  const openForgotPasswordPopup = () => {
    setShowForgotPasswordPopup(true);
    setForgotStep('request');
    setForgotError('');
    setForgotInfo('');
    setForgotCode('');
    setForgotResetToken('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotEmail(normalizeUsername(username));
  };

  const closeForgotPasswordPopup = () => {
    setShowForgotPasswordPopup(false);
    setForgotLoading(false);
  };

  const sendForgotCodeRequest = async () => {
    return sendForgotPasswordCode({
      schoolId: selectedSchoolId,
      email: normalizeUsername(forgotEmail),
    });
  };

  const onSendForgotCode = async () => {
    setForgotError('');
    setForgotInfo('');

    if (!selectedSchoolId) {
      setForgotError('Selecciona un colegio antes de recuperar tu contrasena.');
      return;
    }

    if (!forgotEmail.trim()) {
      setForgotError('Ingresa tu correo electronico para continuar.');
      return;
    }

    setForgotLoading(true);
    try {
      const response = await sendForgotCodeRequest();
      setForgotInfo(response.data?.message || 'Si el correo existe, enviamos un codigo de recuperacion.');
      setForgotStep('verify');
      setForgotResendCountdown(60);
    } catch (requestError) {
      setForgotError(requestError?.response?.data?.message || requestError?.message || 'No se pudo enviar el codigo.');
    } finally {
      setForgotLoading(false);
    }
  };

  const onResendForgotCode = async () => {
    if (forgotResendCountdown > 0 || forgotLoading) {
      return;
    }

    setForgotLoading(true);
    setForgotError('');

    try {
      const response = await sendForgotCodeRequest();
      setForgotInfo(response.data?.message || 'Si el correo existe, enviamos un codigo de recuperacion.');
      setForgotResendCountdown(60);
    } catch (requestError) {
      setForgotError(requestError?.response?.data?.message || requestError?.message || 'No se pudo reenviar el codigo.');
    } finally {
      setForgotLoading(false);
    }
  };

  const onVerifyForgotCode = async () => {
    setForgotError('');

    if (!/^\d{6}$/.test(String(forgotCode || '').trim())) {
      setForgotError('El codigo debe tener 6 digitos.');
      return;
    }

    setForgotLoading(true);
    try {
      const response = await verifyForgotPasswordCode({
        schoolId: selectedSchoolId,
        email: normalizeUsername(forgotEmail),
        code: String(forgotCode || '').trim(),
      });
      setForgotResetToken(response.data?.resetToken || '');
      setForgotStep('reset');
      setForgotInfo('Codigo verificado. Ahora crea tu nueva contrasena.');
    } catch (requestError) {
      setForgotError(requestError?.response?.data?.message || requestError?.message || 'No se pudo verificar el codigo.');
    } finally {
      setForgotLoading(false);
    }
  };

  const onResetForgotPassword = async () => {
    setForgotError('');

    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setForgotError('La contrasena debe tener al menos 6 caracteres.');
      return;
    }

    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Las contrasenas no coinciden.');
      return;
    }

    setForgotLoading(true);
    try {
      await resetForgotPassword({
        schoolId: selectedSchoolId,
        email: normalizeUsername(forgotEmail),
        resetToken: forgotResetToken,
        newPassword: forgotNewPassword,
      });
      setForgotInfo('Contrasena actualizada correctamente. Ya puedes iniciar sesion.');
      setPassword('');
      setUsername(normalizeUsername(forgotEmail));
      setForgotStep('done');
    } catch (requestError) {
      setForgotError(requestError?.response?.data?.message || requestError?.message || 'No se pudo actualizar la contrasena.');
    } finally {
      setForgotLoading(false);
    }
  };

  const supportsBiometric = canUseBiometricAuth();

  return (
    <div className="page-center login-page login-page-auth">
      <section className="login-auth-hero" aria-label="Encabezado de login">
        <div className="login-auth-logo-wrap" aria-hidden="true">
          <img className="login-auth-logo-image" src={loginLogo} alt="SmartLunch" />
          <img className="login-auth-sublogo-image" src={smartLogo} alt="SmartLunch" />
        </div>
      </section>

      <form className="login-panel login-auth-card" onSubmit={onSubmit}>
        <div className="login-auth-card-head">
          <h2>Bienvenido,</h2>
          <p>Administra el consumo escolar de forma simple y segura.</p>
        </div>

        <label>
          <span>Colegio</span>
          <div className="login-input-shell">
            <span className="login-input-icon"><InputAdornment kind="school" /></span>
            <select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>
              <option value="">Selecciona tu colegio</option>
              {SCHOOL_OPTIONS.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.label}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label>
          <span>Usuario</span>
          <div className="login-input-shell">
            <span className="login-input-icon"><InputAdornment kind="username" /></span>
            <input placeholder="Tu usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        </label>

        <label>
          <span>Password</span>
          <div className="password-field login-input-shell">
            <span className="login-input-icon"><InputAdornment kind="password" /></span>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
              type="button"
            >
              <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M2 12C3.8 8.5 7.2 6 12 6C16.8 6 20.2 8.5 22 12C20.2 15.5 16.8 18 12 18C7.2 18 3.8 15.5 2 12Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>
          </div>
        </label>

        <button className="login-inline-link login-inline-link-button" onClick={openForgotPasswordPopup} type="button">
          ¿Olvidaste tu contraseña?
        </button>

        <div className={`login-actions-row${supportsBiometric ? ' has-biometric' : ''}`}>
          <button className="btn btn-primary login-primary-btn" disabled={loading || biometricLoading} type="submit">
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          {supportsBiometric ? (
            <button
              className="btn login-biometric-btn login-biometric-outline"
              disabled={loading || biometricLoading}
              onClick={onBiometricLogin}
              aria-label={biometricLoading ? 'Validando biometria' : 'Entrar con Face ID o huella'}
              title={biometricLoading ? 'Validando...' : 'Entrar con Face ID / Huella'}
              type="button"
            >
              {biometricLoading ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" className="login-biometric-icon-spin">
                  <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="30 18" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
                  <path d="M8 3.8A2.8 2.8 0 0 0 5.2 6.6v2.1M16 3.8a2.8 2.8 0 0 1 2.8 2.8v2.1M8 20.2a2.8 2.8 0 0 1-2.8-2.8v-2.1M16 20.2a2.8 2.8 0 0 0 2.8-2.8v-2.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <circle cx="9" cy="10" r="1.1" fill="currentColor" />
                  <circle cx="15" cy="10" r="1.1" fill="currentColor" />
                  <path d="M9 15c.9.9 1.8 1.3 3 1.3s2.1-.4 3-1.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
            </button>
          ) : null}
        </div>

        <DismissibleNotice text={error} type="error" onClose={() => setError('')} />

        <p className="login-register-cta">
          ¿Aún no estás registrado?{' '}
          <Link className="login-inline-link" to="/register">
            Crea una cuenta ahora
          </Link>
          .
        </p>

      </form>

      <p className="login-meta-links" aria-label="Informacion legal">
        <span>Privacy</span>
        <span aria-hidden="true"> | </span>
        <span>Contact</span>
      </p>

      {showForgotPasswordPopup ? (
        <div className="register-verification-overlay" role="dialog" aria-modal="true" aria-label="Recuperar contrasena">
          <div className="register-verification-modal">
            <h3>Recuperar contrasena</h3>

            {forgotStep === 'request' ? (
              <>
                <p>Ingresa tu correo. Te enviaremos un codigo para cambiar tu contrasena.</p>
                <input
                  placeholder="Correo electronico"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
                <p className="login-register-cta">El codigo que enviaremos expira en 15 minutos.</p>
              </>
            ) : null}

            {forgotStep === 'verify' ? (
              <>
                <p>Revisa tu correo e ingresa el codigo de verificacion.</p>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Codigo de 6 digitos"
                  value={forgotCode}
                  onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
                <button
                  className="register-resend-btn"
                  disabled={forgotResendCountdown > 0 || forgotLoading}
                  onClick={onResendForgotCode}
                  type="button"
                >
                  {forgotResendCountdown > 0 ? `Reenviar codigo en ${forgotResendCountdown}s` : 'Reenviar codigo'}
                </button>
              </>
            ) : null}

            {forgotStep === 'reset' ? (
              <>
                <p>Escribe tu nueva contrasena.</p>
                <input
                  placeholder="Nueva contrasena"
                  type="password"
                  value={forgotNewPassword}
                  onChange={(e) => setForgotNewPassword(e.target.value)}
                />
                <input
                  placeholder="Confirmar nueva contrasena"
                  type="password"
                  value={forgotConfirmPassword}
                  onChange={(e) => setForgotConfirmPassword(e.target.value)}
                />
              </>
            ) : null}

            {forgotStep === 'done' ? <p>{forgotInfo}</p> : null}

            <DismissibleNotice text={forgotError} type="error" onClose={() => setForgotError('')} />
            {forgotStep !== 'done' ? (
              <DismissibleNotice text={forgotInfo} type="info" onClose={() => setForgotInfo('')} />
            ) : null}

            <div className="register-verification-actions">
              <button className="btn" onClick={closeForgotPasswordPopup} type="button">
                {forgotStep === 'done' ? 'Cerrar' : 'Cancelar'}
              </button>

              {forgotStep === 'request' ? (
                <button className="btn btn-primary" disabled={forgotLoading} onClick={onSendForgotCode} type="button">
                  {forgotLoading ? 'Enviando...' : 'Enviar codigo'}
                </button>
              ) : null}

              {forgotStep === 'verify' ? (
                <button className="btn btn-primary" disabled={forgotLoading} onClick={onVerifyForgotCode} type="button">
                  {forgotLoading ? 'Verificando...' : 'Verificar codigo'}
                </button>
              ) : null}

              {forgotStep === 'reset' ? (
                <button className="btn btn-primary" disabled={forgotLoading} onClick={onResetForgotPassword} type="button">
                  {forgotLoading ? 'Guardando...' : 'Guardar contrasena'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Login;
