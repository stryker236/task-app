const express = require('express');

function createSettingsRouter({ fetchAppSettings, updateAppSettings }) {
  const router = express.Router();

  router.get('/settings', async (req, res, next) => {
    try {
      res.json(await fetchAppSettings());
    } catch (error) {
      next(error);
    }
  });

  router.patch('/settings', async (req, res, next) => {
    try {
      res.json(await updateAppSettings(undefined, req.body || {}));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createSettingsRouter };

export {};