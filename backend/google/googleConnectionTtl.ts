const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_GOOGLE_CONNECTION_TTL_DAYS = 365;

function googleConnectionTtlDays() {
  const value = Number(process.env.GOOGLE_CONNECTION_TTL_DAYS || DEFAULT_GOOGLE_CONNECTION_TTL_DAYS);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_GOOGLE_CONNECTION_TTL_DAYS;
  return Math.max(1, Math.round(value));
}

function googleConnectionTtlMs() {
  return googleConnectionTtlDays() * DAY_MS;
}

function googleConnectionExpiresAt(now = Date.now()) {
  return new Date(now + googleConnectionTtlMs()).toISOString();
}

module.exports = {
  googleConnectionExpiresAt,
  googleConnectionTtlDays,
  googleConnectionTtlMs
};

export {};
