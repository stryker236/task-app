const express = require('express');
const { logger } = require('../logger');

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
      res.json({
        logs: [],
        message: 'Backend logs are written as JSON to stdout. Use Grafana/Loki for log search.'
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createLogRouter };

export {};
