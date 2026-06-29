function createMemoryRateLimit({ windowMs = 10000, max = 3, message = 'Too many requests' } = {}) {
  const buckets = new Map();

  return function memoryRateLimit(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const bucket = buckets.get(key) || [];
    const recent = bucket.filter((timestamp) => now - timestamp < windowMs);

    if (recent.length >= max) {
      const retryAfterMs = windowMs - (now - recent[0]);
      res.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
      return res.status(429).json({
        error: message,
        retryAfterMs,
        limit: max,
        windowMs
      });
    }

    recent.push(now);
    buckets.set(key, recent);

    for (const [bucketKey, timestamps] of buckets.entries()) {
      if (!timestamps.some((timestamp) => now - timestamp < windowMs)) buckets.delete(bucketKey);
    }

    return next();
  };
}

module.exports = { createMemoryRateLimit };

export {};
