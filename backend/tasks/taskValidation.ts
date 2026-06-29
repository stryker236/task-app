const { randomUUID } = require('crypto');
const { STATUSES, RELATION_TYPES } = require('../constants/taskConstants');
const { normalizeString, normalizeArray } = require('../utils/string');
const { createValidationError } = require('../utils/errors');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

type TaskLike = Record<string, any>;

function normalizeChecklistItems(value: any, errors: string[]) {
  if (value != null && !Array.isArray(value)) errors.push('checklistItems must be an array');
  const now = new Date().toISOString();
  const seenIds = new Set();
  return (Array.isArray(value) ? value : []).map((item, index) => {
    const rawId = normalizeString(item.id);
    const id = UUID_PATTERN.test(rawId) ? rawId : randomUUID();
    const title = normalizeString(item.title);
    const isDone = item.isDone === true;
    if (seenIds.has(id)) errors.push(`duplicate checklist item id: ${id}`);
    seenIds.add(id);
    if (!title) errors.push(`checklistItems[${index}].title is required`);
    if (title.length > 300) errors.push(`checklistItems[${index}].title must have at most 300 characters`);
    const position = item.position == null ? index : Number(item.position);
    if (!Number.isInteger(position)) errors.push(`checklistItems[${index}].position must be an integer`);
    return {
      id,
      title,
      isDone,
      position,
      createdAt: item.createdAt && !Number.isNaN(Date.parse(item.createdAt)) ? new Date(item.createdAt).toISOString() : now,
      completedAt: isDone
        ? (item.completedAt && !Number.isNaN(Date.parse(item.completedAt)) ? new Date(item.completedAt).toISOString() : now)
        : null
    };
  });
}

function normalizeTaskRelations(value: any, tasks: TaskLike[], currentId: string | null, errors: string[]) {
  if (value != null && !Array.isArray(value)) errors.push('relations must be an array');
  const existingIds = new Set(tasks.map((task) => task.id));
  const seen = new Set();
  const now = new Date().toISOString();
  const relations: TaskLike[] = [];
  for (const [index, relation] of (Array.isArray(value) ? value : []).entries()) {
    const relatedTaskId = normalizeString(relation.relatedTaskId);
    const type = relation.type;
    const key = `${relatedTaskId}:${type}`;
    if (!existingIds.has(relatedTaskId)) errors.push(`relations[${index}] references an unknown task`);
    if (currentId && relatedTaskId === currentId) errors.push('a task cannot relate to itself');
    if (!RELATION_TYPES.includes(type)) errors.push(`relations[${index}].type must be one of: ${RELATION_TYPES.join(', ')}`);
    if (seen.has(key)) continue;
    seen.add(key);
    relations.push({
      relatedTaskId,
      type,
      createdAt: relation.createdAt && !Number.isNaN(Date.parse(relation.createdAt))
        ? new Date(relation.createdAt).toISOString()
        : now
    });
  }
  return relations;
}

function validateTaskPayload(input: TaskLike, tasks: TaskLike[], currentId: string | null = null) {
  const errors: string[] = [];
  const title = normalizeString(input.title);
  const priority = Number(input.priority);
  const status = input.status;
  const notes = typeof input.notes === 'string' ? input.notes.trim() : normalizeString(input.description);
  const estimatedMinutes = input.estimatedMinutes == null || input.estimatedMinutes === '' ? null : Number(input.estimatedMinutes);
  const isFavorite = input.isFavorite ?? false;
  const tags = [...new Map<string, string>(normalizeArray(input.tags).map((tag) => [tag.toLocaleLowerCase(), tag])).values()];
  if (!title) errors.push('title is required');
  if (title.length > 200) errors.push('title must have at most 200 characters');
  if (!Number.isInteger(priority) || priority < 1 || priority > 4) errors.push('priority must be an integer from 1 to 4');
  if (!STATUSES.includes(status)) errors.push(`status must be one of: ${STATUSES.join(', ')}`);
  if (input.dueDateTime && Number.isNaN(Date.parse(input.dueDateTime))) errors.push('dueDateTime must be a valid date-time');
  if (notes.length > 50000) errors.push('notes must have at most 50000 characters');
  if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 0)) errors.push('estimatedMinutes must be a non-negative integer or null');
  if (typeof isFavorite !== 'boolean') errors.push('isFavorite must be a boolean');
  if (tags.some((tag) => tag.length > 50)) errors.push('each tag must have at most 50 characters');

  const suppliedRelations = normalizeTaskRelations(input.relations, tasks, currentId, errors);
  const relationDependencyIds = suppliedRelations.filter((relation) => relation.type === 'blocked_by').map((relation) => relation.relatedTaskId);
  const dependencyIds = Object.prototype.hasOwnProperty.call(input, 'blockedByTaskIds')
    ? normalizeArray(input.blockedByTaskIds)
    : relationDependencyIds;
  if (currentId && dependencyIds.includes(currentId)) errors.push('a task cannot depend on itself');
  const existingIds = new Set(tasks.map((task) => task.id));
  const missingIds = dependencyIds.filter((id) => !existingIds.has(id));
  if (missingIds.length) errors.push(`unknown dependency ids: ${missingIds.join(', ')}`);
  const previousBlockedRelations = new Map(suppliedRelations
    .filter((relation) => relation.type === 'blocked_by')
    .map((relation) => [relation.relatedTaskId, relation]));
  const now = new Date().toISOString();
  const relations = [
    ...suppliedRelations.filter((relation) => relation.type !== 'blocked_by'),
    ...dependencyIds.map((relatedTaskId) => previousBlockedRelations.get(relatedTaskId) || {
      relatedTaskId,
      type: 'blocked_by',
      createdAt: now
    })
  ];
  const checklistItems = normalizeChecklistItems(input.checklistItems, errors);
  if (errors.length) throw createValidationError(errors);

  return {
    title,
    notes,
    description: notes,
    requestedBy: normalizeString(input.requestedBy),
    needToAsk: normalizeArray(input.needToAsk),
    priority,
    status,
    dueDateTime: input.dueDateTime ? new Date(input.dueDateTime).toISOString() : null,
    estimatedMinutes,
    isFavorite,
    tags,
    blockedReason: normalizeString(input.blockedReason),
    blockedByTaskIds: dependencyIds,
    relations,
    checklistItems,
    notesMarkdown: ''
  };
}

function validateBlockedTaskIds(value: any, tasks: TaskLike[], currentId: string | null = null) {
  const ids = normalizeArray(value);
  const existingIds = new Set(tasks.map((task) => task.id));
  const errors: string[] = [];
  if (currentId && ids.includes(currentId)) errors.push('a task cannot block itself');
  const missingIds = ids.filter((id) => !existingIds.has(id));
  if (missingIds.length) errors.push(`unknown blocked task ids: ${missingIds.join(', ')}`);
  if (errors.length) throw createValidationError(errors);
  return ids;
}

function applyTaskStatusTimestamps(task: TaskLike, oldStatus: string | null, now: string) {
  if (task.status === 'done' && oldStatus !== 'done') task.completedAt = now;
  if (task.status !== 'done') task.completedAt = null;
  if (task.status === 'cancelled' && oldStatus !== 'cancelled') task.cancelledAt = now;
  if (task.status !== 'cancelled') task.cancelledAt = null;
  return task;
}

module.exports = {
  STATUSES,
  RELATION_TYPES,
  normalizeString,
  normalizeArray,
  createValidationError,
  validateTaskPayload,
  validateBlockedTaskIds,
  applyTaskStatusTimestamps
};

export {};
