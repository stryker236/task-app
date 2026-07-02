const express = require('express');
const { ADVISOR_ACTIONS, generateTaskAdvisorAdvice, generateTaskAdvisorCommands, resolveAdvisorAction } = require('../ai/aiAdvisor');
const { createCalendarClient, createOAuthClient } = require('../google/googleClient');
const { decryptJson } = require('../google/tokenCrypto');
const {
  getAiCommandsFromBody,
  prepareAiCommand,
  applyPreparedAiCommand,
  buildAiCommandsPreview,
  calendarEventDuplicateFingerprint,
  calendarEventStartsInPast,
  alignCalendarEventToTaskDueDate,
  findExistingGoogleCalendarEvent
} = require('../ai/aiCommands');
const { createMemoryRateLimit } = require('../middleware/rateLimit');
const { normalizeString, createValidationError } = require('../tasks/taskValidation');
const {
  advisorPreviewTitle,
  buildAdvisorMemoryContext,
  filterAdvisorCommandPairsByMemory,
  inferAdvisorInteractionMemoryRule,
  inferAdvisorMemoryRule,
  sanitizeAdvisorFeedback,
  titleFingerprint
} = require('../ai/advisorMemory');

const aiRateLimit = createMemoryRateLimit({
  windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 10000),
  max: Number(process.env.AI_RATE_LIMIT_MAX || 3),
  message: 'AI request rate limit exceeded'
});

function previewChangedFields(preview) {
  const changes = preview?.changes && typeof preview.changes === 'object' ? preview.changes : {};
  const before = changes.before || {};
  const after = changes.after || {};
  return Object.keys(after).filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null));
}

function filterAdvisorCommandPairsByAction({ action, commands = [], previews = [] }) {
  const onlyFieldByAction = {
    priority_management: 'priority',
    suggest_due_dates: 'dueDateTime'
  };
  if (action === 'schedule_calendar_events') {
    const keptCommands = [];
    const keptPreviews = [];
    previews.forEach((preview, index) => {
      if (preview.type !== 'create_calendar_event') return;
      keptPreviews.push(preview);
      keptCommands.push(commands[index]);
    });
    return { commands: keptCommands, previews: keptPreviews };
  }
  const onlyField = onlyFieldByAction[action];
  if (!onlyField) return { commands, previews };
  const keptCommands = [];
  const keptPreviews = [];
  previews.forEach((preview, index) => {
    const changedFields = previewChangedFields(preview);
    if (preview.type !== 'update_task') return;
    if (changedFields.length !== 1 || changedFields[0] !== onlyField) return;
    keptPreviews.push(preview);
    keptCommands.push(commands[index]);
  });
  return { commands: keptCommands, previews: keptPreviews };
}

function toAdvisorCalendar(calendar) {
  return {
    id: calendar.id,
    summary: calendar.summary || '(Sem nome)',
    description: calendar.description || '',
    primary: Boolean(calendar.primary),
    accessRole: calendar.accessRole || '',
    timeZone: calendar.timeZone || null
  };
}

async function fetchWritableAdvisorCalendars({ pool, fetchGoogleConnection, saveGoogleConnection }) {
  if (!pool || !fetchGoogleConnection || !saveGoogleConnection) return [];
  const connection = await fetchGoogleConnection();
  if (!connection) return [];
  const storedTokens = decryptJson(connection.encryptedTokens);
  const authClient = createOAuthClient(storedTokens);
  authClient.on('tokens', (tokens) => {
    saveGoogleConnection(pool, {
      accountEmail: connection.accountEmail,
      scopes: connection.scopes,
      encryptedTokens: { ...storedTokens, ...tokens },
      expiresAt: connection.expiresAt
    }).catch((error) => console.error('Failed to persist refreshed Google tokens:', error.message));
  });
  const calendar = createCalendarClient(authClient);
  const result = await calendar.calendarList.list({
    minAccessRole: 'writer',
    showDeleted: false,
    showHidden: false
  });
  return (result.data.items || []).map(toAdvisorCalendar).filter((item) => item.id);
}

function filterCalendarCommandsByKnownCalendars({ commands = [], previews = [], calendars = [] }) {
  if (!calendars.length) return { commands, previews };
  const allowedIds = new Set(calendars.map((calendar) => calendar.id));
  const keptCommands = [];
  const keptPreviews = [];
  previews.forEach((preview, index) => {
    if (preview.type === 'create_calendar_event') {
      const calendarId = preview.changes?.calendarEvent?.calendarId || commands[index]?.event?.calendarId || 'primary';
      if (!allowedIds.has(calendarId)) return;
    }
    keptPreviews.push(preview);
    keptCommands.push(commands[index]);
  });
  return { commands: keptCommands, previews: keptPreviews };
}

