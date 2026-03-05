const ParentStudentLink = require('../models/parentStudentLink.model');
const Wallet = require('../models/wallet.model');
const Notification = require('../models/notification.model');
const DeviceToken = require('../models/deviceToken.model');
const { enqueueNotificationJobs } = require('../config/queue');

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

  const notifications = parentIds.map((parentId) => ({
    schoolId,
    studentId: student._id,
    parentId,
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
    status: 'pending',
  }));

  const insertedNotifications = await Notification.insertMany(notifications);

  const tokensFound = await DeviceToken.countDocuments({
    schoolId,
    userId: { $in: parentIds },
    status: 'active',
  });

  const queueResult = await enqueueNotificationJobs(
    insertedNotifications.map((notification) => ({
      notificationId: String(notification._id),
      schoolId,
      parentId: String(notification.parentId),
    }))
  );

  return {
    notificationsCreated: notifications.length,
    tokensFound,
    queued: queueResult.queued,
    queuedCount: queueResult.count || 0,
    queueReason: queueResult.reason || null,
  };
}

module.exports = { queueOrderCreatedNotifications };
