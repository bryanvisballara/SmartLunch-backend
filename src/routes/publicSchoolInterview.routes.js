const express = require('express');
const rateLimit = require('express-rate-limit');
const SchoolProcessInterview = require('../models/schoolProcessInterview.model');
const { analyzeSchoolInterviewWithAi } = require('../services/schoolInterviewAi.service');

const router = express.Router();

const interviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function cleanText(value, max = 240) {
  return String(value || '').trim().slice(0, max);
}

router.post('/analyze', interviewLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const schoolName = cleanText(body.schoolName, 160);
    if (!schoolName) {
      return res.status(400).json({ message: 'Indique el nombre del colegio.' });
    }

    const localReport = body.localReport && typeof body.localReport === 'object' ? body.localReport : null;
    const result = await analyzeSchoolInterviewWithAi({
      schoolName,
      note: cleanText(body.note, 2000),
      questionnaire: Array.isArray(body.questionnaire) ? body.questionnaire : [],
      localReport,
    });

    return res.status(200).json(result);
  } catch (error) {
    const localReport = req.body?.localReport && typeof req.body.localReport === 'object'
      ? req.body.localReport
      : null;
    if (localReport) {
      return res.status(200).json({
        report: { ...localReport, aiEnhanced: false },
        usedAi: false,
        message: error.message || 'No se pudo usar OpenAI; se muestra la lectura local.',
      });
    }
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || 'No se pudo analizar la lectura.',
    });
  }
});

router.post('/', interviewLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const schoolName = cleanText(body.schoolName, 160);
    if (!schoolName) {
      return res.status(400).json({ message: 'Indique el nombre del colegio.' });
    }

    const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
    const report = body.report && typeof body.report === 'object' ? body.report : {};
    const overallScore = Number(report.overall);
    const saved = await SchoolProcessInterview.create({
      schoolName,
      city: cleanText(body.city, 120),
      contactName: cleanText(body.contactName, 160),
      contactRole: cleanText(body.contactRole, 80),
      contactEmail: cleanText(body.contactEmail, 160),
      contactPhone: cleanText(body.contactPhone, 40),
      note: cleanText(body.note, 2000),
      answers,
      report,
      overallScore: Number.isFinite(overallScore) ? overallScore : null,
    });

    return res.status(201).json({ id: String(saved._id) });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'No se pudo guardar la lectura.' });
  }
});

module.exports = router;
