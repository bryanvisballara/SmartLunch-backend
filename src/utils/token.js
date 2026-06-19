const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = '10y';
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = '10y';
const MIN_AUTH_SESSION_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const DURATION_UNITS_MS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000,
};

function parseDurationToMs(rawValue, fallbackMs) {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
    return rawValue;
  }

  const normalizedValue = String(rawValue || '').trim().toLowerCase();
  const match = normalizedValue.match(/^(\d+)(ms|s|m|h|d|w|y)?$/);

  if (!match) {
    return fallbackMs;
  }

  const amount = Number(match[1]);
  const unit = match[2] || 'ms';
  if (!Number.isFinite(amount) || amount <= 0) {
    return fallbackMs;
  }

  if (unit === 'ms') {
    return amount;
  }

  const multiplier = DURATION_UNITS_MS[unit];
  if (!multiplier) {
    return fallbackMs;
  }

  return amount * multiplier;
}

function resolveDurationAtLeast(rawValue, fallbackValue, minimumMs) {
  const normalizedValue = String(rawValue || '').trim();
  if (!normalizedValue) {
    return fallbackValue;
  }

  const parsedMs = parseDurationToMs(normalizedValue, minimumMs);
  return parsedMs >= minimumMs ? normalizedValue : fallbackValue;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      schoolId: user.schoolId,
      role: user.role,
      name: user.name,
      coordinationScope: String(user.coordinationScope || '').trim(),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: resolveDurationAtLeast(
        process.env.JWT_EXPIRES_IN,
        DEFAULT_ACCESS_TOKEN_EXPIRES_IN,
        MIN_AUTH_SESSION_MS
      ),
    }
  );
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function getRefreshTokenExpiresAt() {
  const ttlMs = parseDurationToMs(
    process.env.REFRESH_TOKEN_EXPIRES_IN || DEFAULT_REFRESH_TOKEN_EXPIRES_IN,
    MIN_AUTH_SESSION_MS
  );

  return new Date(Date.now() + Math.max(ttlMs, MIN_AUTH_SESSION_MS));
}

module.exports = {
  signAccessToken,
  createRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiresAt,
};
