export type PeriodicTaskInput = {
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

export type PeriodicTaskConstraintInput = {
	type: string;
	scope?: Record<string, unknown>;
	payload?: Record<string, unknown>;
	hard?: boolean;
	active?: boolean;
	expiresAt?: string | null;
};

export type PeriodicTaskOccurrenceInput = {
	periodicTaskId: string;
	scheduledStart: string;
	scheduledEnd: string;
	calendarId?: string;
	googleEventId?: string | null;
	htmlLink?: string | null;
	status?: string;
};

