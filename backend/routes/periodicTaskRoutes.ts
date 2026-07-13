const express = require('express');
const { createValidationError, normalizeString } = require('../tasks/taskValidation');

const PERIODS = ['week', 'month'];
const CONSTRAINT_TYPES = ['fixed_occurrence', 'allowed_window', 'minimum_count'];
const OCCURRENCE_STATUSES = ['scheduled', 'completed', 'skipped', 'cancelled'];

function sanitizeStringList(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map((item) => normalizeString(item)).filter(Boolean))].slice(0, 20) : [];
}

function sanitizeJsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sanitizePeriodicTaskInput(body: Record<string, any> = {}, partial = false) {
  const input: Record<string, any> = {};
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'title')) {
    input.title = normalizeString(body.title);
    if (!input.title || input.title.length > 160) throw createValidationError(['title is required and must have at most 160 characters']);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) input.notes = normalizeString(body.notes);
  if (Object.prototype.hasOwnProperty.call(body, 'tags')) input.tags = sanitizeStringList(body.tags);
  if (Object.prototype.hasOwnProperty.call(body, 'priority')) {
    input.priority = Number(body.priority);
    if (![1, 2, 3, 4].includes(input.priority)) throw createValidationError(['priority must be between 1 and 4']);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'estimatedMinutes')) {
    input.estimatedMinutes = Number(body.estimatedMinutes);
    if (!Number.isInteger(input.estimatedMinutes) || input.estimatedMinutes < 15 || input.estimatedMinutes > 480) {
      throw createValidationError(['estimatedMinutes must be between 15 and 480']);
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'period')) {
    input.period = normalizeString(body.period);
    if (!PERIODS.includes(input.period)) throw createValidationError(['period must be week or month']);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'targetCount')) {
    input.targetCount = Number(body.targetCount);
    if (!Number.isInteger(input.targetCount) || input.targetCount < 1 || input.targetCount > 31) {
      throw createValidationError(['targetCount must be between 1 and 31']);
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, 'hardConstraints')) input.hardConstraints = sanitizeJsonObject(body.hardConstraints);
  if (Object.prototype.hasOwnProperty.call(body, 'preferences')) input.preferences = sanitizeJsonObject(body.preferences);
  if (Object.prototype.hasOwnProperty.call(body, 'active')) {
    if (typeof body.active !== 'boolean') throw createValidationError(['active must be a boolean']);
    input.active = body.active;
  }
  return input;
}

function sanitizeConstraintInput(body: Record<string, any> = {}, partial = false) {
  const input: Record<string, any> = {};
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'type')) {
    input.type = normalizeString(body.type);
    if (!CONSTRAINT_TYPES.includes(input.type)) throw createValidationError([`type must be one of: ${CONSTRAINT_TYPES.join(', ')}`]);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'scope')) input.scope = sanitizeJsonObject(body.scope);
  if (Object.prototype.hasOwnProperty.call(body, 'payload')) input.payload = sanitizeJsonObject(body.payload);
  if (Object.prototype.hasOwnProperty.call(body, 'hard')) {
    if (typeof body.hard !== 'boolean') throw createValidationError(['hard must be a boolean']);
    input.hard = body.hard;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'active')) {
    if (typeof body.active !== 'boolean') throw createValidationError(['active must be a boolean']);
    input.active = body.active;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'expiresAt')) input.expiresAt = normalizeString(body.expiresAt) || null;
  return input;
}

function createPeriodicTaskRouter({
  withTransaction,
  fetchPeriodicTasks,
  createPeriodicTask,
  updatePeriodicTask,
  deletePeriodicTask,
  createPeriodicTaskConstraint,
  updatePeriodicTaskConstraint,
  deletePeriodicTaskConstraint,
  fetchPeriodicTaskOccurrences,
  updatePeriodicTaskOccurrence
}) {
  const router = express.Router();

  router.get('/periodic-tasks', async (req, res, next) => {
    try {
      res.json(await fetchPeriodicTasks(undefined, { activeOnly: req.query.active === 'true' }));
    } catch (error) { next(error); }
  });

  router.post('/periodic-tasks', async (req, res, next) => {
    try {
      const input = sanitizePeriodicTaskInput(req.body || {});
      res.status(201).json(await withTransaction((client) => createPeriodicTask(client, input)));
    } catch (error) { next(error); }
  });

  router.patch('/periodic-tasks/:id', async (req, res, next) => {
    try {
      const input = sanitizePeriodicTaskInput(req.body || {}, true);
      if (!Object.keys(input).length) throw createValidationError(['at least one field is required']);
      const task = await withTransaction((client) => updatePeriodicTask(client, req.params.id, input));
      if (!task) return res.status(404).json({ error: 'Periodic task not found' });
      return res.json(task);
    } catch (error) { return next(error); }
  });

  router.delete('/periodic-tasks/:id', async (req, res, next) => {
    try {
      const deleted = await withTransaction((client) => deletePeriodicTask(client, req.params.id));
      if (!deleted) return res.status(404).json({ error: 'Periodic task not found' });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });

  router.get('/periodic-tasks/:id/occurrences', async (req, res, next) => {
    try {
      res.json(await fetchPeriodicTaskOccurrences(undefined, req.params.id));
    } catch (error) { next(error); }
  });

  router.post('/periodic-tasks/:id/constraints', async (req, res, next) => {
    try {
      const input = sanitizeConstraintInput(req.body || {});
      const constraint = await withTransaction((client) => createPeriodicTaskConstraint(client, req.params.id, input));
      if (!constraint) return res.status(404).json({ error: 'Periodic task not found' });
      return res.status(201).json(constraint);
    } catch (error) { return next(error); }
  });

  router.patch('/periodic-task-constraints/:id', async (req, res, next) => {
    try {
      const input = sanitizeConstraintInput(req.body || {}, true);
      if (!Object.keys(input).length) throw createValidationError(['at least one field is required']);
      const constraint = await withTransaction((client) => updatePeriodicTaskConstraint(client, req.params.id, input));
      if (!constraint) return res.status(404).json({ error: 'Periodic task constraint not found' });
      return res.json(constraint);
    } catch (error) { return next(error); }
  });

  router.delete('/periodic-task-constraints/:id', async (req, res, next) => {
    try {
      const deleted = await withTransaction((client) => deletePeriodicTaskConstraint(client, req.params.id));
      if (!deleted) return res.status(404).json({ error: 'Periodic task constraint not found' });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });

  router.patch('/periodic-task-occurrences/:id', async (req, res, next) => {
    try {
      const status = normalizeString(req.body?.status);
      if (!OCCURRENCE_STATUSES.includes(status)) throw createValidationError([`status must be one of: ${OCCURRENCE_STATUSES.join(', ')}`]);
      const occurrence = await withTransaction((client) => updatePeriodicTaskOccurrence(client, req.params.id, { status }));
      if (!occurrence) return res.status(404).json({ error: 'Periodic task occurrence not found' });
      return res.json(occurrence);
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = { createPeriodicTaskRouter };

export {};
