const { randomUUID } = require('crypto');
const { buildNewTask } = require('../tasks/taskFactory');
const { CALENDAR_SCOPE, createCalendarClient, createOAuthClient } = require('../google/googleClient');
const { decryptJson } = require('../google/tokenCrypto');
const {
  RELATION_TYPES,
  normalizeString,
  createValidationError,
  validateTaskPayload,
  applyTaskStatusTimestamps
} = require('../tasks/taskValidation');
const { AI_COMMAND_TYPES } = require('../constants/aiConstants');
const { logger } = require('../logger');

function getAiCommandsFromBody(body) {
  const commands = Array.isArray(body?.commands) ? body.commands : [];
  if (!commands.length) throw createValidationError(['commands must be a non-empty array']);
  if (commands.length > 100) throw createValidationError(['commands must have at most 100 items']);
  return commands;
}

function normalizeAiCommand(command, index) {
  const type = normalizeString(command.type);
  const errors = [];
  if (!AI_COMMAND_TYPES.includes(type)) errors.push(`commands[${index}].type must be one of: ${AI_COMMAND_TYPES.join(', ')}`);
  const normalized: Record<string, any> = {
    id: normalizeString(command.id) || `cmd_${index + 1}`,
    type,
    reason: normalizeString(command.reason),
    label: normalizeString(command.label)
  };

  if (type === 'update_task') {
    normalized.taskId = normalizeString(command.taskId);
    normalized.patch = command.patch && typeof command.patch === 'object' && !Array.isArray(command.patch) ? command.patch : null;
    if (!normalized.taskId) errors.push(`commands[${index}].taskId is required`);
    if (!normalized.patch) errors.push(`commands[${index}].patch must be an object`);
  }

  if (type === 'add_relation') {
    normalized.taskId = normalizeString(command.taskId);
    normalized.relatedTaskId = normalizeString(command.relatedTaskId);
    normalized.relationType = command.relationType || command.typeOfRelation || command.relation_type;
    if (!normalized.taskId) errors.push(`commands[${index}].taskId is required`);
    if (!normalized.relatedTaskId) errors.push(`commands[${index}].relatedTaskId is required`);
    if (!RELATION_TYPES.includes(normalized.relationType)) errors.push(`commands[${index}].relationType must be one of: ${RELATION_TYPES.join(', ')}`);
  }

  if (type === 'create_task') {
    normalized.task = command.task && typeof command.task === 'object' && !Array.isArray(command.task) ? command.task : null;
    if (!normalized.task) errors.push(`commands[${index}].task must be an object`);
  }

  if (type === 'create_calendar_event') {
    normalized.taskId = normalizeString(command.taskId);
    normalized.periodicTaskId = normalizeString(command.periodicTaskId);
    normalized.event = command.event && typeof command.event === 'object' && !Array.isArray(command.event) ? command.event : null;
    if (!normalized.event) {
      errors.push(`commands[${index}].event must be an object`);
    } else {
      const summary = normalizeString(normalized.event.summary);
      const start = normalizeString(normalized.event.start);
      const end = normalizeString(normalized.event.end);
      const startTime = Date.parse(start);
      const endTime = Date.parse(end);
      if (!summary) errors.push(`commands[${index}].event.summary is required`);
      if (!start || Number.isNaN(startTime)) errors.push(`commands[${index}].event.start must be a valid ISO date-time`);
      if (!end || Number.isNaN(endTime)) errors.push(`commands[${index}].event.end must be a valid ISO date-time`);
      if (!Number.isNaN(startTime) && !Number.isNaN(endTime) && endTime <= startTime) {
        errors.push(`commands[${index}].event.end must be after event.start`);
      }
      normalized.event = {
        summary,
        description: normalizeString(normalized.event.description),
        location: normalizeString(normalized.event.location),
        start,
        end,
        timeZone: normalizeString(normalized.event.timeZone),
        calendarId: normalizeString(normalized.event.calendarId) || 'primary',
        calendarSelectionReason: normalizeString(normalized.event.calendarSelectionReason)
      };
    }
  }

  if (errors.length) throw createValidationError(errors);
  return normalized;
}

