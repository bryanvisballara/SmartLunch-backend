const { mongoose, registerSchoolScopedModel } = require('./_schoolModelRegistry');

const invoiceLineSchema = new mongoose.Schema(
  {
    description: { type: String, trim: true, default: '' },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    lineExtensionAmount: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
  },
  { _id: false }
);

const dianElectronicInvoiceSchema = new mongoose.Schema(
  {
    schoolId: { type: String, required: true, index: true, trim: true },
    schoolName: { type: String, trim: true, default: '' },
    documentNumber: { type: String, trim: true, default: '', index: true },
    prefix: { type: String, trim: true, default: '' },
    consecutive: { type: Number, default: null },
    environment: { type: String, enum: ['1', '2'], default: '2' },
    status: {
      type: String,
      enum: ['draft', 'signed', 'sent', 'accepted', 'rejected', 'error'],
      default: 'draft',
      index: true,
    },
    issueDate: { type: Date, default: null },
    periodLabel: { type: String, trim: true, default: '' },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    customerNit: { type: String, trim: true, default: '' },
    customerDv: { type: String, trim: true, default: '' },
    customerName: { type: String, trim: true, default: '' },
    customerEmail: { type: String, trim: true, default: '' },
    lines: { type: [invoiceLineSchema], default: [] },
    lineExtensionAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    taxPercent: { type: Number, default: 0 },
    payableAmount: { type: Number, default: 0 },
    cufe: { type: String, trim: true, default: '', index: true },
    unsignedXml: { type: String, default: '' },
    signedXml: { type: String, default: '' },
    dianTrackId: { type: String, trim: true, default: '' },
    dianStatusCode: { type: String, trim: true, default: '' },
    dianStatusDescription: { type: String, trim: true, default: '' },
    dianRawResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    errorMessage: { type: String, trim: true, default: '' },
    sentAt: { type: Date, default: null },
    createdBy: { type: String, trim: true, default: '' },
  },
  { timestamps: true, collection: 'dianelectronicinvoices' }
);

dianElectronicInvoiceSchema.index({ schoolId: 1, createdAt: -1 });

module.exports = registerSchoolScopedModel('DianElectronicInvoice', dianElectronicInvoiceSchema);
