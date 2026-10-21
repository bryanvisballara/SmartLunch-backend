import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import colibriLogo from '../assets/colibrisinfondo.png';
import './SchoolPresentationPage.css';

const DEMO_PATH = '/demo';
const WHATSAPP_HREF = `https://wa.me/573016214806?text=${encodeURIComponent('Hola, quiero conocer Comergio para mi colegio.')}`;
const APP_STORE_URL = 'https://apps.apple.com/app/id6760672707';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.comergio.app&hl=es_CO';

const HERO_VALUES = [
  { label: 'Pagos más fáciles', icon: 'card' },
  { label: 'Familias más conectadas', icon: 'contact' },
  { label: 'Mejor educación', icon: 'campus' },
];

const RISK_ITEMS = [
  {
    icon: 'chart',
    title: 'Cartera en aumento.',
    note: 'La cartera crece cuando pagar sigue siendo un trámite largo.',
  },
  {
    icon: 'bell',
    title: 'Familias desinteresadas.',
    note: 'Hoy en día los correos se pierden entre cientos que llegan a diario.',
  },
  {
    icon: 'clock',
    title: 'Demasiadas plataformas.',
    note: 'Información dispersa. Docentes y padres pierden tiempo saltando entre plataformas.',
  },
];

const VALUE_POINTS = [
  {
    icon: 'megaphone',
    title: 'Una nueva manera de comunicar',
    text: 'Olvídate de los correos que nadie lee y comparte novedades en un feed interactivo que conecta a las familias con el colegio.',
  },
  {
    icon: 'card',
    title: 'Reduce cartera hasta en un 30%',
    bullets: [
      'Cambia la experiencia de pago, pasa de 10 minutos a 10 segundos.',
      'Tokenización para débitos automáticos.',
      'Recordatorios de pago automatizados.',
    ],
  },
  {
    icon: 'campus',
    title: 'Un solo campus para el equipo.',
    text: 'Académico, enfermería, bienestar, transporte, admisiones y talento humano dejan de vivir en archivos sueltos.',
  },
];

const GUIDE_CREDENTIALS = [
  {
    id: 'wwtecno',
    icon: 'doc',
    pre: 'Una marca de',
    title: 'WW TECNO S.A.S',
    subtitle: 'World Wide Technologies',
  },
  {
    id: 'operation',
    icon: 'campus',
    title: 'Más de 1000 clientes felices',
  },
  {
    id: 'focus',
    icon: 'chart',
    title: 'Hecho para colegios en Colombia',
  },
];

const STEPS = [
  {
    n: '01',
    icon: 'contact',
    title: 'Crea tu colegio en segundos',
    text: 'Empieza el alta guiada, sin instalar servidores.',
  },
  {
    n: '02',
    icon: 'building',
    title: 'Configura tu colegio',
    text: 'Contáctanos para dejar listos cursos, familias y módulos.',
  },
  {
    n: '03',
    icon: 'families',
    title: 'Invita a tus familias',
    text: 'Entrega credenciales y el colegio empieza a operar en la app.',
  },
];

const MODULES = [
  {
    group: 'La app de la familia',
    items: [
      {
        title: 'Pagos',
        text: 'La pensión pendiente se ve y se paga desde el celular.',
      },
      {
        title: 'Cafetería',
        text: 'Saldo, preórdenes y tope diario, con rastro para el acudiente.',
      },
      {
        title: 'Comunicados',
        text: 'Avisos oficiales con recordatorios, no un chat más.',
      },
    ],
  },
  {
    group: 'El campus del colegio',
    items: [
      {
        title: 'Portal académico',
        text: 'Cursos, tareas y el seguimiento que la familia consulta.',
      },
      {
        title: 'Enfermería y bienestar',
        text: 'Lo que pasa en la jornada queda registrado y llega a casa.',
      },
      {
        title: 'Admisiones',
        text: 'Del primer interés a la matrícula, sin hojas sueltas.',
      },
    ],
  },
];

const FOOTER_BRANDS = [
  {
    id: 'rentados',
    name: 'Rentados',
    ios: 'https://apps.apple.com/co/app/rentados/id6817157543',
    android: 'https://play.google.com/store/apps/details?id=com.rentados.app&hl=es_CO',
  },
  {
    id: 'tecnowallet',
    name: 'TecnoWallet',
    ios: 'https://apps.apple.com/co/app/tecnowallet/id6802359477',
    android: 'https://play.google.com/store/apps/details?id=com.tecnowallet.mobile&hl=es_CO',
  },
  {
    id: 'pushgo',
    name: 'PushGo Viral',
    web: 'https://pushgoviral.com/',
  },
];

