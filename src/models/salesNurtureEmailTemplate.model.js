const mongoose = require('mongoose');

const salesNurtureEmailTemplateSchema = new mongoose.Schema({
  sequence: { type: Number, required: true, min: 1, max: 7, unique: true, index: true },
  label: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  eyebrow: { type: String, default: '', trim: true },
  title: { type: String, required: true, trim: true },
  intro: { type: String, default: '', trim: true },
  bodyHtml: { type: String, required: true, trim: true },
  ctaLabel: { type: String, default: 'Escríbenos por WhatsApp', trim: true },
  whatsappMessage: { type: String, default: '', trim: true },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.models.SalesNurtureEmailTemplate
  || mongoose.model('SalesNurtureEmailTemplate', salesNurtureEmailTemplateSchema);
