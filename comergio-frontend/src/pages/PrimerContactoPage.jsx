import { useEffect, useMemo, useState } from 'react';
import {
  fetchPrimerContactoAvailability,
  submitPrimerContacto,
} from '../services/primerContacto.service';
import colibriLogo from '../assets/colibrisinfondo.png';
import berckleyCampusPhoto from '../assets/berckley-campus-primer-contacto.png';
import './PrimerContactoPage.css';

function IconCalendar({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 10h16" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3.5v3.5M16 3.5v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
      <circle cx="10" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 18.5c.7-2.8 2.7-4.2 5.5-4.2s4.8 1.4 5.5 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16.5" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15.2 14.6c1.7.35 3 1.45 3.8 3.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconShield({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
      <path d="M12 3.8 18.5 6.6v4.8c0 3.9-2.6 6.8-6.5 8.1-3.9-1.3-6.5-4.2-6.5-8.1V6.6L12 3.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m9.4 12 1.9 1.9 3.5-3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconHeadset({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 13V11a7.5 7.5 0 0 1 15 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="3" y="12.5" width="3.8" height="5.2" rx="1.4" stroke="currentColor" strokeWidth="1.8" />
      <rect x="17.2" y="12.5" width="3.8" height="5.2" rx="1.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M17.2 17.7v.8a2.5 2.5 0 0 1-2.5 2.5h-2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconLock({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconChat({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 17.5 4 20l3-1.2A8.5 8.5 0 1 0 5 17.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

const APPOINTMENT_TYPES = [
  {
    value: 'virtual',
    label: 'Cita virtual',
    description: 'Videollamada con Admisiones',
  },
  {
    value: 'phone',
    label: 'Llamada telefónica',
    description: 'Te contactamos al número registrado',
  },
  {
    value: 'in_person',
    label: 'Cita presencial',
    description: 'Visita a una de nuestras sedes',
  },
];

function IconClose({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSpark({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5v3.2M12 17.3v3.2M3.5 12h3.2M17.3 12h3.2M6.4 6.4l2.3 2.3M15.3 15.3l2.3 2.3M17.6 6.4l-2.3 2.3M8.7 15.3l-2.3 2.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

const HOW_IT_WORKS_STEPS = [
  {
    title: 'Completa este formulario',
    text: 'Ingresa los datos del aspirante, del acudiente y agenda tu cita con Admisiones.',
  },
  {
    title: 'Se te habilitará el botón para redirigirte a WhatsApp',
    text: 'Solo cuando el formulario esté completo podrás continuar por WhatsApp.',
  },
  {
    title: 'Revisaremos tus datos suministrados',
    text: 'Nuestro equipo de Admisiones validará la información que nos compartiste.',
  },
  {
    title: 'Recibirás más información y responderemos todas tus dudas',
    text: 'Te guiaremos en los siguientes pasos del proceso.',
  },
  {
    title: '¡Empezamos el proceso de admisión!',
    text: 'Con tu primer contacto listo, iniciamos juntos el camino hacia Berckley.',
  },
];

const FEATURES = [
  {
    Icon: IconCalendar,
    title: 'Agenda fácil y rápida',
    text: 'Elige el mejor horario disponible.',
  },
  {
    Icon: IconUsers,
    title: 'Atención personalizada',
    text: 'Un asesor te acompañará en el proceso.',
  },
  {
    Icon: IconShield,
    title: 'Tus datos están seguros',
    text: 'Protegemos tu información siempre.',
  },
];

const NEXT_STEPS = [
  {
    title: 'Envíanos tus datos',
    text: 'Completa este formulario con la información solicitada.',
  },
  {
    title: 'Te contactaremos',
    text: 'Un asesor revisará tu información y te contactará pronto.',
  },
  {
    title: 'Agenda tu cita',
    text: 'Elige el mejor horario para tu encuentro personalizado.',
  },
];

function createEmptyForm() {
  return {
    fullName: '',
    birthDate: '',
    previousSchool: '',
    noSchooling: false,
    guardianName: '',
    guardianEmail: '',
    guardianPhone: '',
    grade: '',
    academicYear: '2026-2027',
    appointmentType: '',
    locationKey: '',
    appointmentDate: '',
    appointmentTime: '',
    referenceOrigin: 'Primer contacto — comergio.com/berckleyprimercontacto',
  };
}

function calcAgeFromBirthDate(birthDate) {
  if (!birthDate) return 'Automática';
  const born = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(born.getTime())) return 'Automática';
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age -= 1;
  return age >= 0 && age < 120 ? `${age} años` : 'Automática';
}

function openWhatsApp(url) {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (opened) return;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function buildMonthCells(monthDate) {
  const first = startOfMonth(monthDate);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < startOffset; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export default function PrimerContactoPage() {
  const [form, setForm] = useState(createEmptyForm);
  const [availability, setAvailability] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState('');
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  useEffect(() => {
    document.title = 'Primer contacto | International Berckley School';
  }, []);

  useEffect(() => {
    if (!howItWorksOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setHowItWorksOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [howItWorksOpen]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      try {
        const data = await fetchPrimerContactoAvailability({ days: 60 });
        if (!cancelled) {
          setAvailability(data);
          const firstAvailable = (data?.days || []).find((day) => day.availableCount > 0);
          if (firstAvailable?.date) {
            setSelectedDate((previous) => previous || firstAvailable.date);
            setCalendarMonth(startOfMonth(parseDateKey(firstAvailable.date) || new Date()));
          }
          setError('');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.response?.data?.message || 'No se pudo cargar la agenda de admisiones.');
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ageLabel = useMemo(() => calcAgeFromBirthDate(form.birthDate), [form.birthDate]);
  const grades = availability?.grades || [];
  const locations = availability?.locations || [
    { value: 'sede_km5', label: 'Sede km 5 (primaria y secundaria)' },
    { value: 'sede_villacampestre', label: 'Sede Villacampestre (preescolar)' },
  ];
  const daysByDate = useMemo(() => {
    const map = new Map();
    (availability?.days || []).forEach((day) => map.set(day.date, day));
    return map;
  }, [availability]);
  const monthCells = useMemo(() => buildMonthCells(calendarMonth), [calendarMonth]);
  const selectedDay = selectedDate ? daysByDate.get(selectedDate) : null;
  const todayKey = toDateKey(new Date());
  const monthTitle = calendarMonth.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  const updateField = (key) => (value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    if (error) setError('');
    if (success) setSuccess('');
  };

  const selectDate = (dateKey) => {
    const day = daysByDate.get(dateKey);
    if (!day || day.availableCount <= 0) return;
    setSelectedDate(dateKey);
    setForm((previous) => ({
      ...previous,
      appointmentDate: dateKey,
      appointmentTime: previous.appointmentDate === dateKey ? previous.appointmentTime : '',
    }));
    if (error) setError('');
  };

  const selectSlot = (date, time) => {
    setSelectedDate(date);
    setForm((previous) => ({
      ...previous,
      appointmentDate: date,
      appointmentTime: time,
    }));
    if (error) setError('');
  };

  const canSubmit = Boolean(
    form.fullName.trim()
    && form.birthDate
    && (form.noSchooling || form.previousSchool.trim())
    && form.guardianName.trim()
    && form.guardianEmail.trim()
    && form.guardianPhone.trim()
    && form.grade
    && form.appointmentType
    && form.appointmentDate
    && form.appointmentTime
    && (form.appointmentType !== 'in_person' || form.locationKey)
    && !submitting
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        ...form,
        previousSchool: form.noSchooling ? 'Sin escolaridad' : form.previousSchool.trim(),
      };
      const result = await submitPrimerContacto(payload);
      setSuccess('Registro guardado. Te enviamos el recordatorio al correo y te llevamos a WhatsApp.');
      if (result?.whatsappUrl) {
        openWhatsApp(result.whatsappUrl);
      }
      setForm(createEmptyForm());
      setSelectedDate('');
      const refreshed = await fetchPrimerContactoAvailability({ days: 60 });
      setAvailability(refreshed);
    } catch (submitError) {
      setError(submitError?.response?.data?.message || 'No se pudo completar el registro. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="primer-contacto-page">
      <header className="primer-contacto-topbar">
        <a className="primer-contacto-topbar__brand" href="https://comergio.com">
          <img src={colibriLogo} alt="" />
          <span>Comergio</span>
        </a>
        <div className="primer-contacto-topbar__actions">
          <button
            type="button"
            className="primer-contacto-topbar__ghost"
            onClick={() => setHowItWorksOpen(true)}
          >
            <IconSpark />
            ¿Cómo funciona?
          </button>
          <a className="primer-contacto-topbar__solid" href="#primer-contacto-form">
            <IconChat />
            Contacto inicial
          </a>
        </div>
      </header>

      {howItWorksOpen ? (
        <div
          className="primer-contacto-modal-backdrop"
          role="presentation"
          onClick={() => setHowItWorksOpen(false)}
        >
          <section
            className="primer-contacto-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="primer-contacto-how-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="primer-contacto-modal__close"
              aria-label="Cerrar"
              onClick={() => setHowItWorksOpen(false)}
            >
              <IconClose />
            </button>

            <div className="primer-contacto-modal__hero">
              <span className="primer-contacto-modal__badge" aria-hidden="true">
                <IconSpark />
              </span>
              <p className="primer-contacto-modal__eyebrow">Primer contacto</p>
              <h2 id="primer-contacto-how-title">¿Cómo funciona?</h2>
              <p className="primer-contacto-modal__lead">
                Así te acompañamos desde el primer mensaje hasta el inicio de tu proceso de admisión.
              </p>
            </div>

            <ol className="primer-contacto-modal__steps">
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="primer-contacto-modal__rail" aria-hidden="true">
                    <span className="primer-contacto-modal__step-num">{index + 1}</span>
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.text}</span>
                  </div>
                </li>
              ))}
            </ol>

            <div className="primer-contacto-modal__footer">
              <p>
                WhatsApp se habilita solo cuando completes el formulario. Así podemos atenderte con tu información lista.
              </p>
              <button
                type="button"
                className="primer-contacto-modal__cta"
                onClick={() => {
                  setHowItWorksOpen(false);
                  document.getElementById('primer-contacto-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                Empezar el formulario
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <div className="primer-contacto-layout">
        <aside className="primer-contacto-side primer-contacto-side--left">
          <p className="primer-contacto-side__eyebrow">Departamento de Admisiones</p>
          <h1 className="primer-contacto-side__title">International Berckley School</h1>
          <span className="primer-contacto-side__accent" aria-hidden="true" />
          <p className="primer-contacto-side__lead">
            Agenda tu primer contacto con nosotros. Completa tus datos, elige el tipo de cita y un horario disponible.
          </p>
          <ul className="primer-contacto-features">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <span className="primer-contacto-features__icon" aria-hidden="true">
                  <feature.Icon />
                </span>
                <div>
                  <strong>{feature.title}</strong>
                  <span>{feature.text}</span>
                </div>
              </li>
            ))}
          </ul>
          <figure className="primer-contacto-side__photo">
            <div className="primer-contacto-side__photo-media" aria-hidden="true">
              <img
                src={berckleyCampusPhoto}
                alt=""
              />
            </div>
            <span className="primer-contacto-side__photo-badge" aria-hidden="true">
              <IconShield />
            </span>
            <figcaption className="sr-only">
              Fachada del campus International Berckley School
            </figcaption>
          </figure>
        </aside>

        <section className="primer-contacto-card" id="primer-contacto-form">
          <div className="primer-contacto-card__header">
            <div className="primer-contacto-card__heading">
              <span className="primer-contacto-card__badge" aria-hidden="true">
                <IconHeadset />
              </span>
              <div>
                <h2 className="primer-contacto-card__title">Contacta a un asesor</h2>
                <p className="primer-contacto-card__subtitle">
                  Llena los siguientes datos para poder atenderte mejor
                </p>
              </div>
            </div>
          </div>

          <form className="primer-contacto-form" onSubmit={handleSubmit}>
            <div className="primer-contacto-section">
              <h3 className="primer-contacto-section__title">Datos del aspirante (alumno)</h3>
              <div className="primer-contacto-grid">
                <div className="primer-contacto-field">
                  <label htmlFor="pc-fullName">Nombres y apellidos</label>
                  <input
                    id="pc-fullName"
                    placeholder="Nombre completo"
                    value={form.fullName}
                    onChange={(event) => updateField('fullName')(event.target.value)}
                    required
                  />
                </div>
                <div className="primer-contacto-grid primer-contacto-grid--2">
                  <div className="primer-contacto-field">
                    <label htmlFor="pc-birthDate">Fecha de nacimiento</label>
                    <input
                      id="pc-birthDate"
                      type="date"
                      value={form.birthDate}
                      onChange={(event) => updateField('birthDate')(event.target.value)}
                      required
                    />
                  </div>
                  <div className="primer-contacto-field primer-contacto-field--age">
                    <label htmlFor="pc-age">Edad</label>
                    <input id="pc-age" value={ageLabel} readOnly />
                  </div>
                </div>
                <div className="primer-contacto-school-row">
                  <div className="primer-contacto-field primer-contacto-field--school">
                    <label htmlFor="pc-previousSchool">Colegio de procedencia</label>
                    <input
                      id="pc-previousSchool"
                      placeholder="Colegio de procedencia"
                      value={form.noSchooling ? '' : form.previousSchool}
                      onChange={(event) => updateField('previousSchool')(event.target.value)}
                      disabled={form.noSchooling}
                      required={!form.noSchooling}
                    />
                  </div>
                  <label className="primer-contacto-check" htmlFor="pc-noSchooling">
                    <input
                      id="pc-noSchooling"
                      type="checkbox"
                      checked={form.noSchooling}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setForm((previous) => ({
                          ...previous,
                          noSchooling: checked,
                          previousSchool: checked ? '' : previous.previousSchool,
                        }));
                        if (error) setError('');
                        if (success) setSuccess('');
                      }}
                    />
                    <span>Sin escolaridad</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="primer-contacto-section">
              <h3 className="primer-contacto-section__title">Acudiente</h3>
              <div className="primer-contacto-grid primer-contacto-grid--2">
                <div className="primer-contacto-field">
                  <label htmlFor="pc-guardianName">Nombre</label>
                  <input
                    id="pc-guardianName"
                    placeholder="Acudiente"
                    value={form.guardianName}
                    onChange={(event) => updateField('guardianName')(event.target.value)}
                    required
                  />
                </div>
                <div className="primer-contacto-field">
                  <label htmlFor="pc-guardianEmail">Email</label>
                  <input
                    id="pc-guardianEmail"
                    type="email"
                    placeholder="Email acudiente"
                    value={form.guardianEmail}
                    onChange={(event) => updateField('guardianEmail')(event.target.value)}
                    required
                  />
                </div>
                <div className="primer-contacto-field">
                  <label htmlFor="pc-guardianPhone">Teléfono</label>
                  <input
                    id="pc-guardianPhone"
                    placeholder="Teléfono"
                    value={form.guardianPhone}
                    onChange={(event) => updateField('guardianPhone')(event.target.value)}
                    required
                  />
                </div>
                <div className="primer-contacto-field">
                  <label htmlFor="pc-academicYear">Periodo</label>
                  <input
                    id="pc-academicYear"
                    value={form.academicYear}
                    onChange={(event) => updateField('academicYear')(event.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="primer-contacto-section">
              <h3 className="primer-contacto-section__title">Proceso y agenda</h3>
              <div className="primer-contacto-grid">
                <div className="primer-contacto-field">
                  <label htmlFor="pc-grade">Grado / programa</label>
                  <select
                    id="pc-grade"
                    value={form.grade}
                    onChange={(event) => updateField('grade')(event.target.value)}
                    disabled={!grades.length}
                    required
                  >
                    <option value="">
                      {grades.length ? 'Selecciona grado' : (loadingSlots ? 'Cargando grados…' : 'Sin grados configurados')}
                    </option>
                    {grades.map((grade) => (
                      <option key={grade.value || grade.key} value={grade.value}>{grade.label}</option>
                    ))}
                  </select>
                </div>

                <div className="primer-contacto-field">
                  <label>Tipo de cita</label>
                  <div className="primer-contacto-type-grid">
                    {APPOINTMENT_TYPES.map((type) => (
                      <button
                        key={type.value}
                        type="button"
                        className={`primer-contacto-type${form.appointmentType === type.value ? ' is-selected' : ''}`}
                        onClick={() => {
                          updateField('appointmentType')(type.value);
                          if (type.value !== 'in_person') updateField('locationKey')('');
                        }}
                      >
                        <strong>{type.label}</strong>
                        <span>{type.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {form.appointmentType === 'in_person' ? (
                  <div className="primer-contacto-field">
                    <label htmlFor="pc-location">Ubicación de la cita</label>
                    <select
                      id="pc-location"
                      value={form.locationKey}
                      onChange={(event) => updateField('locationKey')(event.target.value)}
                      required
                    >
                      <option value="">Selecciona sede</option>
                      {locations.map((location) => (
                        <option key={location.value} value={location.value}>{location.label}</option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {form.appointmentType ? (
                  <div className="primer-contacto-scheduler">
                    <div className="primer-contacto-scheduler__meta">
                      <strong>1. Elige la fecha</strong>
                      <span>2. Elige la hora</span>
                      <span>30 min · Lun–Vie · 9–11 y 2–4</span>
                    </div>

                    {loadingSlots ? (
                      <p className="primer-contacto-calendar__hint">Cargando agenda de admisiones…</p>
                    ) : (
                      <div className="primer-contacto-scheduler__board">
                        <aside className="primer-contacto-calendar" aria-label="Calendario de fechas">
                          <div className="primer-contacto-calendar__nav">
                            <button
                              type="button"
                              aria-label="Mes anterior"
                              onClick={() => setCalendarMonth((previous) => addMonths(previous, -1))}
                            >
                              ‹
                            </button>
                            <h4>{monthTitle}</h4>
                            <button
                              type="button"
                              aria-label="Mes siguiente"
                              onClick={() => setCalendarMonth((previous) => addMonths(previous, 1))}
                            >
                              ›
                            </button>
                          </div>
                          <div className="primer-contacto-calendar__weekdays">
                            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => (
                              <span key={`${label}-${index}`}>{label}</span>
                            ))}
                          </div>
                          <div className="primer-contacto-calendar__grid">
                            {monthCells.map((cell, index) => {
                              if (!cell) {
                                return <span key={`empty-${index}`} className="primer-contacto-calendar__empty" />;
                              }
                              const dateKey = toDateKey(cell);
                              const day = daysByDate.get(dateKey);
                              const isPast = dateKey < todayKey;
                              const isWeekend = cell.getDay() === 0 || cell.getDay() === 6;
                              const hasSlots = Boolean(day?.availableCount);
                              const disabled = isPast || isWeekend || !hasSlots;
                              const isSelected = selectedDate === dateKey || form.appointmentDate === dateKey;
                              return (
                                <button
                                  key={dateKey}
                                  type="button"
                                  className={[
                                    'primer-contacto-calendar__day',
                                    isSelected ? 'is-selected' : '',
                                    dateKey === todayKey ? 'is-today' : '',
                                    hasSlots ? 'has-slots' : '',
                                  ].filter(Boolean).join(' ')}
                                  disabled={disabled}
                                  onClick={() => selectDate(dateKey)}
                                  title={hasSlots ? `${day.availableCount} horarios disponibles` : 'Sin horarios'}
                                >
                                  {cell.getDate()}
                                </button>
                              );
                            })}
                          </div>
                          <p className="primer-contacto-calendar__hint">
                            Toca un día con punto para ver sus horas.
                          </p>
                        </aside>

                        <div className="primer-contacto-times">
                          <div className="primer-contacto-times__head">
                            <h4>
                              {selectedDay?.label || (selectedDate ? selectedDate : 'Selecciona una fecha')}
                            </h4>
                            <span>Horarios disponibles</span>
                          </div>
                          {!selectedDate ? (
                            <div className="primer-contacto-empty-day">
                              Primero elige un día en el calendario.
                            </div>
                          ) : !selectedDay || selectedDay.availableCount === 0 ? (
                            <div className="primer-contacto-empty-day">
                              No hay cupos ese día. Elige otra fecha.
                            </div>
                          ) : (
                            <div className="primer-contacto-times__grid">
                              {selectedDay.slots.map((slot) => (
                                <button
                                  key={`${selectedDay.date}-${slot.time}`}
                                  type="button"
                                  className={`primer-contacto-slot${form.appointmentDate === selectedDay.date && form.appointmentTime === slot.time ? ' is-selected' : ''}`}
                                  disabled={!slot.available}
                                  onClick={() => selectSlot(selectedDay.date, slot.time)}
                                >
                                  {slot.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {form.appointmentDate && form.appointmentTime ? (
                      <p className="primer-contacto-calendar__hint">
                        Cita seleccionada: {form.appointmentDate} a las {form.appointmentTime}.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {error ? <div className="primer-contacto-error">{error}</div> : null}
            {success ? <div className="primer-contacto-success">{success}</div> : null}

            <div className="primer-contacto-actions">
              <p className="primer-contacto-actions__note">
                Al continuar, aceptas el tratamiento de tus datos para el proceso de admisión y recibirás
                el recordatorio de la cita por correo.
              </p>
              <button className="primer-contacto-submit" type="submit" disabled={!canSubmit}>
                {submitting ? 'Guardando…' : 'Guardar y continuar por WhatsApp'}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>
        </section>

        <aside className="primer-contacto-side primer-contacto-side--right">
          <div className="primer-contacto-panel primer-contacto-panel--guide">
            <h3>¿Qué sigue?</h3>
            <ol className="primer-contacto-steps">
              {NEXT_STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="primer-contacto-steps__rail" aria-hidden="true">
                    <span className="primer-contacto-steps__num">{index + 1}</span>
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.text}</span>
                  </div>
                </li>
              ))}
            </ol>
            <div className="primer-contacto-privacy">
              <span className="primer-contacto-privacy__icon" aria-hidden="true">
                <IconShield />
              </span>
              <div>
                <strong>Tu información está protegida</strong>
                <span>
                  Cumplimos con nuestra política de privacidad y protección de datos.
                </span>
              </div>
              <span className="primer-contacto-privacy__watermark" aria-hidden="true">
                <IconLock />
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