const READ_MORE_PREVIEW = 'Hoy un acudiente puede necesitar más de ocho pasos solo para pagar una pensión; muchos abandonan a mitad del camino y la cartera crece. En cafetería, el efectivo no deja rastro para la familia. Las circulares por WhatsApp se pierden entre chats personales y, además, las cuentas se bloquean por envíos masivos.';

function Icon({ name }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 };
  if (name === 'leaf') {
    return (
      <svg {...common}>
        <path d="M12 21c-4-3.5-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-3 8.5-7 12Z" />
        <path d="M12 9v12" />
      </svg>
    );
  }
  if (name === 'savings') {
    return (
      <svg {...common}>
        <rect x="5" y="7" width="14" height="10" rx="1.5" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
      </svg>
    );
  }
  if (name === 'time' || name === 'clock') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3.2 2" />
      </svg>
    );
  }
  if (name === 'chart') {
    return (
      <svg {...common}>
        <path d="M4 19h16" />
        <path d="M7 16v-4M12 16V8M17 16v-6" />
      </svg>
    );
  }
  if (name === 'bell') {
    return (
      <svg {...common}>
        <path d="M6 16V10a6 6 0 1 1 12 0v6l1.5 2H4.5L6 16Z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </svg>
    );
  }
  if (name === 'megaphone') {
    return (
      <svg {...common}>
        <path d="M4 10v4l10 4V6L4 10Z" />
        <path d="M14 9.5c1.8.6 3 1.6 3 2.5s-1.2 1.9-3 2.5" />
        <path d="M7 14.5v3.2A2.3 2.3 0 0 0 9.2 20H10" />
      </svg>
    );
  }
  if (name === 'card') {
    return (
      <svg {...common}>
        <rect x="3.5" y="6" width="17" height="12" rx="2" />
        <path d="M3.5 10h17" />
      </svg>
    );
  }
  if (name === 'campus') {
    return (
      <svg {...common}>
        <path d="M4 20V10l8-5 8 5v10" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }
  if (name === 'doc') {
    return (
      <svg {...common}>
        <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
        <path d="M14 3.5V8h4.5M8 12h8M8 16h6" />
      </svg>
    );
  }
  if (name === 'contact') {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M4 19v-1a5 5 0 0 1 5-5h0a5 5 0 0 1 5 5v1" />
        <path d="M19 8v6M16 11h6" />
      </svg>
    );
  }
  if (name === 'building') {
    return (
      <svg {...common}>
        <path d="M5 20V9l7-3.5L19 9v11" />
        <path d="M9 20v-5h6v5" />
        <path d="M9 11h.01M9 14h.01M15 11h.01M15 14h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="9" r="2.4" />
      <circle cx="16.2" cy="10" r="2" />
      <path d="M4 19v-1a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1" />
      <path d="M14 19v-.8a3 3 0 0 1 3-3h.2a2.8 2.8 0 0 1 2.8 2.8V19" />
    </svg>
  );
}

function BrandMark({ compact = false }) {
  return (
    <span className={`sp-brand${compact ? ' sp-brand--compact' : ''}`}>
      <img className="sp-brand__mark" src={colibriLogo} alt="" />
      <span className="sp-brand__word">
        <span>Comer</span>
        <span className="sp-brand__gio">gio</span>
      </span>
    </span>
  );
}

function CreateCta({ className = '', children = 'Prueba la demo gratis' }) {
  return (
    <Link className={`sp-cta ${className}`.trim()} to={DEMO_PATH}>
      {children}
    </Link>
  );
}

function ContactCta({ className = '' }) {
  return (
    <a className={`sp-cta sp-cta--ghost ${className}`.trim()} href={WHATSAPP_HREF} target="_blank" rel="noreferrer">
      Contáctanos
    </a>
  );
}

