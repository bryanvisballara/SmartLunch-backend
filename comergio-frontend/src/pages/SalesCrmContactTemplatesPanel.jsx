import { useCallback, useEffect, useState } from 'react';
import {
  createSalesContactTemplate,
  deleteSalesContactTemplate,
  getSalesContactTemplates,
  updateSalesContactTemplate,
} from '../services/salesCrm.service';

const CHANNEL_OPTIONS = [
  { value: 'both', label: 'WhatsApp y correo' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Correo' },
];

function channelLabel(value) {
  return CHANNEL_OPTIONS.find((o) => o.value === value)?.label || 'WhatsApp y correo';
}

function whatsappLink(phone, text) {
  const base = phone ? whatsappPhoneHref(phone) : 'https://wa.me/';
  if (!text) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}text=${encodeURIComponent(text)}`;
}

function whatsappPhoneHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('57') && digits.length >= 12) {
    return `https://wa.me/${digits}`;
  }
  if (digits.length === 10) {
    return `https://wa.me/57${digits}`;
  }
  return digits.length >= 10 ? `https://wa.me/57${digits.slice(-10)}` : '';
}

function mailtoLink(email, subject, body) {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  const to = String(email || '').trim();
  return query ? `mailto:${to}?${query}` : (to ? `mailto:${to}` : `mailto:?${query}`);
}

const emptyForm = { name: '', body: '', channel: 'both' };

