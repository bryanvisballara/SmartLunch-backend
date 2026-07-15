const ParentStudentLink = require('../models/parentStudentLink.model');
const Wallet = require('../models/wallet.model');
const Notification = require('../models/notification.model');
const DeviceToken = require('../models/deviceToken.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const { runWithSchoolContext } = require('../config/db');
const { enqueueNotificationJobs } = require('../config/queue');
const { sendPushToParent } = require('./push.service');

function withTimeout(promise, timeoutMs, timeoutMessage) {
  const parsedTimeout = Number(timeoutMs || 0);
  if (!Number.isFinite(parsedTimeout) || parsedTimeout <= 0) {
    return promise;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage || 'Operation timed out'));
    }, parsedTimeout);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('es-CO');
}

function buildPurchaseBody({ items, total, remainingBalance }) {
  const lines = items.map((item) => `- ${item.nameSnapshot} $${formatCurrency(item.subtotal)}`).join('\n');

  return [
    'Detalle de la compra:',
    lines,
    '',
    `Total compra: $${formatCurrency(total)}`,
    `Saldo restante: $${formatCurrency(remainingBalance)}`,
  ].join('\n');
}

async function queueOrderCreatedNotifications({ schoolId, student, order }) {
  return runWithSchoolContext(schoolId, async () => {
    const parentLinks = await ParentStudentLink.find({
      schoolId,
      studentId: student._id,
      status: 'active',
    }).select('parentId');

    const wallet = await Wallet.findOne({ schoolId, studentId: student._id }).select('balance');
    const remainingBalance = wallet?.balance || 0;
    const childName = firstName(student.name);
    const body = buildPurchaseBody({
      items: order.items,
      total: order.total,
      remainingBalance,
    });
    const payload = {
      type: 'order.created',
      orderId: order._id,
      studentId: student._id,
      total: order.total,
      remainingBalance,
      paymentMethod: order.paymentMethod,
    };

    const results = [];
    if (parentLinks.length) {
      results.push(await queueNotificationsForParents({
        schoolId,
        parentIds: parentLinks.map((link) => link.parentId),
        studentId: student._id,
        orderId: order._id,
        title: `${childName} ha realizado una compra`,
        body,
        payload,
      }));
    }

    results.push(await queueStudentUserNotification({
      schoolId,
      studentId: student._id,
      title: 'Compra en cafetería',
      body,
      payload,
    }));

    return summarizeNotificationResults(results);
  });
}

async function queueNotificationsForParents({
  schoolId,
  parentIds,
  studentId = null,
  orderId = null,
  title,
  body,
  payload = {},
}) {
  return runWithSchoolContext(schoolId, async () => {
    const normalizedParentIds = (parentIds || []).filter(Boolean);
    if (!normalizedParentIds.length) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const notifications = normalizedParentIds.map((parentId) => ({
      schoolId,
      studentId,
      parentId,
      orderId,
      title,
      body,
      payload,
      status: 'pending',
    }));

    const insertedNotifications = await Notification.insertMany(notifications);

    const tokensFound = await DeviceToken.countDocuments({
      schoolId,
      userId: { $in: normalizedParentIds },
      status: 'active',
    });

    const directDelivery = { attempted: insertedNotifications.length > 0, delivered: 0, failed: 0 };
    const retryJobs = [];

    for (const notification of insertedNotifications) {
      try {
        const delivery = await sendPushToParent({
          schoolId,
          parentId: notification.parentId,
          title: notification.title,
          body: notification.body,
          payload: notification.payload,
        });

        if (delivery.delivered) {
          directDelivery.delivered += 1;
          console.info(`[PUSH_SENT] notificationId=${notification._id} parentId=${notification.parentId}`);
          await Notification.updateOne(
            { _id: notification._id },
            { status: 'sent', sentAt: new Date(), lastError: null }
          );
          continue;
        }

        directDelivery.failed += 1;
        const reason = delivery.reason || 'Push delivery failed';
        console.warn(`[PUSH_FAILED] notificationId=${notification._id} parentId=${notification.parentId} reason=${reason}`);
        await Notification.updateOne(
          { _id: notification._id },
          { status: 'failed', lastError: reason }
        );

        retryJobs.push({
          notificationId: String(notification._id),
          schoolId,
          parentId: String(notification.parentId),
        });
      } catch (directError) {
        directDelivery.failed += 1;
        const reason = directError.message || 'Direct push delivery failed';
        await Notification.updateOne(
          { _id: notification._id },
          { status: 'failed', lastError: reason }
        );

        retryJobs.push({
          notificationId: String(notification._id),
          schoolId,
          parentId: String(notification.parentId),
        });
      }
    }

    let queueResult = { queued: true, reason: 'all_delivered_direct', count: 0 };
    if (retryJobs.length) {
      try {
        queueResult = await withTimeout(
          enqueueNotificationJobs(retryJobs),
          process.env.NOTIFICATION_QUEUE_TIMEOUT_MS || 2500,
          'Notification queue timeout'
        );
      } catch (queueError) {
        queueResult = {
          queued: false,
          reason: queueError.message || 'enqueue_failed',
          count: 0,
        };
      }
    }

    return {
      notificationsCreated: notifications.length,
      tokensFound,
      queued: queueResult.queued,
      queuedCount: queueResult.count || 0,
      queueReason: queueResult.reason || null,
      directAttempted: directDelivery.attempted,
      directDelivered: directDelivery.delivered,
      directFailed: directDelivery.failed,
    };
  });
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'El alumno';
}

