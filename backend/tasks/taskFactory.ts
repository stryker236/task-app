const { randomUUID } = require('crypto');
const { applyTaskStatusTimestamps, validateTaskPayload } = require('./taskValidation');

function buildNewTask(input: Record<string, any>, tasks: Record<string, any>[], message = 'Tarefa criada') {
  const now = new Date().toISOString();
  return applyTaskStatusTimestamps({
    id: randomUUID(),
    ...validateTaskPayload(input, tasks),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    cancelledAt: null,
    archivedAt: null,
    isArchived: false,
    activityLog: [{ id: randomUUID(), type: 'created', message, createdAt: now }]
  }, null, now);
}

module.exports = { buildNewTask };

export { };