export default function SalesCrmContactTemplatesPanel({ contactHint = null }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState([]);
  const [viewerTemplate, setViewerTemplate] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await getSalesContactTemplates();
      setTemplates(data?.templates || []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudieron cargar las plantillas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const openViewer = (template) => {
    setCopied(false);
    setViewerTemplate(template);
  };

  const closeViewer = () => {
    setViewerTemplate(null);
    setCopied(false);
  };

  const openCreate = () => {
    setEditingId('');
    setForm(emptyForm);
    setShowEditor(true);
  };

  const openEdit = (template, event) => {
    event?.stopPropagation?.();
    setEditingId(template.id);
    setForm({
      name: template.name || '',
      body: template.body || '',
      channel: template.channel || 'both',
    });
    setShowEditor(true);
  };

  const closeEditor = () => {
    setShowEditor(false);
    setEditingId('');
    setForm(emptyForm);
  };

  const copyBody = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setMessage('Mensaje copiado al portapapeles.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('No se pudo copiar. Selecciona el texto manualmente.');
    }
  };

  const submitForm = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (editingId) {
        const { data } = await updateSalesContactTemplate(editingId, form);
        setTemplates((prev) => prev.map((t) => (t.id === editingId ? data.template : t)));
        setMessage('Plantilla actualizada.');
      } else {
        const { data } = await createSalesContactTemplate(form);
        setTemplates((prev) => [...prev, data.template].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name)));
        setMessage('Plantilla creada.');
      }
      closeEditor();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo guardar la plantilla.');
    } finally {
      setBusy(false);
    }
  };

  const removeTemplate = async (template, event) => {
    event?.stopPropagation?.();
    if (!window.confirm(`¿Eliminar la plantilla «${template.name}»?`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteSalesContactTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      if (viewerTemplate?.id === template.id) closeViewer();
      setMessage('Plantilla eliminada.');
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'No se pudo eliminar.');
    } finally {
      setBusy(false);
    }
  };

  const viewerBody = viewerTemplate?.body || '';
  const hintPhone = contactHint?.contactPhone || '';
  const hintEmail = contactHint?.contactEmail || '';
  const mailSubject = viewerTemplate?.name ? `Comergio — ${viewerTemplate.name}` : 'Comergio';
  const showWhatsapp = viewerTemplate && (viewerTemplate.channel === 'whatsapp' || viewerTemplate.channel === 'both');
  const showEmail = viewerTemplate && (viewerTemplate.channel === 'email' || viewerTemplate.channel === 'both');

  return (
    <section className="dashboard-card sales-crm-templates-panel">
      <div className="admin-panel-heading">
        <div>
          <h2>Plantillas de contacto</h2>
          <p>Mensajes listos para copiar y enviar por WhatsApp o correo.</p>
        </div>
        <button className="primary-button admissions-primary" type="button" onClick={openCreate}>
          + Plantilla
        </button>
      </div>

      {message ? <p className="admissions-feedback is-success" role="status"><span>{message}</span></p> : null}
      {error ? <p className="admissions-feedback is-error" role="alert"><span>{error}</span></p> : null}

      {loading ? <p className="sales-crm-templates-loading">Cargando plantillas…</p> : null}

      {!loading && !templates.length ? (
        <div className="empty-state sales-crm-templates-empty">
          Aún no hay plantillas. Crea la primera para agilizar el contacto con colegios.
        </div>
      ) : null}

      {!loading && templates.length ? (
        <ul className="sales-crm-templates-grid">
          {templates.map((template) => (
            <li key={template.id}>
              <button
                className="sales-crm-template-card"
                type="button"
                onClick={() => openViewer(template)}
              >
                <span className="sales-crm-template-channel">{channelLabel(template.channel)}</span>
                <strong>{template.name}</strong>
                <small>{template.body.slice(0, 120)}{template.body.length > 120 ? '…' : ''}</small>
              </button>
              <div className="sales-crm-template-card-actions">
                <button type="button" aria-label={`Editar ${template.name}`} onClick={(e) => openEdit(template, e)}>✎</button>
                <button type="button" aria-label={`Eliminar ${template.name}`} disabled={busy} onClick={(e) => removeTemplate(template, e)}>×</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {viewerTemplate ? (
        <div className="admissions-modal-backdrop" role="presentation" onClick={closeViewer}>
          <section
            className="dashboard-card admissions-create-modal sales-crm-template-viewer"
            role="dialog"
            aria-labelledby="sales-crm-template-viewer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="sales-crm-template-viewer-title">{viewerTemplate.name}</h2>
            <p className="sales-crm-template-viewer-meta">{channelLabel(viewerTemplate.channel)}</p>
            <pre className="sales-crm-template-body">{viewerBody}</pre>
            <div className="sales-crm-template-viewer-actions">
              <button
                className="primary-button admissions-primary"
                type="button"
                onClick={() => copyBody(viewerBody)}
              >
                {copied ? 'Copiado ✓' : 'Copiar mensaje'}
              </button>
              {showWhatsapp ? (
                <a
                  className="sales-crm-whatsapp-btn"
                  href={whatsappLink(hintPhone, viewerBody)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Abrir WhatsApp
                </a>
              ) : null}
              {showEmail ? (
                <a
                  className="secondary-button sales-crm-email-btn"
                  href={mailtoLink(hintEmail, mailSubject, viewerBody)}
                >
                  Abrir correo
                </a>
              ) : null}
              <button className="secondary-button" type="button" onClick={closeViewer}>Cerrar</button>
            </div>
            {contactHint?.schoolName ? (
              <p className="sales-crm-template-hint">
                Enviando en contexto de: <strong>{contactHint.schoolName}</strong>
                {!hintPhone && !hintEmail ? ' (sin teléfono/correo en ficha — abrirás el canal vacío)' : null}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}

      {showEditor ? (
        <div className="admissions-modal-backdrop" role="presentation" onClick={closeEditor}>
          <section className="dashboard-card admissions-create-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>{editingId ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
            <form onSubmit={submitForm}>
              <label>
                <span>Nombre</span>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Primer contacto Instagram"
                />
              </label>
              <label>
                <span>Canal sugerido</span>
                <select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
                  {CHANNEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Mensaje</span>
                <textarea
                  required
                  rows={10}
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Escribe el texto que copiarás o enviarás…"
                />
              </label>
              <div className="admissions-modal-actions">
                <button className="secondary-button" type="button" onClick={closeEditor}>Cancelar</button>
                <button className="primary-button" disabled={busy} type="submit">{editingId ? 'Guardar' : 'Crear'}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}
