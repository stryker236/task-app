import type {
  CreateGoogleCalendarEventInput,
  CreateGoogleCalendarEventResponse,
  DeleteDefaultGoogleCalendarEventsResponse,
  GoogleCalendarEventsResponse,
  GoogleCalendarsResponse,
  GoogleOAuthUrlRequest,
  GoogleOAuthUrlResponse,
  GoogleStatus,
  SendGoogleDailyTaskEmailResponse
} from '../../../../shared/types';
import { requestJson } from '../../shared/api/requestJson';

export const getGoogleStatus = () => requestJson<GoogleStatus>('/google/status');
export const getGoogleOAuthUrl = (returnTo = '') => requestJson<GoogleOAuthUrlResponse>('/google/oauth/url', {
  method: 'POST',
  body: JSON.stringify({ returnTo } satisfies GoogleOAuthUrlRequest)
});
export const disconnectGoogle = () => requestJson<void>('/google/connection', { method: 'DELETE' });
export const sendGoogleDailyTaskEmail = (calendarId = '', date = '') => requestJson<SendGoogleDailyTaskEmailResponse>(
  '/google/gmail/daily-tasks',
  { method: 'POST', body: JSON.stringify({ calendarId, date }) }
);
export const getGoogleCalendars = () => requestJson<GoogleCalendarsResponse>('/google/calendars');

export const createGoogleCalendarEvent = (event: CreateGoogleCalendarEventInput) => requestJson<CreateGoogleCalendarEventResponse>('/google/calendar/events', {
  method: 'POST',
  body: JSON.stringify(event)
});

export const deleteDefaultGoogleCalendarEvents = (calendarId = '') => requestJson<DeleteDefaultGoogleCalendarEventsResponse>('/google/calendar/events/default', {
  method: 'DELETE',
  body: JSON.stringify({ calendarId, confirmation: 'DELETE_DEFAULT_CALENDAR_EVENTS' })
});

function calendarIdsQuery(calendarIds: string[] = [], forceRefresh = false) {
  const params = new URLSearchParams();
  calendarIds.forEach((calendarId) => params.append('calendarId', calendarId));
  if (forceRefresh) params.set('refresh', '1');
  return params.toString();
}

export const getGoogleCalendarEvents = (date: string, calendarIds: string[] = [], options: { forceRefresh?: boolean } = {}) => {
  const query = calendarIdsQuery(calendarIds, Boolean(options.forceRefresh));
  return requestJson<GoogleCalendarEventsResponse>(
    `/google/calendar/events?date=${encodeURIComponent(date)}${query ? `&${query}` : ''}`
  );
};

export const getGoogleCalendarEventsRange = (start: string, end: string, calendarIds: string[] = [], options: { forceRefresh?: boolean } = {}) => {
  const query = calendarIdsQuery(calendarIds, Boolean(options.forceRefresh));
  return requestJson<GoogleCalendarEventsResponse>(
    `/google/calendar/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${query ? `&${query}` : ''}`
  );
};
