require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { pool, withTransaction, insertTask, insertActivity } = require('../db/database');
const { isUuid } = require('../utils/uuid');
const { logInfo, logError } = require('../logger');

const sourcePath = path.join(__dirname, '..', 'tasks.json');

type ImportedTask = Record<string, any>;

async function importTasks() {
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as ImportedTask[];
  if (!Array.isArray(source)) throw new Error('tasks.json must contain an array');
  const idMap = new Map<string, string>(source.map((task) => [task.id, isUuid(task.id) ? task.id : randomUUID()]));

  await withTransaction(async (client) => {
    const existing = Number((await client.query('SELECT count(*) AS count FROM tasks')).rows[0].count);
    if (existing > 0) throw new Error('Import refused because the tasks table is not empty');

    for (const item of source) {
      const createdAt = item.createdAt || new Date().toISOString();
      const activityLog = item.activityLog?.length ? item.activityLog : [{
        id: randomUUID(), type: 'created', message: 'Tarefa importada de tasks.json', createdAt
      }];
      const task = {
        id: idMap.get(item.id),
        title: item.title,
        notes: [item.notes ?? item.description, item.notesMarkdown].filter(Boolean).join('\n\n'),
        description: item.notes ?? item.description ?? '',
        requestedBy: item.requestedBy || '',
        needToAsk: Array.isArray(item.needToAsk) ? item.needToAsk : [],
        priority: item.priority,
        status: item.status,
        dueDateTime: item.dueDateTime || null,
        estimatedMinutes: item.estimatedMinutes ?? null,
        isFavorite: item.isFavorite === true,
        tags: Array.isArray(item.tags) ? item.tags : [],
        blockedReason: item.blockedReason || '',
        blockedByTaskIds: [],
        relations: [],
        checklistItems: (item.checklistItems || []).map((checklistItem: ImportedTask, position: number) => ({
          id: isUuid(checklistItem.id) ? checklistItem.id : randomUUID(),
          title: checklistItem.title,
          isDone: checklistItem.isDone === true,
          position: Number.isInteger(checklistItem.position) ? checklistItem.position : position,
          createdAt: checklistItem.createdAt || createdAt,
          completedAt: checklistItem.isDone ? (checklistItem.completedAt || createdAt) : null
        })),
        notesMarkdown: '',
        createdAt,
        updatedAt: item.updatedAt || createdAt,
        completedAt: item.completedAt || null,
        cancelledAt: item.cancelledAt || null,
        archivedAt: item.archivedAt || null,
        isArchived: Boolean(item.archivedAt),
        activityLog
      };
      await insertTask(client, task, activityLog[0].message);
      await client.query('DELETE FROM task_activity WHERE task_id = $1', [task.id]);

      for (const originalEntry of activityLog) {
        const entry = {
          ...originalEntry,
          id: isUuid(originalEntry.id) ? originalEntry.id : randomUUID(),
          type: originalEntry.type,
          createdAt: originalEntry.createdAt || createdAt,
          ...(originalEntry.fromStatus ? { fromStatus: originalEntry.fromStatus } : {}),
          ...(originalEntry.toStatus ? { toStatus: originalEntry.toStatus } : {})
        };
        const activityId = await insertActivity(client, task.id, entry);
        for (const revision of originalEntry.revisions || []) {
          await client.query(
            'INSERT INTO task_activity_revisions (activity_id, previous_message, replaced_at) VALUES ($1, $2, $3)',
            [activityId, revision.message, revision.replacedAt || new Date().toISOString()]
          );
        }
      }
    }

    for (const item of source) {
      const taskId = idMap.get(item.id);
      const dependencyIds = (item.blockedByTaskIds || []).map((id) => idMap.get(id)).filter(Boolean);
      if (dependencyIds.length) {
        await client.query(
          `INSERT INTO task_relations (task_id, related_task_id, relation_type)
           SELECT $1, unnest($2::uuid[]), 'blocked_by'::task_relation_type`,
          [taskId, dependencyIds]
        );
      }
    }
  });

  logInfo({
    event: 'db.import.completed',
    entity: 'task',
    importedCount: source.length
  }, `Imported ${source.length} tasks into Supabase PostgreSQL`);
}

importTasks()
  .catch((error: Error) => {
    logError({
      event: 'db.import.failed',
      err: error
    }, 'Import failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());

export {};
