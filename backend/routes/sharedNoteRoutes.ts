const express = require('express');
const { logInfo, requestLogMeta } = require('../logger');
const { createValidationError, normalizeArray, normalizeString } = require('../tasks/taskValidation');

function normalizeSharedNotePayload(body: Record<string, any>, { partial = false } = {}) {
  const patch: Record<string, any> = {};
  const errors: string[] = [];

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'title')) {
    const title = normalizeString(body.title);
    if (!title) errors.push('title is required');
    if (title.length > 200) errors.push('title must have at most 200 characters');
    patch.title = title;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'body')) {
    const noteBody = typeof body.body === 'string' ? body.body.trim() : '';
    if (noteBody.length > 50000) errors.push('body must have at most 50000 characters');
    patch.body = noteBody;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'tags')) {
    const tags = [...new Map<string, string>(normalizeArray(body.tags).map((tag: string) => [tag.toLocaleLowerCase(), tag])).values()];
    if (tags.length > 50) errors.push('tags must have at most 50 items');
    if (tags.some((tag: string) => tag.length > 50)) errors.push('each tag must have at most 50 characters');
    patch.tags = tags;
  }

  if (errors.length) throw createValidationError(errors);
  return patch;
}

function createSharedNoteRouter({
  withTransaction,
  fetchSharedNotes,
  createSharedNote,
  updateSharedNote,
  archiveSharedNote,
  attachSharedNoteToTask,
  detachSharedNoteFromTask,
  findTaskById
}: Record<string, any>) {
  const router = express.Router();

  router.get('/shared-notes', async (req, res, next) => {
    try {
      res.json(await fetchSharedNotes(String(req.query.search || '')));
    } catch (error) {
      next(error);
    }
  });

  router.post('/shared-notes', async (req, res, next) => {
    try {
      const payload = normalizeSharedNotePayload(req.body || {});
      const note = await withTransaction((client) => createSharedNote(client, payload));
      logInfo(requestLogMeta(req, {
        event: 'shared_note.create',
        entity: 'shared_note',
        entityId: note?.id,
        noteId: note?.id,
        titleLength: note?.title?.length || 0,
        bodyLength: note?.body?.length || 0,
        tagCount: note?.tags?.length || 0
      }), 'shared note created');
      res.status(201).json(note);
    } catch (error) {
      next(error);
    }
  });

  router.put('/shared-notes/:id', async (req, res, next) => {
    try {
      const payload = normalizeSharedNotePayload(req.body || {}, { partial: true });
      if (!Object.keys(payload).length) throw createValidationError(['title, body or tags is required']);
      const note = await withTransaction((client) => updateSharedNote(client, req.params.id, payload));
      if (!note) return res.status(404).json({ error: 'Shared note not found' });
      logInfo(requestLogMeta(req, {
        event: 'shared_note.update',
        entity: 'shared_note',
        entityId: note.id,
        noteId: note.id,
        changedFields: Object.keys(payload),
        titleLength: note.title?.length || 0,
        bodyLength: note.body?.length || 0,
        tagCount: note.tags?.length || 0
      }), 'shared note updated');
      return res.json(note);
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/shared-notes/:id', async (req, res, next) => {
    try {
      const archived = await withTransaction((client) => archiveSharedNote(client, req.params.id));
      if (!archived) return res.status(404).json({ error: 'Shared note not found' });
      logInfo(requestLogMeta(req, {
        event: 'shared_note.archive',
        entity: 'shared_note',
        entityId: req.params.id,
        noteId: req.params.id
      }), 'shared note archived');
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  router.post('/tasks/:taskId/shared-notes', async (req, res, next) => {
    try {
      const noteId = normalizeString(req.body?.noteId);
      if (!noteId) throw createValidationError(['noteId is required']);
      const task = await withTransaction(async (client) => {
        const attached = await attachSharedNoteToTask(client, req.params.taskId, noteId);
        if (!attached) return null;
        return findTaskById(client, req.params.taskId);
      });
      if (!task) return res.status(404).json({ error: 'Task or shared note not found' });
      logInfo(requestLogMeta(req, {
        event: 'task.shared_note.attach',
        entity: 'task',
        entityId: task.id,
        taskId: task.id,
        noteId
      }), 'shared note attached to task');
      return res.json(task);
    } catch (error) {
      return next(error);
    }
  });

  router.post('/tasks/:taskId/shared-notes/create', async (req, res, next) => {
    try {
      const payload = normalizeSharedNotePayload(req.body || {});
      const task = await withTransaction(async (client) => {
        const existingTask = await findTaskById(client, req.params.taskId);
        if (!existingTask) return null;
        const note = await createSharedNote(client, payload);
        await attachSharedNoteToTask(client, req.params.taskId, note.id);
        return findTaskById(client, req.params.taskId);
      });
      if (!task) return res.status(404).json({ error: 'Task not found' });
      logInfo(requestLogMeta(req, {
        event: 'task.shared_note.create_and_attach',
        entity: 'task',
        entityId: task.id,
        taskId: task.id,
        titleLength: payload.title?.length || 0,
        bodyLength: payload.body?.length || 0,
        tagCount: payload.tags?.length || 0
      }), 'shared note created and attached to task');
      return res.status(201).json(task);
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/tasks/:taskId/shared-notes/:noteId', async (req, res, next) => {
    try {
      const task = await withTransaction(async (client) => {
        const existingTask = await findTaskById(client, req.params.taskId);
        if (!existingTask) return null;
        await detachSharedNoteFromTask(client, req.params.taskId, req.params.noteId);
        return findTaskById(client, req.params.taskId);
      });
      if (!task) return res.status(404).json({ error: 'Task not found' });
      logInfo(requestLogMeta(req, {
        event: 'task.shared_note.detach',
        entity: 'task',
        entityId: task.id,
        taskId: task.id,
        noteId: req.params.noteId
      }), 'shared note detached from task');
      return res.json(task);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createSharedNoteRouter };

export {};
