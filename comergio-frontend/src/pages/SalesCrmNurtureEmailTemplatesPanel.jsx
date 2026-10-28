import { useCallback, useEffect, useState } from 'react';
import {
  getSalesNurtureEmailTemplates,
  updateSalesNurtureEmailTemplate,
} from '../services/salesCrm.service';

const PLACEHOLDER_HELP = '{{firstName}}, {{contactName}}, {{schoolName}}';

const emptyForm = {
  label: '',
  subject: '',
  eyebrow: '',
  title: '',
  intro: '',
  bodyHtml: '',
  ctaLabel: '',
  whatsappMessage: '',
  enabled: true,
};

export default function SalesCrmNurtureEmailTemplatesPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [activeSequence, setActiveSequence] = useState(1);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getSalesNurtureEmailTemplates();
      const list = data?.templates || [];
      setTemplates(list);
      setSenderEmail(data?.senderEmail || '');
      setSenderName(data?.senderName || '');
      const first = list.find((item) => item.sequence === activeSequence) || list[0];
      if (first) {
        setActiveSequence(first.sequence);
        setForm({
          label: first.label || '',
          subject: first.subject || '',
          eyebrow: first.eyebrow || '',
          title: first.title || '',
          intro: first.intro || '',
          bodyHtml: first.bodyHtml || '',
          ctaLabel: first.ctaLabel || '',
          whatsappMessage: first.whatsappMessage || '',
          enabled: first.enabled !== false,
        });
      }
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudieron cargar las plantillas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectTemplate = (template) => {
    setActiveSequence(template.sequence);
    setForm({
      label: template.label || '',
      subject: template.subject || '',
      eyebrow: template.eyebrow || '',
      title: template.title || '',
      intro: template.intro || '',
      bodyHtml: template.bodyHtml || '',
      ctaLabel: template.ctaLabel || '',
      whatsappMessage: template.whatsappMessage || '',
      enabled: template.enabled !== false,
    });
    setMessage('');
    setError('');
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await updateSalesNurtureEmailTemplate(activeSequence, form);
      setMessage(`Correo ${activeSequence} guardado.`);
      await load();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dashboard-card tracking-selector-panel sales-crm-nurture-templates">
      <div className="admin-panel-heading">
        <div>
          <h2>Secuencia de 7 correos (Alianzas educativas)</h2>
          <p>
            Remitente: <strong>{senderEmail || 'alianzaseducativas@comergio.com'}</strong>
            {senderName ? ` · ${senderName}` : ''}. Cada envío incluye pixel de apertura.
          </p>
        </div>
      </div>

      {message ? <p className="admissions-feedback is-success" role="status"><span>{message}</span></p> : null}
      {error ? <p className="admissions-feedback is-error" role="alert"><span>{error}</span></p> : null}

      {loading ? <p className="campus-panel__meta">Cargando plantillas…</p> : null}

      {!loading ? (
        <div className="sales-crm-nurture-templates__layout">
          <nav className="sales-crm-nurture-templates__nav" aria-label="Correos de la secuencia">
            {templates.map((template) => (
              <button
                key={template.sequence}
                type="button"
                className={`sales-crm-nurture-templates__nav-item${activeSequence === template.sequence ? ' is-active' : ''}`}
                onClick={() => selectTemplate(template)}
              >
                <span>Correo {template.sequence}</span>
                <small>{template.label}</small>
              </button>
            ))}
          </nav>

          <form className="sales-crm-nurture-templates__form" onSubmit={save}>
            <p className="sales-crm-withdraw-hint">Variables: {PLACEHOLDER_HELP}. En el cuerpo puedes usar HTML simple (&lt;p&gt;, &lt;ul&gt;, &lt;strong&gt;).</p>
            <label>
              Nombre interno
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} required />
            </label>
            <label>
              Asunto
              <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} required />
            </label>
            <label>
              Eyebrow (banda superior)
              <input value={form.eyebrow} onChange={(e) => setForm((f) => ({ ...f, eyebrow: e.target.value }))} />
            </label>
            <label>
              Título
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            </label>
            <label>
              Intro
              <input value={form.intro} onChange={(e) => setForm((f) => ({ ...f, intro: e.target.value }))} />
            </label>
            <label>
              Cuerpo (HTML)
              <textarea rows={10} value={form.bodyHtml} onChange={(e) => setForm((f) => ({ ...f, bodyHtml: e.target.value }))} required />
            </label>
            <label>
              Texto del botón (CTA)
              <input value={form.ctaLabel} onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))} />
            </label>
            <label>
              Mensaje WhatsApp del botón
              <textarea rows={3} value={form.whatsappMessage} onChange={(e) => setForm((f) => ({ ...f, whatsappMessage: e.target.value }))} />
            </label>
            <label className="sales-crm-nurture-templates__checkbox">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
              Correo activo en la secuencia automática
            </label>
            <div className="admissions-modal-actions">
              <button className="primary-button" disabled={busy} type="submit">{busy ? 'Guardando…' : 'Guardar correo'}</button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
