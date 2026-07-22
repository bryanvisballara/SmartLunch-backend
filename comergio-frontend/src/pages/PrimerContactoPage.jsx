import { useEffect, useMemo, useState } from 'react';
import {
  fetchPrimerContactoAvailability,
  submitPrimerContacto,
} from '../services/primerContacto.service';
import './PrimerContactoPage.css';

const DEFAULT_GRADES = [
  { value: 'Nursery', label: 'Nursery' },
  { value: 'Toddlers', label: 'Toddlers' },
  { value: 'PK', label: 'Pre-Kinder' },
  { value: 'K', label: 'Kinder' },
  { value: '1st', label: '1st' },
  { value: '2nd', label: '2nd' },
  { value: '3rd', label: '3rd' },
  { value: '4th', label: '4th' },
  { value: '5th', label: '5th' },
  { value: '6th', label: '6th' },
  { value: '7th', label: '7th' },
  { value: '8th', label: '8th' },
  { value: '9th', label: '9th' },
  { value: '10th', label: '10th' },
  { value: '11th', label: '11th' },
  { value: '12th', label: '12th' },
];

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

function createEmptyForm() {
  return {
    fullName: '',
    birthDate: '',
    previousSchool: '',
    guardianName: '',
    guardianEmail: '',
    guardianPhone: '',
    grade: '',
    academicYear: String(new Date().getFullYear() + 1),
    appointmentType: '',
    locationKey: '',
    appointmentDate: '',
    appointmentTime: '',
    referenceOrigin: 'Primer contacto — comergio.com/primercontacto',
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

export default function PrimerContactoPage() {
  const [form, setForm] = useState(createEmptyForm);
  const [availability, setAvailability] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    document.title = 'Primer contacto | International Berckley School';
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSlots(true);
      try {
        const data = await fetchPrimerContactoAvailability({ days: 21 });
        if (!cancelled) {
          setAvailability(data);
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
  const grades = availability?.grades?.length ? availability.grades : DEFAULT_GRADES;
  const locations = availability?.locations || [
    { value: 'sede_km5', label: 'Sede km 5 (primaria y secundaria)' },
    { value: 'sede_villacampestre', label: 'Sede Villacampestre (preescolar)' },
  ];
  const visibleDays = (availability?.days || []).slice(0, 7);

  const updateField = (key) => (value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    if (error) setError('');
    if (success) setSuccess('');
  };

  const selectSlot = (date, time) => {
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
    && form.previousSchool.trim()
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
      const result = await submitPrimerContacto(form);
      setSuccess('Registro guardado. Te enviamos el recordatorio al correo y te llevamos a WhatsApp.');
      if (result?.whatsappUrl) {
        openWhatsApp(result.whatsappUrl);
      }
      setForm(createEmptyForm());
      const refreshed = await fetchPrimerContactoAvailability({ days: 21 });
      setAvailability(refreshed);
    } catch (submitError) {
      setError(submitError?.response?.data?.message || 'No se pudo completar el registro. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="primer-contacto-page">
      <div className="primer-contacto-page__shell">
        <header className="primer-contacto-page__brand">
          <p className="primer-contacto-page__eyebrow">Departamento de Admisiones</p>
          <h1 className="primer-contacto-page__school">International Berckley School</h1>
          <p className="primer-contacto-page__lead">
            Agenda tu primer contacto con nosotros. Completa tus datos, elige el tipo de cita y un horario disponible.
          </p>
        </header>

        <section className="primer-contacto-card">
          <div className="primer-contacto-card__header">
            <h2 className="primer-contacto-card__title">Contacta a un asesor</h2>
            <p className="primer-contacto-card__subtitle">
              Llena los siguientes datos para poder atenderte mejor
            </p>
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
                <div className="primer-contacto-field">
                  <label htmlFor="pc-previousSchool">Colegio de procedencia</label>
                  <input
                    id="pc-previousSchool"
                    placeholder="Colegio de procedencia"
                    value={form.previousSchool}
                    onChange={(event) => updateField('previousSchool')(event.target.value)}
                    required
                  />
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
                  <label htmlFor="pc-academicYear">Año</label>
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
              <h3 className="primer-contacto-section__title">Proceso</h3>
              <div className="primer-contacto-grid">
                <div className="primer-contacto-field">
                  <label htmlFor="pc-grade">Grado / programa</label>
                  <select
                    id="pc-grade"
                    value={form.grade}
                    onChange={(event) => updateField('grade')(event.target.value)}
                    required
                  >
                    <option value="">Selecciona grado</option>
                    {grades.map((grade) => (
                      <option key={grade.value} value={grade.value}>{grade.label}</option>
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
                      <span>Selecciona un horario para la cita</span>
                      <span>Citas de 30 min · Lun–Vie · 9:00–11:00 y 2:00–4:00</span>
                      <span>(GMT-05:00) Hora estándar de Colombia</span>
                    </div>

                    {loadingSlots ? (
                      <p className="primer-contacto-footnote">Cargando agenda de admisiones…</p>
                    ) : (
                      <div className="primer-contacto-days">
                        {visibleDays.map((day) => (
                          <div key={day.date} className="primer-contacto-day">
                            <div className="primer-contacto-day__head">
                              <strong>{day.weekdayShort}</strong>
                              <span>{day.dayNumber} {day.monthLabel}</span>
                            </div>
                            <div className="primer-contacto-slots">
                              {day.availableCount === 0 ? (
                                <div className="primer-contacto-empty-day">Sin cupos</div>
                              ) : day.slots.map((slot) => (
                                <button
                                  key={`${day.date}-${slot.time}`}
                                  type="button"
                                  className={`primer-contacto-slot${form.appointmentDate === day.date && form.appointmentTime === slot.time ? ' is-selected' : ''}`}
                                  disabled={!slot.available}
                                  onClick={() => selectSlot(day.date, slot.time)}
                                >
                                  {slot.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {form.appointmentDate && form.appointmentTime ? (
                      <p className="primer-contacto-footnote">
                        Seleccionaste {form.appointmentDate} a las {form.appointmentTime}.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {error ? <div className="primer-contacto-error">{error}</div> : null}
            {success ? <div className="primer-contacto-success">{success}</div> : null}

            <div className="primer-contacto-actions">
              <button className="primer-contacto-submit" type="submit" disabled={!canSubmit}>
                {submitting ? 'Guardando…' : 'Guardar y continuar por WhatsApp'}
              </button>
              <p className="primer-contacto-footnote">
                Al guardar, quedas registrado en Admisiones (Interesados), recibes el recordatorio por correo
                con opción de añadir la cita a Google Calendar, y te redirigimos a WhatsApp con tus datos.
              </p>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
