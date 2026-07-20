const { pool } = require('../pool');
const {
	mapPeriodicTask,
	mapPeriodicTaskConstraint,
	mapPeriodicTaskOccurrence
} = require('../mappers');

import type {
	PeriodicTaskConstraintInput,
	PeriodicTaskInput,
	PeriodicTaskOccurrenceInput,
	Queryable
} from '../types';

async function fetchPeriodicTasks(db: Queryable = pool, { activeOnly = false, includeOccurrences = true }: { activeOnly?: boolean; includeOccurrences?: boolean } = {}) {
	const taskRows = (await db.query(
		`SELECT *
		 FROM periodic_tasks
		 WHERE ($1::boolean = false OR active = true)
		 ORDER BY active DESC, title`,
		[Boolean(activeOnly)]
	)).rows;
	if (!taskRows.length) return [];
	const taskIds = taskRows.map((row) => String(row.id));
	const constraintRows = (await db.query(
		`SELECT *
		 FROM periodic_task_constraints
		 WHERE periodic_task_id = ANY($1::uuid[])
		 ORDER BY created_at DESC`,
		[taskIds]
	)).rows;
	const occurrenceRows = includeOccurrences ? (await db.query(
		`SELECT *
		 FROM periodic_task_occurrences
		 WHERE periodic_task_id = ANY($1::uuid[])
		 ORDER BY scheduled_start DESC
		 LIMIT 500`,
		[taskIds]
	)).rows : [];
	const constraintsByTask = new Map();
	const occurrencesByTask = new Map();
	for (const row of constraintRows) {
		const id = String(row.periodic_task_id);
		constraintsByTask.set(id, [...(constraintsByTask.get(id) || []), mapPeriodicTaskConstraint(row)]);
	}
	for (const row of occurrenceRows) {
		const id = String(row.periodic_task_id);
		occurrencesByTask.set(id, [...(occurrencesByTask.get(id) || []), mapPeriodicTaskOccurrence(row)]);
	}
	return taskRows.map((row) => mapPeriodicTask(row, constraintsByTask.get(String(row.id)) || [], occurrencesByTask.get(String(row.id)) || []));
}

async function findPeriodicTaskById(db: Queryable = pool, id: string) {
	const tasks = await fetchPeriodicTasks(db);
	return tasks.find((task) => task.id === id) || null;
}

async function createPeriodicTask(db: Queryable, input: PeriodicTaskInput) {
	const result = await db.query(
		`INSERT INTO periodic_tasks
		 (title, notes, tags, priority, estimated_minutes, period, target_count, hard_constraints, preferences, active)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
		 RETURNING *`,
		[
			input.title,
			input.notes || '',
			input.tags || [],
			input.priority || 2,
			input.estimatedMinutes || 30,
			input.period || 'week',
			input.targetCount || 1,
			JSON.stringify(input.hardConstraints || {}),
			JSON.stringify(input.preferences || {}),
			input.active !== false
		]
	);
	return findPeriodicTaskById(db, String(result.rows[0].id));
}

async function updatePeriodicTask(db: Queryable, id: string, patch: Partial<PeriodicTaskInput>) {
	const result = await db.query(
		`UPDATE periodic_tasks
		 SET title = COALESCE($2, title),
		     notes = COALESCE($3, notes),
		     tags = COALESCE($4, tags),
		     priority = COALESCE($5, priority),
		     estimated_minutes = COALESCE($6, estimated_minutes),
		     period = COALESCE($7, period),
		     target_count = COALESCE($8, target_count),
		     hard_constraints = COALESCE($9::jsonb, hard_constraints),
		     preferences = COALESCE($10::jsonb, preferences),
		     active = COALESCE($11, active),
		     updated_at = now()
		 WHERE id = $1
		 RETURNING id`,
		[
			id,
			patch.title ?? null,
			patch.notes ?? null,
			Array.isArray(patch.tags) ? patch.tags : null,
			patch.priority ?? null,
			patch.estimatedMinutes ?? null,
			patch.period ?? null,
			patch.targetCount ?? null,
			patch.hardConstraints ? JSON.stringify(patch.hardConstraints) : null,
			patch.preferences ? JSON.stringify(patch.preferences) : null,
			typeof patch.active === 'boolean' ? patch.active : null
		]
	);
	return result.rowCount ? findPeriodicTaskById(db, id) : null;
}

