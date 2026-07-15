const express = require('express');
const { logInfo, requestLogMeta } = require('../logger');
const { createValidationError, normalizeString } = require('../tasks/taskValidation');

function createQuickQueueRouter({
  withTransaction,
  fetchQuickQueueItems,
  createQuickQueueItem,
  updateQuickQueueItem,
  createProductivityEvent = async (_db: unknown, _event: unknown) => null,
  deleteQuickQueueItem,
  clearDoneQuickQueueItems,
  moveQuickQueueItem,
  reorderQuickQueueItems
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
      const placement = normalizeString(req.body.placement) || 'bottom';
      if (!['top', 'bottom'].includes(placement)) throw createValidationError(['placement must be top or bottom']);
      const item = await withTransaction((client) => createQuickQueueItem(client, text, placement));
      logInfo(requestLogMeta(req, {
        event: 'quick_queue.create',
        entity: 'quick_queue_item',
        entityId: item.id,
        itemId: item.id,
        textLength: item.text?.length || 0,
        position: item.position,
        placement
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

      const item = await withTransaction(async (client) => {
        const previous = (await fetchQuickQueueItems(client)).find((entry) => entry.id === req.params.id);
        const updated = await updateQuickQueueItem(client, req.params.id, patch);
        if (updated && patch.done === true && previous && !previous.done) {
          await createProductivityEvent(client, {
            eventType: 'quick_queue_completed',
            xp: 10,
            quickQueueItemId: updated.id,
            metadata: { text: updated.text }
          });
        }
        return updated;
      });
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

  router.post('/quick-queue/reorder', async (req, res, next) => {
    try {
      const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String).filter(Boolean) : [];
      if (!ids.length) throw createValidationError(['ids must be a non-empty array']);
      const items = await withTransaction((client) => reorderQuickQueueItems(client, ids));
      if (!items) return res.status(400).json({ error: 'ids must include every quick queue item exactly once' });
      logInfo(requestLogMeta(req, {
        event: 'quick_queue.reorder',
        entity: 'quick_queue_item',
        itemCount: items.length
      }), 'quick queue reordered');
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

