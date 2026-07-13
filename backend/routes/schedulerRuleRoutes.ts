const express = require('express');
const { interpretSchedulerRule, interpretSchedulerRules } = require('../ai/schedulerRuleInterpreter');
const { createValidationError, normalizeString } = require('../tasks/taskValidation');

function createSchedulerRuleRouter({
  fetchTasks,
  fetchSchedulerRules,
  fetchSchedulerConstraintTypes,
  createSchedulerRule,
  updateSchedulerRule,
  deleteSchedulerRule,
  withTransaction
}) {
  const router = express.Router();

  router.get('/scheduler/rules', async (req, res, next) => {
    try {
      res.json(await fetchSchedulerRules());
    } catch (error) { next(error); }
  });

  router.get('/scheduler/constraint-types', async (req, res, next) => {
    try {
      res.json(await fetchSchedulerConstraintTypes(undefined, { enabledOnly: false }));
    } catch (error) { next(error); }
  });

  router.post('/scheduler/rules', async (req, res, next) => {
    try {
      const text = normalizeString(req.body?.text);
      if (!text) throw createValidationError(['text is required']);
      if (text.length > 1000) throw createValidationError(['text must have at most 1000 characters']);
      const tasks = await fetchTasks();
      const constraintTypes = await fetchSchedulerConstraintTypes(undefined, { enabledOnly: true });
      const interpreted = await interpretSchedulerRule({ text, tasks, constraintTypes });
      const rule = await withTransaction((client) => createSchedulerRule(client, {
        text,
        interpretation: interpreted.interpretation,
        status: interpreted.status,
        enabled: interpreted.enabled,
        confidence: interpreted.confidence,
        model: interpreted.model,
        rawResponse: interpreted.rawResponse,
        constraints: interpreted.constraints
      }));
      res.status(201).json(rule);
    } catch (error) { next(error); }
  });

  router.post('/scheduler/rules/from-text', async (req, res, next) => {
    try {
      const text = normalizeString(req.body?.text);
      if (!text) throw createValidationError(['text is required']);
      if (text.length > 2000) throw createValidationError(['text must have at most 2000 characters']);
      const tasks = await fetchTasks();
      const constraintTypes = await fetchSchedulerConstraintTypes(undefined, { enabledOnly: true });
      const interpretedRules = await interpretSchedulerRules({ text, tasks, constraintTypes });
      const rules = await withTransaction(async (client) => {
        const created = [];
        for (const interpreted of interpretedRules) {
          created.push(await createSchedulerRule(client, {
            text: interpreted.text,
            interpretation: interpreted.interpretation,
            status: interpreted.status,
            enabled: interpreted.enabled,
            confidence: interpreted.confidence,
            model: interpreted.model,
            rawResponse: {
              ...interpreted.rawResponse,
              sourceText: text,
              splitFromInput: interpreted.text !== text
            },
            constraints: interpreted.constraints
          }));
        }
        return created;
      });
      res.status(201).json({ rules });
    } catch (error) { next(error); }
  });

  router.patch('/scheduler/rules/:id', async (req, res, next) => {
    try {
      const patch: Record<string, any> = {};
      if (typeof req.body?.text === 'string') patch.text = normalizeString(req.body.text);
      if (typeof req.body?.enabled === 'boolean') {
        patch.enabled = req.body.enabled;
        patch.status = req.body.enabled ? 'active' : 'disabled';
      }
      if (typeof req.body?.status === 'string') patch.status = normalizeString(req.body.status);
      const rule = await withTransaction((client) => updateSchedulerRule(client, req.params.id, patch));
      if (!rule) return res.status(404).json({ error: 'Scheduler rule not found' });
      return res.json(rule);
    } catch (error) { return next(error); }
  });

  router.post('/scheduler/rules/:id/reinterpret', async (req, res, next) => {
    try {
      const rules = await fetchSchedulerRules();
      const current = rules.find((rule) => rule.id === req.params.id);
      if (!current) return res.status(404).json({ error: 'Scheduler rule not found' });
      const tasks = await fetchTasks();
      const constraintTypes = await fetchSchedulerConstraintTypes(undefined, { enabledOnly: true });
      const interpreted = await interpretSchedulerRule({ text: current.text, tasks, constraintTypes });
      const rule = await withTransaction((client) => updateSchedulerRule(client, current.id, {
        interpretation: interpreted.interpretation,
        status: interpreted.status,
        enabled: interpreted.enabled,
        confidence: interpreted.confidence,
        model: interpreted.model,
        rawResponse: interpreted.rawResponse,
        constraints: interpreted.constraints
      }));
      return res.json(rule);
    } catch (error) { return next(error); }
  });

  router.delete('/scheduler/rules/:id', async (req, res, next) => {
    try {
      const deleted = await deleteSchedulerRule(undefined, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Scheduler rule not found' });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });

  return router;
}

module.exports = { createSchedulerRuleRouter };

export {};
