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
  findExistingGoogleCalendarEvent
} = require('../ai/aiCommands');
const { createMemoryRateLimit } = require('../middleware/rateLimit');
const { normalizeString, createValidationError } = require('../tasks/taskValidation');
const { logger } = require('../logger');
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
    }).catch((error) => logger.error('calendar.connection.token_refresh_failed', { metadata: { message: error.message } }));
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
    if (preview.taskId && dependencies.fetchTaskCalendarEvents) {
      const linkedEvents = await dependencies.fetchTaskCalendarEvents(dependencies.pool, preview.taskId);
      if (linkedEvents.length) return null;
    }
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

function compactRejection(reason: string, command: any = {}, preview: any = null, attempt = 1, details = '', extra: Record<string, any> = {}) {
  return {
    status: reason,
    reason,
    attempt,
    commandId: preview?.id || command.id || '',
    taskId: preview?.taskId || command.taskId || null,
    taskTitle: preview?.taskTitle || null,
    summary: preview?.summary || command.event?.summary || command.label || '',
    details,
    ...extra
  };
}

function addDebugCount(debug: Record<string, any>, key: string, count: number) {
  debug[key] = (debug[key] || 0) + count;
}

function countRejectionReasons(rejections: any[]) {
  return rejections.reduce((counts, rejection) => {
    counts[rejection.reason] = (counts[rejection.reason] || 0) + 1;
    return counts;
  }, {});
}

function calendarTitleFingerprint(event: any) {
  return [
    normalizeString(event?.calendarId) || 'primary',
    normalizeString(event?.summary).toLocaleLowerCase().replace(/\s+/g, ' ').trim()
  ].join('|');
}

async function filterExistingGoogleCalendarPairsWithDebug({ pairs = [], dependencies, attempt }: any) {
  const checkedEvents = new Map();
  const accepted = [];
  const rejected = [];
  for (const pair of pairs) {
    const { command, preview } = pair;
    if (preview.taskId && dependencies.fetchTaskCalendarEvents) {
      const linkedEvents = await dependencies.fetchTaskCalendarEvents(dependencies.pool, preview.taskId);
      if (linkedEvents.length) {
        rejected.push(compactRejection('rejected_existing_linked_task_event', command, preview, attempt, linkedEvents[0].summary || linkedEvents[0].googleEventId));
        continue;
      }
    }
    const event = command.event || preview.changes?.calendarEvent;
    if (!event) {
      rejected.push(compactRejection('rejected_event_missing_start_or_end', command, preview, attempt, 'missing event payload'));
      continue;
    }
    const fingerprint = calendarEventDuplicateFingerprint(event);
    if (!checkedEvents.has(fingerprint)) {
      checkedEvents.set(fingerprint, findExistingGoogleCalendarEvent(event, dependencies));
    }
    const existingEvent = await checkedEvents.get(fingerprint);
    if (existingEvent) {
      rejected.push(compactRejection('rejected_existing_google_event', command, preview, attempt, existingEvent.summary || existingEvent.id));
      continue;
    }
    accepted.push(pair);
  }
  return { accepted, rejected };
}