function assertTaskCanBeCompleted(task, tasks, previousStatus = null) {
  if (task.status !== 'done' || previousStatus === 'done') return;
  const tasksById = new Map(tasks.map((item) => [item.id, item]));
  const unfinished = task.blockedByTaskIds.map((id) => tasksById.get(id)).filter((dependency) => dependency && dependency.status !== 'done');
  const unfinishedChecklist = task.checklistItems.filter((item) => !item.isDone);
  if (unfinished.length || unfinishedChecklist.length) {
    const error = new Error('Blocked tasks cannot be completed');
    (error as any).status = 409;
    (error as any).details = [
      ...unfinished.map((dependency) => `Complete dependency: ${dependency.title}`),
      ...unfinishedChecklist.map((item) => `Complete checklist item: ${item.title}`)
    ];
    throw error;
  }
}

function normalizeCalendarEventIdentityText(value) {
  return normalizeString(value).toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function calendarEventTimeValue(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? '' : new Date(timestamp).toISOString();
}

function sameCalendarEventTitle(left, right) {
  const normalizedLeft = normalizeCalendarEventIdentityText(left);
  const normalizedRight = normalizeCalendarEventIdentityText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight;
}

function isSameGoogleCalendarEvent(candidate, event) {
  return sameCalendarEventTitle(candidate.summary, event.summary);
}

function calendarEventDuplicateFingerprint(event) {
  return [
    normalizeString(event.calendarId) || 'primary',
    normalizeCalendarEventIdentityText(event.summary),
    calendarEventTimeValue(event.start),
    calendarEventTimeValue(event.end)
  ].join('|');
}

function calendarEventStartsInPast(event, now = Date.now()) {
  const startTime = Date.parse(event?.start || '');
  return !Number.isNaN(startTime) && startTime < now;
}

function calendarEventDurationMinutes(event, fallbackMinutes = 30) {
  const startTime = Date.parse(event?.start || '');
  const endTime = Date.parse(event?.end || '');
  if (!Number.isNaN(startTime) && !Number.isNaN(endTime) && endTime > startTime) {
    return Math.max(15, Math.min(240, Math.round((endTime - startTime) / 60000)));
  }
  return fallbackMinutes;
}

function calendarEventTaskPatch(event) {
  const startTime = Date.parse(event?.start || '');
  if (Number.isNaN(startTime)) return null;
  return {
    dueDateTime: new Date(startTime).toISOString(),
    estimatedMinutes: calendarEventDurationMinutes(event)
  };
}

function alignCalendarEventToTaskDueDate(event, task) {
  const eventWithTaskTitle = task?.title
    ? { ...event, summary: task.title }
    : event;
  if (!task?.dueDateTime) return eventWithTaskTitle;
  const startTime = Date.parse(task.dueDateTime);
  if (Number.isNaN(startTime)) return eventWithTaskTitle;
  const fallbackDuration = Number(task.estimatedMinutes || 0) > 0
    ? Math.max(15, Math.min(240, Number(task.estimatedMinutes)))
    : 30;
  const durationMinutes = calendarEventDurationMinutes(eventWithTaskTitle, fallbackDuration);
  return {
    ...eventWithTaskTitle,
    start: new Date(startTime).toISOString(),
    end: new Date(startTime + durationMinutes * 60000).toISOString()
  };
}

function normalizeCalendarEventForTask(event, task) {
  return task?.title ? { ...event, summary: task.title } : event;
}

async function getAuthorizedCalendarClient(dependencies) {
  const { pool, fetchGoogleConnection, saveGoogleConnection } = dependencies;
  if (!fetchGoogleConnection || !saveGoogleConnection || !pool) {
    const error = new Error('Google Calendar dependencies are not configured');
    (error as any).status = 503;
    throw error;
  }
  const connection = await fetchGoogleConnection();
  if (!connection) {
    const error = new Error('Google Calendar is not connected');
    (error as any).status = 409;
    throw error;
  }
  if (!connection.scopes?.includes(CALENDAR_SCOPE)) {
    const error = new Error('Google Calendar write permission is required. Reconnect Google to grant calendar event access.');
    (error as any).status = 409;
    throw error;
  }
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
  return createCalendarClient(authClient);
}

async function findExistingGoogleCalendarEvent(event, dependencies) {
  const summary = normalizeString(event?.summary);
  if (!summary) return null;

  const calendar = await getAuthorizedCalendarClient(dependencies);
  const existingResult = await calendar.events.list({
    calendarId: event.calendarId || 'primary',
    q: summary,
    maxResults: 2500,
    showDeleted: false,
    singleEvents: true,
  });
  return (existingResult.data.items || []).find((candidate) => isSameGoogleCalendarEvent(candidate, event)) || null;
}

function prepareAiCommand(command, tasks, index) {
  const normalized = normalizeAiCommand(command, index);

  if (normalized.type === 'update_task') {
    const previous = tasks.find((task) => task.id === normalized.taskId);
    if (!previous) {
      const error = new Error(`Task not found for command ${normalized.id}`);
      (error as any).status = 404;
      throw error;
    }
    if (previous.isArchived) {
      const error = new Error(`Archived task cannot be updated by command ${normalized.id}`);
      (error as any).status = 409;
      throw error;
    }
    const merged = { ...previous, ...normalized.patch };
    if (Object.prototype.hasOwnProperty.call(normalized.patch, 'description') && !Object.prototype.hasOwnProperty.call(normalized.patch, 'notes')) {
      merged.notes = normalized.patch.description;
    }
    const validated = validateTaskPayload(merged, tasks, previous.id);
    assertTaskCanBeCompleted(validated, tasks, previous.status);
    return {
      ...normalized,
      taskId: previous.id,
      before: previous,
      after: { ...previous, ...validated },
      summary: normalized.label || `Update task: ${previous.title}`
    };
  }

  if (normalized.type === 'add_relation') {
    const task = tasks.find((item) => item.id === normalized.taskId);
    const related = tasks.find((item) => item.id === normalized.relatedTaskId);
    if (!task || !related) {
      const error = new Error(`Task not found for command ${normalized.id}`);
      (error as any).status = 404;
      throw error;
    }
    if (task.isArchived) {
      const error = new Error(`Archived task cannot receive relations by command ${normalized.id}`);
      (error as any).status = 409;
      throw error;
    }
    const exists = task.relations.some((relation) => relation.relatedTaskId === related.id && relation.type === normalized.relationType);
    const relations = exists
      ? task.relations
      : [...task.relations, { relatedTaskId: related.id, type: normalized.relationType, createdAt: new Date().toISOString() }];
    const validated = validateTaskPayload({ ...task, relations }, tasks, task.id);
    return {
      ...normalized,
      taskId: task.id,
      relatedTaskId: related.id,
      taskTitle: task.title,
      relatedTaskTitle: related.title,
      before: task,
      after: { ...task, ...validated },
      alreadyExists: exists,
      summary: normalized.label || `Add ${normalized.relationType} relation: ${task.title} -> ${related.title}`
    };
  }

  if (normalized.type === 'create_task') {
    const taskInput = {
      status: 'new',
      priority: 2,
      notes: '',
      tags: [],
      blockedByTaskIds: [],
      relations: [],
      checklistItems: [],
      ...normalized.task
    };
    const task = buildNewTask(taskInput, tasks, normalized.reason ? `AI command created task: ${normalized.reason}` : 'AI command created task');
    assertTaskCanBeCompleted(task, tasks);
    return {
      ...normalized,
      createdTask: task,
      summary: normalized.label || `Create task: ${task.title}`
    };
  }

  if (normalized.type === 'create_calendar_event') {
    const sourceTask = normalized.taskId ? tasks.find((task) => task.id === normalized.taskId) : null;
    if (normalized.taskId && !tasks.some((task) => task.id === normalized.taskId)) {
      const error = new Error(`Task not found for command ${normalized.id}`);
      (error as any).status = 404;
      throw error;
    }
    const calendarEvent = normalizeCalendarEventForTask(normalized.event, sourceTask);
    if (calendarEventStartsInPast(calendarEvent)) {
      const error = createValidationError([`commands[${index}].event.start cannot be in the past`]);
      throw error;
    }
    return {
      ...normalized,
      sourceTaskTitle: sourceTask?.title || null,
      event: calendarEvent,
      calendarEvent,
      summary: normalized.label || `Create calendar event: ${calendarEvent.summary}`
    };
  }

  throw createValidationError([`Unsupported command type: ${normalized.type}`]);
}

async function insertGoogleCalendarEvent(prepared, dependencies) {
  const event = prepared.calendarEvent;
  const { fetchTaskCalendarEvents, insertTaskCalendarEvent, pool } = dependencies;
  const linkedEvents = prepared.taskId && fetchTaskCalendarEvents
    ? await fetchTaskCalendarEvents(pool, prepared.taskId)
    : [];
  if (linkedEvents.length) {
    const linkedEvent = linkedEvents[0];
    return {
      id: linkedEvent.googleEventId,
      summary: linkedEvent.summary,
      start: { dateTime: linkedEvent.start },
      end: { dateTime: linkedEvent.end },
      htmlLink: linkedEvent.htmlLink,
      alreadyExists: true,
      linkedToTask: true
    };
  }
  const existingEvent = await findExistingGoogleCalendarEvent(event, dependencies);
  if (existingEvent) {
    if (prepared.taskId && insertTaskCalendarEvent) {
      await insertTaskCalendarEvent(pool, {
        taskId: prepared.taskId,
        googleEventId: existingEvent.id,
        calendarId: event.calendarId || 'primary',
        summary: existingEvent.summary || event.summary,
        start: existingEvent.start?.dateTime || existingEvent.start?.date || event.start,
        end: existingEvent.end?.dateTime || existingEvent.end?.date || event.end,
        htmlLink: existingEvent.htmlLink || null
      });
    }
    return { ...existingEvent, alreadyExists: true };
  }

  const calendar = await getAuthorizedCalendarClient(dependencies);
  const result = await calendar.events.insert({
    calendarId: event.calendarId || 'primary',
    requestBody: {
      summary: event.summary,
      description: event.description || prepared.reason || '',
      location: event.location || '',
      start: {
        dateTime: event.start,
        ...(event.timeZone ? { timeZone: event.timeZone } : {})
      },
      end: {
        dateTime: event.end,
        ...(event.timeZone ? { timeZone: event.timeZone } : {})
      }
    }
  });
  if (prepared.taskId && insertTaskCalendarEvent) {
    await insertTaskCalendarEvent(pool, {
      taskId: prepared.taskId,
      googleEventId: result.data.id,
      calendarId: event.calendarId || 'primary',
      summary: result.data.summary || event.summary,
      start: result.data.start?.dateTime || result.data.start?.date || event.start,
      end: result.data.end?.dateTime || result.data.end?.date || event.end,
      htmlLink: result.data.htmlLink || null
    });
  }
  return { ...result.data, alreadyExists: false };
}

async function applyPreparedAiCommand(client, prepared, allTasks, now, dependencies) {
  const { updateTaskRecord, insertActivity, insertTask, findTaskById } = dependencies;
  if (prepared.type === 'update_task' || prepared.type === 'add_relation') {
    const previous = allTasks.find((task) => task.id === prepared.taskId);
    const updated = applyTaskStatusTimestamps({ ...prepared.after, updatedAt: now }, previous.status, now);
    await updateTaskRecord(client, updated);
    if (updated.status !== previous.status) {
      await insertActivity(client, updated.id, {
        id: randomUUID(), type: 'status',
        message: `Status changed from ${previous.status} to ${updated.status}`,
        fromStatus: previous.status, toStatus: updated.status, createdAt: now
      });
    }
    if (prepared.reason) {
      await insertActivity(client, updated.id, {
        id: randomUUID(), type: prepared.type === 'add_relation' ? 'dependency' : 'note',
        message: `AI Advisor: ${prepared.reason}`,
        createdAt: now
      });
    }
    return { commandId: prepared.id, type: prepared.type, task: await findTaskById(client, updated.id) };
  }

  if (prepared.type === 'create_task') {
    const created = applyTaskStatusTimestamps({
      ...prepared.createdTask,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null
    }, null, now);
    await insertTask(client, created, prepared.reason ? `AI command created task: ${prepared.reason}` : 'AI command created task');
    return { commandId: prepared.id, type: prepared.type, task: await findTaskById(client, created.id) };
  }

  if (prepared.type === 'create_calendar_event') {
    const event = await insertGoogleCalendarEvent(prepared, dependencies);
    let occurrence = null;
    if (prepared.periodicTaskId && dependencies.createPeriodicTaskOccurrence) {
      occurrence = await dependencies.createPeriodicTaskOccurrence(client, {
        periodicTaskId: prepared.periodicTaskId,
        scheduledStart: event.start?.dateTime || event.start?.date || prepared.calendarEvent.start,
        scheduledEnd: event.end?.dateTime || event.end?.date || prepared.calendarEvent.end,
        calendarId: prepared.calendarEvent.calendarId || 'primary',
        googleEventId: event.id || null,
        htmlLink: event.htmlLink || null,
        status: 'scheduled'
      });
    }
    let task = null;
    if (prepared.taskId) {
      const previous = allTasks.find((item) => item.id === prepared.taskId);
      const patch = calendarEventTaskPatch(prepared.calendarEvent);
      if (previous && patch) {
        const updated = applyTaskStatusTimestamps({ ...previous, ...patch, updatedAt: now }, previous.status, now);
        await updateTaskRecord(client, updated);
        await insertActivity(client, updated.id, {
          id: randomUUID(),
          type: 'note',
          message: `AI Advisor: scheduled calendar event for ${patch.dueDateTime} (${patch.estimatedMinutes} min)`,
          createdAt: now
        });
        if (dependencies.createProductivityEvent) {
          await dependencies.createProductivityEvent(client, {
            eventType: 'task_scheduled',
            xp: 15,
            taskId: updated.id,
            metadata: {
              title: updated.title,
              start: prepared.calendarEvent.start,
              end: prepared.calendarEvent.end,
              alreadyExists: Boolean(event.alreadyExists)
            }
          });
        }
        task = await findTaskById(client, updated.id);
      }
    }
    return {
      commandId: prepared.id,
      type: prepared.type,
      alreadyExists: Boolean(event.alreadyExists),
      task,
      occurrence,
      event: {
        id: event.id,
        calendarId: prepared.calendarEvent.calendarId || 'primary',
        summary: event.summary || prepared.calendarEvent.summary,
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
        htmlLink: event.htmlLink || null
      }
    };
  }

  throw createValidationError([`Unsupported command type: ${prepared.type}`]);
}

function buildAiCommandsPreview(commands, initialTasks) {
  let tasks = initialTasks;
  const prepared = [];
  const calendarEventFingerprints = new Set();
  for (const [index, command] of commands.entries()) {
    const item: Record<string, any> = prepareAiCommand(command, tasks, index);
    const relatedTask = item.relatedTaskId ? tasks.find((task) => task.id === item.relatedTaskId) : null;
    const duplicateCalendarEvent = item.type === 'create_calendar_event' && calendarEventFingerprints.has(calendarEventDuplicateFingerprint(item.calendarEvent));
    prepared.push({
      id: item.id,
      type: item.type,
      summary: item.summary,
      reason: item.reason,
      taskId: item.taskId || item.createdTask?.id || null,
      periodicTaskId: item.periodicTaskId || null,
      taskTitle: item.before?.title || item.createdTask?.title || item.sourceTaskTitle || item.calendarEvent?.summary || null,
      relatedTaskId: item.relatedTaskId || null,
      relatedTaskTitle: item.relatedTaskTitle || relatedTask?.title || null,
      relationType: item.relationType || null,
      alreadyExists: item.alreadyExists || duplicateCalendarEvent || false,
      changes: item.type === 'create_task'
        ? { createdTask: item.createdTask }
        : item.type === 'create_calendar_event'
          ? { calendarEvent: item.calendarEvent }
          : { before: item.before, after: item.after }
    });
    if (item.type === 'create_calendar_event') {
      calendarEventFingerprints.add(calendarEventDuplicateFingerprint(item.calendarEvent));
    }
    if (item.type === 'create_task') tasks = [...tasks, item.createdTask];
    if (item.type === 'update_task' || item.type === 'add_relation') {
      tasks = tasks.map((task) => (task.id === item.taskId ? item.after : task));
    }
  }
  return prepared;
}

module.exports = {
  getAiCommandsFromBody,
  prepareAiCommand,
  applyPreparedAiCommand,
  buildAiCommandsPreview,
  calendarEventDuplicateFingerprint,
  calendarEventStartsInPast,
  alignCalendarEventToTaskDueDate,
  normalizeCalendarEventForTask,
  findExistingGoogleCalendarEvent
};

export {};

