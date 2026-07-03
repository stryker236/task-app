const express = require('express');
const { logger, readLogs } = require('../logger');

function createLogRouter() {
  const router = express.Router();

  router.post('/client-logs', (req, res) => {
    const level = ['debug', 'info', 'warn', 'error'].includes(req.body?.level) ? req.body.level : 'info';
    const event = String(req.body?.event || 'client.log');
    logger.log(level, event, {
      requestId: req.body?.requestId || (req as any).requestId || null,
      client: req.ip,
      route: req.originalUrl,
      metadata: {
        message: req.body?.message || '',
        metadata: req.body?.metadata || {}
      }
    });
    res.status(204).end();
  });

  router.get('/logs', async (req, res, next) => {
    try {
      res.json({
        logs: await readLogs({
          level: String(req.query.level || ''),
          event: String(req.query.event || ''),
          requestId: String(req.query.requestId || ''),
          requestIds: req.query.requestIds,
          excludeRequestIds: req.query.excludeRequestIds,
          events: req.query.events,
          excludeEvents: req.query.excludeEvents,
          search: String(req.query.search || ''),
          limit: Number(req.query.limit || 200)
        })
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createLogRouter };

export {};
