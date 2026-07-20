const { mapProductivityEvent } = require('../mappers');
const { pool } = require('../pool');
const { clampInteger, fetchAppSettings } = require('../settings/appSettings');
const {
	addDays,
	buildStreak,
	localDayKey,
	startOfLocalDay
} = require('../utils');

import type { ProductivityEvent, ProductivitySummary } from '../../../shared/types';
import type { ProductivityEventInput, Queryable } from '../types';

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

async function fetchProductivitySummary(db: Queryable = pool, options: { dailyGoalXp?: number } = {}): Promise<ProductivitySummary> {
	const appSettings = await fetchAppSettings(db);
	const dailyGoalXp = clampInteger(options.dailyGoalXp, appSettings.productivity.dailyGoalXp, 10, 500);
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

module.exports = {
	createProductivityEvent,
	fetchProductivitySummary
};

export {};
