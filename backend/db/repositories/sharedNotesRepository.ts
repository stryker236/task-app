const { mapSharedNote } = require('../mappers');
const { pool } = require('../pool');

import type { DbRow, Queryable } from '../types';

async function fetchSharedNotes(search = '') {
	const term = search.trim();
	const result = await pool.query(
		`SELECT
       shared_notes.*,
       COALESCE(array_agg(DISTINCT tags.name) FILTER (WHERE tags.name IS NOT NULL), '{}') AS tags,
       COALESCE(array_agg(DISTINCT task_shared_notes.task_id) FILTER (WHERE task_shared_notes.task_id IS NOT NULL), '{}') AS linked_task_ids
     FROM shared_notes
     LEFT JOIN task_shared_notes ON task_shared_notes.note_id = shared_notes.id
     LEFT JOIN shared_note_tags ON shared_note_tags.note_id = shared_notes.id
     LEFT JOIN tags ON tags.id = shared_note_tags.tag_id
     WHERE shared_notes.archived_at IS NULL
       AND ($1 = ''
         OR lower(shared_notes.title) LIKE '%' || lower($1) || '%'
         OR lower(shared_notes.body) LIKE '%' || lower($1) || '%'
         OR tags.normalized_name LIKE '%' || lower($1) || '%')
     GROUP BY shared_notes.id
     ORDER BY shared_notes.updated_at DESC, shared_notes.created_at DESC
     LIMIT 200`,
		[term]
	);
	return result.rows.map((row) => ({
		...mapSharedNote(row),
		linkedTaskIds: (row.linked_task_ids || []).map(String)
	}));
}

async function replaceSharedNoteTags(db: Queryable, noteId: string, tags: string[]) {
	await db.query('DELETE FROM shared_note_tags WHERE note_id = $1', [noteId]);
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
			'INSERT INTO shared_note_tags (note_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
			[noteId, result.rows[0].id]
		);
	}
}

async function findSharedNoteById(db: Queryable, id: string) {
	const result = await db.query(
		`SELECT
       shared_notes.*,
       COALESCE(array_agg(tags.name ORDER BY tags.name) FILTER (WHERE tags.name IS NOT NULL), '{}') AS tags
     FROM shared_notes
     LEFT JOIN shared_note_tags ON shared_note_tags.note_id = shared_notes.id
     LEFT JOIN tags ON tags.id = shared_note_tags.tag_id
     WHERE shared_notes.id = $1
       AND shared_notes.archived_at IS NULL
     GROUP BY shared_notes.id`,
		[id]
	);
	return result.rows[0] ? mapSharedNote(result.rows[0]) : null;
}

async function createSharedNote(db: Queryable, { title, body = '', tags = [] }: DbRow) {
	const result = await db.query(
		`INSERT INTO shared_notes (title, body)
     VALUES ($1, $2)
     RETURNING *`,
		[title, body]
	);
	await replaceSharedNoteTags(db, String(result.rows[0].id), tags);
	return findSharedNoteById(db, String(result.rows[0].id));
}

async function updateSharedNote(db: Queryable, id: string, { title, body, tags }: DbRow) {
	const result = await db.query(
		`UPDATE shared_notes
     SET title = COALESCE($2, title),
         body = COALESCE($3, body),
         updated_at = now()
     WHERE id = $1
       AND archived_at IS NULL
     RETURNING *`,
		[id, title ?? null, body ?? null]
	);
	if (!result.rows[0]) return null;
	if (Array.isArray(tags)) await replaceSharedNoteTags(db, id, tags);
	return findSharedNoteById(db, id);
}

async function archiveSharedNote(db: Queryable, id: string) {
	const result = await db.query(
		`UPDATE shared_notes
     SET archived_at = now(),
         updated_at = now()
     WHERE id = $1
       AND archived_at IS NULL
     RETURNING id`,
		[id]
	);
	return result.rowCount > 0;
}

async function attachSharedNoteToTask(db: Queryable, taskId: string, noteId: string) {
	const result = await db.query(
		`INSERT INTO task_shared_notes (task_id, note_id)
     SELECT $1, $2
     FROM tasks, shared_notes
     WHERE tasks.id = $1
       AND shared_notes.id = $2
       AND shared_notes.archived_at IS NULL
     ON CONFLICT DO NOTHING
     RETURNING task_id`,
		[taskId, noteId]
	);
	if (result.rowCount) return true;
	const exists = await db.query(
		`SELECT
       EXISTS(SELECT 1 FROM tasks WHERE id = $1) AS task_exists,
       EXISTS(SELECT 1 FROM shared_notes WHERE id = $2 AND archived_at IS NULL) AS note_exists`,
		[taskId, noteId]
	);
	return Boolean(exists.rows[0]?.task_exists && exists.rows[0]?.note_exists);
}

async function detachSharedNoteFromTask(db: Queryable, taskId: string, noteId: string) {
	const result = await db.query('DELETE FROM task_shared_notes WHERE task_id = $1 AND note_id = $2', [taskId, noteId]);
	return result.rowCount > 0;
}

module.exports = {
	fetchSharedNotes,
	createSharedNote,
	updateSharedNote,
	archiveSharedNote,
	attachSharedNoteToTask,
	detachSharedNoteFromTask,
	findSharedNoteById,
	replaceSharedNoteTags
};

export {};
