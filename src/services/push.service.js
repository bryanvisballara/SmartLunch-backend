const DeviceToken = require('../models/deviceToken.model');

async function sendPushToParent({ schoolId, parentId, title, body, payload }) {
  const tokens = await DeviceToken.find({
    schoolId,
    userId: parentId,
    status: 'active',
  }).select('platform token');

  if (!tokens.length) {
    return { delivered: false, tokens: 0, reason: 'No active device tokens' };
  }

  // TODO: replace this stub with actual providers (FCM/APNs/Web Push).
  console.info(
    `[PUSH_STUB] parentId=${parentId} tokens=${tokens.length} title=${title} payloadType=${payload?.type || 'unknown'}`
  );

  return { delivered: true, tokens: tokens.length };
}

module.exports = { sendPushToParent };
