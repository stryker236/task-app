import type { TaskCalendarEventReviewStatus, TaskWorkSessionStatus } from '../../../shared/types';

export type GoogleConnection = {
	id: string;
	accountEmail: string | null;
	scopes: string[];
	encryptedTokens: unknown;
	expiresAt: string | null;
	createdAt: string | null;
	updatedAt: string | null;
};

export type GoogleConnectionInput = {
	accountEmail: string | null;
	scopes: string[];
	encryptedTokens: unknown;
	expiresAt?: string | null;
};

export type TaskCalendarEventInput = {
	taskId: string;
	googleEventId: string;
	calendarId: string;
	summary: string;
	start: string;
	end: string;
	htmlLink?: string | null;
};

export type TaskCalendarEventReviewInput = {
	reviewStatus: TaskCalendarEventReviewStatus;
	reviewedAt: string;
	reviewNote?: string | null;
	reviewFeedback?: Record<string, unknown>;
	xpDelta?: number | null;
	completedMinutes?: number | null;
};

export type TaskWorkSessionInput = {
	taskId: string;
	taskCalendarEventId?: string | null;
	status?: TaskWorkSessionStatus;
	plannedStartAt: string;
	plannedEndAt: string;
	plannedMinutes: number;
	completedMinutes?: number;
	note?: string | null;
	feedback?: Record<string, unknown>;
};

export type TaskWorkSessionPatch = {
	status?: TaskWorkSessionStatus;
	completedMinutes?: number;
	note?: string | null;
	feedback?: Record<string, unknown>;
};

