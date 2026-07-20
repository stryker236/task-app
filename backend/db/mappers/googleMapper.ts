const { iso } = require('../../utils/date');

import type { TaskCalendarEvent, TaskWorkSession } from '../../../shared/types';
import type { DbRow, GoogleConnection } from '../types';

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
		reviewStatus: row.review_status || null,
		reviewedAt: iso(row.reviewed_at),
		reviewNote: row.review_note || null,
		reviewFeedback: row.review_feedback || {},
		xpDelta: row.xp_delta == null ? null : Number(row.xp_delta),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

function mapTaskWorkSession(row: DbRow): TaskWorkSession {
	return {
		id: String(row.id),
		taskId: String(row.task_id),
		taskCalendarEventId: row.task_calendar_event_id ? String(row.task_calendar_event_id) : null,
		status: row.status,
		plannedStartAt: iso(row.planned_start_at),
		plannedEndAt: iso(row.planned_end_at),
		plannedMinutes: Number(row.planned_minutes || 0),
		completedMinutes: Number(row.completed_minutes || 0),
		note: row.note || null,
		feedback: row.feedback || {},
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}

module.exports = {
	mapGoogleConnection,
	mapTaskCalendarEvent,
	mapTaskWorkSession
};

export {};