async function deletePeriodicTask(db: Queryable = pool, id: string) {
	const result = await db.query('DELETE FROM periodic_tasks WHERE id = $1', [id]);
	return result.rowCount > 0;
}

async function createPeriodicTaskConstraint(db: Queryable, periodicTaskId: string, input: PeriodicTaskConstraintInput) {
	const result = await db.query(
		`INSERT INTO periodic_task_constraints (periodic_task_id, type, scope, payload, hard, active, expires_at)
		 SELECT $1, $2, $3::jsonb, $4::jsonb, $5, $6, $7
		 FROM periodic_tasks
		 WHERE id = $1
		 RETURNING *`,
		[
			periodicTaskId,
			input.type,
			JSON.stringify(input.scope || {}),
			JSON.stringify(input.payload || {}),
			input.hard !== false,
			input.active !== false,
			input.expiresAt || null
		]
	);
	return result.rows[0] ? mapPeriodicTaskConstraint(result.rows[0]) : null;
}

async function updatePeriodicTaskConstraint(db: Queryable, id: string, patch: Partial<PeriodicTaskConstraintInput>) {
	const result = await db.query(
		`UPDATE periodic_task_constraints
		 SET type = COALESCE($2, type),
		     scope = COALESCE($3::jsonb, scope),
		     payload = COALESCE($4::jsonb, payload),
		     hard = COALESCE($5, hard),
		     active = COALESCE($6, active),
		     expires_at = COALESCE($7, expires_at),
		     updated_at = now()
		 WHERE id = $1
		 RETURNING *`,
		[
			id,
			patch.type ?? null,
			patch.scope ? JSON.stringify(patch.scope) : null,
			patch.payload ? JSON.stringify(patch.payload) : null,
			typeof patch.hard === 'boolean' ? patch.hard : null,
			typeof patch.active === 'boolean' ? patch.active : null,
			patch.expiresAt ?? null
		]
	);
	return result.rows[0] ? mapPeriodicTaskConstraint(result.rows[0]) : null;
}

async function deletePeriodicTaskConstraint(db: Queryable = pool, id: string) {
	const result = await db.query('DELETE FROM periodic_task_constraints WHERE id = $1', [id]);
	return result.rowCount > 0;
}

async function fetchPeriodicTaskOccurrences(db: Queryable = pool, periodicTaskId: string) {
	const result = await db.query(
		`SELECT *
		 FROM periodic_task_occurrences
		 WHERE periodic_task_id = $1
		 ORDER BY scheduled_start DESC
		 LIMIT 200`,
		[periodicTaskId]
	);
	return result.rows.map(mapPeriodicTaskOccurrence);
}

async function createPeriodicTaskOccurrence(db: Queryable, input: PeriodicTaskOccurrenceInput) {
	const result = await db.query(
		`INSERT INTO periodic_task_occurrences
		 (periodic_task_id, scheduled_start, scheduled_end, calendar_id, google_event_id, html_link, status)
		 SELECT $1, $2, $3, $4, $5, $6, $7
		 FROM periodic_tasks
		 WHERE id = $1
		 RETURNING *`,
		[
			input.periodicTaskId,
			input.scheduledStart,
			input.scheduledEnd,
			input.calendarId || 'primary',
			input.googleEventId || null,
			input.htmlLink || null,
			input.status || 'scheduled'
		]
	);
	return result.rows[0] ? mapPeriodicTaskOccurrence(result.rows[0]) : null;
}

async function updatePeriodicTaskOccurrence(db: Queryable, id: string, patch: { status?: string }) {
	const result = await db.query(
		`UPDATE periodic_task_occurrences
		 SET status = COALESCE($2, status),
		     updated_at = now()
		 WHERE id = $1
		 RETURNING *`,
		[id, patch.status ?? null]
	);
	return result.rows[0] ? mapPeriodicTaskOccurrence(result.rows[0]) : null;
}

module.exports = {
	fetchPeriodicTasks,
	findPeriodicTaskById,
	createPeriodicTask,
	updatePeriodicTask,
	deletePeriodicTask,
	createPeriodicTaskConstraint,
	updatePeriodicTaskConstraint,
	deletePeriodicTaskConstraint,
	fetchPeriodicTaskOccurrences,
	createPeriodicTaskOccurrence,
	updatePeriodicTaskOccurrence
};

export {};
