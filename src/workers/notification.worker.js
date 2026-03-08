require('dotenv').config();

const mongoose = require('mongoose');
const { Worker } = require('bullmq');

const { connectDB } = require('../config/db');
const Notification = require('../models/notification.model');
const { buildRedisConnection, NOTIFICATION_QUEUE_NAME } = require('../config/queue');
const { sendPushToParent } = require('../services/push.service');

async function processNotificationJob(job) {
  const { notificationId } = job.data;

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    return { skipped: true, reason: 'Notification not found' };
  }

  try {
    const result = await sendPushToParent({
      schoolId: notification.schoolId,
      parentId: notification.parentId,
      title: notification.title,
      body: notification.body,
      payload: notification.payload,
    });

    if (!result.delivered) {
      notification.status = 'failed';
      notification.lastError = result.reason || 'Push delivery failed';
      await notification.save();
      return { delivered: false, reason: notification.lastError };
    }

    notification.status = 'sent';
    notification.sentAt = new Date();
    notification.lastError = null;
    await notification.save();

    return { delivered: true, tokens: result.tokens };
  } catch (error) {
    notification.status = 'failed';
    notification.lastError = error.message;
    await notification.save();
    throw error;
  }
}

async function startWorker() {
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not configured. Notification worker is disabled.');
    process.exit(0);
  }

  const mongoConnection = await connectDB();
  console.log(`MongoDB connected (${mongoConnection.name})`);

  const redisConnection = buildRedisConnection();
  if (!redisConnection) {
    console.error('Could not create Redis connection for worker.');
    process.exit(1);
  }

  const worker = new Worker(NOTIFICATION_QUEUE_NAME, processNotificationJob, {
    connection: redisConnection,
    concurrency: Number(process.env.NOTIFICATION_WORKER_CONCURRENCY || 10),
  });

  worker.on('completed', (job) => {
    console.info(`[NOTIFICATION_WORKER_COMPLETED] jobId=${job.id}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[NOTIFICATION_WORKER_FAILED] jobId=${job?.id} error=${error.message}`);
  });

  console.log('Notification worker started.');

  const shutdown = async () => {
    await worker.close();
    await redisConnection.quit();
    await mongoose.connection.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startWorker().catch((error) => {
  console.error(`Notification worker failed to start: ${error.message}`);
  process.exit(1);
});
