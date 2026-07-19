export interface GoogleStatus {
  connected: boolean;
  accountEmail: string | null;
  scopes: string[];
  expiresAt?: string | null;
  requiresReconnect?: boolean;
}

export interface GoogleOAuthUrlRequest {
  returnTo?: string;
}

export interface GoogleOAuthUrlResponse {
  url: string;
  expiresAt: string;
}

export interface GoogleCalendarEvent {
  id: string;
  rawId?: string;
  googleEventId?: string;
  calendarId: string;
  calendarSummary: string;
  calendarColor: string | null;
  summary: string;
  description: string;
  location: string;
  status: string;
  start: string | null;
  end: string | null;
  htmlLink: string | null;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  description: string;
  backgroundColor: string | null;
  foregroundColor: string | null;
  primary: boolean;
  selected: boolean;
  accessRole: string | null;
}

export interface GoogleCalendarsResponse {
  accountEmail: string | null;
  calendars: GoogleCalendar[];
}

export type TaskCalendarEventReviewStatus = 'completed' | 'missed' | 'skipped';

export interface TaskCalendarEvent {
  id: string;
  taskId: string;
  googleEventId: string;
  calendarId: string;
  summary: string;
  start: string;
  end: string;
  htmlLink: string | null;
  reviewStatus: TaskCalendarEventReviewStatus | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  reviewFeedback: Record<string, unknown>;
  xpDelta: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewTaskCalendarEventInput {
  status: TaskCalendarEventReviewStatus;
  note?: string;
  feedback?: Record<string, unknown>;
}

export interface CreateGoogleCalendarEventInput {
  taskId: string;
  summary: string;
  calendarId: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  timeZone?: string;
}

export interface CreateGoogleCalendarEventResponse {
  event: TaskCalendarEvent;
}

export interface DeleteDefaultGoogleCalendarEventsResponse {
  calendarId: string;
  calendarSummary: string;
  deletedCount: number;
  unlinkedCount: number;
}

export interface GoogleCalendarEventsResponse {
  date?: string;
  start?: string;
  end?: string;
  accountEmail: string | null;
  calendars?: GoogleCalendar[];
  events: GoogleCalendarEvent[];
}

export interface SendGoogleDailyTaskEmailResponse {
  id: string;
  to: string;
  date?: string;
  calendarId?: string;
  calendarSummary?: string;
  eventCount?: number;
  totalMinutes?: number;
  todayCount: number;
  overdueCount: number;
}
