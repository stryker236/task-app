require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');
const {
  pool,
  withTransaction,
  fetchTasks,
  insertTask,
  updateTask: updateTaskRecord,
  insertActivity,
  syncInverseRelationships,
  checkConnection
} = require('./database');

const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
const STATUSES = ['new', 'in_progress', 'waiting', 'done', 'cancelled'];
const SORT_FIELDS = ['priority', 'dueDateTime', 'createdAt', 'updatedAt', 'requestedBy', 'status'];
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('CORS_ORIGIN is required in production');
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error('Origin is not allowed by CORS');
    error.status = 403;
    callback(error);
  }
}));
app.use(express.json({ limit: '1mb' }));

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeString).filter(Boolean))];
}

function validationError(details) {
  const error = new Error('Validation failed');
  error.status = 400;
  error.details = details;
  return error;
}

function validateTask(input, tasks, currentId = null) {
  const errors = [];
  const title = normalizeString(input.title);
  const priority = Number(input.priority);
  const status = input.status;
  if (!title) errors.push('title is required');
  if (title.length > 200) errors.push('title must have at most 200 characters');
  if (!Number.isInteger(priority) || priority < 1 || priority > 4) errors.push('priority must be an integer from 1 to 4');
  if (!STATUSES.includes(status)) errors.push(`status must be one of: ${STATUSES.join(', ')}`);
  if (input.dueDateTime && Number.isNaN(Date.parse(input.dueDateTime))) errors.push('dueDateTime must be a valid date-time');

  const dependencyIds = normalizeArray(input.blockedByTaskIds);
  if (currentId && dependencyIds.includes(currentId)) errors.push('a task cannot depend on itself');
  const existingIds = new Set(tasks.map((task) => task.id));
  const missingIds = dependencyIds.filter((id) => !existingIds.has(id));
  if (missingIds.length) errors.push(`unknown dependency ids: ${missingIds.join(', ')}`);
  if (errors.length) throw validationError(errors);

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
  if (errors.length) throw validationError(errors);
  return ids;
}

function applyStatusTimestamps(task, oldStatus, now) {
  if (task.status === 'done' && oldStatus !== 'done') task.completedAt = now;
  if (task.status !== 'done') task.completedAt = null;
  if (task.status === 'cancelled' && oldStatus !== 'cancelled') task.cancelledAt = now;
  if (task.status !== 'cancelled') task.cancelledAt = null;
  return task;
}

function localDayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

const includesText = (value, query) => String(value || '').toLocaleLowerCase().includes(query);

