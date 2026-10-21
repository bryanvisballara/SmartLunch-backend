const { runWithSchoolContext } = require('../config/db');
const DemoLead = require('../models/demoLead.model');
const DemoScheduledPush = require('../models/demoScheduledPush.model');
const DeviceToken = require('../models/deviceToken.model');
const { queueNotificationsForParents } = require('../services/notification.service');
const { deleteDemo } = require('../services/demoSchool.service');
const { FOLLOW_UP_DAYS, buildUnsubscribeUrl, sendDemoFollowUpEmail } = require('../services/demoEmails.service');

const PUSH_POLL_INTERVAL_MS = Number(process.env.DEMO_PUSH_POLL_MS || 15 * 1000);
const EXPIRY_POLL_INTERVAL_MS = Number(process.env.DEMO_EXPIRY_POLL_MS || 60 * 60 * 1000);
const FOLLOW_UP_POLL_INTERVAL_MS = Number(process.env.DEMO_FOLLOW_UP_POLL_MS || 10 * 60 * 1000);
const MAX_PUSH_ATTEMPTS = 5;
const ENABLED = String(process.env.DEMO_WORKER_ENABLED || 'true').trim().toLowerCase() !== 'false';

let pushTimer = null;
let expiryTimer = null;
let pushInProgress = false;
let expiryInProgress = false;
let followUpInProgress = false;
let followUpTimer = null;

async function sendDuePushes() {
  if (pushInProgress) {
    return;
  }
  pushInProgress = true;
  try {
    const due = await DemoScheduledPush.find({
      status: 'pending',
      sendAt: { $lte: new Date() },
    }).sort({ sendAt: 1 }).limit(20);

    for (const push of due) {
      try {
        const tokenCount = await runWithSchoolContext(push.schoolId, () => DeviceToken.countDocuments({
          schoolId: push.schoolId,
          userId: push.parentUserId,
          status: 'active',
        }));
        push.attempts += 1;
        if (!tokenCount) {
          if (push.attempts >= MAX_PUSH_ATTEMPTS) {
            push.status = 'failed';
            push.lastError = 'no_device_token';
          } else {
            push.sendAt = new Date(Date.now() + 30 * 1000);
          }
          await push.save();
          continue;
        }

        // Creates the in-app notification once; FCM retries go through the regular queue.
        const result = await queueNotificationsForParents({
          schoolId: push.schoolId,
          parentIds: [push.parentUserId],
          studentId: push.studentId,
          title: push.title,
          body: push.body,
          payload: { ...(push.payload || {}), audience: 'parent' },
        });
        const delivered = Number(result?.directDelivered || 0) > 0;
        push.status = delivered ? 'sent' : 'failed';
        push.sentAt = delivered ? new Date() : null;
        push.lastError = delivered ? '' : `direct_failed queued=${result?.queuedCount || 0}`;
        await push.save();
      } catch (error) {
        push.attempts += 1;
        push.lastError = String(error.message || error).slice(0, 300);
        if (push.attempts >= MAX_PUSH_ATTEMPTS) {
          push.status = 'failed';
        } else {
          push.sendAt = new Date(Date.now() + 30 * 1000);
        }
        await push.save();
      }
    }
  } catch (error) {
    console.warn(`[DEMO_PUSH] cycle failed: ${error.message || error}`);
  } finally {
    pushInProgress = false;
  }
}

async function expireOldDemos() {
  if (expiryInProgress) {
    return;
  }
  expiryInProgress = true;
  try {
    const expired = await DemoLead.find({
      status: { $in: ['ready', 'failed'] },
      expiresAt: { $lte: new Date() },
    }).select('_id demoSchoolId').limit(20);

    for (const lead of expired) {
      try {
        await deleteDemo(lead._id, { reason: 'expired' });
        console.info(`[DEMO_EXPIRY] removed ${lead.demoSchoolId}`);
      } catch (error) {
        console.warn(`[DEMO_EXPIRY] failed for ${lead.demoSchoolId}: ${error.message || error}`);
      }
    }
  } catch (error) {
    console.warn(`[DEMO_EXPIRY] cycle failed: ${error.message || error}`);
  } finally {
    expiryInProgress = false;
  }
}

const FOLLOW_UP_SEND_HOUR = 9;
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;

function bogotaDayNumber(date) {
  return Math.floor((new Date(date).getTime() + BOGOTA_OFFSET_MS) / (24 * 60 * 60 * 1000));
}

function bogotaHour(date) {
  return new Date(new Date(date).getTime() + BOGOTA_OFFSET_MS).getUTCHours();
}

async function sendDueFollowUpEmails() {
  if (followUpInProgress) {
    return;
  }
  followUpInProgress = true;
  try {
    const now = new Date();
    if (bogotaHour(now) < FOLLOW_UP_SEND_HOUR) {
      return;
    }
    const leads = await DemoLead.find({
      status: 'ready',
      followUpUnsubscribedAt: null,
      createdAt: { $gte: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000) },
    }).select('_id email contactName schoolName createdAt followUpEmails').lean();

    for (const lead of leads) {
      const day = bogotaDayNumber(now) - bogotaDayNumber(lead.createdAt);
      if (!FOLLOW_UP_DAYS.includes(day)) {
        continue;
      }
      const claimed = await DemoLead.updateOne(
        { _id: lead._id, 'followUpEmails.day': { $ne: day } },
        { $push: { followUpEmails: { day, sentAt: new Date() } } },
      );
      if (!claimed.modifiedCount) {
        continue;
      }
      try {
        await sendDemoFollowUpEmail(day, {
          email: lead.email,
          contactName: lead.contactName,
          schoolName: lead.schoolName,
          unsubscribeUrl: buildUnsubscribeUrl(lead._id),
        });
        console.info(`[DEMO_FOLLOW_UP] day ${day} sent to ${lead.email}`);
      } catch (error) {
        await DemoLead.updateOne({ _id: lead._id }, { $pull: { followUpEmails: { day } } });
        console.warn(`[DEMO_FOLLOW_UP] day ${day} failed for ${lead.email}: ${error.message || error}`);
      }
    }
  } catch (error) {
    console.warn(`[DEMO_FOLLOW_UP] cycle failed: ${error.message || error}`);
  } finally {
    followUpInProgress = false;
  }
}

function startDemoSchoolWorker() {
  if (!ENABLED || pushTimer) {
    return;
  }

  console.info('[DEMO] worker started (scheduled pushes + follow-up emails + expiry)');
  sendDuePushes();
  expireOldDemos();
  sendDueFollowUpEmails();
  pushTimer = setInterval(sendDuePushes, PUSH_POLL_INTERVAL_MS);
  expiryTimer = setInterval(expireOldDemos, EXPIRY_POLL_INTERVAL_MS);
  followUpTimer = setInterval(sendDueFollowUpEmails, FOLLOW_UP_POLL_INTERVAL_MS);
  [pushTimer, expiryTimer, followUpTimer].forEach((timer) => {
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  });
}

module.exports = {
  startDemoSchoolWorker,
  sendDuePushes,
  sendDueFollowUpEmails,
  expireOldDemos,
};
