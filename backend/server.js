const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const PORT = 4000;
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

  if (query.status) result = result.filter((task) => task.status === query.status);
  if (query.priority) result = result.filter((task) => task.priority === Number(query.priority));
  if (query.requestedBy) result = result.filter((task) => includesText(task.requestedBy, query.requestedBy.toLocaleLowerCase()));
  if (query.needToAsk) result = result.filter((task) => task.needToAsk.some((name) => includesText(name, query.needToAsk.toLocaleLowerCase())));
  if (query.tag) result = result.filter((task) => task.tags.some((tag) => includesText(tag, query.tag.toLocaleLowerCase())));
  if (query.noDueDate === 'true') result = result.filter((task) => !task.dueDateTime);

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
      ...task.tags
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
    const task = applyStatusTimestamps({
      id: randomUUID(),
      ...validateTask(req.body, tasks),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null
    }, null, now);
    tasks.push(task);
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
    const task = applyStatusTimestamps({
      ...previous,
      ...validateTask(merged, tasks, previous.id),
      updatedAt: now
    }, previous.status, now);
    tasks[index] = task;
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
      cancelledAt: null
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
app.listen(PORT, () => console.log(`Task App API running at http://localhost:${PORT}`));
