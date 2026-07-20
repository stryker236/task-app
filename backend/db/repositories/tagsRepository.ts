const { iso } = require('../../utils/date');
const { pool } = require('../pool');

import type { Queryable } from '../types';

async function replaceTags(db: Queryable, taskId: string, tags: string[]) {
	await db.query('DELETE FROM task_tags WHERE task_id = $1', [taskId]);
	const uniqueTags = [...new Map(tags.map((tag) => [tag.trim().toLocaleLowerCase(), tag.trim()])).values()]
		.filter(Boolean);
	for (const tag of uniqueTags) {
		const result = await db.query(
			`INSERT INTO tags (name)
       VALUES ($1)
       ON CONFLICT (normalized_name) DO UPDATE SET
         name = EXCLUDED.name,
         deactivated_at = NULL
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
		`SELECT
       tags.id,
       tags.name,
       tags.created_at,
       tags.deactivated_at,
       count(task_tags.task_id)::int AS usage_count,
       count(task_tags.task_id) FILTER (
         WHERE tasks.id IS NOT NULL
           AND tasks.archived_at IS NULL
           AND tasks.status NOT IN ('done', 'cancelled')
       )::int AS active_usage_count
     FROM tags
     LEFT JOIN task_tags ON task_tags.tag_id = tags.id
     LEFT JOIN tasks ON tasks.id = task_tags.task_id
     WHERE tags.deactivated_at IS NULL
       AND ($1 = '' OR normalized_name LIKE '%' || lower($1) || '%')
     GROUP BY tags.id, tags.name, tags.created_at, tags.deactivated_at, tags.normalized_name
     ORDER BY normalized_name
     LIMIT 200`,
		[term]
	);
	return result.rows.map((row) => ({
		id: String(row.id),
		name: row.name,
		createdAt: iso(row.created_at),
		deactivatedAt: iso(row.deactivated_at),
		isActive: !row.deactivated_at,
		usageCount: row.usage_count,
		activeUsageCount: row.active_usage_count
	}));
}

async function deleteUnusedTag(id: string, { force = false } = {}) {
	if (force) {
		const result = await deleteUnusedTags([id], { force: true });
		if (result.notFoundIds.includes(String(id))) return 'not_found';
		return result.deletedIds.includes(String(id)) ? 'deactivated' : 'deactivated';
	}

	const result = await pool.query(
		`UPDATE tags
     SET deactivated_at = now()
     WHERE id = $1
       AND deactivated_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM task_tags
         JOIN tasks ON tasks.id = task_tags.task_id
         WHERE task_tags.tag_id = tags.id
           AND tasks.archived_at IS NULL
           AND tasks.status NOT IN ('done', 'cancelled')
       )
     RETURNING id`,
		[id]
	);
	if (result.rowCount) return 'deactivated';
	const exists = await pool.query('SELECT 1 FROM tags WHERE id = $1', [id]);
	if (!exists.rowCount) return 'not_found';
	const activeUse = await pool.query(
		`SELECT 1
     FROM task_tags
     JOIN tasks ON tasks.id = task_tags.task_id
     WHERE task_tags.tag_id = $1
       AND tasks.archived_at IS NULL
       AND tasks.status NOT IN ('done', 'cancelled')
     LIMIT 1`,
		[id]
	);
	return activeUse.rowCount ? 'in_use' : 'deactivated';
}

async function deleteUnusedTags(ids: string[], { force = false } = {}) {
	const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
	if (!uniqueIds.length) return { deletedIds: [], inUseIds: [], notFoundIds: [], removedActiveTaskTagCount: 0 };

	const existingRows = (await pool.query('SELECT id FROM tags WHERE id = ANY($1::uuid[])', [uniqueIds])).rows;
	const existingIds = new Set(existingRows.map((row) => String(row.id)));
	const inUseRows = (await pool.query(
		`SELECT DISTINCT tag_id AS id
     FROM task_tags
     JOIN tasks ON tasks.id = task_tags.task_id
     WHERE tag_id = ANY($1::uuid[])
       AND tasks.archived_at IS NULL
       AND tasks.status NOT IN ('done', 'cancelled')`,
		[uniqueIds]
	)).rows;
	const inUseIds = new Set(inUseRows.map((row) => String(row.id)));
	const deletableIds = uniqueIds.filter((id) => existingIds.has(id) && (force || !inUseIds.has(id)));

	let removedActiveTaskTagCount = 0;
	if (force && deletableIds.length) {
		const removed = await pool.query(
			`DELETE FROM task_tags
       USING tasks
       WHERE tasks.id = task_tags.task_id
         AND task_tags.tag_id = ANY($1::uuid[])
         AND tasks.archived_at IS NULL
         AND tasks.status NOT IN ('done', 'cancelled')`,
			[deletableIds]
		);
		removedActiveTaskTagCount = removed.rowCount;
	}

	let deletedIds = [];
	if (deletableIds.length) {
		const deletedRows = (await pool.query(
			`UPDATE tags
       SET deactivated_at = now()
       WHERE id = ANY($1::uuid[])
         AND deactivated_at IS NULL
       RETURNING id`,
			[deletableIds]
		)).rows;
		deletedIds = deletedRows.map((row) => String(row.id));
	}

	return {
		deletedIds,
		inUseIds: force ? [] : uniqueIds.filter((id) => inUseIds.has(id)),
		notFoundIds: uniqueIds.filter((id) => !existingIds.has(id)),
		removedActiveTaskTagCount
	};
}

module.exports = {
	replaceTags,
	fetchTags,
	deleteUnusedTag,
	deleteUnusedTags
};

export {};
