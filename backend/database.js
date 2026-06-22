const { Pool } = require('pg');
const { randomUUID } = require('crypto');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and add the Supabase PostgreSQL connection string.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error));

const iso = (value) => value ? new Date(value).toISOString() : null;

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function fetchTasks(db = pool) {
  const taskRows = (await db.query('SELECT * FROM tasks ORDER BY created_at')).rows;
  const relationRows = (await db.query('SELECT * FROM task_relations ORDER BY created_at')).rows;
  const checklistRows = (await db.query('SELECT * FROM task_checklist_items ORDER BY task_id, position, created_at')).rows;
  const tagRows = (await db.query(
    `SELECT task_tags.task_id, tags.name AS tag
     FROM task_tags
     JOIN tags ON tags.id = task_tags.tag_id
     ORDER BY tags.name`
  )).rows;
  const activityRows = (await db.query('SELECT * FROM task_activity ORDER BY created_at')).rows;
  const revisionRows = (await db.query('SELECT * FROM task_activity_revisions ORDER BY replaced_at')).rows;

  const relations = new Map();
  const checklists = new Map();
  const tags = new Map();
  const activities = new Map();
  const revisions = new Map();

  for (const row of relationRows) {
    const id = String(row.task_id);
    relations.set(id, [...(relations.get(id) || []), {
      relatedTaskId: String(row.related_task_id),
      type: row.relation_type,
      createdAt: iso(row.created_at)
    }]);
  }
  for (const row of checklistRows) {
    const id = String(row.task_id);
    checklists.set(id, [...(checklists.get(id) || []), {
      id: String(row.id),
      title: row.title,
      isDone: row.is_done,
      position: row.position,
      createdAt: iso(row.created_at),
      completedAt: iso(row.completed_at)
    }]);
  }
  for (const row of tagRows) {
    const id = String(row.task_id);
    tags.set(id, [...(tags.get(id) || []), row.tag]);
  }
  for (const row of revisionRows) {
    const id = String(row.activity_id);
    revisions.set(id, [...(revisions.get(id) || []), {
      message: row.previous_message,
      replacedAt: iso(row.replaced_at)
    }]);
  }
  for (const row of activityRows) {
    const taskId = String(row.task_id);
    const activityId = String(row.id);
    const entry = {
      id: activityId,
      type: row.type,
      message: row.message,
      createdAt: iso(row.created_at),
      ...(row.edited_at ? { editedAt: iso(row.edited_at) } : {}),
      ...(row.from_status ? { fromStatus: row.from_status } : {}),
      ...(row.to_status ? { toStatus: row.to_status } : {}),
      ...((revisions.get(activityId) || []).length ? { revisions: revisions.get(activityId) } : {})
    };
    activities.set(taskId, [...(activities.get(taskId) || []), entry]);
  }

  return taskRows.map((row) => {
    const id = String(row.id);
    const taskRelations = relations.get(id) || [];
    return {
      id,
      title: row.title,
      notes: row.notes,
      description: row.notes,
      requestedBy: row.requested_by,
      needToAsk: Array.isArray(row.need_to_ask) ? row.need_to_ask : [],
      priority: row.priority,
      status: row.status,
      dueDateTime: iso(row.due_at),
      estimatedMinutes: row.estimated_minutes,
      isFavorite: row.is_favorite,
      tags: tags.get(id) || [],
      blockedReason: row.blocked_reason,
      blockedByTaskIds: taskRelations.filter((relation) => relation.type === 'blocked_by').map((relation) => relation.relatedTaskId),
      relations: taskRelations,
      checklistItems: checklists.get(id) || [],
      notesMarkdown: '',
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      completedAt: iso(row.completed_at),
      cancelledAt: iso(row.cancelled_at),
      archivedAt: iso(row.archived_at),
      isArchived: Boolean(row.archived_at),
      activityLog: activities.get(id) || []
    };
  });
}

async function replaceTags(db, taskId, tags) {
  await db.query('DELETE FROM task_tags WHERE task_id = $1', [taskId]);
  const uniqueTags = [...new Map(tags.map((tag) => [tag.trim().toLocaleLowerCase(), tag.trim()])).values()]
    .filter(Boolean);
  for (const tag of uniqueTags) {
    const result = await db.query(
      `INSERT INTO tags (name)
       VALUES ($1)
       ON CONFLICT (normalized_name) DO UPDATE SET name = tags.name
       RETURNING id`,
      [tag]
    );
    await db.query(
      'INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [taskId, result.rows[0].id]
    );
  }
}

async function fetchTags(search = '') {
  const term = search.trim();
  const result = await pool.query(
    `SELECT tags.id, tags.name, tags.created_at, count(task_tags.task_id)::int AS usage_count
     FROM tags
     LEFT JOIN task_tags ON task_tags.tag_id = tags.id
     WHERE ($1 = '' OR normalized_name LIKE '%' || lower($1) || '%')
     GROUP BY tags.id, tags.name, tags.created_at, tags.normalized_name
     ORDER BY normalized_name
     LIMIT 200`,
    [term]
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    name: row.name,
    createdAt: iso(row.created_at),
    usageCount: row.usage_count
  }));
}

