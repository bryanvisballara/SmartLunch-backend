const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const NOTIFICATION_QUEUE_NAME = 'notifications';

function buildRedisConnection() {
  const redisUrl = String(process.env.REDIS_URL || '').trim();

  if (!redisUrl) {
    return null;
  }

  // Ignore placeholders or malformed values to keep API healthy when Redis
  // notifications are not configured in production yet.
  const looksLikePlaceholder = /<\s*tu\s+redis\s+url\s*>/i.test(redisUrl) || redisUrl.includes('%3Ctu%20redis%20url%3E');
  const hasValidScheme = redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://');
  if (looksLikePlaceholder || !hasValidScheme) {
    console.warn('REDIS_URL is invalid. Notification queue disabled until a valid redis:// or rediss:// URL is configured.');
    return null;
  }

  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

let queue;
let connection;

function getNotificationQueue() {
  if (!queue) {
    connection = buildRedisConnection();

    if (!connection) {
      return null;
    }

    queue = new Queue(NOTIFICATION_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        removeOnComplete: true,
        removeOnFail: false,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
      },
    });
  }

  return queue;
}

async function enqueueNotificationJobs(jobs) {
  const notificationQueue = getNotificationQueue();

  if (!notificationQueue) {
    return { queued: false, reason: 'REDIS_URL not configured' };
  }

  if (!jobs.length) {
    return { queued: true, count: 0 };
  }

  await notificationQueue.addBulk(
    jobs.map((job) => ({
      name: 'send-push',
      data: job,
    }))
  );

  return { queued: true, count: jobs.length };
}

module.exports = {
  NOTIFICATION_QUEUE_NAME,
  buildRedisConnection,
  getNotificationQueue,
  enqueueNotificationJobs,
};
