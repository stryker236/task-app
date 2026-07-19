const express = require('express');
const { interpretSchedulerRule, interpretSchedulerRules, normalizeInterpretation } = require('../ai/schedulerRuleInterpreter');
const { createValidationError, normalizeString } = require('../tasks/taskValidation');


const STATUSES = ['new', 'in_progress', 'waiting', 'done', 'cancelled'];
const CONSTRAINT_TYPES = [
  'blocked_window',
  'allowed_window',
  'preferred_window',
  'avoid_day',
  'min_duration',
  'max_duration',
  'priority_boost',
  'daily_limit',
  'break_after_task',
  'break_after_work_block',
  'allowed_date'
];

function cleanStringList(value, maxItems = 20) {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(items.map((item) => normalizeString(item)).filter(Boolean))].slice(0, maxItems);
}

function cleanIntegerList(value, min, max, maxItems = 20) {
  const items = Array.isArray(value) ? value : [value];
  return [...new Set(items.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= min && item <= max))].slice(0, maxItems);
}

function cleanPositiveInteger(value, field, errors, { min = 1, max = 1440 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    errors.push(`${field} must be an integer between ${min} and ${max}`);
    return null;
  }
  return number;
}

function cleanTime(value, field, errors) {
  const text = normalizeString(value);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    errors.push(`${field} must use HH:mm`);
    return '';
  }
  return text;
}

function cleanDate(value, field, errors) {
  const text = normalizeString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    errors.push(`${field} must use YYYY-MM-DD`);
    return '';
  }
  return text;
}

function cleanDateList(value, field, errors: string[], maxItems = 20) {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const dates: string[] = [];
  for (const item of items) {
    const text = normalizeString(item);
    if (!text) continue;
    const date = cleanDate(text, field, errors);
    if (date && !dates.includes(date)) dates.push(date);
  }
  return dates.slice(0, maxItems);
}

function applyOptionalDays(payload: Record<string, any>, source: Record<string, any>) {
  const days = cleanIntegerList(source.days, 1, 7, 7);
  if (days.length) payload.days = days;
}

function applyOptionalDates(payload: Record<string, any>, source: Record<string, any>, errors: string[]) {
  const date = source.date != null && String(source.date).trim() !== '' ? cleanDate(source.date, 'date', errors) : '';
  const dates = cleanDateList(source.dates, 'dates', errors);
  if (date) payload.date = date;
  if (dates.length) payload.dates = dates;
}

function applyOptionalTimeWindow(payload: Record<string, any>, source: Record<string, any>, errors: string[]) {
  const hasStart = source.startTime != null && String(source.startTime).trim() !== '';
  const hasEnd = source.endTime != null && String(source.endTime).trim() !== '';
  if (!hasStart && !hasEnd) return;
  if (!hasStart || !hasEnd) {
    errors.push('startTime and endTime must be filled together');
    return;
  }
  const startTime = cleanTime(source.startTime, 'startTime', errors);
  const endTime = cleanTime(source.endTime, 'endTime', errors);
  if (startTime && endTime && endTime <= startTime) errors.push('endTime must be after startTime');
  if (startTime && endTime) {
    payload.startTime = startTime;
    payload.endTime = endTime;
  }
}

function sanitizeManualScope(value) {
  const source: Record<string, any> = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  const scope: Record<string, any> = {};
  const tags = cleanStringList(source.tags);
  const titleIncludes = cleanStringList(source.titleIncludes);
  const taskIds = cleanStringList(source.taskIds, 50);
  const statuses = cleanStringList(source.statuses).filter((status) => STATUSES.includes(status));
  const priorities = cleanIntegerList(source.priorities, 1, 4, 4);
  if (tags.length) scope.tags = tags;
  if (titleIncludes.length) scope.titleIncludes = titleIncludes;
  if (taskIds.length) scope.taskIds = taskIds;
  if (statuses.length) scope.statuses = statuses;
  if (priorities.length) scope.priorities = priorities;
  if (source.allTasks === true && !Object.keys(scope).length) scope.allTasks = true;
  return scope;
}

