const { listTenantSchoolContexts, runWithSchoolContext } = require('../config/db');
const { ensureSchoolConsolidatedMonthlyCharges } = require('../services/academicConsolidatedBilling.service');

const POLL_INTERVAL_MS = Number(process.env.ACADEMIC_MONTHLY_BILLING_POLL_MS || 60 * 60 * 1000);

let intervalRef = null;
let inProgress = false;
let lastProcessedMonthKey = '';

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function runAcademicMonthlyBillingCycle({ force = false } = {}) {
  if (inProgress) {
    return;
  }

  const monthKey = currentMonthKey();
  if (!force && monthKey === lastProcessedMonthKey) {
    return;
  }

  inProgress = true;

  try {
    const tenantContexts = await listTenantSchoolContexts();
    for (const tenantContext of tenantContexts) {
      await runWithSchoolContext(tenantContext.schoolId, async () => {
        await ensureSchoolConsolidatedMonthlyCharges({
          schoolId: tenantContext.schoolId,
          referenceDate: new Date(),
          sendNotification: true,
          schoolName: 'Comergio',
        });
      });
    }
    lastProcessedMonthKey = monthKey;
  } catch (error) {
    console.warn(`[ACADEMIC_MONTHLY_BILLING_WORKER] error=${error.message}`);
  } finally {
    inProgress = false;
  }
}

function startAcademicMonthlyBillingWorker() {
  if (intervalRef) {
    return;
  }

  runAcademicMonthlyBillingCycle({ force: true }).catch((error) => {
    console.warn(`[ACADEMIC_MONTHLY_BILLING_WORKER] bootstrap error=${error.message}`);
  });

  intervalRef = setInterval(() => {
    runAcademicMonthlyBillingCycle().catch((error) => {
      console.warn(`[ACADEMIC_MONTHLY_BILLING_WORKER] cycle error=${error.message}`);
    });
  }, POLL_INTERVAL_MS);
}

module.exports = {
  runAcademicMonthlyBillingCycle,
  startAcademicMonthlyBillingWorker,
};
