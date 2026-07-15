const express = require('express');
const { logger, getRecentLogs } = require('../logger');

function createLogRouter() {
  const router = express.Router();

  router.post('/client-logs', (req, res) => {
    const level = ['debug', 'info', 'warn', 'error'].includes(req.body?.level) ? req.body.level : 'info';
    const event = String(req.body?.event || 'client.log');
    logger.log(level, event, {
      requestId: req.body?.requestId || (req as any).requestId || null,
      userId: req.body?.userId || undefined,
      route: req.originalUrl,
      method: req.method,
      metadata: {
        message: req.body?.message || '',
        metadata: req.body?.metadata || {}
      }
    });
    res.status(204).end();
  });

  router.get('/logs', async (req, res, next) => {
    try {
      const values = (key) => {
        const value = req.query[key];
        return (Array.isArray(value) ? value : value ? [value] : []).map(String).filter(Boolean);
      };
      const level = String(req.query.level || '').toLowerCase();
      const event = String(req.query.event || '').toLowerCase();
      const route = String(req.query.route || '').toLowerCase();
      const requestId = String(req.query.requestId || '').toLowerCase();
      const search = String(req.query.search || '').toLowerCase();
      const statusCode = Number(req.query.statusCode || 0);
      const minDurationMs = Number(req.query.minDurationMs || 0);
      const limit = Math.max(20, Math.min(1000, Number(req.query.limit || 200)));
      const includeRequestIds = new Set([...values('requestIds'), ...values('requestId')].map((item) => item.toLowerCase()));
      const excludeRequestIds = new Set(values('excludeRequestIds').map((item) => item.toLowerCase()));
      const includeEvents = values('events').map((item) => item.toLowerCase());
      const excludeEvents = values('excludeEvents').map((item) => item.toLowerCase());
      const includeRoutes = values('routes').map((item) => item.toLowerCase());
      const excludeRoutes = values('excludeRoutes').map((item) => item.toLowerCase());

      const logs = getRecentLogs().filter((log) => {
        const logLevel = String(log.level || '').toLowerCase();
        const logEvent = String(log.event || log.msg || '').toLowerCase();
        const logRoute = String(log.route || '').toLowerCase();
        const logRequestId = String(log.requestId || '').toLowerCase();
        const haystack = JSON.stringify(log).toLowerCase();
        if (level && logLevel !== level) return false;
        if (event && !logEvent.includes(event)) return false;
        if (route && !logRoute.includes(route)) return false;
        if (requestId && logRequestId !== requestId) return false;
        if (includeRequestIds.size && !includeRequestIds.has(logRequestId)) return false;
        if (excludeRequestIds.has(logRequestId)) return false;
        if (includeEvents.length && !includeEvents.some((item) => logEvent.includes(item))) return false;
        if (excludeEvents.length && excludeEvents.some((item) => logEvent.includes(item))) return false;
        if (includeRoutes.length && !includeRoutes.some((item) => logRoute.includes(item))) return false;
        if (excludeRoutes.length && excludeRoutes.some((item) => logRoute.includes(item))) return false;
        if (statusCode && Number(log.statusCode || 0) !== statusCode) return false;
        if (minDurationMs && Number(log.durationMs || 0) < minDurationMs) return false;
        if (search && !haystack.includes(search)) return false;
        return true;
      }).slice(0, limit);

      res.json({ logs, total: logs.length, bufferSize: getRecentLogs().length });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createLogRouter };

export {};