function ReadMoreStory() {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  return (
    <article className="sp-read" data-reveal="up">
      <h2 id="sp-read-title" className="sp-read__title">
        <span>Lo que hoy frena a las familias</span>
        <span>y cómo Comergio lo simplifica</span>
      </h2>
      {!expanded ? (
        <p className="sp-read__preview">{READ_MORE_PREVIEW}</p>
      ) : (
        <div id={panelId} className="sp-read__full">
          <p>
            Actualmente a un acudiente le toma más de ocho pasos pagar una pensión, y eso
            conlleva a que termine no pagándola y acumulando deuda.
          </p>
          <p className="sp-read__label">Un acudiente tiene que:</p>
          <ol>
            <li>Abrir el correo o el grupo de WhatsApp.</li>
            <li>Buscar el recibo o el valor de la pensión.</li>
            <li>Entrar al navegador.</li>
            <li>Buscar la página del banco o de la pasarela.</li>
            <li>Elegir el colegio.</li>
            <li>Digitar la referencia del estudiante.</li>
            <li>Digitar el valor.</li>
            <li>Completar el pago.</li>
          </ol>
          <p>
            Esa serie de pasos, que toma varios minutos, hace que las familias abandonen el
            proceso a mitad del camino. En Comergio el acudiente abre la app, ve la pensión
            pendiente y paga en un par de toques.
          </p>
          <h3>Cafetería</h3>
          <p>
            Cuando el estudiante compra en efectivo, la familia no sabe qué comió ni cuánto
            gastó, y el colegio cuadra caja al final del día. En Comergio el saldo, las
            preórdenes y el tope diario viven en la misma app.
          </p>
          <h3>Enfermería y bienestar</h3>
          <p>
            Un malestar a media mañana no debería conocerse solo a la hora de la salida. El
            registro queda en el campus y el acudiente se entera en el momento, no por un chat
            que se pierde.
          </p>
          <h3>Comunicaciones que sí llegan</h3>
          <p>
            Hoy los mensajes de WhatsApp se pierden entre los chats de la familia. Además,
            WhatsApp bloquea cuentas por la cantidad de mensajes que envía un colegio.
          </p>
          <p>
            Con Comergio publicas comunicados oficiales y puedes añadir recordatorios a cada
            aviso, sin crear publicaciones nuevas: llegan como notificación al celular.
          </p>
          <p className="sp-read__example">
            <strong>Ejemplo:</strong> mañana la salida es a la 1:00 p.&nbsp;m. por jornada
            pedagógica. El aviso sale hoy, y rectoría programa recordatorios — por ejemplo esta
            noche y una hora antes — para que el acudiente lo reciba a tiempo.
          </p>
        </div>
      )}
      <button
        type="button"
        className="sp-read__toggle"
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        onClick={() => setExpanded((open) => !open)}
      >
        {expanded ? 'Ver menos' : 'Ver más'}
      </button>
    </article>
  );
}

