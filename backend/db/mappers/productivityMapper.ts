const { iso } = require('../../utils/date');

import type { ProductivityEvent } from '../../../shared/types';
import type { DbRow } from '../types';

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

module.exports = {
	mapProductivityEvent
};

export {};
