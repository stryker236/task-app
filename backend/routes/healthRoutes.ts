const express = require('express');

function createHealthRouter({ checkConnection }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ name: 'Task App API', status: 'ok', health: '/health' });
  });

  router.get('/health', async (req, res) => {
    try {
      const connection = await checkConnection();
      res.json({ status: 'ok', database: connection.database, databaseTime: connection.time });
    } catch {
      res.status(503).json({ status: 'unavailable', error: 'Database connection is not ready' });
    }
  });

  return router;
}

module.exports = { createHealthRouter };

export {};