async function buildScheduleCalendarPreview({ rawCommands, tasks, calendars, memory, requestedDefaultCalendarId, dependencies, attempt }: any) {
  const tasksById = new Map<string, any>(tasks.map((task) => [task.id, task]));
  const allowedCalendarIds = new Set(calendars.map((calendar) => calendar.id));
  const debug = {
    generatedCount: rawCommands.length,
    afterActionFilter: 0,
    afterCalendarFilter: 0,
    afterPastFilter: 0,
    afterDuplicateBatchFilter: 0,
    afterExistingGoogleFilter: 0,
    afterMemoryFilter: 0
  };
  const rejected = [];
  const withDefaultCalendar = applyDefaultCalendarToCommands(rawCommands, calendars, requestedDefaultCalendarId);

  const actionFiltered = [];
  for (const command of withDefaultCalendar) {
    if (command.type !== 'create_calendar_event') {
      rejected.push(compactRejection('rejected_wrong_action', command, null, attempt));
      continue;
    }
    actionFiltered.push(command);
  }
  debug.afterActionFilter = actionFiltered.length;

  const calendarFiltered = [];
  for (const command of actionFiltered) {
    const calendarId = command.event?.calendarId || 'primary';
    if (allowedCalendarIds.size && !allowedCalendarIds.has(calendarId)) {
      rejected.push(compactRejection('rejected_invalid_calendar', command, null, attempt, calendarId));
      continue;
    }
    calendarFiltered.push(command);
  }
  debug.afterCalendarFilter = calendarFiltered.length;

  const timingFiltered = [];
  for (const command of calendarFiltered) {
    const start = command.event?.start;
    const end = command.event?.end;
    if (!start || !end) {
      rejected.push(compactRejection('rejected_event_missing_start_or_end', command, null, attempt));
      continue;
    }
    if (calendarEventStartsInPast(command.event)) {
      rejected.push(compactRejection('rejected_past', command, null, attempt, start));
      continue;
    }
    timingFiltered.push(command);
  }
  debug.afterPastFilter = timingFiltered.length;

  const seen = new Set();
  const duplicateFiltered = [];
  for (const command of timingFiltered) {
    const fingerprint = calendarTitleFingerprint(command.event);
    if (fingerprint && seen.has(fingerprint)) {
      rejected.push(compactRejection('rejected_duplicate_title', command, null, attempt));
      continue;
    }
    if (fingerprint) seen.add(fingerprint);
    duplicateFiltered.push(command);
  }
  debug.afterDuplicateBatchFilter = duplicateFiltered.length;

  const previewPairs = [];
  for (const [index, command] of duplicateFiltered.entries()) {
    try {
      const preview = buildAiCommandsPreview([command], tasks)[0];
      if (!preview) {
        rejected.push(compactRejection('rejected_validation_error', command, null, attempt, 'preview not created'));
        continue;
      }
      previewPairs.push({ command, preview });
    } catch (error) {
      rejected.push(compactRejection('rejected_validation_error', command, null, attempt, error.message || `command ${index + 1}`));
    }
  }

  const existingFiltered = await filterExistingGoogleCalendarPairsWithDebug({
    pairs: previewPairs,
    dependencies,
    attempt
  });
  rejected.push(...existingFiltered.rejected);
  debug.afterExistingGoogleFilter = existingFiltered.accepted.length;

  const memoryFiltered = filterAdvisorCommandPairsByMemory({
    commands: existingFiltered.accepted.map((pair) => pair.command),
    previews: existingFiltered.accepted.map((pair) => pair.preview),
    memory,
    action: 'schedule_calendar_events'
  });
  for (const item of memoryFiltered.rejected || []) {
    rejected.push(compactRejection('rejected_memory', item.command, item.preview, attempt, 'matched advisor memory', {
      memoryRules: item.memoryRules || []
    }));
  }
  debug.afterMemoryFilter = memoryFiltered.previews.length;

  return {
    commands: memoryFiltered.commands,
    previews: memoryFiltered.previews,
    rejected,
    debug
  };
}

