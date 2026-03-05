const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const NOTIFICATION_QUEUE_NAME = 'notifications';

function buildRedisConnection() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
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
