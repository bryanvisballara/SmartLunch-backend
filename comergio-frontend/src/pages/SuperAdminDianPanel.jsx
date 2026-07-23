import { useEffect, useState } from 'react';
import {
  createDianInvoice,
  getDianConfig,
  listDianInvoices,
  saveDianConfig,
  sendDianInvoice,
  uploadDianCertificate,
} from '../services/superAdmin.service';
import useAuthStore from '../store/auth.store';

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function emptyConfig() {
  return {
    environment: '2',
    supplierName: '',
    supplierNit: '',
    supplierDv: '',
    supplierEmail: '',
    supplierPhone: '',
    supplierAddress: {
      line: '',
      cityCode: '11001',
      cityName: 'Bogotá',
      departmentCode: '11',
      departmentName: 'Bogotá',
      postalCode: '',
    },
    softwareId: '',
    softwarePin: '',
    softwareProviderNit: '',
    softwareProviderName: '',
    testSetId: '',
    authorizationNumber: '',
    prefix: '',
    startNumber: 1,
    endNumber: 1,
    authorizationStartDate: '',
    authorizationEndDate: '',
    technicalKey: '',
    nextNumber: 1,
    defaultServiceDescription: 'Suscripción plataforma Comergio — servicio SaaS escolar',
    certificateConfigured: false,
    certificateFileName: '',
    certificatePasswordConfigured: false,
  };
}

