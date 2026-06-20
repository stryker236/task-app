const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const PORT = 4000;
const HOST = '0.0.0.0';
const TASKS_FILE = path.join(__dirname, 'tasks.json');
const STATUSES = ['novo', 'em_curso', 'a_espera', 'feito', 'cancelado'];
const SORT_FIELDS = ['priority', 'dueDateTime', 'createdAt', 'updatedAt', 'requestedBy', 'status'];

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function ensureTasksFile() {
  if (!fs.existsSync(TASKS_FILE)) fs.writeFileSync(TASKS_FILE, '[]\n', 'utf8');
}

function readTasks() {
  ensureTasksFile();
  try {
    const data = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    if (!Array.isArray(data)) throw new Error('The root value must be an array.');
    return data;
  } catch (error) {
    const wrapped = new Error(`Could not read tasks.json: ${error.message}`);
    wrapped.status = 500;
    throw wrapped;
  }
}

function writeTasks(tasks) {
  const temporaryFile = `${TASKS_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(tasks, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryFile, TASKS_FILE);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeString).filter(Boolean))];
}

function validateTask(input, tasks, currentId = null) {
  const errors = [];
  const title = normalizeString(input.title);
  const priority = Number(input.priority);
  const status = input.status;

  if (!title) errors.push('title is required');
  if (!Number.isInteger(priority) || priority < 1 || priority > 4) {
    errors.push('priority must be an integer from 1 to 4');
  }
  if (!STATUSES.includes(status)) errors.push(`status must be one of: ${STATUSES.join(', ')}`);
  if (input.dueDateTime && Number.isNaN(Date.parse(input.dueDateTime))) {
    errors.push('dueDateTime must be a valid date-time');
  }

  const dependencyIds = normalizeArray(input.blockedByTaskIds);
  if (currentId && dependencyIds.includes(currentId)) errors.push('a task cannot depend on itself');
  const existingIds = new Set(tasks.map((task) => task.id));
  const missingIds = dependencyIds.filter((id) => !existingIds.has(id));
  if (missingIds.length) errors.push(`unknown dependency ids: ${missingIds.join(', ')}`);

  if (errors.length) {
    const error = new Error('Validation failed');
    error.status = 400;
    error.details = errors;
    throw error;
  }

  return {
    title,
    description: normalizeString(input.description),
    requestedBy: normalizeString(input.requestedBy),
    needToAsk: normalizeArray(input.needToAsk),
    priority,
    status,
    dueDateTime: input.dueDateTime ? new Date(input.dueDateTime).toISOString() : null,
    tags: normalizeArray(input.tags),
    blockedReason: normalizeString(input.blockedReason),
    blockedByTaskIds: dependencyIds,
    notesMarkdown: typeof input.notesMarkdown === 'string' ? input.notesMarkdown : ''
  };
}

function validateBlocksTaskIds(value, tasks, currentId = null) {
  const ids = normalizeArray(value);
  const existingIds = new Set(tasks.map((task) => task.id));
  const errors = [];
  if (currentId && ids.includes(currentId)) errors.push('a task cannot block itself');
  const missingIds = ids.filter((id) => !existingIds.has(id));
  if (missingIds.length) errors.push(`unknown blocked task ids: ${missingIds.join(', ')}`);
  if (errors.length) {
    const error = new Error('Validation failed');
    error.status = 400;
    error.details = errors;
    throw error;
  }
  return ids;
}

function applyBlockedTaskRelationships(tasks, blocker, blockedTaskIds, now) {
  const selected = new Set(blockedTaskIds);
  tasks.forEach((target) => {
    if (target.id === blocker.id) return;
    const currentIds = Array.isArray(target.blockedByTaskIds) ? target.blockedByTaskIds : [];
    const alreadyBlocked = currentIds.includes(blocker.id);
    const shouldBeBlocked = selected.has(target.id);
    if (alreadyBlocked === shouldBeBlocked) return;
    target.blockedByTaskIds = shouldBeBlocked
      ? [...currentIds, blocker.id]
      : currentIds.filter((id) => id !== blocker.id);
    target.updatedAt = now;
    target.activityLog = [...(Array.isArray(target.activityLog) ? target.activityLog : []), {
      id: randomUUID(),
      type: 'dependency',
      message: shouldBeBlocked
        ? `Nova tarefa bloqueadora adicionada: ${blocker.title}`
        : `Tarefa bloqueadora removida: ${blocker.title}`,
      createdAt: now
    }];
  });
}

function applyStatusTimestamps(task, oldStatus, now) {
  if (task.status === 'feito' && oldStatus !== 'feito') task.completedAt = now;
  if (task.status !== 'feito') task.completedAt = null;
  if (task.status === 'cancelado' && oldStatus !== 'cancelado') task.cancelledAt = now;
  if (task.status !== 'cancelado') task.cancelledAt = null;
  return task;
}

function localDayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function includesText(value, query) {
  return String(value || '').toLocaleLowerCase().includes(query);
}

function filterTasks(tasks, query) {
  let result = [...tasks];
  const active = (task) => !['feito', 'cancelado'].includes(task.status);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  if (query.status) result = result.filter((task) => task.status === query.status);
  if (query.priority) result = result.filter((task) => task.priority === Number(query.priority));
  if (query.requestedBy) result = result.filter((task) => includesText(task.requestedBy, query.requestedBy.toLocaleLowerCase()));
  if (query.needToAsk) result = result.filter((task) => task.needToAsk.some((name) => includesText(name, query.needToAsk.toLocaleLowerCase())));
  if (query.tag) result = result.filter((task) => task.tags.some((tag) => includesText(tag, query.tag.toLocaleLowerCase())));
  if (query.noDueDate === 'true') result = result.filter((task) => !task.dueDateTime);
  if (query.hideBlocked === 'true') {
    result = result.filter((task) => !task.blockedByTaskIds.some((id) => {
      const dependency = taskMap.get(id);
      return dependency && dependency.status !== 'feito';
    }));
  }

  const { start, end } = localDayBounds();
  if (query.today === 'true') {
    result = result.filter((task) => task.dueDateTime && new Date(task.dueDateTime) >= start && new Date(task.dueDateTime) < end);
  }
  if (query.overdue === 'true') {
    result = result.filter((task) => task.dueDateTime && new Date(task.dueDateTime) < new Date() && active(task));
  }
  if (query.search) {
    const term = query.search.toLocaleLowerCase();
    result = result.filter((task) => [
      task.title,
      task.description,
      task.requestedBy,
      task.blockedReason,
      task.notesMarkdown,
      ...task.needToAsk,
      ...task.tags,
      ...(task.activityLog || []).map((entry) => entry.message)
    ].some((value) => includesText(value, term)));
  }

  if (query.sort) {
    if (!SORT_FIELDS.includes(query.sort)) {
      const error = new Error(`sort must be one of: ${SORT_FIELDS.join(', ')}`);
      error.status = 400;
      throw error;
    }
    const field = query.sort;
    result.sort((a, b) => {
      if (field === 'priority') return b.priority - a.priority;
      if (['dueDateTime', 'createdAt', 'updatedAt'].includes(field)) {
        if (!a[field]) return 1;
        if (!b[field]) return -1;
        return new Date(a[field]) - new Date(b[field]);
      }
      return String(a[field] || '').localeCompare(String(b[field] || ''), 'pt');
    });
  }
  return result;
}

app.get('/tasks', (req, res, next) => {
  try {
    res.json(filterTasks(readTasks(), req.query));
  } catch (error) { next(error); }
});

app.get('/tasks/:id', (req, res, next) => {
  try {
    const task = readTasks().find((item) => item.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error) { next(error); }
});

app.post('/tasks', (req, res, next) => {
  try {
    const tasks = readTasks();
    const now = new Date().toISOString();
    const blocksTaskIds = validateBlocksTaskIds(req.body.blocksTaskIds, tasks);
    const task = applyStatusTimestamps({
      id: randomUUID(),
      ...validateTask(req.body, tasks),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null,
      activityLog: [{
        id: randomUUID(),
        type: 'created',
        message: 'Tarefa criada',
        createdAt: now
      }]
    }, null, now);
    tasks.push(task);
    applyBlockedTaskRelationships(tasks, task, blocksTaskIds, now);
    writeTasks(tasks);
    res.status(201).json(task);
  } catch (error) { next(error); }
});

app.put('/tasks/:id', (req, res, next) => {
  try {
    const tasks = readTasks();
    const index = tasks.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Task not found' });
    const previous = tasks[index];
    const merged = { ...previous, ...req.body };
    const now = new Date().toISOString();
    const validated = validateTask(merged, tasks, previous.id);
    const hasInverseRelationships = Object.prototype.hasOwnProperty.call(req.body, 'blocksTaskIds');
    const blocksTaskIds = hasInverseRelationships
      ? validateBlocksTaskIds(req.body.blocksTaskIds, tasks, previous.id)
      : null;
    if (validated.status !== previous.status) {
      const taskMap = new Map(tasks.map((task) => [task.id, task]));
      const unfinishedDependencies = validated.blockedByTaskIds
        .map((id) => taskMap.get(id))
        .filter((dependency) => dependency && dependency.status !== 'feito');
      if (unfinishedDependencies.length) {
        const error = new Error('Blocked tasks cannot change status');
        error.status = 409;
        error.details = unfinishedDependencies.map((dependency) => `Complete dependency: ${dependency.title}`);
        throw error;
      }
    }
    const activityLog = Array.isArray(previous.activityLog) ? [...previous.activityLog] : [];
    if (validated.status !== previous.status) {
      activityLog.push({
        id: randomUUID(),
        type: 'status',
        message: `Estado alterado de ${previous.status} para ${validated.status}`,
        fromStatus: previous.status,
        toStatus: validated.status,
        createdAt: now
      });
    }
    const task = applyStatusTimestamps({
      ...previous,
      ...validated,
      updatedAt: now,
      activityLog
    }, previous.status, now);
    tasks[index] = task;
    if (hasInverseRelationships) applyBlockedTaskRelationships(tasks, task, blocksTaskIds, now);
    writeTasks(tasks);
    res.json(task);
  } catch (error) { next(error); }
});

app.delete('/tasks/:id', (req, res, next) => {
  try {
    const tasks = readTasks();
    const index = tasks.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Task not found' });
    tasks.splice(index, 1);
    const now = new Date().toISOString();
    tasks.forEach((task) => {
      if (Array.isArray(task.blockedByTaskIds) && task.blockedByTaskIds.includes(req.params.id)) {
        task.blockedByTaskIds = task.blockedByTaskIds.filter((id) => id !== req.params.id);
        task.updatedAt = now;
      }
    });
    writeTasks(tasks);
    res.status(204).end();
  } catch (error) { next(error); }
});

app.post('/tasks/:id/progress', (req, res, next) => {
  try {
    const tasks = readTasks();
    const index = tasks.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Task not found' });
    if (tasks[index].status === 'novo') {
      return res.status(409).json({ error: 'Progress cannot be logged while the task status is novo' });
    }
    const message = normalizeString(req.body.message);
    if (!message) {
      return res.status(400).json({ error: 'Validation failed', details: ['message is required'] });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Validation failed', details: ['message must have at most 2000 characters'] });
    }
    const now = new Date().toISOString();
    const entry = {
      id: randomUUID(),
      type: 'progress',
      message,
      createdAt: now
    };
    const task = tasks[index];
    task.activityLog = [...(Array.isArray(task.activityLog) ? task.activityLog : []), entry];
    task.updatedAt = now;
    writeTasks(tasks);
    res.status(201).json({ task, entry });
  } catch (error) { next(error); }
});

app.put('/tasks/:id/progress/:entryId', (req, res, next) => {
  try {
    const tasks = readTasks();
    const taskIndex = tasks.findIndex((item) => item.id === req.params.id);
    if (taskIndex === -1) return res.status(404).json({ error: 'Task not found' });
    const task = tasks[taskIndex];
    const entryIndex = (task.activityLog || []).findIndex((entry) => entry.id === req.params.entryId);
    if (entryIndex === -1) return res.status(404).json({ error: 'Progress entry not found' });
    const entry = task.activityLog[entryIndex];
    if (entry.type !== 'progress') {
      return res.status(409).json({ error: 'Automatic history entries cannot be edited' });
    }
    const message = normalizeString(req.body.message);
    if (!message) {
      return res.status(400).json({ error: 'Validation failed', details: ['message is required'] });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Validation failed', details: ['message must have at most 2000 characters'] });
    }
    const now = new Date().toISOString();
    if (message !== entry.message) {
      entry.revisions = [...(Array.isArray(entry.revisions) ? entry.revisions : []), {
        message: entry.message,
        replacedAt: now
      }];
      entry.message = message;
      entry.editedAt = now;
      task.updatedAt = now;
      writeTasks(tasks);
    }
    res.json({ task, entry });
  } catch (error) { next(error); }
});

app.post('/tasks/:id/blockers', (req, res, next) => {
  try {
    const tasks = readTasks();
    const targetIndex = tasks.findIndex((item) => item.id === req.params.id);
    if (targetIndex === -1) return res.status(404).json({ error: 'Task not found' });
    const target = tasks[targetIndex];
    if (['feito', 'cancelado'].includes(target.status)) {
      return res.status(409).json({ error: 'Completed or cancelled tasks cannot receive new blockers' });
    }
    const validated = validateTask(req.body, tasks);
    const requestedBlockedTaskIds = validateBlocksTaskIds(req.body.blocksTaskIds, tasks);
    if (validated.status === 'feito') {
      return res.status(400).json({ error: 'Validation failed', details: ['a blocking task must be unfinished'] });
    }
    const now = new Date().toISOString();
    const blocker = applyStatusTimestamps({
      id: randomUUID(),
      ...validated,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null,
      activityLog: [{
        id: randomUUID(),
        type: 'created',
        message: `Tarefa criada para bloquear: ${target.title}`,
        createdAt: now
      }]
    }, null, now);
    tasks.push(blocker);
    applyBlockedTaskRelationships(tasks, blocker, [...new Set([...requestedBlockedTaskIds, target.id])], now);
    writeTasks(tasks);
    res.status(201).json({ task: blocker, blockedTask: target });
  } catch (error) { next(error); }
});

app.post('/tasks/:id/duplicate', (req, res, next) => {
  try {
    const tasks = readTasks();
    const source = tasks.find((item) => item.id === req.params.id);
    if (!source) return res.status(404).json({ error: 'Task not found' });
    const now = new Date().toISOString();
    const duplicate = {
      ...source,
      id: randomUUID(),
      title: `${source.title} (cópia)`,
      status: 'novo',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null,
      activityLog: [{
        id: randomUUID(),
        type: 'created',
        message: `Tarefa duplicada a partir de: ${source.title}`,
        createdAt: now
      }]
    };
    tasks.push(duplicate);
    writeTasks(tasks);
    res.status(201).json(duplicate);
  } catch (error) { next(error); }
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    ...(error.details ? { details: error.details } : {})
  });
});

ensureTasksFile();
app.listen(PORT, HOST, () => console.log(`Task App API listening on http://${HOST}:${PORT}`));
