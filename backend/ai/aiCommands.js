const { randomUUID } = require('crypto');
const { buildNewTask } = require('../tasks/taskFactory');
const {
  RELATION_TYPES,
  normalizeString,
  createValidationError,
  validateTaskPayload,
  applyTaskStatusTimestamps
} = require('../tasks/taskValidation');

const AI_COMMAND_TYPES = ['update_task', 'add_relation', 'create_task'];

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
  const normalized = {
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
    error.status = 409;
    error.details = [
      ...unfinished.map((dependency) => `Complete dependency: ${dependency.title}`),
      ...unfinishedChecklist.map((item) => `Complete checklist item: ${item.title}`)
    ];
    throw error;
  }
}

function prepareAiCommand(command, tasks, index) {
  const normalized = normalizeAiCommand(command, index);

  if (normalized.type === 'update_task') {
    const previous = tasks.find((task) => task.id === normalized.taskId);
    if (!previous) {
      const error = new Error(`Task not found for command ${normalized.id}`);
      error.status = 404;
      throw error;
    }
    if (previous.isArchived) {
      const error = new Error(`Archived task cannot be updated by command ${normalized.id}`);
      error.status = 409;
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
      error.status = 404;
      throw error;
    }
    if (task.isArchived) {
      const error = new Error(`Archived task cannot receive relations by command ${normalized.id}`);
      error.status = 409;
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

  throw createValidationError([`Unsupported command type: ${normalized.type}`]);
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

  throw createValidationError([`Unsupported command type: ${prepared.type}`]);
}

function buildAiCommandsPreview(commands, initialTasks) {
  let tasks = initialTasks;
  const prepared = [];
  for (const [index, command] of commands.entries()) {
    const item = prepareAiCommand(command, tasks, index);
    const relatedTask = item.relatedTaskId ? tasks.find((task) => task.id === item.relatedTaskId) : null;
    prepared.push({
      id: item.id,
      type: item.type,
      summary: item.summary,
      reason: item.reason,
      taskId: item.taskId || item.createdTask?.id || null,
      taskTitle: item.before?.title || item.createdTask?.title || null,
      relatedTaskId: item.relatedTaskId || null,
      relatedTaskTitle: item.relatedTaskTitle || relatedTask?.title || null,
      relationType: item.relationType || null,
      alreadyExists: item.alreadyExists || false,
      changes: item.type === 'create_task'
        ? { createdTask: item.createdTask }
        : { before: item.before, after: item.after }
    });
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
  buildAiCommandsPreview
};