function filterTasks(tasks, query) {
  let result = [...tasks];
  const active = (task) => !['done', 'cancelled'].includes(task.status);
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  if (query.status) result = result.filter((task) => task.status === query.status);
  if (query.priority) result = result.filter((task) => task.priority === Number(query.priority));
  if (query.requestedBy) result = result.filter((task) => includesText(task.requestedBy, query.requestedBy.toLocaleLowerCase()));
  if (query.needToAsk) result = result.filter((task) => task.needToAsk.some((name) => includesText(name, query.needToAsk.toLocaleLowerCase())));
  if (query.tag) result = result.filter((task) => task.tags.some((tag) => includesText(tag, query.tag.toLocaleLowerCase())));
  if (query.noDueDate === 'true') result = result.filter((task) => !task.dueDateTime);
  if (query.hideBlocked === 'true') {
    result = result.filter((task) => !task.blockedByTaskIds.some((id) => taskMap.get(id)?.status !== 'done'));
  }
  const { start, end } = localDayBounds();
  if (query.today === 'true') result = result.filter((task) => task.dueDateTime && new Date(task.dueDateTime) >= start && new Date(task.dueDateTime) < end);
  if (query.overdue === 'true') result = result.filter((task) => task.dueDateTime && new Date(task.dueDateTime) < new Date() && active(task));
  if (query.search) {
    const term = query.search.toLocaleLowerCase();
    result = result.filter((task) => [
      task.title, task.description, task.requestedBy, task.blockedReason, task.notesMarkdown,
      ...task.needToAsk, ...task.tags, ...task.activityLog.map((entry) => entry.message)
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

function newTask(input, tasks, message = 'Tarefa criada') {
  const now = new Date().toISOString();
  return applyStatusTimestamps({
    id: randomUUID(),
    ...validateTask(input, tasks),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    cancelledAt: null,
    activityLog: [{ id: randomUUID(), type: 'created', message, createdAt: now }]
  }, null, now);
}

async function findTask(db, id) {
  return (await fetchTasks(db)).find((task) => task.id === id);
}

app.get('/', (req, res) => {
  res.json({ name: 'Task App API', status: 'ok', health: '/health' });
});

app.get('/health', async (req, res, next) => {
  try {
    const connection = await checkConnection();
    res.json({ status: 'ok', database: connection.database, databaseTime: connection.time });
  } catch (error) {
    res.status(503).json({ status: 'unavailable', error: 'Database connection is not ready' });
  }
});

app.get('/tasks', async (req, res, next) => {
  try { res.json(filterTasks(await fetchTasks(), req.query)); }
  catch (error) { next(error); }
});

app.get('/tasks/:id', async (req, res, next) => {
  try {
    const task = await findTask(pool, req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error) { next(error); }
});

app.post('/tasks', async (req, res, next) => {
  try {
    const task = await withTransaction(async (client) => {
      const tasks = await fetchTasks(client);
      const blocksTaskIds = validateBlocksTaskIds(req.body.blocksTaskIds, tasks);
      const created = newTask(req.body, tasks);
      await insertTask(client, created);
      await syncInverseRelationships(client, created, blocksTaskIds, created.createdAt);
      return findTask(client, created.id);
    });
    res.status(201).json(task);
  } catch (error) { next(error); }
});

app.put('/tasks/:id', async (req, res, next) => {
  try {
    const task = await withTransaction(async (client) => {
      const tasks = await fetchTasks(client);
      const previous = tasks.find((item) => item.id === req.params.id);
      if (!previous) return null;
      const validated = validateTask({ ...previous, ...req.body }, tasks, previous.id);
      const hasInverse = Object.prototype.hasOwnProperty.call(req.body, 'blocksTaskIds');
      const inverseIds = hasInverse ? validateBlocksTaskIds(req.body.blocksTaskIds, tasks, previous.id) : null;
      if (validated.status !== previous.status) {
        const taskMap = new Map(tasks.map((item) => [item.id, item]));
        const unfinished = validated.blockedByTaskIds.map((id) => taskMap.get(id)).filter((dependency) => dependency && dependency.status !== 'done');
        if (unfinished.length) {
          const error = new Error('Blocked tasks cannot change status');
          error.status = 409;
          error.details = unfinished.map((dependency) => `Complete dependency: ${dependency.title}`);
          throw error;
        }
      }
      const now = new Date().toISOString();
      const updated = applyStatusTimestamps({ ...previous, ...validated, updatedAt: now }, previous.status, now);
      await updateTaskRecord(client, updated);
      if (validated.status !== previous.status) {
        await insertActivity(client, updated.id, {
          id: randomUUID(), type: 'status',
          message: `Status changed from ${previous.status} to ${validated.status}`,
          fromStatus: previous.status, toStatus: validated.status, createdAt: now
        });
      }
      if (hasInverse) await syncInverseRelationships(client, updated, inverseIds, now);
      return findTask(client, updated.id);
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error) { next(error); }
});

app.delete('/tasks/:id', async (req, res, next) => {
  try {
    const deleted = await withTransaction(async (client) => {
      const task = await findTask(client, req.params.id);
      if (!task) return false;
      const affected = (await client.query('SELECT task_id FROM task_dependencies WHERE dependency_task_id = $1', [task.id])).rows;
      await client.query('DELETE FROM tasks WHERE id = $1', [task.id]);
      const now = new Date().toISOString();
      for (const row of affected) {
        await client.query('UPDATE tasks SET updated_at = $2 WHERE id = $1', [row.task_id, now]);
        await insertActivity(client, String(row.task_id), {
          id: randomUUID(), type: 'dependency',
          message: `Tarefa bloqueadora removida: ${task.title}`, createdAt: now
        });
      }
      return true;
    });
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.post('/tasks/:id/progress', async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const task = await findTask(client, req.params.id);
      if (!task) return null;
      if (task.status === 'new') {
        const error = new Error('Progress cannot be logged while the task status is new');
        error.status = 409;
        throw error;
      }
      const message = normalizeString(req.body.message);
      if (!message || message.length > 2000) throw validationError([!message ? 'message is required' : 'message must have at most 2000 characters']);
      const now = new Date().toISOString();
      const entry = { id: randomUUID(), type: 'note', message, createdAt: now };
      await insertActivity(client, task.id, entry);
      await client.query('UPDATE tasks SET updated_at = $2 WHERE id = $1', [task.id, now]);
      return { task: await findTask(client, task.id), entry };
    });
    if (!result) return res.status(404).json({ error: 'Task not found' });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put('/tasks/:id/progress/:entryId', async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const task = await findTask(client, req.params.id);
      if (!task) return null;
      const entryResult = await client.query('SELECT * FROM task_activity WHERE id = $1 AND task_id = $2', [req.params.entryId, task.id]);
      if (!entryResult.rowCount) return { missingEntry: true };
      const row = entryResult.rows[0];
      if (row.type !== 'note') {
        const error = new Error('Automatic history entries cannot be edited');
        error.status = 409;
        throw error;
      }
      const message = normalizeString(req.body.message);
      if (!message || message.length > 2000) throw validationError([!message ? 'message is required' : 'message must have at most 2000 characters']);
      if (message !== row.message) {
        const now = new Date().toISOString();
        await client.query(
          'INSERT INTO task_activity_revisions (activity_id, previous_message, replaced_at) VALUES ($1, $2, $3)',
          [row.id, row.message, now]
        );
        await client.query('UPDATE task_activity SET message = $2, edited_at = $3 WHERE id = $1', [row.id, message, now]);
        await client.query('UPDATE tasks SET updated_at = $2 WHERE id = $1', [task.id, now]);
      }
      const updatedTask = await findTask(client, task.id);
      return { task: updatedTask, entry: updatedTask.activityLog.find((entry) => entry.id === req.params.entryId) };
    });
    if (!result) return res.status(404).json({ error: 'Task not found' });
    if (result.missingEntry) return res.status(404).json({ error: 'Progress entry not found' });
    res.json(result);
  } catch (error) { next(error); }
});

app.post('/tasks/:id/blockers', async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const tasks = await fetchTasks(client);
      const target = tasks.find((item) => item.id === req.params.id);
      if (!target) return null;
      if (['done', 'cancelled'].includes(target.status)) {
        const error = new Error('Completed or cancelled tasks cannot receive new blockers');
        error.status = 409;
        throw error;
      }
      const requestedIds = validateBlocksTaskIds(req.body.blocksTaskIds, tasks);
      const blocker = newTask(req.body, tasks, `Tarefa criada para bloquear: ${target.title}`);
      if (blocker.status === 'done') throw validationError(['a blocking task must be unfinished']);
      await insertTask(client, blocker, blocker.activityLog[0].message);
      await syncInverseRelationships(client, blocker, [...new Set([...requestedIds, target.id])], blocker.createdAt);
      return { task: await findTask(client, blocker.id), blockedTask: await findTask(client, target.id) };
    });
    if (!result) return res.status(404).json({ error: 'Task not found' });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.post('/tasks/:id/duplicate', async (req, res, next) => {
  try {
    const duplicate = await withTransaction(async (client) => {
      const source = await findTask(client, req.params.id);
      if (!source) return null;
      const now = new Date().toISOString();
      const task = {
        ...source,
        id: randomUUID(),
        title: `${source.title} (cópia)`,
        status: 'new',
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        cancelledAt: null,
        activityLog: [{ id: randomUUID(), type: 'created', message: `Tarefa duplicada a partir de: ${source.title}`, createdAt: now }]
      };
      await insertTask(client, task, task.activityLog[0].message);
      return findTask(client, task.id);
    });
    if (!duplicate) return res.status(404).json({ error: 'Task not found' });
    res.status(201).json(duplicate);
  } catch (error) { next(error); }
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((error, req, res, next) => {
  console.error(error);
  const databaseErrors = { '23505': 'A record with the same value already exists', '23503': 'A referenced task does not exist', '23514': 'Database constraint validation failed' };
  res.status(error.status || (error.code ? 400 : 500)).json({
    error: databaseErrors[error.code] || error.message || 'Internal server error',
    ...(error.details ? { details: error.details } : {})
  });
});

let server;

async function shutdown(signal) {
  console.log(`${signal} received. Closing HTTP server and PostgreSQL pool...`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
  process.exit(0);
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

server = app.listen(PORT, HOST, () => {
  console.log(`Task App API listening on http://${HOST}:${PORT}`);
  checkConnection()
    .then((connection) => console.log(`Connected to Supabase PostgreSQL database: ${connection.database}`))
    .catch((error) => console.error('Supabase PostgreSQL is not ready:', error.message));
});
