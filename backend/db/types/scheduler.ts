export type SchedulerConstraintInput = {
	type: string;
	scope?: Record<string, unknown>;
	payload?: Record<string, unknown>;
	hard?: boolean;
	enabled?: boolean;
};

export type SchedulerRuleInput = {
	text: string;
	interpretation?: string;
	status?: string;
	enabled?: boolean;
	confidence?: number | null;
	model?: string | null;
	rawResponse?: unknown;
	constraints?: SchedulerConstraintInput[];
};

export type SchedulerReservedBlockInput = {
	type?: string;
	start: string;
	end: string;
	reason?: string;
	sourceRuleId?: string | null;
	sourceConstraintId?: string | null;
};

