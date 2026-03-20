const DeviceToken = require('../models/deviceToken.model');
const admin = require('firebase-admin');
const webpush = require('web-push');

let vapidConfigured = false;
let firebaseConfigured = false;

function ensureWebPushConfig() {
  if (vapidConfigured) {
    return true;
  }

  const publicKey = String(process.env.WEB_PUSH_PUBLIC_KEY || '').trim();
  const privateKey = String(process.env.WEB_PUSH_PRIVATE_KEY || '').trim();
  const subject = String(process.env.WEB_PUSH_SUBJECT || 'mailto:soporte@comergio.local').trim();

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function parseWebSubscription(token) {
  try {
    const parsed = JSON.parse(String(token || ''));
    if (!parsed || !parsed.endpoint || !parsed.keys?.p256dh || !parsed.keys?.auth) {
      return null;
    }

    return {
      endpoint: parsed.endpoint,
      expirationTime: parsed.expirationTime || null,
      keys: {
        p256dh: parsed.keys.p256dh,
        auth: parsed.keys.auth,
      },
    };
  } catch (error) {
    return null;
  }
}

function normalizeDataPayload(payload = {}) {
  return Object.entries(payload || {}).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) {
      return acc;
    }

    if (typeof value === 'string') {
      acc[key] = value;
      return acc;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      acc[key] = String(value);
      return acc;
    }

    acc[key] = JSON.stringify(value);
    return acc;
  }, {});
}

function ensureFirebaseConfig() {
  if (firebaseConfigured || admin.apps.length > 0) {
    firebaseConfigured = true;
    return true;
  }

  const serviceAccountRaw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (serviceAccountRaw) {
    try {
      const serviceAccount = JSON.parse(serviceAccountRaw);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseConfigured = true;
      return true;
    } catch (error) {
      return false;
    }
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

  if (!projectId || !clientEmail || !privateKey) {
    return false;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    firebaseConfigured = true;
    return true;
  } catch (error) {
    return false;
  }
}

async function sendWebPushTokens({ webTokens, title, body, payload }) {
  if (!webTokens.length) {
    return { delivered: 0, total: 0, reason: 'No active web subscriptions' };
  }

  if (!ensureWebPushConfig()) {
    return { delivered: 0, total: webTokens.length, reason: 'WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY are not configured' };
  }

  const notificationPayload = JSON.stringify({
    title,
    body,
    data: {
      ...(payload || {}),
      url: '/parent',
    },
  });

  let delivered = 0;

  for (const tokenDoc of webTokens) {
    const subscription = parseWebSubscription(tokenDoc.token);
    if (!subscription) {
      await DeviceToken.updateOne({ _id: tokenDoc._id }, { status: 'revoked', lastSeenAt: new Date() });
      continue;
    }

    try {
      await webpush.sendNotification(subscription, notificationPayload);
      delivered += 1;
    } catch (error) {
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await DeviceToken.updateOne({ _id: tokenDoc._id }, { status: 'revoked', lastSeenAt: new Date() });
      }
    }
  }

  return {
    delivered,
    total: webTokens.length,
    reason: delivered > 0 ? null : 'No web subscriptions accepted the push notification',
  };
}

async function sendNativePushTokens({ nativeTokens, title, body, payload }) {
  if (!nativeTokens.length) {
    return { delivered: 0, total: 0, reason: 'No active iOS/Android tokens' };
  }

  if (!ensureFirebaseConfig()) {
    console.error('[PUSH_NATIVE] Firebase credentials are not configured');
    return { delivered: 0, total: nativeTokens.length, reason: 'Firebase credentials are not configured' };
  }

  const validDocs = nativeTokens.filter((item) => String(item.token || '').trim());
  if (!validDocs.length) {
    return { delivered: 0, total: nativeTokens.length, reason: 'No valid native device tokens' };
  }

  const response = await admin.messaging().sendEachForMulticast({
    tokens: validDocs.map((item) => String(item.token).trim()),
    notification: {
      title,
      body,
    },
    data: {
      ...normalizeDataPayload(payload),
      url: '/parent',
    },
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  });

  for (let index = 0; index < response.responses.length; index += 1) {
    const delivery = response.responses[index];
    if (delivery.success) {
      console.info(`[PUSH_NATIVE_OK] token=${String(validDocs[index]?.token || '').slice(0, 20)}...`);
      continue;
    }

    const code = String(delivery.error?.code || '');
    console.warn(`[PUSH_NATIVE_ERR] token=${String(validDocs[index]?.token || '').slice(0, 20)}... code=${code} message=${delivery.error?.message || ''}`);
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      const tokenDoc = validDocs[index];
      if (tokenDoc?._id) {
        await DeviceToken.updateOne({ _id: tokenDoc._id }, { status: 'revoked', lastSeenAt: new Date() });
      }
    }
  }

  return {
    delivered: Number(response.successCount || 0),
    total: validDocs.length,
    reason: Number(response.successCount || 0) > 0 ? null : 'No native tokens accepted the push notification',
  };
}

async function sendPushToParent({ schoolId, parentId, title, body, payload }) {
  const tokens = await DeviceToken.find({
    schoolId,
    userId: parentId,
    status: 'active',
  }).select('platform token');

  console.info(`[PUSH_TO_PARENT] parentId=${parentId} tokensFound=${tokens.length}`);

  if (!tokens.length) {
    return { delivered: false, tokens: 0, reason: 'No active device tokens' };
  }

  const webTokens = tokens.filter((item) => item.platform === 'web');
  const nativeTokens = tokens.filter((item) => item.platform === 'ios' || item.platform === 'android');

  const [webResult, nativeResult] = await Promise.all([
    sendWebPushTokens({ webTokens, title, body, payload }),
    sendNativePushTokens({ nativeTokens, title, body, payload }),
  ]);

  const deliveredCount = Number(webResult.delivered || 0) + Number(nativeResult.delivered || 0);
  const tokenCount = Number(webResult.total || 0) + Number(nativeResult.total || 0);

  if (deliveredCount === 0) {
    const reasonParts = [webResult.reason, nativeResult.reason].filter(Boolean);
    return {
      delivered: false,
      tokens: tokenCount,
      reason: reasonParts.join(' | ') || 'Push delivery failed',
    };
  }

  return { delivered: true, tokens: deliveredCount };
}

module.exports = { sendPushToParent };
