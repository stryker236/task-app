const { Pool } = require('pg');
const { randomUUID } = require('crypto');
const { iso } = require('../utils/date');
const { logger } = require('../logger');
const { mergeAdvisorMemoryRulePayload } = require('../ai/advisorMemory');

import type { PoolClient, Pool as PgPool } from 'pg';
import type { ProductivityEvent, ProductivitySummary, TaskCalendarEvent } from '../../shared/types';

type Queryable = PgPool | PoolClient;
type QueryPatch = Record<string, unknown>;
type DbRow = Record<string, any>;

type GoogleConnection = {
	id: string;
	accountEmail: string | null;
	scopes: string[];
	encryptedTokens: unknown;
	expiresAt: string | null;
	createdAt: string | null;
	updatedAt: string | null;
};

type GoogleConnectionInput = {
	accountEmail: string | null;
	scopes: string[];
	encryptedTokens: unknown;
	expiresAt?: string | null;
};

type TaskCalendarEventInput = {
	taskId: string;
	googleEventId: string;
	calendarId: string;
	summary: string;
	start: string;
	end: string;
	htmlLink?: string | null;
};

type SchedulerConstraintInput = {
	type: string;
	scope?: Record<string, unknown>;
	payload?: Record<string, unknown>;
	hard?: boolean;
	enabled?: boolean;
};

type SchedulerRuleInput = {
	text: string;
	interpretation?: string;
	status?: string;
	enabled?: boolean;
	confidence?: number | null;
	model?: string | null;
	rawResponse?: unknown;
	constraints?: SchedulerConstraintInput[];
};

type SchedulerReservedBlockInput = {
	type?: string;
	start: string;
	end: string;
	reason?: string;
	sourceRuleId?: string | null;
	sourceConstraintId?: string | null;
};

type PeriodicTaskInput = {
	title: string;
	notes?: string;
	tags?: string[];
	priority?: number;
	estimatedMinutes?: number;
	period?: 'week' | 'month';
	targetCount?: number;
	hardConstraints?: Record<string, unknown>;
	preferences?: Record<string, unknown>;
	active?: boolean;
};

type PeriodicTaskConstraintInput = {
	type: string;
	scope?: Record<string, unknown>;
	payload?: Record<string, unknown>;
	hard?: boolean;
	active?: boolean;
	expiresAt?: string | null;
};

type PeriodicTaskOccurrenceInput = {
	periodicTaskId: string;
	scheduledStart: string;
	scheduledEnd: string;
	calendarId?: string;
	googleEventId?: string | null;
	htmlLink?: string | null;
	status?: string;
};

type ProductivityEventInput = {
	eventType: string;
	xp: number;
	taskId?: string | null;
	quickQueueItemId?: string | null;
	checklistItemId?: string | null;
	calendarEventId?: string | null;
	metadata?: Record<string, unknown>;
	occurredAt?: string;
};

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is required. Copy .env.example to .env and add the Supabase PostgreSQL connection string.');
}

const pool: PgPool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
	max: Number(process.env.DATABASE_POOL_MAX || 10),
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 10_000
});

const rawPoolQuery = pool.query.bind(pool);
(pool as any).query = async (...args) => {
	const startedAt = Date.now();
	try {
		const result = await rawPoolQuery(...args);
		const durationMs = Date.now() - startedAt;
		if (durationMs >= Number(process.env.DB_SLOW_QUERY_MS || 250)) {
			logger.warn('db.query.slow', {
				durationMs,
				metadata: { rowCount: result?.rowCount ?? null }
			});
		}
		return result;
	} catch (error) {
		logger.error('db.query.failed', {
			durationMs: Date.now() - startedAt,
			metadata: { message: error.message }
		});
		throw error;
	}
};

pool.on('error', (error) => logger.error('db.pool.error', { metadata: { message: error.message } }));