function sanitizeManualPayload(type, value, errors: string[]) {
  const source: Record<string, any> = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  const payload: Record<string, any> = {};
  if (['blocked_window', 'allowed_window', 'preferred_window'].includes(type)) {
    payload.startTime = cleanTime(source.startTime, 'startTime', errors);
    payload.endTime = cleanTime(source.endTime, 'endTime', errors);
    if (payload.startTime && payload.endTime && payload.endTime <= payload.startTime) errors.push('endTime must be after startTime');
    applyOptionalDays(payload, source);
    applyOptionalDates(payload, source, errors);
    return payload;
  }
  if (type === 'avoid_day') {
    payload.days = cleanIntegerList(source.days, 1, 7, 7);
    if (!payload.days.length) errors.push('days must include at least one weekday');
    return payload;
  }
  if (type === 'min_duration' || type === 'max_duration') {
    payload.minutes = cleanPositiveInteger(source.minutes, 'minutes', errors);
    return payload;
  }
  if (type === 'daily_limit') {
    payload.max = cleanPositiveInteger(source.max, 'max', errors, { min: 1, max: 50 });
    applyOptionalDays(payload, source);
    applyOptionalDates(payload, source, errors);
    applyOptionalTimeWindow(payload, source, errors);
    return payload;
  }
  if (type === 'break_after_task') {
    payload.breakMinutes = cleanPositiveInteger(source.breakMinutes, 'breakMinutes', errors, { min: 1, max: 240 });
    if (source.minDurationMinutes != null && String(source.minDurationMinutes).trim() !== '') {
      payload.minDurationMinutes = cleanPositiveInteger(source.minDurationMinutes, 'minDurationMinutes', errors, { min: 1, max: 1440 });
    }
    return payload;
  }
  if (type === 'break_after_work_block') {
    payload.workMinutes = cleanPositiveInteger(source.workMinutes, 'workMinutes', errors, { min: 1, max: 1440 });
    payload.breakMinutes = cleanPositiveInteger(source.breakMinutes, 'breakMinutes', errors, { min: 1, max: 240 });
    return payload;
  }
  if (type === 'allowed_date') {
    applyOptionalDates(payload, source, errors);
    if (!payload.date && !payload.dates?.length) errors.push('date or dates must include at least one YYYY-MM-DD value');
    applyOptionalTimeWindow(payload, source, errors);
    return payload;
  }
  if (type === 'priority_boost') {
    applyOptionalDays(payload, source);
    applyOptionalDates(payload, source, errors);
    applyOptionalTimeWindow(payload, source, errors);
    if (source.weight != null && String(source.weight).trim() !== '') {
      payload.weight = cleanPositiveInteger(source.weight, 'weight', errors, { min: 1, max: 10 });
    }
    return payload;
  }
  errors.push(`Unsupported constraint type: ${type}`);
  return payload;
}

function sanitizeManualSchedulerConstraints(input, constraintTypes) {
  const items = Array.isArray(input) ? input : [];
  if (!items.length) throw createValidationError(['constraints must be a non-empty array']);
  if (items.length > 30) throw createValidationError(['constraints must have at most 30 items']);
  const errors: string[] = [];
  const constraints = items.map((item, index) => {
    const type = normalizeString(item?.type);
    if (!CONSTRAINT_TYPES.includes(type)) errors.push(`constraints[${index}].type is invalid`);
    return {
      type,
      scope: sanitizeManualScope(item?.scope),
      payload: sanitizeManualPayload(type, item?.payload, errors),
      hard: typeof item?.hard === 'boolean' ? item.hard : true,
      enabled: item?.enabled !== false
    };
  });
  const normalized = normalizeInterpretation({ constraints }, constraintTypes);
  if (errors.length || normalized.constraints.length !== constraints.length) {
    throw createValidationError(errors.length ? errors : ['constraints contain invalid payloads']);
  }
  return normalized.constraints;
}
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
      if (typeof req.body?.text === 'string') {
        patch.text = normalizeString(req.body.text);
        if (!patch.text) throw createValidationError(['text is required']);
        if (patch.text.length > 1000) throw createValidationError(['text must have at most 1000 characters']);
      }
      if (typeof req.body?.enabled === 'boolean') {
        patch.enabled = req.body.enabled;
        patch.status = req.body.enabled ? 'active' : 'disabled';
      }
      if (typeof req.body?.status === 'string') patch.status = normalizeString(req.body.status);
      if (Array.isArray(req.body?.constraints)) {
        const constraintTypes = await fetchSchedulerConstraintTypes(undefined, { enabledOnly: true });
        patch.constraints = sanitizeManualSchedulerConstraints(req.body.constraints, constraintTypes);
        patch.status = patch.enabled === false ? 'disabled' : 'active';
        patch.confidence = null;
        patch.model = 'manual';
        patch.rawResponse = { source: 'manual_constraint_edit', constraints: patch.constraints };
      }
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