async function generateScheduleCalendarEventsWithDiagnostics({ tasks, tags, memory, calendars, requestedDefaultCalendarId, dependencies }) {
  const targetPreviewCount = 8;
  const maxAttempts = 2;
  const excludeTaskIds = new Set();
  const acceptedCommands = [];
  const acceptedPreviews = [];
  const rejected = [];
  const debug = {
    generatedCount: 0,
    afterActionFilter: 0,
    afterCalendarFilter: 0,
    afterPastFilter: 0,
    afterDuplicateBatchFilter: 0,
    afterExistingGoogleFilter: 0,
    afterMemoryFilter: 0,
    attempts: 0,
    rejectionReasons: {}
  };
  let advisor = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (acceptedPreviews.length >= targetPreviewCount) break;
    advisor = await generateTaskAdvisorCommands({
      action: 'schedule_calendar_events',
      tasks,
      tags,
      memory,
      calendars,
      excludeTaskIds: [...excludeTaskIds],
      maxCalendarEventCommands: 20
    });
    debug.attempts = attempt;
    const processedTaskIds = new Set((advisor.commands || []).map((command) => command.taskId).filter(Boolean).map(String));
    const attemptResult = await buildScheduleCalendarPreview({
      rawCommands: advisor.commands || [],
      tasks,
      calendars,
      memory,
      requestedDefaultCalendarId,
      dependencies,
      attempt
    });
    ['generatedCount', 'afterActionFilter', 'afterCalendarFilter', 'afterPastFilter', 'afterDuplicateBatchFilter', 'afterExistingGoogleFilter', 'afterMemoryFilter']
      .forEach((key) => addDebugCount(debug, key, attemptResult.debug[key] || 0));
    acceptedCommands.push(...attemptResult.commands);
    acceptedPreviews.push(...attemptResult.previews);
    rejected.push(...attemptResult.rejected);
    acceptedPreviews.forEach((preview) => preview.taskId && processedTaskIds.add(String(preview.taskId)));
    attemptResult.rejected.forEach((item) => item.taskId && processedTaskIds.add(String(item.taskId)));
    processedTaskIds.forEach((taskId) => excludeTaskIds.add(taskId));
  }

  debug.afterMemoryFilter = acceptedPreviews.length;
  debug.rejectionReasons = countRejectionReasons(rejected);
  logger.info('advisor.calendar.filter.result', {
    metadata: {
      generated: debug.generatedCount,
      kept: acceptedPreviews.length,
      rejected: debug.rejectionReasons,
      rejectedTasks: rejected.map((item) => ({
        taskId: item.taskId,
        taskTitle: item.taskTitle,
        reason: item.reason
      }))
    }
  });
  return {
    advisor,
    commands: acceptedCommands.slice(0, 20),
    previews: acceptedPreviews.slice(0, 20),
    debug: {
      ...debug,
      rejectedCount: rejected.length,
      rejectionReasons: countRejectionReasons(rejected),
      rejections: rejected
    }
  };
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
  deleteAdvisorMemoryRule,
  fetchTaskCalendarEvents,
  insertTaskCalendarEvent
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
      const startedAt = Date.now();
      const action = normalizeString(req.body.action);
      const requestedDefaultCalendarId = normalizeString(req.body.defaultCalendarId);
      (req as any).log?.('info', 'advisor.request.started', {
        metadata: { action, requestedDefaultCalendarId }
      });
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
      if (action === 'schedule_calendar_events') {
        const scheduled = await generateScheduleCalendarEventsWithDiagnostics({
          tasks,
          tags,
          memory,
          calendars,
          requestedDefaultCalendarId,
          dependencies: { pool, fetchGoogleConnection, saveGoogleConnection, fetchTaskCalendarEvents }
        });
        const labeledPreviews = addCalendarLabelsToPreviews(scheduled.previews, calendars);
        (req as any).log?.('info', 'advisor.preview.generated', {
          durationMs: Date.now() - startedAt,
          metadata: {
            action,
            taskCount: tasks.length,
            generatedCount: scheduled.debug.generatedCount,
            commandCount: labeledPreviews.length,
            rejectionReasons: scheduled.debug.rejectionReasons
          }
        });
        return res.json({
          mode: 'advisor_preview',
          generatedAt: scheduled.advisor?.generatedAt || new Date().toISOString(),
          source: scheduled.advisor?.source || 'ai',
          model: scheduled.advisor?.model || null,
          summary: scheduled.advisor?.summary || 'Propostas de eventos geradas para validacao.',
          commandCount: labeledPreviews.length,
          commands: labeledPreviews,
          rawCommands: scheduled.commands,
          debug: scheduled.debug
        });
      }

      const advisor = await generateTaskAdvisorCommands({
        action,
        tasks,
        tags,
        memory,
        calendars
      });
      const advisorCommands = filterPastCalendarCommands(
        applyDefaultCalendarToCommands(advisor.commands, calendars, requestedDefaultCalendarId)
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
          dependencies: { pool, fetchGoogleConnection, saveGoogleConnection, fetchTaskCalendarEvents }
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
      (req as any).log?.('info', 'advisor.preview.generated', {
        durationMs: Date.now() - startedAt,
        metadata: {
          action,
          taskCount: tasks.length,
          generatedCount: advisor.commands.length,
          commandCount: filtered.previews.length
        }
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
      const startedAt = Date.now();
      const commands = getAiCommandsFromBody(req.body);
      (req as any).log?.('info', 'advisor.command.apply.started', {
        metadata: { commandCount: commands.length, commandTypes: commands.map((command) => command.type) }
      });
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
            saveGoogleConnection,
            fetchTaskCalendarEvents,
            insertTaskCalendarEvent
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
      (req as any).log?.('info', 'advisor.command.apply.completed', {
        durationMs: Date.now() - startedAt,
        metadata: { appliedCount: result.length }
      });
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createAdvisorRouter };

export {};
