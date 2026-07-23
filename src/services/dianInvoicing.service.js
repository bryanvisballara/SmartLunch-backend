const { DianKit, IdentificationType, PersonType } = require('@dian-kit/sdk-node');
const { runInControlDb } = require('../config/db');
const DianInvoicingConfig = require('../models/dianInvoicingConfig.model');
const DianElectronicInvoice = require('../models/dianElectronicInvoice.model');

function normalizeText(value) {
  return String(value || '').trim();
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Colombian NIT check digit (módulo 11). */
function computeNitDv(nit) {
  const digits = String(nit || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let sum = 0;
  const reversed = digits.split('').reverse();
  for (let index = 0; index < reversed.length; index += 1) {
    sum += Number(reversed[index]) * weights[index];
  }

  const remainder = sum % 11;
  if (remainder === 0 || remainder === 1) {
    return String(remainder);
  }

  return String(11 - remainder);
}

function maskSecret(value) {
  const text = normalizeText(value);
  if (!text) {
    return '';
  }
  if (text.length <= 4) {
    return '••••';
  }
  return `${'•'.repeat(Math.min(12, text.length - 4))}${text.slice(-4)}`;
}

function serializeAddress(address = {}) {
  return {
    line: normalizeText(address.line),
    cityCode: normalizeText(address.cityCode) || '11001',
    cityName: normalizeText(address.cityName) || 'Bogotá',
    postalCode: normalizeText(address.postalCode),
    countryCode: normalizeText(address.countryCode) || 'CO',
    countryName: normalizeText(address.countryName) || 'Colombia',
    departmentCode: normalizeText(address.departmentCode) || '11',
    departmentName: normalizeText(address.departmentName) || 'Bogotá',
  };
}

function serializeBillingParty(party = {}) {
  const nit = normalizeText(party.nit).replace(/\D/g, '');
  return {
    legalName: normalizeText(party.legalName),
    nit,
    dv: normalizeText(party.dv) || computeNitDv(nit),
    email: normalizeText(party.email).toLowerCase(),
    phone: normalizeText(party.phone),
    personType: party.personType === '2' ? '2' : '1',
    fiscalResponsibilities: Array.isArray(party.fiscalResponsibilities) && party.fiscalResponsibilities.length
      ? party.fiscalResponsibilities.map(normalizeText).filter(Boolean)
      : ['R-99-PN'],
    taxLevelCode: normalizeText(party.taxLevelCode) || 'R-99-PN',
    addressLine: normalizeText(party.addressLine),
    cityCode: normalizeText(party.cityCode) || '11001',
    cityName: normalizeText(party.cityName) || 'Bogotá',
    departmentCode: normalizeText(party.departmentCode) || '11',
    departmentName: normalizeText(party.departmentName) || 'Bogotá',
    postalCode: normalizeText(party.postalCode),
  };
}

function serializeConfig(config, { includeSecrets = false } = {}) {
  if (!config) {
    return null;
  }

  return {
    environment: config.environment || '2',
    supplierName: config.supplierName || '',
    supplierNit: config.supplierNit || '',
    supplierDv: config.supplierDv || '',
    supplierEmail: config.supplierEmail || '',
    supplierPhone: config.supplierPhone || '',
    supplierAddress: serializeAddress(config.supplierAddress || {}),
    fiscalResponsibilities: config.fiscalResponsibilities || ['R-99-PN'],
    taxLevelCode: config.taxLevelCode || 'R-99-PN',
    softwareId: config.softwareId || '',
    softwarePin: includeSecrets ? (config.softwarePin || '') : maskSecret(config.softwarePin),
    softwarePinConfigured: Boolean(normalizeText(config.softwarePin)),
    softwareProviderNit: config.softwareProviderNit || '',
    softwareProviderName: config.softwareProviderName || '',
    testSetId: config.testSetId || '',
    authorizationNumber: config.authorizationNumber || '',
    prefix: config.prefix || '',
    startNumber: Number(config.startNumber || 1),
    endNumber: Number(config.endNumber || 1),
    authorizationStartDate: config.authorizationStartDate || null,
    authorizationEndDate: config.authorizationEndDate || null,
    technicalKey: includeSecrets ? (config.technicalKey || '') : maskSecret(config.technicalKey),
    technicalKeyConfigured: Boolean(normalizeText(config.technicalKey)),
    nextNumber: Number(config.nextNumber || config.startNumber || 1),
    certificateFileName: config.certificateFileName || '',
    certificateUploadedAt: config.certificateUploadedAt || null,
    certificateConfigured: Boolean(normalizeText(config.certificateBase64) && normalizeText(config.certificatePassword)),
    certificatePasswordConfigured: Boolean(normalizeText(config.certificatePassword)),
    defaultServiceDescription: config.defaultServiceDescription || '',
    updatedBy: config.updatedBy || '',
    updatedAt: config.updatedAt || null,
  };
}

function serializeInvoice(invoice) {
  if (!invoice) {
    return null;
  }

  return {
    id: String(invoice._id),
    schoolId: invoice.schoolId,
    schoolName: invoice.schoolName,
    documentNumber: invoice.documentNumber,
    prefix: invoice.prefix,
    consecutive: invoice.consecutive,
    environment: invoice.environment,
    status: invoice.status,
    issueDate: invoice.issueDate,
    periodLabel: invoice.periodLabel,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    customerNit: invoice.customerNit,
    customerDv: invoice.customerDv,
    customerName: invoice.customerName,
    customerEmail: invoice.customerEmail,
    lines: invoice.lines || [],
    lineExtensionAmount: invoice.lineExtensionAmount,
    taxAmount: invoice.taxAmount,
    taxPercent: invoice.taxPercent,
    payableAmount: invoice.payableAmount,
    cufe: invoice.cufe,
    dianTrackId: invoice.dianTrackId,
    dianStatusCode: invoice.dianStatusCode,
    dianStatusDescription: invoice.dianStatusDescription,
    errorMessage: invoice.errorMessage,
    sentAt: invoice.sentAt,
    createdBy: invoice.createdBy,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
    hasSignedXml: Boolean(invoice.signedXml),
  };
}

async function getOrCreateConfig() {
  return runInControlDb(async () => {
    let config = await DianInvoicingConfig.findOne({ singletonKey: 'comergio' });
    if (!config) {
      config = await DianInvoicingConfig.create({ singletonKey: 'comergio' });
    }
    return config;
  });
}

async function getPublicConfig() {
  const config = await getOrCreateConfig();
  return serializeConfig(config);
}

async function updateConfig(payload = {}, updatedBy = '') {
  return runInControlDb(async () => {
    const config = await getOrCreateConfig();
    const next = { ...payload };

    if (next.supplierNit !== undefined) {
      config.supplierNit = normalizeText(next.supplierNit).replace(/\D/g, '');
      if (!normalizeText(next.supplierDv)) {
        config.supplierDv = computeNitDv(config.supplierNit);
      }
    }
    if (next.supplierDv !== undefined && normalizeText(next.supplierDv)) {
      config.supplierDv = normalizeText(next.supplierDv);
    }
    if (next.supplierName !== undefined) config.supplierName = normalizeText(next.supplierName);
    if (next.supplierEmail !== undefined) config.supplierEmail = normalizeText(next.supplierEmail).toLowerCase();
    if (next.supplierPhone !== undefined) config.supplierPhone = normalizeText(next.supplierPhone);
    if (next.supplierAddress !== undefined) config.supplierAddress = serializeAddress(next.supplierAddress);
    if (next.fiscalResponsibilities !== undefined) {
      config.fiscalResponsibilities = Array.isArray(next.fiscalResponsibilities)
        ? next.fiscalResponsibilities.map(normalizeText).filter(Boolean)
        : ['R-99-PN'];
    }
    if (next.taxLevelCode !== undefined) config.taxLevelCode = normalizeText(next.taxLevelCode) || 'R-99-PN';
    if (next.environment !== undefined) config.environment = next.environment === '1' ? '1' : '2';
    if (next.softwareId !== undefined) config.softwareId = normalizeText(next.softwareId);
    if (next.softwarePin !== undefined && !String(next.softwarePin).includes('•')) {
      config.softwarePin = normalizeText(next.softwarePin);
    }
    if (next.softwareProviderNit !== undefined) {
      config.softwareProviderNit = normalizeText(next.softwareProviderNit).replace(/\D/g, '');
    }
    if (next.softwareProviderName !== undefined) {
      config.softwareProviderName = normalizeText(next.softwareProviderName);
    }
    if (next.testSetId !== undefined) config.testSetId = normalizeText(next.testSetId);
    if (next.authorizationNumber !== undefined) config.authorizationNumber = normalizeText(next.authorizationNumber);
    if (next.prefix !== undefined) config.prefix = normalizeText(next.prefix).toUpperCase();
    if (next.startNumber !== undefined) config.startNumber = Math.max(1, Number(next.startNumber) || 1);
    if (next.endNumber !== undefined) config.endNumber = Math.max(config.startNumber, Number(next.endNumber) || 1);
    if (next.authorizationStartDate !== undefined) {
      config.authorizationStartDate = next.authorizationStartDate ? new Date(next.authorizationStartDate) : null;
    }
    if (next.authorizationEndDate !== undefined) {
      config.authorizationEndDate = next.authorizationEndDate ? new Date(next.authorizationEndDate) : null;
    }
    if (next.technicalKey !== undefined && !String(next.technicalKey).includes('•')) {
      config.technicalKey = normalizeText(next.technicalKey);
    }
    if (next.nextNumber !== undefined) {
      config.nextNumber = Math.max(config.startNumber, Number(next.nextNumber) || config.startNumber);
    }
    if (next.defaultServiceDescription !== undefined) {
      config.defaultServiceDescription = normalizeText(next.defaultServiceDescription);
    }
    if (next.certificatePassword !== undefined && !String(next.certificatePassword).includes('•')) {
      config.certificatePassword = normalizeText(next.certificatePassword);
    }

    config.updatedBy = normalizeText(updatedBy);
    await config.save();
    return serializeConfig(config);
  });
}

async function uploadCertificate({ buffer, fileName, password }, updatedBy = '') {
  if (!buffer?.length) {
    throw Object.assign(new Error('Debes subir el certificado .p12/.pfx'), { statusCode: 400 });
  }

  return runInControlDb(async () => {
    const config = await getOrCreateConfig();
    config.certificateBase64 = Buffer.from(buffer).toString('base64');
    config.certificateFileName = normalizeText(fileName) || 'certificate.p12';
    config.certificateUploadedAt = new Date();
    if (password && !String(password).includes('•')) {
      config.certificatePassword = normalizeText(password);
    }
    if (!normalizeText(config.certificatePassword)) {
      throw Object.assign(new Error('La contraseña del certificado es obligatoria'), { statusCode: 400 });
    }
    config.updatedBy = normalizeText(updatedBy);
    await config.save();
    return serializeConfig(config);
  });
}

function toDianAddress(address = {}) {
  const normalized = serializeAddress(address);
  return {
    street: normalized.line || 'Sin dirección',
    cityCode: normalized.cityCode,
    cityName: normalized.cityName,
    departmentCode: normalized.departmentCode,
    departmentName: normalized.departmentName,
    countryCode: normalized.countryCode || 'CO',
    countryName: normalized.countryName || 'Colombia',
    postalZone: normalized.postalCode || undefined,
  };
}

function buildPartyFromConfig(config) {
  const nit = normalizeText(config.supplierNit).replace(/\D/g, '');
  const dv = normalizeText(config.supplierDv) || computeNitDv(nit);
  const address = toDianAddress(config.supplierAddress || {});
  const name = normalizeText(config.supplierName);

  return {
    name,
    identification: {
      number: nit,
      type: IdentificationType.NIT,
      dv,
    },
    personType: PersonType.JURIDICA,
    fiscalResponsibilities: config.fiscalResponsibilities?.length ? config.fiscalResponsibilities : ['R-99-PN'],
    taxInfo: {
      registrationName: name,
      companyId: { number: nit, type: IdentificationType.NIT, dv },
      taxLevelCode: normalizeText(config.taxLevelCode) || 'R-99-PN',
      taxScheme: { code: '01' },
      address,
    },
    address,
    email: normalizeText(config.supplierEmail),
    phone: normalizeText(config.supplierPhone),
    corporateRegistration: {
      prefix: normalizeText(config.prefix),
    },
  };
}

function buildPartyFromBilling(party) {
  const billing = serializeBillingParty(party);
  const address = toDianAddress({
    line: billing.addressLine,
    cityCode: billing.cityCode,
    cityName: billing.cityName,
    departmentCode: billing.departmentCode,
    departmentName: billing.departmentName,
    postalCode: billing.postalCode,
  });

  return {
    name: billing.legalName,
    identification: {
      number: billing.nit,
      type: IdentificationType.NIT,
      dv: billing.dv,
    },
    personType: billing.personType === '2' ? PersonType.NATURAL : PersonType.JURIDICA,
    fiscalResponsibilities: billing.fiscalResponsibilities,
    taxInfo: {
      registrationName: billing.legalName,
      companyId: { number: billing.nit, type: IdentificationType.NIT, dv: billing.dv },
      taxLevelCode: billing.taxLevelCode,
      taxScheme: { code: '01' },
      address,
    },
    address,
    email: billing.email,
    phone: billing.phone,
  };
}

function assertConfigReady(config, { requireCertificate = true } = {}) {
  const missing = [];
  if (!config.supplierName) missing.push('razón social emisor');
  if (!config.supplierNit) missing.push('NIT emisor');
  if (!config.softwareId) missing.push('ID software DIAN');
  if (!config.softwarePin) missing.push('PIN software');
  if (!config.prefix) missing.push('prefijo numeración');
  if (!config.authorizationNumber) missing.push('número de resolución');
  if (!config.technicalKey) missing.push('clave técnica');
  if (!config.authorizationStartDate || !config.authorizationEndDate) missing.push('vigencia de numeración');
  if (requireCertificate && (!config.certificateBase64 || !config.certificatePassword)) {
    missing.push('certificado .p12 y contraseña');
  }
  if (missing.length) {
    throw Object.assign(new Error(`Configuración DIAN incompleta: ${missing.join(', ')}`), { statusCode: 400 });
  }
}

function createKitFromConfig(config) {
  assertConfigReady(config, { requireCertificate: true });
  const certificate = Buffer.from(config.certificateBase64, 'base64');
  const providerNit = normalizeText(config.softwareProviderNit) || normalizeText(config.supplierNit);
  const providerName = normalizeText(config.softwareProviderName) || normalizeText(config.supplierName);

  return new DianKit({
    certificate,
    certificatePassword: config.certificatePassword,
    supplier: buildPartyFromConfig(config),
    software: {
      id: config.softwareId,
      pin: config.softwarePin,
      providerNit,
      providerName,
    },
    environment: config.environment === '1' ? '1' : '2',
    numbering: {
      authorizationNumber: config.authorizationNumber,
      prefix: config.prefix,
      startNumber: Number(config.startNumber),
      endNumber: Number(config.endNumber),
      startDate: new Date(config.authorizationStartDate),
      endDate: new Date(config.authorizationEndDate),
      technicalKey: config.technicalKey,
    },
  });
}

function buildInvoiceAmounts({ unitPrice, quantity = 1, taxPercent = 0 }) {
  const safeQuantity = Math.max(1, Number(quantity) || 1);
  const safeUnitPrice = roundMoney(unitPrice);
  const lineExtensionAmount = roundMoney(safeUnitPrice * safeQuantity);
  const safeTaxPercent = Math.max(0, Number(taxPercent) || 0);
  const taxAmount = roundMoney(lineExtensionAmount * (safeTaxPercent / 100));
  const payableAmount = roundMoney(lineExtensionAmount + taxAmount);

  return {
    quantity: safeQuantity,
    unitPrice: safeUnitPrice,
    lineExtensionAmount,
    taxPercent: safeTaxPercent,
    taxAmount,
    payableAmount,
  };
}

async function createDraftInvoice({
  schoolId,
  schoolName,
  billingParty,
  periodLabel,
  periodStart,
  periodEnd,
  unitPrice,
  quantity = 1,
  taxPercent = 0,
  description,
  createdBy = '',
}) {
  const billing = serializeBillingParty(billingParty || {});
  if (!billing.nit || !billing.legalName) {
    throw Object.assign(new Error('El colegio necesita NIT y razón social de facturación'), { statusCode: 400 });
  }

  const amounts = buildInvoiceAmounts({ unitPrice, quantity, taxPercent });
  const config = await getOrCreateConfig();
  const serviceDescription = normalizeText(description)
    || `${config.defaultServiceDescription || 'Suscripción Comergio'}${periodLabel ? ` — ${periodLabel}` : ''}`;

  return runInControlDb(async () => {
    const invoice = await DianElectronicInvoice.create({
      schoolId,
      schoolName: normalizeText(schoolName),
      environment: config.environment || '2',
      status: 'draft',
      periodLabel: normalizeText(periodLabel),
      periodStart: periodStart ? new Date(periodStart) : null,
      periodEnd: periodEnd ? new Date(periodEnd) : null,
      customerNit: billing.nit,
      customerDv: billing.dv,
      customerName: billing.legalName,
      customerEmail: billing.email,
      lines: [{
        description: serviceDescription,
        quantity: amounts.quantity,
        unitPrice: amounts.unitPrice,
        lineExtensionAmount: amounts.lineExtensionAmount,
        taxPercent: amounts.taxPercent,
        taxAmount: amounts.taxAmount,
      }],
      lineExtensionAmount: amounts.lineExtensionAmount,
      taxAmount: amounts.taxAmount,
      taxPercent: amounts.taxPercent,
      payableAmount: amounts.payableAmount,
      createdBy: normalizeText(createdBy),
    });

    return serializeInvoice(invoice);
  });
}

async function listInvoices({ schoolId, limit = 50 } = {}) {
  return runInControlDb(async () => {
    const query = schoolId ? { schoolId } : {};
    const invoices = await DianElectronicInvoice.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(200, Math.max(1, Number(limit) || 50)))
      .lean();
    return invoices.map(serializeInvoice);
  });
}

async function getInvoice(invoiceId) {
  return runInControlDb(async () => {
    const invoice = await DianElectronicInvoice.findById(invoiceId).lean();
    if (!invoice) {
      throw Object.assign(new Error('Factura no encontrada'), { statusCode: 404 });
    }
    return serializeInvoice(invoice);
  });
}

async function getInvoiceXml(invoiceId, { signed = true } = {}) {
  return runInControlDb(async () => {
    const invoice = await DianElectronicInvoice.findById(invoiceId).lean();
    if (!invoice) {
      throw Object.assign(new Error('Factura no encontrada'), { statusCode: 404 });
    }
    const xml = signed ? invoice.signedXml : invoice.unsignedXml;
    if (!xml) {
      throw Object.assign(new Error('Esta factura aún no tiene XML generado'), { statusCode: 400 });
    }
    return {
      documentNumber: invoice.documentNumber,
      cufe: invoice.cufe,
      xml,
    };
  });
}

function mapDianSendResult(response = {}) {
  const statusCode = normalizeText(response.statusCode || response.StatusCode || response.status || '');
  const statusDescription = normalizeText(
    response.statusDescription
    || response.StatusDescription
    || response.statusMessage
    || response.message
    || ''
  );
  const trackId = normalizeText(response.trackId || response.TrackId || '');
  const isAccepted = ['00', '0', 'accepted', 'Approved'].includes(statusCode)
    || /aceptad|approved|success/i.test(statusDescription);

  return {
    statusCode,
    statusDescription,
    trackId,
    isAccepted,
    raw: response,
  };
}

async function sendInvoiceToDian(invoiceId, { createdBy = '', billingParty = null } = {}) {
  return runInControlDb(async () => {
    const config = await getOrCreateConfig();
    assertConfigReady(config, { requireCertificate: true });

    const invoice = await DianElectronicInvoice.findById(invoiceId);
    if (!invoice) {
      throw Object.assign(new Error('Factura no encontrada'), { statusCode: 404 });
    }
    if (['accepted', 'sent'].includes(invoice.status) && invoice.cufe) {
      throw Object.assign(new Error('Esta factura ya fue enviada a la DIAN'), { statusCode: 400 });
    }

    const consecutive = Number(config.nextNumber || config.startNumber || 1);
    if (consecutive > Number(config.endNumber)) {
      throw Object.assign(new Error('Se agotó el rango de numeración autorizado'), { statusCode: 400 });
    }

    const documentNumber = `${normalizeText(config.prefix)}${consecutive}`;
    const issueDate = new Date();
    const line = invoice.lines?.[0] || {};
    const taxPercent = Number(line.taxPercent || invoice.taxPercent || 0);
    const lineExtensionAmount = roundMoney(line.lineExtensionAmount || invoice.lineExtensionAmount);
    const taxAmount = roundMoney(line.taxAmount || invoice.taxAmount);
    const payableAmount = roundMoney(invoice.payableAmount);

    const taxTotals = [{
      taxAmount,
      subtotals: [{
        taxableAmount: lineExtensionAmount,
        taxAmount,
        percent: taxPercent,
        taxScheme: { code: '01' },
      }],
    }];

    const kit = createKitFromConfig(config);
    const customerParty = serializeBillingParty(billingParty || {
      legalName: invoice.customerName,
      nit: invoice.customerNit,
      dv: invoice.customerDv,
      email: invoice.customerEmail,
      addressLine: config.supplierAddress?.line || 'Colombia',
    });

    if (!customerParty.addressLine) {
      customerParty.addressLine = 'Colombia';
    }

    const documentResult = await kit.createInvoice({
      id: documentNumber,
      issueDate,
      issueTime: issueDate,
      customer: buildPartyFromBilling(customerParty),
      lines: [{
        id: '1',
        quantity: Number(line.quantity || 1),
        description: normalizeText(line.description) || config.defaultServiceDescription,
        price: Number(line.unitPrice || 0),
        lineExtensionAmount,
        taxTotals,
      }],
      taxTotals,
      legalMonetaryTotal: {
        lineExtensionAmount,
        taxExclusiveAmount: lineExtensionAmount,
        taxInclusiveAmount: payableAmount,
        allowanceTotalAmount: 0,
        chargeTotalAmount: 0,
        prepaidAmount: 0,
        payableAmount,
      },
      paymentMeans: {
        paymentForm: '1',
        paymentMethod: '47',
      },
      invoicePeriod: invoice.periodStart && invoice.periodEnd
        ? { startDate: new Date(invoice.periodStart), endDate: new Date(invoice.periodEnd) }
        : undefined,
    });

    invoice.documentNumber = documentNumber;
    invoice.prefix = config.prefix;
    invoice.consecutive = consecutive;
    invoice.issueDate = issueDate;
    invoice.environment = config.environment;
    invoice.cufe = documentResult.uuid;
    invoice.unsignedXml = documentResult.xml;
    invoice.signedXml = documentResult.signedXml;
    invoice.status = 'signed';
    invoice.errorMessage = '';
    await invoice.save();

    const sendOptions = config.environment === '2' && normalizeText(config.testSetId)
      ? { method: 'SendTestSetAsync', testSetId: normalizeText(config.testSetId) }
      : { method: 'SendBillSync' };

    let sendResponse;
    try {
      sendResponse = await kit.send(documentResult, sendOptions);
    } catch (error) {
      invoice.status = 'error';
      invoice.errorMessage = error.message || 'Error enviando a DIAN';
      invoice.dianRawResponse = { message: error.message };
      await invoice.save();
      throw Object.assign(new Error(invoice.errorMessage), { statusCode: 502 });
    }

    const mapped = mapDianSendResult(sendResponse);
    invoice.dianTrackId = mapped.trackId;
    invoice.dianStatusCode = mapped.statusCode;
    invoice.dianStatusDescription = mapped.statusDescription;
    invoice.dianRawResponse = mapped.raw;
    invoice.sentAt = new Date();
    invoice.createdBy = normalizeText(createdBy) || invoice.createdBy;

    if (sendOptions.method === 'SendTestSetAsync') {
      invoice.status = 'sent';
    } else if (mapped.isAccepted || mapped.statusCode === '00' || !mapped.statusCode) {
      invoice.status = 'accepted';
    } else {
      invoice.status = 'rejected';
      invoice.errorMessage = mapped.statusDescription || 'DIAN rechazó el documento';
    }

    config.nextNumber = consecutive + 1;
    await config.save();
    await invoice.save();

    return serializeInvoice(invoice);
  });
}

module.exports = {
  computeNitDv,
  serializeBillingParty,
  getPublicConfig,
  updateConfig,
  uploadCertificate,
  createDraftInvoice,
  listInvoices,
  getInvoice,
  getInvoiceXml,
  sendInvoiceToDian,
};
