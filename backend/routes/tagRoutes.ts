const express = require('express');
const { createValidationError } = require('../tasks/taskValidation');

function createTagRouter({ fetchTags, deleteUnusedTag, deleteUnusedTags }) {
  const router = express.Router();

  router.get('/tags', async (req, res, next) => {
    try { res.json(await fetchTags(req.query.search || '')); }
    catch (error) { next(error); }
  });

  router.delete('/tags/:id', async (req, res, next) => {
    try {
      const force = req.query.force === 'true' || req.body?.force === true;
      const result = await deleteUnusedTag(req.params.id, { force });
      if (result === 'not_found') return res.status(404).json({ error: 'Tag not found' });
      if (result === 'in_use') return res.status(409).json({ error: 'Tag is still used by one or more active tasks' });
      return res.status(204).send();
    } catch (error) { return next(error); }
  });

  router.delete('/tags', async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
      const force = req.body?.force === true;
      if (!ids.length) throw createValidationError(['ids must be a non-empty array']);
      if (ids.length > 200) throw createValidationError(['ids must have at most 200 items']);

      const result = await deleteUnusedTags(ids, { force });
      res.json({
        deactivatedCount: result.deletedIds.length,
        deactivatedIds: result.deletedIds,
        deletedCount: result.deletedIds.length,
        deletedIds: result.deletedIds,
        inUseIds: result.inUseIds,
        notFoundIds: result.notFoundIds,
        removedActiveTaskTagCount: result.removedActiveTaskTagCount
      });
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createTagRouter };

export {};
