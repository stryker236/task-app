const { googleConnectionExpiresAt } = require('../../google/googleConnectionTtl');
const { pool } = require('../pool');
const {
	mapGoogleConnection,
	mapTaskCalendarEvent,
	mapTaskWorkSession
} = require('../mappers');

import type { TaskCalendarEvent, TaskWorkSession } from '../../../shared/types';
import type {
	GoogleConnection,
	GoogleConnectionInput,
	Queryable,
	TaskCalendarEventInput,
	TaskCalendarEventReviewInput,
	TaskWorkSessionInput,
	TaskWorkSessionPatch
} from '../types';

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
		[accountEmail, scopes, JSON.stringify(encryptedTokens), expiresAt || googleConnectionExpiresAt()]
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

function eventDurationMinutes(start: string, end: string) {
	const startMs = Date.parse(start);
	const endMs = Date.parse(end);
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
	return Math.max(1, Math.round((endMs - startMs) / 60000));
}

async function fetchTaskWorkSessions(db: Queryable, taskId: string): Promise<TaskWorkSession[]> {
	const result = await db.query('SELECT * FROM task_work_sessions WHERE task_id = $1 ORDER BY planned_start_at', [taskId]);
	return result.rows.map(mapTaskWorkSession);
}

async function insertTaskWorkSession(db: Queryable, session: TaskWorkSessionInput): Promise<TaskWorkSession> {
	const result = await db.query(
		`INSERT INTO task_work_sessions (
		   task_id, task_calendar_event_id, status, planned_start_at, planned_end_at,
		   planned_minutes, completed_minutes, note, feedback
		 )
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
		 ON CONFLICT (task_calendar_event_id)
		 DO UPDATE SET
		   task_id = EXCLUDED.task_id,
		   status = EXCLUDED.status,
		   planned_start_at = EXCLUDED.planned_start_at,
		   planned_end_at = EXCLUDED.planned_end_at,
		   planned_minutes = EXCLUDED.planned_minutes,
		   updated_at = now()
		 RETURNING *`,
		[
			session.taskId,
			session.taskCalendarEventId || null,
			session.status || 'planned',
			session.plannedStartAt,
			session.plannedEndAt,
			session.plannedMinutes,
			session.completedMinutes || 0,
			session.note || null,
			JSON.stringify(session.feedback || {})
		]
	);
	return mapTaskWorkSession(result.rows[0]);
}

async function updateTaskWorkSessionForCalendarEvent(db: Queryable, calendarEventId: string, patch: TaskWorkSessionPatch): Promise<TaskWorkSession | null> {
	const current = await db.query('SELECT * FROM task_work_sessions WHERE task_calendar_event_id = $1 ORDER BY created_at DESC LIMIT 1', [calendarEventId]);
	if (!current.rows[0]) return null;
	const existing = mapTaskWorkSession(current.rows[0]);
	const result = await db.query(
		`UPDATE task_work_sessions
		 SET status = $2,
		     completed_minutes = $3,
		     note = $4,
		     feedback = $5::jsonb,
		     updated_at = now()
		 WHERE id = $1
		 RETURNING *`,
		[
			existing.id,
			patch.status || existing.status,
			patch.completedMinutes == null ? existing.completedMinutes : patch.completedMinutes,
			patch.note == null ? existing.note : patch.note,
			JSON.stringify(patch.feedback || existing.feedback || {})
		]
	);
	return result.rows[0] ? mapTaskWorkSession(result.rows[0]) : null;
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
	const linkedEvent = mapTaskCalendarEvent(result.rows[0]);
	const plannedMinutes = eventDurationMinutes(linkedEvent.start, linkedEvent.end);
	if (plannedMinutes > 0) {
		await insertTaskWorkSession(db, {
			taskId: linkedEvent.taskId,
			taskCalendarEventId: linkedEvent.id,
			status: 'planned',
			plannedStartAt: linkedEvent.start,
			plannedEndAt: linkedEvent.end,
			plannedMinutes,
			completedMinutes: 0
		});
	}
	return linkedEvent;
}

async function updateTaskCalendarEventReview(db: Queryable, eventId: string, review: TaskCalendarEventReviewInput): Promise<TaskCalendarEvent | null> {
	const result = await db.query(
		`UPDATE task_calendar_events
		 SET review_status = $2,
		     reviewed_at = $3,
		     review_note = $4,
		     review_feedback = $5::jsonb,
		     xp_delta = $6,
		     updated_at = now()
		 WHERE id = $1
		 RETURNING *`,
		[
			eventId,
			review.reviewStatus,
			review.reviewedAt,
			review.reviewNote || null,
			JSON.stringify(review.reviewFeedback || {}),
			review.xpDelta == null ? null : review.xpDelta
		]
	);
	return result.rows[0] ? mapTaskCalendarEvent(result.rows[0]) : null;
}

async function deleteTaskCalendarEventsByCalendarId(db: Queryable, calendarId: string) {
	const result = await db.query('DELETE FROM task_calendar_events WHERE calendar_id = $1', [calendarId]);
	return result.rowCount || 0;
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
	fetchGoogleConnection,
	saveGoogleConnection,
	deleteGoogleConnection,
	fetchTaskCalendarEvents,
	insertTaskCalendarEvent,
	updateTaskCalendarEventReview,
	fetchTaskWorkSessions,
	insertTaskWorkSession,
	updateTaskWorkSessionForCalendarEvent,
	deleteTaskCalendarEventsByCalendarId,
	createGoogleOAuthState,
	consumeGoogleOAuthState
};

export {};
