const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  getPrimerContactoAvailability,
  submitPrimerContacto,
} = require('../services/primerContacto.service');

const router = express.Router();

const primerContactoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/availability', primerContactoLimiter, async (req, res) => {
  try {
    const availability = await getPrimerContactoAvailability({
      from: req.query.from,
      days: req.query.days,
    });
    return res.status(200).json(availability);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || 'No se pudo cargar la agenda de admisiones.',
    });
  }
});

router.post('/', primerContactoLimiter, async (req, res) => {
  try {
    const result = await submitPrimerContacto(req.body || {});
    return res.status(201).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || 'No se pudo registrar el primer contacto.',
    });
  }
});

module.exports = router;