function mapQuickQueueItem(row: DbRow) {
	return {
		id: String(row.id),
		text: row.text,
		done: row.is_done,
		position: row.position,
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

function mapGoogleConnection(row: DbRow): GoogleConnection {
	return {
		id: String(row.id),
		accountEmail: row.account_email,
		scopes: row.scopes || [],
		encryptedTokens: row.encrypted_tokens,
		expiresAt: iso(row.expires_at),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

function mapSharedNote(row: DbRow) {
	return {
		id: String(row.id),
		title: row.title,
		body: row.body,
		tags: row.tags || [],
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
		archivedAt: iso(row.archived_at)
	};
}

function mapAdvisorMemoryRule(row: DbRow) {
	return {
		id: String(row.id),
		ruleType: row.rule_type,
		titleFingerprint: row.title_fingerprint,
		action: row.action,
		rule: row.rule || {},
		supportCount: row.support_count,
		lastFeedbackAt: iso(row.last_feedback_at),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

function mapTaskCalendarEvent(row: DbRow): TaskCalendarEvent {
	return {
		id: String(row.id),
		taskId: String(row.task_id),
		googleEventId: row.google_event_id,
		calendarId: row.calendar_id,
		summary: row.summary,
		start: iso(row.start_at),
		end: iso(row.end_at),
		htmlLink: row.html_link || null,
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

function mapProductivityEvent(row: DbRow): ProductivityEvent {
	return {
		id: String(row.id),
		eventType: row.event_type,
		xp: Number(row.xp || 0),
		taskId: row.task_id ? String(row.task_id) : null,
		quickQueueItemId: row.quick_queue_item_id ? String(row.quick_queue_item_id) : null,
		checklistItemId: row.checklist_item_id ? String(row.checklist_item_id) : null,
		calendarEventId: row.calendar_event_id ? String(row.calendar_event_id) : null,
		metadata: row.metadata || {},
		occurredAt: iso(row.occurred_at),
		createdAt: iso(row.created_at)
	};
}

function localDayKey(value: string | Date = new Date()) {
	const date = value instanceof Date ? value : new Date(value);
	return [
		date.getFullYear(),
		String(date.getMonth() + 1).padStart(2, '0'),
		String(date.getDate()).padStart(2, '0')
	].join('-');
}

function startOfLocalDay(value = new Date()) {
	const date = new Date(value);
	date.setHours(0, 0, 0, 0);
	return date;
}

function addDays(value: Date, days: number) {
	const date = new Date(value);
	date.setDate(date.getDate() + days);
	return date;
}

function buildStreak(dayXp: Map<string, number>, dailyGoalXp: number) {
	const today = startOfLocalDay();
	let currentStreak = 0;
	for (let offset = 0; offset < 366; offset += 1) {
		const key = localDayKey(addDays(today, -offset));
		if ((dayXp.get(key) || 0) < dailyGoalXp) break;
		currentStreak += 1;
	}

	let longestStreak = 0;
	let running = 0;
	for (let offset = 365; offset >= 0; offset -= 1) {
		const key = localDayKey(addDays(today, -offset));
		if ((dayXp.get(key) || 0) >= dailyGoalXp) {
			running += 1;
			longestStreak = Math.max(longestStreak, running);
		} else {
			running = 0;
		}
	}
	return { currentStreak, longestStreak };
}

function mapSchedulerConstraint(row: DbRow) {
	return {
		id: String(row.id),
		ruleId: String(row.rule_id),
		type: row.type,
		scope: row.scope || {},
		payload: row.payload || {},
		hard: Boolean(row.hard),
		enabled: Boolean(row.enabled),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

function mapSchedulerRule(row: DbRow, constraints = []) {
	return {
		id: String(row.id),
		text: row.text,
		interpretation: row.interpretation || '',
		status: row.status,
		enabled: Boolean(row.enabled),
		confidence: row.confidence == null ? null : Number(row.confidence),
		model: row.model || null,
		rawResponse: row.raw_response || null,
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
		constraints
	};
}

function mapSchedulerConstraintType(row: DbRow) {
	return {
		type: row.type,
		label: row.label,
		description: row.description,
		category: row.category,
		scopeSchema: row.scope_schema || {},
		payloadSchema: row.payload_schema || {},
		examples: Array.isArray(row.examples) ? row.examples : [],
		supportsHard: Boolean(row.supports_hard),
		defaultHard: Boolean(row.default_hard),
		enabled: Boolean(row.enabled),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

function mapPeriodicTaskConstraint(row: DbRow) {
	return {
		id: String(row.id),
		periodicTaskId: String(row.periodic_task_id),
		type: row.type,
		scope: row.scope || {},
		payload: row.payload || {},
		hard: Boolean(row.hard),
		active: Boolean(row.active),
		expiresAt: iso(row.expires_at),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

function mapPeriodicTaskOccurrence(row: DbRow) {
	return {
		id: String(row.id),
		periodicTaskId: String(row.periodic_task_id),
		scheduledStart: iso(row.scheduled_start),
		scheduledEnd: iso(row.scheduled_end),
		calendarId: row.calendar_id,
		googleEventId: row.google_event_id || null,
		htmlLink: row.html_link || null,
		status: row.status,
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

function mapPeriodicTask(row: DbRow, constraints = [], occurrences = []) {
	return {
		id: String(row.id),
		title: row.title,
		notes: row.notes || '',
		tags: Array.isArray(row.tags) ? row.tags : [],
		priority: row.priority,
		estimatedMinutes: row.estimated_minutes,
		period: row.period,
		targetCount: row.target_count,
		hardConstraints: row.hard_constraints || {},
		preferences: row.preferences || {},
		active: Boolean(row.active),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
		constraints,
		occurrences
	};
}

function mapSchedulerReservedBlock(row: DbRow) {
	return {
		id: String(row.id),
		batchId: String(row.batch_id),
		type: row.type,
		start: iso(row.start_at),
		end: iso(row.end_at),
		reason: row.reason || '',
		sourceRuleId: row.source_rule_id ? String(row.source_rule_id) : null,
		sourceConstraintId: row.source_constraint_id ? String(row.source_constraint_id) : null,
		createdAt: iso(row.created_at)
	};
}

async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await pool.connect();
	const startedAt = Date.now();
	try {
		logger.info('db.transaction.started');
		await client.query('BEGIN');
		const result = await work(client);
		await client.query('COMMIT');
		logger.info('db.transaction.committed', { durationMs: Date.now() - startedAt });
		return result;
	} catch (error) {
		await client.query('ROLLBACK');
		logger.error('db.transaction.rolled_back', { durationMs: Date.now() - startedAt, metadata: { message: error.message } });
		throw error;
	} finally {
		client.release();
	}
}

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

	const relations = new Map();
	const checklists = new Map();
	const tags = new Map();
	const activities = new Map();
	const revisions = new Map();
	const sharedNotes = new Map();
	const calendarEvents = new Map();

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
			activityLog: activities.get(id) || [],
			sharedNotes: sharedNotes.get(id) || [],
			calendarEvents: calendarEvents.get(id) || []
		};
	});
}

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

async function checkConnection() {
	const result = await pool.query('SELECT current_database() AS database, now() AS time');
	return result.rows[0];
}

async function fetchQuickQueueItems(db: Queryable = pool) {
	const result = await db.query('SELECT * FROM quick_queue_items ORDER BY position ASC, created_at ASC');
	return result.rows.map(mapQuickQueueItem);
}

async function createQuickQueueItem(db: Queryable, text: string, placement = 'bottom') {
	const insertAtTop = placement === 'top';
	if (insertAtTop) {
		await db.query('UPDATE quick_queue_items SET position = position + 1');
	}
	const result = await db.query(
		`INSERT INTO quick_queue_items (text, position)
     VALUES ($1, ${insertAtTop ? '0' : 'COALESCE((SELECT max(position) + 1 FROM quick_queue_items), 0)'})
     RETURNING *`,
		[text]
	);
	return mapQuickQueueItem(result.rows[0]);
}

async function updateQuickQueueItem(db: Queryable, id: string, patch: QueryPatch) {
	const result = await db.query(
		`UPDATE quick_queue_items
     SET text = COALESCE($2, text),
         is_done = COALESCE($3, is_done)
     WHERE id = $1
     RETURNING *`,
		[id, patch.text ?? null, typeof patch.done === 'boolean' ? patch.done : null]
	);
	return result.rows[0] ? mapQuickQueueItem(result.rows[0]) : null;
}

async function deleteQuickQueueItem(db: Queryable, id: string) {
	const result = await db.query('DELETE FROM quick_queue_items WHERE id = $1', [id]);
	return result.rowCount > 0;
}

async function clearDoneQuickQueueItems(db: Queryable) {
	await db.query('DELETE FROM quick_queue_items WHERE is_done = true');
	return fetchQuickQueueItems(db);
}

async function moveQuickQueueItem(db: Queryable, id: string, direction: number) {
	const items = await fetchQuickQueueItems(db);
	const index = items.findIndex((item) => item.id === id);
	const targetIndex = index + direction;
	if (index < 0) return null;
	if (targetIndex < 0 || targetIndex >= items.length) return items;
	const current = items[index];
	const target = items[targetIndex];
	await db.query('UPDATE quick_queue_items SET position = $2 WHERE id = $1', [current.id, target.position]);
	await db.query('UPDATE quick_queue_items SET position = $2 WHERE id = $1', [target.id, current.position]);
	return fetchQuickQueueItems(db);
}

async function reorderQuickQueueItems(db: Queryable, ids: string[]) {
	const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
	const items = await fetchQuickQueueItems(db);
	if (uniqueIds.length !== items.length) return null;
	const existingIds = new Set(items.map((item) => item.id));
	if (uniqueIds.some((id) => !existingIds.has(id))) return null;
	for (const [position, id] of uniqueIds.entries()) {
		await db.query('UPDATE quick_queue_items SET position = $2 WHERE id = $1', [id, position]);
	}
	return fetchQuickQueueItems(db);
}

async function fetchGoogleConnection(db: Queryable = pool): Promise<GoogleConnection | null> {
	const result = await db.query('SELECT * FROM google_connections ORDER BY created_at DESC LIMIT 1');
	return result.rows[0] ? mapGoogleConnection(result.rows[0]) : null;
}

async function saveGoogleConnection(db: Queryable, { accountEmail, scopes, encryptedTokens, expiresAt }: GoogleConnectionInput): Promise<GoogleConnection> {
	await db.query('DELETE FROM google_connections');
	const result = await db.query(
		`INSERT INTO google_connections (account_email, scopes, encrypted_tokens, expires_at)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING *`,
		[accountEmail, scopes, JSON.stringify(encryptedTokens), expiresAt || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()]
	);
	return mapGoogleConnection(result.rows[0]);
}

async function deleteGoogleConnection(db: Queryable = pool) {
	await db.query('DELETE FROM google_connections');
}

async function fetchTaskCalendarEvents(db: Queryable, taskId: string): Promise<TaskCalendarEvent[]> {
	const result = await db.query('SELECT * FROM task_calendar_events WHERE task_id = $1 ORDER BY start_at', [taskId]);
	return result.rows.map(mapTaskCalendarEvent);
}

async function insertTaskCalendarEvent(db: Queryable, event: TaskCalendarEventInput): Promise<TaskCalendarEvent> {
	const result = await db.query(
		`INSERT INTO task_calendar_events (task_id, google_event_id, calendar_id, summary, start_at, end_at, html_link)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (calendar_id, google_event_id)
		 DO UPDATE SET
		   task_id = EXCLUDED.task_id,
		   summary = EXCLUDED.summary,
		   start_at = EXCLUDED.start_at,
		   end_at = EXCLUDED.end_at,
		   html_link = EXCLUDED.html_link,
		   updated_at = now()
		 RETURNING *`,
		[
			event.taskId,
			event.googleEventId,
			event.calendarId,
			event.summary,
			event.start,
			event.end,
			event.htmlLink || null
		]
	);
	return mapTaskCalendarEvent(result.rows[0]);
}

async function deleteTaskCalendarEventsByCalendarId(db: Queryable, calendarId: string) {
	const result = await db.query('DELETE FROM task_calendar_events WHERE calendar_id = $1', [calendarId]);
	return result.rowCount || 0;
}

async function createProductivityEvent(db: Queryable, event: ProductivityEventInput): Promise<ProductivityEvent> {
	const result = await db.query(
		`INSERT INTO productivity_events
		 (event_type, xp, task_id, quick_queue_item_id, checklist_item_id, calendar_event_id, metadata, occurred_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, COALESCE($8::timestamptz, now()))
		 RETURNING *`,
		[
			event.eventType,
			Math.max(0, Math.round(Number(event.xp) || 0)),
			event.taskId || null,
			event.quickQueueItemId || null,
			event.checklistItemId || null,
			event.calendarEventId || null,
			JSON.stringify(event.metadata || {}),
			event.occurredAt || null
		]
	);
	return mapProductivityEvent(result.rows[0]);
}

async function fetchProductivitySummary(db: Queryable = pool, { dailyGoalXp = 50 } = {}): Promise<ProductivitySummary> {
	const now = new Date();
	const todayStart = startOfLocalDay(now);
	const tomorrowStart = addDays(todayStart, 1);
	const historyStart = addDays(todayStart, -365);
	const weekStart = addDays(todayStart, -6);
	const [todayResult, historyResult, recentResult] = await Promise.all([
		db.query(
			`SELECT COALESCE(sum(xp), 0)::int AS xp, count(*)::int AS event_count
			 FROM productivity_events
			 WHERE occurred_at >= $1 AND occurred_at < $2`,
			[todayStart.toISOString(), tomorrowStart.toISOString()]
		),
		db.query(
			`SELECT occurred_at, xp
			 FROM productivity_events
			 WHERE occurred_at >= $1
			 ORDER BY occurred_at ASC`,
			[historyStart.toISOString()]
		),
		db.query(
			`SELECT *
			 FROM productivity_events
			 ORDER BY occurred_at DESC
			 LIMIT 8`
		)
	]);

	const dayXp = new Map<string, number>();
	for (const row of historyResult.rows) {
		const key = localDayKey(row.occurred_at);
		dayXp.set(key, (dayXp.get(key) || 0) + Number(row.xp || 0));
	}
	const streak = buildStreak(dayXp, dailyGoalXp);
	const activeDaysThisWeek = [...dayXp.entries()]
		.filter(([key, xp]) => key >= localDayKey(weekStart) && xp >= dailyGoalXp)
		.length;

	return {
		todayXp: Number(todayResult.rows[0]?.xp || 0),
		todayEventCount: Number(todayResult.rows[0]?.event_count || 0),
		dailyGoalXp,
		currentStreak: streak.currentStreak,
		longestStreak: streak.longestStreak,
		activeDaysThisWeek,
		recentEvents: recentResult.rows.map(mapProductivityEvent)
	};
}
// TODO: Make limit configurable
async function fetchAdvisorMemoryRules(db: Queryable = pool) {
	const result = await db.query(
		`SELECT *
		 FROM advisor_memory_rules
		 ORDER BY last_feedback_at DESC, support_count DESC
		 LIMIT 80`
	);
	return result.rows.map(mapAdvisorMemoryRule);
}

async function saveAdvisorFeedback(db: Queryable, feedback: DbRow) {
	const result = await db.query(
		`INSERT INTO advisor_feedback
		 (action, command_id, command_type, task_id, task_title, title_fingerprint, feedback, command_preview, raw_command)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
		 RETURNING *`,
		[
			feedback.action,
			feedback.commandId,
			feedback.commandType,
			feedback.taskId || null,
			feedback.taskTitle || null,
			feedback.titleFingerprint || '',
			JSON.stringify(feedback.feedback || {}),
			JSON.stringify(feedback.commandPreview || {}),
			feedback.rawCommand ? JSON.stringify(feedback.rawCommand) : null
		]
	);
	return result.rows[0];
}

async function upsertAdvisorMemoryRule(db: Queryable, memoryRule: DbRow) {
	const existing = await db.query(
		`SELECT *
		 FROM advisor_memory_rules
		 WHERE rule_type = $1
		   AND title_fingerprint = $2
		   AND action = $3
		 FOR UPDATE`,
		[
			memoryRule.ruleType,
			memoryRule.titleFingerprint || '',
			memoryRule.action || ''
		]
	);

	if (existing.rows[0]) {
		const mergedRule = mergeAdvisorMemoryRulePayload(existing.rows[0].rule || {}, memoryRule.rule || {});
		const updated = await db.query(
			`UPDATE advisor_memory_rules
			 SET rule = $2::jsonb,
			     support_count = support_count + 1,
			     last_feedback_at = now(),
			     updated_at = now()
			 WHERE id = $1
			 RETURNING *`,
			[
				existing.rows[0].id,
				JSON.stringify(mergedRule)
			]
		);
		return mapAdvisorMemoryRule(updated.rows[0]);
	}

	const result = await db.query(
		`INSERT INTO advisor_memory_rules (rule_type, title_fingerprint, action, rule, support_count, last_feedback_at)
		 VALUES ($1, $2, $3, $4::jsonb, 1, now())
		 RETURNING *`,
		[
			memoryRule.ruleType,
			memoryRule.titleFingerprint || '',
			memoryRule.action || '',
			JSON.stringify(memoryRule.rule || {})
		]
	);
	return mapAdvisorMemoryRule(result.rows[0]);
}

async function deleteAdvisorMemoryRule(db: Queryable = pool, id: string) {
	const result = await db.query('DELETE FROM advisor_memory_rules WHERE id = $1', [id]);
	return result.rowCount > 0;
}

async function fetchSchedulerRules(db: Queryable = pool) {
	const ruleRows = (await db.query('SELECT * FROM scheduler_rules ORDER BY created_at DESC')).rows;
	if (!ruleRows.length) return [];
	const ruleIds = ruleRows.map((row) => String(row.id));
	const constraintRows = (await db.query(
		`SELECT *
		 FROM scheduler_constraints
		 WHERE rule_id = ANY($1::uuid[])
		 ORDER BY created_at ASC`,
		[ruleIds]
	)).rows;
	const constraintsByRule = new Map();
	for (const row of constraintRows) {
		const ruleId = String(row.rule_id);
		constraintsByRule.set(ruleId, [...(constraintsByRule.get(ruleId) || []), mapSchedulerConstraint(row)]);
	}
	return ruleRows.map((row) => mapSchedulerRule(row, constraintsByRule.get(String(row.id)) || []));
}

async function fetchActiveSchedulerRules(db: Queryable = pool) {
	const rules = await fetchSchedulerRules(db);
	return rules
		.map((rule) => ({
			...rule,
			constraints: rule.constraints.filter((constraint) => constraint.enabled)
		}))
		.filter((rule) => rule.enabled && rule.status === 'active' && rule.constraints.length);
}

async function fetchSchedulerConstraintTypes(db: Queryable = pool, { enabledOnly = false }: { enabledOnly?: boolean } = {}) {
	const result = await db.query(
		`SELECT *
		 FROM scheduler_constraint_types
		 WHERE ($1::boolean = false OR enabled = true)
		 ORDER BY category, type`,
		[Boolean(enabledOnly)]
	);
	return result.rows.map(mapSchedulerConstraintType);
}

async function findSchedulerRuleById(db: Queryable = pool, id: string) {
	const rules = await fetchSchedulerRules(db);
	return rules.find((rule) => rule.id === id) || null;
}

async function replaceSchedulerConstraints(db: Queryable, ruleId: string, constraints: SchedulerConstraintInput[] = []) {
	await db.query('DELETE FROM scheduler_constraints WHERE rule_id = $1', [ruleId]);
	for (const constraint of constraints) {
		await db.query(
			`INSERT INTO scheduler_constraints (rule_id, type, scope, payload, hard, enabled)
			 VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)`,
			[
				ruleId,
				constraint.type,
				JSON.stringify(constraint.scope || {}),
				JSON.stringify(constraint.payload || {}),
				constraint.hard !== false,
				constraint.enabled !== false
			]
		);
	}
}

async function createSchedulerRule(db: Queryable, input: SchedulerRuleInput) {
	const result = await db.query(
		`INSERT INTO scheduler_rules (text, interpretation, status, enabled, confidence, model, raw_response)
		 VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
		 RETURNING *`,
		[
			input.text,
			input.interpretation || '',
			input.status || 'draft',
			input.enabled === true,
			input.confidence ?? null,
			input.model || null,
			input.rawResponse ? JSON.stringify(input.rawResponse) : null
		]
	);
	const ruleId = String(result.rows[0].id);
	await replaceSchedulerConstraints(db, ruleId, input.constraints || []);
	return findSchedulerRuleById(db, ruleId);
}

async function updateSchedulerRule(db: Queryable, id: string, patch: Partial<SchedulerRuleInput>) {
	const result = await db.query(
		`UPDATE scheduler_rules
		 SET text = COALESCE($2, text),
		     interpretation = COALESCE($3, interpretation),
		     status = COALESCE($4, status),
		     enabled = COALESCE($5, enabled),
		     confidence = COALESCE($6, confidence),
		     model = COALESCE($7, model),
		     raw_response = COALESCE($8::jsonb, raw_response),
		     updated_at = now()
		 WHERE id = $1
		 RETURNING *`,
		[
			id,
			patch.text ?? null,
			patch.interpretation ?? null,
			patch.status ?? null,
			typeof patch.enabled === 'boolean' ? patch.enabled : null,
			patch.confidence ?? null,
			patch.model ?? null,
			patch.rawResponse ? JSON.stringify(patch.rawResponse) : null
		]
	);
	if (!result.rows[0]) return null;
	if (Array.isArray(patch.constraints)) await replaceSchedulerConstraints(db, id, patch.constraints);
	return findSchedulerRuleById(db, id);
}

async function deleteSchedulerRule(db: Queryable = pool, id: string) {
	const result = await db.query('DELETE FROM scheduler_rules WHERE id = $1', [id]);
	return result.rowCount > 0;
}

async function fetchCommittedSchedulerReservedBlocks(db: Queryable = pool) {
	const result = await db.query(
		`SELECT scheduler_reserved_blocks.*
		 FROM scheduler_reserved_blocks
		 JOIN scheduler_schedule_batches ON scheduler_schedule_batches.id = scheduler_reserved_blocks.batch_id
		 WHERE scheduler_schedule_batches.status = 'committed'
		 ORDER BY scheduler_reserved_blocks.start_at`
	);
	return result.rows.map(mapSchedulerReservedBlock);
}

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

async function createSchedulerScheduleBatch(db: Queryable, { source = 'advisor', reservedBlocks = [] }: { source?: string; reservedBlocks?: SchedulerReservedBlockInput[] }) {
	const batch = await db.query(
		`INSERT INTO scheduler_schedule_batches (status, source, committed_at)
		 VALUES ('committed', $1, now())
		 RETURNING *`,
		[source]
	);
	const batchId = String(batch.rows[0].id);
	for (const block of reservedBlocks) {
		await db.query(
			`INSERT INTO scheduler_reserved_blocks (batch_id, type, start_at, end_at, reason, source_rule_id, source_constraint_id)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			[
				batchId,
				block.type || 'break',
				block.start,
				block.end,
				block.reason || '',
				block.sourceRuleId || null,
				block.sourceConstraintId || null
			]
		);
	}
	return {
		id: batchId,
		status: batch.rows[0].status,
		source: batch.rows[0].source,
		committedAt: iso(batch.rows[0].committed_at),
		reservedBlocks: reservedBlocks.length
			? await fetchCommittedSchedulerReservedBlocks(db).then((blocks) => blocks.filter((block) => block.batchId === batchId))
			: []
	};
}

async function createGoogleOAuthState(db: Queryable, state: string, expiresAt: string) {
	await db.query('DELETE FROM google_oauth_states WHERE expires_at < now()');
	await db.query(
		'INSERT INTO google_oauth_states (state, expires_at) VALUES ($1, $2)',
		[state, expiresAt]
	);
}

async function consumeGoogleOAuthState(db: Queryable, state: string) {
	const result = await db.query(
		`DELETE FROM google_oauth_states
     WHERE state = $1 AND expires_at > now()
     RETURNING state`,
		[state]
	);
	return result.rowCount > 0;
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
	fetchSharedNotes,
	createSharedNote,
	updateSharedNote,
	archiveSharedNote,
	attachSharedNoteToTask,
	detachSharedNoteFromTask,
	deleteUnusedTag,
	deleteUnusedTags,
	fetchQuickQueueItems,
	createQuickQueueItem,
	updateQuickQueueItem,
	deleteQuickQueueItem,
	clearDoneQuickQueueItems,
	moveQuickQueueItem,
	reorderQuickQueueItems,
	fetchGoogleConnection,
	saveGoogleConnection,
	deleteGoogleConnection,
	fetchTaskCalendarEvents,
	insertTaskCalendarEvent,
	deleteTaskCalendarEventsByCalendarId,
	createProductivityEvent,
	fetchProductivitySummary,
	fetchAdvisorMemoryRules,
	saveAdvisorFeedback,
	upsertAdvisorMemoryRule,
	deleteAdvisorMemoryRule,
	fetchSchedulerRules,
	fetchActiveSchedulerRules,
	fetchSchedulerConstraintTypes,
	findSchedulerRuleById,
	createSchedulerRule,
	updateSchedulerRule,
	deleteSchedulerRule,
	fetchCommittedSchedulerReservedBlocks,
	createSchedulerScheduleBatch,
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
	updatePeriodicTaskOccurrence,
	createGoogleOAuthState,
	consumeGoogleOAuthState,
	checkConnection
};

export {};

