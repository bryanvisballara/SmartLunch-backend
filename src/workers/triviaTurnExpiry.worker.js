const { expireOverdueMatches } = require('../services/trivia.service');

const POLL_INTERVAL_MS = Number(process.env.TRIVIA_TURN_EXPIRY_POLL_MS || 15 * 60 * 1000);
const ENABLED = String(process.env.TRIVIA_TURN_EXPIRY_ENABLED || 'true').trim().toLowerCase() !== 'false';

let intervalRef = null;
let inProgress = false;

async function runTriviaTurnExpiryCycle() {
  if (!ENABLED || inProgress) {
    return;
  }

  inProgress = true;
  try {
    const expired = await expireOverdueMatches();
    if (expired) {
      console.info(`[TRIVIA_TURN] expired ${expired} overdue match${expired === 1 ? '' : 'es'}`);
    }
  } catch (error) {
    console.warn(`[TRIVIA_TURN] expiry cycle failed: ${error.message || error}`);
  } finally {
    inProgress = false;
  }
}

function startTriviaTurnExpiryWorker() {
  if (!ENABLED) {
    console.info('[TRIVIA_TURN] expiry worker disabled (TRIVIA_TURN_EXPIRY_ENABLED=false)');
    return;
  }

  if (intervalRef) {
    return;
  }

  console.info('[TRIVIA_TURN] expiry worker started (3-day unanswered turns)');
  runTriviaTurnExpiryCycle();
  intervalRef = setInterval(runTriviaTurnExpiryCycle, POLL_INTERVAL_MS);
  if (typeof intervalRef.unref === 'function') {
    intervalRef.unref();
  }
}

module.exports = {
  startTriviaTurnExpiryWorker,
  runTriviaTurnExpiryCycle,
};
