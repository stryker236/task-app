const { STATUSES, RELATION_TYPES } = require('../constants/taskConstants');
const { AI_COMMAND_TYPES } = require('../constants/aiConstants');

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const nullableBoolean = { anyOf: [{ type: 'boolean' }, { type: 'null' }] };
const nullableStringArray = {
  anyOf: [
    { type: 'array', items: { type: 'string' } },
    { type: 'null' }
  ]
};
const checklistItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: nullableString,
    title: { type: 'string' },
    isDone: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
    position: { anyOf: [{ type: 'integer' }, { type: 'null' }] }
  },
  required: ['id', 'title', 'isDone', 'position']
};
const nullableChecklistItems = {
  anyOf: [
    { type: 'array', items: checklistItemSchema },
    { type: 'null' }
  ]
};

const taskPatchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: nullableString,
    notes: nullableString,
    priority: { anyOf: [{ type: 'integer', enum: [1, 2, 3, 4] }, { type: 'null' }] },
    status: { anyOf: [{ type: 'string', enum: STATUSES }, { type: 'null' }] },
    dueDateTime: nullableString,
    estimatedMinutes: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    isFavorite: nullableBoolean,
    tags: nullableStringArray,
    blockedByTaskIds: nullableStringArray,
    checklistItems: nullableChecklistItems
  },
  required: ['title', 'notes', 'priority', 'status', 'dueDateTime', 'estimatedMinutes', 'isFavorite', 'tags', 'blockedByTaskIds', 'checklistItems']
};

const taskCreateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    notes: nullableString,
    priority: { anyOf: [{ type: 'integer', enum: [1, 2, 3, 4] }, { type: 'null' }] },
    status: { anyOf: [{ type: 'string', enum: STATUSES }, { type: 'null' }] },
    dueDateTime: nullableString,
    estimatedMinutes: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    isFavorite: nullableBoolean,
    tags: nullableStringArray,
    blockedByTaskIds: nullableStringArray,
    checklistItems: nullableChecklistItems
  },
  required: ['title', 'notes', 'priority', 'status', 'dueDateTime', 'estimatedMinutes', 'isFavorite', 'tags', 'blockedByTaskIds', 'checklistItems']
};

const calendarEventSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    description: nullableString,
    location: nullableString,
    start: { type: 'string' },
    end: { type: 'string' },
    timeZone: nullableString,
    calendarId: nullableString
  },
  required: ['summary', 'description', 'location', 'start', 'end', 'timeZone', 'calendarId']
};

const advisorCommandResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    commands: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: AI_COMMAND_TYPES },
          label: { type: 'string' },
          reason: { type: 'string' },
          taskId: nullableString,
          relatedTaskId: nullableString,
          relationType: { anyOf: [{ type: 'string', enum: RELATION_TYPES }, { type: 'null' }] },
          patch: { anyOf: [taskPatchSchema, { type: 'null' }] },
          task: { anyOf: [taskCreateSchema, { type: 'null' }] },
          event: { anyOf: [calendarEventSchema, { type: 'null' }] }
        },
        required: ['id', 'type', 'label', 'reason', 'taskId', 'relatedTaskId', 'relationType', 'patch', 'task', 'event']
      }
    }
  },
  required: ['summary', 'commands']
};

module.exports = {
  AI_COMMAND_TYPES,
  RELATION_TYPES,
  STATUSES,
  advisorCommandResponseSchema,
  calendarEventSchema,
  taskCreateSchema,
  taskPatchSchema
};

export {};
