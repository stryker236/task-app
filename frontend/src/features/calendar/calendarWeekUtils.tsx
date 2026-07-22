import type { EventContentArg, EventInput } from '@fullcalendar/core';
import type { GoogleCalendarEvent } from '../../../../shared/types';
import type { AdvisorCalendarPreviewEvent, AdvisorReservedPreviewEvent } from '../../utils/advisorCalendarPreviews';

export const CALENDAR_SNAP_DURATION = { minutes: 15 };
export const CALENDAR_LABEL_INTERVAL = { hours: 1 };
export const TIME_GRID_VIEW_OPTIONS = {
  timeGridDay: { slotDuration: CALENDAR_SNAP_DURATION, snapDuration: CALENDAR_SNAP_DURATION },
  timeGridWeek: { slotDuration: CALENDAR_SNAP_DURATION, snapDuration: CALENDAR_SNAP_DURATION }
};

export type CalendarDisplayEvent = GoogleCalendarEvent | AdvisorCalendarPreviewEvent | AdvisorReservedPreviewEvent;
export type CalendarViewMode = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth';

const CALENDAR_SNAP_MINUTES = 15;

export function dateFromInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

export function inputValueFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(value: string, days: number) {
  const date = dateFromInputValue(value);
  date.setDate(date.getDate() + days);
  return inputValueFromDate(date);
}

export function formatDateRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${formatter.format(dateFromInputValue(start))} - ${formatter.format(dateFromInputValue(end))}`;
}

function formatEventTime(value: string | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Dia todo';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

export function eventTitle(event: CalendarDisplayEvent) {
  return event.summary || '(Sem titulo)';
}

export function eventTimeRange(event: CalendarDisplayEvent) {
  const start = formatEventTime(event.start);
  const end = event.end ? formatEventTime(event.end) : '';
  return end ? `${start} - ${end}` : start;
}

export function isAdvisorPreviewEvent(event: CalendarDisplayEvent): event is AdvisorCalendarPreviewEvent {
  return 'advisorPreview' in event && event.advisorPreview;
}

export function isAdvisorReservedPreviewEvent(event: CalendarDisplayEvent): event is AdvisorReservedPreviewEvent {
  return 'advisorReservedPreview' in event && event.advisorReservedPreview;
}

function isBreakEvent(event: CalendarDisplayEvent) {
  return isAdvisorReservedPreviewEvent(event) || String(event.summary || '').trim().toLocaleLowerCase() === 'pausa';
}

export function advisorPreviewTaskId(event: AdvisorCalendarPreviewEvent) {
  return String((event as unknown as { taskId?: string }).taskId || event.advisorProposalId.replace(/^schedule_/, ''));
}

function isAllDayEvent(event: CalendarDisplayEvent) {
  return Boolean(event.start && /^\d{4}-\d{2}-\d{2}$/.test(event.start));
}

export function eventDurationMinutes(event: CalendarDisplayEvent) {
  if (!event.start || !event.end) return 30;
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 30;
  return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function roundDateToSnap(date: Date) {
  const snapMs = CALENDAR_SNAP_MINUTES * 60000;
  return new Date(Math.round(date.getTime() / snapMs) * snapMs);
}

export function ensureMinimumSnapEnd(start: Date, end: Date) {
  if (end > start) return end;
  return new Date(start.getTime() + CALENDAR_SNAP_MINUTES * 60000);
}

export function toggleCalendarId(calendarIds: string[], calendarId: string) {
  return calendarIds.includes(calendarId)
    ? calendarIds.filter((id) => id !== calendarId)
    : [...calendarIds, calendarId];
}

function eventClassNames(event: CalendarDisplayEvent) {
  return [
    isAdvisorPreviewEvent(event) ? 'is-advisor-preview' : '',
    isBreakEvent(event) ? 'is-advisor-break-preview' : ''
  ].filter(Boolean);
}

export function toFullCalendarEvent(event: CalendarDisplayEvent): EventInput {
  const isPreview = isAdvisorPreviewEvent(event);
  const isBreak = isBreakEvent(event);
  const color = isBreak ? '#0f8f7e' : event.calendarColor || (isPreview ? '#6f48eb' : '#315efb');
  return {
    id: event.id,
    title: eventTitle(event),
    start: event.start || undefined,
    end: event.end || undefined,
    allDay: isAllDayEvent(event),
    editable: isPreview,
    startEditable: isPreview,
    durationEditable: isPreview,
    backgroundColor: color,
    borderColor: color,
    classNames: eventClassNames(event),
    extendedProps: {
      calendarEvent: event
    }
  };
}

export function renderEventContent(arg: EventContentArg) {
  const event = arg.event.extendedProps.calendarEvent as CalendarDisplayEvent | undefined;
  if (!event) return null;

  return (
    <div className="calendar-fc-event-content">
      <strong>{eventTitle(event)}</strong>
      <span>{eventTimeRange(event)}</span>
      {isAdvisorPreviewEvent(event) && <em>Preview</em>}
      {isAdvisorReservedPreviewEvent(event) && <em>Break</em>}
    </div>
  );
}
