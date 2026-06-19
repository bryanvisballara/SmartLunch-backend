import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import {
  getBiometricLoginOptions,
  getBiometricRegistrationOptions,
  getSchoolOptions,
  login,
  me,
  resetForgotPassword,
  sendForgotPasswordCode,
  verifyForgotPasswordCode,
  verifyBiometricLogin,
  verifyBiometricRegistration,
} from '../services/auth.service';
import loginLogo from '../assets/logonuevo.png';
import useAuthStore from '../store/auth.store';
import DismissibleNotice from '../components/DismissibleNotice';
import { ensurePortalPushNotifications } from '../lib/pushNotifications';
import { consumePostLoginRedirect } from '../lib/postLoginRedirect';
import { SCHOOL_OPTIONS, DEFAULT_SCHOOL_ID, getSchoolOptionsByCountry, normalizeSchoolOptions, rememberSchoolOptions } from '../lib/schools';

const DEV_DIRECT_LOGIN_PROFILES = {
  'laura-medina': {
    schoolId: 'comergio-demo',
    username: 'laura.medina',
    password: 'Campus2026!',
    redirectPath: '/campus/teacher',
  },
  'rectoria': {
    schoolId: 'Millennium School',
    username: 'millennium.rector',
    password: 'Millennium2026!',
    redirectPath: '/rectoria',
  },
  'coordinacion-preescolar': {
    schoolId: 'comergio_demo_kns8p',
    username: 'coordinacion.preescolar',
    password: 'Comergio2026!',
    redirectPath: '/coordinacion',
  },
};

const INSTITUTIONAL_PLACEHOLDER_ROLES = ['coordination', 'nursing', 'psychology', 'human_resources'];
const COUNTRY_OPTIONS = [
  { id: 'CO', label: 'Colombia' },
  { id: 'MX', label: 'Mexico' },
];

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function canUseBiometricAuth() {
  return typeof window !== 'undefined' && window.isSecureContext && typeof window.PublicKeyCredential !== 'undefined';
}

function InputAdornment({ kind }) {
  if (kind === 'country') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.5 9h-3.1a15.6 15.6 0 0 0-1-5 8.1 8.1 0 0 1 4.1 5ZM12 4.1c.7 1 1.3 3.4 1.5 6.9h-3c.2-3.5.8-5.9 1.5-6.9ZM4.3 13h3.3c.1 1.9.4 3.7.9 5a8 8 0 0 1-4.2-5Zm3.3-2H4.3a8 8 0 0 1 4.2-5 18 18 0 0 0-.9 5Zm4.4 8.9c-.7-1-1.3-3.4-1.5-6.9h3c-.2 3.5-.8 5.9-1.5 6.9Zm3.5-1.9c.5-1.3.8-3.1.9-5h3.3a8 8 0 0 1-4.2 5Z" fill="currentColor" />
      </svg>
    );
  }

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

