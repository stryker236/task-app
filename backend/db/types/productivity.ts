export type ProductivityEventInput = {
	eventType: string;
	xp: number;
	taskId?: string | null;
	quickQueueItemId?: string | null;
	checklistItemId?: string | null;
	calendarEventId?: string | null;
	metadata?: Record<string, unknown>;
	occurredAt?: string;
};

