const { randomUUID } = require('crypto');
const { iso } = require('../../utils/date');
const {
	mapSharedNote,
	mapTaskCalendarEvent,
	mapTaskWorkSession
} = require('../mappers');
const { pool } = require('../pool');
const { taskWorkSessionMetrics } = require('../utils');
const { replaceTags } = require('./tagsRepository');

import type { DbRow, Queryable } from '../types';

async function fetchTasks(db: Queryable = pool) {
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
	const sharedNoteRows = (await db.query(
		`SELECT
       task_shared_notes.task_id,
       shared_notes.*,
       COALESCE(array_agg(tags.name ORDER BY tags.name) FILTER (WHERE tags.name IS NOT NULL), '{}') AS tags
     FROM task_shared_notes
     JOIN shared_notes ON shared_notes.id = task_shared_notes.note_id
     LEFT JOIN shared_note_tags ON shared_note_tags.note_id = shared_notes.id
     LEFT JOIN tags ON tags.id = shared_note_tags.tag_id
     WHERE shared_notes.archived_at IS NULL
     GROUP BY task_shared_notes.task_id, shared_notes.id
     ORDER BY shared_notes.updated_at DESC, shared_notes.created_at DESC`
	)).rows;
	const calendarEventRows = (await db.query('SELECT * FROM task_calendar_events ORDER BY start_at')).rows;
	const workSessionRows = (await db.query('SELECT * FROM task_work_sessions ORDER BY planned_start_at')).rows;

	const relations = new Map();
	const checklists = new Map();
	const tags = new Map();
	const activities = new Map();
	const revisions = new Map();
	const sharedNotes = new Map();
	const calendarEvents = new Map();
	const workSessions = new Map();

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
	for (const row of sharedNoteRows) {
		const taskId = String(row.task_id);
		sharedNotes.set(taskId, [...(sharedNotes.get(taskId) || []), mapSharedNote(row)]);
	}
	for (const row of calendarEventRows) {
		const taskId = String(row.task_id);
		calendarEvents.set(taskId, [...(calendarEvents.get(taskId) || []), mapTaskCalendarEvent(row)]);
	}
	for (const row of workSessionRows) {
		const taskId = String(row.task_id);
		workSessions.set(taskId, [...(workSessions.get(taskId) || []), mapTaskWorkSession(row)]);
	}

	return taskRows.map((row) => {
		const id = String(row.id);
		const taskRelations = relations.get(id) || [];
		const taskWorkSessions = workSessions.get(id) || [];
		const workMetrics = taskWorkSessionMetrics({ estimatedMinutes: row.estimated_minutes }, taskWorkSessions);
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
			activityLog: activities.get(id) || [],
			sharedNotes: sharedNotes.get(id) || [],
			calendarEvents: calendarEvents.get(id) || [],
			workSessions: taskWorkSessions,
			...workMetrics
		};
	});
}

async function replaceRelations(db: Queryable, taskId: string, relations: DbRow[]) {
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

async function replaceChecklist(db: Queryable, taskId: string, items: DbRow[]) {
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

async function insertActivity(db: Queryable, taskId: string, entry: DbRow) {
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

async function insertTask(db: Queryable, task: DbRow, creationMessage = 'Tarefa criada') {
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

async function updateTask(db: Queryable, task: DbRow) {
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

async function syncInverseRelationships(db: Queryable, blocker: DbRow, blockedTaskIds: string[], now: string) {
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

module.exports = {
	fetchTasks,
	insertTask,
	updateTask,
	insertActivity,
	syncInverseRelationships,
	replaceRelations,
	replaceChecklist
};

export {};
