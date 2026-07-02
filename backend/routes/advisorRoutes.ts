const express = require('express');
const { ADVISOR_ACTIONS, generateTaskAdvisorAdvice, generateTaskAdvisorCommands, resolveAdvisorAction } = require('../ai/aiAdvisor');
const {
  getAiCommandsFromBody,
  prepareAiCommand,
  applyPreparedAiCommand,
  buildAiCommandsPreview
} = require('../ai/aiCommands');
const { createMemoryRateLimit } = require('../middleware/rateLimit');
const { normalizeString, createValidationError } = require('../tasks/taskValidation');
const {
  buildAdvisorMemoryContext,
  filterAdvisorCommandPairsByMemory,
  inferAdvisorMemoryRule,
  sanitizeAdvisorFeedback,
  titleFingerprint
} = require('../ai/advisorMemory');

const aiRateLimit = createMemoryRateLimit({
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 10000),
  max: Number(process.env.AI_RATE_LIMIT_MAX || 3),
  message: 'AI request rate limit exceeded'
});

function createAdvisorRouter({
  fetchTasks,
  fetchTags,
  withTransaction,
  updateTaskRecord,
  insertActivity,
  insertTask,
  findTaskById,
  fetchAdvisorMemoryRules,
  saveAdvisorFeedback,
  upsertAdvisorMemoryRule,
  deleteAdvisorMemoryRule
}) {
  const router = express.Router();

  router.get('/advisor', aiRateLimit, async (req, res, next) => {
    try {
      const requestedLimit = Number(req.query.limit || 5);
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 && requestedLimit <= 10 ? requestedLimit : 5;
      res.json(await generateTaskAdvisorAdvice(await fetchTasks(), limit));
    } catch (error) { next(error); }
  });

  router.post('/ai/commands/preview', async (req, res, next) => {
    try {
      const commands = getAiCommandsFromBody(req.body);
      const prepared = buildAiCommandsPreview(commands, await fetchTasks());
      res.json({
        mode: 'preview',
        commandCount: prepared.length,
        commands: prepared
      });
    } catch (error) { next(error); }
  });

  router.post('/ai/advisor/request', aiRateLimit, async (req, res, next) => {
    try {
      const action = normalizeString(req.body.action);
      if (!resolveAdvisorAction(action)) {
        throw createValidationError([`action must be one of: ${Object.keys(ADVISOR_ACTIONS).join(', ')}`]);
      }

      const [tasks, tags, memoryRules] = await Promise.all([fetchTasks(), fetchTags(''), fetchAdvisorMemoryRules()]);
      const memory = buildAdvisorMemoryContext(memoryRules);
      const advisor = await generateTaskAdvisorCommands({
        action,
        tasks,
        tags,
        memory
      });
      const prepared = buildAiCommandsPreview(advisor.commands, tasks);
      const filtered = filterAdvisorCommandPairsByMemory({
        commands: advisor.commands,
        previews: prepared,
        memory,
        action
      });

      res.json({
        mode: 'advisor_preview',
        generatedAt: advisor.generatedAt,
        source: advisor.source,
        model: advisor.model,
        summary: advisor.summary,
        commandCount: filtered.previews.length,
        commands: filtered.previews,
        rawCommands: filtered.commands
      });
    } catch (error) { next(error); }
  });

  router.post('/ai/advisor/feedback', async (req, res, next) => {
    try {
      const action = normalizeString(req.body.action);
      if (!resolveAdvisorAction(action)) {
        throw createValidationError([`action must be one of: ${Object.keys(ADVISOR_ACTIONS).join(', ')}`]);
      }
      const commandPreview = req.body.commandPreview && typeof req.body.commandPreview === 'object' ? req.body.commandPreview : null;
      if (!commandPreview?.id || !commandPreview?.type) {
        throw createValidationError(['commandPreview with id and type is required']);
      }
      const feedback = sanitizeAdvisorFeedback(req.body.feedback || {});
      const memoryRule = inferAdvisorMemoryRule({ action, commandPreview, feedback });
      const changes = commandPreview.changes && typeof commandPreview.changes === 'object' ? commandPreview.changes : {};
      const taskTitle = commandPreview.taskTitle || changes?.after?.title || changes?.before?.title || changes?.createdTask?.title || null;
      const result = await withTransaction(async (client) => {
        await saveAdvisorFeedback(client, {
          action,
          commandId: commandPreview.id,
          commandType: commandPreview.type,
          taskId: commandPreview.taskId || null,
          taskTitle,
          titleFingerprint: memoryRule.titleFingerprint || titleFingerprint(taskTitle || ''),
          feedback,
          commandPreview,
          rawCommand: req.body.rawCommand || null
        });
        return upsertAdvisorMemoryRule(client, memoryRule);
      });
      res.status(201).json({ memoryRule: result });
    } catch (error) { next(error); }
  });

  router.get('/ai/advisor/memory', async (req, res, next) => {
    try {
      res.json(await fetchAdvisorMemoryRules());
    } catch (error) { next(error); }
  });

  router.delete('/ai/advisor/memory/:id', async (req, res, next) => {
    try {
      const deleted = await deleteAdvisorMemoryRule(undefined, req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Memory rule not found' });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });

  router.post('/ai/commands/apply', async (req, res, next) => {
    try {
      const commands = getAiCommandsFromBody(req.body);
      const result = await withTransaction(async (client) => {
        const applied = [];
        let tasks = await fetchTasks(client);
        for (const [index, command] of commands.entries()) {
          const prepared = prepareAiCommand(command, tasks, index);
          const now = new Date().toISOString();
          const commandResult = await applyPreparedAiCommand(client, prepared, tasks, now, {
            updateTaskRecord,
            insertActivity,
            insertTask,
            findTaskById
          });
          applied.push(commandResult);
          tasks = await fetchTasks(client);
        }
        return applied;
      });
      res.json({
        mode: 'apply',
        appliedCount: result.length,
        results: result
      });
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createAdvisorRouter };

export {};
