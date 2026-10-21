import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import colibriLogo from '../assets/colibrisinfondo.png';
import { createDemoSchool } from '../services/demo.service';
import './SchoolPresentationPage.css';
import './DemoSignupPage.css';

const APP_STORE_URL = 'https://apps.apple.com/app/id6760672707';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.comergio.app&hl=es_CO';
const MAX_CHILDREN = 6;

const PROGRESS_MESSAGES = [
  'Creando tu colegio…',
  'Configurando cursos, docentes y materias…',
  'Preparando pensiones y cafetería…',
  'Matriculando a tus hijos…',
  'Cargando notas y tareas…',
  'Publicando las primeras noticias del colegio…',
  'Últimos detalles…',
];

const EMPTY_FORM = {
  schoolName: 'International Berckley School',
  city: '',
  contactName: '',
  email: '',
  phone: '',
  password: '',
};

function BrandMark() {
  return (
    <span className="sp-brand sp-brand--compact">
      <img className="sp-brand__mark" src={colibriLogo} alt="" />
      <span className="sp-brand__word">
        <span>Comer</span>
        <span className="sp-brand__gio">gio</span>
      </span>
    </span>
  );
}

function CopyField({ label, value, secret = false }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(!secret);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement('textarea');
      input.value = value;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="demo-copy">
      <span className="demo-copy__label">{label}</span>
      <div className="demo-copy__row">
        <code className="demo-copy__value">{visible ? value : '•'.repeat(Math.max(6, value.length))}</code>
        {secret ? (
          <button type="button" className="demo-copy__btn demo-copy__btn--ghost" onClick={() => setVisible((current) => !current)}>
            {visible ? 'Ocultar' : 'Ver'}
          </button>
        ) : null}
        <button type="button" className="demo-copy__btn" onClick={copy}>
          {copied ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

function DemoSuccess({ demo, password }) {
  return (
    <section className="demo-success" aria-labelledby="demo-success-title">
      <div className="demo-success__hero">
        <span className="demo-success__badge" aria-hidden="true">🎉</span>
        <h1 id="demo-success-title">¡Felicitaciones!</h1>
        <p>
          Has dado los primeros pasos para llevar a <strong>{demo.schoolName}</strong> a un siguiente nivel.
          Tu demo ya está lista con información real de ejemplo.
        </p>
      </div>

      <div className="demo-card">
        <h2><span className="demo-step">1</span>Ahora descarga la app</h2>
        <div className="demo-stores">
          <div>
            <img src="/presentation/badge-app-store.png" alt="Disponible en App Store" width="158" height="48" />
            <img className="demo-stores__qr" src="/presentation/qr-ios.png" alt="QR para descargar Comergio en App Store" width="132" height="132" />
            <a className="sp-cta sp-cta--small" href={APP_STORE_URL} target="_blank" rel="noreferrer">Descárgala para iPhone</a>
          </div>
          <div>
            <img src="/presentation/badge-google-play.png" alt="Disponible en Google Play" width="158" height="48" />
            <img className="demo-stores__qr" src="/presentation/qr-android.png" alt="QR para descargar Comergio en Google Play" width="132" height="132" />
            <a className="sp-cta sp-cta--small" href={PLAY_STORE_URL} target="_blank" rel="noreferrer">Descárgala para Android</a>
          </div>
        </div>
      </div>

      <div className="demo-card">
        <h2><span className="demo-step">2</span>Selecciona tu colegio</h2>
        <p className="demo-card__hint">Al abrir la app, busca y elige este colegio en la lista:</p>
        <CopyField label="Colegio" value={demo.schoolName} />
      </div>

      <div className="demo-card">
        <h2><span className="demo-step">3</span>Inicia sesión</h2>
        <CopyField label="Usuario" value={demo.username} />
        <CopyField label="Contraseña" value={password} secret />
        <p className="demo-card__hint">
          Entrarás como acudiente de {demo.children.map((child) => `${child.name} (${child.gradeLabel})`).join(', ')}.
          Tu demo estará disponible durante 7 días.
        </p>
      </div>
    </section>
  );
}

export default function DemoSignupPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [children, setChildren] = useState(['']);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progressIndex, setProgressIndex] = useState(0);
  const [error, setError] = useState('');
  const [demo, setDemo] = useState(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Probar 7 días sin costo · Comergio';
    document.documentElement.classList.add('school-presentation-active');

    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@500;600;700;800&display=swap';
    document.head.appendChild(fontLink);

    return () => {
      document.title = previousTitle;
      document.documentElement.classList.remove('school-presentation-active');
      fontLink.remove();
    };
  }, []);

  useEffect(() => {
    if (!submitting) {
      setProgressIndex(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setProgressIndex((current) => Math.min(current + 1, PROGRESS_MESSAGES.length - 1));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [submitting]);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const updateChild = (index, value) => {
    setChildren((current) => current.map((child, childIndex) => (childIndex === index ? value : child)));
  };

  const removeChild = (index) => {
    setChildren((current) => current.filter((_, childIndex) => childIndex !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const cleanChildren = children.map((child) => child.trim()).filter(Boolean);
    if (!cleanChildren.length) {
      setError('Escribe el nombre de al menos un hijo.');
      return;
    }
    if (form.password.trim().length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await createDemoSchool({
        ...form,
        email: form.email.trim().toLowerCase(),
        password: form.password.trim(),
        children: cleanChildren,
      });
      setDemo(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No pudimos crear tu demo. Intenta de nuevo en unos minutos.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sp demo-page">
      <header className="sp-nav">
        <Link to="/" className="sp-nav__brand" aria-label="Comergio">
          <BrandMark />
        </Link>
        <div className="sp-nav__end">
          <Link className="sp-nav__login" to="/login">Iniciar sesión</Link>
        </div>
      </header>

      <main className="demo-main">
        {demo ? (
          <DemoSuccess demo={demo} password={form.password.trim()} />
        ) : (
          <>
            <header className="demo-intro">
              <h1>Vive Comergio como lo vivirán tus familias.</h1>
              <p>
                Creamos un colegio de prueba con tu nombre: pensiones, cafetería, notas, enfermería y
                noticias del colegio. Lo exploras desde la app como acudiente.
              </p>
            </header>

            <form className="demo-form" onSubmit={handleSubmit}>
              <fieldset className="demo-card" disabled={submitting}>
                <legend><span className="demo-step">1</span>Datos del colegio</legend>
                <label>
                  <span>Nombre del colegio</span>
                  <input required maxLength={90} value={form.schoolName} onChange={updateField('schoolName')} placeholder="International Berckley School" />
                </label>
                <label>
                  <span>Ciudad</span>
                  <input required maxLength={80} value={form.city} onChange={updateField('city')} placeholder="Barranquilla" />
                </label>
              </fieldset>

              <fieldset className="demo-card" disabled={submitting}>
                <legend><span className="demo-step">2</span>Datos de contacto</legend>
                <label>
                  <span>Nombre completo</span>
                  <input required maxLength={90} autoComplete="name" value={form.contactName} onChange={updateField('contactName')} />
                </label>
                <div className="demo-form__row">
                  <label>
                    <span>Correo</span>
                    <input required type="email" maxLength={160} autoComplete="email" value={form.email} onChange={updateField('email')} />
                  </label>
                  <label>
                    <span>Teléfono</span>
                    <input required type="tel" maxLength={30} autoComplete="tel" value={form.phone} onChange={updateField('phone')} />
                  </label>
                </div>
              </fieldset>

              <fieldset className="demo-card" disabled={submitting}>
                <legend><span className="demo-step">3</span>Tus credenciales</legend>
                <label>
                  <span>Usuario</span>
                  <input readOnly value={form.email.trim().toLowerCase()} placeholder="Tu correo será tu usuario" tabIndex={-1} />
                </label>
                <label>
                  <span>Contraseña</span>
                  <div className="demo-password">
                    <input
                      required
                      minLength={6}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={updateField('password')}
                      placeholder="Mínimo 6 caracteres"
                    />
                    <button type="button" onClick={() => setShowPassword((current) => !current)}>
                      {showPassword ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                </label>
              </fieldset>

              <fieldset className="demo-card" disabled={submitting}>
                <legend><span className="demo-step">4</span>Nombre de tu hijo</legend>
                {children.map((child, index) => (
                  <div className="demo-child" key={index}>
                    <input
                      required={index === 0}
                      maxLength={80}
                      value={child}
                      onChange={(event) => updateChild(index, event.target.value)}
                      placeholder={index === 0 ? 'Nombre y apellido' : `Hijo ${index + 1}`}
                      aria-label={`Nombre del hijo ${index + 1}`}
                    />
                    {children.length > 1 ? (
                      <button type="button" className="demo-child__remove" onClick={() => removeChild(index)} aria-label={`Quitar hijo ${index + 1}`}>
                        ×
                      </button>
                    ) : null}
                  </div>
                ))}
                {children.length < MAX_CHILDREN ? (
                  <button type="button" className="demo-add-child" onClick={() => setChildren((current) => [...current, ''])}>
                    + Agregar otro hijo
                  </button>
                ) : null}
              </fieldset>

              {error ? <p className="demo-error" role="alert">{error}</p> : null}

              <button type="submit" className="sp-cta demo-submit" disabled={submitting}>
                {submitting ? PROGRESS_MESSAGES[progressIndex] : 'Empezar demo'}
              </button>
              {submitting ? (
                <p className="demo-wait">Esto toma cerca de 30 segundos. No cierres esta página.</p>
              ) : null}
            </form>
          </>
        )}
      </main>
    </div>
  );
}
