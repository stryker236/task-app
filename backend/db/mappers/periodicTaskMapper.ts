const { iso } = require('../../utils/date');

import type { DbRow } from '../types';

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

module.exports = {
	mapPeriodicTask,
	mapPeriodicTaskConstraint,
	mapPeriodicTaskOccurrence
};

export {};