function toDateInput(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

function statusLabel(status) {
  const labels = {
    draft: 'Borrador',
    signed: 'Firmada',
    sent: 'Enviada',
    accepted: 'Aceptada DIAN',
    rejected: 'Rechazada',
    error: 'Error',
  };
  return labels[status] || status;
}

export default function SuperAdminDianPanel({ selectedSchool, selectedDraft }) {
  const token = useAuthStore((state) => state.token);
  const [config, setConfig] = useState(emptyConfig());
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState('');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');
  const [certificateFile, setCertificateFile] = useState(null);
  const [certificatePassword, setCertificatePassword] = useState('');
  const [invoiceDraft, setInvoiceDraft] = useState({
    periodLabel: '',
    periodStart: '',
    periodEnd: '',
    taxPercent: '0',
    description: '',
  });

  const load = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [configResponse, invoicesResponse] = await Promise.all([
        getDianConfig(),
        listDianInvoices({ limit: 40 }),
      ]);
      const nextConfig = configResponse.data?.config || emptyConfig();
      setConfig({
        ...emptyConfig(),
        ...nextConfig,
        authorizationStartDate: toDateInput(nextConfig.authorizationStartDate),
        authorizationEndDate: toDateInput(nextConfig.authorizationEndDate),
        softwarePin: nextConfig.softwarePinConfigured ? nextConfig.softwarePin : '',
        technicalKey: nextConfig.technicalKeyConfigured ? nextConfig.technicalKey : '',
      });
      setInvoices(invoicesResponse.data?.invoices || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'No se pudo cargar facturación DIAN.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateConfigField = (patch) => {
    setConfig((current) => ({ ...current, ...patch }));
  };

  const updateAddressField = (key, value) => {
    setConfig((current) => ({
      ...current,
      supplierAddress: {
        ...(current.supplierAddress || {}),
        [key]: value,
      },
    }));
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await saveDianConfig({
        ...config,
        softwarePin: String(config.softwarePin || '').includes('•') ? undefined : config.softwarePin,
        technicalKey: String(config.technicalKey || '').includes('•') ? undefined : config.technicalKey,
      });
      const nextConfig = response.data?.config || {};
      setConfig((current) => ({
        ...current,
        ...nextConfig,
        authorizationStartDate: toDateInput(nextConfig.authorizationStartDate),
        authorizationEndDate: toDateInput(nextConfig.authorizationEndDate),
        softwarePin: nextConfig.softwarePinConfigured ? nextConfig.softwarePin : current.softwarePin,
        technicalKey: nextConfig.technicalKeyConfigured ? nextConfig.technicalKey : current.technicalKey,
      }));
      setMessage(response.data?.message || 'Configuración guardada.');
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  const uploadCertificate = async () => {
    if (!certificateFile) {
      setMessage('Selecciona el archivo .p12/.pfx del certificado.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const response = await uploadDianCertificate(certificateFile, certificatePassword);
      setConfig((current) => ({ ...current, ...(response.data?.config || {}) }));
      setCertificateFile(null);
      setCertificatePassword('');
      setMessage(response.data?.message || 'Certificado cargado.');
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'No se pudo subir el certificado.');
    } finally {
      setSaving(false);
    }
  };

  const createInvoice = async () => {
    if (!selectedSchool?.schoolId) {
      setMessage('Selecciona un colegio primero.');
      return;
    }
    setCreating(true);
    setMessage('');
    try {
      const response = await createDianInvoice({
        schoolId: selectedSchool.schoolId,
        billingParty: selectedDraft?.billingParty,
        periodLabel: invoiceDraft.periodLabel,
        periodStart: invoiceDraft.periodStart || undefined,
        periodEnd: invoiceDraft.periodEnd || undefined,
        taxPercent: Number(invoiceDraft.taxPercent || 0),
        description: invoiceDraft.description,
        quantity: selectedSchool.activeStudents || 1,
        unitPrice: Number(selectedDraft?.pricePerStudent || 0),
      });
      setInvoices((current) => [response.data.invoice, ...current]);
      setMessage(response.data?.message || 'Borrador creado.');
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'No se pudo crear la factura.');
    } finally {
      setCreating(false);
    }
  };

  const sendInvoice = async (invoiceId) => {
    setSendingId(invoiceId);
    setMessage('');
    try {
      const response = await sendDianInvoice(invoiceId);
      setInvoices((current) => current.map((item) => (
        item.id === invoiceId ? response.data.invoice : item
      )));
      setMessage(response.data?.message || 'Factura enviada.');
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'No se pudo enviar a la DIAN.');
      await load();
    } finally {
      setSendingId('');
    }
  };

  const downloadXml = async (invoiceId, documentNumber) => {
    try {
      const apiBaseUrl = String(import.meta.env.VITE_API_URL || '').trim()
        || (import.meta.env.PROD ? 'https://smartlunch-backend-3uqr.onrender.com' : 'http://localhost:4000');
      const response = await fetch(`${apiBaseUrl}/super-admin/dian/invoices/${encodeURIComponent(invoiceId)}/xml`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || 'No se pudo descargar el XML');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${documentNumber || invoiceId}.xml`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error.message || 'No se pudo descargar el XML');
    }
  };

  return (
    <section className="super-admin-feature-panel super-admin-dian-panel">
      <div className="super-admin-panel-head">
        <div>
          <h3>Facturación electrónica DIAN</h3>
          <p>
            Software propio: configura emisor Comergio, numeración y certificado; luego genera facturas a colegios y envíalas a habilitación/producción.
          </p>
        </div>
        <button className="is-secondary" disabled={loading || saving} onClick={load} type="button">Actualizar</button>
      </div>

      {message ? <p className="super-admin-message">{message}</p> : null}
      {loading ? <p className="super-admin-muted">Cargando módulo DIAN...</p> : null}

      <div className="super-admin-form-grid">
        <label>
          Ambiente
          <select
            onChange={(event) => updateConfigField({ environment: event.target.value })}
            value={config.environment || '2'}
          >
            <option value="2">Habilitación (pruebas)</option>
            <option value="1">Producción</option>
          </select>
        </label>
        <label>
          Razón social emisor
          <input onChange={(event) => updateConfigField({ supplierName: event.target.value })} type="text" value={config.supplierName || ''} />
        </label>
        <label>
          NIT emisor
          <input onChange={(event) => updateConfigField({ supplierNit: event.target.value })} type="text" value={config.supplierNit || ''} />
        </label>
        <label>
          DV
          <input onChange={(event) => updateConfigField({ supplierDv: event.target.value })} type="text" value={config.supplierDv || ''} />
        </label>
        <label>
          Correo emisor
          <input onChange={(event) => updateConfigField({ supplierEmail: event.target.value })} type="email" value={config.supplierEmail || ''} />
        </label>
        <label>
          Teléfono
          <input onChange={(event) => updateConfigField({ supplierPhone: event.target.value })} type="text" value={config.supplierPhone || ''} />
        </label>
        <label className="is-wide">
          Dirección
          <input onChange={(event) => updateAddressField('line', event.target.value)} type="text" value={config.supplierAddress?.line || ''} />
        </label>
        <label>
          Ciudad (DANE)
          <input onChange={(event) => updateAddressField('cityCode', event.target.value)} type="text" value={config.supplierAddress?.cityCode || ''} />
        </label>
        <label>
          Nombre ciudad
          <input onChange={(event) => updateAddressField('cityName', event.target.value)} type="text" value={config.supplierAddress?.cityName || ''} />
        </label>
        <label>
          ID software DIAN
          <input onChange={(event) => updateConfigField({ softwareId: event.target.value })} type="text" value={config.softwareId || ''} />
        </label>
        <label>
          PIN software
          <input onChange={(event) => updateConfigField({ softwarePin: event.target.value })} type="password" value={config.softwarePin || ''} />
        </label>
        <label>
          Test set ID (habilitación)
          <input onChange={(event) => updateConfigField({ testSetId: event.target.value })} type="text" value={config.testSetId || ''} />
        </label>
        <label>
          Resolución numeración
          <input onChange={(event) => updateConfigField({ authorizationNumber: event.target.value })} type="text" value={config.authorizationNumber || ''} />
        </label>
        <label>
          Prefijo
          <input onChange={(event) => updateConfigField({ prefix: event.target.value })} type="text" value={config.prefix || ''} />
        </label>
        <label>
          Desde #
          <input onChange={(event) => updateConfigField({ startNumber: event.target.value })} type="number" value={config.startNumber || 1} />
        </label>
        <label>
          Hasta #
          <input onChange={(event) => updateConfigField({ endNumber: event.target.value })} type="number" value={config.endNumber || 1} />
        </label>
        <label>
          Próximo #
          <input onChange={(event) => updateConfigField({ nextNumber: event.target.value })} type="number" value={config.nextNumber || 1} />
        </label>
        <label>
          Vigencia desde
          <input onChange={(event) => updateConfigField({ authorizationStartDate: event.target.value })} type="date" value={config.authorizationStartDate || ''} />
        </label>
        <label>
          Vigencia hasta
          <input onChange={(event) => updateConfigField({ authorizationEndDate: event.target.value })} type="date" value={config.authorizationEndDate || ''} />
        </label>
        <label className="is-wide">
          Clave técnica
          <input onChange={(event) => updateConfigField({ technicalKey: event.target.value })} type="password" value={config.technicalKey || ''} />
        </label>
        <label className="is-wide">
          Descripción por defecto del servicio
          <input onChange={(event) => updateConfigField({ defaultServiceDescription: event.target.value })} type="text" value={config.defaultServiceDescription || ''} />
        </label>
      </div>

      <div className="super-admin-rectoria-actions">
        <button disabled={saving} onClick={saveConfig} type="button">
          {saving ? 'Guardando...' : 'Guardar configuración DIAN'}
        </button>
        <span className="super-admin-muted">
          Certificado: {config.certificateConfigured ? (config.certificateFileName || 'cargado') : 'pendiente'}
        </span>
      </div>

      <div className="super-admin-form-grid" style={{ marginTop: 16 }}>
        <label>
          Certificado .p12 / .pfx
          <input accept=".p12,.pfx" onChange={(event) => setCertificateFile(event.target.files?.[0] || null)} type="file" />
        </label>
        <label>
          Contraseña certificado
          <input onChange={(event) => setCertificatePassword(event.target.value)} type="password" value={certificatePassword} />
        </label>
      </div>
      <div className="super-admin-rectoria-actions">
        <button disabled={saving} onClick={uploadCertificate} type="button">Subir certificado</button>
      </div>

      <hr className="super-admin-dian-divider" />

      <div className="super-admin-panel-head">
        <div>
          <h3>Factura al colegio seleccionado</h3>
          <p>
            {selectedSchool
              ? `${selectedSchool.schoolName} · ${selectedSchool.activeStudents || 0} alumnos · ${formatCurrency(Number(selectedDraft?.pricePerStudent || 0))} / alumno`
              : 'Selecciona un colegio en la lista izquierda.'}
          </p>
        </div>
      </div>

      <div className="super-admin-form-grid">
        <label>
          Periodo (etiqueta)
          <input
            onChange={(event) => setInvoiceDraft((current) => ({ ...current, periodLabel: event.target.value }))}
            placeholder="Julio 2026"
            type="text"
            value={invoiceDraft.periodLabel}
          />
        </label>
        <label>
          IVA %
          <input
            min="0"
            onChange={(event) => setInvoiceDraft((current) => ({ ...current, taxPercent: event.target.value }))}
            type="number"
            value={invoiceDraft.taxPercent}
          />
        </label>
        <label>
          Desde
          <input
            onChange={(event) => setInvoiceDraft((current) => ({ ...current, periodStart: event.target.value }))}
            type="date"
            value={invoiceDraft.periodStart}
          />
        </label>
        <label>
          Hasta
          <input
            onChange={(event) => setInvoiceDraft((current) => ({ ...current, periodEnd: event.target.value }))}
            type="date"
            value={invoiceDraft.periodEnd}
          />
        </label>
        <label className="is-wide">
          Descripción (opcional)
          <input
            onChange={(event) => setInvoiceDraft((current) => ({ ...current, description: event.target.value }))}
            type="text"
            value={invoiceDraft.description}
          />
        </label>
      </div>
      <div className="super-admin-rectoria-actions">
        <button disabled={creating || !selectedSchool} onClick={createInvoice} type="button">
          {creating ? 'Creando...' : 'Crear borrador de factura'}
        </button>
      </div>

      <div className="super-admin-dian-table-wrap">
        <table className="super-admin-dian-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Colegio</th>
              <th>Total</th>
              <th>Estado</th>
              <th>CUFE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan="6" className="super-admin-muted">Aún no hay facturas.</td>
              </tr>
            ) : invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.documentNumber || '—'}</td>
                <td>{invoice.schoolName}</td>
                <td>{formatCurrency(invoice.payableAmount)}</td>
                <td>{statusLabel(invoice.status)}</td>
                <td className="super-admin-dian-cufe">{invoice.cufe ? `${invoice.cufe.slice(0, 12)}…` : '—'}</td>
                <td className="super-admin-dian-actions">
                  {invoice.status === 'draft' ? (
                    <button disabled={sendingId === invoice.id} onClick={() => sendInvoice(invoice.id)} type="button">
                      {sendingId === invoice.id ? 'Enviando...' : 'Enviar DIAN'}
                    </button>
                  ) : null}
                  {invoice.hasSignedXml ? (
                    <button className="is-secondary" onClick={() => downloadXml(invoice.id, invoice.documentNumber)} type="button">
                      XML
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
