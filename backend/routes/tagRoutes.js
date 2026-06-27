const express = require('express');

function createTagRouter({ fetchTags, deleteUnusedTag }) {
  const router = express.Router();

  router.get('/tags', async (req, res, next) => {
    try { res.json(await fetchTags(req.query.search || '')); }
    catch (error) { next(error); }
  });

  router.delete('/tags/:id', async (req, res, next) => {
    try {
      const result = await deleteUnusedTag(req.params.id);
      if (result === 'not_found') return res.status(404).json({ error: 'Tag not found' });
      if (result === 'in_use') return res.status(409).json({ error: 'Tag is still used by one or more tasks' });
      return res.status(204).send();
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = { createTagRouter };
