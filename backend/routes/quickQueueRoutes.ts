const express = require('express');
const { logInfo, requestLogMeta } = require('../logger');
const { createValidationError, normalizeString } = require('../tasks/taskValidation');

function createQuickQueueRouter({
  withTransaction,
  fetchQuickQueueItems,
  createQuickQueueItem,
  updateQuickQueueItem,
  deleteQuickQueueItem,
  clearDoneQuickQueueItems,
  moveQuickQueueItem
}) {
  const router = express.Router();

  router.get('/quick-queue', async (req, res, next) => {
    try {
      res.json(await fetchQuickQueueItems());
    } catch (error) {
      next(error);
    }
  });

  router.post('/quick-queue', async (req, res, next) => {
    try {
      const text = normalizeString(req.body.text);
      if (!text || text.length > 500) {
        throw createValidationError([!text ? 'text is required' : 'text must have at most 500 characters']);
      }
      const item = await withTransaction((client) => createQuickQueueItem(client, text));
      logInfo(requestLogMeta(req, {
        event: 'quick_queue.create',
        entity: 'quick_queue_item',
        entityId: item.id,
        itemId: item.id,
        textLength: item.text?.length || 0,
        position: item.position
      }), 'quick queue item created');
      res.status(201).json(item);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/quick-queue/done', async (req, res, next) => {
    try {
      const items = await withTransaction((client) => clearDoneQuickQueueItems(client));
      logInfo(requestLogMeta(req, {
        event: 'quick_queue.clear_done',
        entity: 'quick_queue_item',
        remainingCount: items.length
      }), 'quick queue done items cleared');
      res.json(items);
    } catch (error) {
      next(error);
    }
  });

  router.patch('/quick-queue/:id', async (req, res, next) => {
    try {
      const patch: Record<string, any> = {};
      if (Object.prototype.hasOwnProperty.call(req.body, 'text')) {
        patch.text = normalizeString(req.body.text);
        if (!patch.text || patch.text.length > 500) {
          throw createValidationError([!patch.text ? 'text is required' : 'text must have at most 500 characters']);
        }
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'done')) {
        if (typeof req.body.done !== 'boolean') throw createValidationError(['done must be a boolean']);
        patch.done = req.body.done;
      }
      if (!Object.keys(patch).length) throw createValidationError(['text or done is required']);

      const item = await withTransaction((client) => updateQuickQueueItem(client, req.params.id, patch));
      if (!item) return res.status(404).json({ error: 'Quick queue item not found' });
      logInfo(requestLogMeta(req, {
        event: 'quick_queue.update',
        entity: 'quick_queue_item',
        entityId: item.id,
        itemId: item.id,
        changedFields: Object.keys(patch),
        done: item.done,
        textLength: item.text?.length || 0
      }), 'quick queue item updated');
      return res.json(item);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/quick-queue/:id/move', async (req, res, next) => {
    try {
      const direction = Number(req.body.direction);
      if (![1, -1].includes(direction)) throw createValidationError(['direction must be 1 or -1']);
      const items = await withTransaction((client) => moveQuickQueueItem(client, req.params.id, direction));
      if (!items) return res.status(404).json({ error: 'Quick queue item not found' });
      logInfo(requestLogMeta(req, {
        event: 'quick_queue.move',
        entity: 'quick_queue_item',
        entityId: req.params.id,
        itemId: req.params.id,
        direction,
        itemCount: items.length
      }), 'quick queue item moved');
      return res.json(items);
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/quick-queue/:id', async (req, res, next) => {
    try {
      const deleted = await withTransaction((client) => deleteQuickQueueItem(client, req.params.id));
      if (!deleted) return res.status(404).json({ error: 'Quick queue item not found' });
      logInfo(requestLogMeta(req, {
        event: 'quick_queue.delete',
        entity: 'quick_queue_item',
        entityId: req.params.id,
        itemId: req.params.id
      }), 'quick queue item deleted');
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createQuickQueueRouter };

export {};
