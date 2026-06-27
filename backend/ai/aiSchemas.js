const STATUSES = ['new', 'in_progress', 'waiting', 'done', 'cancelled'];
const RELATION_TYPES = ['blocks', 'blocked_by', 'relates_to', 'duplicates', 'parent_of', 'child_of'];
const AI_COMMAND_TYPES = ['update_task', 'add_relation', 'create_task'];

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const nullableBoolean = { anyOf: [{ type: 'boolean' }, { type: 'null' }] };
const nullableStringArray = {
  anyOf: [
    { type: 'array', items: { type: 'string' } },
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
    blockedByTaskIds: nullableStringArray
  },
  required: ['title', 'notes', 'priority', 'status', 'dueDateTime', 'estimatedMinutes', 'isFavorite', 'tags', 'blockedByTaskIds']
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
    blockedByTaskIds: nullableStringArray
  },
  required: ['title', 'notes', 'priority', 'status', 'dueDateTime', 'estimatedMinutes', 'isFavorite', 'tags', 'blockedByTaskIds']
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
          task: { anyOf: [taskCreateSchema, { type: 'null' }] }
        },
        required: ['id', 'type', 'label', 'reason', 'taskId', 'relatedTaskId', 'relationType', 'patch', 'task']
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
  taskCreateSchema,
  taskPatchSchema
};
