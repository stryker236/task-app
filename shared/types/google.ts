export interface GoogleStatus {
  connected: boolean;
  accountEmail: string | null;
  scopes: string[];
  expiresAt?: string | null;
}

export interface GoogleCalendarEvent {
  id: string;
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