function Login({ devDirectProfile = '', postLoginPath = '' }) {
  const isNativeAndroid = Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();
  const directLoginProfile = import.meta.env.DEV
    ? DEV_DIRECT_LOGIN_PROFILES[String(devDirectProfile || '').trim()] || null
    : null;

    const setupPushIfPossible = async () => {
      try {
        const result = await ensurePortalPushNotifications();
        if (!result?.enabled) {
          console.warn('[PUSH_SETUP_DISABLED]', result?.reason || 'unknown');
          return;
        }

        console.info('[PUSH_SETUP_OK]', result?.tokenSource || 'unknown');
      } catch (error) {
        console.error('[PUSH_SETUP_ERROR]', error?.message || 'unknown');
        // Push setup failures should not block login flow.
      }
    };

  const navigate = useNavigate();
  const { token, user, setAuth, setUser } = useAuthStore();
  const [schoolOptions, setSchoolOptions] = useState(() => normalizeSchoolOptions(SCHOOL_OPTIONS));
  const [selectedCountry, setSelectedCountry] = useState(() => localStorage.getItem('selectedCountry') || COUNTRY_OPTIONS[0].id);
  const [selectedSchoolId, setSelectedSchoolId] = useState(() => (
    localStorage.getItem('selectedSchoolId') || DEFAULT_SCHOOL_ID
  ));
  const [schoolSearch, setSchoolSearch] = useState('');
  const [isCountryPickerOpen, setIsCountryPickerOpen] = useState(false);
  const [isSchoolPickerOpen, setIsSchoolPickerOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
  const hasUserTypedRef = useRef(false);
  const directLoginAttemptedRef = useRef(false);
  const schoolPickerRef = useRef(null);
  const countryPickerRef = useRef(null);

  const selectedCountryOption = useMemo(() => (
    COUNTRY_OPTIONS.find((country) => country.id === selectedCountry) || COUNTRY_OPTIONS[0]
  ), [selectedCountry]);

  const countrySchoolOptions = useMemo(() => (
    getSchoolOptionsByCountry(schoolOptions, selectedCountry)
  ), [schoolOptions, selectedCountry]);

  const selectedSchool = useMemo(() => (
    countrySchoolOptions.find((school) => school.id === selectedSchoolId) || null
  ), [countrySchoolOptions, selectedSchoolId]);

  const filteredSchoolOptions = useMemo(() => {
    const query = normalizeSearchText(schoolSearch);
    if (!query) {
      return countrySchoolOptions;
    }

    return countrySchoolOptions.filter((school) => (
      normalizeSearchText(`${school.label} ${school.id}`).includes(query)
    ));
  }, [countrySchoolOptions, schoolSearch]);

  useEffect(() => {
    document.documentElement.classList.add('login-route-active');
    document.body.classList.add('login-route-active');

    return () => {
      document.documentElement.classList.remove('login-route-active');
      document.body.classList.remove('login-route-active');
    };
  }, []);

  useEffect(() => {
    setSchoolSearch(selectedSchool?.label || '');
  }, [selectedSchool?.label]);

  useEffect(() => {
    localStorage.setItem('selectedCountry', selectedCountry);
  }, [selectedCountry]);

  useEffect(() => {
    if (!isCountryPickerOpen || typeof document === 'undefined') {
      return undefined;
    }

    const onPointerDown = (event) => {
      if (!countryPickerRef.current?.contains(event.target)) {
        setIsCountryPickerOpen(false);
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isCountryPickerOpen]);

  useEffect(() => {
    if (!isSchoolPickerOpen || typeof document === 'undefined') {
      return undefined;
    }

    const onPointerDown = (event) => {
      if (!schoolPickerRef.current?.contains(event.target)) {
        setIsSchoolPickerOpen(false);
        setSchoolSearch(selectedSchool?.label || '');
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isSchoolPickerOpen, selectedSchool?.label]);

  useEffect(() => {
    let cancelled = false;

    getSchoolOptions()
      .then((response) => {
        if (cancelled) {
          return;
        }

        const fetchedSchoolOptions = normalizeSchoolOptions(response.data?.schools || []);
        const nextSchoolOptions = rememberSchoolOptions(fetchedSchoolOptions.length ? fetchedSchoolOptions : SCHOOL_OPTIONS);
        setSchoolOptions(nextSchoolOptions);
        setSelectedSchoolId((currentSchoolId) => {
          if (currentSchoolId && nextSchoolOptions.some((school) => school.id === currentSchoolId)) {
            return currentSchoolId;
          }

          return '';
        });
      })
      .catch(() => {
        if (!cancelled) {
          setSchoolOptions(normalizeSchoolOptions(SCHOOL_OPTIONS));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const clearIfUntouched = () => {
      if (hasUserTypedRef.current) {
        return;
      }

      setUsername('');
      setPassword('');
    };

    clearIfUntouched();
    const immediateClearTimer = setTimeout(clearIfUntouched, 120);
    const delayedClearTimer = setTimeout(clearIfUntouched, 900);

    return () => {
      clearTimeout(immediateClearTimer);
      clearTimeout(delayedClearTimer);
    };
  }, []);

  const markUserInteraction = () => {
    hasUserTypedRef.current = true;
  };

  const blurActiveLoginControl = () => {
    if (typeof document === 'undefined') return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  };

  const selectCountryOption = (countryId) => {
    if (countryId !== selectedCountry) {
      setSelectedCountry(countryId);
      setSelectedSchoolId('');
      setSchoolSearch('');
      localStorage.removeItem('selectedSchoolId');
    }

    setIsCountryPickerOpen(false);
    blurActiveLoginControl();
  };

  const selectSchoolOption = (school) => {
    setSelectedSchoolId(school.id);
    setSchoolSearch(school.label);
    setIsSchoolPickerOpen(false);
    blurActiveLoginControl();
  };

  useEffect(() => {
    if (forgotResendCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setForgotResendCountdown((previous) => (previous > 0 ? previous - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [forgotResendCountdown]);

  const navigateByRole = useCallback((role, preferredPath = '') => {
    const pendingPath = consumePostLoginRedirect();
    const targetPath = String(preferredPath || '').trim() || pendingPath;
    if (targetPath) {
      navigate(targetPath, { replace: true });
      return;
    }

    if (role === 'vendor') {
      navigate('/daily-closure', { replace: true });
      return;
    }

    if (role === 'merienda_operator') {
      navigate('/meriendas/operator', { replace: true });
      return;
    }

    if (role === 'parent') {
      navigate('/parent', { replace: true });
      return;
    }

    if (role === 'admin') {
      navigate('/admin', { replace: true });
      return;
    }

    if (role === 'super_admin') {
      navigate('/super-admin', { replace: true });
      return;
    }

    if (role === 'rectoria') {
      navigate('/rectoria', { replace: true });
      return;
    }

    if (role === 'coordination') {
      navigate('/coordinacion', { replace: true });
      return;
    }

    if (role === 'direccion') {
      navigate('/direccion', { replace: true });
      return;
    }

    if (role === 'academic_secretary' || role === 'billing') {
      navigate(role === 'billing' ? '/cartera' : '/academic-secretary', { replace: true });
      return;
    }

    if (role === 'teacher') {
      navigate('/campus/teacher', { replace: true });
      return;
    }

    if (role === 'school_route') {
      navigate('/campus/route', { replace: true });
      return;
    }

    if (INSTITUTIONAL_PLACEHOLDER_ROLES.includes(role)) {
      navigate('/portal-institucional', { replace: true });
      return;
    }

    navigate('/pos', { replace: true });
  }, [navigate]);

  const finalizeAuth = useCallback(async (authResponse, normalizedUsername, preferredPath = '', schoolIdOverride = '') => {
    setAuth(authResponse);
    localStorage.setItem('selectedSchoolId', schoolIdOverride || selectedSchoolId);

    if (authResponse?.user?.role === 'parent') {
      localStorage.setItem('lastParentUsername', normalizedUsername);
      await maybePromptEnableBiometric(authResponse, normalizedUsername);
      if (!isNativeAndroid) {
        setupPushIfPossible();
      }
    }

    if (['admin', 'rectoria', 'direccion', 'super_admin'].includes(authResponse?.user?.role) && !isNativeAndroid) {
      setupPushIfPossible();
    }

    navigateByRole(authResponse?.user?.role, preferredPath);
  }, [isNativeAndroid, navigateByRole, selectedSchoolId, setAuth]);

  const maybePromptEnableBiometric = async (authResponse, normalizedUsername) => {
    const role = authResponse?.user?.role;
    const biometricEnabled = Boolean(authResponse?.user?.biometricEnabled);

    if (role !== 'parent' || biometricEnabled || !canUseBiometricAuth() || isNativeAndroid) {
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
    if (!token || (!directLoginProfile && !postLoginPath)) {
      return;
    }

    if (user?.role) {
      if (!isNativeAndroid && (user.role === 'parent' || user.role === 'admin')) {
        setupPushIfPossible();
      }
      navigateByRole(user.role, postLoginPath);
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
        if (!isNativeAndroid && (hydratedUser.role === 'parent' || hydratedUser.role === 'admin')) {
          setupPushIfPossible();
        }
        navigateByRole(hydratedUser.role, postLoginPath);
      } catch {
        // If token is invalid, user stays on login page and can authenticate again.
      }
    };

    hydrateAndRedirect();

    return () => {
      cancelled = true;
    };
  }, [directLoginProfile, isNativeAndroid, postLoginPath, token, user?.role, navigateByRole, setUser]);

  useEffect(() => {
    if (!directLoginProfile || token || loading || directLoginAttemptedRef.current) {
      return;
    }

    directLoginAttemptedRef.current = true;
    hasUserTypedRef.current = true;
    setSelectedSchoolId(directLoginProfile.schoolId);
    setUsername(directLoginProfile.username);
    setPassword(directLoginProfile.password);
    setError('');
    setLoading(true);

    login({
      username: directLoginProfile.username,
      password: directLoginProfile.password,
      schoolId: directLoginProfile.schoolId,
    })
      .then(async (response) => {
        await finalizeAuth(
          response.data,
          normalizeUsername(directLoginProfile.username),
          directLoginProfile.redirectPath || postLoginPath
        );
      })
      .catch((requestError) => {
        setError(
          requestError?.response?.data?.message ||
            requestError?.message ||
            'No se pudo iniciar sesión. Revisa backend o credenciales.'
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, [directLoginProfile, finalizeAuth, loading, postLoginPath, token]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const typedSchoolKey = normalizeSearchText(schoolSearch);
    const exactTypedSchool = countrySchoolOptions.find((school) => normalizeSearchText(school.label) === typedSchoolKey || normalizeSearchText(school.id) === typedSchoolKey);
    const selectedCountrySchoolId = countrySchoolOptions.some((school) => school.id === selectedSchoolId) ? selectedSchoolId : '';
    const resolvedSchoolId = selectedCountrySchoolId || exactTypedSchool?.id || (filteredSchoolOptions.length === 1 ? filteredSchoolOptions[0].id : '');

    if (!resolvedSchoolId) {
      setError('Selecciona un colegio para continuar.');
      return;
    }

    if (resolvedSchoolId !== selectedSchoolId) {
      setSelectedSchoolId(resolvedSchoolId);
    }

    setLoading(true);

    try {
      const response = await login({ username, password, schoolId: resolvedSchoolId, country: selectedCountry });
      const authResponse = response.data;
      const normalizedUsername = normalizeUsername(username);
      await finalizeAuth(authResponse, normalizedUsername, postLoginPath, resolvedSchoolId);
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
      if (verifyResponse.data?.user?.role === 'parent' && !isNativeAndroid) {
        setupPushIfPossible();
      }

      if (verifyResponse.data?.user?.role === 'admin' && !isNativeAndroid) {
        setupPushIfPossible();
      }
      navigateByRole(verifyResponse.data?.user?.role, postLoginPath);
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
      <section className="login-auth-hero" aria-label="Identidad de Comergio">
        <div className="login-auth-logo-wrap" aria-hidden="true">
          <img className="login-auth-sublogo-image" src={loginLogo} alt="Comergio" />
        </div>
      </section>

      <form className="login-panel login-auth-card" autoComplete="off" onSubmit={onSubmit}>
        <div className="login-auth-card-head">
          <h2>Bienvenido,</h2>
          <p>Administra el consumo escolar de forma simple y segura.</p>
        </div>

        <label>
          <span>País</span>
          <div className="login-input-shell login-country-picker" ref={countryPickerRef}>
            <span className="login-input-icon"><InputAdornment kind="country" /></span>
            <button
              aria-controls="login-country-options"
              aria-expanded={isCountryPickerOpen}
              className="login-country-trigger"
              onClick={() => setIsCountryPickerOpen((currentValue) => !currentValue)}
              type="button"
            >
              <span>{selectedCountryOption.label}</span>
            </button>
            <button
              aria-label="Mostrar países"
              className={`login-school-combobox-toggle${isCountryPickerOpen ? ' is-open' : ''}`}
              onClick={() => setIsCountryPickerOpen((currentValue) => !currentValue)}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
            {isCountryPickerOpen ? (
              <div className="login-school-options login-country-options" id="login-country-options" role="listbox">
                {COUNTRY_OPTIONS.map((country) => (
                  <button
                    aria-selected={country.id === selectedCountry}
                    className={country.id === selectedCountry ? 'is-selected' : ''}
                    key={country.id}
                    onClick={(event) => {
                      event.preventDefault();
                      selectCountryOption(country.id);
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      selectCountryOption(country.id);
                    }}
                    role="option"
                    type="button"
                  >
                    {country.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </label>

        <label>
          <span>Colegio</span>
          <div className="login-input-shell login-school-combobox" ref={schoolPickerRef}>
            <span className="login-input-icon"><InputAdornment kind="school" /></span>
            <input
              aria-autocomplete="list"
              aria-controls="login-school-options"
              aria-expanded={isSchoolPickerOpen}
              autoCapitalize="words"
              autoComplete="off"
              autoCorrect="off"
              name="comergio_school"
              onChange={(e) => {
                const nextValue = e.target.value;
                setSchoolSearch(nextValue);
                setIsSchoolPickerOpen(true);
                if (selectedSchool && normalizeSearchText(nextValue) !== normalizeSearchText(selectedSchool.label)) {
                  setSelectedSchoolId('');
                }
              }}
              onFocus={() => setIsSchoolPickerOpen(true)}
              placeholder="Busca tu colegio"
              role="combobox"
              spellCheck={false}
              value={schoolSearch}
            />
            <button
              aria-label="Mostrar colegios"
              className={`login-school-combobox-toggle${isSchoolPickerOpen ? ' is-open' : ''}`}
              onClick={() => setIsSchoolPickerOpen((currentValue) => !currentValue)}
              type="button"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
            {isSchoolPickerOpen ? (
              <div className="login-school-options" id="login-school-options" role="listbox">
                {filteredSchoolOptions.length ? filteredSchoolOptions.map((school) => (
                  <button
                    aria-selected={school.id === selectedSchoolId}
                    className={school.id === selectedSchoolId ? 'is-selected' : ''}
                    key={school.id}
                    onClick={(event) => {
                      event.preventDefault();
                      selectSchoolOption(school);
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      selectSchoolOption(school);
                    }}
                    role="option"
                    type="button"
                  >
                    {school.label}
                  </button>
                )) : (
                  <span className="login-school-options-empty">
                    {countrySchoolOptions.length ? 'No encontramos colegios con ese nombre.' : 'No hay colegios disponibles para este país.'}
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </label>

        <label>
          <span>Usuario</span>
          <div className="login-input-shell">
            <span className="login-input-icon"><InputAdornment kind="username" /></span>
            <input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              name="comergio_username"
              placeholder="Tu usuario"
              spellCheck={false}
              value={username}
              onFocus={markUserInteraction}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        </label>

        <label>
          <span>Password</span>
          <div className="password-field login-input-shell">
            <span className="login-input-icon"><InputAdornment kind="password" /></span>
            <input
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect="off"
              name="comergio_password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Tu contraseña"
              value={password}
              onFocus={markUserInteraction}
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
