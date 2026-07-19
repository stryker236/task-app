const express = require('express');
const { randomUUID } = require('crypto');
const { logInfo, requestLogMeta } = require('../logger');
const { filterTasksByQuery } = require('../tasks/taskFilters');
const { buildNewTask } = require('../tasks/taskFactory');
const {
  normalizeString,
  createValidationError,
  validateTaskPayload,
  validateBlockedTaskIds,
  applyTaskStatusTimestamps
} = require('../tasks/taskValidation');

const CALENDAR_EVENT_REVIEW_STATUSES = new Set(['completed', 'missed', 'skipped']);

function normalizeReviewFeedback(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function taskCanBeCompleted(task, tasks) {
  const tasksById = new Map(tasks.map((item) => [item.id, item]));
  const unfinished = (task.blockedByTaskIds || []).map((id) => tasksById.get(id)).filter((dependency) => dependency && dependency.status !== 'done');
  const unfinishedChecklist = (task.checklistItems || []).filter((item) => !item.isDone);
  if (!unfinished.length && !unfinishedChecklist.length) return;
  const error = new Error('Blocked tasks cannot be completed');
  (error as any).status = 409;
  (error as any).details = [
    ...unfinished.map((dependency) => `Complete dependency: ${dependency.title}`),
    ...unfinishedChecklist.map((item) => `Complete checklist item: ${item.title}`)
  ];
  throw error;
}
function createTaskRouter({
  pool,
  withTransaction,
  fetchTasks,
  insertTask,
  updateTaskRecord,
  updateTaskCalendarEventReview,
  insertActivity,
  createProductivityEvent = async (_db: unknown, _event: unknown) => null,
  syncInverseRelationships,
  findTaskById
}) {
  const router = express.Router();

  router.get('/tasks', async (req, res, next) => {
    try { res.json(filterTasksByQuery(await fetchTasks(), req.query)); }
    catch (error) { next(error); }
  });

  router.post('/tasks/archive-bulk', async (req, res, next) => {
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
      logInfo(requestLogMeta(req, {
        event: 'task.archive',
        entity: 'task',
        status,
        archivedCount: result
      }), 'tasks bulk archived');
      return res.json({ archivedCount: result, status });
    } catch (error) { return next(error); }
  });

  router.get('/tasks/:id', async (req, res, next) => {
    try {
      const task = await findTaskById(pool, req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (error) { next(error); }
  });

  router.post('/tasks', async (req, res, next) => {
    try {
      const task = await withTransaction(async (client) => {
        const tasks = await fetchTasks(client);
        const blocksTaskIds = validateBlockedTaskIds(req.body.blocksTaskIds, tasks);
        const created = buildNewTask(req.body, tasks);
        await insertTask(client, created);
        await syncInverseRelationships(client, created, blocksTaskIds, created.createdAt);
        return findTaskById(client, created.id);
      });
      logInfo(requestLogMeta(req, {
        event: 'task.create',
        entity: 'task',
        entityId: task?.id,
        taskId: task?.id,
        title: task?.title,
        status: task?.status,
        priority: task?.priority,
        dueDateTime: task?.dueDateTime,
        tagCount: task?.tags?.length || 0,
        checklistCount: task?.checklistItems?.length || 0,
        blockedByCount: task?.blockedByTaskIds?.length || 0
      }), 'task created');
      res.status(201).json(task);
    } catch (error) { next(error); }
  });

  router.put('/tasks/:id', async (req, res, next) => {
    try {
      let updateLog: Record<string, any> | null = null;
      const task = await withTransaction(async (client) => {
        const tasks = await fetchTasks(client);
        const previous = tasks.find((item) => item.id === req.params.id);
        if (!previous) return null;
        if (previous.isArchived) {
          const error = new Error('Archived tasks must be restored before they can be edited');
          (error as any).status = 409;
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
            (error as any).status = 409;
            (error as any).details = [
              ...unfinished.map((dependency) => `Complete dependency: ${dependency.title}`),
              ...unfinishedChecklist.map((item) => `Complete checklist item: ${item.title}`)
            ];
            throw error;
          }
        }
        const now = new Date().toISOString();
        const updated = applyTaskStatusTimestamps({ ...previous, ...validated, updatedAt: now }, previous.status, now);
        const changedFields = ['title', 'notes', 'requestedBy', 'priority', 'status', 'dueDateTime', 'estimatedMinutes', 'isFavorite', 'blockedReason']
          .filter((field) => JSON.stringify(previous[field] ?? null) !== JSON.stringify(updated[field] ?? null));
        await updateTaskRecord(client, updated);
        if (updated.dueDateTime !== previous.dueDateTime) {
          logInfo(requestLogMeta(req, {
            event: 'task.due_date_changed',
            entity: 'task',
            entityId: updated.id,
            taskId: updated.id,
            title: updated.title,
            from: previous.dueDateTime,
            to: updated.dueDateTime
          }), 'task due date changed');
        }
        if (validated.status !== previous.status) {
          logInfo(requestLogMeta(req, {
            event: 'task.status_changed',
            entity: 'task',
            entityId: updated.id,
            taskId: updated.id,
            title: updated.title,
            from: previous.status,
            to: validated.status
          }), 'task status changed');
          await insertActivity(client, updated.id, {
            id: randomUUID(), type: 'status',
            message: `Status changed from ${previous.status} to ${validated.status}`,
            fromStatus: previous.status, toStatus: validated.status, createdAt: now
          });
          if (validated.status === 'done') {
            await createProductivityEvent(client, {
              eventType: 'task_completed',
              xp: 50,
              taskId: updated.id,
              metadata: { title: updated.title, previousStatus: previous.status }
            });
          }
        }
        if (hasInverse) await syncInverseRelationships(client, updated, inverseIds, now);
        updateLog = {
          taskId: updated.id,
          title: updated.title,
          status: updated.status,
          priority: updated.priority,
          dueDateTime: updated.dueDateTime,
          changedFields,
          tagCount: updated.tags?.length || 0,
          checklistCount: updated.checklistItems?.length || 0,
          blockedByCount: updated.blockedByTaskIds?.length || 0
        };
        return findTaskById(client, updated.id);
      });
      if (!task) return res.status(404).json({ error: 'Task not found' });
      logInfo(requestLogMeta(req, {
        event: 'task.update',
        entity: 'task',
        entityId: task.id,
        ...(updateLog || { taskId: task.id, title: task.title, status: task.status, dueDateTime: task.dueDateTime })
      }), 'task updated');
      res.json(task);
    } catch (error) { next(error); }
  });

  router.post('/tasks/:id/calendar-events/:eventId/review', async (req, res, next) => {
    try {
      if (!updateTaskCalendarEventReview) return res.status(501).json({ error: 'Calendar event review is not configured' });
      const reviewStatus = String(req.body?.status || '').trim();
      if (!CALENDAR_EVENT_REVIEW_STATUSES.has(reviewStatus)) {
        return res.status(400).json({ error: 'status must be completed, missed, or skipped' });
      }
      const note = normalizeString(req.body?.note || '');
      const feedback = normalizeReviewFeedback(req.body?.feedback);
      const resultTask = await withTransaction(async (client) => {
        const tasks = await fetchTasks(client);
        const current = tasks.find((item) => item.id === req.params.id);
        if (!current) return null;
        const event = (current.calendarEvents || []).find((item) => item.id === req.params.eventId);
        if (!event) {
          const error = new Error('Task calendar event not found');
          (error as any).status = 404;
          throw error;
        }
        if (event.reviewStatus) return findTaskById(client, current.id);
        const now = new Date().toISOString();
        const xpDelta = reviewStatus === 'completed' ? 50 : reviewStatus === 'missed' ? -10 : 0;
        let taskForResponse = current;
        if (reviewStatus === 'completed' && current.status !== 'done') {
          taskCanBeCompleted(current, tasks);
          const updated = applyTaskStatusTimestamps({ ...current, status: 'done', updatedAt: now }, current.status, now);
          await updateTaskRecord(client, updated);
          await insertActivity(client, updated.id, {
            id: randomUUID(),
            type: 'status',
            message: `Scheduled review completed: ${event.summary}`,
            fromStatus: current.status,
            toStatus: 'done',
            createdAt: now
          });
          taskForResponse = updated;
        }
        await updateTaskCalendarEventReview(client, event.id, {
          reviewStatus,
          reviewedAt: now,
          reviewNote: note || null,
          reviewFeedback: feedback,
          xpDelta
        });
        await insertActivity(client, current.id, {
          id: randomUUID(),
          type: 'note',
          message: note
            ? `Scheduled review ${reviewStatus}: ${note}`
            : `Scheduled review ${reviewStatus}`,
          createdAt: now
        });
        if (createProductivityEvent) {
          await createProductivityEvent(client, {
            eventType: reviewStatus === 'completed' ? 'scheduled_task_completed' : reviewStatus === 'missed' ? 'scheduled_task_missed' : 'scheduled_task_skipped',
            xp: xpDelta,
            taskId: current.id,
            calendarEventId: event.id,
            metadata: {
              title: current.title,
              eventSummary: event.summary,
              start: event.start,
              end: event.end,
              reviewStatus,
              feedback
            }
          });
        }
        return findTaskById(client, taskForResponse.id);
      });
      if (!resultTask) return res.status(404).json({ error: 'Task not found' });
      logInfo(requestLogMeta(req, {
        event: 'task.calendar_event.review',
        entity: 'task',
        entityId: resultTask.id,
        taskId: resultTask.id,
        calendarEventId: req.params.eventId,
        reviewStatus
      }), 'task calendar event reviewed');
      return res.json(resultTask);
    } catch (error) { return next(error); }
  });
  router.delete('/tasks/:id', async (req, res, next) => {
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
      logInfo(requestLogMeta(req, {
        event: 'task.delete',
        entity: 'task',
        entityId: req.params.id,
        taskId: req.params.id
      }), 'task deleted');
      res.status(204).end();
    } catch (error) { next(error); }
  });

  router.post('/tasks/:id/archive', async (req, res, next) => {
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
      logInfo(requestLogMeta(req, {
        event: 'task.archive',
        entity: 'task',
        entityId: task.id,
        taskId: task.id,
        title: task.title
      }), 'task archived');
      return res.json(task);
    } catch (error) { return next(error); }
  });

  router.delete('/tasks/:id/archive', async (req, res, next) => {
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
      logInfo(requestLogMeta(req, {
        event: 'task.restore',
        entity: 'task',
        entityId: task.id,
        taskId: task.id,
        title: task.title
      }), 'task restored');
      return res.json(task);
    } catch (error) { return next(error); }
  });

  router.patch('/tasks/:id/checklist/:itemId', async (req, res, next) => {
    try {
      if (typeof req.body.isDone !== 'boolean') throw createValidationError(['isDone must be a boolean']);
      const result = await withTransaction(async (client) => {
        const task = await findTaskById(client, req.params.id);
        if (!task) return null;
        if (task.isArchived) {
          const error = new Error('Archived task checklists cannot be changed');
          (error as any).status = 409;
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
        if (req.body.isDone) {
          await createProductivityEvent(client, {
            eventType: 'checklist_completed',
            xp: 20,
            taskId: task.id,
            checklistItemId: req.params.itemId,
            metadata: { title: task.title }
          });
        }
        await client.query('UPDATE tasks SET updated_at = $2 WHERE id = $1', [task.id, now]);
        return { task: await findTaskById(client, task.id) };
      });
      if (!result) return res.status(404).json({ error: 'Task not found' });
      if (result.missingItem) return res.status(404).json({ error: 'Checklist item not found' });
      logInfo(requestLogMeta(req, {
        event: 'task.checklist_item.update',
        entity: 'task',
        entityId: req.params.id,
        taskId: req.params.id,
        checklistItemId: req.params.itemId,
        isDone: req.body.isDone
      }), 'task checklist item updated');
      return res.json(result.task);
    } catch (error) { return next(error); }
  });

  router.post('/tasks/:id/progress', async (req, res, next) => {
    try {
      const result = await withTransaction(async (client) => {
        const task = await findTaskById(client, req.params.id);
        if (!task) return null;
        if (task.isArchived) {
          const error = new Error('Archived tasks cannot receive progress entries');
          (error as any).status = 409;
          throw error;
        }
        if (task.status === 'new') {
          const error = new Error('Progress cannot be logged while the task status is new');
          (error as any).status = 409;
          throw error;
        }
        const message = normalizeString(req.body.message);
        if (!message || message.length > 2000) throw createValidationError([!message ? 'message is required' : 'message must have at most 2000 characters']);
        const now = new Date().toISOString();
        const entry = { id: randomUUID(), type: 'note', message, createdAt: now };
        await insertActivity(client, task.id, entry);
        await createProductivityEvent(client, {
          eventType: 'progress_logged',
          xp: 10,
          taskId: task.id,
          metadata: { title: task.title, messageLength: message.length }
        });
        await client.query('UPDATE tasks SET updated_at = $2 WHERE id = $1', [task.id, now]);
        return { task: await findTaskById(client, task.id), entry };
      });
      if (!result) return res.status(404).json({ error: 'Task not found' });
      logInfo(requestLogMeta(req, {
        event: 'task.progress.create',
        entity: 'task',
        entityId: result.task?.id || req.params.id,
        taskId: result.task?.id || req.params.id,
        progressEntryId: result.entry?.id,
        messageLength: result.entry?.message?.length || 0
      }), 'task progress entry created');
      res.status(201).json(result);
    } catch (error) { next(error); }
  });

  router.put('/tasks/:id/progress/:entryId', async (req, res, next) => {
    try {
      const result = await withTransaction(async (client) => {
        const task = await findTaskById(client, req.params.id);
        if (!task) return null;
        if (task.isArchived) {
          const error = new Error('Archived task history cannot be edited');
          (error as any).status = 409;
          throw error;
        }
        const entryResult = await client.query('SELECT * FROM task_activity WHERE id = $1 AND task_id = $2', [req.params.entryId, task.id]);
        if (!entryResult.rowCount) return { missingEntry: true };
        const row = entryResult.rows[0];
        if (row.type !== 'note') {
          const error = new Error('Automatic history entries cannot be edited');
          (error as any).status = 409;
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
      logInfo(requestLogMeta(req, {
        event: 'task.progress.update',
        entity: 'task',
        entityId: result.task?.id || req.params.id,
        taskId: result.task?.id || req.params.id,
        progressEntryId: req.params.entryId,
        messageLength: result.entry?.message?.length || 0
      }), 'task progress entry updated');
      res.json(result);
    } catch (error) { next(error); }
  });

  router.post('/tasks/:id/blockers', async (req, res, next) => {
    try {
      const result = await withTransaction(async (client) => {
        const tasks = await fetchTasks(client);
        const target = tasks.find((item) => item.id === req.params.id);
        if (!target) return null;
        if (target.isArchived) {
          const error = new Error('Archived tasks cannot receive new blockers');
          (error as any).status = 409;
          throw error;
        }
        if (['done', 'cancelled'].includes(target.status)) {
          const error = new Error('Completed or cancelled tasks cannot receive new blockers');
          (error as any).status = 409;
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
      logInfo(requestLogMeta(req, {
        event: 'task.blocker.create',
        entity: 'task',
        entityId: result.task?.id,
        blockerTaskId: result.task?.id,
        blockerTitle: result.task?.title,
        blockedTaskId: result.blockedTask?.id,
        blockedTaskTitle: result.blockedTask?.title
      }), 'blocking task created');
      res.status(201).json(result);
    } catch (error) { next(error); }
  });

  router.post('/tasks/:id/duplicate', async (req, res, next) => {
    try {
      const duplicate = await withTransaction(async (client) => {
        const source = await findTaskById(client, req.params.id);
        if (!source) return null;
        const now = new Date().toISOString();
        const task = {
          ...source,
          id: randomUUID(),
          title: `${source.title} (cÃƒÆ’Ã‚Â³pia)`,
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
      logInfo(requestLogMeta(req, {
        event: 'task.duplicate',
        entity: 'task',
        entityId: duplicate.id,
        sourceTaskId: req.params.id,
        duplicateTaskId: duplicate.id,
        duplicateTitle: duplicate.title
      }), 'task duplicated');
      res.status(201).json(duplicate);
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createTaskRouter };

export {};