function summarizeNotificationResults(results = []) {
  return results.reduce((summary, result) => ({
    notificationsCreated: summary.notificationsCreated + Number(result?.notificationsCreated || 0),
    tokensFound: summary.tokensFound + Number(result?.tokensFound || 0),
    queuedCount: summary.queuedCount + Number(result?.queuedCount || 0),
    directDelivered: summary.directDelivered + Number(result?.directDelivered || 0),
    directFailed: summary.directFailed + Number(result?.directFailed || 0),
  }), {
    notificationsCreated: 0,
    tokensFound: 0,
    queuedCount: 0,
    directDelivered: 0,
    directFailed: 0,
  });
}

function normalizeStudentNotificationRef(student) {
  const rawId = student?._id || student?.studentId || student?.id || student;
  const studentId = rawId ? String(rawId) : '';
  if (!studentId) {
    return null;
  }

  return {
    ...((student && typeof student === 'object') ? student : {}),
    studentId,
  };
}

async function queueStudentUserNotification({ schoolId, studentId, title, body, payload = {} }) {
  return runWithSchoolContext(schoolId, async () => {
    if (!studentId) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const studentUser = await User.findOne({
      schoolId,
      role: 'student',
      linkedStudentId: studentId,
      status: 'active',
      deletedAt: null,
    }).select('_id').lean();

    if (!studentUser?._id) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    return queueNotificationsForParents({
      schoolId,
      parentIds: [studentUser._id],
      studentId,
      title,
      body,
      payload: {
        audience: 'student',
        studentId: String(studentId),
        ...payload,
      },
    });
  });
}