function FooterBrand({ brand }) {
  if (brand.web) {
    return (
      <li>
        <span>{brand.name}</span>
        <a href={brand.web} target="_blank" rel="noreferrer">{brand.web.replace(/^https?:\/\//, '')}</a>
      </li>
    );
  }

  return (
    <li>
      <span>{brand.name}</span>
      <span className="sp-foot__stores">
        <a href={brand.ios} target="_blank" rel="noreferrer">App Store</a>
        <span aria-hidden="true"> · </span>
        <a href={brand.android} target="_blank" rel="noreferrer">Google Play</a>
      </span>
    </li>
  );
}

export default function SchoolPresentationPage() {
  useEffect(() => {
    const previousTitle = document.title;
    const previousLang = document.documentElement.lang;
    document.title = 'Comergio · Tu colegio, en una sola plataforma';
    document.documentElement.lang = 'es';
    document.documentElement.classList.add('school-presentation-active');

    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@500;600;700;800&display=swap';
    fontLink.id = 'school-presentation-fonts';
    document.head.appendChild(fontLink);

    let meta = document.querySelector('meta[name="description"]');
    const createdMeta = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    const previousDescription = meta.getAttribute('content') || '';
    meta.setAttribute('content', 'Comergio conecta a las familias y al colegio: pensiones, cafetería, académico, enfermería y admisiones en una sola plataforma.');

    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLang;
      document.documentElement.classList.remove('school-presentation-active');
      fontLink.remove();
      if (createdMeta) {
        meta.remove();
      } else {
        meta.setAttribute('content', previousDescription);
      }
    };
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = document.querySelectorAll('[data-reveal], [data-reveal-stagger]');
    const reveal = (node) => node.classList.add('is-in');

    if (reduce) {
      nodes.forEach(reveal);
      return undefined;
    }

    const revealInView = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      nodes.forEach((node) => {
        if (node.classList.contains('is-in')) return;
        const rect = node.getBoundingClientRect();
        if (rect.top < vh * 0.92 && rect.bottom > 0) reveal(node);
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) reveal(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -4% 0px' }
    );
    nodes.forEach((node) => observer.observe(node));
    revealInView();

    return () => observer.disconnect();
  }, []);

  return (
    <div className="sp">
      <header className="sp-nav">
        <Link to="/" className="sp-nav__brand" aria-label="Comergio">
          <BrandMark compact />
        </Link>
        <div className="sp-nav__end">
          <Link className="sp-nav__login" to="/login">Iniciar sesión</Link>
          <CreateCta className="sp-cta--nav" />
        </div>
      </header>

      <section className="sp-hero" aria-labelledby="sp-hero-title">
        <div className="sp-hero__bg" aria-hidden="true" />
        <div className="sp-hero__copy">
          <p className="sp-hero__eyebrow">Colegios</p>
          <h1 id="sp-hero-title">Transforma la experiencia de comunicación con las familias.</h1>
          <p className="sp-hero__lead">Sé parte de la nueva generación de colegios modernos.</p>
          <CreateCta className="sp-cta--light" />
        </div>
        <ul className="sp-values" aria-label="Beneficios">
          {HERO_VALUES.map((item) => (
            <li key={item.label}>
              <span aria-hidden="true"><Icon name={item.icon} /></span>
              {item.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="sp-risks" id="riesgos" aria-labelledby="sp-risks-title">
        <div className="sp-wrap">
          <h2 id="sp-risks-title" data-reveal="up">El precio de seguir gestionando tu colegio como antes.</h2>
          <ul className="sp-risks__grid" data-reveal-stagger>
            {RISK_ITEMS.map((item, index) => (
              <li key={item.title} data-reveal-item style={{ '--i': index }}>
                <span aria-hidden="true"><Icon name={item.icon} /></span>
                <strong>{item.title}</strong>
                <p>{item.note}</p>
              </li>
            ))}
          </ul>
          <CreateCta />
        </div>
      </section>

      <section className="sp-value" id="propuesta" aria-labelledby="sp-value-title">
        <div className="sp-wrap">
          <header data-reveal="up">
            <h2 id="sp-value-title">Más organización para ti. Una mejor experiencia para todos.</h2>
            <p>
              Unifica tus plataformas, simplifica los procesos y mantén conectadas a las familias
              desde una solución diseñada para las necesidades reales de los colegios.
            </p>
          </header>
          <figure className="sp-value__visual" data-reveal="up">
            <img
              src="/presentation/todo-conectado-un-solo-lugar.jpg"
              alt="Todo conectado en un solo lugar: integraciones educativas y la app Comergio para familias y colegio."
              width={1920}
              height={1080}
              loading="lazy"
              decoding="async"
            />
          </figure>
          <ul className="sp-value__grid" data-reveal-stagger>
            {VALUE_POINTS.map((item, index) => (
              <li key={item.title} data-reveal-item style={{ '--i': index }}>
                <span aria-hidden="true"><Icon name={item.icon} /></span>
                <h3>{item.title}</h3>
                {item.bullets ? (
                  <ul className="sp-value__bullets">
                    {item.bullets.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{item.text}</p>
                )}
              </li>
            ))}
          </ul>
          <CreateCta />
        </div>
      </section>

      <section className="sp-guide" id="guia" aria-labelledby="sp-guide-title">
        <div className="sp-guide__layout">
          <div className="sp-guide__intro" data-reveal="up">
            <div className="sp-guide__logo">
              <img className="sp-guide__colibri" src={colibriLogo} alt="" aria-hidden="true" />
            </div>
            <div className="sp-guide__copy">
              <h2 id="sp-guide-title">
                No estás solo: Muchos colegios viven la misma tensión — Difícil manejo de cobros, lograr
                que las familias lean los comunicados y demasiada información interna dispersa.
              </h2>
              <p>Comergio nació acompañando por más de 10 años a colegios en Colombia.</p>
            </div>
          </div>
          <ul className="sp-guide__creds" data-reveal-stagger>
            {GUIDE_CREDENTIALS.map((item, index) => (
              <li key={item.id} data-reveal-item style={{ '--i': index }}>
                <span aria-hidden="true"><Icon name={item.icon} /></span>
                <div>
                  {item.pre ? <small>{item.pre}</small> : null}
                  <strong>{item.title}</strong>
                  {item.subtitle ? <em>{item.subtitle}</em> : null}
                </div>
              </li>
            ))}
          </ul>
          <aside className="sp-download" aria-labelledby="sp-download-title" data-reveal="up">
            <h3 id="sp-download-title">Descarga la App ahora</h3>
            <div className="sp-download__stores">
              <div>
                <img src="/presentation/badge-app-store.png" alt="Disponible en App Store" width="158" height="48" />
                <img className="sp-download__qr" src="/presentation/qr-ios.png" alt="QR para descargar Comergio en App Store" width="124" height="124" />
                <a className="sp-cta sp-cta--small" href={APP_STORE_URL} target="_blank" rel="noreferrer">Descárgala para iPhone</a>
              </div>
              <div>
                <img src="/presentation/badge-google-play.png" alt="Disponible en Google Play" width="158" height="48" />
                <img className="sp-download__qr" src="/presentation/qr-android.png" alt="QR para descargar Comergio en Google Play" width="124" height="124" />
                <a className="sp-cta sp-cta--small" href={PLAY_STORE_URL} target="_blank" rel="noreferrer">Descárgala para Android</a>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="sp-steps" id="como-funciona" aria-labelledby="sp-steps-title">
        <div className="sp-wrap">
          <p id="sp-steps-title" className="sp-kicker" data-reveal="up">Cómo funciona</p>
          <ol data-reveal-stagger>
            {STEPS.map((step, index) => (
              <li key={step.n} data-reveal-item style={{ '--i': index }}>
                <span className="sp-steps__icon" aria-hidden="true"><Icon name={step.icon} /></span>
                <span className="sp-steps__n">{step.n}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="sp-cta-row">
            <CreateCta />
            <ContactCta />
          </div>
        </div>
      </section>

      <section className="sp-detail" id="detalle" aria-labelledby="sp-read-title">
        <div className="sp-wrap">
          <ReadMoreStory />
        </div>
      </section>

      <section className="sp-modules" id="modulos" aria-labelledby="sp-modules-title">
        <div className="sp-wrap">
          <header data-reveal="up">
            <p className="sp-kicker">El día a día</p>
            <h2 id="sp-modules-title">Así se vive la experiencia en un colegio conectado.</h2>
            <p>Cada pieza es un flujo real: la app de la familia y la operación del campus.</p>
          </header>
          {MODULES.map((group) => (
            <div key={group.group} className="sp-modules__group">
              <h3 data-reveal="up">{group.group}</h3>
              <ul data-reveal-stagger>
                {group.items.map((item, index) => (
                  <li key={item.title} data-reveal-item style={{ '--i': index }}>
                    <h4>{item.title}</h4>
                    <p>{item.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="sp-cta-row">
            <CreateCta />
            <ContactCta />
          </div>
        </div>
      </section>

      <footer className="sp-foot">
        <div className="sp-foot__grid">
          <section>
            <BrandMark />
            <p>La plataforma del colegio y de las familias, en Colombia.</p>
            <div className="sp-foot__qr">
              <a href={APP_STORE_URL} target="_blank" rel="noreferrer">
                <img src="/presentation/qr-ios.png" alt="Código QR para descargar Comergio en App Store" width="104" height="104" />
                <span>App Store</span>
              </a>
              <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">
                <img src="/presentation/qr-android.png" alt="Código QR para descargar Comergio en Google Play" width="104" height="104" />
                <span>Google Play</span>
              </a>
            </div>
          </section>
          <section>
            <h2>Conócenos</h2>
            <p>Comergio es una marca de</p>
            <strong>WW TECNO S.A.S</strong>
            <p>World Wide Technologies</p>
            <a href="https://wwtecno.com/" target="_blank" rel="noreferrer">wwtecno.com</a>
          </section>
          <section>
            <h2>Nuestras marcas</h2>
            <ul>
              {FOOTER_BRANDS.map((brand) => <FooterBrand key={brand.id} brand={brand} />)}
            </ul>
          </section>
          <section>
            <h2>Legal</h2>
            <nav aria-label="Legal">
              <Link to="/privacy">Privacidad</Link>
              <Link to="/contact">Soporte</Link>
              <Link to="/login">Iniciar sesión</Link>
            </nav>
          </section>
        </div>
        <p className="sp-foot__copy">© {new Date().getFullYear()} WW TECNO S.A.S · Comergio</p>
      </footer>
    </div>
  );
}
