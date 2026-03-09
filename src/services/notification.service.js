const ParentStudentLink = require('../models/parentStudentLink.model');
const Wallet = require('../models/wallet.model');
const Notification = require('../models/notification.model');
const DeviceToken = require('../models/deviceToken.model');
const Student = require('../models/student.model');
const User = require('../models/user.model');
const { enqueueNotificationJobs } = require('../config/queue');

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

function buildPurchaseBody({ studentName, items, total, remainingBalance }) {
  const lines = items.map((item) => `- ${item.nameSnapshot} $${formatCurrency(item.subtotal)}`).join('\n');

  return [
    `${studentName} compro:`,
    lines,
    '',
    `Total compra: $${formatCurrency(total)}`,
    `Saldo restante: $${formatCurrency(remainingBalance)}`,
  ].join('\n');
}

async function queueOrderCreatedNotifications({ schoolId, student, order }) {
  const parentLinks = await ParentStudentLink.find({
    schoolId,
    studentId: student._id,
    status: 'active',
  }).select('parentId');

  if (!parentLinks.length) {
    return { notificationsCreated: 0, tokensFound: 0 };
  }

  const wallet = await Wallet.findOne({ schoolId, studentId: student._id }).select('balance');
  const remainingBalance = wallet?.balance || 0;

  const title = 'Compra realizada';
  const body = buildPurchaseBody({
    studentName: student.name,
    items: order.items,
    total: order.total,
    remainingBalance,
  });

  const parentIds = parentLinks.map((link) => link.parentId);

  return queueNotificationsForParents({
    schoolId,
    parentIds,
    studentId: student._id,
    orderId: order._id,
    title,
    body,
    payload: {
      type: 'order.created',
      orderId: order._id,
      studentId: student._id,
      total: order.total,
      remainingBalance,
      paymentMethod: order.paymentMethod,
    },
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

  let queueResult = { queued: false, reason: 'enqueue_not_attempted', count: 0 };
  try {
    queueResult = await withTimeout(
      enqueueNotificationJobs(
        insertedNotifications.map((notification) => ({
          notificationId: String(notification._id),
          schoolId,
          parentId: String(notification.parentId),
        }))
      ),
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

  return {
    notificationsCreated: notifications.length,
    tokensFound,
    queued: queueResult.queued,
    queuedCount: queueResult.count || 0,
    queueReason: queueResult.reason || null,
  };
}

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'El alumno';
}

async function queueLowBalanceAlertNotification({ schoolId, student, balance, threshold }) {
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
      title: 'Saldo bajo',
      body: `${childName} tiene bajo saldo y se puede quedar sin merendar. Recarga cuanto antes.`,
    },
    lt10: {
      title: 'Ultimo aviso de saldo',
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
}

async function queueAutoDebitRechargeNotification({ schoolId, studentId, amount, newBalance, method = '' }) {
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

  return queueNotificationsForParents({
    schoolId,
    parentIds,
    studentId,
    title: 'Recarga automatica realizada',
    body: `Se realizo una recarga para ${childName}. Nuevo saldo disponible: $${formatCurrency(newBalance)}.`,
    payload: {
      type: 'wallet.auto_recharge',
      studentId,
      amount,
      balance: newBalance,
      method,
    },
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
}

async function queueApprovalPendingNotificationForAdmins({
  schoolId,
  title,
  body,
  payload = {},
}) {
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
}

module.exports = {
  queueOrderCreatedNotifications,
  queueNotificationsForParents,
  queueLowBalanceAlertNotification,
  queueAutoDebitRechargeNotification,
  queueTutorCommentNotification,
  queueApprovalPendingNotificationForAdmins,
};
