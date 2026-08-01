const { runScheduledInformaDraftJob, getBogotaParts } = require('../services/informaAuto.service');

const POLL_INTERVAL_MS = Number(process.env.INFORMA_AUTO_POLL_MS || 60_000);
const ENABLED = String(process.env.INFORMA_AUTO_ENABLED || 'true').trim().toLowerCase() !== 'false';

let intervalRef = null;
let inProgress = false;

async function runInformaAutoCycle() {
  if (!ENABLED || inProgress) {
    return;
  }

  inProgress = true;
  try {
    const result = await runScheduledInformaDraftJob(new Date());
    if (result?.ran) {
      console.info(`[INFORMA_AUTO] draft generated slot=${result.slotKey} id=${result.draft?.id || 'n/a'}`);
    }
  } catch (error) {
    const bogota = getBogotaParts(new Date());
    console.warn(`[INFORMA_AUTO] ${bogota.dateKey} ${bogota.hour}:${String(bogota.minute).padStart(2, '0')} failed: ${error.message || error}`);
  } finally {
    inProgress = false;
  }
}

function startInformaAutoWorker() {
  if (!ENABLED) {
    console.info('[INFORMA_AUTO] worker disabled (INFORMA_AUTO_ENABLED=false)');
    return;
  }

  if (intervalRef) {
    return;
  }

  console.info('[INFORMA_AUTO] worker started (07:00 and 12:00 America/Bogota, 1 draft each)');
  runInformaAutoCycle();
  intervalRef = setInterval(runInformaAutoCycle, POLL_INTERVAL_MS);
  if (typeof intervalRef.unref === 'function') {
    intervalRef.unref();
  }
}

module.exports = {
  startInformaAutoWorker,
  runInformaAutoCycle,
};
