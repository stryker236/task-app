import { useState, type CSSProperties, type DragEvent } from 'react';
import type { GoogleCalendar, GoogleCalendarEvent, GoogleStatus } from '../../../shared/types';
import type { AdvisorCalendarPreviewEvent, TaskDueDateCalendarEvent } from '../utils/advisorCalendarPreviews';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const CALENDAR_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar';
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
const HOUR_HEIGHT = 56;
const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index);

type CalendarEventLayout = {
  event: CalendarDisplayEvent;
  lane: number;
  laneCount: number;
};

type CalendarDisplayEvent = GoogleCalendarEvent | AdvisorCalendarPreviewEvent | TaskDueDateCalendarEvent;

type CalendarWeekViewProps = {
  status: GoogleStatus;
  loading: boolean;
  weekStart: string;
  weekEnd: string;
  events: GoogleCalendarEvent[];
  advisorPreviewEvents: AdvisorCalendarPreviewEvent[];
  taskDueDateEvents: TaskDueDateCalendarEvent[];
  calendars: GoogleCalendar[];
  selectedCalendarIds: string[];
  advisorDefaultCalendarId: string;
  accountEmail: string | null;
  busyCount: number;
  onWeekChange: (date: string) => void;
  onCalendarFilterChange: (calendarIds: string[]) => void;
  onAdvisorDefaultCalendarChange: (calendarId: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onLoadEvents: (date: string, calendarIds?: string[]) => void;
  onLoadRangeEvents: (start: string, end: string, calendarIds?: string[]) => void;
  onSendDailyTaskEmail: (date?: string) => Promise<{ to: string; date?: string; calendarSummary?: string; eventCount?: number; totalMinutes?: number; todayCount: number; overdueCount: number } | null>;
  onDeleteDefaultCalendarEvents: () => Promise<{ calendarSummary: string; deletedCount: number; unlinkedCount: number } | null>;
  advisorLoading: boolean;
  advisorConstraintCount: number;
  onRequestAdvisorCalendarEvents: () => void;
  onMoveAdvisorPreviewEvent: (taskId: string, start: string, end: string) => void;
  onClearAdvisorScheduleConstraints: () => void;
};

function dateFromInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function inputValueFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number) {
  const date = dateFromInputValue(value);
  date.setDate(date.getDate() + days);
  return inputValueFromDate(date);
}

function addMonths(value: string, months: number) {
  const date = dateFromInputValue(value);
  date.setMonth(date.getMonth() + months);
  return inputValueFromDate(date);
}

function startOfWeek(value: string) {
  const date = dateFromInputValue(value);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return inputValueFromDate(date);
}

function startOfMonth(value: string) {
  const date = dateFromInputValue(value);
  return inputValueFromDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonth(value: string) {
  const date = dateFromInputValue(value);
  return inputValueFromDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function monthGridRange(value: string) {
  const start = startOfWeek(startOfMonth(value));
  const end = addDays(startOfWeek(endOfMonth(value)), 6);
  return { start, end };
}

function daysBetween(start: string, end: string) {
  const days = [];
  let current = start;
  while (current <= end) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}

function dateKeyFromEventValue(value: string | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return inputValueFromDate(date);
}

function formatDayLabel(value: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'short'
  }).format(dateFromInputValue(value));
}

function formatDayNumber(value: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit'
  }).format(dateFromInputValue(value));
}

function formatWeekRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${formatter.format(dateFromInputValue(start))} - ${formatter.format(dateFromInputValue(end))}`;
}

function formatMonthLabel(value: string) {
  return new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(dateFromInputValue(value));
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

function isAdvisorPreviewEvent(event: CalendarDisplayEvent): event is AdvisorCalendarPreviewEvent {
  return 'advisorPreview' in event && event.advisorPreview;
}

function isTaskDueDateEvent(event: CalendarDisplayEvent): event is TaskDueDateCalendarEvent {
  return 'taskDueDate' in event && event.taskDueDate;
}

function advisorPreviewTaskId(event: AdvisorCalendarPreviewEvent) {
  return String((event as unknown as { taskId?: string }).taskId || event.advisorProposalId.replace(/^schedule_/, ''));
}

function eventTitle(event: CalendarDisplayEvent) {
  return event.summary || '(Sem titulo)';
}

function eventTimeRange(event: CalendarDisplayEvent) {
  const start = formatEventTime(event.start);
  const end = event.end ? formatEventTime(event.end) : '';
  return end ? `${start} - ${end}` : start;
}

function eventTooltip(event: CalendarDisplayEvent) {
  return [
    eventTitle(event),
    eventTimeRange(event),
    isAdvisorPreviewEvent(event) ? 'Proposta do advisor' : isTaskDueDateEvent(event) ? 'Due date da task' : event.calendarSummary,
    event.location || ''
  ].filter(Boolean).join('\n');
}

function isAllDayEvent(event: CalendarDisplayEvent) {
  return Boolean(event.start && /^\d{4}-\d{2}-\d{2}$/.test(event.start));
}

function eventStartDate(event: CalendarDisplayEvent) {
  return event.start ? new Date(event.start) : null;
}

function eventEndDate(event: CalendarDisplayEvent) {
  return event.end ? new Date(event.end) : null;
}

function getEventPlacement(event: CalendarDisplayEvent) {
  const start = eventStartDate(event);
  if (!start || Number.isNaN(start.getTime())) return null;
  const end = eventEndDate(event);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end && !Number.isNaN(end.getTime()) ? end.getHours() * 60 + end.getMinutes() : startMinutes + 30;
  const clampedStart = Math.max(DAY_START_HOUR * 60, Math.min(DAY_END_HOUR * 60, startMinutes));
  const clampedEnd = Math.max(clampedStart + 20, Math.min(DAY_END_HOUR * 60, endMinutes));
  return {
    top: ((clampedStart - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT,
    height: Math.max(24, ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT)
  };
}

function eventDurationMinutes(event: CalendarDisplayEvent) {
  const start = eventStartDate(event);
  const end = eventEndDate(event);
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start) {
    return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
  }
  return 30;
}

function isoForDayMinute(day: string, minuteOfDay: number) {
  const date = dateFromInputValue(day);
  date.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
  return date.toISOString();
}

function eventStartMinutes(event: CalendarDisplayEvent) {
  const start = eventStartDate(event);
  if (!start || Number.isNaN(start.getTime())) return 0;
  return start.getHours() * 60 + start.getMinutes();
}

function eventEndMinutes(event: CalendarDisplayEvent) {
  const end = eventEndDate(event);
  if (!end || Number.isNaN(end.getTime())) return eventStartMinutes(event) + 30;
  return Math.max(eventStartMinutes(event) + 20, end.getHours() * 60 + end.getMinutes());
}

function layoutOverlappingEvents(events: CalendarDisplayEvent[]): CalendarEventLayout[] {
  const sorted = [...events].sort((a, b) => eventStartMinutes(a) - eventStartMinutes(b));
  const groups: CalendarDisplayEvent[][] = [];
  let currentGroup: CalendarDisplayEvent[] = [];
  let currentGroupEnd = -1;

  sorted.forEach((event) => {
    const start = eventStartMinutes(event);
    const end = eventEndMinutes(event);
    if (!currentGroup.length || start < currentGroupEnd) {
      currentGroup.push(event);
      currentGroupEnd = Math.max(currentGroupEnd, end);
      return;
    }
    groups.push(currentGroup);
    currentGroup = [event];
    currentGroupEnd = end;
  });
  if (currentGroup.length) groups.push(currentGroup);

  return groups.flatMap((group) => {
    const laneEnds: number[] = [];
    const layouts = group.map((event) => {
      const start = eventStartMinutes(event);
      const lane = laneEnds.findIndex((end) => end <= start);
      const resolvedLane = lane === -1 ? laneEnds.length : lane;
      laneEnds[resolvedLane] = eventEndMinutes(event);
      return { event, lane: resolvedLane, laneCount: 1 };
    });
    const laneCount = Math.max(1, laneEnds.length);
    return layouts.map((layout) => ({ ...layout, laneCount }));
  });
}

function groupTimedEventsByDay(days: string[], events: CalendarDisplayEvent[]) {
  const grouped = new Map(days.map((day) => [day, [] as CalendarDisplayEvent[]]));
  events.forEach((event) => {
    if (isAllDayEvent(event)) return;
    const key = dateKeyFromEventValue(event.start);
    grouped.get(key)?.push(event);
  });
  return new Map([...grouped.entries()].map(([day, dayEvents]) => [day, layoutOverlappingEvents(dayEvents)]));
}

function groupAllDayEventsByDay(days: string[], events: CalendarDisplayEvent[]) {
  const grouped = new Map(days.map((day) => [day, [] as CalendarDisplayEvent[]]));
  events.forEach((event) => {
    if (!isAllDayEvent(event)) return;
    const key = dateKeyFromEventValue(event.start);
    grouped.get(key)?.push(event);
  });
  return grouped;
}

function groupEventsByDay(days: string[], events: CalendarDisplayEvent[]) {
  const grouped = new Map(days.map((day) => [day, [] as CalendarDisplayEvent[]]));
  events.forEach((event) => {
    const key = dateKeyFromEventValue(event.start);
    grouped.get(key)?.push(event);
  });
  grouped.forEach((dayEvents) => {
    dayEvents.sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
  });
  return grouped;
}

function toggleCalendarId(calendarIds: string[], calendarId: string) {
  return calendarIds.includes(calendarId)
    ? calendarIds.filter((id) => id !== calendarId)
    : [...calendarIds, calendarId];
}

export default function CalendarWeekView({
  status,
  loading,
  weekStart,
  weekEnd,
  events,
  advisorPreviewEvents,
  taskDueDateEvents,
  calendars,
  selectedCalendarIds,
  advisorDefaultCalendarId,
  accountEmail,
  busyCount,
  onWeekChange,
  onCalendarFilterChange,
  onAdvisorDefaultCalendarChange,
  onConnect,
  onDisconnect,
  onLoadEvents,
  onLoadRangeEvents,
  onSendDailyTaskEmail,
  onDeleteDefaultCalendarEvents,
  advisorLoading,
  advisorConstraintCount,
  onRequestAdvisorCalendarEvents,
  onMoveAdvisorPreviewEvent,
  onClearAdvisorScheduleConstraints
}: CalendarWeekViewProps) {
  const [calendarMode, setCalendarMode] = useState<'week' | 'month'>('week');
  const [monthAnchor, setMonthAnchor] = useState(weekStart);
  const [emailDate, setEmailDate] = useState(() => inputValueFromDate(new Date()));
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const monthRange = monthGridRange(monthAnchor);
  const monthDays = daysBetween(monthRange.start, monthRange.end);
  const visibleAdvisorPreviewEvents = advisorPreviewEvents.filter((event) => {
    const knownCalendar = calendars.some((calendar) => calendar.id === event.calendarId);
    return !knownCalendar || selectedCalendarIds.includes(event.calendarId);
  });
  const scheduledEvents: CalendarDisplayEvent[] = [...events, ...visibleAdvisorPreviewEvents];
  const displayEvents: CalendarDisplayEvent[] = [...scheduledEvents, ...taskDueDateEvents];
  const timedDueDateEventsByDay = groupEventsByDay(days, taskDueDateEvents.filter((event) => !isAllDayEvent(event)));
  const timedEventsByDay = groupTimedEventsByDay(days, scheduledEvents);
  const allDayEventsByDay = groupAllDayEventsByDay(days, scheduledEvents);
  const monthEventsByDay = groupEventsByDay(monthDays, displayEvents);
  const canSendEmail = status.scopes.includes(GMAIL_SEND_SCOPE);
  const canCreateCalendarEvents = status.connected && status.scopes.includes(CALENDAR_WRITE_SCOPE);
  const today = inputValueFromDate(new Date());
  const currentMonth = dateFromInputValue(monthAnchor).getMonth();
  const [draggedAdvisorEventId, setDraggedAdvisorEventId] = useState('');

  function loadMonth(value = monthAnchor, calendarIds = selectedCalendarIds) {
    const range = monthGridRange(value);
    setMonthAnchor(value);
    onLoadRangeEvents(range.start, range.end, calendarIds);
  }

  function changeCalendarIds(calendarIds: string[]) {
    onCalendarFilterChange(calendarIds);
    if (calendarMode === 'month') loadMonth(monthAnchor, calendarIds);
  }

  function handleAdvisorDrop(day: string, event: DragEvent<HTMLDivElement>) {
    if (!draggedAdvisorEventId) return;
    event.preventDefault();
    const advisorEvent = visibleAdvisorPreviewEvents.find((item) => item.id === draggedAdvisorEventId);
    if (!advisorEvent) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rawMinutes = DAY_START_HOUR * 60 + ((event.clientY - rect.top) / HOUR_HEIGHT) * 60;
    const roundedMinutes = Math.max(DAY_START_HOUR * 60, Math.min(DAY_END_HOUR * 60 - 15, Math.round(rawMinutes / 15) * 15));
    const duration = eventDurationMinutes(advisorEvent);
    const start = isoForDayMinute(day, roundedMinutes);
    const end = isoForDayMinute(day, Math.min(DAY_END_HOUR * 60, roundedMinutes + duration));
    onMoveAdvisorPreviewEvent(advisorPreviewTaskId(advisorEvent), start, end);
    setDraggedAdvisorEventId('');
  }

  return (
    <section className="calendar-week-view" aria-label="Google Calendar semanal">
      <header className="calendar-week-header">
        <div>
          <span>Google Calendar</span>
          <h2>Calendario semanal</h2>
          <p>
            {status.connected
              ? `${formatWeekRange(weekStart, weekEnd)} · ${busyCount} eventos · ${accountEmail || status.accountEmail || 'Google'}`
              : loading
                ? 'A verificar a ligacao Google guardada...'
                : 'Liga o Google Calendar para consultar a tua semana.'}
          </p>
        </div>
        <div className="calendar-week-actions">
          {status.connected ? (
            <>
              {canSendEmail ? (
                <label className="calendar-email-date">
                  <span>Email do dia</span>
                  <input type="date" value={emailDate} onChange={(event) => setEmailDate(event.target.value)} />
                  <button
                    type="button"
                    className="button primary small"
                    onClick={async () => {
                      const result = await onSendDailyTaskEmail(emailDate);
                      if (result) window.alert(`Email enviado para ${result.to}. Data: ${result.date || emailDate}. Calendario: ${result.calendarSummary || 'default'}. Eventos: ${result.eventCount ?? 0}; due dates: ${result.todayCount}; atrasadas: ${result.overdueCount}.`);
                    }}
                    disabled={loading || !emailDate}
                  >
                    {loading ? 'A enviar...' : 'Enviar'}
                  </button>
                </label>
              ) : (
                <button type="button" className="button primary small" onClick={onConnect} disabled={loading}>
                  Ativar envio de email
                </button>
              )}
              <button type="button" className="button secondary small" onClick={onDisconnect} disabled={loading}>
                Desligar Google
              </button>
            </>
          ) : !loading && (
            <button type="button" className="button primary small" onClick={onConnect} disabled={loading}>
              Ligar Google Calendar
            </button>
          )}
        </div>
      </header>

      {status.connected && (
        <>
          <div className="calendar-advisor-bar">
            <div>
              <strong>AIAdvisor</strong>
              <span>{visibleAdvisorPreviewEvents.length || taskDueDateEvents.length ? `${taskDueDateEvents.length} due dates · ${visibleAdvisorPreviewEvents.length} previews` : 'Criar eventos a partir das tasks'}</span>
            </div>
            {calendars.length > 0 && (
              <label>
                <span>Calendario default</span>
                <select value={advisorDefaultCalendarId} onChange={(event) => onAdvisorDefaultCalendarChange(event.target.value)}>
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="button primary small"
              onClick={canCreateCalendarEvents ? onRequestAdvisorCalendarEvents : onConnect}
              disabled={advisorLoading || loading}
            >
              {advisorLoading ? 'A preparar...' : canCreateCalendarEvents ? 'Criar eventos' : 'Ativar criacao'}
            </button>
            <button
              type="button"
              className="button secondary small"
              onClick={async () => {
                const calendar = calendars.find((item) => item.id === advisorDefaultCalendarId);
                const calendarName = calendar?.summary || advisorDefaultCalendarId || 'default';
                if (!window.confirm(`Apagar TODOS os eventos do calendario "${calendarName}"? Esta acao nao pode ser desfeita.`)) return;
                const result = await onDeleteDefaultCalendarEvents();
                if (result) window.alert(`Eventos apagados de "${result.calendarSummary}": ${result.deletedCount}. Ligacoes locais removidas: ${result.unlinkedCount}.`);
              }}
              disabled={!canCreateCalendarEvents || loading}
            >
              Apagar eventos default
            </button>
            {advisorConstraintCount > 0 && (
              <button type="button" className="button ghost small" onClick={onClearAdvisorScheduleConstraints} disabled={advisorLoading || loading}>
                Limpar ajustes ({advisorConstraintCount})
              </button>
            )}
          </div>

          <div className="calendar-week-controls">
            <div className="calendar-mode-toggle" aria-label="Modo de calendario">
              <button type="button" className={calendarMode === 'week' ? 'is-active' : ''} onClick={() => { setCalendarMode('week'); onLoadEvents(weekStart); }}>
                Semana
              </button>
              <button type="button" className={calendarMode === 'month' ? 'is-active' : ''} onClick={() => { setCalendarMode('month'); loadMonth(monthAnchor); }}>
                Mes
              </button>
            </div>
            {calendarMode === 'week' ? (
              <>
                <button type="button" className="button secondary small" onClick={() => onLoadEvents(addDays(weekStart, -7))} disabled={loading}>
                  Semana anterior
                </button>
                <label>
                  Semana
                  <input
                    type="date"
                    value={weekStart}
                    onChange={(event) => {
                      onWeekChange(event.target.value);
                      onLoadEvents(event.target.value);
                    }}
                  />
                </label>
                <button type="button" className="button secondary small" onClick={() => onLoadEvents(addDays(weekStart, 7))} disabled={loading}>
                  Semana seguinte
                </button>
              </>
            ) : (
              <>
                <button type="button" className="button secondary small" onClick={() => loadMonth(addMonths(monthAnchor, -1))} disabled={loading}>
                  Mes anterior
                </button>
                <label>
                  Mes
                  <input
                    type="month"
                    value={monthAnchor.slice(0, 7)}
                    onChange={(event) => loadMonth(`${event.target.value}-01`)}
                  />
                </label>
                <button type="button" className="button secondary small" onClick={() => loadMonth(addMonths(monthAnchor, 1))} disabled={loading}>
                  Mes seguinte
                </button>
                <strong className="calendar-current-range">{formatMonthLabel(monthAnchor)}</strong>
              </>
            )}
            <button type="button" className="button primary small" onClick={() => calendarMode === 'month' ? loadMonth(monthAnchor) : onLoadEvents(weekStart)} disabled={loading}>
              {loading ? 'A carregar...' : 'Atualizar'}
            </button>
          </div>

          <div className="calendar-filter-bar" aria-label="Filtrar calendarios">
            <div>
              <strong>Calendarios</strong>
              <span>{selectedCalendarIds.length} de {calendars.length} ativos</span>
            </div>
            <div className="calendar-filter-options">
              <button
                type="button"
                className="button secondary small"
                onClick={() => changeCalendarIds(calendars.map((calendar) => calendar.id))}
                disabled={loading || selectedCalendarIds.length === calendars.length}
              >
                Todos
              </button>
              <button
                type="button"
                className="button ghost small"
                onClick={() => changeCalendarIds([])}
                disabled={loading || selectedCalendarIds.length === 0}
              >
                Limpar
              </button>
              {calendars.map((calendar) => (
                <label className="calendar-filter-option" key={calendar.id}>
                  <input
                    type="checkbox"
                    checked={selectedCalendarIds.includes(calendar.id)}
                    onChange={() => changeCalendarIds(toggleCalendarId(selectedCalendarIds, calendar.id))}
                  />
                  <span style={{ backgroundColor: calendar.backgroundColor || undefined }} aria-hidden="true" />
                  {calendar.summary}
                </label>
              ))}
            </div>
          </div>

          {calendarMode === 'month' ? (
            <div className="calendar-month-grid">
              {['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((day) => <strong key={day}>{day}</strong>)}
              {monthDays.map((day) => {
                const dayEvents = monthEventsByDay.get(day) || [];
                const isOutsideMonth = dateFromInputValue(day).getMonth() !== currentMonth;
                return (
                  <article className={`calendar-month-day ${day === today ? 'is-today' : ''} ${isOutsideMonth ? 'is-outside-month' : ''}`} key={day}>
                    <header>
                      <time dateTime={day}>{formatDayNumber(day)}</time>
                      <span>{dayEvents.length}</span>
                    </header>
                    <div>
                      {dayEvents.slice(0, 5).map((event) => (
                        <a
                          className={`calendar-month-event ${isAdvisorPreviewEvent(event) ? 'is-advisor-preview' : ''} ${isTaskDueDateEvent(event) ? 'is-task-due-date' : ''}`}
                          href={event.htmlLink || undefined}
                          target={event.htmlLink ? '_blank' : undefined}
                          rel={event.htmlLink ? 'noreferrer' : undefined}
                          key={event.id}
                          title={eventTooltip(event)}
                          draggable={isAdvisorPreviewEvent(event)}
                          onDragStart={() => isAdvisorPreviewEvent(event) && setDraggedAdvisorEventId(event.id)}
                          style={{ '--event-color': event.calendarColor || '#315efb' } as CSSProperties}
                        >
                          <i aria-hidden="true" />
                          <span>{isAllDayEvent(event) ? 'Todo o dia' : formatEventTime(event.start)}</span>
                          <strong>{eventTitle(event)}</strong>
                        </a>
                      ))}
                      {dayEvents.length > 5 && <em>+{dayEvents.length - 5} mais</em>}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
          <div className="calendar-schedule" style={{ '--hour-height': `${HOUR_HEIGHT}px` } as CSSProperties}>
            <div className="calendar-schedule-scroll">
              <div className="calendar-day-header-row">
                <div className="calendar-time-gutter" aria-hidden="true" />
                {days.map((day) => {
                  const dayEventCount = (timedEventsByDay.get(day)?.length || 0) + (allDayEventsByDay.get(day)?.length || 0) + (timedDueDateEventsByDay.get(day)?.length || 0);
                  return (
                    <div className={`calendar-day-header ${day === today ? 'is-today' : ''}`} key={day}>
                      <time dateTime={day}>
                        <span>{formatDayLabel(day)}</span>
                        <strong>{formatDayNumber(day)}</strong>
                      </time>
                      <em>{dayEventCount}</em>
                    </div>
                  );
                })}
              </div>

              <div className="calendar-all-day-row">
                <div className="calendar-all-day-label">Todo o dia</div>
                {days.map((day) => {
                  const dayEvents = allDayEventsByDay.get(day) || [];
                  return (
                    <div className="calendar-all-day-cell" key={day}>
                      {dayEvents.map((event) => (
                        <a
                          className={`calendar-all-day-event ${isAdvisorPreviewEvent(event) ? 'is-advisor-preview' : ''} ${isTaskDueDateEvent(event) ? 'is-task-due-date' : ''}`}
                          href={event.htmlLink || undefined}
                          target={event.htmlLink ? '_blank' : undefined}
                          rel={event.htmlLink ? 'noreferrer' : undefined}
                          key={event.id}
                          title={eventTooltip(event)}
                          style={{ '--event-color': event.calendarColor || '#315efb' } as CSSProperties}
                        >
                          <strong>{eventTitle(event)}</strong>
                        </a>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div className="calendar-time-grid">
                <div className="calendar-hours">
                  {HOURS.map((hour) => (
                    <time key={hour}>{String(hour).padStart(2, '0')}:00</time>
                  ))}
                </div>
                {days.map((day) => {
                  const dayEvents = timedEventsByDay.get(day) || [];
                  return (
                    <div
                      className="calendar-day-column"
                      key={day}
                      onDragOver={(event) => draggedAdvisorEventId && event.preventDefault()}
                      onDrop={(event) => handleAdvisorDrop(day, event)}
                    >
                      <div className="calendar-hour-lines" aria-hidden="true">
                        {HOURS.map((hour) => <span key={hour} />)}
                      </div>
                      {dayEvents.map(({ event, lane, laneCount }) => {
                        const placement = getEventPlacement(event);
                        if (!placement) return null;
                        return (
                          <a
                            className={`calendar-timed-event ${isAdvisorPreviewEvent(event) ? 'is-advisor-preview' : ''} ${isTaskDueDateEvent(event) ? 'is-task-due-date' : ''}`}
                            href={event.htmlLink || undefined}
                            target={event.htmlLink ? '_blank' : undefined}
                            rel={event.htmlLink ? 'noreferrer' : undefined}
                            key={event.id}
                            title={eventTooltip(event)}
                            draggable={isAdvisorPreviewEvent(event)}
                            onDragStart={() => isAdvisorPreviewEvent(event) && setDraggedAdvisorEventId(event.id)}
                            onDragEnd={() => setDraggedAdvisorEventId('')}
                            style={{
                              '--event-color': event.calendarColor || '#315efb',
                              top: `${placement.top}px`,
                              height: `${placement.height}px`,
                              left: `calc(5px + ((100% - 10px) / ${laneCount}) * ${lane})`,
                              width: `calc(((100% - 10px) / ${laneCount}) - 3px)`
                            } as CSSProperties}
                          >
                            <strong>{eventTitle(event)}</strong>
                            {isTaskDueDateEvent(event) && <em>Due date</em>}
                            <span>{eventTimeRange(event)}</span>
                            {!isAdvisorPreviewEvent(event) && <small>{event.calendarSummary}</small>}
                            {!isAdvisorPreviewEvent(event) && event.location && <small>{event.location}</small>}
                          </a>
                        );
                      })}
                      {(timedDueDateEventsByDay.get(day) || []).map((event) => {
                        const placement = getEventPlacement(event);
                        if (!placement) return null;
                        return (
                          <div
                            className="calendar-due-date-marker"
                            key={event.id}
                            style={{
                              '--event-color': event.calendarColor || '#0f8b8d',
                              top: `${placement.top}px`
                            } as CSSProperties}
                          >
                            <i aria-hidden="true" />
                            <span>Due {formatEventTime(event.start)}</span>
                            <strong>{event.summary || '(Sem titulo)'}</strong>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}
        </>
      )}
    </section>
  );
}
