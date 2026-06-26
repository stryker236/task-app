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
  fetchTags,
  deleteUnusedTag,
  checkConnection
} = require('./database');
const { generateTaskAdvisorAdvice } = require('./aiAdvisor');

const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
const STATUSES = ['new', 'in_progress', 'waiting', 'done', 'cancelled'];
const RELATION_TYPES = ['blocks', 'blocked_by', 'relates_to', 'duplicates', 'parent_of', 'child_of'];
const SORT_FIELDS = ['priority', 'dueDateTime', 'createdAt', 'updatedAt', 'requestedBy', 'status'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function createValidationError(details) {
  const error = new Error('Validation failed');
  error.status = 400;
  error.details = details;
  return error;
}

function normalizeChecklistItems(value, errors) {
  if (value != null && !Array.isArray(value)) errors.push('checklistItems must be an array');
  const now = new Date().toISOString();
  const seenIds = new Set();
  return (Array.isArray(value) ? value : []).map((item, index) => {
    const id = item.id || randomUUID();
    const title = normalizeString(item.title);
    const isDone = item.isDone === true;
    if (!UUID_PATTERN.test(id)) errors.push(`checklistItems[${index}].id must be a UUID`);
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

function normalizeTaskRelations(value, tasks, currentId, errors) {
  if (value != null && !Array.isArray(value)) errors.push('relations must be an array');
  const existingIds = new Set(tasks.map((task) => task.id));
  const seen = new Set();
  const now = new Date().toISOString();
  const relations = [];
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

function validateTaskPayload(input, tasks, currentId = null) {
  const errors = [];
  const title = normalizeString(input.title);
  const priority = Number(input.priority);
  const status = input.status;
  const notes = typeof input.notes === 'string' ? input.notes.trim() : normalizeString(input.description);
  const estimatedMinutes = input.estimatedMinutes == null || input.estimatedMinutes === '' ? null : Number(input.estimatedMinutes);
  const isFavorite = input.isFavorite ?? false;
  const tags = [...new Map(normalizeArray(input.tags).map((tag) => [tag.toLocaleLowerCase(), tag])).values()];
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

function validateBlockedTaskIds(value, tasks, currentId = null) {
  const ids = normalizeArray(value);
  const existingIds = new Set(tasks.map((task) => task.id));
  const errors = [];
  if (currentId && ids.includes(currentId)) errors.push('a task cannot block itself');
  const missingIds = ids.filter((id) => !existingIds.has(id));
  if (missingIds.length) errors.push(`unknown blocked task ids: ${missingIds.join(', ')}`);
  if (errors.length) throw createValidationError(errors);
  return ids;
}

function applyTaskStatusTimestamps(task, oldStatus, now) {
  if (task.status === 'done' && oldStatus !== 'done') task.completedAt = now;
  if (task.status !== 'done') task.completedAt = null;
  if (task.status === 'cancelled' && oldStatus !== 'cancelled') task.cancelledAt = now;
  if (task.status !== 'cancelled') task.cancelledAt = null;
  return task;
}

function getLocalDayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

const containsText = (value, query) => String(value || '').toLocaleLowerCase().includes(query);

function filterTasksByQuery(tasks, query) {
  let result = [...tasks];
  if (query.archived === 'true') result = result.filter((task) => task.isArchived);
  else if (query.includeArchived !== 'true') result = result.filter((task) => !task.isArchived);
  const active = (task) => !['done', 'cancelled'].includes(task.status);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  if (query.status) result = result.filter((task) => task.status === query.status);
  if (query.priority) result = result.filter((task) => task.priority === Number(query.priority));
  if (query.requestedBy) result = result.filter((task) => containsText(task.requestedBy, query.requestedBy.toLocaleLowerCase()));
  if (query.needToAsk) result = result.filter((task) => task.needToAsk.some((name) => containsText(name, query.needToAsk.toLocaleLowerCase())));
  if (query.tag) {
    const selectedTags = (Array.isArray(query.tag) ? query.tag : [query.tag])
      .map((tag) => String(tag).trim().toLocaleLowerCase())
      .filter(Boolean);
    result = result.filter((task) => {
      const taskTags = new Set(task.tags.map((tag) => tag.toLocaleLowerCase()));
      return selectedTags.every((tag) => taskTags.has(tag));
    });
  }
  if (query.noDueDate === 'true') result = result.filter((task) => !task.dueDateTime);
  if (query.favoriteOnly === 'true') result = result.filter((task) => task.isFavorite);
  if (query.hideBlocked === 'true') {
    result = result.filter((task) => (
      !task.blockedByTaskIds.some((id) => tasksById.get(id)?.status !== 'done')
      && !task.checklistItems.some((item) => !item.isDone)
    ));
  }
  if (query.hideDone === 'true') result = result.filter((task) => task.status !== 'done');
  if (query.hideCancelled === 'true') result = result.filter((task) => task.status !== 'cancelled');
  const { start, end } = getLocalDayBounds();
  if (query.today === 'true') result = result.filter((task) => task.dueDateTime && new Date(task.dueDateTime) >= start && new Date(task.dueDateTime) < end);
  if (query.overdue === 'true') result = result.filter((task) => task.dueDateTime && new Date(task.dueDateTime) < new Date() && active(task));
  if (query.search) {
    const term = query.search.toLocaleLowerCase();
    result = result.filter((task) => [
      task.title, task.notes, task.requestedBy, task.blockedReason,
      ...task.needToAsk, ...task.tags, ...task.activityLog.map((entry) => entry.message)
    ].some((value) => containsText(value, term)));
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

function buildNewTask(input, tasks, message = 'Tarefa criada') {
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

async function findTaskById(db, id) {
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
  try { res.json(filterTasksByQuery(await fetchTasks(), req.query)); }
  catch (error) { next(error); }
});

app.get('/tags', async (req, res, next) => {
  try { res.json(await fetchTags(req.query.search || '')); }
  catch (error) { next(error); }
});

app.get('/advisor', async (req, res, next) => {
  try {
    const requestedLimit = Number(req.query.limit || 5);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 && requestedLimit <= 10 ? requestedLimit : 5;
    res.json(await generateTaskAdvisorAdvice(await fetchTasks(), limit));
  } catch (error) { next(error); }
});

app.delete('/tags/:id', async (req, res, next) => {
  try {
    const result = await deleteUnusedTag(req.params.id);
    if (result === 'not_found') return res.status(404).json({ error: 'Tag not found' });
    if (result === 'in_use') return res.status(409).json({ error: 'Tag is still used by one or more tasks' });
    return res.status(204).send();
  } catch (error) { return next(error); }
});

app.post('/tasks/archive-bulk', async (req, res, next) => {
  try {
    const status = req.body.status;
    if (!['done', 'cancelled'].includes(status)) throw createValidationError(['status must be done or cancelled']);
    const result = await withTransaction(async (client) => {
      const now = new Date().toISOString();
      const archived = await client.query(
        `UPDATE tasks
         SET archived_at = $2, updated_at = $2
         WHERE status = $1 AND archived_at IS NULL
         RETURNING id`,
        [status, now]
      );
      for (const row of archived.rows) {
        await insertActivity(client, String(row.id), {
          id: randomUUID(), type: 'archive', message: 'Tarefa arquivada em lote', createdAt: now
        });
      }
      return archived.rowCount;
    });
    return res.json({ archivedCount: result, status });
  } catch (error) { return next(error); }
});

app.get('/tasks/:id', async (req, res, next) => {
  try {
    const task = await findTaskById(pool, req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error) { next(error); }
});

app.post('/tasks', async (req, res, next) => {
  try {
    const task = await withTransaction(async (client) => {
      const tasks = await fetchTasks(client);
      const blocksTaskIds = validateBlockedTaskIds(req.body.blocksTaskIds, tasks);
      const created = buildNewTask(req.body, tasks);
      await insertTask(client, created);
      await syncInverseRelationships(client, created, blocksTaskIds, created.createdAt);
      return findTaskById(client, created.id);
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
      if (previous.isArchived) {
        const error = new Error('Archived tasks must be restored before they can be edited');
        error.status = 409;
        throw error;
      }
      const merged = { ...previous, ...req.body };
      const changedLegacyDescription = Object.prototype.hasOwnProperty.call(req.body, 'description')
        && req.body.description !== previous.description;
      const changedCanonicalNotes = Object.prototype.hasOwnProperty.call(req.body, 'notes')
        && req.body.notes !== previous.notes;
      if (changedLegacyDescription && !changedCanonicalNotes) {
        merged.notes = req.body.description;
      }
      const validated = validateTaskPayload(merged, tasks, previous.id);
      const hasInverse = Object.prototype.hasOwnProperty.call(req.body, 'blocksTaskIds');
      const inverseIds = hasInverse ? validateBlockedTaskIds(req.body.blocksTaskIds, tasks, previous.id) : null;
      if (validated.status === 'done' && previous.status !== 'done') {
        const tasksById = new Map(tasks.map((item) => [item.id, item]));
        const unfinished = validated.blockedByTaskIds.map((id) => tasksById.get(id)).filter((dependency) => dependency && dependency.status !== 'done');
        const unfinishedChecklist = validated.checklistItems.filter((item) => !item.isDone);
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
      const now = new Date().toISOString();
      const updated = applyTaskStatusTimestamps({ ...previous, ...validated, updatedAt: now }, previous.status, now);
      await updateTaskRecord(client, updated);
      if (validated.status !== previous.status) {
        await insertActivity(client, updated.id, {
          id: randomUUID(), type: 'status',
          message: `Status changed from ${previous.status} to ${validated.status}`,
          fromStatus: previous.status, toStatus: validated.status, createdAt: now
        });
      }
      if (hasInverse) await syncInverseRelationships(client, updated, inverseIds, now);
      return findTaskById(client, updated.id);
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error) { next(error); }
});

app.delete('/tasks/:id', async (req, res, next) => {
  try {
    const deleted = await withTransaction(async (client) => {
      const task = await findTaskById(client, req.params.id);
      if (!task) return false;
      const affected = (await client.query(
        `SELECT task_id FROM task_relations
         WHERE related_task_id = $1 AND relation_type = 'blocked_by'`,
        [task.id]
      )).rows;
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

app.post('/tasks/:id/archive', async (req, res, next) => {
  try {
    const task = await withTransaction(async (client) => {
      const current = await findTaskById(client, req.params.id);
      if (!current) return null;
      if (current.isArchived) return current;
      const now = new Date().toISOString();
      await client.query('UPDATE tasks SET archived_at = $2, updated_at = $2 WHERE id = $1', [current.id, now]);
      await insertActivity(client, current.id, {
        id: randomUUID(), type: 'archive', message: 'Tarefa arquivada', createdAt: now
      });
      return findTaskById(client, current.id);
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    return res.json(task);
  } catch (error) { return next(error); }
});

app.delete('/tasks/:id/archive', async (req, res, next) => {
  try {
    const task = await withTransaction(async (client) => {
      const current = await findTaskById(client, req.params.id);
      if (!current) return null;
      if (!current.isArchived) return current;
      const now = new Date().toISOString();
      await client.query('UPDATE tasks SET archived_at = NULL, updated_at = $2 WHERE id = $1', [current.id, now]);
      await insertActivity(client, current.id, {
        id: randomUUID(), type: 'archive', message: 'Tarefa restaurada do arquivo', createdAt: now
      });
      return findTaskById(client, current.id);
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    return res.json(task);
  } catch (error) { return next(error); }
});

app.patch('/tasks/:id/checklist/:itemId', async (req, res, next) => {
  try {
    if (typeof req.body.isDone !== 'boolean') throw createValidationError(['isDone must be a boolean']);
    const result = await withTransaction(async (client) => {
      const task = await findTaskById(client, req.params.id);
      if (!task) return null;
      if (task.isArchived) {
        const error = new Error('Archived task checklists cannot be changed');
        error.status = 409;
        throw error;
      }
      const now = new Date().toISOString();
      const updated = await client.query(
        `UPDATE task_checklist_items
         SET is_done = $3,
             completed_at = CASE WHEN $3 THEN COALESCE(completed_at, $4::timestamptz) ELSE NULL END
         WHERE id = $1 AND task_id = $2
         RETURNING id`,
        [req.params.itemId, task.id, req.body.isDone, now]
      );
      if (!updated.rowCount) return { missingItem: true };
      await client.query('UPDATE tasks SET updated_at = $2 WHERE id = $1', [task.id, now]);
      return { task: await findTaskById(client, task.id) };
    });
    if (!result) return res.status(404).json({ error: 'Task not found' });
    if (result.missingItem) return res.status(404).json({ error: 'Checklist item not found' });
    return res.json(result.task);
  } catch (error) { return next(error); }
});

app.post('/tasks/:id/progress', async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const task = await findTaskById(client, req.params.id);
      if (!task) return null;
      if (task.isArchived) {
        const error = new Error('Archived tasks cannot receive progress entries');
        error.status = 409;
        throw error;
      }
      if (task.status === 'new') {
        const error = new Error('Progress cannot be logged while the task status is new');
        error.status = 409;
        throw error;
      }
      const message = normalizeString(req.body.message);
      if (!message || message.length > 2000) throw createValidationError([!message ? 'message is required' : 'message must have at most 2000 characters']);
      const now = new Date().toISOString();
      const entry = { id: randomUUID(), type: 'note', message, createdAt: now };
      await insertActivity(client, task.id, entry);
      await client.query('UPDATE tasks SET updated_at = $2 WHERE id = $1', [task.id, now]);
      return { task: await findTaskById(client, task.id), entry };
    });
    if (!result) return res.status(404).json({ error: 'Task not found' });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put('/tasks/:id/progress/:entryId', async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const task = await findTaskById(client, req.params.id);
      if (!task) return null;
      if (task.isArchived) {
        const error = new Error('Archived task history cannot be edited');
        error.status = 409;
        throw error;
      }
      const entryResult = await client.query('SELECT * FROM task_activity WHERE id = $1 AND task_id = $2', [req.params.entryId, task.id]);
      if (!entryResult.rowCount) return { missingEntry: true };
      const row = entryResult.rows[0];
      if (row.type !== 'note') {
        const error = new Error('Automatic history entries cannot be edited');
        error.status = 409;
        throw error;
      }
      const message = normalizeString(req.body.message);
      if (!message || message.length > 2000) throw createValidationError([!message ? 'message is required' : 'message must have at most 2000 characters']);
      if (message !== row.message) {
        const now = new Date().toISOString();
        await client.query(
          'INSERT INTO task_activity_revisions (activity_id, previous_message, replaced_at) VALUES ($1, $2, $3)',
          [row.id, row.message, now]
        );
        await client.query('UPDATE task_activity SET message = $2, edited_at = $3 WHERE id = $1', [row.id, message, now]);
        await client.query('UPDATE tasks SET updated_at = $2 WHERE id = $1', [task.id, now]);
      }
      const updatedTask = await findTaskById(client, task.id);
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
      if (target.isArchived) {
        const error = new Error('Archived tasks cannot receive new blockers');
        error.status = 409;
        throw error;
      }
      if (['done', 'cancelled'].includes(target.status)) {
        const error = new Error('Completed or cancelled tasks cannot receive new blockers');
        error.status = 409;
        throw error;
      }
      const requestedIds = validateBlockedTaskIds(req.body.blocksTaskIds, tasks);
      const blocker = buildNewTask(req.body, tasks, `Tarefa criada para bloquear: ${target.title}`);
      if (blocker.status === 'done') throw createValidationError(['a blocking task must be unfinished']);
      await insertTask(client, blocker, blocker.activityLog[0].message);
      await syncInverseRelationships(client, blocker, [...new Set([...requestedIds, target.id])], blocker.createdAt);
      return { task: await findTaskById(client, blocker.id), blockedTask: await findTaskById(client, target.id) };
    });
    if (!result) return res.status(404).json({ error: 'Task not found' });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.post('/tasks/:id/duplicate', async (req, res, next) => {
  try {
    const duplicate = await withTransaction(async (client) => {
      const source = await findTaskById(client, req.params.id);
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
        archivedAt: null,
        isArchived: false,
        checklistItems: source.checklistItems.map((item) => ({
          ...item,
          id: randomUUID(),
          createdAt: now,
          completedAt: item.isDone ? now : null
        })),
        activityLog: [{ id: randomUUID(), type: 'created', message: `Tarefa duplicada a partir de: ${source.title}`, createdAt: now }]
      };
      await insertTask(client, task, task.activityLog[0].message);
      return findTaskById(client, task.id);
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
