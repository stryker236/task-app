require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { pool, withTransaction, insertTask, insertActivity } = require('./database');

const sourcePath = path.join(__dirname, 'tasks.json');
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');

async function importTasks() {
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (!Array.isArray(source)) throw new Error('tasks.json must contain an array');
  const idMap = new Map(source.map((task) => [task.id, isUuid(task.id) ? task.id : randomUUID()]));

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
        description: item.description || '',
        requestedBy: item.requestedBy || '',
        needToAsk: Array.isArray(item.needToAsk) ? item.needToAsk : [],
        priority: item.priority,
        status: item.status,
        dueDateTime: item.dueDateTime || null,
        tags: Array.isArray(item.tags) ? item.tags : [],
        blockedReason: item.blockedReason || '',
        blockedByTaskIds: [],
        notesMarkdown: item.notesMarkdown || '',
        createdAt,
        updatedAt: item.updatedAt || createdAt,
        completedAt: item.completedAt || null,
        cancelledAt: item.cancelledAt || null,
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
          'INSERT INTO task_dependencies (task_id, dependency_task_id) SELECT $1, unnest($2::uuid[])',
          [taskId, dependencyIds]
        );
      }
    }
  });

  console.log(`Imported ${source.length} tasks into Supabase PostgreSQL.`);
}

importTasks()
  .catch((error) => {
    console.error(`Import failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