async function queueStudentUserNotifications({ schoolId, students = [], buildNotification }) {
  return runWithSchoolContext(schoolId, async () => {
    if (typeof buildNotification !== 'function') {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const uniqueStudents = [];
    const seenStudentIds = new Set();
    for (const item of students) {
      const normalized = normalizeStudentNotificationRef(item);
      if (!normalized || seenStudentIds.has(normalized.studentId)) {
        continue;
      }
      seenStudentIds.add(normalized.studentId);
      uniqueStudents.push(normalized);
    }

    if (!uniqueStudents.length) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const results = [];
    for (const student of uniqueStudents) {
      const notification = buildNotification(student) || {};
      if (!notification.title || !notification.body) {
        continue;
      }

      results.push(await queueStudentUserNotification({
        schoolId,
        studentId: student.studentId,
        title: notification.title,
        body: notification.body,
        payload: notification.payload || {},
      }));
    }

    return summarizeNotificationResults(results);
  });
}

async function queueStudentParentNotification({ schoolId, studentId, title, body, payload = {} }) {
  return runWithSchoolContext(schoolId, async () => {
    if (!studentId) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const parentLinks = await ParentStudentLink.find({
      schoolId,
      studentId,
      status: 'active',
    }).select('parentId').lean();

    const parentIds = [...new Set(parentLinks.map((link) => String(link.parentId || '')).filter(Boolean))];
    if (!parentIds.length) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    return queueNotificationsForParents({
      schoolId,
      parentIds,
      studentId,
      title,
      body,
      payload: {
        studentId,
        ...payload,
      },
    });
  });
}

async function queueStudentParentNotifications({ schoolId, students = [], buildNotification }) {
  return runWithSchoolContext(schoolId, async () => {
    if (typeof buildNotification !== 'function') {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const uniqueStudents = [];
    const seenStudentIds = new Set();
    for (const item of students) {
      const normalized = normalizeStudentNotificationRef(item);
      if (!normalized || seenStudentIds.has(normalized.studentId)) {
        continue;
      }
      seenStudentIds.add(normalized.studentId);
      uniqueStudents.push(normalized);
    }

    if (!uniqueStudents.length) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const links = await ParentStudentLink.find({
      schoolId,
      studentId: { $in: uniqueStudents.map((student) => student.studentId) },
      status: 'active',
    }).select('studentId parentId').lean();

    const parentIdsByStudentId = new Map();
    for (const link of links) {
      const key = String(link.studentId || '');
      const parentId = String(link.parentId || '');
      if (!key || !parentId) {
        continue;
      }
      const parentIds = parentIdsByStudentId.get(key) || new Set();
      parentIds.add(parentId);
      parentIdsByStudentId.set(key, parentIds);
    }

    const results = [];
    for (const student of uniqueStudents) {
      const parentIds = [...(parentIdsByStudentId.get(student.studentId) || [])];
      if (!parentIds.length) {
        continue;
      }

      const notification = buildNotification(student) || {};
      if (!notification.title || !notification.body) {
        continue;
      }

      results.push(await queueNotificationsForParents({
        schoolId,
        parentIds,
        studentId: student.studentId,
        title: notification.title,
        body: notification.body,
        payload: {
          studentId: student.studentId,
          ...(notification.payload || {}),
        },
      }));
    }

    return summarizeNotificationResults(results);
  });
}

async function queueLowBalanceAlertNotification({ schoolId, student, balance, threshold }) {
  return runWithSchoolContext(schoolId, async () => {
    if (!student?._id) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const parentLinks = await ParentStudentLink.find({
      schoolId,
      studentId: student._id,
      status: 'active',
    }).select('parentId');

    if (!parentLinks.length) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const parentIds = parentLinks.map((link) => link.parentId);
    const childName = firstName(student.name);
    const normalizedThreshold = String(threshold || 'lt20');

    const messageByThreshold = {
      lt20: {
        title: `A ${childName} le quedan menos de $20,000`,
        body: `${childName} tiene bajo saldo y se puede quedar sin merendar. Recarga cuanto antes.`,
      },
      lt10: {
        title: `Ultimo aviso de saldo para ${childName}`,
        body: `Ultimo aviso! ${childName} esta a punto de quedarse sin saldo. Recarga AHORA!`,
      },
    };

    const message = messageByThreshold[normalizedThreshold] || messageByThreshold.lt20;

    return queueNotificationsForParents({
      schoolId,
      parentIds,
      studentId: student._id,
      title: message.title,
      body: message.body,
      payload: {
        type: 'wallet.low_balance',
        studentId: student._id,
        threshold: normalizedThreshold,
        balance,
      },
    });
  });
}

async function queueAutoDebitRechargeNotification({ schoolId, studentId, amount, newBalance, method = '' }) {
  return runWithSchoolContext(schoolId, async () => {
    if (!studentId) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const student = await Student.findOne({ _id: studentId, schoolId, deletedAt: null }).select('name').lean();
    if (!student) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const parentLinks = await ParentStudentLink.find({
      schoolId,
      studentId,
      status: 'active',
    }).select('parentId');

    if (!parentLinks.length) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const parentIds = parentLinks.map((link) => link.parentId);
    const childName = firstName(student.name);
    const rechargeAmount = Number(amount || 0);

    return queueNotificationsForParents({
      schoolId,
      parentIds,
      studentId,
      title: 'Recarga exitosa!',
      body: `se han acreditado $${formatCurrency(rechargeAmount)} a ${childName}.`,
      payload: {
        type: 'wallet.recharge',
        studentId,
        amount: rechargeAmount,
        balance: newBalance,
        method,
      },
    }).then(async (parentResult) => {
      const studentResult = await queueStudentUserNotification({
        schoolId,
        studentId,
        title: 'Recarga exitosa!',
        body: `Se acreditaron $${formatCurrency(rechargeAmount)} a tu saldo.`,
        payload: {
          type: 'wallet.recharge',
          studentId,
          amount: rechargeAmount,
          balance: newBalance,
          method,
        },
      });
      return summarizeNotificationResults([parentResult, studentResult]);
    });
  });
}

async function queueTutorCommentNotification({
  schoolId,
  parentId,
  studentId = null,
  childName,
  tutorName,
  observations,
  date,
}) {
  return runWithSchoolContext(schoolId, async () => {
    if (!parentId || !String(observations || '').trim()) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    const normalizedChildName = firstName(childName || 'Tu hijo');
    const comment = String(observations || '').trim();
    const who = String(tutorName || '').trim();

    return queueNotificationsForParents({
      schoolId,
      parentIds: [parentId],
      studentId,
      title: 'Nuevo comentario del Tutor de alimentacion',
      body: `${normalizedChildName}: ${comment}${who ? ` (Tutor: ${who})` : ''}`,
      payload: {
        type: 'meriendas.tutor_comment',
        studentId,
        childName: normalizedChildName,
        comment,
        date: String(date || ''),
        tutorName: who,
      },
    });
  });
}

async function queueApprovalPendingNotificationForAdmins({
  schoolId,
  title,
  body,
  payload = {},
}) {
  return runWithSchoolContext(schoolId, async () => {
    const admins = await User.find({
      schoolId,
      role: 'admin',
      status: 'active',
      deletedAt: null,
    })
      .select('_id')
      .lean();

    const adminIds = admins.map((admin) => admin._id).filter(Boolean);
    if (!adminIds.length) {
      return { notificationsCreated: 0, tokensFound: 0 };
    }

    return queueNotificationsForParents({
      schoolId,
      parentIds: adminIds,
      title,
      body,
      payload: {
        url: '/admin',
        ...payload,
        audience: 'admin',
      },
    });
  });
}

module.exports = {
  queueOrderCreatedNotifications,
  queueNotificationsForParents,
  queueStudentUserNotification,
  queueStudentUserNotifications,
  queueStudentParentNotification,
  queueStudentParentNotifications,
  queueLowBalanceAlertNotification,
  queueAutoDebitRechargeNotification,
  queueTutorCommentNotification,
  queueApprovalPendingNotificationForAdmins,
};
