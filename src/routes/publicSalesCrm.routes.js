const express = require('express');
const { verifySalesEmailOpenToken, recordSalesEmailOpen } = require('../services/salesCrmEmails.service');

const router = express.Router();

const TRANSPARENT_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

router.get('/email-open/:token', async (req, res) => {
  const parsed = verifySalesEmailOpenToken(req.params.token);
  res.set({
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
  });
  if (parsed) {
    recordSalesEmailOpen(parsed).catch((error) => {
      console.warn(`[SALES_EMAIL_OPEN] failed prospect=${parsed.prospectId}: ${error.message || error}`);
    });
  }
  return res.status(200).send(TRANSPARENT_GIF);
});

module.exports = router;