function filterPastCalendarCommands(commands = [], now = Date.now()) {
  return commands.filter((command) => {
    if (command.type !== 'create_calendar_event') return true;
    return !calendarEventStartsInPast(command.event, now);
  });
}

function alignCalendarCommandsToTaskDueDate(commands = [], tasks = []) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  return commands.map((command) => {
    if (command.type !== 'create_calendar_event' || !command.taskId) return command;
    const task = tasksById.get(command.taskId);
    if (!task?.dueDateTime) return command;
    return {
      ...command,
      event: alignCalendarEventToTaskDueDate(command.event, task)
    };
  });
}

function filterDuplicateCalendarCommandPairs({ commands = [], previews = [] }) {
  const seenEvents = new Set();
  const keptCommands = [];
  const keptPreviews = [];
  previews.forEach((preview, index) => {
    if (preview.type === 'create_calendar_event') {
      const event = commands[index]?.event || preview.changes?.calendarEvent;
      const fingerprint = event ? calendarEventDuplicateFingerprint(event) : '';
      if (fingerprint && seenEvents.has(fingerprint)) return;
      if (fingerprint) seenEvents.add(fingerprint);
      if (preview.alreadyExists) return;
    }
    keptPreviews.push(preview);
    keptCommands.push(commands[index]);
  });
  return { commands: keptCommands, previews: keptPreviews };
}

async function filterExistingGoogleCalendarCommandPairs({ commands = [], previews = [], dependencies }) {
  const checkedEvents = new Map();
  const pairs = await Promise.all(previews.map(async (preview, index) => {
    if (preview.type !== 'create_calendar_event') return { command: commands[index], preview };
    const event = commands[index]?.event || preview.changes?.calendarEvent;
    if (!event) return { command: commands[index], preview };
    const fingerprint = calendarEventDuplicateFingerprint(event);
    if (!checkedEvents.has(fingerprint)) {
      checkedEvents.set(fingerprint, findExistingGoogleCalendarEvent(event, dependencies));
    }
    const existingEvent = await checkedEvents.get(fingerprint);
    if (existingEvent) return null;
    return { command: commands[index], preview };
  }));
  const keptPairs = pairs.filter(Boolean);
  return {
    commands: keptPairs.map((pair) => pair.command),
    previews: keptPairs.map((pair) => pair.preview)
  };
}

function addCalendarLabelsToPreviews(previews = [], calendars = []) {
  if (!calendars.length) return previews;
  const calendarsById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  return previews.map((preview) => {
    if (preview.type !== 'create_calendar_event') return preview;
    const changes = preview.changes && typeof preview.changes === 'object' ? preview.changes : {};
    const event = changes.calendarEvent && typeof changes.calendarEvent === 'object' ? changes.calendarEvent : null;
    if (!event?.calendarId) return preview;
    const calendar = calendarsById.get(event.calendarId);
    if (!calendar) return preview;
    return {
      ...preview,
      changes: {
        ...changes,
        calendarEvent: {
          ...event,
          calendarSummary: calendar.summary,
          calendarPrimary: calendar.primary
        }
      }
    };
  });
}

function defaultAdvisorCalendarId(calendars = [], requestedCalendarId = '') {
  if (requestedCalendarId && calendars.some((calendar) => calendar.id === requestedCalendarId)) return requestedCalendarId;
  return calendars.find((calendar) => String(calendar.summary || '').toLocaleLowerCase() === 'aiadvisor')?.id
    || calendars.find((calendar) => calendar.primary)?.id
    || calendars[0]?.id
    || 'primary';
}

function defaultAdvisorCalendar(calendars = [], requestedCalendarId = '') {
  if (requestedCalendarId) {
    const requested = calendars.find((calendar) => calendar.id === requestedCalendarId);
    if (requested) return requested;
  }
  return calendars.find((calendar) => String(calendar.summary || '').toLocaleLowerCase() === 'aiadvisor')
    || calendars.find((calendar) => calendar.primary)
    || calendars[0]
    || null;
}