async function deleteUnusedTag(id) {
  const result = await pool.query(
    `DELETE FROM tags
     WHERE id = $1
       AND NOT EXISTS (SELECT 1 FROM task_tags WHERE task_tags.tag_id = tags.id)
     RETURNING id`,
    [id]
  );
  if (result.rowCount) return 'deleted';
  const exists = await pool.query('SELECT 1 FROM tags WHERE id = $1', [id]);
  return exists.rowCount ? 'in_use' : 'not_found';
}

async function replaceRelations(db, taskId, relations) {
  await db.query('DELETE FROM task_relations WHERE task_id = $1', [taskId]);
  for (const relation of relations) {
    await db.query(
      `INSERT INTO task_relations (task_id, related_task_id, relation_type, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [taskId, relation.relatedTaskId, relation.type, relation.createdAt]
    );
  }
}

async function replaceChecklist(db, taskId, items) {
  await db.query('DELETE FROM task_checklist_items WHERE task_id = $1', [taskId]);
  for (const item of items) {
    await db.query(
      `INSERT INTO task_checklist_items (
         id, task_id, title, is_done, position, created_at, completed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [item.id, taskId, item.title, item.isDone, item.position, item.createdAt, item.completedAt]
    );
  }
}

async function insertActivity(db, taskId, entry) {
  const result = await db.query(
    `INSERT INTO task_activity (id, task_id, type, message, from_status, to_status, created_at, edited_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      entry.id || randomUUID(),
      taskId,
      entry.type,
      entry.message,
      entry.fromStatus || null,
      entry.toStatus || null,
      entry.createdAt,
      entry.editedAt || null
    ]
  );
  return String(result.rows[0].id);
}

async function insertTask(db, task, creationMessage = 'Tarefa criada') {
  await db.query(
    `INSERT INTO tasks (
       id, title, notes, requested_by, need_to_ask, priority, status, due_at,
       blocked_reason, estimated_minutes, is_favorite,
       created_at, updated_at, completed_at, cancelled_at, archived_at
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      task.id, task.title, task.notes, task.requestedBy, JSON.stringify(task.needToAsk),
      task.priority, task.status, task.dueDateTime, task.blockedReason,
      task.estimatedMinutes, task.isFavorite,
      task.createdAt, task.updatedAt, task.completedAt, task.cancelledAt, task.archivedAt
    ]
  );
  await replaceTags(db, task.id, task.tags);
  await replaceRelations(db, task.id, task.relations);
  await replaceChecklist(db, task.id, task.checklistItems);
  await insertActivity(db, task.id, {
    id: task.activityLog?.[0]?.id,
    type: 'created',
    message: creationMessage,
    createdAt: task.createdAt
  });
}

async function updateTask(db, task) {
  await db.query(
    `UPDATE tasks SET
       title=$2, notes=$3, requested_by=$4, need_to_ask=$5::jsonb, priority=$6,
       status=$7, due_at=$8, blocked_reason=$9, estimated_minutes=$10, is_favorite=$11,
       updated_at=$12, completed_at=$13, cancelled_at=$14, archived_at=$15
     WHERE id=$1`,
    [
      task.id, task.title, task.notes, task.requestedBy, JSON.stringify(task.needToAsk),
      task.priority, task.status, task.dueDateTime, task.blockedReason,
      task.estimatedMinutes, task.isFavorite,
      task.updatedAt, task.completedAt, task.cancelledAt, task.archivedAt
    ]
  );
  await replaceTags(db, task.id, task.tags);
  await replaceRelations(db, task.id, task.relations);
  await replaceChecklist(db, task.id, task.checklistItems);
}

async function syncInverseRelationships(db, blocker, blockedTaskIds, now) {
  const currentRows = (await db.query(
    `SELECT task_id FROM task_relations
     WHERE related_task_id = $1 AND relation_type = 'blocked_by'`,
    [blocker.id]
  )).rows;
  const current = new Set(currentRows.map((row) => String(row.task_id)));
  const selected = new Set(blockedTaskIds);
  await db.query(
    `DELETE FROM task_relations
     WHERE related_task_id = $1 AND relation_type = 'blocked_by'`,
    [blocker.id]
  );
  if (blockedTaskIds.length) {
    await db.query(
      `INSERT INTO task_relations (task_id, related_task_id, relation_type)
       SELECT unnest($1::uuid[]), $2, 'blocked_by'::task_relation_type`,
      [blockedTaskIds, blocker.id]
    );
  }
  const changedIds = new Set([...current, ...selected]);
  for (const taskId of changedIds) {
    if (current.has(taskId) === selected.has(taskId)) continue;
    const added = selected.has(taskId);
    await db.query('UPDATE tasks SET updated_at = $2 WHERE id = $1', [taskId, now]);
    await insertActivity(db, taskId, {
      id: randomUUID(),
      type: 'dependency',
      message: added
        ? `Nova tarefa bloqueadora adicionada: ${blocker.title}`
        : `Tarefa bloqueadora removida: ${blocker.title}`,
      createdAt: now
    });
  }
}

async function checkConnection() {
  const result = await pool.query('SELECT current_database() AS database, now() AS time');
  return result.rows[0];
}

module.exports = {
  pool,
  withTransaction,
  fetchTasks,
  insertTask,
  updateTask,
  insertActivity,
  syncInverseRelationships,
  fetchTags,
  deleteUnusedTag,
  checkConnection
};
