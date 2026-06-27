const express = require('express');
const { generateTaskAdvisorAdvice, generateTaskAdvisorCommands } = require('../ai/aiAdvisor');
const {
  getAiCommandsFromBody,
  prepareAiCommand,
  applyPreparedAiCommand,
  buildAiCommandsPreview
} = require('../ai/aiCommands');
const { normalizeString, createValidationError } = require('../tasks/taskValidation');

function createAdvisorRouter({
  fetchTasks,
  fetchTags,
  withTransaction,
  updateTaskRecord,
  insertActivity,
  insertTask,
  findTaskById
}) {
  const router = express.Router();

  router.get('/advisor', async (req, res, next) => {
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

  router.post('/ai/advisor/request', async (req, res, next) => {
    try {
      const message = normalizeString(req.body.message);
      if (!message) throw createValidationError(['message is required']);
      if (message.length > 2000) throw createValidationError(['message must have at most 2000 characters']);

      const [tasks, tags] = await Promise.all([fetchTasks(), fetchTags('')]);
      const advisor = await generateTaskAdvisorCommands({ message, tasks, tags });
      const prepared = buildAiCommandsPreview(advisor.commands, tasks);

      res.json({
        mode: 'advisor_preview',
        generatedAt: advisor.generatedAt,
        source: advisor.source,
        model: advisor.model,
        summary: advisor.summary,
        commandCount: prepared.length,
        commands: prepared,
        rawCommands: advisor.commands
      });
    } catch (error) { next(error); }
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
