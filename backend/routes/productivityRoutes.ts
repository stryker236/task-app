const express = require('express');

function createProductivityRouter({
  fetchProductivitySummary
}) {
  const router = express.Router();

  router.get('/productivity/summary', async (req, res, next) => {
    try {
      res.json(await fetchProductivitySummary());
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = { createProductivityRouter };

export {};