function applyDefaultCalendarToCommands(commands = [], calendars = [], requestedCalendarId = '') {
  const defaultCalendar = defaultAdvisorCalendar(calendars, requestedCalendarId);
  const defaultCalendarId = defaultCalendar?.id || defaultAdvisorCalendarId(calendars, requestedCalendarId);
  const defaultCalendarSummary = defaultCalendar?.summary || defaultCalendarId;
  return commands.map((command) => {
    if (command.type !== 'create_calendar_event') return command;
    const event = command.event && typeof command.event === 'object' ? command.event : {};
    return {
      ...command,
      event: {
        ...event,
        calendarId: defaultCalendarId,
        calendarSelectionReason: `default calendar: ${defaultCalendarSummary}`
      }
    };
  });
}

function createAdvisorRouter({
  fetchTasks,
  fetchTags,
  withTransaction,
  updateTaskRecord,
  insertActivity,
  insertTask,
  findTaskById,
  pool,
  fetchGoogleConnection,
  saveGoogleConnection,
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
      const requestedDefaultCalendarId = normalizeString(req.body.defaultCalendarId);
      if (!resolveAdvisorAction(action)) {
        throw createValidationError([`action must be one of: ${Object.keys(ADVISOR_ACTIONS).join(', ')}`]);
      }

      const [tasks, tags, memoryRules, calendars] = await Promise.all([
        fetchTasks(),
        fetchTags(''),
        fetchAdvisorMemoryRules(),
        action === 'schedule_calendar_events'
          ? fetchWritableAdvisorCalendars({ pool, fetchGoogleConnection, saveGoogleConnection })
          : Promise.resolve([])
      ]);
      const memory = buildAdvisorMemoryContext(memoryRules);
      const advisor = await generateTaskAdvisorCommands({
        action,
        tasks,
        tags,
        memory,
        calendars
      });
      const advisorCommands = filterPastCalendarCommands(
          alignCalendarCommandsToTaskDueDate(
          applyDefaultCalendarToCommands(advisor.commands, calendars, requestedDefaultCalendarId),
          tasks
        )
      );
      const prepared = buildAiCommandsPreview(advisorCommands, tasks);
      const actionFiltered = filterAdvisorCommandPairsByAction({
        action,
        commands: advisorCommands,
        previews: prepared
      });
      const calendarFiltered = filterCalendarCommandsByKnownCalendars({
        commands: actionFiltered.commands,
        previews: actionFiltered.previews,
        calendars
      });
      const duplicateFiltered = filterDuplicateCalendarCommandPairs({
        commands: calendarFiltered.commands,
        previews: calendarFiltered.previews
      });
      const existingGoogleFiltered = action === 'schedule_calendar_events'
        ? await filterExistingGoogleCalendarCommandPairs({
          commands: duplicateFiltered.commands,
          previews: duplicateFiltered.previews,
          dependencies: { pool, fetchGoogleConnection, saveGoogleConnection }
        })
        : duplicateFiltered;
      const filtered = filterAdvisorCommandPairsByMemory({
        commands: existingGoogleFiltered.commands,
        previews: existingGoogleFiltered.previews,
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
        commands: addCalendarLabelsToPreviews(filtered.previews, calendars),
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
      const feedback = sanitizeAdvisorFeedback(action, req.body.feedback || {});
      const memoryRule = inferAdvisorMemoryRule({ action, commandPreview, feedback });
      const taskTitle = advisorPreviewTitle(commandPreview) || null;
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

  router.post('/ai/advisor/interaction-feedback', async (req, res, next) => {
    try {
      const action = normalizeString(req.body.action);
      if (!resolveAdvisorAction(action)) {
        throw createValidationError([`action must be one of: ${Object.keys(ADVISOR_ACTIONS).join(', ')}`]);
      }
      const interaction = req.body.interaction && typeof req.body.interaction === 'object' ? req.body.interaction : {};
      const feedback = sanitizeAdvisorFeedback(action, req.body.feedback || {});
      const memoryRule = inferAdvisorInteractionMemoryRule({ action, interaction, feedback });
      const result = await withTransaction(async (client) => {
        await saveAdvisorFeedback(client, {
          action,
          commandId: `interaction:${String(interaction.generatedAt || Date.now())}`,
          commandType: 'interaction',
          taskId: null,
          taskTitle: null,
          titleFingerprint: '',
          feedback,
          commandPreview: {
            type: 'interaction',
            summary: interaction.summary || '',
            commandCount: Number(interaction.commandCount || 0),
            generatedAt: interaction.generatedAt || null
          },
          rawCommand: null
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
            findTaskById,
            pool,
            fetchGoogleConnection,
            saveGoogleConnection
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
