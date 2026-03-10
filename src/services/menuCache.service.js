const IORedis = require('ioredis');

const DEFAULT_TTL_SECONDS = Number(process.env.MENU_CACHE_TTL_SECONDS || 120);
const KEY_PREFIX = 'menu-cache:';

const memoryCache = new Map();
let redisClient = null;
let redisReady = false;

function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = String(process.env.REDIS_URL || '').trim();
  if (!redisUrl || (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://'))) {
    return null;
  }

  try {
    redisClient = new IORedis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    redisClient.on('ready', () => {
      redisReady = true;
    });
    redisClient.on('error', () => {
      redisReady = false;
    });
    return redisClient;
  } catch (error) {
    return null;
  }
}

async function ensureRedisConnected() {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  if (redisReady) {
    return client;
  }

  try {
    if (client.status !== 'ready') {
      await client.connect();
    }
    redisReady = true;
    return client;
  } catch (error) {
    return null;
  }
}

function buildCacheKey(key) {
  return `${KEY_PREFIX}${String(key || '').trim()}`;
}

function getFromMemory(key) {
  const item = memoryCache.get(key);
  if (!item) {
    return null;
  }

  if (item.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return item.value;
}

function setInMemory(key, value, ttlSeconds) {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, Number(ttlSeconds || DEFAULT_TTL_SECONDS)) * 1000,
  });
}

async function getMenuCache(key) {
  const cacheKey = buildCacheKey(key);

  const memoryValue = getFromMemory(cacheKey);
  if (memoryValue !== null) {
    return memoryValue;
  }

  const redis = await ensureRedisConnected();
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.get(cacheKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    setInMemory(cacheKey, parsed, DEFAULT_TTL_SECONDS);
    return parsed;
  } catch (error) {
    return null;
  }
}

async function setMenuCache(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const cacheKey = buildCacheKey(key);
  const ttl = Math.max(1, Number(ttlSeconds || DEFAULT_TTL_SECONDS));
  setInMemory(cacheKey, value, ttl);

  const redis = await ensureRedisConnected();
  if (!redis) {
    return;
  }

  try {
    await redis.set(cacheKey, JSON.stringify(value), 'EX', ttl);
  } catch (error) {
    // no-op: keep API healthy if Redis is unavailable
  }
}

async function invalidateSchoolMenuCache(schoolId) {
  const marker = `${KEY_PREFIX}${String(schoolId || '').trim()}:`;

  for (const key of memoryCache.keys()) {
    if (key.startsWith(marker)) {
      memoryCache.delete(key);
    }
  }

  const redis = await ensureRedisConnected();
  if (!redis) {
    return;
  }

  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${marker}*`, 'COUNT', 200);
      cursor = nextCursor;
      if (Array.isArray(keys) && keys.length > 0) {
        await redis.del(keys);
      }
    } while (cursor !== '0');
  } catch (error) {
    // no-op
  }
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  getMenuCache,
  setMenuCache,
  invalidateSchoolMenuCache,
};
