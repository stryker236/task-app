export interface GoogleStatus {
  connected: boolean;
  accountEmail: string | null;
  scopes: string[];
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  status: string;
  start: string | null;
  end: string | null;
  htmlLink: string | null;
}
